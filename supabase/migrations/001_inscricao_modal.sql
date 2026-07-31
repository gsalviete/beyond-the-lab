-- ============================================================
-- Beyond The Lab — migração da lista de espera para inscrição
--
-- Acrescenta telefone, forma de pagamento e status à tabela `waitlist`.
-- A tabela JÁ TEM DADOS: nada aqui apaga, recria ou reescreve linha
-- existente. Todos os ALTER são aditivos.
--
-- A tabela continua com RLS ligada e ZERO policies, de propósito: todo
-- acesso é server-side com a service_role, que ignora RLS. Não crie
-- policy — isso abriria a tabela para a chave anon.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. phone — NULLABLE POR ORA
--
-- Entra como nullable porque as linhas antigas (cadastros feitos quando
-- o formulário só pedia nome e e-mail) não têm telefone, e um NOT NULL
-- aqui faria o ALTER falhar inteiro.
--
-- ⚠️ QUANDO VIRAR OBRIGATÓRIO: depois que as linhas antigas forem
-- preenchidas ou removidas, promova a coluna com
--     alter table public.waitlist alter column phone set not null;
-- Até lá, quem valida a obrigatoriedade é o Zod da rota /api/waitlist —
-- toda escrita nova passa por lá e sempre traz telefone.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists phone text;

-- ------------------------------------------------------------
-- 2. payment_choice — qual botão a pessoa clicou
--
-- O default cobre as linhas já existentes: quem se cadastrou antes da
-- modal não escolheu nada, e 'depois' é a leitura conservadora disso.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists payment_choice text not null default 'depois';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_payment_choice_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_payment_choice_check
      check (payment_choice in ('agora', 'depois'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. status — ciclo de vida da inscrição
--
-- Neste momento SÓ 'pendente' é escrito. Os outros valores já existem
-- para que o Prompt B (Stripe) não precise de nova migração:
--   pendente  — inscrição registrada, nada cobrado
--   agendado  — assinatura criada em trial, cobrança marcada
--   ativo     — primeira cobrança confirmada
--   falhou    — cobrança recusada
--   cancelado — desistência ou assinatura cancelada
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists status text not null default 'pendente';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_status_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_status_check
      check (status in ('pendente', 'agendado', 'ativo', 'falhou', 'cancelado'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Documentação (LGPD)
--
-- A finalidade declarada precisa cobrir o telefone: ele não é só
-- cadastro, é o identificador usado para montar o grupo de WhatsApp da
-- turma. Coleta com finalidade não declarada é o problema; declarar é o
-- que torna a coleta legítima.
-- ------------------------------------------------------------
comment on table public.waitlist is
  'Inscrições do Beyond The Lab. Dados pessoais coletados com consentimento '
  'explícito da titular no formulário de inscrição (LGPD art. 7º, I). '
  'Finalidades declaradas: (a) comunicação por e-mail sobre abertura e '
  'andamento das turmas; (b) contato por WhatsApp no número informado, '
  'incluindo inclusão no grupo da turma; (c) processamento da matrícula e '
  'da cobrança. Titular pode solicitar exclusão a qualquer momento. '
  'RLS ligada sem policies: acesso exclusivo server-side via service_role.';

comment on column public.waitlist.phone is
  'Celular em E.164 sem separadores — +55 + DDD + 9 dígitos, ex.: '
  '+5521999999999. Normalizado na API antes de gravar; a máscara '
  '(XX) XXXXX-XXXX existe só na interface. Nullable enquanto houver '
  'linhas anteriores à coleta de telefone; ver comentário da migração.';

comment on column public.waitlist.payment_choice is
  'Botão escolhido na inscrição: agora (pagar já) ou depois. '
  'Não indica pagamento efetuado — para isso, ver status.';

comment on column public.waitlist.status is
  'Ciclo de vida: pendente, agendado, ativo, falhou, cancelado. '
  'Somente pendente é escrito até a integração com o Stripe.';

commit;


-- ============================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO — rode separado, depois do commit
-- ============================================================

-- 1. As três colunas existem, com o nullable e os defaults esperados?
--    Esperado: phone / text / YES / null
--              payment_choice / text / NO / 'depois'::text
--              status / text / NO / 'pendente'::text
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'waitlist'
order by ordinal_position;

-- 2. Os dois CHECK entraram?
--    Esperado: 2 linhas, waitlist_payment_choice_check e waitlist_status_check
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.waitlist'::regclass and contype = 'c'
order by conname;

-- 3. Nenhuma linha antiga se perdeu, e todas ganharam os defaults?
--    Esperado: sem_telefone = total de linhas pré-migração,
--              e nenhum null em payment_choice/status
select
  count(*)                                          as total,
  count(*) filter (where phone is null)             as sem_telefone,
  count(*) filter (where payment_choice is null)    as sem_escolha,
  count(*) filter (where status is null)            as sem_status
from public.waitlist;

-- 4. RLS continua ligada e SEM policy?
--    Esperado: rls_ligada = true, policies = 0
select
  c.relrowsecurity                                   as rls_ligada,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'waitlist') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'waitlist';

-- 5. Os comentários ficaram gravados?
select
  obj_description('public.waitlist'::regclass) as comentario_tabela,
  col_description('public.waitlist'::regclass,
    (select attnum from pg_attribute
      where attrelid = 'public.waitlist'::regclass and attname = 'phone')
  ) as comentario_phone;
