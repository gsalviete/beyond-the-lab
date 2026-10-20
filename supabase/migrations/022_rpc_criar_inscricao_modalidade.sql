-- ============================================================
-- Beyond The Lab — `criar_inscricao`, versão das formas de pagamento
-- (D-17, `c83`)
--
-- ⛔ Rode depois da `021`. Ela depende das três colunas novas.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela cria uma TERCEIRA
--    sobrecarga de `criar_inscricao` — a de 16 argumentos — e não toca em
--    nenhuma linha. A de 13 (`016`) continua viva até a `023`.
--
-- ============================================================
-- O QUE MUDA EM RELAÇÃO À `016`
-- ============================================================
--
-- Só o contrato fica mais largo. Três parâmetros novos — `p_modalidade`,
-- `p_parcelas_travadas`, `p_valor_total_travado` —, gravados no MESMO
-- insert que cria a inscrição, e devolvidos de volta junto com os três de
-- sempre. Todo o resto é a `016` palavra por palavra, e os porquês dela
-- continuam valendo inteiros: a transação única (LGPD), o `on conflict do
-- nothing` que não reescreve contrato, o toque no-op em `pessoas`, o
-- `status` derivado de `p_safra_id`.
--
-- ⚠️ A DEVOLUÇÃO DA MODALIDADE É O QUE CUMPRE A D-17 NO LINK DA D-15.
--
-- Quem abandonou o checkout do 12x e volta pelo link (ou preenche o
-- formulário de novo) cai na duplicata. A função devolve o contrato DA
-- LINHA QUE EXISTE — inclusive a forma —, e a rota abre a sessão do 12x,
-- não a do que a pessoa clicou agora. "Mesma modalidade" é decisão do
-- dono do repositório (20/10/2026), e o mecanismo é o mesmo que já
-- impedia a retomada de cobrar o preço novo da safra (D-06).
--
-- ============================================================
-- ⚠️⚠️ POR QUE A DE 13 ARGUMENTOS CONTINUA VIVA DEPOIS DAQUI
-- ============================================================
--
-- A mesma razão, letra por letra, pela qual a `016` deixou viva a de 10:
-- a migração roda ANTES do deploy, e entre os dois momentos o build que
-- está no ar chama a de 13. Se ela sumisse, toda inscrição viraria 500 até
-- o deploy terminar — e "nenhum passo pode derrubar o formulário".
--
-- ⚠️ E os três parâmetros novos entram SEM DEFAULT, pela mesma razão
-- também: o PostgREST resolve sobrecarga pelo CONJUNTO DE CHAVES do corpo
-- JSON. Com default, a chamada de 13 chaves do build antigo casaria com as
-- duas funções e o PostgREST recusaria por ambiguidade. Sem default, as 13
-- chaves só casam com a de 13, e as 16 só com a de 16.
--
-- Pela regra do PL/pgSQL (parâmetro sem default não vem depois de um com
-- default), os três novos entram ANTES de `p_safra_id`, igual aos
-- travados da `016`. Ninguém chama por posição: o `.rpc()` casa por nome.
--
-- ⚠️ A DE 13 MORRE NA `023`. Ordem: rodar esta → regerar tipos →
-- deployar → conferir que ninguém mais chama a de 13 → rodar a `023`.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PRÉ-REQUISITOS
--
-- Os mesmos três índices da `011b`/`016` (sem eles a duplicata deixa de
-- ser barrada e a função devolve "criada" todas as vezes, sem erro), as
-- três travadas da `015`, e as três colunas novas da `021` — sem elas o
-- insert falha com 42703 no primeiro checkout de verdade, que é o pior
-- momento possível para descobrir que uma migração ficou para trás.
--
-- ⚠️ Condição sobre CATÁLOGO é sempre segura num `if` de PL/pgSQL. Ver a
-- nota do `c16` em `docs/04-PLANO.md` e a seção 1 da `016`.
-- ------------------------------------------------------------
do $$
declare
  faltando text[] := array[]::text[];
  coluna   text;
