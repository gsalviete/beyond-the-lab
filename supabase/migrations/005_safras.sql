-- ============================================================
-- Beyond The Lab — `turmas` vira `safras`, e ganha vaga e preço no Stripe
--
-- ⛔ NÃO RODE ISTO EM PRODUÇÃO ANTES DE `006`–`009` PASSAREM NO STAGING
--    DE DADOS. Ver o pré-requisito na abertura do corte 1 em
--    `docs/04-PLANO.md`. Branch `staging` e Preview da Vercel isolam
--    código, não banco.
--
-- POR QUE RENOMEAR
--
-- "Turma" acumulou dois sentidos que o produto precisa separar. Hoje
-- `turmas` é a coorte inteira (setembro/2026, com data, preço e
-- duração) e `waitlist.grupo` é o horário dentro dela ("Grupo A"). As
-- duas coisas se chamam "turma" em conversa, e é por isso que a coluna
-- `grupo` precisou de um comentário de seis linhas na `002` avisando
-- para não confundir.
--
-- O vocabulário novo (D-01) resolve isso:
--
--   SAFRA  — a leva. Tem calendário e preço. É esta tabela.
--   GRUPO  — um horário dentro dela. Sem calendário, sem preço. É a
--            tabela da `006`.
--
-- Na UI da Giovana, "safra" aparece como **Turma** e "grupo" como
-- **Horário** — o vocabulário técnico não sobe para a tela dela.
--
-- POR QUE `RENAME` E NÃO UMA TABELA NOVA
--
-- `alter table ... rename` é uma operação de CATÁLOGO: o Postgres troca
-- o nome e pronto. Não copia linha, não reescreve página em disco, não
-- invalida a FK que `waitlist.turma_id` mantém — a chave estrangeira
-- aponta para o OID da tabela, não para o nome dela, e continua
-- apontando para a mesma tabela depois do rename.
--
-- A alternativa (criar `safras`, copiar, apontar a FK, dropar `turmas`)
-- mexeria em dados de verdade para conseguir o mesmo resultado, e teria
-- uma janela em que a FK não existe.
--
-- ⚠️ O QUE O RENAME **NÃO** FAZ SOZINHO: nomes de constraint, de índice
-- e de sequência continuam os antigos. Eles não afetam comportamento —
-- mas um `turmas_uma_aberta_idx` numa tabela chamada `safras` é a
-- pegadinha que faz alguém procurar uma tabela que não existe mais no
-- meio de um incidente. A seção 2 renomeia todos.
--
-- ⚠️ QUEBRA A APLICAÇÃO NO AR. `src/lib/supabase.ts` consulta
-- `from('turmas')`. Entre este SQL e o deploy do `c20`, a rota
-- `/api/turma-ativa` passa a errar — e, pela D5, ela degrada para
-- `{ turma: null }` e a modal cai em lista de espera. O formulário
-- CONTINUA GRAVANDO. É a razão de a rota nunca devolver erro.
--   Ordem certa: rodar `005` e publicar o `c20` na sequência.
--
-- A tabela continua com RLS ligada e ZERO policies, de propósito: todo
-- acesso é server-side com a service_role, que ignora RLS. Não crie
-- policy — isso abriria a tabela para a chave anon.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- Guardado por `to_regclass`: se `safras` já existe, o rename já
-- aconteceu numa rodada anterior e não se repete. Um `alter table
-- turmas rename` cru daria erro na segunda execução, e uma migração que
-- só roda uma vez é uma migração que ninguém ousa rodar de novo.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.safras') is null then
    alter table public.turmas rename to safras;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Os nomes que o rename deixou para trás
