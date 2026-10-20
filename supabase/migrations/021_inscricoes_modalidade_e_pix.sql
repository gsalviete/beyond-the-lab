-- ============================================================
-- Beyond The Lab — a forma de pagamento TRAVADA na inscrição, e a tabela
-- dos pagamentos Pix (D-17, `c82`)
--
-- ⛔ Rode depois da `020`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Três colunas nulas em
--    `inscricoes`, cinco CHECKs `NOT VALID`, e uma tabela nova vazia.
--
-- ============================================================
-- A FORMA DE PAGAMENTO TRAVA, PELO MESMO MOTIVO QUE O PREÇO (D-06)
-- ============================================================
--
-- A `015` copiou `valor_mensal`, `duracao_meses` e
-- `data_primeira_cobranca` da safra para a inscrição, porque PROVA NÃO SE
-- NORMALIZA: subir o preço da safra não pode reescrever o que alguém
-- aceitou em março. Com a D-17, o contrato ganha uma dimensão nova — a
-- FORMA — e ela trava pela mesma razão. Quem escolheu o 12x e abandonou o
-- checkout volta pelo link da D-15 para o 12x, mesmo que a Giovanna tenha
-- tirado o 12x da safra no meio do caminho.
--
-- As três colunas novas:
--
--   `modalidade`           mensal | parcelado | a_vista_cartao | a_vista_pix
--   `parcelas_travadas`    quantas cobranças o contrato tem (1 no à vista)
--   `valor_total_travado`  quanto o contrato soma, em reais
--
-- ⚠️ E `valor_mensal_travado` GANHA UM SIGNIFICADO MAIS LARGO, sem mudar
-- para quem já tem contrato: ele passa a ser "o valor de CADA COBRANÇA
-- regular". No mensal é a mensalidade, exatamente como sempre foi. No
-- parcelado é a parcela regular (166,67 — a última, 166,63, é derivada do
-- total). No à vista é o valor inteiro, cobrado uma vez. O comentário da
-- coluna é reescrito no fim deste arquivo.
--
-- `duracao_meses_travada` continua sendo a DURAÇÃO DO CURSO, e não o
-- número de cobranças. As duas coisas coincidiam no mensal e foram
-- separadas aqui: o 12x cobra 12 vezes um curso de 6 meses.
--
-- ============================================================
-- ⚠️ NENHUM BACKFILL — e o `null` tem significado exato
-- ============================================================
--
-- Toda inscrição com contrato que já existe passou por um checkout em que
-- a ÚNICA forma possível era a mensalidade. Então `modalidade` nula numa
-- linha com `valor_mensal_travado` preenchido significa, sem
-- ambiguidade: **contrato anterior à D-17 = mensal**, com
-- `parcelas = duracao_meses_travada` e `total = valor × duração`. Quem
-- interpreta isso é `modalidadeDoContrato`, em `src/config/modalidade.ts`,
-- e é o único lugar que interpreta.
--
-- Preencher as linhas antigas seria escrever no passado um campo que
-- ninguém escolheu — o mesmo motivo de não haver backfill de `consent`.
-- Aqui a inferência é segura, e ainda assim ela mora no código, nomeada,
-- em vez de gravada como se tivesse sido escolha de alguém.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. As três colunas em `inscricoes`
--
-- ⚠️ `add column ... if not exists` sem DEFAULT é operação de CATÁLOGO:
-- não reescreve a tabela, não trava escrita, não tem downtime. Há gente
-- real se inscrevendo enquanto isto roda.
-- ------------------------------------------------------------
alter table public.inscricoes
  add column if not exists modalidade           text,
  add column if not exists parcelas_travadas    int,
  add column if not exists valor_total_travado  numeric(10,2);

