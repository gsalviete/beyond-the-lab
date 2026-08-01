-- ============================================================
-- Beyond The Lab — turmas (coortes) e campos de perfil
--
-- Duas mudanças, e elas são independentes uma da outra:
--
--   1. Nasce `public.turmas`. Datas, valor, duração e a janela de
--      inscrição saem do código e passam a morar no banco, para a
--      cliente abrir e fechar turma sem deploy.
--   2. `public.waitlist` ganha a FK para a turma, o rótulo de grupo e
--      os quatro campos de perfil que a cliente usa para montar os
--      grupos de horário.
--
-- A `waitlist` JÁ TEM DADOS: nada aqui apaga, recria ou reescreve linha
-- existente. Todo ALTER é aditivo, toda coluna nova é nullable, e o
-- único UPDATE é o backfill do fim — que só toca em linha com
-- `turma_id is null`.
--
-- Ambas as tabelas ficam com RLS ligada e ZERO policies, de propósito:
-- todo acesso é server-side com a service_role, que ignora RLS. Não
-- crie policy — isso abriria as tabelas para a chave anon.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ============================================================
-- 1. TURMAS
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 A tabela
--
-- Uma linha por safra. Nunca se edita uma turma para "virar" a
-- seguinte: turma nova é linha nova. Isso é o que mantém o histórico
-- de quem entrou em qual coorte, e o que permite ao Prompt B2 saber
-- qual `trial_end` cada assinatura recebeu.
--
-- `data_*` são `date` e não `timestamptz`: é dia de calendário, não
-- instante. "28 de agosto" é 28 de agosto em qualquer fuso, e guardar
-- como timestamp abriria a porta para o clássico erro de virar dia 27
-- ao formatar em UTC-3.
-- ------------------------------------------------------------
create table if not exists public.turmas (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null,
  slug                    text not null unique,
  data_inicio_aulas       date not null,
  data_primeira_cobranca  date not null,
  valor_mensal            numeric(10,2) not null,
  duracao_meses           integer not null,
  inscricoes_abertas      boolean not null default false,
  created_at              timestamptz not null default now()
);

-- Cobrar depois da aula começar seria erro de digitação virando
-- problema de negócio. O banco recusa.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'turmas_cobranca_antes_das_aulas_check'
  ) then
    alter table public.turmas
      add constraint turmas_cobranca_antes_das_aulas_check
      check (data_primeira_cobranca <= data_inicio_aulas);
  end if;
end $$;

-- ------------------------------------------------------------
-- 1.2 Índice parcial: no máximo UMA turma aberta
--
-- `((true))` como expressão indexada com `where inscricoes_abertas`:
-- toda linha aberta indexa o mesmo valor, então a segunda viola o
-- unique. Linhas fechadas ficam fora do índice e não se estorvam.
--
-- Por que isso importa: a aplicação pergunta "qual é a turma aberta?"
-- e espera zero ou uma resposta. Com duas abertas a pergunta não teria
-- resposta única — a rota pegaria uma qualquer, e o Stripe do Prompt B2
-- criaria assinaturas com o `trial_end` da turma errada, cobrando gente
-- na data de outra safra. Melhor o Studio recusar o UPDATE na hora do
-- que descobrir isso numa fatura.
--
-- Consequência prática para a cliente: para abrir a turma seguinte,
-- fecha a atual primeiro. Está documentado no README.
-- ------------------------------------------------------------
create unique index if not exists turmas_uma_aberta_idx
  on public.turmas ((true)) where inscricoes_abertas;

-- ------------------------------------------------------------
-- 1.3 Fechadura
--
-- Mesmo padrão da `waitlist`: RLS ligada e nenhuma policy. Sem policy,
-- RLS nega tudo — anon e authenticated não leem nem escrevem nada. O
-- `revoke` é o cinto de segurança além do suspensório: mesmo que
-- alguém crie uma policy por engano no futuro, sem privilégio de tabela
-- não há acesso.
-- ------------------------------------------------------------
alter table public.turmas enable row level security;

revoke all on public.turmas from anon, authenticated;

