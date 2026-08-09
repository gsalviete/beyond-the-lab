-- ============================================================
-- Beyond The Lab — apaga `waitlist_legado` (`c79`)
--
-- ⛔⛔⛔ ESTE É O ÚLTIMO COMMIT DO PROJETO INTEIRO, E O ÚNICO ARQUIVO QUE
--       DESTRÓI DADO. NÃO RODE SEM BACKUP.
--
-- Todos os outros arquivos deste repositório acrescentam, renomeiam ou
-- desligam. Este APAGA — e apaga a tabela onde estiveram as primeiras
-- pessoas que confiaram os dados delas a este produto, antes de existir
-- turma, preço ou pagamento.
--
-- ============================================================
-- O QUE É `waitlist_legado`, E POR QUE ELA AINDA EXISTIA
-- ============================================================
--
-- Era a `waitlist`: a tabela original, criada sem migração nenhuma (a `000`
-- documenta que ela "nunca foi criada por arquivo nenhum" — ficou meses em
-- produção sem SQL versionado). A `010` copiou o conteúdo dela para
-- `pessoas` + `inscricoes`, e a `011` a renomeou para `waitlist_legado`
-- em vez de apagá-la.
--
-- ⚠️ AQUELE RENAME FOI A REDE. Se a `010` tivesse migrado errado — um
-- campo trocado, uma linha perdida, um `consent` falsificado —, a tabela
-- original era a única forma de descobrir e de refazer. Ela ficou de pé
-- por isso, e não por indecisão.
--
-- Este arquivo tira a rede. Depois dele, se aparecer uma divergência entre
-- o que a base antiga dizia e o que `pessoas`/`inscricoes` dizem, **não
-- existe mais com o que comparar.**
--
-- ============================================================
-- ⚠️ O QUE PRECISA SER VERDADE ANTES DE VOCÊ COLAR ISTO
-- ============================================================
--
--   1. **BACKUP FEITO E GUARDADO FORA DO BANCO**, e conferido — não basta
--      ter clicado em "backup", é preciso saber que ele restaura.
--   2. O corte 2 em produção há tempo suficiente para você confiar nele.
--   3. A verificação `019_contagens.sql` com `ACEITE: OK` (ela já rodou no
--      corte 1, e é a que compara as contagens).
--   4. A seção 0 abaixo devolvendo os números que você espera.
--
-- ⚠️ SE VOCÊ ESTÁ LENDO ISTO COM PRESSA, NÃO RODE. Não há nada que este
-- arquivo resolva hoje. Ele existe para o dia em que a tabela virar ruído
-- — e ruído não tem prazo.
--
-- Rode no SQL Editor do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 0. ANTES — rode SOZINHO, e olhe os três números
--
-- ⚠️ NÃO APAGUE NADA SE `orfas_no_legado` FOR DIFERENTE DE ZERO. Ele conta
-- linhas da base antiga cujo e-mail não existe em `pessoas` — ou seja,
-- gente que a `010` deixou para trás. Uma única linha aqui significa que a
-- migração não migrou tudo, e a tabela que você está prestes a apagar é a
-- única prova de quem ficou de fora.
-- ------------------------------------------------------------
select
  (select count(*) from public.waitlist_legado)                        as no_legado,
  (select count(*) from public.pessoas)                                as em_pessoas,
  (select count(*)
     from public.waitlist_legado w
    where not exists (
      select 1 from public.pessoas p
      where lower(p.email) = lower(w.email)
    ))                                                                 as orfas_no_legado;

-- ============================================================
-- A PARTIR DAQUI DESTRÓI. Confira os números acima primeiro.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A guarda — recusa apagar se alguém ficou para trás
--
-- ⚠️ Ela repete a conta da seção 0 de propósito. A seção 0 é para os SEUS
-- olhos e depende de você olhar; esta é mecânica e não depende de nada.
-- É a diferença entre disciplina e mecanismo (`REPORT.md` §8.3), e num
-- arquivo que destrói dado a diferença vale o dobro.
--
-- ⚠️ `to_regclass` como VALOR, e o `execute` dentro do ramo: o PL/pgSQL
-- prepara a condição do `if` como um comando SQL só, e o parser resolve os
-- nomes de relação antes de o `and` curto-circuitar — um `exists (select 1
-- from public.waitlist_legado)` direto levantaria 42P01 num banco onde a
-- tabela já não existe. Ver a nota do `c16` em `docs/04-PLANO.md`.
-- ------------------------------------------------------------
do $$
declare
  orfas bigint;
begin
  if to_regclass('public.waitlist_legado') is null then
    raise notice 'waitlist_legado ja nao existe — nada a fazer.';
    return;
  end if;

  execute $q$
    select count(*)
      from public.waitlist_legado w
     where not exists (
       select 1 from public.pessoas p
       where lower(p.email) = lower(w.email)
     )
  $q$ into orfas;

  if orfas > 0 then
    raise exception
      'RECUSADO: % linha(s) de waitlist_legado nao tem correspondente em '
      'pessoas. A migracao 010 deixou gente para tras, e esta tabela e a '
      'unica prova de quem. NAO apague — investigue primeiro.', orfas
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. O drop
--
-- ⚠️ SEM `cascade`, e a ausência é a última proteção deste arquivo.
--
-- `cascade` apagaria em silêncio qualquer objeto que dependa desta tabela
-- — uma view que alguém criou para um relatório, uma FK que ninguém
-- lembrava. Sem ele, o Postgres RECUSA o drop e lista o que depende, e aí
-- a decisão volta para uma pessoa.
--
-- Se este comando falhar dizendo que existe dependência: **isso é o
-- sistema funcionando.** Leia o que ele listou antes de acrescentar um
-- `cascade` aqui.
-- ------------------------------------------------------------
drop table if exists public.waitlist_legado;

commit;

-- ============================================================
-- VERIFICAÇÃO — rode depois.
-- ============================================================

-- 1. A tabela sumiu?
--    Esperado: uma linha com `null`.
select to_regclass('public.waitlist_legado') as deve_ser_nulo;

-- 2. ⚠️ E O QUE IMPORTA CONTINUA LÁ?
--    Esperado: os mesmos números que você viu na seção 0, em `em_pessoas`.
--    Se este número mudou, alguma coisa muito errada aconteceu — e o
--    backup da condição 1 é o que resolve.
select
  (select count(*) from public.pessoas)    as pessoas,
  (select count(*) from public.inscricoes) as inscricoes;

-- 3. O formulário continua funcionando?
--    Não há consulta que responda isso. Faça UMA inscrição de verdade pelo
--    site. É o mesmo passo final da `018`, e pela mesma razão: só o uso
--    prova que o banco e a aplicação continuam concordando.
