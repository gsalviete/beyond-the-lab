-- ============================================================
-- Beyond The Lab — `cupons`: nascem aqui, são espelhados no Stripe
--
-- ⛔ Rode DEPOIS da `012`. O fim deste arquivo acrescenta a FK
--    `assinaturas.cupom_id → cupons.id`, que precisa das duas pontas.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Cria a tabela vazia.
--
-- ============================================================
-- A DIREÇÃO É UMA SÓ, E ELA É A DECISÃO (D-07)
-- ============================================================
--
--   nosso banco  ──cria──►  Stripe
--
-- NUNCA o contrário. O cupom nasce nesta tabela, e a nossa API cria o
-- `coupon` correspondente no Stripe e guarda o id em
-- `stripe_coupon_id`. Cupom criado pelo Dashboard não existe para o
-- sistema: ele não aparece no painel, não tem contagem de uso, e a
-- Giovana não teria como saber que ele existe.
--
-- *Por quê:* a D-07 diz que o painel é a única ferramenta dela. Duas
-- ferramentas é uma a mais, e "criei um cupom no Stripe e ele não
-- aparece no site" é exatamente o tipo de confusão que ela não tem como
-- diagnosticar sozinha.
--
-- ⚠️ `stripe_coupon_id` É NULLABLE, E A NULIDADE TEM SIGNIFICADO: o
-- cupom existe no nosso banco mas ainda não foi espelhado. É um estado
-- REAL e transitório — a criação no Stripe é uma chamada de rede, e ela
-- pode falhar depois de a linha já estar gravada. Um `not null` aqui
-- obrigaria a fazer as duas coisas numa transação que atravessa a
-- fronteira do banco, que é justamente o que não existe.
--
-- Quem trata isso é o `c48`: cupom sem `stripe_coupon_id` não pode ser
-- aplicado, e o painel mostra "não publicado" em vez de fingir que está
-- pronto.
--
-- RLS ligada e ZERO policies. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. A tabela
--
-- `codigo` é a chave que a aluna digita. Unique, e a unicidade é sobre
-- o valor NORMALIZADO — ver a seção 2.
--
-- `tipo` e `valor` andam juntos, e a leitura de `valor` MUDA conforme o
-- tipo. É a decisão mais fácil de errar deste arquivo:
--
--   primeiro_mes  → `valor` é PERCENTUAL (20 = 20% no 1º mês)
--   todos_meses   → `valor` é PERCENTUAL (15 = 15% em todas)
--   meses_gratis  → `valor` é CONTAGEM DE MESES (1 = 1 mês grátis)
--
-- Duas colunas separadas (`percentual` e `meses`) seriam mais explícitas
-- e criariam o estado inválido de ter as duas preenchidas, ou nenhuma.
-- O CHECK da seção 3 é o que fecha a ambiguidade da coluna única.
--
-- `safra_id` NULLABLE: nulo significa "vale em QUALQUER safra". Não é
-- ausência de dado, é um valor de negócio — o cupom de campanha que a
-- Giovana quer que funcione na turma que estiver aberta.
-- ------------------------------------------------------------
create table if not exists public.cupons (
  id      uuid primary key default gen_random_uuid(),
  codigo  text not null,

  tipo   text    not null,
  valor  numeric(10,2) not null,

  -- espelho — ver o cabeçalho sobre a nulidade
  stripe_coupon_id  text unique,

  -- null = vale em qualquer safra
  safra_id  uuid references public.safras(id) on delete restrict,

  usos_max     int,
  usos_atuais  int  not null default 0,
  expira_em    timestamptz,
  ativo        boolean not null default true,

  criado_em  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. O unique de `codigo` é FUNCIONAL, sobre `upper(codigo)`
--
-- A aluna digita `bemvinda`, `BemVinda` ou `BEMVINDA` e as três têm que
-- ser o mesmo cupom. Um unique sobre a coluna crua aceitaria as três
-- como cupons distintos, e o primeiro suporte seria "meu cupom não
-- funciona" sobre um cupom que existe três vezes.
--
-- É a mesma forma de `waitlist_email_lower_key` — o unique funcional
-- sobre `lower(email)` que a `000` documenta —, e ela está aqui pelo
-- mesmo motivo: a normalização vira propriedade do BANCO, e não uma
-- linha de código que alguém pode esquecer de chamar. Constraint no
-- banco vence validação na aplicação (REPORT §9.9).
--
-- `upper` e não `lower` porque o modelo diz "maiúsculo, sem espaço" —
-- é como cupom se escreve em toda parte, e a escolha só precisa ser
-- consistente.
-- ------------------------------------------------------------
create unique index if not exists cupons_codigo_upper_idx
  on public.cupons (upper(codigo));

-- ------------------------------------------------------------
-- 3. Os CHECKs — todos `NOT VALID`
--
-- ⚠️ `NOT VALID` numa tabela que acabou de ser criada e está VAZIA é,
-- tecnicamente, indiferente: não há linha para dispensar. Está aqui
-- assim mesmo, e não é cerimônia:
--
--   1. a regra do projeto é "todo CHECK novo entra NOT VALID" (lição da
--      `004`), e uma exceção "porque aqui não fazia diferença" é
--      exatamente como uma regra deixa de ser seguida;
--   2. se esta migração for rodada num banco onde a tabela JÁ existe com
--      linhas — staging restaurado de um dump, por exemplo —, o
--      `if not exists` da seção 1 não recria nada e estes CHECKs
--      passariam a varrer dados reais. `NOT VALID` é o que mantém o
--      arquivo idempotente de verdade nesse caso.
--
-- 3.1 O domínio de `tipo`.
-- 3.2 `valor` positivo — desconto de zero ou negativo não é desconto.
-- 3.3 A leitura de `valor` conforme o tipo: percentual não passa de 100;
--     meses grátis é inteiro.
-- 3.4 `usos_atuais` nunca passa de `usos_max` quando há limite.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cupons'::regclass and conname = 'cupons_tipo_check'
  ) then
    alter table public.cupons
      add constraint cupons_tipo_check
      check (tipo in ('primeiro_mes', 'todos_meses', 'meses_gratis'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cupons'::regclass and conname = 'cupons_valor_positivo_check'
  ) then
    alter table public.cupons
      add constraint cupons_valor_positivo_check
      check (valor > 0)
      not valid;
  end if;

  -- O CHECK que desfaz a ambiguidade da coluna `valor`. Sem ele, um
  -- `todos_meses` com valor 300 seria "300% de desconto" — o Stripe
  -- recusaria, mas só na hora de espelhar, e o cupom já estaria no
  -- painel parecendo válido.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cupons'::regclass and conname = 'cupons_valor_por_tipo_check'
  ) then
    alter table public.cupons
      add constraint cupons_valor_por_tipo_check
      check (
        (tipo in ('primeiro_mes', 'todos_meses') and valor <= 100)
        or
        (tipo = 'meses_gratis' and valor = trunc(valor))
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cupons'::regclass and conname = 'cupons_usos_check'
  ) then
    alter table public.cupons
      add constraint cupons_usos_check
      check (usos_atuais >= 0 and (usos_max is null or usos_atuais <= usos_max))
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Índices de consulta
-- ------------------------------------------------------------
create index if not exists cupons_safra_id_idx on public.cupons (safra_id);
create index if not exists cupons_ativo_idx    on public.cupons (ativo);