-- ------------------------------------------------------------
-- 1.4 Documentação
-- ------------------------------------------------------------
comment on table public.turmas is
  'Coortes do Beyond The Lab: uma linha por safra de alunas. Cada turma '
  'tem identidade própria — data de início das aulas, data da primeira '
  'cobrança, valor, duração e a janela de inscrição (inscricoes_abertas). '
  'Turma nova é SEMPRE linha nova; nunca se edita uma turma para virar a '
  'seguinte, senão o histórico de quem entrou em qual coorte se perde. '
  'NÃO CONFUNDIR COM GRUPO: grupo (waitlist.grupo) é a subdivisão de '
  'horário DENTRO de uma turma ("Grupo A", "Grupo B"), montada à mão pela '
  'professora conforme nível e disponibilidade. Grupo é só um rótulo — '
  'não tem data, não tem cobrança, não tem regra de negócio, e por isso '
  'não tem tabela. RLS ligada sem policies: acesso exclusivo server-side '
  'via service_role.';

comment on column public.turmas.slug is
  'Identificador estável e legível, ex.: setembro-2026. Unique. Usado '
  'no on conflict do seed e como referência humana em log e suporte.';

comment on column public.turmas.data_primeira_cobranca is
  'Dia da primeira cobrança. Vira o trial_end da assinatura do Stripe '
  'no Prompt B2. CHECK garante que nunca é depois do início das aulas.';

comment on column public.turmas.inscricoes_abertas is
  'A janela de inscrição desta turma. É esta coluna que a professora '
  'liga e desliga no Studio para abrir e fechar inscrição, sem deploy. '
  'No máximo UMA turma pode estar aberta por vez — garantido pelo '
  'índice parcial turmas_uma_aberta_idx. Com nenhuma aberta, o site '
  'passa a capturar lista de espera (waitlist.status = lista_espera).';

-- ============================================================
-- 2. WAITLIST — vínculo com a turma
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 turma_id e grupo
--
-- `turma_id` é NULLABLE de propósito, e isso não é frouxidão: quem se
-- cadastra com as inscrições fechadas não pertence a turma nenhuma
-- ainda. Nulo aqui significa exatamente "lista de espera", e anda de
-- par com status = 'lista_espera'.
--
-- `on delete restrict`: apagar uma turma que tem inscrição é sempre
-- engano. O banco recusa e a professora tem que decidir explicitamente
-- o que fazer com as pessoas antes.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists turma_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_turma_id_fkey'
  ) then
    alter table public.waitlist
      add constraint waitlist_turma_id_fkey
      foreign key (turma_id) references public.turmas(id) on delete restrict;
  end if;
end $$;

alter table public.waitlist
  add column if not exists grupo text;

-- "Todas as inscrições da turma X" é a query mais frequente do painel
-- do Prompt C, e é por onde a professora monta os grupos.
create index if not exists waitlist_turma_id_idx
  on public.waitlist (turma_id);

-- ------------------------------------------------------------
-- 2.2 status ganha 'lista_espera'
--
-- A constraint é RECRIADA, não duplicada: dois CHECK sobre a mesma
-- coluna valem em conjunto (AND), então acrescentar um segundo com o
-- valor novo não afrouxaria nada — o antigo continuaria barrando
-- 'lista_espera'. Drop + add é o único caminho.
--
-- O drop é seguro porque o CHECK novo é um SUPERCONJUNTO do antigo:
-- nenhuma linha existente pode reprovar nele.
-- ------------------------------------------------------------
alter table public.waitlist
  drop constraint if exists waitlist_status_check;

alter table public.waitlist
  add constraint waitlist_status_check
  check (status in (
    'lista_espera',  -- cadastro feito com as inscrições fechadas; sem turma
    'pendente',      -- inscrita numa turma, nada cobrado ainda
    'agendado',      -- assinatura criada em trial, cobrança marcada (B2)
    'ativo',         -- primeira cobrança confirmada (B2)
    'falhou',        -- cobrança recusada (B2)
    'cancelado'      -- desistência ou assinatura cancelada
  ));

