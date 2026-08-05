-- ============================================================
-- Beyond The Lab — `pessoas`: o contato, separado da inscrição
--
-- ⛔ Não rode em produção antes do staging de dados. Ver o pré-requisito
--    na abertura do corte 1 em `docs/04-PLANO.md`.
--
-- O PROBLEMA QUE ESTA TABELA RESOLVE
--
-- `waitlist` faz três trabalhos numa tabela só: é a PESSOA, é o VÍNCULO
-- com a safra, e vai virar o ESTADO DE PAGAMENTO. Funciona enquanto o
-- único ato é gravar uma linha. Quebra em três lugares previsíveis:
--
--   1. `email` é unique NA INSCRIÇÃO. Uma aluna de janeiro não consegue
--      se inscrever em julho — o banco recusa, e o formulário responde
--      "sucesso" (porque duplicata responde igual a sucesso), então ela
--      acha que se inscreveu e não se inscreveu. É o pior desfecho
--      possível: silencioso dos dois lados.
--   2. Não há onde pendurar estado de assinatura sem misturar dado
--      pessoal com estado financeiro na mesma linha.
--   3. Não há como uma pessoa EXISTIR SEM INSCRIÇÃO — que é exatamente
--      o que a base atual virou: gente que se cadastrou quando não
--      havia compra possível.
--
-- A MUDANÇA QUE DESTRAVA TUDO
--
--   O unique de e-mail SAI da inscrição e VEM PARA CÁ.
--
-- A partir daí uma pessoa existe uma vez, para sempre, e se inscreve em
-- quantas safras quiser. O que impede inscrição repetida na MESMA safra
-- passa a ser um unique parcial em `inscricoes` (ver `008`).
--
-- ⚠️ CONSEQUÊNCIA NO CAMINHO DE DUPLICATA — ler antes de mexer na rota.
--
-- Hoje a resposta idêntica à de sucesso (REPORT §9.2) nasce da unique
-- violation de `waitlist.email`: o insert falha com `23505` e a rota
-- traduz isso em 200. No modelo novo, `pessoas.email` é resolvido por
-- UPSERT e não viola nada — quem passa a levantar `23505` são as duas
-- uniques parciais de `inscricoes`.
--
-- **Nada sobre o upsert de `pessoas` pode revelar se o e-mail já
-- existia** — nem status HTTP, nem mensagem, nem e-mail disparado, nem
-- tempo de resposta perceptível. Responder diferente transformaria o
-- formulário num oráculo de "este e-mail está no banco?", que é
-- exatamente o que a resposta genérica existe para impedir.
--
-- O QUE NÃO ESTÁ AQUI: `token_acesso` e `token_expira_em`.
--
-- Eles pertencem a esta tabela no modelo (D-10, link de retorno), e
-- entram na migração `016`, no corte 2 (`c51`), junto da rota que os
-- consome. Criar coluna de token agora significaria ter no banco um
-- campo de identificação que nenhum código lê nem expira — e token sem
-- consumidor é token sem rotação.
--
-- RLS ligada e ZERO policies. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- Só o contato. Nada de perfil (nível de inglês, curso, período,
-- disponibilidade) — aquilo descreve a pessoa NAQUELA safra e pode
-- mudar entre uma e outra: quem se inscreveu no 3º período em janeiro
-- está no 5º em julho, e o nível de inglês, com sorte, mudou também.
-- Perfil mora em `inscricoes`.
--
-- `nome` e `telefone` ficam aqui e são sobrescritos a cada inscrição
-- nova, de propósito: o dado mais recente é o que serve para falar com
-- a pessoa. Se um dia importar saber o telefone que ela tinha na
-- inscrição de janeiro, aí é coluna em `inscricoes` — mas ninguém
-- precisou disso ainda, e o WhatsApp do grupo usa o número de agora.
--
-- `email` e `telefone` são `not null` sem medo: a tabela nasce vazia e
-- o `c17` só produz linha a partir de `waitlist`, onde os dois campos
-- sempre existiram e sempre foram obrigatórios.
-- ------------------------------------------------------------
create table if not exists public.pessoas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null,
  telefone    text not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. O unique de e-mail — a chave de identidade da pessoa