-- ------------------------------------------------------------
-- 5. A FK que faltava na `012`
--
-- `assinaturas.cupom_id` foi criada como uuid solto porque `cupons`
-- ainda não existia. Este é o primeiro momento em que as duas pontas
-- existem, e é aqui que a integridade referencial entra.
--
-- `on delete restrict`: apagar um cupom que já foi usado apagaria a
-- explicação de por que aquela assinatura custa menos. O caminho para
-- tirar um cupom de circulação é `ativo = false`, que é o que o painel
-- oferece — não `delete`.
--
-- ⚠️ Guarda por `pg_constraint`, e o escopo é POR TABELA: `conname` não
-- é único no banco (nomes de constraint são únicos por relação), então a
-- consulta filtra por `conrelid`. É a mesma pegadinha que a `009`
-- documenta.
-- ------------------------------------------------------------
--
-- ⚠️ A EXISTÊNCIA DE `assinaturas` É CONFERIDA POR `to_regclass`, E NÃO
-- POR `::regclass` DIRETO. O cast levanta `42P01` quando a relação não
-- existe — ele não devolve nulo —, então num banco onde a `012` não
-- rodou este bloco abortaria com um erro sobre catálogo em vez da
-- mensagem que explica o que fazer. É a mesma armadilha que a `009`
-- documenta, na sua outra forma: lá era o `if` do PL/pgSQL resolvendo
-- nomes antes de curto-circuitar; aqui é o cast avaliado antes do
-- `not exists`.
do $$
begin
  if to_regclass('public.assinaturas') is null then
    raise exception
      'RECUSADO: public.assinaturas nao existe. Rode a 012 antes desta.'
      using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assinaturas'::regclass
      and conname = 'assinaturas_cupom_id_fkey'
  ) then
    alter table public.assinaturas
      add constraint assinaturas_cupom_id_fkey
      foreign key (cupom_id) references public.cupons(id) on delete restrict;
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. Fechadura
-- ------------------------------------------------------------
alter table public.cupons enable row level security;
revoke all on public.cupons from anon, authenticated;

