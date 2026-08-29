-- ============================================================
-- REPARO DO WEBHOOK PERDIDO — 17 a 24 de agosto de 2026
-- ============================================================
--
-- Entre 17/08 e 24/08/2026 o endpoint de webhook no Stripe estava
-- cadastrado como `beyondhelab.com.br` — sem o `t` de "the". O domínio não
-- resolve, então NENHUM POST chegou: nada foi processado, e nada foi
-- processado pela metade. O endereço foi corrigido em 28/08.
--
-- Três alunas concluíram o checkout nessa janela. O Stripe reentrega por
-- ~3 dias e depois desiste; a quarta (26/08) ainda estava dentro da janela
-- quando o endereço foi corrigido e entrou sozinha. Daí serem exatamente
-- três.
--
-- Este arquivo reconstrói à mão o efeito que `checkout.session.completed`
-- e `invoice.paid` teriam produzido. Ele NÃO é migração: não muda schema,
-- escreve dado, e é seguro rodar mais de uma vez.
--
-- ⚠️ ELE NÃO SUBSTITUI O REENVIO NO DASHBOARD, e a diferença é o e-mail.
-- `sessaoConcluida` termina chamando `confirmarInscricao`, e SQL não manda
-- e-mail. A queixa original das três alunas foi justamente não terem sido
-- avisadas. O reenvio (Developers → Webhooks → o endpoint → entregas com
-- falha → Resend) faz tudo isto de novo E manda o e-mail; rodar os dois é
-- seguro, porque cada passo aqui é idempotente e o `registrarAssinatura`
-- faz upsert sobre a mesma linha.
--
-- ⚠️ E ELE TEM PRAZO. O Stripe guarda evento por ~30 dias. O mais antigo é
-- o de 17/08, que vence por volta de 16/09/2026. Depois disso o e-mail de
-- confirmação só sai à mão.
--
-- ------------------------------------------------------------
-- ⚠️ ANTES DE RODAR: A DATA DE FIM PRECISA EXISTIR NO STRIPE
-- ------------------------------------------------------------
--
-- As três assinaturas estão SEM `cancel_at` lá — o webhook é quem o põe
-- (`ESTADO.md` 2.3), e ele nunca rodou. Sem essa data a assinatura não
-- morre no 6º mês e cobra para sempre, que é o que a D-05 existe para
-- impedir.
--
-- Por isso `cancel_at` entra NULL aqui, e a escolha é deliberada: um
-- espelho que afirme uma data que a assinatura não tem é a inversão de
-- ordem que o comentário de `sessaoConcluida` proíbe — "o nosso banco
-- afirmaria um `cancel_at` que a assinatura não tem, e a diferença só
-- apareceria na sétima cobrança".
--
-- NULL também é o que ARMA A REDE: `faturaPaga` vê a lacuna e chama
-- `declararFimDaAssinatura` sozinha na próxima fatura (28/09), sem
-- ninguém precisar lembrar. Se o reenvio for feito antes disso, o
-- `checkout.session.completed` resolve na hora.
--
-- O valor correto, quando for declarado: 2027-02-28, que é
-- `data_primeira_cobranca_travada` (2026-08-28) + `duracao_meses_travada`
-- (6), conferido linha a linha nas três inscrições.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. As três assinaturas que nunca foram espelhadas
--
-- `on conflict (stripe_subscription_id) do nothing` e não `do update`: se
-- a linha já existe, foi o reenvio do Dashboard que a criou — com dados
-- lidos do Stripe ao vivo, que são melhores que estes literais. Este
-- arquivo é o plano B, e plano B não sobrescreve o plano A.
--
-- `ciclos_pagos` sai da regra de `faturaPaga`: a fatura de R$ 0,00 do
-- trial é `subscription_create` com `amount_paid = 0` e NÃO conta. Só a
-- fatura de 28/08 (`subscription_cycle`) conta — e a da Júlia foi
-- recusada, então ela fica em zero.
-- ------------------------------------------------------------
insert into public.assinaturas (
  inscricao_id, stripe_customer_id, stripe_subscription_id,
  stripe_checkout_session_id, status_stripe, trial_end, cancel_at,
  cupom_id, ciclos_pagos
)
values
  -- Sofia de Oliveira Costa — checkout 17/08, R$ 299,99 paga em 28/08.
  ('5662e098-17d8-4200-8244-51014890bef5',
   'cus_V5kWv1zJfbd6Wz',
   'sub_1U5Z1W1qWPHIjlkgD4EnPOWX',
   'cs_live_a1oqTEVsND8agONyOU83MBMJNsiiYUFNHZjpoY1Rtpl7pxo14JL7StFP7P',
   'active', '2026-08-28T00:00:00+00'::timestamptz, null,
   null, 1),

  -- Clarisse Mello — checkout 23/08, R$ 269,99 paga em 28/08 (PRIMEIRASEMANA).
  ('b4035457-fff7-4c45-aa2f-ee7eb361db2d',
   'cus_V7tgBWDR35cLAI',
   'sub_1U7dtZ1qWPHIjlkgRW7T6YKY',
   'cs_live_a1C67r98VDf00VoYi1183Yue37e6avZh2l4BF2t5dY1pn8Z4pLdBiORGze',
   'active', '2026-08-28T00:00:00+00'::timestamptz, null,
   'fd3cf333-57f5-4a43-a331-b9cac3281928', 1),

  -- Júlia Coelho Masiero — checkout 24/08. A cobrança de 28/08 foi RECUSADA;
  -- a assinatura está `past_due` no Stripe e nenhum ciclo foi pago.
  ('4506094e-1da0-4309-aa0b-d58281fcce6a',
   'cus_V8BmAzPQI6QQ6a',
   'sub_1U7vQl1qWPHIjlkgnbrf5V6C',
   'cs_live_a1YG8qvmJ58ErfTaNVprd36NOqYBNdG9MGP8UT7Z61wSZTmpLIzqFbZWyZ',
   'past_due', '2026-08-28T00:00:00+00'::timestamptz, null,
   'fd3cf333-57f5-4a43-a331-b9cac3281928', 0)
