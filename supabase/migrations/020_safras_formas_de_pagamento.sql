-- ============================================================
-- Beyond The Lab — as formas de pagamento da safra (D-17, `c81`)
--
-- ⛔ Rode depois da `019`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela acrescenta três colunas
--    nulas e quatro CHECKs `NOT VALID`. Toda safra existente continua
--    exatamente como está — vendendo só a mensalidade.
--
-- ============================================================
-- O QUE A SAFRA PASSA A OFERECER
-- ============================================================
--
-- Até aqui a safra tinha UM preço: `valor_mensal`, cobrado por
-- `duracao_meses` meses. A D-17 acrescenta duas formas, e cada uma é uma
-- coluna (ou um par) desta tabela:
--
--   `valor_a_vista`                          → à vista, no cartão (uma
--                                               cobrança na data da
--                                               safra) ou no Pix (na hora)
--   `valor_parcelado_total` + `parcelas_parcelado`
--                                            → N cobranças mensais que
--                                               somam o total
--
-- ⚠️ NULO SIGNIFICA "ESTA FORMA NÃO É OFERECIDA", e é por isso que as
-- colunas nascem nulas. Não é "não sabemos": é a resposta, e é a resposta
-- certa para toda safra criada antes da D-17. A landing e o formulário não
-- desenham forma com coluna nula (D-17, "Proíbe").
--
-- ⚠️ POR QUE COLUNAS E NÃO UMA TABELA `safra_formas_de_pagamento`
--
-- Uma tabela de N linhas por safra seria o desenho "genérico" — e
-- genérico é exatamente o que este domínio não é. São quatro formas
-- fixas, com quatro mecânicas diferentes no Stripe (assinatura mensal,
-- assinatura com schedule, assinatura de um ciclo, pagamento único). Uma
-- linha a mais numa tabela genérica não ganharia mecânica nenhuma: ela
-- seria uma forma de pagamento que o checkout não sabe cobrar. Coluna nova
-- obriga código novo, e é isso que se quer.
--
-- ⚠️ POR QUE O TOTAL DO PARCELADO, E NÃO O VALOR DA PARCELA
--
-- Porque o negócio fixou o TOTAL: R$ 2.000,00 em 12 vezes. 2.000 ÷ 12 não
-- fecha em centavos, e guardar a parcela (166,67) faria o total virar
-- 2.000,04 — dinheiro que ninguém combinou. A divisão em centavos (11 ×
-- 166,67 + 1 × 166,63) é derivada, num lugar só: `dividirEmParcelas`, em
-- `src/config/modalidade.ts`.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. As três colunas
--
-- `numeric(10,2)` espelhando `valor_mensal`, e pelo mesmo motivo de
-- sempre: a coluna guarda REAIS, e quem converte para centavo inteiro é o
-- Stripe, na borda (`paraCentavos`).
--
-- ⚠️ `add column ... if not exists` sem DEFAULT é operação de CATÁLOGO:
-- não reescreve a tabela, não trava escrita, não tem downtime. É por isso
-- que este arquivo pode rodar com o formulário no ar.
-- ------------------------------------------------------------
alter table public.safras
  add column if not exists valor_a_vista          numeric(10,2),
  add column if not exists valor_parcelado_total  numeric(10,2),
  add column if not exists parcelas_parcelado     int;

