-- ============================================================
-- Beyond The Lab — `waitlist` vira `waitlist_legado`
--
-- ⛔ Só depois de a `010` ter rodado E o
--    `supabase/verificacao/019_contagens.sql` ter passado.
--
-- POR QUE RENOMEAR EM VEZ DE APAGAR
--
-- Porque apagar é irreversível e não há pressa nenhuma. A tabela fica
-- como está, com todos os dados, até o `c79` — o ÚLTIMO commit do
-- projeto inteiro, depois de o painel estar no ar e verificado, e com
-- backup feito.
--
-- Enquanto ela existir, qualquer divergência que apareça no modelo novo
-- pode ser conferida contra a origem. Sem ela, "será que a migração
-- perdeu alguém?" vira uma pergunta sem resposta possível.
--
-- POR QUE RENOMEAR EM VEZ DE DEIXAR COMO ESTÁ
--
-- Porque `waitlist` é o nome que a aplicação conhece. Enquanto ele
-- existir, um build antigo que volte ao ar — o cenário exato do
-- incidente da `004` — vai gravar ali com sucesso, respondendo
-- "Inscrição confirmada!" com 200, e essa inscrição NÃO existirá no
-- modelo novo. Ninguém teria como saber, exceto abrindo a linha no
-- Studio.
--
-- Renomear transforma esse cenário silencioso em erro barulhento: o
-- build antigo passa a receber 42P01, a rota cai no `catch`, e a falha
-- aparece no log em vez de virar uma aluna fantasma.
--
--   É a mesma lógica do rename da `005`, e a mesma da 8.3 do REPORT:
--   substituir disciplina por mecanismo.
--
-- ⚠️ ORDEM DE PUBLICAÇÃO. Entre este SQL e o deploy do `c21`, a rota
-- `/api/waitlist` do build ATUAL também quebra — ela ainda escreve em
-- `public.waitlist`. Pela D5 isso vira 500 e a pessoa vê erro, que é a
-- ÚNICA exceção documentada à regra de degradar em silêncio (prometer
-- vaga que não existe é pior). A janela tem que ser curta:
--
--     rodar a 011  →  publicar o c21 imediatamente
--
-- Se o `c21` ainda não estiver pronto, NÃO rode este arquivo.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. GUARDA — a migração aconteceu mesmo?
--
-- Renomear antes da `010` deixaria a origem inacessível pelo nome que a
-- `010` procura, e a mensagem de erro seria "waitlist nao existe" — que
-- manda investigar o lugar errado.
--
-- ⚠️ `execute` para as contagens, pelo motivo de sempre: o PL/pgSQL
-- resolve os nomes de relação da condição do `if` antes de avaliá-la, e
-- num banco onde este arquivo já rodou `public.waitlist` não existe
-- mais. Ver a nota longa na `000`.
-- ------------------------------------------------------------
do $$
declare
  n_inscr bigint;
begin
  -- Já renomeada: nada a fazer, e não é erro.
  if to_regclass('public.waitlist') is null then
    if to_regclass('public.waitlist_legado') is null then
      raise exception
        'RECUSADO: nem waitlist nem waitlist_legado existem. Este banco '
        'nao esta no estado que esta migracao espera.'
        using errcode = 'raise_exception';
    end if;
    raise notice 'waitlist_legado ja existe — nada a fazer.';
    return;
  end if;

  if to_regclass('public.inscricoes') is null then
    raise exception
      'RECUSADO: public.inscricoes nao existe. Rode 008 e 010 antes.'
      using errcode = 'raise_exception';
  end if;

  execute 'select count(*) from public.inscricoes' into n_inscr;

  if n_inscr = 0 then
    raise exception
      'RECUSADO: inscricoes esta vazia — a 010 nao rodou. Renomear agora '
      'esconderia a origem antes de os dados terem sido copiados.'
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. O rename
--
-- Operação de catálogo, como na `005`: troca o nome, não copia linha,
-- não reescreve página, não invalida a FK para `safras`.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.waitlist_legado') is null then
    alter table public.waitlist rename to waitlist_legado;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Os nomes que o rename deixou para trás