-- ============================================================
-- 3. WAITLIST — campos de perfil
--
-- Todos NULLABLE, sem exceção: as linhas que já estão na tabela foram
-- gravadas por um formulário que não perguntava nada disso, e um
-- `not null` faria o ALTER falhar inteiro. Quem exige o preenchimento
-- é o Zod de /api/waitlist — toda escrita nova passa por lá e sempre
-- traz os quatro campos.
--
-- Os CHECK abaixo são `x is null or ...`: eles validam o DOMÍNIO do
-- valor quando ele existe, sem tornar o valor obrigatório. É a divisão
-- certa — o banco cuida de "este valor faz sentido?", a aplicação cuida
-- de "este campo foi preenchido?".
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 nivel_ingles
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists nivel_ingles text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_nivel_ingles_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_nivel_ingles_check
      check (nivel_ingles is null
             or nivel_ingles in ('basico', 'intermediario', 'avancado'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3.2 curso e periodo
--
-- `periodo` é TEXT e não integer de propósito. As respostas reais não
-- são números: "3º", "formada", "trancado", "último ano". Um integer
-- forçaria a interface a inventar um código para cada uma dessas, e a
-- professora perderia a informação que ela de fato usa.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists curso text;

alter table public.waitlist
  add column if not exists periodo text;

-- ------------------------------------------------------------
-- 3.3 disponibilidade
--
-- Array de dias e não cinco colunas booleanas. O que a professora faz
-- com isso é filtrar — "quem pode terça?" — e com array a pergunta é
-- uma expressão só, que ainda por cima usa índice GIN se um dia
-- precisar:
--     select * from waitlist where disponibilidade @> array['ter'];
-- Com cinco booleanos seriam cinco colunas para manter em sincronia e
-- uma migração a cada dia novo (sábado, por exemplo).
--
-- O CHECK cobre as duas coisas que podem dar errado num text[]:
--   - elemento fora do domínio: `<@` garante que TODO elemento do
--     array está contido no conjunto permitido;
--   - array vazio: `{}` não é null e passaria despercebido em qualquer
--     validação de nulidade, virando "inscrita sem nenhum dia" — que é
--     justamente o estado que o formulário proíbe.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists disponibilidade text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_disponibilidade_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_disponibilidade_check
      check (disponibilidade is null
             or (cardinality(disponibilidade) >= 1
                 and disponibilidade <@ array['seg','ter','qua','qui','sex']::text[]));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3.4 Documentação das colunas novas
-- ------------------------------------------------------------
comment on column public.waitlist.turma_id is
  'Turma (coorte) a que esta inscrição pertence. NULO significa lista '
  'de espera: a pessoa se cadastrou com as inscrições fechadas e ainda '
  'não pertence a safra nenhuma. Anda sempre junto com status: '
  'turma_id nulo <-> status = lista_espera. on delete restrict — o '
  'banco recusa apagar turma que tenha inscrição.';

comment on column public.waitlist.grupo is
  'Subdivisão de HORÁRIO dentro da turma, ex.: "Grupo A", "Grupo B". '
  'Rótulo livre, preenchido À MÃO pela professora depois da inscrição, '
  'olhando nivel_ingles e disponibilidade. Não afeta cobrança, não tem '
  'data e não tem regra de negócio — não confundir com turma_id.';

comment on column public.waitlist.nivel_ingles is
  'Nível declarado pela própria aluna no formulário: basico, '
  'intermediario ou avancado (sem acento, minúsculo). Autodeclarado — '
  'não é resultado de avaliação. Usado junto com disponibilidade para '
  'montar os grupos.';

comment on column public.waitlist.curso is
  'Curso da faculdade, texto livre como digitado pela aluna. '
  'Ex.: "Biomedicina", "Medicina Veterinária".';

comment on column public.waitlist.periodo is
  'Período/semestre, TEXTO livre e não número: as respostas reais '
  'incluem "3º", "formada", "trancado", "último ano". Máx. 40 chars '
  'pela validação da API.';

comment on column public.waitlist.disponibilidade is
  'Dias da semana em que a aluna pode assistir: subconjunto não-vazio '
  'de seg, ter, qua, qui, sex. Para filtrar no Studio ao montar os '
  'grupos: where disponibilidade @> array[''ter'']. CHECK barra tanto '
  'elemento fora do domínio quanto array vazio.';

-- ============================================================
-- 4. SEED — a turma que já existe de fato
--
-- Estes são os valores que hoje estão fixos em src/config/curso.ts e
-- que esta migração está justamente tirando do código. Depois de rodar
-- aqui, aquelas constantes somem: o banco vira a fonte de verdade.
--
-- ⚠️ data_inicio_aulas = 2026-09-01 é PROVISÓRIA — o dia exato ainda
-- não foi confirmado pela cliente. Quando fechar, é um UPDATE nesta
-- linha no Studio, sem deploy. Era esse o ponto de tudo isto.
--
-- `on conflict (slug) do nothing`: rodar a migração de novo não
-- duplica nem sobrescreve uma turma que já teve as datas ajustadas à
-- mão. O slug é a chave de identidade para este fim.
-- ============================================================
insert into public.turmas (
  nome,
  slug,
  data_inicio_aulas,
  data_primeira_cobranca,
  valor_mensal,
  duracao_meses,
  inscricoes_abertas
) values (
  'Turma Setembro 2026',
  'setembro-2026',
  '2026-09-01',
  '2026-08-28',
  299.99,
  6,
  true
)
on conflict (slug) do nothing;

-- ============================================================
-- 5. BACKFILL
--
-- Todas as inscrições que já existem são desta turma — foram feitas
-- quando ela era a única coisa que existia. Sem isto elas ficariam
-- indistinguíveis de lista de espera.
--
-- `where turma_id is null` é o que torna o UPDATE idempotente e o que
-- protege quem já foi atribuído a outra turma numa rodada anterior.
-- ============================================================
update public.waitlist w
set turma_id = t.id
from public.turmas t
where t.slug = 'setembro-2026'
  and w.turma_id is null;

commit;


-- ============================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO — rode separado, depois do commit
-- ============================================================

-- 1. A turma existe, com as datas e o valor certos?
--    Esperado: 1 linha, setembro-2026, 2026-09-01, 2026-08-28,
--              299.99, 6, inscricoes_abertas = true
select nome, slug, data_inicio_aulas, data_primeira_cobranca,
       valor_mensal, duracao_meses, inscricoes_abertas
from public.turmas
order by created_at;

-- 2. O backfill pegou TODAS as linhas antigas?
--    Esperado: sem_turma = 0, com_turma = total
select
  count(*)                                   as total,
  count(*) filter (where turma_id is null)   as sem_turma,
  count(*) filter (where turma_id is not null) as com_turma
from public.waitlist;

-- 3. As colunas novas entraram, todas nullable?
--    Esperado: turma_id / uuid / YES
--              grupo, nivel_ingles, curso, periodo / text / YES
--              disponibilidade / ARRAY / YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'waitlist'
  and column_name in ('turma_id','grupo','nivel_ingles','curso','periodo','disponibilidade')
order by column_name;

-- 4. O CHECK de status aceita 'lista_espera' agora?
--    Esperado: 1 linha, e a definição contendo lista_espera
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.waitlist'::regclass
  and conname = 'waitlist_status_check';

-- 5. Não sobrou constraint de status duplicada?
--    Esperado: 1 (e não 2)
select count(*) as constraints_de_status
from pg_constraint
where conrelid = 'public.waitlist'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%status%';

-- 6. O índice de turma única está lá?
--    Esperado: 1 linha, turmas_uma_aberta_idx, UNIQUE ... WHERE inscricoes_abertas
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'turmas';

-- 7. RLS ligada e SEM policy nas duas tabelas?
--    Esperado: turmas / true / 0  e  waitlist / true / 0
select
  c.relname                        as tabela,
  c.relrowsecurity                 as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('turmas','waitlist')
order by c.relname;

-- 8. anon e authenticated não têm privilégio nenhum em turmas?
--    Esperado: ZERO linhas
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'turmas'
  and grantee in ('anon','authenticated');


-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os três
-- Rode um de cada vez. Todos devem dar erro; se algum passar,
-- a migração não ficou como deveria.
-- ============================================================

-- A. Segunda turma aberta → erro de unique em turmas_uma_aberta_idx
-- insert into public.turmas
--   (nome, slug, data_inicio_aulas, data_primeira_cobranca,
--    valor_mensal, duracao_meses, inscricoes_abertas)
-- values ('Turma Teste', 'turma-teste', '2027-03-01', '2027-02-25',
--         299.99, 6, true);

-- B. Cobrança depois do início das aulas → erro no CHECK
-- insert into public.turmas
--   (nome, slug, data_inicio_aulas, data_primeira_cobranca,
--    valor_mensal, duracao_meses)
-- values ('Turma Teste 2', 'turma-teste-2', '2027-03-01', '2027-03-10', 299.99, 6);

-- C. Dia inválido e array vazio → erro no CHECK de disponibilidade
-- update public.waitlist set disponibilidade = array['sab'] where true;
-- update public.waitlist set disponibilidade = array[]::text[] where true;
