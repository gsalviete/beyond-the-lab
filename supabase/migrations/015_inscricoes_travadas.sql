-- ============================================================
-- Beyond The Lab — as três colunas TRAVADAS em `inscricoes` (D-06)
--
-- ⛔ Rode depois da `014`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela acrescenta três colunas
--    nulas e três CHECKs `NOT VALID`. Toda linha existente — as da lista
--    de espera migradas pela `010` — continua exatamente como está.
--
-- ============================================================
-- PREÇO E PRAZO TRAVAM NA INSCRIÇÃO, E ISSO É PROVA (D-06)
-- ============================================================
--
-- No momento do checkout, a inscrição COPIA `valor_mensal`,
-- `duracao_meses` e `data_primeira_cobranca` da safra para colunas
-- próprias. Mexer na safra depois não afeta quem já assinou.
--
-- ⚠️ ISTO É A MESMA DECISÃO DE `consent_text`, E O PARALELO É EXATO.
--
-- `consent_text` copia a frase inteira em cada linha em vez de apontar
-- para uma tabela de versões, porque **prova não se normaliza**: um
-- UPDATE naquela tabela reescreveria retroativamente o que todo mundo
-- teria aceitado. Aqui é idêntico. Se o valor pago fosse lido por FK da
-- safra, a Giovana subir o preço de R$ 299,99 para R$ 349,99 em setembro
-- faria o sistema afirmar, sobre alguém que assinou em março, que ela
-- concordou em pagar 349,99. O contrato dela mudaria no passado.
--
-- E o Stripe já travou o valor de qualquer forma — a assinatura cobra o
-- que foi acordado na criação, independentemente do que o nosso banco
-- diga. Sem estas colunas, o painel mostraria um número e o cartão seria
-- debitado com outro, sem que ninguém tivesse como explicar a diferença.
--
-- ⚠️ POR QUE SÓ AGORA, E NÃO NA `008`
--
-- A `008` deixou registrado, e a razão continua valendo: elas "só fazem
-- sentido a partir do momento em que existe uma assinatura para travar —
-- antes disso seriam três colunas sempre nulas com um CHECK que nada
-- exercita". O checkout chega no `c35`; as colunas chegam aqui.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. As três colunas
--
-- Todas NULLABLE, e o nulo tem significado preciso: **esta inscrição
-- nunca passou por um checkout.** É o estado de toda a lista de espera,
-- que é a base inteira hoje.
--
-- Os tipos espelham `safras` coluna a coluna, de propósito. Se um dia
-- `safras.valor_mensal` mudar de `numeric(10,2)` para outra coisa, estas
-- precisam mudar junto — e o jeito de descobrir isso é a comparação
-- valer sem cast.
--
-- ⚠️ `add column ... if not exists` com DEFAULT ausente é operação de
-- CATÁLOGO no Postgres moderno: não reescreve a tabela, não trava
-- escrita, não tem downtime. É por isso que este arquivo pode rodar com
-- o formulário no ar — que é requisito, não conveniência (há gente real
-- na lista de espera).
-- ------------------------------------------------------------
alter table public.inscricoes
  add column if not exists valor_mensal_travado             numeric(10,2),
  add column if not exists duracao_meses_travada            int,
  add column if not exists data_primeira_cobranca_travada   date;

