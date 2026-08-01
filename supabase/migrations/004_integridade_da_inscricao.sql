-- ============================================================
-- Beyond The Lab — integridade da inscrição no banco
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Uma inscrição real gravou em produção com `curso`, `periodo`,
-- `nivel_ingles`, `disponibilidade`, `consent`, `consent_at` e
-- `consent_text` todos nulos — com as migrações 002 e 003 já rodadas e
-- as colunas existindo.
--
-- Não foi bug do código deste repositório. O insert dessa linha levou
-- exatamente cinco campos (name, email, phone, payment_choice, status),
-- que é o payload da versão da rota anterior ao commit 60696a0 — ou
-- seja, a linha foi escrita por um BUILD ANTIGO ainda no ar. A migração
-- do banco chegou à produção; o deploy da aplicação, não.
--
-- E aqui está o buraco que este arquivo fecha: a única coisa que exigia
-- o preenchimento desses campos era o Zod de `/api/waitlist`. Isso
-- funciona enquanto o código no ar é o código do repositório — uma
-- suposição que um deploy atrasado, um rollback ou uma instância velha
-- desmentem em silêncio. E o silêncio é o pior detalhe: o build antigo
-- respondeu "Inscrição confirmada!" e devolveu 200. Ninguém tinha como
-- saber, exceto abrindo a linha no Studio.
--
-- As migrações 002 e 003 deixaram isso explícito e consciente ("o banco
-- cuida do domínio, a aplicação cuida da obrigatoriedade"). A decisão
-- estava certa PARA AQUELE MOMENTO: as colunas acabavam de nascer e as
-- linhas antigas não tinham o dado. O que mudou é que agora sabemos que
-- a aplicação sozinha não segura — e dá para exigir sem mexer em uma
-- linha sequer do passado, com `not valid`.
--
-- O QUE `not valid` FAZ (é a peça central deste arquivo)
--
--   - toda linha NOVA passa a ser verificada, sempre;
--   - as linhas que já estão na tabela NÃO são verificadas nem
--     reescritas — o ALTER nem as lê, então também não trava a tabela
--     para varredura;
--   - `not valid` é sobre o passado, não sobre o futuro: não é uma
--     constraint "fraca", é uma constraint plena daqui para a frente.
--
-- É exatamente a forma que as migrações anteriores procuravam e não
-- tinham: obrigar sem falsificar histórico. Nenhum UPDATE aqui, nenhum
-- backfill, nenhum `default` — consentimento presumido continua não
-- sendo consentimento.
--
-- ⚠️ EFEITO COLATERAL CONHECIDO: uma constraint `not valid` também vale
-- para UPDATE de linha antiga. Editar no Studio uma linha pré-migração
-- que esteja incompleta vai falhar até que os campos sejam preenchidos.
-- É desconforto de propósito, e do tipo certo: a hora de resolver o
-- passivo é quando alguém for mexer na linha.
--
-- A tabela continua com RLS ligada e ZERO policies, de propósito.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Perfil obrigatório em toda inscrição nova
--
-- Complementa os CHECK da 002 em vez de substituí-los. Aqueles dizem
-- "se o valor existe, ele pertence ao domínio"; este diz "o valor tem
-- que existir". Os dois juntos são a regra inteira.
--
-- `cardinality(...) >= 1` aparece de novo aqui, embora a 002 já o
-- tenha: lá ele só entra em vigor quando `disponibilidade` não é nula,
-- e nulo é justamente o caso que estamos barrando agora. Repetir é o
-- que torna esta constraint legível sozinha.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_perfil_obrigatorio_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_perfil_obrigatorio_check
      check (
        nivel_ingles    is not null
        and curso       is not null
        and periodo     is not null
        and disponibilidade is not null
        and cardinality(disponibilidade) >= 1
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Consentimento obrigatório e completo em toda inscrição nova
--
-- Os três campos numa constraint só, e não em três: eles não fazem
-- sentido separados. `consent = true` sem `consent_text` prova que
-- alguém clicou em algo que não se sabe qual era; `consent_text` sem
-- `consent_at` não amarra a linha à redação vigente. O que tem valor
-- de prova (LGPD art. 8º, §1º) é o conjunto — então é o conjunto que o
-- banco exige, tudo ou nada.
--
-- `consent is true` e não `consent is not null`: gravar `false` seria
-- registrar que a pessoa recusou e mesmo assim entrou na lista. Um
-- CHECK só reprova quando a expressão dá FALSE — `is true` e
-- `is not null` nunca devolvem NULL, então não há brecha por aí.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_consentimento_obrigatorio_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_consentimento_obrigatorio_check
      check (
        consent is true
        and consent_at   is not null
        and consent_text is not null
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. turma_id e status contam a mesma história
--
-- A 002 documentou o par no comentário da coluna — "turma_id nulo <->
-- status = lista_espera" — e nada o fazia valer. A mesma linha do bug
-- é a prova: o build antigo gravou `status = 'pendente'` com
-- `turma_id` nulo, um estado que não existe no vocabulário do projeto.
-- Ela não está só incompleta, está afirmando pertencer a uma turma que
-- não aponta para nenhuma.
--
-- Os demais estados (`agendado`, `ativo`, `falhou`, `cancelado`) são
-- do Stripe e só acontecem em linha que tem turma — por isso a regra é
-- "sem turma ⇒ lista_espera" e "com turma ⇒ qualquer coisa menos
-- lista_espera", e não uma lista fechada de status.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_turma_status_coerentes_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_turma_status_coerentes_check
      check (
        (turma_id is null     and status  = 'lista_espera')
        or
        (turma_id is not null and status <> 'lista_espera')
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Conferência
--
-- Não altera nada.
--
-- A primeira query lista as três constraints e mostra `convalidated =
-- false` — que é o esperado e significa "vale para o novo, não olhou o
-- antigo". Não é pendência a resolver com pressa.
--
-- A segunda dimensiona o passivo: quantas linhas não passariam se
-- fossem gravadas hoje, e quantas delas têm a assinatura exata do bug
-- do build antigo (perfil e consentimento inteiros nulos, com o par
-- turma/status incoerente).
--
-- A terceira mostra essas linhas. Vale ler o `created_at` delas contra
-- a hora do deploy que subiu a 003: linha posterior ao deploy e ainda
-- assim vazia significa que a versão antiga continuou servindo
-- tráfego, e o que resolve não é SQL — é conferir o build em produção.
-- ------------------------------------------------------------
select
  conname                        as constraint_name,
  convalidated                   as ja_validou_o_passado
from pg_constraint
where conrelid = 'public.waitlist'::regclass
  and conname in (
    'waitlist_perfil_obrigatorio_check',
    'waitlist_consentimento_obrigatorio_check',
    'waitlist_turma_status_coerentes_check'
  )
order by conname;

select
  count(*)                                                          as total,
  count(*) filter (where consent is null)                           as sem_consentimento,
  count(*) filter (where nivel_ingles is null or curso is null
                      or periodo is null or disponibilidade is null) as sem_perfil,
  count(*) filter (where (turma_id is null     and status <> 'lista_espera')
                      or (turma_id is not null and status  = 'lista_espera'))
                                                                    as par_turma_status_incoerente
from public.waitlist;

select
  id,
  email,
  created_at,
  status,
  turma_id,
  consent,
  consent_at
from public.waitlist
where consent is null
   or nivel_ingles is null
   or curso is null
   or periodo is null
   or disponibilidade is null
order by created_at desc;

commit;

-- ------------------------------------------------------------
-- DEPOIS, QUANDO O PASSIVO ACABAR
--
-- Reobtido o consentimento das linhas antigas (ou removidas elas), o
-- fecho definitivo é validar as constraints — aí sim o banco varre a
-- tabela inteira e passa a garantir a regra também para o passado:
--
--   alter table public.waitlist validate constraint waitlist_perfil_obrigatorio_check;
--   alter table public.waitlist validate constraint waitlist_consentimento_obrigatorio_check;
--   alter table public.waitlist validate constraint waitlist_turma_status_coerentes_check;
--
-- `validate constraint` não trava escrita concorrente (só pega
-- SHARE UPDATE EXCLUSIVE) e falha inteiro se sobrar uma linha fora da
-- regra — o que é a checagem que se quer.
-- ------------------------------------------------------------