--
-- Puramente cosmético para o Postgres, e nada cosmético para quem lê um
-- erro às onze da noite. `pg_constraint` e `pg_indexes` passam a dizer
-- "safras" em vez de mandar procurar uma tabela que não existe.
--
-- Cada um guardado pela existência do nome ANTIGO: rodando de novo,
-- nenhum entra.
-- ------------------------------------------------------------
-- ⚠️ Os guardas usam `to_regclass` e `conrelid`, e não `conname` solto.
--
-- `conname` NÃO é único no banco: nomes de constraint são únicos por
-- tabela. Um `where conname = 'turmas_pkey'` casa com uma constraint de
-- qualquer tabela, em qualquer schema — e aí o guarda diria "existe" e o
-- `alter index public.turmas_pkey` falharia, porque o objeto que existe
-- é outro. Improvável neste banco, e o custo de fechar é uma linha.
--
-- Para índice, `to_regclass('public.x')` é a pergunta exata: ela é
-- qualificada por schema e devolve `null` em vez de erro. Para a
-- constraint, o escopo vem do `conrelid`.
do $$
begin
  if to_regclass('public.turmas_pkey') is not null then
    alter index public.turmas_pkey rename to safras_pkey;
  end if;

  if to_regclass('public.turmas_slug_key') is not null then
    alter index public.turmas_slug_key rename to safras_slug_key;
  end if;

  -- `conrelid = to_regclass(...)` e não `'public.safras'::regclass`: o
  -- cast levanta exceção se a relação não existir, enquanto
  -- `to_regclass` devolve `null` — e comparação com `null` não casa
  -- nada, que é exatamente o comportamento desejado num guarda.
  if exists (
    select 1 from pg_constraint
    where conname = 'turmas_cobranca_antes_das_aulas_check'
      and conrelid = to_regclass('public.safras')
  ) then
    alter table public.safras
      rename constraint turmas_cobranca_antes_das_aulas_check
      to safras_cobranca_antes_das_aulas_check;
  end if;

  if to_regclass('public.turmas_uma_aberta_idx') is not null then
    alter index public.turmas_uma_aberta_idx rename to safras_uma_aberta_idx;
  end if;
end $$;

-- A FK de `waitlist` continua se chamando `waitlist_turma_id_fkey`, e a
-- coluna continua sendo `turma_id`. Renomear os dois agora seria mexer
-- na `waitlist` — a tabela que o `c17` vai ler e o `c18` vai aposentar.
-- Ela morre como está, com o nome que sempre teve. Quem herda o vínculo
-- é `inscricoes.safra_id`, na `008`, já com o nome novo.

-- ------------------------------------------------------------
-- 3. vagas_total — o limite mole (D-08)
--
-- NULLABLE, e `null` significa **sem limite**, não "zero vagas". A
-- distinção importa: `0` é uma safra lotada de propósito; `null` é uma
-- safra que não controla vaga.
--
-- ⚠️ NÃO HÁ TRAVA TRANSACIONAL, e isso é decisão, não omissão. O
-- sistema conta as inscrições antes de abrir o checkout e recusa se
-- estourou. Duas pessoas fechando o checkout no mesmo segundo pela
-- última vaga é possível — e aceito. Na escala do produto (dezenas, não
-- milhares), um lock distribuído custa mais do que resolve; o painel
-- mostra o estouro em vermelho e a Giovana resolve com uma conversa.
--
-- O CHECK garante só o que é sempre verdade: vaga negativa não existe.
-- ------------------------------------------------------------
alter table public.safras
  add column if not exists vagas_total integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'safras_vagas_total_check'
      and conrelid = to_regclass('public.safras')
  ) then
    alter table public.safras
      add constraint safras_vagas_total_check
      check (vagas_total is null or vagas_total >= 0)
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. stripe_price_id — o espelho do preço
--
-- NULLABLE porque a safra nasce aqui e só ganha preço no Stripe quando
-- é publicada (`c34`, corte 2). Uma safra sem `stripe_price_id` é uma
-- safra que ainda não pode vender — e é isso que o painel vai ler para
-- decidir se deixa abrir as inscrições.
--
-- ⚠️ A DIREÇÃO É SEMPRE DAQUI PARA O STRIPE (D-07). O registro nasce no
-- nosso banco e é espelhado lá pela nossa API. Nunca criar price pelo
-- Dashboard do Stripe e colar o id aqui: a Giovana não abre o Dashboard,
-- e um price criado por fora não tem como ser rastreado até a safra que
-- o originou.
--
-- Unique: dois registros de safra apontando para o mesmo price no
-- Stripe é sempre erro — ou é copy-paste, ou é uma safra duplicada. O
-- índice é PARCIAL (`where ... is not null`) porque `null` não conflita
-- com `null` num unique, mas dizer isso explicitamente evita a dúvida.
-- ------------------------------------------------------------
alter table public.safras
  add column if not exists stripe_price_id text;

create unique index if not exists safras_stripe_price_id_idx
  on public.safras (stripe_price_id)
  where stripe_price_id is not null;

