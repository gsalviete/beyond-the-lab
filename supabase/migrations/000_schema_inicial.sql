-- ============================================================
-- Beyond The Lab — SCHEMA INICIAL, extraído de produção
--
-- ⛔⛔ ESTE ARQUIVO NUNCA RODA EM PRODUÇÃO. ⛔⛔
--
-- Ele DOCUMENTA o passado; não o constrói. O banco de produção já está
-- exatamente assim desde antes deste arquivo existir. Rodá-lo lá seria,
-- na melhor das hipóteses, uma sequência de erros de "já existe" — e na
-- pior, o seed da seção 6 escrevendo linhas falsas ao lado de gente
-- real.
--
-- A seção 0 é um guarda que RECUSA a execução se a `waitlist` já tiver
-- qualquer linha. A promessa acima é mecânica, não disciplina.
--
-- PARA QUE ELE SERVE
--
--   1. Montar um ambiente NOVO do zero — o projeto de staging que o
--      `c17` exige como pré-requisito.
--   2. Ser o registro do que existe, para que `001`–`004` deixem de ser
--      um conjunto de ALTERs sobre uma tabela que ninguém sabe de onde
--      veio.
--
-- POR QUE ELE FALTAVA — a tensão 8.3 do REPORT, em concreto
--
-- `public.waitlist` foi criada no Studio, à mão, e NUNCA virou arquivo.
-- O `001` já a encontra existindo e só acrescenta colunas. Quer dizer
-- que estes objetos viveram meses em produção sem uma linha de SQL
-- versionado que os descrevesse:
--
--   - as colunas `id`, `email`, `name`, `created_at`
--   - `waitlist_pkey`
--   - `waitlist_created_at_idx`
--   - `waitlist_email_lower_key`  ← e este é o que mais dói
--
-- O `waitlist_email_lower_key` é um UNIQUE FUNCIONAL sobre
-- `lower(email)`, e não um unique comum sobre `email`. A diferença é
-- material: com unique comum, 'Maria@x.com' e 'maria@x.com' seriam duas
-- linhas. É a constraint que produz o `23505` de onde nasce o caminho de
-- duplicata da rota — o comportamento mais deliberado do sistema (REPORT
-- §9.2) — e ela não estava escrita em lugar nenhum.
--
--   ⚠️ `007_pessoas.sql` usa `lower(email)` pelo mesmo raciocínio,
--   escrito lá antes de este extrato existir. Agora se sabe que não é
--   decisão nova: é o que produção já fazia. Continuidade, não invenção.
--
-- FIDELIDADE: ESTE ARQUIVO SEGUE O BANCO, NÃO OS ARQUIVOS
--
-- Onde `001`–`004` e o banco discordarem, o banco vence — ele é o que
-- está no ar. Conferido contra o extrato de produção, e os pontos onde
-- alguém poderia esperar outra coisa:
--
--   - `waitlist.phone` é NULLABLE. A rota sempre exigiu telefone, mas a
--     coluna nasceu depois das primeiras linhas e nunca foi promovida.
--   - `waitlist.payment_choice` tem `default 'depois'` e é NOT NULL.
--   - `waitlist.status` tem `default 'pendente'` e é NOT NULL.
--   - `waitlist_status_check` aceita SEIS valores, com `lista_espera`.
--     Isto NÃO é divergência: o `001` lista cinco, e o `002` faz
--     `drop constraint` e recria com os seis. Repositório e banco batem.
--   - Os três CHECKs da `004` estão aplicados e `NOT VALID`.
--   - `turmas` não tem nenhum objeto fora do que `002` descreve.
--
-- ⚠️ NÃO CONFERIDO — não veio no extrato. As linhas de RLS e `revoke`
-- da seção 5 vêm das migrações `002`/`003`, não de produção. Rode a
-- verificação nº 5 no fim deste arquivo contra o banco real e me diga se
-- diverge.
--
-- Rode no SQL Editor de um projeto NOVO. É idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. O GUARDA
--
-- Um arquivo cujo cabeçalho diz "nunca rode em produção" depende de
-- alguém ler o cabeçalho. Este bloco não depende.
--
-- Se a `waitlist` existe e tem qualquer linha, este não é um ambiente
-- novo — é um banco com dados, e a seção 6 escreveria pessoas falsas ao
-- lado de pessoas reais. A transação inteira aborta aqui.
-- ------------------------------------------------------------
-- ⚠️⚠️ O `execute` É OBRIGATÓRIO. NÃO "SIMPLIFIQUE" PARA A FORMA DIRETA.
--
-- A versão que qualquer um escreveria — e que eu escrevi primeiro — é:
--
--     if to_regclass('public.waitlist') is not null
--        and exists (select 1 from public.waitlist)
--     then ...
--
-- Ela PARECE certa: o `to_regclass` devolve null quando a tabela não
-- existe, e o `and` curto-circuita. Só que ela quebra exatamente no
-- caso que veio proteger, num banco vazio:
--
--     ERROR: 42P01: relation "public.waitlist" does not exist
--     CONTEXT: PL/pgSQL function inline_code_block line 3 at IF
--
-- POR QUÊ: o PL/pgSQL avalia a condição de um `if` preparando-a como UM
-- ÚNICO comando SQL (`select <condição>`). O parser resolve TODOS os
-- nomes de relação da expressão antes de a expressão começar a ser
-- avaliada. Quando `public.waitlist` não existe, ele falha no parse — e
-- o curto-circuito do `and` nunca chega a acontecer, porque não há o que
-- curto-circuitar: o comando ainda nem foi planejado.
--
-- É por isso que `to_regclass()` existe. Ela responde "esta relação
-- existe?" sem citar a relação como tabela — recebe uma STRING, não um
-- identificador, e por isso não passa pelo resolvedor de nomes.
--
-- O `execute` resolve a segunda metade: ele adia o parse para o momento
-- da execução, que só é alcançado DENTRO do ramo que já confirmou a
-- existência da tabela.
--
-- ⚠️ A mesma armadilha vale para qualquer expressão do PL/pgSQL —
-- `if`, `while`, `select ... into`, atribuição — que cite uma relação
-- que pode não existir na ordem de execução. Condição sobre catálogo
-- (`pg_constraint`, `pg_class`) é sempre segura, porque o catálogo
-- sempre existe.
do $$
declare
  tem_linha boolean;