begin
  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'pessoas_email_lower_idx'
      and x.indrelid = to_regclass('public.pessoas')
      and x.indisunique
  ) then
    faltando := faltando || 'pessoas_email_lower_idx (migracao 007)';
  end if;

  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'inscricoes_pessoa_safra_idx'
      and x.indrelid = to_regclass('public.inscricoes')
      and x.indisunique
      and x.indpred is not null
  ) then
    faltando := faltando || 'inscricoes_pessoa_safra_idx parcial (migracao 008)';
  end if;

  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'inscricoes_pessoa_espera_idx'
      and x.indrelid = to_regclass('public.inscricoes')
      and x.indisunique
      and x.indpred is not null
  ) then
    faltando := faltando || 'inscricoes_pessoa_espera_idx parcial (migracao 008)';
  end if;

  foreach coluna in array array[
    'valor_mensal_travado',
    'duracao_meses_travada',
    'data_primeira_cobranca_travada',
    'modalidade',
    'parcelas_travadas',
    'valor_total_travado'
  ] loop
    if not exists (
      select 1
      from pg_attribute a
      where a.attrelid = to_regclass('public.inscricoes')
        and a.attname = coluna
        and a.attnum > 0
        and not a.attisdropped
    ) then
      faltando := faltando || (coluna || ' em inscricoes (migracoes 015 e 021)');
    end if;
  end loop;

  if cardinality(faltando) > 0 then
    raise exception
      'RECUSADO: esta funcao depende de objeto(s) que nao existem: %. '
      'Sem os indices a duplicata deixa de ser barrada e a funcao devolve '
      '"criada" todas as vezes, sem erro nenhum; sem as colunas o checkout '
      'grava contrato vazio. Rode 007, 008, 015 e 021 antes.',
      array_to_string(faltando, ', ')
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. A FUNÇÃO
--
-- `security invoker` e `set search_path = ''`, a mesma decisão da `011b`
-- e da `016` — ver a seção 2 daquelas. Os comentários de linha abaixo
-- apontam para elas em vez de repetir o raciocínio, que não mudou.
-- ------------------------------------------------------------
create or replace function public.criar_inscricao(
  p_nome                           text,
  p_email                          text,
  p_telefone                       text,
  p_nivel_ingles                   text,
  p_curso                          text,
  p_periodo                        text,
  p_disponibilidade                text[],
  p_consent_at                     timestamptz,
  p_consent_text                   text,
  p_valor_mensal_travado           numeric,
  p_duracao_meses_travada          int,
  p_data_primeira_cobranca_travada date,
  p_modalidade                     text,
  p_parcelas_travadas              int,
  p_valor_total_travado            numeric,
  p_safra_id                       uuid default null
)
returns table (
  inscricao_id                   uuid,
  criada                         boolean,
  valor_mensal_travado           numeric,
  duracao_meses_travada          int,
  data_primeira_cobranca_travada date,
  modalidade                     text,
  parcelas_travadas              int,
  valor_total_travado            numeric
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pessoa_id    uuid;
  v_inscricao_id uuid;
  v_criada       boolean;
  v_valor        numeric;
  v_duracao      int;
  v_data         date;
  v_modalidade   text;
  v_parcelas     int;
  v_total        numeric;
begin
  insert into public.pessoas (nome, email, telefone)
  values (p_nome, p_email, p_telefone)
  on conflict (lower(email)) do update
    set email = pessoas.email   -- toque no-op, valor já armazenado — ver a `011b`
  returning id into v_pessoa_id;

  insert into public.inscricoes (
    pessoa_id, safra_id, grupo_id, status,
    nivel_ingles, curso, periodo, disponibilidade,
    consent, consent_at, consent_text,
    valor_mensal_travado, duracao_meses_travada, data_primeira_cobranca_travada,
    modalidade, parcelas_travadas, valor_total_travado
  )
  values (
    v_pessoa_id,
    p_safra_id,
    null,                     -- grupo_id — alocação é ato da Giovanna (D-03)
    case when p_safra_id is null
         then 'lista_espera'
         else 'pendente_pagamento'
    end,
    p_nivel_ingles,
    p_curso,
    p_periodo,
    p_disponibilidade,
    true,                     -- consent — ver a `011b` §2.2
    p_consent_at,
    p_consent_text,
    p_valor_mensal_travado,
    p_duracao_meses_travada,
    p_data_primeira_cobranca_travada,
    p_modalidade,
    p_parcelas_travadas,
    p_valor_total_travado
  )
  -- ⚠️ `do nothing`, e NÃO `do update`. Na duplicata o contrato que vale é
  -- o da PRIMEIRA vez — preço E forma. Um `do update` aqui deixaria quem
  -- volta pelo link da D-15 trocar o 6x pelo à vista sem que ninguém
  -- decidisse isso, e a decisão registrada é "mesma modalidade".
  on conflict do nothing
  returning
    id,
    inscricoes.valor_mensal_travado,
    inscricoes.duracao_meses_travada,
    inscricoes.data_primeira_cobranca_travada,
    inscricoes.modalidade,
    inscricoes.parcelas_travadas,
    inscricoes.valor_total_travado
  into v_inscricao_id, v_valor, v_duracao, v_data, v_modalidade, v_parcelas, v_total;

  v_criada := v_inscricao_id is not null;

  -- A releitura da duplicata — ver a `016` §2.3, inclusive o caso raro de
  -- conflito com transação ainda não commitada, em que nada volta.
  if not v_criada then
    select i.id,
           i.valor_mensal_travado,
           i.duracao_meses_travada,
           i.data_primeira_cobranca_travada,
           i.modalidade,
           i.parcelas_travadas,
           i.valor_total_travado
      into v_inscricao_id, v_valor, v_duracao, v_data, v_modalidade, v_parcelas, v_total
    from public.inscricoes i
    where i.pessoa_id = v_pessoa_id
      and i.safra_id is not distinct from p_safra_id;
  end if;

  -- Nome e telefone só mudam se a inscrição nasceu agora — ver a `011b`.
  if v_criada then
    update public.pessoas
      set nome     = p_nome,
          telefone = p_telefone
    where id = v_pessoa_id;
  end if;

  return query
    select v_inscricao_id, v_criada, v_valor, v_duracao, v_data,
           v_modalidade, v_parcelas, v_total;
end;
$$;

comment on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, text, int, numeric, uuid
) is
  'Cria pessoa + inscricao NUMA TRANSACAO SO, com o contrato TRAVADO '
  'inteiro (D-06, D-17) dentro do mesmo insert: valor por cobranca, '
  'duracao do curso, data da primeira cobranca, FORMA de pagamento, '
  'numero de cobrancas e total. Mesma funcao da 016 com o contrato mais '
  'largo; os porques dela continuam valendo (LGPD, transacao unica, '
  'on conflict do nothing que nao reescreve contrato, status derivado de '
  'p_safra_id). Na DUPLICATA devolve o contrato DA LINHA QUE EXISTE, '
  'inclusive a forma: quem volta pelo link da D-15 paga do jeito que '
  'escolheu da primeira vez. SOBRECARGA: a de 13 argumentos (016) '
  'continua existindo ate a 023 porque o build em producao a chama entre '
  'a migracao e o deploy. Os tres parametros novos NAO tem default de '
  'proposito — e isso que impede a chamada de 13 chaves de cair aqui.';