-- ------------------------------------------------------------
-- 2. Os CHECKs — todos `NOT VALID`
--
-- `NOT VALID` dispensa a varredura das linhas que JÁ ESTÃO na tabela e NÃO
-- dispensa nada de um INSERT ou UPDATE futuro. É a lição da `004`. Aqui é
-- indolor — as linhas existentes têm as três colunas nulas e passariam de
-- qualquer forma —, mas a regra vale sem exceção.
--
-- 2.1 À VISTA POSITIVO. Zero não é "de graça", é erro de digitação — e um
--     `price` de valor zero o Stripe recusa no checkout, na frente de
--     alguém tentando pagar.
--
-- 2.2 PARCELADO TUDO-OU-NADA. Total sem número de parcelas não diz quanto
--     se cobra por mês; parcelas sem total não diz quanto se cobra. As duas
--     metades sozinhas são uma forma de pagamento que o checkout não sabe
--     montar.
--
-- 2.3 PARCELADO COM PELO MENOS DUAS PARCELAS. Uma parcela só é o à vista
--     no cartão, que já tem coluna própria — e a mecânica do parcelado
--     (schedule com uma fase final de valor diferente) não faz sentido com
--     uma fase só.
--
-- 2.4 O TOTAL COBRE UM CENTAVO POR PARCELA. É o mínimo para a divisão em
--     centavos não produzir parcela zerada (`dividirEmParcelas` recusa o
--     mesmo caso do lado de lá). Não é limite de negócio; é a fronteira
--     onde a conta deixa de existir.
--
-- ⚠️ Guarda por `pg_constraint` com `conrelid`, e não por `conname` solto:
-- nomes de constraint são únicos POR TABELA, não por banco.
-- ------------------------------------------------------------
do $$
begin
  -- 2.1
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.safras'::regclass
      and conname = 'safras_valor_a_vista_positivo_check'
  ) then
    alter table public.safras
      add constraint safras_valor_a_vista_positivo_check
      check (valor_a_vista is null or valor_a_vista > 0)
      not valid;
  end if;

  -- 2.2
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.safras'::regclass
      and conname = 'safras_parcelado_tudo_ou_nada_check'
  ) then
    alter table public.safras
      add constraint safras_parcelado_tudo_ou_nada_check
      check (
        (valor_parcelado_total is null and parcelas_parcelado is null)
        or
        (valor_parcelado_total is not null and parcelas_parcelado is not null)
      )
      not valid;
  end if;

  -- 2.3
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.safras'::regclass
      and conname = 'safras_parcelas_minimo_check'
  ) then
    alter table public.safras
      add constraint safras_parcelas_minimo_check
      check (parcelas_parcelado is null or parcelas_parcelado >= 2)
      not valid;
  end if;

  -- 2.4
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.safras'::regclass
      and conname = 'safras_parcelado_centavo_por_parcela_check'
  ) then
    alter table public.safras
      add constraint safras_parcelado_centavo_por_parcela_check
      check (
        valor_parcelado_total is null
        or valor_parcelado_total * 100 >= parcelas_parcelado
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Documentação
-- ------------------------------------------------------------
comment on column public.safras.valor_a_vista is
  'Preço À VISTA desta safra, em reais (D-17). NULL = forma não oferecida. '
  'Vale para as duas formas à vista: cartão (assinatura de UM ciclo, '
  'cobrada em data_primeira_cobranca — a D-04 continua valendo) e Pix '
  '(pagamento único, cobrado NA INSCRIÇÃO — a única exceção à D-04, porque '
  'Pix não guarda meio de pagamento). Mudar este valor não afeta quem já '
  'comprou (D-06): o contrato está copiado na inscrição.';

comment on column public.safras.valor_parcelado_total is
  'TOTAL do parcelado, em reais (D-17). NULL = forma não oferecida. Anda '
  'junto de parcelas_parcelado (tudo-ou-nada). É o total, e não a parcela, '
  'porque o negócio fixou o total: R$ 2.000,00 em 12 vezes não fecha em '
  'centavos, e a divisão (11 × 166,67 + 1 × 166,63) é derivada em '
  'dividirEmParcelas (src/config/modalidade.ts).';

comment on column public.safras.parcelas_parcelado is
  'Em quantas cobranças MENSAIS o parcelado se divide (D-17). NULL = forma '
  'não oferecida. Mínimo 2 — uma parcela só é o à vista no cartão. NÃO É '
  'A DURAÇÃO DO CURSO: o parcelado de 12 vezes cobra 6 meses depois de as '
  'aulas acabarem, e é isso que foi combinado.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. As três colunas existem, nullable, com os tipos certos?
--    Esperado: valor_a_vista e valor_parcelado_total numeric(10,2),
--    parcelas_parcelado integer — todas YES em is_nullable.
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'safras'
  and column_name in ('valor_a_vista', 'valor_parcelado_total', 'parcelas_parcelado')
order by column_name;

-- 2. Os quatro CHECKs existem, e estão NOT VALID?
--    Esperado: as quatro linhas, todas com convalidated = false.
select conname, convalidated, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.safras'::regclass
  and contype = 'c'
  and conname in (
    'safras_valor_a_vista_positivo_check',
    'safras_parcelado_tudo_ou_nada_check',
    'safras_parcelas_minimo_check',
    'safras_parcelado_centavo_por_parcela_check'
  )
order by conname;

-- 3. NENHUMA safra existente ganhou forma nova?
--    Esperado: 0. Esta migração não escreve dado.
select count(*) as safras_com_forma_nova
from public.safras
where valor_a_vista is not null or valor_parcelado_total is not null;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os dois.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <SAFRA> por um id real, e rode dentro de `begin; ... rollback;`.
-- ============================================================

-- A. Total sem número de parcelas → erro em
--    safras_parcelado_tudo_ou_nada_check.
-- update public.safras set valor_parcelado_total = 2000 where id = '<SAFRA>';

-- B. Parcelado de uma parcela só → erro em safras_parcelas_minimo_check.
-- update public.safras
--   set valor_parcelado_total = 2000, parcelas_parcelado = 1
--   where id = '<SAFRA>';