begin
  if to_regclass('public.waitlist') is not null then
    execute 'select exists (select 1 from public.waitlist)' into tem_linha;

    if tem_linha then
      raise exception
        'RECUSADO: public.waitlist ja tem linhas. Este arquivo documenta o '
        'schema inicial e so roda em ambiente NOVO e VAZIO. Ver o cabecalho.'
        using errcode = 'raise_exception';
    end if;
  end if;
end $$;

-- `gen_random_uuid()` é nativa do Postgres 13+ e o Supabase roda bem
-- acima disso. Não é preciso `create extension pgcrypto` — e pedir a
-- extensão sem precisar dela é o tipo de linha que se copia para sempre
-- sem ninguém saber por quê.

-- ============================================================
-- 1. public.turmas
--
-- Fiel ao extrato. Comentários resumidos — a íntegra do raciocínio está
-- na `002`, que é onde esta tabela nasceu de verdade.
--
-- ⚠️ Na `005` ela é RENOMEADA para `safras`. Se você está montando
-- staging para testar o corte 1, esta tabela existe aqui só para a `005`
-- ter o que renomear.
-- ============================================================
create table if not exists public.turmas (
  id                      uuid           primary key default gen_random_uuid(),
  nome                    text           not null,
  slug                    text           not null unique,
  data_inicio_aulas       date           not null,
  data_primeira_cobranca  date           not null,
  valor_mensal            numeric(10,2)  not null,
  duracao_meses           integer        not null,
  inscricoes_abertas      boolean        not null default false,
  created_at              timestamptz    not null default now()
);

-- Cobrar depois de a aula começar seria erro de digitação virando
-- problema de negócio. O banco recusa.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'turmas_cobranca_antes_das_aulas_check'
      and conrelid = to_regclass('public.turmas')
  ) then
    alter table public.turmas
      add constraint turmas_cobranca_antes_das_aulas_check
      check (data_primeira_cobranca <= data_inicio_aulas);
  end if;
end $$;

