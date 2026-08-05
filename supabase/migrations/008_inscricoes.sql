-- ============================================================
-- Beyond The Lab — `inscricoes`: pessoa ↔ safra
--
-- ⛔ Não rode em produção antes do staging de dados. Ver o pré-requisito
--    na abertura do corte 1 em `docs/04-PLANO.md`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela cria a tabela vazia. A
--    migração da `waitlist` para cá é a `010`, e é o passo mais perigoso
--    do plano — separá-los é o que permite conferir a estrutura antes de
--    confiar dados a ela.
--
-- O QUE É UMA INSCRIÇÃO
--
-- O encontro entre uma PESSOA e uma SAFRA. Ela carrega quatro coisas
-- que não têm a mesma natureza, e a distinção governa o arquivo inteiro:
--
--   VÍNCULO  pessoa_id, safra_id, grupo_id
--   ESTADO   status
--   PERFIL   nivel_ingles, curso, periodo, disponibilidade
--            — descreve a pessoa NAQUELA safra, e por isso não mora em
--              `pessoas`: quem estava no 3º período em janeiro está no
--              5º em julho.
--   PROVA    consent, consent_at, consent_text
--            — não se normaliza. Ver a seção 5.
--
-- O QUE **NÃO** ESTÁ AQUI, E POR QUÊ
--
-- As colunas travadas (`valor_mensal_travado`, `duracao_meses_travada`,
-- `data_primeira_cobranca_travada`) pertencem a esta tabela no modelo
-- (D-06) e entram na migração `015`, no corte 2 (`c33`), junto do
-- checkout que as preenche. Elas só fazem sentido a partir do momento em
-- que existe uma assinatura para travar — antes disso seriam três
-- colunas sempre nulas com um CHECK que nada exercita.
--
-- RLS ligada e ZERO policies. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- `safra_id` é NULLABLE, e nulo aqui significa exatamente LISTA DE
-- ESPERA: a pessoa se cadastrou sem safra aberta e não pertence a leva
-- nenhuma ainda. É o mesmo desenho que `waitlist.turma_id` tinha, e
-- continua certo — quem faz o par valer é o CHECK da `009`.
--
-- `grupo_id` é NULLABLE e ORTOGONAL AO STATUS (D-03). Uma inscrição paga
-- pode não ter horário ainda; uma inscrição alocada pode estar
-- inadimplente. Arrastar uma aluna de segunda para quarta no painel não
-- dispara, cancela nem altera nada no Stripe — e é isso que torna o
-- kanban seguro de usar.
--
-- Perfil todo NULLABLE, e isto é herança consciente: a `010` traz linhas
-- da `waitlist` onde esses campos são nulos (inclusive a linha do
-- incidente da `004`, gravada por um build antigo com o perfil inteiro
-- vazio). Um `not null` na coluna faria a migração falhar. Quem exige o
-- preenchimento em toda escrita NOVA é o CHECK `not valid` que a `010`
-- acrescenta DEPOIS de os dados entrarem — ver a nota na `009`.
--
-- `status` sem DEFAULT, de propósito. Um default de 'lista_espera'
-- transformaria "o servidor esqueceu de definir o status" em "a pessoa
-- está na lista de espera", que é uma afirmação de negócio nascida de um
-- esquecimento. Sem default, o insert falha e o erro aparece.
-- ------------------------------------------------------------
create table if not exists public.inscricoes (
  id           uuid primary key default gen_random_uuid(),

  -- vínculo
  pessoa_id    uuid not null references public.pessoas(id) on delete restrict,
  safra_id     uuid          references public.safras(id)  on delete restrict,
  grupo_id     uuid          references public.grupos(id)  on delete set null,

  -- estado
  status       text not null,

  -- perfil (nullable — ver acima)
  nivel_ingles     text,
  curso            text,
  periodo          text,
  disponibilidade  text[],

  -- prova (nullable — ver seção 5)
  consent       boolean,
  consent_at    timestamptz,
  consent_text  text,

  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Por que `grupo_id` é `on delete set null` e os outros são `restrict`
--
-- Não é inconsistência. As três FKs respondem a perguntas diferentes:
--
--   pessoa_id → RESTRICT. Apagar uma pessoa que tem inscrição é sempre
--     engano; e se for intencional (pedido de exclusão sob LGPD), o
--     caminho é decidir explicitamente o que fazer com as inscrições
--     dela — inclusive com a PROVA de consentimento que elas carregam.
--     O banco obriga essa decisão a ser tomada.
--
--   safra_id → RESTRICT. Idem: apagar uma safra que tem gente inscrita
--     apagaria o vínculo de quem pagou.
--
--   grupo_id → SET NULL. Apagar um horário é operação NORMAL da Giovana
--     ("ninguém quer quarta 19h, vou tirar"). As alunas daquele horário
--     não deixam de existir nem de ter pago — elas voltam para "sem
--     horário", que é um estado legítimo e visível no kanban. RESTRICT
--     aqui a obrigaria a esvaziar a coluna à mão antes de apagar, e ela
--     faria isso arrastando cards, que é exatamente o mesmo resultado
--     com mais trabalho e mais chance de erro.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. As DUAS uniques parciais — e as duas são necessárias
--
-- 3.1 Uma inscrição por pessoa por safra.
-- 3.2 Uma linha de lista de espera por pessoa.
--
-- A segunda não é redundante, e a razão é uma pegadinha do SQL: em
-- índice único, NULL não é igual a NULL. Com apenas a primeira, uma
-- pessoa poderia acumular N linhas de `safra_id = null` — porque cada
-- par (pessoa, null) é considerado distinto de todos os outros. Ela se
-- cadastraria dez vezes na lista de espera e o banco aceitaria as dez.
--
-- ⚠️ ESTAS DUAS SÃO O QUE PRODUZ A RESPOSTA DE DUPLICATA.
--
-- No modelo antigo, a resposta idêntica à de sucesso (REPORT §9.2)
-- nascia da unique violation de `waitlist.email`. Aqui `pessoas.email` é
-- resolvido por upsert e não viola nada — quem levanta `23505` são
-- estas duas. Se elas não existissem, o caminho de duplicata sumiria sem
-- ninguém perceber, porque o insert simplesmente daria certo duas vezes
-- e a pessoa apareceria duplicada na lista da Giovana.
-- ------------------------------------------------------------
create unique index if not exists inscricoes_pessoa_safra_idx
  on public.inscricoes (pessoa_id, safra_id)
  where safra_id is not null;

create unique index if not exists inscricoes_pessoa_espera_idx
  on public.inscricoes (pessoa_id)
  where safra_id is null;

-- ------------------------------------------------------------
-- 4. Índices de consulta
--
-- "Todas as inscrições desta safra" é a query mais frequente do painel,
-- e é por onde a Giovana monta os horários. "Todas as inscrições desta
-- pessoa" é a ficha da aluna.
-- ------------------------------------------------------------
create index if not exists inscricoes_safra_id_idx  on public.inscricoes (safra_id);
create index if not exists inscricoes_pessoa_id_idx on public.inscricoes (pessoa_id);
create index if not exists inscricoes_grupo_id_idx  on public.inscricoes (grupo_id);
create index if not exists inscricoes_status_idx    on public.inscricoes (status);

-- ------------------------------------------------------------
-- 5. A prova, e por que ela é redundante de propósito
--
-- `consent_text` copia a frase INTEIRA em cada linha. É redundância
-- deliberada, e a alternativa normalizada (tabela de versões + FK)
-- economizaria bytes e criaria o risco que a coluna existe para
-- eliminar: um UPDATE naquela tabela reescreveria retroativamente o que
-- todo mundo teria "aceitado".
--
--   PROVA NÃO SE NORMALIZA.
--
-- Os três campos são NULLABLE aqui pelo mesmo motivo do perfil: a `010`
-- traz linhas onde `consent` é nulo, e `null` significa "NÃO SABEMOS".
--
-- ⚠️ ZERO BACKFILL. Nunca escrever `true` nestas linhas. Aquelas pessoas
-- provavelmente marcaram alguma caixa, mas o banco não registrou, e
-- inventar `true` agora produziria um registro que afirma algo que
-- ninguém verificou. Consentimento presumido não é consentimento (LGPD
-- art. 5º, XII: a manifestação tem que ser livre, informada e
-- INEQUÍVOCA). O estado desconfortável é intencional: ele torna visível,
-- em qualquer consulta, exatamente quais contatos não têm base
-- documentada.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 6. Fechadura
-- ------------------------------------------------------------
alter table public.inscricoes enable row level security;
revoke all on public.inscricoes from anon, authenticated;

-- ------------------------------------------------------------
-- 7. Documentação
-- ------------------------------------------------------------
comment on table public.inscricoes is
  'O encontro entre uma PESSOA e uma SAFRA. Uma por pessoa por safra '
  '(unique parcial), mais no máximo uma de lista de espera por pessoa '
  '(segunda unique parcial — necessária porque NULL não é igual a NULL '
  'em índice único). Carrega vínculo, estado, perfil daquela safra e a '
  'prova de consentimento. Substitui public.waitlist. '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.inscricoes.safra_id is
  'Safra desta inscrição. NULO significa LISTA DE ESPERA: a pessoa se '
  'cadastrou sem safra aberta. Anda sempre em par com status — '
  'safra_id nulo <-> status = lista_espera, garantido pelo CHECK da 009.';

comment on column public.inscricoes.grupo_id is
  'Horário alocado, ou NULL para "sem horário ainda". ORTOGONAL AO '
  'STATUS (D-03): alocar não move estado e NÃO TOCA NO STRIPE — a aluna '
  'já pagou antes de ser alocada. É isso que torna o kanban seguro. '
  'on delete set null: apagar um horário é operação normal, e as alunas '
  'dele voltam para "sem horário" em vez de impedir a exclusão. '
  'O trigger da 009 garante que o grupo pertence à MESMA safra.';

comment on column public.inscricoes.status is
  'Estado da inscrição. SEM DEFAULT de propósito: um default '
  'transformaria "o servidor esqueceu de definir" em uma afirmação de '
  'negócio. Domínio no CHECK da 009.';

comment on column public.inscricoes.consent is
  'Se a pessoa marcou a caixa no ato do cadastro. NULL = "NÃO SABEMOS" — '
  'linha vinda da waitlist anterior ao registro probatório. NUNCA '
  'presuma true, nunca faça backfill: consentimento presumido não é '
  'consentimento (LGPD art. 5º, XII). Vale tudo-ou-nada com consent_at e '
  'consent_text — o CHECK que exige isso entra na 010, DEPOIS dos dados.';

comment on column public.inscricoes.consent_text is
  'A frase inteira que a pessoa tinha diante dos olhos, copiada em cada '
  'linha. Redundância DELIBERADA: a alternativa normalizada permitiria '
  'que um UPDATE reescrevesse retroativamente o que todos teriam aceito. '
  'Prova não se normaliza. Fonte única: CONSENT_TEXT, derivada de '
  'CONSENT_SEGMENTS em src/config/consentimento.ts.';

comment on column public.inscricoes.disponibilidade is
  'Dias em que a aluna pode assistir: subconjunto não-vazio de '
  'seg,ter,qua,qui,sex. Array e não cinco booleanos — a pergunta da '
  'Giovana é "quem pode terça?", que com array é uma expressão só e '
  'ainda usa índice GIN se um dia precisar. Domínio no CHECK da 009.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela nasceu VAZIA?
--    Esperado: 0. Se não for 0, alguma coisa escreveu antes da hora.
select count(*) as deve_ser_zero from public.inscricoes;

-- 2. Colunas certas, e NENHUMA travada (elas vêm na 015)?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'inscricoes'
order by ordinal_position;

-- 3. As três FKs, com o on delete certo de cada uma?
--    Esperado: pessoa_id → pessoas (r), safra_id → safras (r),
--              grupo_id → grupos (n)
--    'r' = restrict, 'n' = set null
select
  con.conname     as constraint_name,
  cl.relname      as aponta_para,
  con.confdeltype as on_delete
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.inscricoes'::regclass and con.contype = 'f'
order by con.conname;

-- 4. As DUAS uniques parciais existem?
--    Esperado: inscricoes_pessoa_safra_idx  ... WHERE (safra_id IS NOT NULL)
--              inscricoes_pessoa_espera_idx ... WHERE (safra_id IS NULL)
--    Se a segunda faltar, uma pessoa pode acumular N linhas de lista de
--    espera — e o caminho de duplicata da rota deixa de existir.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'inscricoes'
order by indexname;

-- 5. RLS ligada, sem policy, sem privilégio para anon/authenticated?
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'inscricoes') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'inscricoes';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'inscricoes'
  and grantee in ('anon', 'authenticated');

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os três.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <PESSOA> e <SAFRA> por ids reais.
-- ============================================================

-- A. Duas inscrições da mesma pessoa na mesma safra
--    → erro em inscricoes_pessoa_safra_idx
-- insert into public.inscricoes (pessoa_id, safra_id, status) values
--   ('<PESSOA>', '<SAFRA>', 'pendente_pagamento'),
--   ('<PESSOA>', '<SAFRA>', 'pendente_pagamento');

-- B. Duas linhas de lista de espera da mesma pessoa
--    → erro em inscricoes_pessoa_espera_idx
--    ⚠️ ESTE é o que a primeira unique NÃO pega. Se passar, a segunda
--    unique não entrou.
-- insert into public.inscricoes (pessoa_id, safra_id, status) values
--   ('<PESSOA>', null, 'lista_espera'),
--   ('<PESSOA>', null, 'lista_espera');

-- C. Apagar pessoa com inscrição → erro na FK (restrict)
-- delete from public.pessoas where id = '<PESSOA>';