-- ------------------------------------------------------------
-- 5. Documentação
--
-- Os comentários da `002` falavam em "turma" e alertavam para não
-- confundir com "grupo". Reescritos com o vocabulário novo: o alerta
-- deixa de ser necessário porque as duas coisas passam a ter nomes
-- diferentes e tabelas diferentes.
-- ------------------------------------------------------------
comment on table public.safras is
  'Safras do Beyond The Lab: uma linha por leva de alunas. A safra tem '
  'calendário e preço — data de início das aulas, data da primeira '
  'cobrança, valor mensal, duração e a janela de inscrição. '
  'Chamava-se `turmas` até a migração 005. '
  'Safra nova é SEMPRE linha nova; nunca se edita uma safra para virar a '
  'seguinte, senão o histórico de quem entrou em qual leva se perde. '
  'NÃO CONFUNDIR COM GRUPO (public.grupos): grupo é um HORÁRIO dentro da '
  'safra ("segunda 19h"), e não tem data, valor nem duração próprios. '
  'Na UI da Giovana, safra aparece como "Turma" e grupo como "Horário". '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.safras.vagas_total is
  'Limite de inscrições da safra. NULL = SEM LIMITE (não é zero). '
  'Limite mole: o sistema conta antes de abrir o checkout e recusa se '
  'estourou, mas NÃO há trava transacional — duas pessoas fechando o '
  'checkout no mesmo segundo pela última vaga é possível e aceito. O '
  'painel exibe inscritas/vagas_total e destaca o estouro em vermelho.';

comment on column public.safras.stripe_price_id is
  'Espelho do price desta safra no Stripe. NULL = safra ainda não '
  'publicada, e portanto ainda não vendável. A direção é sempre daqui '
  'para o Stripe: o registro nasce neste banco e é criado lá pela nossa '
  'API. NUNCA criar price pelo Dashboard e colar o id aqui.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela mudou de nome e os dados vieram junto?
--    Esperado: as mesmas linhas que `turmas` tinha, com as duas colunas
--    novas em NULL.
select
  nome, slug, data_inicio_aulas, data_primeira_cobranca,
  valor_mensal, duracao_meses, inscricoes_abertas,
  vagas_total, stripe_price_id
from public.safras
order by created_at;

-- 2. `turmas` deixou mesmo de existir?
--    Esperado: safras = 1, turmas = 0. Se as duas derem 1, houve cópia
--    em vez de rename e há dois lugares guardando a mesma coisa.
select
  (select count(*) from pg_class where relname = 'safras'  and relkind = 'r') as safras,
  (select count(*) from pg_class where relname = 'turmas'  and relkind = 'r') as turmas;

-- 3. A FK de `waitlist` sobreviveu e aponta para `safras`?
--    Esperado: 1 linha, waitlist_turma_id_fkey → safras.
--    Esta é a pergunta que justifica o rename em vez da tabela nova.
select
  con.conname                    as constraint_name,
  cl.relname                     as aponta_para
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.waitlist'::regclass
  and con.contype = 'f';

-- 4. Sobrou algum objeto com o nome antigo?
--    Esperado: ZERO linhas.
select conname as constraint_antiga
from pg_constraint
where conrelid = 'public.safras'::regclass
  and conname like 'turmas%'
union all
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'safras'
  and indexname like 'turmas%';

-- 5. O índice de safra única continua valendo, com o nome novo?
--    Esperado: safras_uma_aberta_idx, UNIQUE ... WHERE inscricoes_abertas
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'safras'
order by indexname;

-- 6. RLS ligada e sem policy?
--    Esperado: true / 0
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'safras') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'safras';

-- ============================================================
-- TESTE DE BARREIRA — o banco tem que RECUSAR. Rode e confirme o erro.
--
-- ⚠️ Estes updates estão comentados de propósito. Eles são
-- CONTRAEXEMPLOS, não regra — ver a nota do c16 em docs/04-PLANO.md
-- sobre teste que lê .sql como texto.
-- ============================================================

-- A. Vaga negativa → erro em safras_vagas_total_check
-- update public.safras set vagas_total = -1 where true;

-- B. Duas safras com o mesmo price → erro em safras_stripe_price_id_idx
-- update public.safras set stripe_price_id = 'price_teste' where true;