-- ------------------------------------------------------------
-- 2. Os CHECKs de `inscricoes` — todos `NOT VALID`
--
-- 2.1 O DOMÍNIO. Quatro valores, espelhados em `MODALIDADES`
--     (`src/config/modalidade.ts`). Um quinto valor sem código que o cobre
--     seria uma inscrição que o checkout não sabe cobrar.
--
-- 2.2 TUDO-OU-NADA entre as três novas. Modalidade sem parcelas não diz
--     quantas vezes cobrar; total sem modalidade não diz como.
--
-- 2.3 CONTRATO NOVO É CONTRATO INTEIRO. Com `modalidade` preenchida, os
--     três travados da `015` também têm que estar. Uma forma de pagamento
--     sem valor por cobrança é metade de um contrato.
--
-- 2.4 LISTA DE ESPERA NUNCA TEM MODALIDADE. Mesma razão do
--     `inscricoes_espera_sem_travado_check` da `015`: quem não está numa
--     safra não escolheu como pagar uma safra.
--
-- 2.5 NÚMEROS POSITIVOS. Zero parcelas ou total zero é erro de quem
--     escreveu, não contrato.
--
-- ⚠️ O que NÃO é CHECK, de propósito: a coerência entre a modalidade e o
-- número de parcelas (à vista = 1, mensal = duração). Ela é verdade hoje,
-- mas é REGRA DE PRODUTO, e o lugar dela é o código que monta o contrato
-- (`contratoDaModalidade`). Um CHECK aqui recusaria em produção, numa
-- terça-feira, o dia em que o negócio decidir um "mensal de 5 vezes num
-- curso de 6 meses" — e o contrato que já está gravado não deveria
-- depender de a regra de hoje continuar valendo amanhã.
-- ------------------------------------------------------------
do $$
begin
  -- 2.1
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_modalidade_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_modalidade_check
      check (
        modalidade is null
        or modalidade in ('mensal', 'parcelado', 'a_vista_cartao', 'a_vista_pix')
      )
      not valid;
  end if;

  -- 2.2
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_modalidade_tudo_ou_nada_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_modalidade_tudo_ou_nada_check
      check (
        (modalidade is null and parcelas_travadas is null and valor_total_travado is null)
        or
        (modalidade is not null and parcelas_travadas is not null and valor_total_travado is not null)
      )
      not valid;
  end if;

  -- 2.3
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_modalidade_com_travados_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_modalidade_com_travados_check
      check (modalidade is null or valor_mensal_travado is not null)
      not valid;
  end if;

  -- 2.4
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_espera_sem_modalidade_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_espera_sem_modalidade_check
      check (safra_id is not null or modalidade is null)
      not valid;
  end if;

  -- 2.5
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_contrato_positivo_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_contrato_positivo_check
      check (
        (parcelas_travadas is null or parcelas_travadas >= 1)
        and (valor_total_travado is null or valor_total_travado > 0)
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. `pagamentos_pix` — porque Pix não tem assinatura
--
-- `assinaturas.stripe_subscription_id` é `not null` (`012`), e está certo
-- assim: toda assinatura do Stripe tem id. O Pix não é assinatura — é um
-- pagamento único, e não há id de assinatura para pôr ali. Afrouxar o
-- `not null` daquela tabela para caber o Pix faria cada leitura dela ter
-- que perguntar "isto é uma assinatura de verdade?", e um handler de
-- `invoice.paid` que esquecesse de perguntar contaria ciclo numa linha
-- que nunca vai ter ciclo.
--
-- ⚠️ A LINHA NASCE QUANDO O DINHEIRO ENTRA, não quando o QR é gerado. O
-- Pix é assíncrono: `checkout.session.completed` chega quando a pessoa
-- vê o QR, e o pagamento chega depois (`async_payment_succeeded`), ou não
-- chega nunca. Uma linha por QR gerado seria uma tabela de tentativas,
-- e a pergunta que o painel faz é "ela pagou?".
--
-- ⚠️ `inscricao_id` UNIQUE: uma inscrição tem no máximo UM Pix pago. Se a
-- pessoa pagar dois QRs da mesma inscrição (abriu duas abas), o segundo
-- é recusado aqui, o webhook registra o conflito no log, e o reembolso
-- é manual no Dashboard (D-17, "Proíbe"). Aceitar a segunda linha
-- esconderia que alguém pagou duas vezes.
--
-- `on delete restrict` pela mesma razão das `assinaturas`: apagar a
-- inscrição apagaria o registro de que alguém PAGOU.
-- ------------------------------------------------------------
create table if not exists public.pagamentos_pix (
  id            uuid primary key default gen_random_uuid(),

  inscricao_id  uuid not null unique references public.inscricoes(id) on delete restrict,

  stripe_checkout_session_id  text not null unique,
  stripe_payment_intent_id    text unique,

  -- O valor que o Stripe disse ter recebido, em reais. Não é cópia do
  -- travado: é o espelho do que de fato entrou.
  valor    numeric(10,2) not null,
  pago_em  timestamptz not null,

  criado_em  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pagamentos_pix'::regclass
      and conname = 'pagamentos_pix_valor_positivo_check'
  ) then
    -- Tabela nova e vazia: `NOT VALID` não dispensa nada aqui, e entra
    -- assim mesmo. Regra sem exceção é a que continua sendo seguida.
    alter table public.pagamentos_pix
      add constraint pagamentos_pix_valor_positivo_check
      check (valor > 0)
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Fechadura — a mesma das `assinaturas`
-- ------------------------------------------------------------
alter table public.pagamentos_pix enable row level security;
revoke all on public.pagamentos_pix from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Documentação
-- ------------------------------------------------------------
comment on column public.inscricoes.modalidade is
  'A forma de pagamento escolhida, TRAVADA no checkout (D-17, D-06): '
  'mensal | parcelado | a_vista_cartao | a_vista_pix. NULL numa linha COM '
  'valor_mensal_travado = contrato anterior à D-17, que só podia ser '
  'mensal — sem backfill, a leitura mora em modalidadeDoContrato '
  '(src/config/modalidade.ts). NULL sem travado = nunca passou por '
  'checkout. O link da D-15 reabre ESTA forma; a pessoa não escolhe de novo.';

comment on column public.inscricoes.parcelas_travadas is
  'Quantas cobranças o contrato tem (D-17). 1 no à vista, a duração no '
  'mensal, parcelas_parcelado no parcelado. NÃO É A DURAÇÃO DO CURSO — '
  'essa é duracao_meses_travada.';

comment on column public.inscricoes.valor_total_travado is
  'Quanto o contrato soma, em reais (D-17). No parcelado é o total que o '
  'negócio fixou (R$ 2.000,00), e a última parcela é derivada dele — ver '
  'dividirEmParcelas. Guardado, e não calculado, porque no parcelado ele '
  'NÃO é parcela × número de parcelas.';

comment on column public.inscricoes.valor_mensal_travado is
  'O valor de CADA COBRANÇA regular, COPIADO da safra no checkout (D-06). '
  'No mensal é a mensalidade — o significado de sempre. No parcelado é a '
  'parcela regular (a última pode diferir; ver valor_total_travado). No '
  'à vista é o valor inteiro, cobrado uma vez (D-17). NULL = esta '
  'inscrição nunca passou por um checkout — o estado de toda a lista de '
  'espera. Mesma lógica de consent_text: PROVA NÃO SE NORMALIZA.';

comment on table public.pagamentos_pix is
  'Pagamentos Pix RECEBIDOS, 1:1 com a inscrição (D-17). Existe porque Pix '
  'não é assinatura e assinaturas.stripe_subscription_id é not null. A '
  'linha nasce quando o dinheiro entra (async_payment_succeeded), não '
  'quando o QR é gerado. Espelho do Stripe: se discordar dele, o Stripe '
  'está certo. Reembolso é manual, no Dashboard. RLS ligada sem policies: '
  'acesso exclusivo server-side via service_role.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. As três colunas novas de `inscricoes` existem, nullable?
--    Esperado: modalidade text, parcelas_travadas integer,
--    valor_total_travado numeric(10,2) — todas YES.
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'inscricoes'
  and column_name in ('modalidade', 'parcelas_travadas', 'valor_total_travado')
order by column_name;

-- 2. Os cinco CHECKs de `inscricoes` existem, e estão NOT VALID?
--    Esperado: as cinco linhas, todas com convalidated = false.
select conname, convalidated, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.inscricoes'::regclass
  and contype = 'c'
  and conname in (
    'inscricoes_modalidade_check',
    'inscricoes_modalidade_tudo_ou_nada_check',
    'inscricoes_modalidade_com_travados_check',
    'inscricoes_espera_sem_modalidade_check',
    'inscricoes_contrato_positivo_check'
  )
order by conname;

-- 3. `pagamentos_pix` existe, com RLS ligada e zero policies?
--    Esperado: rls = true, policies = 0.
select
  c.relrowsecurity as rls,
  (select count(*) from pg_policies where tablename = 'pagamentos_pix') as policies
from pg_class c
where c.oid = 'public.pagamentos_pix'::regclass;

-- 4. NENHUMA inscrição ganhou modalidade?
--    Esperado: 0. Sem backfill — ver o cabeçalho.
select count(*) as linhas_com_modalidade
from public.inscricoes
where modalidade is not null;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os três.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <PESSOA> e <SAFRA> por ids reais.
-- ============================================================

-- A. Modalidade fora do domínio → erro em inscricoes_modalidade_check.
-- insert into public.inscricoes
--   (pessoa_id, safra_id, status, modalidade, parcelas_travadas, valor_total_travado,
--    valor_mensal_travado, duracao_meses_travada, data_primeira_cobranca_travada)
-- values ('<PESSOA>', '<SAFRA>', 'pendente_pagamento', 'boleto', 1, 1500,
--         1500, 6, '2026-11-02');

-- B. Modalidade sem os travados da `015` → erro em
--    inscricoes_modalidade_com_travados_check.
-- insert into public.inscricoes
--   (pessoa_id, safra_id, status, modalidade, parcelas_travadas, valor_total_travado)
-- values ('<PESSOA>', '<SAFRA>', 'pendente_pagamento', 'a_vista_pix', 1, 1500);

-- C. Lista de espera com modalidade → erro em
--    inscricoes_espera_sem_modalidade_check (e no da `015`).
-- insert into public.inscricoes
--   (pessoa_id, safra_id, status, modalidade, parcelas_travadas, valor_total_travado)
-- values ('<PESSOA>', null, 'lista_espera', 'mensal', 6, 1799.94);