on conflict (stripe_subscription_id) do nothing;

-- ------------------------------------------------------------
-- 2. O status das inscrições
--
-- `confirmada` seria o estado logo após `checkout.session.completed`, mas
-- a fatura do ciclo já veio depois — então o estado verdadeiro HOJE é o
-- que `faturaPaga`/`faturaRecusada` teriam deixado: `ativa` para quem
-- pagou, `inadimplente` para quem teve o cartão recusado.
--
-- O `where status = 'pendente_pagamento'` faz o comando ser idempotente e
-- impede que ele reescreva por cima do reenvio do Dashboard.
-- ------------------------------------------------------------
update public.inscricoes
   set status = 'ativa'
 where id in (
         '5662e098-17d8-4200-8244-51014890bef5',
         'b4035457-fff7-4c45-aa2f-ee7eb361db2d'
       )
   and status = 'pendente_pagamento';

update public.inscricoes
   set status = 'inadimplente'
 where id = '4506094e-1da0-4309-aa0b-d58281fcce6a'
   and status = 'pendente_pagamento';

-- ------------------------------------------------------------
-- 3. O uso do cupom
--
-- Contado no PAGAMENTO e não na abertura do checkout — senão um cupom de
-- 10 usos se esgotaria com 10 curiosas e zero vendas. Clarisse e Júlia
-- concluíram o checkout com PRIMEIRASEMANA, então são dois usos que o
-- webhook não chegou a somar. A Júlia conta mesmo com a cobrança
-- recusada: `sessaoConcluida` soma no checkout concluído, não na fatura.
--
-- ⚠️ O `where usos_atuais = 0` é a trava de idempotência. Se o reenvio já
-- tiver somado, este comando não faz nada — em vez de somar de novo e
-- produzir uma contagem que nenhuma tela sabe explicar.
-- ------------------------------------------------------------
update public.cupons
   set usos_atuais = usos_atuais + 2
 where id = 'fd3cf333-57f5-4a43-a331-b9cac3281928'
   and usos_atuais = 0;

commit;

-- ============================================================
-- CONFERÊNCIA — rode depois e leia os três resultados
-- ============================================================

-- 1. As quatro que pagaram, com o estado de cada uma.
--    Esperado: Sofia e Clarisse `ativa`, Júlia `inadimplente`,
--    Letícia `ativa`. Nenhuma `pendente_pagamento`.
select p.nome, i.status, a.status_stripe, a.ciclos_pagos, a.cancel_at
  from public.inscricoes i
  join public.pessoas p on p.id = i.pessoa_id
  left join public.assinaturas a on a.inscricao_id = i.id
 where i.id in (
         '5662e098-17d8-4200-8244-51014890bef5',
         'b4035457-fff7-4c45-aa2f-ee7eb361db2d',
         '4506094e-1da0-4309-aa0b-d58281fcce6a',
         '748426e2-632c-40a7-8f94-9a200dead1ca'
       )
 order by i.created_at;

-- 2. A fila de pendentes que a Giovanna vai ver.
--    Esperado: 5 linhas — Hillary, Gabrielle, Bruna, Tainá e Laura.
--    Nenhuma delas tem assinatura, e é por isso que podem receber o link.
select p.nome, p.email, i.created_at::date as abriu_em
  from public.inscricoes i
  join public.pessoas p on p.id = i.pessoa_id
  left join public.assinaturas a on a.inscricao_id = i.id
 where i.status = 'pendente_pagamento'
   and a.id is null
 order by i.created_at;

-- 3. ⚠️ O ALARME: assinatura sem data de fim.
--    Enquanto as três aparecerem aqui, elas cobram para sempre. Some
--    quando o `cancel_at` for declarado no Stripe — pelo reenvio do
--    Dashboard, ou pela rede de `faturaPaga` na fatura de 28/09.
select p.nome, a.stripe_subscription_id, a.cancel_at
  from public.assinaturas a
  join public.inscricoes i on i.id = a.inscricao_id
  join public.pessoas p on p.id = i.pessoa_id
 where a.cancel_at is null;