-- No máximo UMA turma aberta. `((true))` como expressão indexada: toda
-- linha aberta indexa o mesmo valor, então a segunda viola o unique.
-- Sem isto, "qual é a turma aberta?" deixa de ter resposta única.
create unique index if not exists turmas_uma_aberta_idx
  on public.turmas ((true))
  where inscricoes_abertas;

-- ============================================================
-- 2. public.waitlist
--
-- ⚠️ ESTA É A PARTE QUE NUNCA EXISTIU EM ARQUIVO.
--
-- As quatro primeiras colunas e os três índices da seção 3 foram
-- criados no Studio. O resto veio de `001`–`003`, e está aqui na forma
-- final que produção tem hoje — não na sequência histórica de ALTERs.
--
-- Nullability conforme o extrato, e ela conta a história do arquivo:
-- tudo que nasceu depois das primeiras linhas é nullable, porque um
-- `not null` teria feito o ALTER falhar numa tabela com dados.
-- ============================================================
create table if not exists public.waitlist (
  -- núcleo, criado no Studio
  id               uuid         primary key default gen_random_uuid(),
  email            text         not null,
  name             text         not null,
  created_at       timestamptz  not null default now(),

  -- migração 001
  -- `phone` é NULLABLE em produção: a coluna nasceu depois das primeiras
  -- linhas. A rota sempre exigiu telefone, mas a coluna nunca foi
  -- promovida a not null — e promovê-la agora exigiria decidir o que
  -- fazer com as linhas antigas.
  phone            text,
  payment_choice   text         not null default 'depois',
  status           text         not null default 'pendente',

  -- migração 002
  turma_id         uuid,
  grupo            text,
  nivel_ingles     text,
  curso            text,
  periodo          text,
  disponibilidade  text[],

  -- migração 003 — o registro probatório
  consent          boolean,
  consent_at       timestamptz,
  consent_text     text
);

-- ------------------------------------------------------------
-- 3. Índices da waitlist — os três, com o funcional em destaque
-- ------------------------------------------------------------

-- ⚠️ O UNIQUE É SOBRE `lower(email)`, NÃO SOBRE `email`.
--
-- É esta constraint que levanta `23505` quando alguém se cadastra duas
-- vezes, e é desse erro que nasce a resposta de duplicata idêntica à de
-- sucesso — a decisão contraintuitiva mais deliberada do sistema, que
-- impede o formulário de virar um oráculo de "este e-mail está no
-- banco?".
--
-- Ela viveu meses em produção sem estar escrita em lugar nenhum.
create unique index if not exists waitlist_email_lower_key
  on public.waitlist (lower(email));

-- "As inscrições mais recentes primeiro" — a consulta que a professora
-- faz no Studio.
create index if not exists waitlist_created_at_idx
  on public.waitlist (created_at desc);

-- "Todas as inscrições da turma X" — como os grupos são montados.
create index if not exists waitlist_turma_id_idx
  on public.waitlist (turma_id);