-- ------------------------------------------------------------
-- 2. Os CHECKs — todos `NOT VALID`
--
-- ⚠️ `NOT VALID` dispensa a varredura das linhas que JÁ ESTÃO na tabela
-- no instante do `ALTER`, e NÃO dispensa nada de um `INSERT` futuro. É a
-- lição da `004`: obrigar em toda linha nova sem reescrever nem
-- falsificar o passado.
--
-- Aqui isso é indolor — as linhas existentes têm as três colunas nulas e
-- passariam de qualquer forma —, mas a regra vale sem exceção. Uma
-- exceção "porque neste caso não fazia diferença" é como uma regra deixa
-- de ser seguida.
--
-- 2.1 TUDO-OU-NADA. As três andam juntas ou nenhuma existe.
--
--     Mesma forma do CHECK de consentimento. Um valor travado sem a
--     duração é um contrato pela metade: dá para dizer quanto custa o
--     mês e não por quantos meses, e a conta de `cancel_at` (D-05) fica
--     impossível de refazer.
--
-- 2.2 LISTA DE ESPERA NUNCA TEM VALOR TRAVADO.
--
--     `safra_id` nulo significa lista de espera (CHECK da `009`), e quem
--     está na lista de espera não passou por checkout nenhum. Um valor
--     travado numa linha dessas seria um preço acordado numa safra que
--     não existe — e ele apareceria no painel como se fosse compromisso.
--
-- 2.3 QUEM JÁ PAGOU TEM QUE TER OS TRÊS.
--
--     A partir de `confirmada`, existe uma assinatura no Stripe cobrando
--     um valor. Se as colunas estiverem vazias, o painel não tem como
--     dizer quanto aquela pessoa paga, e a única fonte vira o Dashboard
--     do Stripe — que é justamente o que a D-07 proíbe a Giovana de
--     abrir.
--
--     ⚠️ `pendente_pagamento` E `cancelada` FICAM DE FORA DA EXIGÊNCIA,
--     e as duas ausências são decisão:
--
--       `pendente_pagamento` é o estado em que as colunas estão sendo
--       escritas (Fluxo 1, passo ⑨). Exigi-las aqui obrigaria o insert a
--       nunca poder criar a linha antes de resolver a safra — o que ele
--       faz, mas amarrar a ordem dos dois no banco não acrescenta
--       proteção e tira liberdade de um caminho que ainda vai mudar no
--       `c37`.
--
--       `cancelada` pode ser alcançada por uma inscrição que NUNCA
--       chegou a pagar — alguém que abandonou o checkout e a Giovana
--       limpou depois. Exigir os três travados aí seria afirmar que
--       houve contrato onde não houve.
--
--     A assimetria é proposital e é a leitura conservadora: o CHECK
--     afirma o que se sabe com certeza, e cala sobre o resto. Um CHECK
--     que afirma demais é um `INSERT` legítimo recusado em produção,
--     numa terça-feira, com alguém tentando se inscrever.
--
-- ⚠️ Guarda por `pg_constraint` com `conrelid`, e não por `conname`
-- solto: nomes de constraint são únicos POR TABELA, não por banco. É a
-- mesma pegadinha que a `009` documenta.
-- ------------------------------------------------------------
do $$
begin
  -- 2.1
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_travados_tudo_ou_nada_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_travados_tudo_ou_nada_check
      check (
        (valor_mensal_travado is null
         and duracao_meses_travada is null
         and data_primeira_cobranca_travada is null)
        or
        (valor_mensal_travado is not null
         and duracao_meses_travada is not null
         and data_primeira_cobranca_travada is not null)
      )
      not valid;
  end if;

  -- 2.2
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_espera_sem_travado_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_espera_sem_travado_check
      check (
        safra_id is not null
        or valor_mensal_travado is null
      )
      not valid;
  end if;

  -- 2.3
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscricoes'::regclass
      and conname = 'inscricoes_paga_tem_travado_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_paga_tem_travado_check
      check (
        status not in ('confirmada', 'ativa', 'inadimplente', 'concluida')
        or valor_mensal_travado is not null
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Documentação
-- ------------------------------------------------------------
comment on column public.inscricoes.valor_mensal_travado is
  'O valor mensal COPIADO da safra no momento do checkout (D-06). NULL = '
  'esta inscrição nunca passou por um checkout — o estado de toda a '
  'lista de espera. Mesma lógica de consent_text: PROVA NÃO SE '
  'NORMALIZA. Lido por FK da safra, subir o preço faria o sistema '
  'afirmar, sobre quem assinou em março, que ela concordou com o valor '
  'de setembro. E o Stripe já travou o valor de qualquer forma.';

comment on column public.inscricoes.duracao_meses_travada is
  'A duração COPIADA da safra no checkout (D-06). Anda junto das outras '
  'duas — tudo-ou-nada. Sem ela a conta de cancel_at (D-05) não pode ser '
  'refeita: dá para dizer quanto custa o mês e não por quantos meses.';

comment on column public.inscricoes.data_primeira_cobranca_travada is
  'A data da primeira cobrança COPIADA da safra no checkout (D-06). É a '
  'âncora do trial_end (D-04) e o ponto de partida da conta de cancel_at '
  '(D-05). ⚠️ É a única data do modelo que PODE sair seca na tela: '
  'cobrança tem dia exato, ao contrário de data_inicio_aulas (D-14).';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. As três colunas existem, nullable, com os tipos de `safras`?
--    Esperado: numeric(10,2), integer, date — todas YES em is_nullable.
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'inscricoes'
  and column_name in (
    'valor_mensal_travado', 'duracao_meses_travada', 'data_primeira_cobranca_travada'
  )
order by column_name;

-- 2. Os tipos batem com os de `safras`, coluna a coluna?
--    Esperado: nenhuma linha. Cada linha devolvida é um par divergente.
select
  s.column_name as coluna_safra,
  s.data_type   as tipo_safra,
  i.column_name as coluna_travada,
  i.data_type   as tipo_travado
from information_schema.columns s
join information_schema.columns i
  on i.table_schema = 'public' and i.table_name = 'inscricoes'
 and i.column_name = case s.column_name
       when 'valor_mensal'           then 'valor_mensal_travado'
       when 'duracao_meses'          then 'duracao_meses_travada'
       when 'data_primeira_cobranca' then 'data_primeira_cobranca_travada'
     end
where s.table_schema = 'public' and s.table_name = 'safras'
  and s.column_name in ('valor_mensal', 'duracao_meses', 'data_primeira_cobranca')
  and (s.data_type is distinct from i.data_type
       or s.numeric_precision is distinct from i.numeric_precision
       or s.numeric_scale is distinct from i.numeric_scale);

-- 3. Os três CHECKs existem, e estão NOT VALID?
--    Esperado: as três linhas abaixo, todas com convalidated = false.
select conname, convalidated, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.inscricoes'::regclass
  and contype = 'c'
  and conname in (
    'inscricoes_travados_tudo_ou_nada_check',
    'inscricoes_espera_sem_travado_check',
    'inscricoes_paga_tem_travado_check'
  )
order by conname;

-- 4. NENHUMA linha existente ganhou valor travado?
--    Esperado: 0. Esta migração não escreve dado — se vier diferente de
--    zero, alguém rodou um UPDATE que não está neste arquivo.
select count(*) as linhas_com_travado
from public.inscricoes
where valor_mensal_travado is not null;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os três.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <PESSOA> e <SAFRA> por ids reais.
-- ============================================================

-- A. Valor travado sem duração → erro em
--    inscricoes_travados_tudo_ou_nada_check. Contrato pela metade.
-- insert into public.inscricoes
--   (pessoa_id, safra_id, status, valor_mensal_travado)
-- values ('<PESSOA>', '<SAFRA>', 'confirmada', 299.99);

-- B. Lista de espera com valor travado → erro em
--    inscricoes_espera_sem_travado_check. Preço acordado numa safra que
--    não existe.
-- insert into public.inscricoes
--   (pessoa_id, safra_id, status,
--    valor_mensal_travado, duracao_meses_travada, data_primeira_cobranca_travada)
-- values ('<PESSOA>', null, 'lista_espera', 299.99, 6, '2026-09-01');

-- C. Inscrição `ativa` sem os travados → erro em
--    inscricoes_paga_tem_travado_check. Alguém pagando um valor que o
--    painel não sabe dizer qual é.
-- insert into public.inscricoes (pessoa_id, safra_id, status)
-- values ('<PESSOA>', '<SAFRA>', 'ativa');
