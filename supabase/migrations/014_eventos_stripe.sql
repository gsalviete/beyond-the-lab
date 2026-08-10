-- ============================================================
-- Beyond The Lab — `eventos_stripe`: a PK **é** a idempotência
--
-- ⛔ Rode depois da `013`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Cria a tabela vazia.
--
-- ============================================================
-- POR QUE ESTA TABELA EXISTE, E POR QUE A CHAVE PRIMÁRIA É O MECANISMO
-- ============================================================
--
-- **O Stripe reentrega.** Não é falha, é o contrato: se o nosso endpoint
-- demorar, cair, devolver 500, ou se a resposta se perder no caminho de
-- volta, o mesmo evento chega de novo — e pode chegar várias vezes, em
-- qualquer ordem, dias depois.
--
-- Sem defesa, um `invoice.paid` reentregue faz `ciclos_pagos++` duas
-- vezes. A aluna que pagou 3 meses aparece com 4, e a D-05 (a assinatura
-- morre no 6º) passa a encerrar cedo — alguém deixa de receber aula que
-- pagou. O erro é silencioso e só aparece meses depois, na reclamação.
--
-- ⚠️ A DEFESA É `stripe_event_id` SER A PRIMARY KEY, e não uma consulta
-- "já processei este evento?" antes de processar.
--
-- A diferença não é estilo, é corrida. Duas entregas do mesmo evento
-- podem chegar SIMULTANEAMENTE, em duas instâncias serverless
-- diferentes. Um `select` seguido de `insert` tem uma janela entre os
-- dois comandos, e nessa janela as duas leem "não existe" e as duas
-- processam. A janela é de milissegundos e é exatamente onde a
-- reentrega cai, porque reentrega em rajada é o caso normal quando o
-- endpoint fica lento.
--
-- Com a PK, o `insert` É o teste: a segunda requisição recebe `23505`
-- do Postgres, e `23505` aqui significa, sem ambiguidade nenhuma, "outra
-- instância já pegou este evento". Nenhuma janela, porque não há dois
-- comandos — há um.
--
-- ⚠️ CONSEQUÊNCIA PARA QUEM ESCREVE O HANDLER (`c41`): o insert vem
-- PRIMEIRO, antes de qualquer efeito. Gravar o evento depois de
-- processar recria a corrida inteira, com a agravante de o efeito já ter
-- acontecido duas vezes quando a constraint reclama.
--
-- RLS ligada e ZERO policies. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- `stripe_event_id` é a PK, e é `text` porque o id do Stripe é
-- `evt_1QxyzABC...` — string opaca, sem formato garantido. Não tente
-- convertê-la para uuid.
--
-- ⚠️ SEM `id uuid default gen_random_uuid()`. É a única tabela do
-- projeto sem chave sintética, e a ausência é o desenho inteiro: uma PK
-- própria tornaria `stripe_event_id` uma coluna comum, e a idempotência
-- passaria a depender de alguém lembrar de criar um unique nela. A
-- chave natural aqui não é escolha estética — é o mecanismo.
--
-- `payload` guarda o evento inteiro, cru. É o que permite reprocessar
-- um evento à mão quando um handler tiver bug, sem depender de o Stripe
-- ainda ter aquele evento na fila de reentrega (ele não tem: a janela é
-- de dias).
--
-- ⚠️ O `payload` CONTÉM DADO PESSOAL — e-mail, nome, últimos quatro
-- dígitos do cartão, endereço de cobrança. Ele é dado pessoal sob LGPD
-- como qualquer outro, e a fechadura da seção 3 vale para ele com a
-- mesma força. Se um dia aparecer uma rotina de expurgo de eventos
-- antigos, é este parágrafo que a justifica.
-- ------------------------------------------------------------
create table if not exists public.eventos_stripe (
  stripe_event_id  text primary key,
  tipo             text not null,
  recebido_em      timestamptz not null default now(),
  payload          jsonb not null
);

-- ------------------------------------------------------------
-- 2. Índices de consulta
--
-- "Que eventos deste tipo chegaram?" é a pergunta do diagnóstico —
-- quando algo não bate, é por aqui que se descobre se o evento chegou e
-- não foi processado, ou se nunca chegou. As duas respostas levam a
-- lugares completamente diferentes.
-- ------------------------------------------------------------
create index if not exists eventos_stripe_tipo_idx        on public.eventos_stripe (tipo);
create index if not exists eventos_stripe_recebido_em_idx on public.eventos_stripe (recebido_em desc);

-- ------------------------------------------------------------
-- 3. Fechadura
-- ------------------------------------------------------------
alter table public.eventos_stripe enable row level security;
revoke all on public.eventos_stripe from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Documentação
-- ------------------------------------------------------------
comment on table public.eventos_stripe is
  'Registro de todo evento recebido do Stripe. A PRIMARY KEY É A '
  'IDEMPOTÊNCIA: o Stripe reentrega por contrato, e sem isto um '
  'invoice.paid reentregue contaria ciclos_pagos duas vezes. O insert é '
  'o teste — 23505 aqui significa "outra instância já pegou este '
  'evento". Um select-antes-de-inserir teria janela de corrida entre os '
  'dois comandos, que é exatamente onde a reentrega em rajada cai. '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.eventos_stripe.stripe_event_id is
  'O id do evento no Stripe (evt_...). Chave NATURAL e única PK desta '
  'tabela, de propósito: uma PK sintética tornaria esta coluna comum e a '
  'idempotência passaria a depender de alguém lembrar de criar um unique.';

comment on column public.eventos_stripe.payload is
  'O evento inteiro, cru, para reprocessar à mão quando um handler tiver '
  'bug — a janela de reentrega do Stripe é de dias, e depois dela o '
  'evento só existe aqui. ⚠️ CONTÉM DADO PESSOAL (e-mail, nome, últimos '
  'quatro dígitos, endereço de cobrança) e é dado pessoal sob LGPD como '
  'qualquer outro.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela existe, com as colunas esperadas?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'eventos_stripe'
order by ordinal_position;

-- 2. A PK é `stripe_event_id`, e NÃO existe coluna `id`?
--    Esperado: uma linha, stripe_event_id.
--    Se aparecer um `id` uuid aqui, a idempotência virou convenção.
select a.attname as coluna_da_pk
from pg_constraint con
join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
where con.conrelid = 'public.eventos_stripe'::regclass and con.contype = 'p';

-- 3. RLS ligada, sem policy, sem privilégio para anon/authenticated?
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'eventos_stripe') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'eventos_stripe';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'eventos_stripe'
  and grantee in ('anon', 'authenticated');

-- ============================================================
-- TESTE DE BARREIRA — o banco tem que RECUSAR.
--
-- ⚠️ Comentado de propósito: é CONTRAEXEMPLO, não regra.
-- ============================================================

-- A. O mesmo evento duas vezes → erro 23505 na PK.
--    É a reentrega do Stripe simulada, e é o comportamento que o
--    handler do c41 traduz em "200, ignora".
-- insert into public.eventos_stripe (stripe_event_id, tipo, payload) values
--   ('evt_teste_reentrega', 'invoice.paid', '{}'::jsonb),
--   ('evt_teste_reentrega', 'invoice.paid', '{}'::jsonb);
