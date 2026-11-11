-- ============================================================
-- Beyond The Lab — REALOCA A SAFRA "Novembro 2026" → "Janeiro 2027"
--
--   safra 6ee444f2-9381-4a11-a461-3d347b2501f2
--   primeira cobrança  2026-11-12 → 2026-12-20
--   início das aulas   2026-11-16 → 2027-01-04
--   nome               "Novembro 2026" → "Janeiro 2027"
--
-- ⚠️ REGISTRO DE UMA CORREÇÃO PONTUAL DE DADO, não migração de schema —
-- por isso mora em `verificacao/` e não ganha número. As seções 1 e 2
-- JÁ FORAM APLICADAS em 2026-11-11 ~18:20 UTC (via PostgREST, com
-- autorização explícita do dono, por urgência: o trial da aluna
-- confirmada vencia às 00:00 UTC de 12/11). Rodá-las de novo é inócuo:
-- gravam os mesmos valores.
--
-- Motivo de negócio: adesão menor que a esperada; a turma foi empurrada
-- inteira em vez de recriada. Recriar obrigaria a aluna que já salvou o
-- cartão a passar pelo checkout de novo.
--
-- ⚠️ RENOMEAR EM VEZ DE CRIAR SAFRA NOVA, de propósito. Uma safra nova
-- exigiria mover as inscrições de `safra_id` — e o `price` do Stripe
-- dessas assinaturas carrega `metadata.safra_id` da safra ORIGINAL
-- (D-07). Mover deixaria o price apontando para uma safra sem ninguém.
--
-- ------------------------------------------------------------
-- POR QUE QUATRO LUGARES, E NÃO SÓ A SAFRA
-- ------------------------------------------------------------
--
--   1. `safras.data_primeira_cobranca` / `data_inicio_aulas` — o que o
--      site mostra e o que vale para inscrição NOVA.
--
--   2. `inscricoes.data_primeira_cobranca_travada` — a cópia que cada
--      inscrição guardou no checkout (D-06, migração 015). ⚠️ É ESTA que
--      o link da tela Pendentes usa para abrir a sessão nova
--      (`completarContrato` em `src/lib/supabase.ts`). Mudar só a safra
--      faria as duas pendentes receberem um link com o `trial_end`
--      ANTIGO. E é dela que sai o `cancel_at` (D-05) sempre que o
--      sistema precisa redeclarar o fim (`declararFim`, rede do
--      `invoice.paid`).
--
--      ⚠️ ALTERAR O CONTRATO TRAVADO É EXCEÇÃO DELIBERADA À D-06. A D-06
--      trava o combinado contra mudança UNILATERAL da safra. Aqui a data
--      muda por decisão do dono, aplicada às três, e quem já salvou o
--      cartão precisa ser avisada. Valor, duração e modalidade NÃO mudam.
--
--   3. A assinatura no Stripe da aluna confirmada
--      (`sub_1UYb581qWPHIjlkgBqYMeO5I`): `trial_end = 1797724800`
--      (2026-12-20 00:00 UTC), `cancel_at = 1813449600` (2027-06-20
--      00:00 UTC), `proration_behavior = none`. Feito FORA deste arquivo,
--      com a chave live.
--
--   4. ⚠️ O ESPELHO `assinaturas.trial_end`/`cancel_at`. O webhook NÃO
--      trata `customer.subscription.updated` (ver o `switch` em
--      `app/api/stripe/webhook/route.ts`), então o espelho NÃO se
--      atualiza sozinho depois do passo 3 — e é o que a ficha da aluna
--      no painel mostra. A seção 3 copia para cá o que o Stripe devolveu.
--      Só depois do Stripe: escrever no espelho um valor que o Stripe
--      ainda não tem é o espelho afirmando o que não aconteceu.
--
-- ⚠️ O CHECK `safras_cobranca_antes_das_aulas_check` exige
-- `data_primeira_cobranca <= data_inicio_aulas`. 2026-12-20 <= 2027-01-04.
--
-- ⚠️ 00:00 UTC É 21:00 DO DIA ANTERIOR EM BRASÍLIA. Não é deste ajuste:
-- é a mesma conversão (`paraEpoch`) que toda assinatura do sistema usa.
-- ============================================================


-- ============================================================
-- SEÇÃO 1 — SAFRA E CONTRATOS TRAVADOS (aplicada)
-- ============================================================

begin;

do $$
declare
  v_safra       constant uuid := '6ee444f2-9381-4a11-a461-3d347b2501f2';
  n_cobradas    int;
  n_atualizadas int;
begin
  -- ⚠️ Alguém já COBRADO muda tudo: o ciclo dela já está ancorado numa
  -- data, e mover a safra não move a fatura que já saiu. Não seguir.
  select count(*) into n_cobradas
  from public.inscricoes
  where safra_id = v_safra and status in ('ativa', 'inadimplente', 'concluida');
  if n_cobradas > 0 then
    raise exception 'Há % inscrição(ões) já cobrada(s). Abortado.', n_cobradas;
  end if;

  update public.safras
     set nome                   = 'Janeiro 2027',
         data_primeira_cobranca = date '2026-12-20',
         data_inicio_aulas      = date '2027-01-04'
   where id = v_safra;

  -- Só quem tem contrato travado. `cancelada` fica como está: o contrato
  -- dela é história, não agenda.
  update public.inscricoes
     set data_primeira_cobranca_travada = date '2026-12-20'
   where safra_id = v_safra
     and status in ('confirmada', 'pendente_pagamento')
     and data_primeira_cobranca_travada is not null;
  get diagnostics n_atualizadas = row_count;

  if n_atualizadas <> 3 then
    raise exception 'Esperava 3 contratos travados, foram %. Abortado.', n_atualizadas;
  end if;
end $$;

commit;


-- ============================================================
-- SEÇÃO 2 — CONFERÊNCIA (somente leitura)
-- ============================================================

select s.nome, s.data_inicio_aulas, s.data_primeira_cobranca,
       i.status, i.data_primeira_cobranca_travada,
       a.stripe_subscription_id, a.status_stripe, a.trial_end, a.cancel_at
from public.inscricoes i
join public.safras s on s.id = i.safra_id
left join public.assinaturas a on a.inscricao_id = i.id
where s.id = '6ee444f2-9381-4a11-a461-3d347b2501f2'
order by i.status;


-- ============================================================
-- SEÇÃO 3 — ESPELHO. ⚠️ SÓ DEPOIS de o Stripe confirmar a assinatura
-- com trial_end = 1797724800 e cancel_at = 1813449600.
-- ============================================================

begin;

do $$
declare n int;
begin
  update public.assinaturas
     set trial_end = timestamptz '2026-12-20 00:00:00+00',
         cancel_at = timestamptz '2027-06-20 00:00:00+00'
   where stripe_subscription_id = 'sub_1UYb581qWPHIjlkgBqYMeO5I'
     and status_stripe = 'trialing';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Esperava 1 assinatura trialing com esse id, achei %. Abortado.', n;
  end if;
end $$;

commit;