-- ------------------------------------------------------------
-- 4. Constraints VALIDADAS da waitlist
--
-- Estas o banco verifica em toda linha, nova e antiga. Elas puderam
-- nascer assim porque nenhuma linha existente as violava: são regras de
-- DOMÍNIO ("se o valor existe, ele faz sentido"), e valor ausente passa.
--
-- As três de OBRIGATORIEDADE são outra história e estão na seção 7,
-- depois do seed. Ver a nota de ordem lá.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_payment_choice_check'
      and conrelid = to_regclass('public.waitlist')) then
    alter table public.waitlist
      add constraint waitlist_payment_choice_check
      check (payment_choice in ('agora', 'depois'));
  end if;

  -- SEIS valores, com 'lista_espera'. O `001` criou com cinco; o `002`
  -- dropou e recriou com seis. Produção e repositório concordam.
  if not exists (select 1 from pg_constraint where conname = 'waitlist_status_check'
      and conrelid = to_regclass('public.waitlist')) then
    alter table public.waitlist
      add constraint waitlist_status_check
      check (status in (
        'lista_espera',  -- cadastro com as inscrições fechadas; sem turma
        'pendente',      -- inscrita numa turma, nada cobrado ainda
        'agendado',      -- assinatura criada em trial (nunca usado)
        'ativo',         -- primeira cobrança confirmada (nunca usado)
        'falhou',        -- cobrança recusada (nunca usado)
        'cancelado'      -- desistência ou assinatura cancelada
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'waitlist_nivel_ingles_check'
      and conrelid = to_regclass('public.waitlist')) then
    alter table public.waitlist
      add constraint waitlist_nivel_ingles_check
      check (nivel_ingles is null
             or nivel_ingles in ('basico', 'intermediario', 'avancado'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'waitlist_disponibilidade_check'
      and conrelid = to_regclass('public.waitlist')) then
    alter table public.waitlist
      add constraint waitlist_disponibilidade_check
      check (
        disponibilidade is null
        or (cardinality(disponibilidade) >= 1
            and disponibilidade <@ array['seg','ter','qua','qui','sex']::text[])
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'waitlist_turma_id_fkey'
      and conrelid = to_regclass('public.waitlist')) then
    alter table public.waitlist
      add constraint waitlist_turma_id_fkey
      foreign key (turma_id) references public.turmas(id) on delete restrict;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Fechadura
--
-- ⚠️ NÃO CONFERIDA CONTRA PRODUÇÃO — não veio no extrato. Vem das
-- migrações `002`/`003`. Rode a verificação nº 5 e compare.
--
-- Sem policy, RLS nega tudo: `anon` e `authenticated` não leem nem
-- escrevem nada. A `service_role` ignora RLS, e é por isso que as
-- tabelas podem ficar sem policy nenhuma. O `revoke` é o cinto além do
-- suspensório. NÃO CRIE POLICY — isso abriria as tabelas para a `anon`.
-- ------------------------------------------------------------
alter table public.turmas   enable row level security;
alter table public.waitlist enable row level security;
revoke all on public.turmas   from anon, authenticated;
revoke all on public.waitlist from anon, authenticated;

-- ============================================================
-- 6. SEED DE STAGING — a FORMA da base real, sem os dados dela
--
-- ⚠️ NENHUM DADO REAL AQUI. Nomes, e-mails e telefones são inventados e
-- obviamente falsos. Copiar linhas de produção para staging seria
-- espalhar dado pessoal sob LGPD para um segundo banco, com um segundo
-- conjunto de credenciais e nenhuma necessidade — o que o `c17` precisa
-- exercitar é a FORMA das linhas, não o conteúdo.
--
-- ⚠️⚠️ A ORDEM DESTA SEÇÃO É O PONTO INTEIRO DELA.
--
-- Estas linhas VIOLAM os três CHECKs da seção 7. É de propósito: elas
-- reproduzem exatamente o passivo que a base real carrega, e é esse
-- passivo que o `c17` tem que conseguir migrar sem falsificar nada.
--
-- `NOT VALID` dispensa a varredura das linhas que JÁ ESTÃO na tabela no
-- instante do ALTER. Ele NÃO dispensa nada de um INSERT futuro. Logo:
--
--   seed ANTES  → as linhas viram "passado" e são dispensadas  ✅
--   seed DEPOIS → cada INSERT é verificado e a transação aborta ❌
--
-- É a mesma pegada que aparece um nível abaixo, entre a `009` e a `010`.
-- Aqui o passado nasce dentro da própria transação.
-- ============================================================

-- A turma que já existe de fato, com os valores que a `002` semeia.
insert into public.turmas
  (nome, slug, data_inicio_aulas, data_primeira_cobranca,
   valor_mensal, duracao_meses, inscricoes_abertas)
values
  ('Turma Setembro 2026', 'setembro-2026', '2026-09-01', '2026-08-28',
   299.99, 6, false)
on conflict (slug) do nothing;

-- ⚠️ `inscricoes_abertas = false`, e não `true` como no seed da `002`.
-- O corte 1 sobe com a safra fechada: sem checkout (c35), safra aberta
-- não significa nada, e o ramo `pendente_pagamento` fica inalcançável de
-- propósito. Staging tem que reproduzir a produção do corte 1, não a de
-- hoje.

-- ------------------------------------------------------------
-- As quatro formas que a base real tem. Cada uma existe para exercitar
-- um caminho diferente do `c17`.
-- ------------------------------------------------------------
insert into public.waitlist
  (email, name, phone, payment_choice, status, turma_id, grupo,
   nivel_ingles, curso, periodo, disponibilidade,
   consent, consent_at, consent_text)
select v.email, v.name, v.phone, v.payment_choice, v.status,
       case when v.tem_turma then t.id else null end,
       v.grupo, v.nivel_ingles, v.curso, v.periodo, v.disponibilidade,
       v.consent, v.consent_at, v.consent_text
from public.turmas t,
(values
  -- ① COMPLETA — o que a rota grava hoje. Passa em todos os CHECKs.
  --    É a linha de controle: se o `c17` a migrar errado, o erro não é
  --    do passivo, é da lógica.
  ('ana.staging@exemplo.invalid', 'Ana Staging', '+5521999990001',
   'depois', 'pendente', true, null,
   'basico', 'Biomedicina', '1º ao 3º', array['seg','qua'],
   true, now(), 'Texto de consentimento de staging — nao e a redacao real.'),

  -- ② PRÉ-003 — consentimento inteiro nulo, perfil preenchido.
  --    Cadastro anterior ao registro probatório. `null` = NÃO SABEMOS,
  --    e o `c17` tem que trazer assim. ZERO BACKFILL.
  --    Viola: waitlist_consentimento_obrigatorio_check
  ('bruna.staging@exemplo.invalid', 'Bruna Staging', '+5521999990002',
   'depois', 'pendente', true, 'Grupo A',
   'intermediario', 'Enfermagem', '4º ao 6º', array['ter'],
   null, null, null),

  -- ③ A LINHA DO INCIDENTE DA 004 — perfil E consentimento nulos, com
  --    `status = 'pendente'` e `turma_id` NULO ao mesmo tempo. Escrita
  --    por um build antigo que continuou no ar depois da migração.
  --    Não está só incompleta: afirma pertencer a uma turma e não
  --    aponta para nenhuma.
  --    Viola os TRÊS CHECKs da seção 7. É a linha mais importante do
  --    seed — se o `c17` engasgar em alguma, vai ser nesta.
  ('carla.staging@exemplo.invalid', 'Carla Staging', '+5521999990003',
   'depois', 'pendente', false, null,
   null, null, null, null,
   null, null, null),

  -- ④ LISTA DE ESPERA sem consentimento, e SEM TELEFONE.
  --    `phone` é nullable em produção; esta linha exercita isso.
  --    O `c17` insere em `pessoas.telefone`, que é NOT NULL — se ele não
  --    tratar o caso, falha aqui. Melhor descobrir em staging.
  --    Viola: consentimento + perfil
  ('diana.staging@exemplo.invalid', 'Diana Staging', null,
   'depois', 'lista_espera', false, null,
   null, null, null, null,
   null, null, null)
) as v(email, name, phone, payment_choice, status, tem_turma, grupo,
       nivel_ingles, curso, periodo, disponibilidade,
       consent, consent_at, consent_text)
where t.slug = 'setembro-2026'
on conflict do nothing;

-- ============================================================
-- 7. Os três CHECKs NOT VALID da migração 004
--
-- DEPOIS do seed, e é obrigatório que seja depois. Ver a seção 6.
--
-- Em produção eles já estão aplicados — o extrato confirma os três com
-- `NOT VALID`. Aqui eles são recriados na mesma posição relativa que
-- tiveram lá: a tabela já tinha o passivo quando eles chegaram.
--
-- O que `NOT VALID` faz, e é a peça central da `004`:
--   - toda linha NOVA passa a ser verificada, sempre;
--   - as que já estão na tabela NÃO são verificadas nem reescritas — o
--     ALTER nem as lê;
--   - não é uma constraint "fraca": é plena daqui para a frente.
--
-- É a forma de obrigar sem falsificar histórico. Nenhum UPDATE, nenhum
-- backfill, nenhum default. Consentimento presumido continua não sendo
-- consentimento.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_perfil_obrigatorio_check'
      and conrelid = to_regclass('public.waitlist')
  ) then
    alter table public.waitlist
      add constraint waitlist_perfil_obrigatorio_check
      check (
        nivel_ingles        is not null
        and curso           is not null
        and periodo         is not null
        and disponibilidade is not null
        and cardinality(disponibilidade) >= 1
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_consentimento_obrigatorio_check'
      and conrelid = to_regclass('public.waitlist')
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

  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_turma_status_coerentes_check'
      and conrelid = to_regclass('public.waitlist')
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

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
--
-- As saídas 1 a 4 devem bater com o extrato de produção. Se alguma
-- divergir, este arquivo está errado e a `010` vai ser escrita contra um
-- schema que não é o real.
-- ============================================================

-- 1. Colunas, tipo, nullability e default — comparar com o extrato.
--    Atenção especial: waitlist.phone deve sair is_nullable = YES.
select
  c.relname                              as tabela,
  a.attname                              as coluna,
  format_type(a.atttypid, a.atttypmod)   as tipo,
  a.attnotnull                           as not_null,
  pg_get_expr(d.adbin, d.adrelid)        as default_
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where n.nspname = 'public'
  and c.relname in ('turmas', 'waitlist')
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;

-- 2. Índices — o waitlist_email_lower_key tem que aparecer com
--    "lower(email)" na definição. Se aparecer só "(email)", a caixa
--    volta a criar inscrições duplicadas e o caminho de duplicata da
--    rota deixa de funcionar como está documentado.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('turmas', 'waitlist')
order by tablename, indexname;

-- 3. Constraints — os três da 004 com NOT VALID no fim da definição,
--    e o status_check com SEIS valores.
select
  conrelid::regclass         as tabela,
  conname,
  pg_get_constraintdef(oid)  as definicao,
  convalidated               as ja_validou_o_passado
from pg_constraint
where conrelid in ('public.turmas'::regclass, 'public.waitlist'::regclass)
order by conrelid::regclass::text, conname;

-- 4. O seed produziu as quatro formas?
--    Esperado: total=4, sem_consentimento=3, sem_perfil=2,
--              par_turma_status_incoerente=1, sem_telefone=1
--
--    ⚠️ Se `total` for 4 e os outros forem 0, o seed entrou "limpo" e
--    staging NÃO reproduz o passivo — o `c17` passaria lá e falharia em
--    produção. É o controle negativo desta seção.
select
  count(*)                                                           as total,
  count(*) filter (where consent is null)                            as sem_consentimento,
  count(*) filter (where nivel_ingles is null or curso is null
                      or periodo is null or disponibilidade is null) as sem_perfil,
  count(*) filter (where (turma_id is null     and status <> 'lista_espera')
                      or (turma_id is not null and status  = 'lista_espera'))
                                                                     as par_turma_status_incoerente,
  count(*) filter (where phone is null)                              as sem_telefone
from public.waitlist;

-- 5. ⚠️ NÃO CONFERIDO CONTRA PRODUÇÃO — rode LÁ também e compare.
--    Esperado nos dois: rls_ligada = true, policies = 0, e ZERO linhas
--    na segunda query.
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligada,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('turmas', 'waitlist')
order by c.relname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('turmas', 'waitlist')
  and grantee in ('anon', 'authenticated');

-- ============================================================
-- TESTE DE BARREIRA — o banco tem que RECUSAR.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- ============================================================

-- A. O guarda da seção 0 funciona? Rode este arquivo INTEIRO de novo,
--    agora com o seed dentro. Esperado: exceção "RECUSADO: public.
--    waitlist ja tem linhas". Se ele rodar até o fim, o guarda não pegou
--    e o arquivo pode ser executado em produção por engano.

-- B. Linha nova sem consentimento → waitlist_consentimento_obrigatorio_check.
--    É o que o NOT VALID passou a exigir. Se PASSAR, a seção 7 não
--    entrou e staging não reproduz produção.
-- insert into public.waitlist (email, name, phone, status)
-- values ('erro.staging@exemplo.invalid', 'Erro', '+5521999990009', 'lista_espera');

-- C. Mesmo e-mail em caixa diferente → waitlist_email_lower_key.
-- insert into public.waitlist (email, name, phone, status, consent, consent_at, consent_text)
-- values ('ANA.STAGING@exemplo.invalid', 'Ana Duplicada', '+5521999990010',
--         'lista_espera', true, now(), 'x');