--
-- Índice único sobre `lower(email)`, e não sobre `email`.
--
-- ⚠️ Isto é uma decisão, não um detalhe. O Postgres compara texto com
-- diferença de caixa: 'Maria@x.com' e 'maria@x.com' são duas linhas
-- distintas num unique comum, e seriam duas pessoas para o sistema.
--
-- A aplicação já normaliza — o Zod da rota tem `.toLowerCase()` — mas
-- validação na aplicação é uma promessa sobre qual código está rodando,
-- e o incidente da `004` é a prova de que essa promessa quebra em
-- silêncio (um build antigo continuou no ar depois da migração). O
-- índice funcional é o fato: nenhum build, atual ou velho, consegue
-- criar as duas.
--
-- Consequência prática: toda consulta por e-mail precisa usar
-- `where lower(email) = lower($1)` para aproveitar o índice.
-- ------------------------------------------------------------
create unique index if not exists pessoas_email_lower_idx
  on public.pessoas (lower(email));

-- ------------------------------------------------------------
-- 3. Fechadura
-- ------------------------------------------------------------
alter table public.pessoas enable row level security;
revoke all on public.pessoas from anon, authenticated;

-- ------------------------------------------------------------
-- 4. Documentação
-- ------------------------------------------------------------
comment on table public.pessoas is
  'O CONTATO, uma linha por pessoa, para sempre. Separada de inscricoes '
  'porque a mesma pessoa pode se inscrever em várias safras — o unique de '
  'e-mail saiu da inscrição e veio para cá, e é essa mudança que destrava '
  'a aluna de janeiro poder se inscrever em julho. '
  'Guarda só contato: perfil (nível, curso, período, disponibilidade) '
  'descreve a pessoa NAQUELA safra e mora em inscricoes. '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.pessoas.email is
  'Chave de identidade da pessoa. Unique por lower(email) — o índice é '
  'FUNCIONAL de propósito: o Postgres distingue caixa, e Maria@x.com e '
  'maria@x.com virariam duas pessoas. A rota já normaliza, mas validação '
  'na aplicação é promessa sobre qual build está no ar (ver migração 004); '
  'o índice é fato. Consulte com where lower(email) = lower($1).';

comment on column public.pessoas.nome is
  'Sobrescrito a cada inscrição nova: o dado mais recente é o que serve '
  'para falar com a pessoa. Não é histórico.';

comment on column public.pessoas.telefone is
  'E.164, ex.: +5521999999999. Formato que a API do WhatsApp entende sem '
  'reprocessar — e o WhatsApp é como o grupo da turma é montado. '
  'Normalizado por src/lib/telefone.ts, que roda no cliente e no servidor '
  'a partir do mesmo arquivo. Sobrescrito a cada inscrição nova.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. Colunas certas, e NENHUMA de token (elas vêm na 016)?
--    Esperado: id, nome, email, telefone, created_at. Só isso.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'pessoas'
order by ordinal_position;

-- 2. O unique é FUNCIONAL, sobre lower(email)?
--    Esperado: pessoas_email_lower_idx com "lower(email)" na definição.
--    Se aparecer só "(email)", a caixa volta a criar pessoas duplicadas.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'pessoas'
order by indexname;

-- 3. RLS ligada, sem policy, sem privilégio para anon/authenticated?
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'pessoas') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'pessoas';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pessoas'
  and grantee in ('anon', 'authenticated');

-- 4. Quantas pessoas o c17 vai precisar criar?
--    Guarde este número: o c19 confere que ele bate com count(pessoas).
--    ⚠️ Se `distinto` for menor que `total`, existem e-mails que diferem
--    só na caixa e o c17 vai precisar decidir o que fazer com eles.
select
  count(*)                          as total_waitlist,
  count(distinct lower(email))      as emails_distintos
from public.waitlist;

-- ============================================================
-- TESTE DE BARREIRA — o banco tem que RECUSAR.
--
-- ⚠️ Comentado de propósito: é CONTRAEXEMPLO, não regra.
-- ============================================================

-- A. Mesmo e-mail em caixa diferente → erro em pessoas_email_lower_idx.
--    Se este insert PASSAR, o índice ficou sobre `email` e não sobre
--    `lower(email)`, e o modelo tem duas pessoas onde deveria ter uma.
-- insert into public.pessoas (nome, email, telefone) values
--   ('Teste A', 'teste@exemplo.com', '+5521999999999'),
--   ('Teste B', 'TESTE@exemplo.com', '+5521999999998');