-- ------------------------------------------------------------
-- 3. Fechadura — a mesma da `011b`/`016`
-- ------------------------------------------------------------
revoke execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, text, int, numeric, uuid
) from public, anon, authenticated;

grant execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, text, int, numeric, uuid
) to service_role;

commit;

-- ⚠️ Fora da transação: `notify` só é entregue no commit. Ver a `018`.
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. Agora são DUAS sobrecargas: a de 13 (016) e a de 16 (esta).
--    Esperado: duas linhas, ambas devolvendo TABLE(...), security_definer
--    = false e config com search_path="".
select
  p.pronargs                                as argumentos,
  pg_get_function_result(p.oid)             as devolve,
  p.prosecdef                               as security_definer,
  p.proconfig                               as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
order by p.pronargs;

-- 2. A fechadura: só `service_role` executa as duas.
select
  p.pronargs,
  coalesce(p.proacl::text, 'NULO = PUBLIC PODE EXECUTAR — ERRADO') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
order by p.pronargs;

-- 3. Só `p_safra_id` tem default na de 16.
--    Esperado: 1. Se vier 4, os três novos ganharam default e a chamada de
--    13 chaves do build antigo passou a ser ambígua.
select pronargdefaults as parametros_com_default
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
  and p.pronargs = 16;
