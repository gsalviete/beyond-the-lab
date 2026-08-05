-- ============================================================
-- Beyond The Lab — integridade de `inscricoes`: CHECKs e o trigger
--
-- ⛔ Não rode em produção antes do staging de dados. Ver o pré-requisito
--    na abertura do corte 1 em `docs/04-PLANO.md`.
--
-- Mesmo princípio da `004`, que é o mais transferível deste projeto:
--
--   Validação na aplicação é uma promessa sobre qual código está
--   rodando. Constraint no banco é um fato. Onde a diferença importa —
--   dado pessoal, base legal, coerência de estado — o fato vence.
--
-- Todo CHECK aqui entra `not valid`. A tabela está vazia neste momento,
-- o que torna `not valid` e validado equivalentes AGORA; a forma é
-- mantida porque a `010` vai inserir linhas herdadas logo em seguida, e
-- porque um dia alguém vai copiar este arquivo como modelo.
--
-- ============================================================
-- ⚠️ ORDEM: DOIS CHECKS **NÃO** ESTÃO AQUI, E NÃO É ESQUECIMENTO
-- ============================================================
--
-- O modelo (`docs/01-MODELO-DADOS.md`) pede mais dois invariantes:
--
--   - consentimento tudo-ou-nada (consent/consent_at/consent_text)
--   - perfil obrigatório (nivel_ingles, curso, periodo, disponibilidade)
--
-- Eles pertencem à `010`, no fim da mesma transação, DEPOIS dos INSERTs.
-- Pô-los aqui faria a `010` FALHAR INTEIRA — e vale entender por quê,
-- porque a intuição sobre `not valid` erra exatamente neste ponto:
--
--   `not valid` dispensa a varredura das linhas que JÁ ESTÃO na tabela
--   no instante do ALTER. Ele NÃO dispensa nada de um INSERT futuro.
--
-- A base atual tem linhas com `consent` nulo (anteriores ao registro
-- probatório) e ao menos uma com o perfil inteiro nulo — a do incidente
-- que a `004` documenta, gravada por um build antigo. A `010` precisa
-- trazer essas linhas como estão, com `null` continuando `null`. Se o
-- CHECK já existisse, cada uma delas seria recusada no INSERT.
--
-- A ordem correta, dentro da transação única da `010`:
--
--   1. INSERT das linhas herdadas          ← passam, sem CHECK no caminho
--   2. ALTER TABLE ... ADD CONSTRAINT ... NOT VALID
--                                          ← as recém-inseridas viram
--                                            "linhas que já estavam", e
--                                            são dispensadas
--   3. daí em diante, toda escrita NOVA é verificada
--
-- É a mesma forma da `004`: obrigar sem falsificar o passado. A diferença
-- é que aqui o "passado" nasce dentro da própria transação.
--
-- RLS já está ligada pela `008`. Não crie policy.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Domínio de `status`
--
-- A máquina de estados inteira (docs/01-MODELO-DADOS.md):
--
--   lista_espera ──► pendente_pagamento ──► confirmada ──► ativa
--                                                            │
--                              ┌─────────────────────────────┤
--                              ▼                             ▼
--                        inadimplente ──► cancelada      concluida
--
-- Lista fechada, e não "qualquer texto": `status` é lido por código em
-- cinco lugares e um typo ('confirmda') criaria uma inscrição que
-- nenhuma query encontra e que ninguém sabe que existe.
--
-- ⚠️ NÃO EXISTE 'aprovada' NEM 'rejeitada' (D-02). Não há entrevista,
-- análise ou triagem: quem conclui o checkout está dentro. A Giovana
-- organiza horário, ela não é porteira. Um estado de aprovação criaria
-- e-mail de recusa, tela de recusa e uma decisão que ninguém toma.
--
-- No corte 1, os estados a partir de `pendente_pagamento` são
-- INALCANÇÁVEIS de propósito: sem checkout (c35), safra aberta não
-- significa nada, e o corte sobe com `inscricoes_abertas = false`. O
-- domínio já os contempla para que a `010` e a `011` não precisem ser
-- revisitadas quando o corte 2 chegar.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_status_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_status_check
      check (status in (
        'lista_espera',        -- sem safra aberta; safra_id é null
        'pendente_pagamento',  -- checkout criado, não concluído
        'confirmada',          -- cartão salvo, cobrança agendada
        'ativa',               -- primeira fatura paga
        'inadimplente',        -- fatura recusada — o único evento que grita
        'concluida',           -- cancel_at atingido, ciclos completos
        'cancelada'            -- encerrada antes do fim, sempre pela Giovana
      ))
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. `safra_id` e `status` contam a mesma história
--
-- Herdado da `004`, onde o CHECK equivalente nasceu de um bug real: o
-- build antigo gravou `status = 'pendente'` com `turma_id` nulo, um
-- estado que não existe no vocabulário do projeto. Aquela linha não
-- estava só incompleta — estava afirmando pertencer a uma turma que não
-- apontava para nenhuma.
--
-- A regra é "sem safra ⇒ lista_espera" e "com safra ⇒ qualquer coisa
-- menos lista_espera", e não uma lista fechada de status: os demais
-- estados são do Stripe e só acontecem em linha que tem safra.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_safra_status_coerentes_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_safra_status_coerentes_check
      check (
        (safra_id is null     and status  = 'lista_espera')
        or
        (safra_id is not null and status <> 'lista_espera')
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Domínio do perfil — o valor, não a obrigatoriedade
--
-- `x is null or ...`: estes CHECKs validam o DOMÍNIO do valor quando ele
-- existe, sem tornar o valor obrigatório. É a mesma divisão da `002`, e
-- é o que permite a `010` trazer as linhas herdadas com perfil nulo.
--
-- Quem exige o preenchimento é o CHECK de perfil obrigatório, que entra
-- na `010` depois dos dados — ver a nota de ORDEM no topo.
--
-- Os valores espelham `VALORES_NIVEL_INGLES` e `VALORES_DIA_SEMANA` de
-- `src/config/dominio.ts`, e `tests/dominio.test.ts` compara as duas
-- listas. ⚠️ Aquele teste garante que a MIGRAÇÃO versionada concorda com
-- o DOMÍNIO versionado — não que o banco em produção concorda com
-- qualquer um dos dois. A distância entre repositório e produção é
-- exatamente o incidente da `004`.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_nivel_ingles_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_nivel_ingles_check
      check (nivel_ingles is null
             or nivel_ingles in ('basico', 'intermediario', 'avancado'))
      not valid;
  end if;
end $$;

-- `<@` garante que TODO elemento do array está no conjunto permitido;
-- `cardinality >= 1` barra o array vazio, que não é null e passaria por
-- qualquer checagem de nulidade, virando "inscrita sem nenhum dia".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_disponibilidade_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_disponibilidade_check
      check (
        disponibilidade is null
        or (
          cardinality(disponibilidade) >= 1
          and disponibilidade <@ array['seg','ter','qua','qui','sex']::text[]
        )
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Coerência probatória PARCIAL
--
-- Este é o pedaço do consentimento que pode entrar ANTES dos dados,
-- porque as linhas herdadas o satisfazem: se `consent` é nulo, os três
-- são nulos, e a regra abaixo aceita isso.
--
-- O que ela barra: `consent = false`. Gravar `false` seria registrar que
-- a pessoa RECUSOU e mesmo assim entrou na lista. Nenhuma linha da base
-- atual tem `false` (o Zod sempre exigiu `z.literal(true)`), então a
-- `010` passa por aqui sem tropeçar.
--
-- O tudo-ou-nada completo — "se consentiu, os três estão preenchidos" —
-- é o CHECK que entra na `010`.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inscricoes_consent_nunca_false_check'
  ) then
    alter table public.inscricoes
      add constraint inscricoes_consent_nunca_false_check
      check (consent is null or consent is true)
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. O TRIGGER — grupo pertence à mesma safra da inscrição
--
-- ⚠️ ISTO NÃO PODE SER UMA FK, E É POR ISSO QUE EXISTE UM TRIGGER.
--
-- `grupo_id` referencia `grupos(id)`, e `grupos` tem `safra_id`. Mas a
-- FK só sabe dizer "este grupo existe" — ela não tem como exigir que o
-- `safra_id` DO GRUPO seja igual ao `safra_id` DA INSCRIÇÃO. É uma
-- relação entre duas linhas de tabelas diferentes, e a chave estrangeira
-- não expressa isso.
--
-- Sem esta verificação, um bug no painel poderia alocar uma aluna de
-- setembro num horário de janeiro. Nada quebraria: as duas linhas
-- existem, a FK está satisfeita, e a aluna simplesmente apareceria no
-- kanban da safra errada.
--
--   Existe uma alternativa puramente declarativa: chave composta
--   (id, safra_id) em `grupos` com unique, e FK composta
--   (grupo_id, safra_id) daqui para lá. Ela funciona e dispensa
--   trigger — mas exige uma coluna redundante e um unique que só
--   serve para isso, e deixa o modelo mais difícil de ler para quem
--   chega depois. O trigger diz em português o que a regra é.
--
-- `before insert or update of grupo_id, safra_id`: só roda quando uma
-- das duas colunas muda. Alterar `status` ou `grupo_id → null` não paga
-- o custo da consulta.
--
-- `security definer` + `set search_path = ''`: a função é chamada em
-- toda escrita e os nomes são todos qualificados com `public.`, para que
-- ela não dependa do `search_path` de quem disparou o trigger.
-- ------------------------------------------------------------
create or replace function public.inscricao_grupo_da_mesma_safra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safra_do_grupo uuid;
begin
  -- Sem grupo não há o que verificar. "Sem horário ainda" é um estado
  -- legítimo, e o mais comum logo depois do pagamento.
  if new.grupo_id is null then
    return new;
  end if;

  select g.safra_id into safra_do_grupo
  from public.grupos g
  where g.id = new.grupo_id;

  if new.safra_id is null then
    raise exception
      'inscricao % em lista de espera nao pode ter grupo (grupo_id=%)',
      coalesce(new.id::text, '(nova)'), new.grupo_id
      using errcode = 'check_violation';
  end if;

  if safra_do_grupo is distinct from new.safra_id then
    raise exception
      'grupo % pertence a safra %, mas a inscricao e da safra %',
      new.grupo_id, safra_do_grupo, new.safra_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.inscricao_grupo_da_mesma_safra() is
  'Garante que inscricoes.grupo_id aponta para um grupo da MESMA safra '
  'da inscrição, e que inscrição em lista de espera não tem grupo. '
  'É trigger e não FK porque a chave estrangeira não consegue expressar '
  'uma igualdade entre colunas de duas linhas diferentes.';

drop trigger if exists inscricoes_grupo_coerente on public.inscricoes;
create trigger inscricoes_grupo_coerente
  before insert or update of grupo_id, safra_id on public.inscricoes
  for each row
  execute function public.inscricao_grupo_da_mesma_safra();

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. Os cinco CHECKs entraram, todos com convalidated = false?
--    `false` é o ESPERADO e significa "vale para o novo, não olhou o
--    antigo". Não é pendência a resolver com pressa.
select
  conname                   as constraint_name,
  convalidated              as ja_validou_o_passado,
  pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.inscricoes'::regclass and contype = 'c'
order by conname;

-- 2. O trigger está ativo, e só nas colunas certas?
--    Esperado: inscricoes_grupo_coerente, BEFORE INSERT OR UPDATE OF
--    grupo_id, safra_id
select
  tgname                                   as trigger_name,
  pg_get_triggerdef(oid)                   as definicao
from pg_trigger
where tgrelid = 'public.inscricoes'::regclass and not tgisinternal;

-- 3. Os dois CHECKs que NÃO devem estar aqui, de fato não estão?
--    Esperado: ZERO linhas. Se aparecer alguma, a 010 vai falhar inteira
--    ao tentar inserir as linhas herdadas com consent/perfil nulos.
select conname
from pg_constraint
where conrelid = 'public.inscricoes'::regclass
  and conname in (
    'inscricoes_consentimento_obrigatorio_check',
    'inscricoes_perfil_obrigatorio_check'
  );

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os cinco.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra. Ver a nota
-- do c16 em docs/04-PLANO.md sobre teste que lê .sql como texto.
-- Troque <PESSOA>, <SAFRA_A>, <SAFRA_B> e <GRUPO_DE_B> por ids reais.
-- ============================================================

-- A. Status fora do domínio → inscricoes_status_check
-- insert into public.inscricoes (pessoa_id, safra_id, status)
-- values ('<PESSOA>', '<SAFRA_A>', 'aprovada');

-- B. Safra nula com status que não é lista_espera
--    → inscricoes_safra_status_coerentes_check
-- insert into public.inscricoes (pessoa_id, safra_id, status)
-- values ('<PESSOA>', null, 'confirmada');

-- C. Consentimento recusado → inscricoes_consent_nunca_false_check
-- insert into public.inscricoes (pessoa_id, safra_id, status, consent)
-- values ('<PESSOA>', '<SAFRA_A>', 'confirmada', false);

-- D. Grupo de OUTRA safra → exceção do trigger
--    Esta é a que a FK sozinha deixaria passar.
-- insert into public.inscricoes (pessoa_id, safra_id, grupo_id, status)
-- values ('<PESSOA>', '<SAFRA_A>', '<GRUPO_DE_B>', 'confirmada');

-- E. Lista de espera com grupo → exceção do trigger
-- insert into public.inscricoes (pessoa_id, safra_id, grupo_id, status)
-- values ('<PESSOA>', null, '<GRUPO_DE_B>', 'lista_espera');
