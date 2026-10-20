-- ============================================================
-- Beyond The Lab — remove a `criar_inscricao` de 13 argumentos (`c101`)
--
-- ⛔⛔ NÃO RODE ESTE ARQUIVO ANTES DO DEPLOY DO CORTE 4. ⛔⛔
--
-- É o mesmo tipo de arquivo que a `018`: o único cuja hora de rodar não é
-- "assim que estiver pronto". Rodá-lo cedo derruba o formulário.
--
-- ============================================================
-- POR QUE EXISTEM DUAS FUNÇÕES COM O MESMO NOME, E POR QUE UMA MORRE AQUI
-- ============================================================
--
-- A `022` criou `criar_inscricao` com 16 argumentos (a forma de pagamento
-- da D-17) e DEIXOU VIVA a de 13 da `016`, pela razão que a `016` já tinha
-- escrito sobre a de 10:
--
--   migração roda → DEPOIS o deploy sobe. Entre os dois momentos, o build
--   que está no ar continua chamando a função de treze argumentos. Se ela
--   não existir, o PostgREST responde "function not found" e TODA
--   inscrição vira 500 até o deploy terminar.
--
-- ============================================================
-- A ORDEM, POR EXTENSO
-- ============================================================
--
--   1. `020`, `021` e `022` rodadas.
--   2. `supabase gen types` regerado.
--   3. **DEPLOY** do corte 4.
--   4. Aceite em modo teste do Stripe — uma inscrição de cada forma.
--   5. Confirmar que ninguém mais chama a de 13 (seção 0, e os logs da
--      Vercel sem `criar_inscricao` de 13 chaves).
--   6. Só então: este arquivo.
--
-- ⚠️ O passo 5 não é cerimônia. Um rollback do deploy traria de volta o
-- build que chama a de 13 — e este arquivo a teria apagado. Enquanto
-- houver chance de rollback, a função antiga é o que mantém o rollback
-- possível.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

-- ------------------------------------------------------------
-- 0. ANTES DE RODAR — as duas sobrecargas ainda estão lá?
--
-- Rode SOZINHO primeiro. Esperado: DUAS linhas, `argumentos` 13 e 16.
--
-- Se vier só a de 16, este arquivo já rodou. Se vier só a de 13, a `022`
-- não rodou — e o código deployado, que manda 16 chaves, está quebrado.
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
-- ⚠️ Sem isto, um banco onde a `022` não rodou ficaria SEM NENHUMA
-- `criar_inscricao`, e o formulário morreria por completo. Mesma guarda
-- da `018`, um número acima.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'criar_inscricao'
      and p.pronargs = 16
  ) then
    raise exception
      'RECUSADO: a criar_inscricao de 16 argumentos (migracao 022) nao existe. '
      'Dropar a de 13 agora deixaria o sistema SEM NENHUMA funcao de '
      'inscricao, e o formulario morreria por completo. Rode a 022 antes.'
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. O drop
--
-- ⚠️ A ASSINATURA COMPLETA É OBRIGATÓRIA: `drop function` opera sobre uma
-- sobrecarga específica, não sobre o nome. Ver a `018`.
-- ------------------------------------------------------------
drop function if exists public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, uuid
);

commit;

-- Fora da transação: `notify` só é entregue no commit. Ver a `018`.
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit.
-- ============================================================

-- 1. Sobrou UMA função, e é a de 16 argumentos?
select
  p.pronargs                    as argumentos,
  pg_get_function_result(p.oid) as devolve,
  p.prosecdef                   as security_definer,
  p.proconfig                   as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 2. A fechadura da que sobrou continua de pé?
--    Esperado: `service_role`, e SÓ ele.
select
  p.proname,
  coalesce(p.proacl::text, 'NULO = PUBLIC PODE EXECUTAR — ERRADO') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 3. ⚠️ O TESTE QUE IMPORTA — depois deste arquivo, faça UMA inscrição
--    pelo formulário e confirme que ela chega. É o único passo que prova
--    que o deploy e o drop concordam.
