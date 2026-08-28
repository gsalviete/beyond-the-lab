-- ============================================================
-- Beyond The Lab — inventário do que existe no banco, `012` → `017`
--
-- ⚠️ SÓ LÊ. Nenhum `create`, nenhum `alter`, nenhum `update`. Pode rodar
--    em produção com o formulário no ar, quantas vezes quiser.
--
-- ============================================================
-- POR QUE ESTE ARQUIVO EXISTE
-- ============================================================
--
-- O `docs/ESTADO.md` §1 afirma, por escrito, que as migrações `012`–`017`
-- rodaram "em staging **e** em produção". Produção discorda:
--
--   Error: inscricoes(espera): 42703 — column pessoas_1.token_expira_em
--   does not exist
--
-- O `42703` (`undefined_column`) é erro do PRÓPRIO POSTGRES executando a
-- consulta — não é cache de schema do PostgREST, que responderia
-- `PGRST204`/`PGRST200`. Ou seja: a coluna realmente não está lá, e a
-- `017` não rodou no banco que o deploy de produção enxerga.
--
-- ⚠️ E O PROBLEMA NÃO É "A 017". O problema é que a anotação do estado das
-- migrações não é confiável, e uma anotação errada sobre a `017` pode
-- estar errada sobre a `016` também — que é a que cria a
-- `criar_inscricao` de 13 argumentos, a que o formulário novo chama. Uma
-- `016` faltando em produção não dá erro de coluna: dá "function not
-- found" na PRIMEIRA pessoa que tentar se inscrever.
--
-- Então este arquivo não pergunta "a 017 rodou?". Ele pergunta, de uma
-- vez, **o que existe de fato** — e a fonte da verdade passa a ser o
-- catálogo do banco, não o documento.
--
-- ⚠️ RODE NO PROJETO DE PRODUÇÃO. As duas bases têm o mesmo schema
-- esperado e nomes de objeto idênticos; rodar isto em staging devolve
-- "tudo OK" e não diz nada sobre o problema. Confira o ref do projeto na
-- URL do SQL Editor antes de colar.
-- ============================================================

-- ------------------------------------------------------------
-- O inventário — uma linha por objeto, `presente` = true/false
--
-- Leitura: qualquer `false` é uma migração que não rodou (ou rodou pela
-- metade). A coluna `origem` diz qual arquivo colar.
-- ------------------------------------------------------------
select * from (
  values
    -- ---- 012_assinaturas ----
    ('012', 'tabela  assinaturas',
     to_regclass('public.assinaturas') is not null),

    -- ---- 013_cupons ----
    ('013', 'tabela  cupons',
     to_regclass('public.cupons') is not null),
    ('013', 'coluna  assinaturas.cupom_id',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'assinaturas'
               and column_name = 'cupom_id')),

    -- ---- 014_eventos_stripe ----
    ('014', 'tabela  eventos_stripe',
     to_regclass('public.eventos_stripe') is not null),

    -- ---- 015_inscricoes_travadas ----
    -- As três andam juntas (CHECK tudo-ou-nada da D-06). Se uma faltar,
    -- faltam as três.
    ('015', 'coluna  inscricoes.valor_mensal_travado',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inscricoes'
               and column_name = 'valor_mensal_travado')),
    ('015', 'coluna  inscricoes.duracao_meses_travada',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inscricoes'
               and column_name = 'duracao_meses_travada')),
    ('015', 'coluna  inscricoes.data_primeira_cobranca_travada',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inscricoes'
               and column_name = 'data_primeira_cobranca_travada')),

    -- ---- 016_rpc_criar_inscricao_travados ----
    -- ⚠️ ESTA É A LINHA QUE DERRUBA O FORMULÁRIO SE VIER `false`.
    -- Conta por NÚMERO DE ARGUMENTOS porque as duas versões coexistem de
    -- propósito até a `018`: a de 10 é a da `011b` (o build antigo), a de
    -- 13 é a da `016` (o build novo). Um `to_regprocedure` pelo nome não
    -- distingue as duas.
    ('016', 'função  criar_inscricao (13 args, a da 016)',
     exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'criar_inscricao'
               and p.pronargs = 13)),

    -- ---- 017_token_acesso ----  ⬅ a que estourou em produção
    ('017', 'coluna  pessoas.token_acesso',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pessoas'
               and column_name = 'token_acesso')),
    ('017', 'coluna  pessoas.token_expira_em',
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pessoas'
               and column_name = 'token_expira_em')),
    ('017', 'índice  pessoas_token_acesso_idx',
     to_regclass('public.pessoas_token_acesso_idx') is not null),
    ('017', 'check   pessoas_token_tudo_ou_nada_check',
     exists (select 1 from pg_constraint
             where conrelid = 'public.pessoas'::regclass
               and conname = 'pessoas_token_tudo_ou_nada_check'))
) as t(migracao, objeto, presente)
order by migracao, objeto;

-- ------------------------------------------------------------
-- A função de 10 argumentos ainda está viva?
--
-- Esperado AGORA: `true`. Ela só morre na `018`, e a `018` só roda depois
-- do deploy do corte 2 estar de pé e confirmado — o cabeçalho dela
-- explica por quê (entre a migração e o deploy, o build no ar chama a de
-- dez, e sem ela toda inscrição vira 500).
--
-- ⚠️ Se vier `false` E a linha da `016` acima também vier `false`, o
-- formulário de produção está quebrado NESTE MOMENTO, não só o painel.
-- ------------------------------------------------------------
select
  exists (select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'criar_inscricao'
            and p.pronargs = 10) as v1_10_args_viva,
  exists (select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'criar_inscricao'
            and p.pronargs = 13) as v2_13_args_viva;

-- ------------------------------------------------------------
-- Em que banco eu estou, afinal?
--
-- Não é pergunta retórica: a hipótese mais provável para o erro é que a
-- `017` foi colada no SQL Editor do projeto de STAGING (`gcwwvt…`, o do
-- `.env.local`) achando que era o de produção (`ljudfa…`, o comentado).
-- Os dois têm as mesmas tabelas e a mesma cara.
--
-- `current_database()` devolve `postgres` nos dois — não serve. O que
-- distingue é a contagem: produção tem a lista de espera real.
-- ------------------------------------------------------------
select
  current_database()                          as banco,
  (select count(*) from public.pessoas)       as pessoas,
  (select count(*) from public.inscricoes)    as inscricoes,
  (select count(*) from public.safras)        as safras;
