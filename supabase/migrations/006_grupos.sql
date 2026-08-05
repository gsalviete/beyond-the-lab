-- ============================================================
-- Beyond The Lab — `grupos`: o horário dentro da safra
--
-- ⛔ Não rode em produção antes do staging de dados. Ver o pré-requisito
--    na abertura do corte 1 em `docs/04-PLANO.md`.
--
-- O QUE ESTA TABELA SUBSTITUI
--
-- `waitlist.grupo`, uma coluna `text` livre onde a professora escrevia
-- "Grupo A" à mão. Funcionava enquanto grupo era um rótulo. Deixou de
-- funcionar quando virou uma coisa que a Giovana precisa criar, listar,
-- desativar e para a qual precisa arrastar alunas num kanban.
--
-- ⚠️ A COLUNA ANTIGA NÃO É MIGRADA. Ela fica na `waitlist_legado` (ver
-- `011`) e não vira `grupo_id` em lugar nenhum. Motivos:
--
--   - as linhas legadas vão todas para `safra_id = null` (lista de
--     espera), e grupo pertence a uma safra — um grupo sem safra não
--     existe neste modelo;
--   - o conteúdo é texto livre digitado à mão, sem correspondência
--     garantida com nenhum horário real de agora.
--
-- ⚠️ ANTES DE APAGAR A `waitlist_legado` (c79), rode e olhe:
--       select grupo, count(*) from public.waitlist_legado group by 1;
--   Se a Giovana usou o campo, aquilo é informação de alocação que ela
--   vai querer, e a decisão de descartar deixa de ser automática.
--
-- O QUE ESTA TABELA **NÃO** TEM, E É O PONTO (D-01)
--
-- Sem data. Sem valor. Sem duração. O pool de aulas começa no mesmo dia
-- para todo mundo da safra; a divisão por dia da semana é logística de
-- agenda, não de contrato. Modelar grupo com calendário próprio
-- triplicaria o modelo, o painel e o suporte para representar uma
-- diferença que não existe.
--
--   Se um dia aparecer a vontade de pôr `data_inicio` aqui, a pergunta
--   certa não é "cabe?" — é "esta é outra safra?". Quase sempre é.
--
-- RLS ligada e ZERO policies, como todas as outras: acesso exclusivo
-- server-side via service_role. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- `on delete restrict` na FK: apagar uma safra que tem grupo é sempre
-- engano. Mesmo raciocínio da FK de `waitlist` na `002` — o banco
-- recusa e obriga a decidir explicitamente o que fazer com o que está
-- pendurado antes.
--
-- `dia_semana` e `horario` são text, e `horario` é text de propósito:
-- ele é rótulo de agenda ("19:00"), não instante. Um `time` obrigaria a
-- pensar em fuso para representar "a aula é sete da noite", que é a
-- mesma sete da noite para todo mundo porque as aulas são no Meet e
-- todas as alunas estão no Brasil. Um `time with time zone` seria pior
-- ainda: o Postgres o desaconselha justamente por não carregar data e,
-- portanto, não saber sobre horário de verão.
--
-- `capacidade` nullable, `null` = sem limite — mesma convenção de
-- `safras.vagas_total`, e pela mesma razão: zero é um grupo lotado de
-- propósito, null é um grupo que não controla lotação.
-- ------------------------------------------------------------
create table if not exists public.grupos (
  id          uuid primary key default gen_random_uuid(),
  safra_id    uuid not null references public.safras(id) on delete restrict,
  dia_semana  text not null,
  horario     text not null,
  capacidade  integer,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Domínio de `dia_semana`
--
-- Os mesmos cinco valores de `waitlist.disponibilidade` (migração 002)
-- e de `VALORES_DIA_SEMANA` em `src/config/dominio.ts`. Não é
-- coincidência mantida por disciplina: o teste `tests/dominio.test.ts`
-- compara esta lista com a do módulo e reprova se divergirem.
--
-- ⚠️ O que aquele teste NÃO garante é que o banco EM PRODUÇÃO concorda
-- com o repositório. Ele compara dois arquivos versionados. A distância
-- entre repositório e produção é exatamente o incidente da `004`.
--
-- Sábado e domingo nunca estiveram no formulário nem no CHECK: as aulas
-- são à noite, em dia de semana. Se um dia entrarem, entram nos três
-- lugares de uma vez — aqui, no domínio e no CHECK da `disponibilidade`.
--
-- `not valid` como todo CHECK novo deste corte. A tabela nasce vazia, o
-- que torna `not valid` e validado equivalentes AGORA; a forma é
-- mantida por consistência com o resto e porque o custo é zero.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'grupos_dia_semana_check'
  ) then
    alter table public.grupos
      add constraint grupos_dia_semana_check
      check (dia_semana in ('seg', 'ter', 'qua', 'qui', 'sex'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'grupos_capacidade_check'
  ) then
    alter table public.grupos
      add constraint grupos_capacidade_check
      check (capacidade is null or capacidade >= 0)
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Um horário não se repete dentro da mesma safra
--
-- Dois "segunda 19h" na mesma safra é sempre erro de cadastro — e é um
-- erro que só aparece no kanban, quando a Giovana vê duas colunas
-- iguais e não sabe em qual arrastar a aluna.
--
-- Índice único e não constraint: a forma é a mesma, e índice é o que
-- permite a variante parcial se um dia for preciso (por exemplo,
-- ignorar grupos inativos). Hoje não é — um grupo desativado ainda
-- ocupa o horário no calendário da professora.
-- ------------------------------------------------------------
create unique index if not exists grupos_safra_dia_horario_idx
  on public.grupos (safra_id, dia_semana, horario);

-- Consulta mais frequente do painel: "quais horários desta safra?".
create index if not exists grupos_safra_id_idx
  on public.grupos (safra_id);

-- ------------------------------------------------------------
-- 4. Fechadura — igual às outras duas tabelas
--
-- Sem policy, RLS nega tudo: `anon` e `authenticated` não leem nem
-- escrevem nada. A `service_role` ignora RLS, e é por isso que a tabela
-- pode ficar sem policy nenhuma. O `revoke` é o cinto além do
-- suspensório: mesmo que alguém crie uma policy por engano no futuro,
-- sem privilégio de tabela não há acesso.
-- ------------------------------------------------------------
alter table public.grupos enable row level security;
revoke all on public.grupos from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Documentação
-- ------------------------------------------------------------
comment on table public.grupos is
  'HORÁRIOS dentro de uma safra: "segunda 19h", "quarta 19h". '
  'Substitui a coluna livre waitlist.grupo. '
  'NÃO TEM data, valor nem duração, de propósito (D-01): o pool de aulas '
  'começa no mesmo dia para toda a safra, e a divisão por dia da semana é '
  'logística de agenda, não de contrato. Se aparecer a vontade de pôr '
  'data aqui, a pergunta certa é "isto não é outra safra?". '
  'Na UI da Giovana aparece como "Horário". '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.grupos.safra_id is
  'Safra a que este horário pertence. on delete restrict — o banco '
  'recusa apagar safra que tenha horário pendurado.';

comment on column public.grupos.horario is
  'Rótulo de agenda, ex.: "19:00". TEXT e não time: é o horário da aula '
  'no relógio de todo mundo (aulas no Meet, alunas no Brasil), não um '
  'instante com fuso. time with time zone seria pior — não carrega data '
  'e por isso não sabe sobre horário de verão.';

comment on column public.grupos.capacidade is
  'Limite de alunas neste horário. NULL = SEM LIMITE (não é zero). '
  'Mesma convenção de safras.vagas_total.';

comment on column public.grupos.ativo is
  'Horário desativado some da alocação mas continua ocupando o par '
  '(dia_semana, horario) da safra — o índice único não ignora inativos, '
  'porque o horário segue tomado no calendário da professora.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela existe com as colunas certas, e nenhuma de calendário?
--    Esperado: id, safra_id, dia_semana, horario, capacidade, ativo,
--    created_at. NENHUMA coluna de data, valor ou duração.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'grupos'
order by ordinal_position;

-- 2. A FK aponta para `safras` (e não para `turmas`)?
--    Esperado: 1 linha, grupos_safra_id_fkey → safras, RESTRICT
select
  con.conname                         as constraint_name,
  cl.relname                          as aponta_para,
  con.confdeltype                     as on_delete  -- 'r' = restrict
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.grupos'::regclass and con.contype = 'f';

-- 3. Os CHECKs e o índice único entraram?
--    Esperado: grupos_capacidade_check, grupos_dia_semana_check
--    (convalidated = false é o esperado, ver comentário da 004)
select conname, convalidated as ja_validou_o_passado, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.grupos'::regclass and contype = 'c'
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'grupos'
order by indexname;

-- 4. RLS ligada, sem policy, e sem privilégio para anon/authenticated?
--    Esperado: true / 0, e ZERO linhas na segunda query
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'grupos') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'grupos';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'grupos'
  and grantee in ('anon', 'authenticated');

-- 5. Quanto a `waitlist.grupo` guarda, para a decisão do c79?
--    Rode antes de aposentar a tabela legada. Se houver conteúdo real,
--    é informação de alocação que a Giovana vai querer.
select grupo, count(*) as linhas
from public.waitlist
group by grupo
order by linhas desc;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os quatro.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <SAFRA> por um id real de public.safras.
-- ============================================================

-- A. Dia fora do domínio → erro em grupos_dia_semana_check
-- insert into public.grupos (safra_id, dia_semana, horario)
-- values ('<SAFRA>', 'sab', '19:00');

-- B. Capacidade negativa → erro em grupos_capacidade_check
-- insert into public.grupos (safra_id, dia_semana, horario, capacidade)
-- values ('<SAFRA>', 'seg', '19:00', -1);

-- C. Horário repetido na mesma safra → erro em grupos_safra_dia_horario_idx
-- insert into public.grupos (safra_id, dia_semana, horario)
-- values ('<SAFRA>', 'seg', '19:00'), ('<SAFRA>', 'seg', '19:00');

-- D. Apagar safra com grupo → erro na FK (restrict)
-- delete from public.safras where id = '<SAFRA>';
