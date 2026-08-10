-- ============================================================
-- Beyond The Lab — `assinaturas`: o espelho do Stripe
--
-- ⛔ Só depois de a `011b` ter rodado. Ela é a última do corte 1, e este
--    arquivo abre o corte 2.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Cria a tabela vazia. Quem a
--    preenche é o webhook `checkout.session.completed` (`c42`).
--
-- ============================================================
-- O QUE ESTA TABELA É — E O QUE ELA NÃO É
-- ============================================================
--
-- Ela é um ESPELHO. A verdade sobre uma assinatura mora no Stripe, e
-- mora lá porque é lá que o dinheiro se move: quem sabe se a fatura de
-- março foi paga é o Stripe, não nós. Esta tabela existe para que o
-- painel da Giovana responda "quantos meses a Marina já pagou?" sem uma
-- chamada de API por linha de tela.
--
-- Ela NÃO é fonte de verdade, e a distinção decide o que é bug e o que
-- não é: se esta tabela e o Stripe discordarem, **o Stripe está certo**.
-- A correção é reprocessar o evento, nunca editar a linha à mão para
-- "arrumar" o painel.
--
-- ⚠️ POR QUE `status_stripe` É TEXTO CRU, SEM CHECK DE DOMÍNIO
--
-- É a única coluna do projeto inteiro sem domínio declarado, e é
-- deliberado. O conjunto de status de assinatura pertence ao Stripe:
-- `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`,
-- `incomplete_expired`, `paused` — e eles PODEM ACRESCENTAR MAIS, numa
-- versão de API que a gente não escolheu.
--
-- Um CHECK aqui transformaria "o Stripe inventou um status novo" em
-- "o webhook falha e devolve 500 para sempre". O Stripe reentrega, o
-- 500 se repete, e a fila de eventos daquela assinatura trava — por uma
-- constraint nossa defendendo um domínio que não é nosso.
--
-- O domínio que É nosso está em `inscricoes.status`, com CHECK, e ele
-- continua fechado. Este espelho guarda o que chegou; a tradução para o
-- nosso vocabulário acontece no webhook, em código, onde um valor
-- desconhecido pode cair num `else` que só registra.
--
-- RLS ligada e ZERO policies. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- `inscricao_id` é UNIQUE: 1:1 com a inscrição. Uma pessoa que se
-- inscreve em duas safras tem duas inscrições e duas assinaturas, e o
-- unique é o que impede a mesma inscrição de acumular assinaturas — o
-- estado que apareceria se um webhook fosse processado duas vezes sem
-- idempotência (que é a `014`, e as duas defesas são independentes de
-- propósito).
--
-- `stripe_subscription_id` é UNIQUE pela outra direção: o mesmo objeto
-- do Stripe não pode aparecer em duas linhas nossas.
--
-- ⚠️ `ciclos_pagos` COMEÇA EM 0 E SÓ ANDA POR `invoice.paid`. Não é
-- calculado, não é derivado de data, não é "meses desde o início".
-- Derivar de data seria o bug clássico: uma aluna inadimplente há dois
-- meses apareceria com os ciclos em dia porque o calendário andou.
-- Contar eventos de pagamento é a única forma de a coluna significar o
-- que o nome diz.
--
-- `cupom_id` é NULLABLE — a maioria das assinaturas não tem cupom. A FK
-- aponta para `cupons`, que a `013` cria; por isso esta migração roda
-- ANTES dela e a FK entra depois, na seção 3. Ver o comentário lá.
-- ------------------------------------------------------------
create table if not exists public.assinaturas (
  id            uuid primary key default gen_random_uuid(),

  -- 1:1 com a inscrição
  inscricao_id  uuid not null unique references public.inscricoes(id) on delete restrict,

  -- os identificadores do Stripe
  stripe_customer_id          text not null,
  stripe_subscription_id      text not null unique,
  stripe_checkout_session_id  text,

  -- espelho cru — ver o cabeçalho
  status_stripe  text not null,

  -- as duas datas que a D-04 e a D-05 definem
  trial_end   timestamptz,
  cancel_at   timestamptz,

  ciclos_pagos  int not null default 0,

  cupom_id  uuid,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. `on delete restrict` na inscrição, e não `cascade`
--
-- Apagar uma inscrição que tem assinatura é sempre engano, e o banco
-- obriga a decisão a ser tomada explicitamente. `cascade` aqui apagaria
-- o registro de que alguém PAGOU — o histórico financeiro sumindo junto
-- com um clique errado no Studio.
--
-- Cancelamento não apaga nada: ele muda `inscricoes.status` para
-- `cancelada` e cancela a assinatura no Stripe (Fluxo 6). A linha
-- permanece, com `ciclos_pagos` intacto, porque "esta pessoa pagou três
-- meses e cancelou" é informação, e informação não se apaga por
-- conveniência de modelagem.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. A FK de `cupom_id` NÃO entra aqui
--
-- `public.cupons` só existe depois da `013`. Uma FK para tabela
-- inexistente aborta esta migração, e inverter a ordem das duas não
-- resolve — apenas move o problema, porque `cupons` referencia `safras`
-- e este arquivo referencia `inscricoes`.
--
-- A FK é acrescentada no fim da `013`, que é o primeiro momento em que
-- as duas pontas existem. Está escrito lá, na seção correspondente, e
-- a verificação do fim deste arquivo NÃO a procura de propósito: ela
-- ainda não deve existir quando este arquivo termina.
--
-- ⚠️ Se você rodar esta migração e parar aqui, `cupom_id` é uma coluna
-- uuid solta, sem integridade referencial. Rode a `013` na sequência.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 4. Índices de consulta
--
-- `inscricao_id` já tem índice pelo unique. Estes três respondem às
-- perguntas do painel: "quais assinaturas estão com problema?"
-- (`status_stripe`), "quem é esta pessoa no Stripe?"
-- (`stripe_customer_id`), e a busca pelo id de assinatura, que é como o
-- webhook encontra a linha a atualizar.
-- ------------------------------------------------------------
create index if not exists assinaturas_status_stripe_idx
  on public.assinaturas (status_stripe);

create index if not exists assinaturas_customer_idx
  on public.assinaturas (stripe_customer_id);

create index if not exists assinaturas_cupom_id_idx
  on public.assinaturas (cupom_id);

-- ------------------------------------------------------------
-- 5. `atualizado_em` por TRIGGER, não por disciplina
--
-- A coluna existe para responder "quando foi a última vez que o Stripe
-- nos contou algo sobre esta assinatura?". Se ela depender de todo
-- `update` lembrar de escrevê-la, um dia um handler novo esquece, e o
-- campo passa a mentir sem que nada quebre — o pior modo de falha, e o
-- mesmo padrão que o `REPORT.md` §8.3 chama de disciplina onde cabia
-- mecanismo.
--
-- `create or replace function` é idempotente por natureza; o trigger
-- precisa da guarda porque `create trigger` não aceita `if not exists`
-- em todas as versões, e `drop ... if exists` seguido de `create` é a
-- forma que roda de novo sem erro.
-- ------------------------------------------------------------
create or replace function public.toca_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists assinaturas_atualizado_em on public.assinaturas;

create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row
  execute function public.toca_atualizado_em();

-- ------------------------------------------------------------
-- 6. Fechadura
-- ------------------------------------------------------------
alter table public.assinaturas enable row level security;
revoke all on public.assinaturas from anon, authenticated;

-- ------------------------------------------------------------
-- 7. Documentação
-- ------------------------------------------------------------
comment on table public.assinaturas is
  'ESPELHO do Stripe, 1:1 com uma inscrição paga. NÃO é fonte de '
  'verdade: se esta tabela e o Stripe discordarem, o Stripe está certo, '
  'e a correção é reprocessar o evento — nunca editar a linha à mão. '
  'Existe para o painel responder sem uma chamada de API por linha. '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.assinaturas.status_stripe is
  'Espelho CRU do status da assinatura no Stripe (trialing, active, '
  'past_due, canceled, unpaid, incomplete...). SEM CHECK de propósito: o '
  'domínio pertence ao Stripe e pode ganhar valores novos numa versão de '
  'API que não escolhemos. Um CHECK aqui faria o webhook devolver 500 '
  'para sempre e travar a fila daquela assinatura. O domínio NOSSO, esse '
  'sim fechado, é inscricoes.status.';

comment on column public.assinaturas.ciclos_pagos is
  'Quantas faturas foram efetivamente pagas. Começa em 0 e só anda por '
  'invoice.paid. NUNCA derive de data: uma aluna inadimplente há dois '
  'meses apareceria em dia porque o calendário andou. Contar eventos é a '
  'única forma de a coluna significar o que o nome diz. A idempotência '
  'que impede a contagem dobrada é a 014.';

comment on column public.assinaturas.trial_end is
  'Fim do trial = data da PRIMEIRA COBRANÇA da safra (D-04). A aluna '
  'confirma o cartão hoje e não é debitada até aqui.';

comment on column public.assinaturas.cancel_at is
  'Quando a assinatura morre sozinha (D-05): data_primeira_cobranca + '
  'duracao_meses, definido na CRIAÇÃO. Existe para que o encerramento '
  'não dependa de um job nosso rodando — job uma hora não roda, e uma '
  'aluna é cobrada no 7º mês.';

comment on column public.assinaturas.cupom_id is
  'Cupom aplicado, ou NULL. A FK é acrescentada no fim da 013, que é '
  'quando public.cupons passa a existir.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela existe, com as colunas esperadas?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'assinaturas'
order by ordinal_position;

-- 2. Os dois uniques existem?
--    Esperado: um em inscricao_id, um em stripe_subscription_id.
--    Sem o primeiro, um webhook reprocessado cria uma SEGUNDA assinatura
--    para a mesma inscrição.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'assinaturas'
order by indexname;

-- 3. A FK para inscricoes é `restrict`?
--    Esperado: uma linha, confdeltype = 'r'.
--    ⚠️ A FK de cupom_id NÃO deve aparecer aqui ainda — ela entra na 013.
select con.conname, cl.relname as aponta_para, con.confdeltype as on_delete
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.assinaturas'::regclass and con.contype = 'f'
order by con.conname;

-- 4. O trigger de atualizado_em está armado?
--    Esperado: uma linha, assinaturas_atualizado_em, BEFORE UPDATE.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.assinaturas'::regclass and not tgisinternal;

-- 5. RLS ligada, sem policy, sem privilégio para anon/authenticated?
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'assinaturas') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'assinaturas';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'assinaturas'
  and grantee in ('anon', 'authenticated');

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os dois.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <INSCRICAO> por um id real.
-- ============================================================

-- A. Duas assinaturas para a mesma inscrição
--    → erro no unique de inscricao_id.
--    É a barreira que sobra se a idempotência da 014 falhar.
-- insert into public.assinaturas
--   (inscricao_id, stripe_customer_id, stripe_subscription_id, status_stripe)
-- values
--   ('<INSCRICAO>', 'cus_A', 'sub_A', 'trialing'),
--   ('<INSCRICAO>', 'cus_A', 'sub_B', 'trialing');

-- B. Apagar inscrição que tem assinatura → erro na FK (restrict).
--    O histórico de quem pagou não some com um clique no Studio.
-- delete from public.inscricoes where id = '<INSCRICAO>';
