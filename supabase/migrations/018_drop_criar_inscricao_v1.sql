-- ============================================================
-- Beyond The Lab — remove a `criar_inscricao` de 10 argumentos
--
-- ⛔⛔ NÃO RODE ESTE ARQUIVO ANTES DO DEPLOY DO CORTE 2. ⛔⛔
--
-- Ele é o ÚNICO arquivo deste projeto cuja hora de rodar não é "assim que
-- estiver pronto". Rodá-lo cedo derruba o formulário.
--
-- ============================================================
-- POR QUE EXISTEM DUAS FUNÇÕES COM O MESMO NOME, E POR QUE UMA MORRE AQUI
-- ============================================================
--
-- A `016` criou `criar_inscricao` com 13 argumentos (os travados da D-06 e
-- o retorno composto que o checkout precisa) e DEIXOU VIVA a de 10
-- argumentos da `011b`. A razão está escrita no cabeçalho dela e vale
-- repetir, porque é ela que decide a ordem deste arquivo:
--
--   migração roda → DEPOIS o deploy sobe. Entre os dois momentos, o build
--   que está no ar continua chamando a função de dez argumentos. Se ela
--   não existir, o PostgREST responde "function not found" e TODA
--   inscrição vira 500 até o deploy terminar.
--
-- Há gente real na lista de espera, e "nenhum passo pode derrubar o
-- formulário" é a regra de ouro do plano. A única interrupção aceita do
-- projeto inteiro foi a da `011` (o rename de `waitlist`), e ela foi
-- declarada. Uma segunda não é.
--
-- ============================================================
-- A ORDEM, POR EXTENSO
-- ============================================================
--
--   1. `016` e `017` rodadas.                                   ✅ feito
--   2. `supabase gen types` regerado.                           ✅ feito
--   3. Aceite manual do corte 2 em modo teste do Stripe.        ⬅ ESTADO §4
--   4. **DEPLOY.**
--   5. Confirmar que ninguém mais chama a antiga (seção 0).
--   6. Só então: este arquivo.
--
-- ⚠️ O passo 5 não é cerimônia. Se uma instância antiga da Vercel ainda
-- estiver quente, ou se um rollback tiver acontecido, o build velho volta
-- a chamar a função de dez argumentos — e este arquivo a teria apagado.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

-- ------------------------------------------------------------
-- 0. ANTES DE RODAR — as duas sobrecargas ainda estão lá?
--
-- Rode SOZINHO primeiro. Esperado: DUAS linhas, uma devolvendo `boolean`
-- (a da `011b`) e outra devolvendo `TABLE(...)` (a da `016`).
--
-- Se vier uma só devolvendo `TABLE`, este arquivo já rodou e não há nada
-- a fazer. Se vier uma só devolvendo `boolean`, a `016` não rodou — e aí
-- o problema é outro, muito maior, porque o código deployado espera a de
-- treze.
-- ------------------------------------------------------------
select
  p.pronargs                                as argumentos,
  pg_get_function_result(p.oid)             as devolve,
  pg_get_function_identity_arguments(p.oid) as assinatura
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
order by p.pronargs;

begin;

-- ------------------------------------------------------------
-- 1. A guarda — recusa rodar se a função NOVA não estiver de pé
--
-- ⚠️ Sem isto, um banco onde a `016` não rodou ficaria SEM NENHUMA
-- `criar_inscricao` depois deste arquivo, e o formulário morreria por
-- completo em vez de só ficar desatualizado. É a pior forma de este
-- arquivo dar errado, e ela é barata de impedir.
--
-- Condição sobre catálogo (`pg_proc`) é sempre segura num `if` de
-- PL/pgSQL — não referencia relação que possa não existir. Ver a nota do
-- `c16` em `docs/04-PLANO.md`.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'criar_inscricao'
      and p.pronargs = 13
  ) then
    raise exception
      'RECUSADO: a criar_inscricao de 13 argumentos (migracao 016) nao existe. '
      'Dropar a de 10 agora deixaria o sistema SEM NENHUMA funcao de '
      'inscricao, e o formulario morreria por completo. Rode a 016 antes.'
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. O drop
--
-- ⚠️ A ASSINATURA COMPLETA É OBRIGATÓRIA. `drop function` opera sobre uma
-- SOBRECARGA específica, não sobre o nome — sem os tipos, o Postgres
-- recusa por ambiguidade (o que é a proteção funcionando).
--
-- `if exists` para o arquivo poder rodar de novo sem erro.
--
-- ⚠️ NÃO PRECISA DE `revoke` ANTES. Os privilégios de execução morrem com
-- a função; um `revoke` aqui seria ruído e, pior, sugeriria que existe
-- uma ordem a respeitar onde não existe.
-- ------------------------------------------------------------
drop function if exists public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text, uuid
);

commit;

-- ⚠️ O PostgREST guarda o schema em cache. Sem recarregar, ele continua
-- anunciando uma função que não existe mais — e uma chamada a ela falha
-- com uma mensagem que não ajuda ninguém. O Supabase tem um event trigger
-- de DDL que dispara isso sozinho; este `notify` é o cinto de segurança.
-- Fora da transação de propósito: `notify` só é entregue no commit.
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit.
-- ============================================================

-- 1. Sobrou UMA função, e é a de 13 argumentos?
--    Esperado: uma linha, `argumentos = 13`, devolvendo TABLE(...).
select
  p.pronargs                    as argumentos,
  pg_get_function_result(p.oid) as devolve,
  p.prosecdef                   as security_definer,
  p.proconfig                   as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 2. A fechadura da que sobrou continua de pé?
--    Esperado: `service_role`, e SÓ ele. Se `anon` ou `PUBLIC` aparecer, o
--    formulário público virou escrita direta em duas tabelas de dado
--    pessoal.
select
  p.proname,
  coalesce(p.proacl::text, 'NULO = PUBLIC PODE EXECUTAR — ERRADO') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 3. ⚠️ O TESTE QUE IMPORTA — uma inscrição de verdade ainda funciona?
--    Não há consulta que responda isso. Depois deste arquivo, faça UMA
--    inscrição pelo formulário e confirme que ela chega. É o único passo
--    que prova que o deploy e o drop concordam.