-- ------------------------------------------------------------
-- 7. Documentação
-- ------------------------------------------------------------
comment on table public.cupons is
  'Cupons de desconto. NASCEM AQUI e são espelhados no Stripe pela nossa '
  'API (D-07) — nunca o contrário. Cupom criado no Dashboard do Stripe '
  'não existe para o sistema. RLS ligada sem policies: acesso exclusivo '
  'server-side via service_role.';

comment on column public.cupons.codigo is
  'O que a aluna digita. Unique de forma FUNCIONAL sobre upper(codigo): '
  'bemvinda, BemVinda e BEMVINDA são o mesmo cupom. Mesma forma do '
  'unique sobre lower(email) da waitlist — a normalização é propriedade '
  'do banco, não uma linha que alguém pode esquecer de chamar.';

comment on column public.cupons.valor is
  'A LEITURA MUDA CONFORME O TIPO: percentual para primeiro_mes e '
  'todos_meses (20 = 20%), contagem de meses para meses_gratis (1 = 1 '
  'mês grátis). O CHECK cupons_valor_por_tipo_check é o que impede um '
  '300% de existir.';

comment on column public.cupons.stripe_coupon_id is
  'Id do coupon espelhado no Stripe. NULL tem significado: o cupom '
  'existe aqui e ainda não foi espelhado — estado real, porque a criação '
  'no Stripe é rede e pode falhar depois de a linha estar gravada. '
  'Cupom sem este id NÃO pode ser aplicado.';

comment on column public.cupons.safra_id is
  'Safra em que o cupom vale, ou NULL para "vale em qualquer safra". O '
  'nulo é valor de negócio, não ausência de dado.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A tabela existe, com as colunas esperadas?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'cupons'
order by ordinal_position;

-- 2. O unique FUNCIONAL sobre upper(codigo) existe?
--    Esperado: cupons_codigo_upper_idx ... UNIQUE ... (upper(codigo))
--    Se ele estiver sobre `codigo` cru, BEMVINDA e bemvinda viram dois
--    cupons diferentes.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'cupons'
order by indexname;

-- 3. Os quatro CHECKs existem, e estão NOT VALID?
--    Esperado: quatro linhas, convalidated = false.
select conname, convalidated, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.cupons'::regclass and contype = 'c'
order by conname;

-- 4. A FK de assinaturas.cupom_id finalmente existe?
--    Esperado: assinaturas_cupom_id_fkey → cupons, confdeltype = 'r'.
--    É a FK que a 012 deixou pendente.
select con.conname, cl.relname as aponta_para, con.confdeltype as on_delete
from pg_constraint con
join pg_class cl on cl.oid = con.confrelid
where con.conrelid = 'public.assinaturas'::regclass and con.contype = 'f'
order by con.conname;

-- 5. RLS ligada, sem policy, sem privilégio para anon/authenticated?
select
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'cupons') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'cupons';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'cupons'
  and grantee in ('anon', 'authenticated');

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os quatro.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- ============================================================

-- A. Mesmo código em caixas diferentes → erro em cupons_codigo_upper_idx.
--    ⚠️ ESTE é o que um unique sobre a coluna crua NÃO pega.
-- insert into public.cupons (codigo, tipo, valor) values
--   ('BEMVINDA', 'primeiro_mes', 20),
--   ('bemvinda', 'primeiro_mes', 20);

-- B. Percentual acima de 100 → erro em cupons_valor_por_tipo_check.
-- insert into public.cupons (codigo, tipo, valor)
--   values ('METADE', 'todos_meses', 300);

-- C. Meses grátis fracionado → erro em cupons_valor_por_tipo_check.
-- insert into public.cupons (codigo, tipo, valor)
--   values ('MEIOMES', 'meses_gratis', 1.5);

-- D. Tipo fora do domínio → erro em cupons_tipo_check.
-- insert into public.cupons (codigo, tipo, valor)
--   values ('FRETE', 'frete_gratis', 10);