--
-- Mesma higiene da `005`, e pela mesma razão: `pg_constraint` dizendo
-- `waitlist_*` numa tabela chamada `waitlist_legado` manda alguém
-- procurar, no meio de um incidente, uma tabela que não existe mais.
--
-- Guardas por `to_regclass` para índice e por `conrelid` para
-- constraint — `conname` não é único no banco, é único por tabela.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.waitlist_pkey') is not null then
    alter index public.waitlist_pkey rename to waitlist_legado_pkey;
  end if;

  if to_regclass('public.waitlist_email_lower_key') is not null then
    alter index public.waitlist_email_lower_key
      rename to waitlist_legado_email_lower_key;
  end if;

  if to_regclass('public.waitlist_created_at_idx') is not null then
    alter index public.waitlist_created_at_idx
      rename to waitlist_legado_created_at_idx;
  end if;

  if to_regclass('public.waitlist_turma_id_idx') is not null then
    alter index public.waitlist_turma_id_idx
      rename to waitlist_legado_turma_id_idx;
  end if;
end $$;

-- As CHECK constraints e a FK mantêm os nomes antigos, de propósito.
--
-- Renomear `waitlist_consentimento_obrigatorio_check` para
-- `waitlist_legado_consentimento_obrigatorio_check` quebraria o vínculo
-- entre o objeto no banco e a migração `004`, que é onde a história dele
-- está escrita — e essa história é a lição mais transferível do projeto.
-- Índice é endereço; constraint é registro. Endereço se atualiza,
-- registro se preserva.

-- ------------------------------------------------------------
-- 4. Documentação
-- ------------------------------------------------------------
comment on table public.waitlist_legado is
  'A antiga public.waitlist, APOSENTADA pela migração 011. Renomeada e '
  'não apagada: enquanto existir, qualquer divergência no modelo novo '
  'pode ser conferida contra a origem. '
  'NÃO ESCREVA AQUI. Toda escrita vai para pessoas + inscricoes. O '
  'rename é deliberado — ele faz um build antigo receber 42P01 em vez de '
  'gravar com sucesso uma inscrição que o modelo novo não veria (é o '
  'cenário do incidente da migração 004). '
  'Removida no c79, o último commit do projeto, com backup feito. '
  'ANTES DE REMOVER: rode select grupo, count(*) from waitlist_legado '
  'group by 1 — se a professora usou o campo, é informação de alocação.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. O rename aconteceu e a origem sumiu do nome antigo?
--    Esperado: waitlist_legado = 1, waitlist = 0.
--    ⚠️ Se as DUAS derem 1, houve cópia em vez de rename e existem dois
--    lugares guardando os mesmos dados pessoais.
select
  (select count(*) from pg_class where relname = 'waitlist_legado' and relkind = 'r') as waitlist_legado,
  (select count(*) from pg_class where relname = 'waitlist'        and relkind = 'r') as waitlist;

-- 2. Os dados vieram junto?
--    Esperado: o mesmo número que a waitlist tinha antes.
select count(*) as linhas_no_legado from public.waitlist_legado;

-- 3. Sobrou índice com o nome antigo?
--    Esperado: ZERO linhas.
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'waitlist_legado'
  and indexname like 'waitlist\_%'
  and indexname not like 'waitlist\_legado\_%';

-- 4. A FK para safras sobreviveu?
--    Esperado: 1 linha, waitlist_turma_id_fkey → safras.
select con.conname, cl.relname as aponta_para
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.waitlist_legado'::regclass and con.contype = 'f';

-- 5. O que `grupo` guarda — para a decisão do c79.
--    Se a professora usou o campo, é informação de alocação que ela vai
--    querer, e descartar deixa de ser automático.
select grupo, count(*) as linhas
from public.waitlist_legado
group by grupo
order by linhas desc;

-- ============================================================
-- TESTE DE BARREIRA
--
-- ⚠️ Comentado de propósito: é CONTRAEXEMPLO, não regra.
-- ============================================================

-- A. O build antigo escrevendo na tabela que não existe mais.
--    Esperado: ERROR 42P01 relation "public.waitlist" does not exist.
--    É o ponto inteiro do rename — falha barulhenta em vez de aluna
--    fantasma.
-- insert into public.waitlist (email, name, phone, status)
-- values ('build.antigo@exemplo.invalid', 'Build Antigo', '+5521999990099', 'lista_espera');
