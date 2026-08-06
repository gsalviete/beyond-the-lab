-- ============================================================
-- Beyond The Lab — migra `waitlist` para `pessoas` + `inscricoes`
--
-- ⛔⛔ ESTE É O PASSO MAIS PERIGOSO DO PLANO INTEIRO. ⛔⛔
--
-- Ele lê dados de gente real e os reescreve em duas tabelas novas. Tudo
-- o que veio antes podia ser desfeito com um `drop`; isto, não.
--
-- PRÉ-REQUISITOS, TODOS OBRIGATÓRIOS — ver `docs/04-PLANO.md`:
--
--   1. Dump de produção feito e guardado FORA do repositório.
--   2. Segundo projeto Supabase com o dump restaurado.
--   3. Esta migração rodada LÁ primeiro, com o `019_contagens.sql`
--      passando.
--   4. `000`–`009` aplicadas, nesta ordem, nos dois bancos.
--
-- ============================================================
-- O ESTADO REAL, MEDIDO — e por que ele NÃO simplifica este arquivo
-- ============================================================
--
-- Produção, no momento em que este arquivo foi escrito:
--
--   total = 9 · sem_telefone = 0 · sem_consentimento = 0 · sem_perfil = 0
--   9 e-mails únicos para 9 linhas, nenhuma colisão de caixa.
--
-- Ou seja: o passivo que o `REPORT.md` descreve **não existe mais em
-- produção**. A linha do incidente da `004` foi resolvida em algum
-- momento, e as demais têm perfil e consentimento completos.
--
-- ⚠️ ISSO NÃO AUTORIZA SIMPLIFICAR NADA AQUI.
--
-- Uma inscrição pode entrar amanhã por um build antigo — foi exatamente
-- assim que a linha da `004` nasceu: a migração chegou ao banco, o
-- deploy da aplicação não, e a versão velha continuou respondendo
-- "Inscrição confirmada!" com 200 enquanto gravava nulos. Escrever esta
-- migração contra o estado de hoje é apostar que a janela entre este SQL
-- e o deploy do `c21` é de largura zero. Ela não é.
--
-- O staging é HOJE MAIS DURO QUE PRODUÇÃO: o seed da `000` carrega
-- quatro formas difíceis que o banco real não tem. Isso torna esta
-- migração mais bem testada, não menos. **Passar em staging é a garantia
-- forte; passar em produção vai ser mais fácil, e isso é esperado.**
--
-- ============================================================
-- ⚠️ A LINHA SEM TELEFONE — leia antes de rodar em staging
-- ============================================================
--
-- `pessoas.telefone` é NOT NULL (decisão registrada na `007`).
-- `waitlist.phone` é NULLABLE. Existe portanto uma forma de linha na
-- origem que o destino não aceita.
--
-- A seção 2 ABORTA a transação se encontrar alguma, listando quais. Não
-- descarta e não inventa:
--
--   - descartar seria perda de contato decidida por código, e obrigaria
--     o `019` a comparar contra `count(legado) − n`, um número mágico
--     que ninguém saberia explicar em seis meses;
--   - inventar placeholder é o backfill de `consent` com outra roupa —
--     um telefone falso é indistinguível de um real numa listagem.
--
-- Em produção, com `sem_telefone = 0`, o preflight passa direto.
--
-- Em STAGING ele vai disparar, porque a linha ④ do seed
-- (`diana.staging@exemplo.invalid`) existe exatamente para provar que o
-- aborto funciona. Depois de conferir que disparou, há duas saídas na
-- mesa — e ⚠️ PARA ESTA LINHA SÓ UMA DELAS EXISTE DE VERDADE:
--
--   -- ⚠️ NÃO SE APLICA À LINHA ④. Ver a cadeia logo abaixo.
--   -- Vale para uma linha a que falte SÓ o telefone.
--   update public.waitlist set phone = '+5521999990004'
--    where email = 'diana.staging@exemplo.invalid';
--
--   -- A ÚNICA saída aplicável à linha ④.
--   delete from public.waitlist
--    where email = 'diana.staging@exemplo.invalid';
--
-- ⚠️ POR QUE O UPDATE É INALCANÇÁVEL AQUI — a cadeia inteira, porque a
-- conclusão sozinha não se sustenta na próxima vez que alguém ler:
--
--   1. A linha ④ do seed da `000` não tem só `phone` nulo. Ela tem o
--      TRIO DE CONSENTIMENTO INTEIRO NULO (`consent`, `consent_at`,
--      `consent_text`) e o perfil nulo — está lá no próprio seed, no
--      comentário "LISTA DE ESPERA sem consentimento, e SEM TELEFONE".
--
--   2. O `update` acima resolve exatamente UMA coisa: o preflight da
--      seção 2, que só olha `phone is null`. Preenchido o telefone, o
--      preflight passa e a linha segue para os inserts.
--
--   3. Mas ela segue COM `consent` nulo. Nas seções 3 e 4 isso ainda
--      passa — o trio vai como está, e é o desenho (zero backfill). O
--      que a linha ④ não atravessa é a vida DEPOIS da migração: ela
--      chega ao destino como uma inscrição sem nenhum registro
--      probatório, que é precisamente o passivo que a seção 5 fecha
--      para o futuro e não pode fechar para trás.
--
--   4. Fazer essa linha ficar íntegra exigiria preencher `consent`,
--      `consent_at` e `consent_text` — BACKFILL DE CONSENTIMENTO, que
--      é a regra não negociável do projeto: `null` significa "não
--      sabemos" e permanece `null`; backfill aqui é falsificação de
--      prova (LGPD art. 5º, XII — consentimento presumido não é
--      consentimento). Também não vale placeholder no telefone, pela
--      mesma razão em outra roupa (ver a `007`).
--
--   5. Logo: o `update` deixa a linha ④ num estado que passa no
--      preflight e continua sendo o problema que o preflight existe
--      para tornar visível. Ele não é a saída dela — é a saída de uma
--      linha DIFERENTE, uma a que falte só o telefone e cujo
--      consentimento esteja completo. Por isso o `update` fica escrito
--      aqui: apagá-lo faria perder a distinção entre os dois casos, e
--      é a distinção que ensina o que olhar antes de escolher.
--
-- Regra prática, e ela é o resumo do que está acima: antes de escolher,
-- OLHE A LINHA INTEIRA, não só o campo que o preflight acusou. Se o que
-- falta é só o telefone e ele pode ser OBTIDO (não inventado), `update`.
-- Se falta consentimento também, a única saída honesta é o `delete` após
-- revisão — porque a alternativa seria fabricar a prova.
--
-- ============================================================
-- A ORDEM DESTE ARQUIVO É O ARQUIVO
-- ============================================================
--
--   1. guardas          — recusa rodar duas vezes, ou fora de ordem
--   2. preflight        — aborta no que o destino não aceita
--   3. pessoas          — uma por e-mail
--   4. inscricoes       — uma por linha do legado
--   5. os dois CHECKs   — DEPOIS dos inserts, `not valid`
--
-- A seção 5 tem que vir depois da 4, e é a correção que o `c16` já
-- registrou: `not valid` dispensa a varredura das linhas que JÁ ESTÃO na
-- tabela no instante do ALTER, e não dispensa NADA de um INSERT futuro.
-- Com os CHECKs criados antes, cada linha herdada com `consent` nulo ou
-- perfil nulo seria recusada no INSERT e a transação inteira voltaria
-- atrás. Inserindo primeiro, as recém-inseridas viram "linhas que já
-- estavam" e são dispensadas — e toda escrita NOVA passa a ser
-- verificada. É a forma da `004`, com o passado nascendo dentro da
-- própria transação.
--
-- TRANSAÇÃO ÚNICA. Se qualquer coisa falhar, nada fica pela metade.
--
-- Rode no SQL Editor do Supabase. NÃO é idempotente por design: rodar de
-- novo é recusado pela seção 1, e não silenciosamente ignorado.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. GUARDAS
--
-- ⚠️ `execute` para tudo que consulta `public.waitlist`. O PL/pgSQL
-- prepara a condição de um `if` como UM ÚNICO comando SQL, e o parser
-- resolve todos os nomes de relação antes de a expressão ser avaliada —
-- então `to_regclass(...) is not null and exists (select 1 from x)`
-- falha no parse quando `x` não existe, e o curto-circuito nunca
-- acontece. Aqui isso importa de verdade: depois da `011`, `waitlist`
-- deixa de existir, e este arquivo tem que RECUSAR, não explodir com
-- 42P01.
-- ------------------------------------------------------------
do $$
declare
  n_origem  bigint;
  n_pessoas bigint;
  n_inscr   bigint;
begin
  -- 1.1 A origem existe?
  if to_regclass('public.waitlist') is null then
    raise exception
      'RECUSADO: public.waitlist nao existe. Ou a 011 ja rodou (e entao '
      'esta migracao ja foi feita), ou o banco esta em outro estado. '
      'Rode supabase/verificacao/019_contagens.sql para saber qual.'
      using errcode = 'raise_exception';
  end if;

  -- 1.2 O destino existe?
  if to_regclass('public.pessoas') is null
     or to_regclass('public.inscricoes') is null then
    raise exception
      'RECUSADO: pessoas e/ou inscricoes nao existem. Rode 007 e 008 antes.'
      using errcode = 'raise_exception';
  end if;

  execute 'select count(*) from public.waitlist'   into n_origem;
  execute 'select count(*) from public.pessoas'    into n_pessoas;
  execute 'select count(*) from public.inscricoes' into n_inscr;

  -- 1.3 Tem o que migrar?
  --
  -- Origem vazia é sempre erro de operação, nunca "nada a fazer": ou o
  -- banco é o errado, ou a 011 já rodou, ou alguém apagou a tabela.
  -- Seguir em silêncio produziria um destino vazio que o 019 poderia
  -- ler como sucesso se ele só comparasse contagens.
  if n_origem = 0 then
    raise exception
      'RECUSADO: public.waitlist esta vazia. Nao ha o que migrar, e isso '
      'nunca e o estado esperado. Confira se este e o banco certo.'
      using errcode = 'raise_exception';
  end if;

  -- 1.4 ⚠️ RODAR DUAS VEZES É RECUSADO, E ALTO.
  --
  -- As uniques da `008` já tornam a duplicação silenciosa estruturalmente
  -- impossível — um segundo insert esbarraria em `pessoas_email_lower_idx`
  -- ou nas duas parciais de `inscricoes`, e a transação abortaria. Este
  -- guarda é a SEGUNDA tranca, e existe porque tranca que só existe num
  -- lugar é a que some quando alguém dropa um índice para "resolver" um
  -- erro de importação.
  --
  -- Recusar é melhor que ser idempotente aqui: um `on conflict do
  -- nothing` faria a segunda execução parecer bem-sucedida, e "rodei de
  -- novo e não deu erro" viraria evidência de que estava tudo certo.
  if n_pessoas > 0 or n_inscr > 0 then
    raise exception
      'RECUSADO: destino nao esta vazio (pessoas=%, inscricoes=%). Esta '
      'migracao ja rodou. Rodar de novo duplicaria dado pessoal. Para '
      'refazer do zero, esvazie as duas tabelas DELIBERADAMENTE antes.',
      n_pessoas, n_inscr
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. PREFLIGHT — o que o destino não aceita
--
-- Aborta ANTES de escrever qualquer coisa, listando as linhas
-- problemáticas por e-mail. Falhar no meio de um insert também
-- funcionaria (a transação é única), mas a mensagem seria a do Postgres
-- sobre uma constraint, e não a explicação de o que fazer.
-- ------------------------------------------------------------
do $$
declare
  sem_fone text;
begin
  execute $q$
    select string_agg(email, ', ' order by created_at)
    from public.waitlist
    where phone is null
  $q$ into sem_fone;

  if sem_fone is not null then
    raise exception
      'RECUSADO: ha linha(s) sem telefone e pessoas.telefone e NOT NULL. '
      'Emails: %. '
      'Decida caso a caso: obtenha o telefone e faca UPDATE na waitlist, '
      'ou remova a linha apos revisao. NAO preencha com placeholder — '
      'telefone inventado e indistinguivel de real numa listagem. '
      'Ver o bloco DECISAO PENDENTE na migracao 007.',
      sem_fone
      using errcode = 'raise_exception';
  end if;
end $$;

-- Colisão de caixa no e-mail: duas linhas cujo `lower(email)` é igual
-- viram UMA pessoa e DUAS inscrições — mas as duas inscrições seriam de
-- lista de espera para a mesma pessoa, e a unique parcial
-- `inscricoes_pessoa_espera_idx` recusaria a segunda.
--
-- Em produção não há colisão (9 e-mails únicos para 9 linhas). Se
-- houvesse, o operador precisa decidir qual linha vale — não o código.
do $$
declare
  colididos text;
begin
  -- ⚠️ O agregado externo é obrigatório. A forma direta —
  -- `select string_agg(...) ... group by lower(email) having count(*) > 1`
  -- — devolve UMA LINHA POR GRUPO colidido, e `execute ... into` guarda
  -- só a primeira. Com três colisões, a mensagem listaria uma e o
  -- operador consertaria uma, rodaria de novo, e descobriria a segunda.
  -- A subconsulta agrupa; o `string_agg` de fora junta todos os grupos
  -- numa string só.
  execute $q$
    select string_agg(e, ', ' order by e)
    from (
      select lower(email) as e
      from public.waitlist
      group by lower(email)
      having count(*) > 1
    ) x
  $q$ into colididos;

  if colididos is not null then
    raise exception
      'RECUSADO: e-mails que diferem so na caixa: %. Cada um viraria uma '
      'pessoa com duas inscricoes de lista de espera, e a unique parcial '
      'recusaria a segunda. Consolide as linhas na waitlist antes.',
      colididos
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. PESSOAS — uma por e-mail
--
-- `distinct on (lower(email))` com `order by created_at desc` pega a
-- linha MAIS RECENTE de cada e-mail. Isso é irrelevante hoje (não há
-- colisão, e o preflight aborta se houver) e é a regra certa se um dia
-- houver: nome e telefone são "o dado mais recente serve para falar com
-- a pessoa", conforme o comentário das colunas na `007`.
--
-- `created_at` é PRESERVADO do original, não `now()`. A data em que a
-- pessoa entrou na base é informação: ela diz há quanto tempo aquele
-- contato espera, e é o que a Giovana usa para decidir a quem escrever
-- primeiro. Carimbar `now()` apagaria isso e faria a base inteira
-- parecer ter nascido no dia da migração.
-- ------------------------------------------------------------
insert into public.pessoas (nome, email, telefone, created_at)
select distinct on (lower(w.email))
  w.name,
  w.email,
  w.phone,
  w.created_at
from public.waitlist w
order by lower(w.email), w.created_at desc;

-- ------------------------------------------------------------
-- 4. INSCRICOES — uma por linha do legado
--
-- ⚠️ TODAS viram `lista_espera`, com `safra_id = null`, INCLUSIVE as que
-- tinham `turma_id` preenchido.
--
-- Não é perda de informação: é a leitura correta do que aquelas linhas
-- são. A base atual é de um tipo que o sistema novo não produz mais —
-- gente que se cadastrou quando NÃO HAVIA COMPRA POSSÍVEL. O
-- `turma_id` que algumas carregam veio do backfill da `002`, que
-- atribuiu todo mundo à turma de setembro porque era a única que existia;
-- ele nunca significou "esta pessoa está inscrita e vai pagar".
--
-- Marcá-las como pertencentes a uma safra faria o painel do corte 3
-- mostrá-las como alunas da safra de setembro, e o corte 2 tentaria
-- cobrar por uma inscrição que ninguém completou. `lista_espera` é o
-- estado honesto: são contatos esperando a próxima abertura.
--
-- `grupo_id` fica null — `waitlist.grupo` não é migrado, e o porquê está
-- na `006`.
--
-- O trio de consentimento vai COMO ESTÁ. `null` continua `null`. ZERO
-- BACKFILL. Consentimento presumido não é consentimento (LGPD art. 5º,
-- XII), e o `019` confere que a contagem de nulos no destino bate com a
-- da origem — exatamente para que "resolver o passivo" no meio da
-- migração seja reprovado.
--
-- `payment_choice` NÃO MIGRA. Some com a coluna (D-11): o campo
-- perguntava "quer pagar agora?" numa tela onde pagar era logicamente
-- impossível, e os dois valores gravavam igual.
-- ------------------------------------------------------------
insert into public.inscricoes (
  pessoa_id, safra_id, grupo_id, status,
  nivel_ingles, curso, periodo, disponibilidade,
  consent, consent_at, consent_text,
  created_at
)
select
  p.id,
  null,             -- safra_id — ver acima
  null,             -- grupo_id — waitlist.grupo nao migra (ver 006)
  'lista_espera',
  w.nivel_ingles,
  w.curso,
  w.periodo,
  w.disponibilidade,
  w.consent,        -- null continua null
  w.consent_at,
  w.consent_text,
  w.created_at      -- preservado, como em pessoas
from public.waitlist w
join public.pessoas p on lower(p.email) = lower(w.email);

-- ------------------------------------------------------------
-- 5. OS DOIS CHECKS — depois dos dados, `not valid`
--
-- Ver a explicação no topo e na `009`. Estes são os dois que NÃO podiam
-- estar na `009`: as linhas herdadas os violam, e `not valid` só
-- dispensa linha que já está na tabela.
--
-- Agora elas já estão. Daqui para a frente, toda inscrição nova é
-- verificada — inclusive uma escrita por um build antigo, que é a classe
-- de incidente que a `004` documentou e que estes CHECKs fecham.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscricoes_consentimento_obrigatorio_check'
      and conrelid = to_regclass('public.inscricoes')
  ) then
    -- Os três numa constraint só, e não em três: eles não fazem sentido
    -- separados. `consent = true` sem `consent_text` prova que alguém
    -- clicou em algo que não se sabe o que era; `consent_text` sem
    -- `consent_at` não amarra a linha à redação vigente. O que tem valor
    -- de prova (LGPD art. 8º, §1º) é o conjunto.
    alter table public.inscricoes
      add constraint inscricoes_consentimento_obrigatorio_check
      check (
        consent is true
        and consent_at   is not null
        and consent_text is not null
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inscricoes_perfil_obrigatorio_check'
      and conrelid = to_regclass('public.inscricoes')
  ) then
    -- `cardinality >= 1` repetido aqui embora a `009` já o tenha: lá ele
    -- só entra em vigor quando `disponibilidade` não é nula, e nulo é
    -- justamente o caso que esta constraint barra. Repetir é o que torna
    -- a regra legível sozinha.
    alter table public.inscricoes
      add constraint inscricoes_perfil_obrigatorio_check
      check (
        nivel_ingles        is not null
        and curso           is not null
        and periodo         is not null
        and disponibilidade is not null
        and cardinality(disponibilidade) >= 1
      )
      not valid;
  end if;
end $$;

commit;

-- ============================================================
-- VERIFICAÇÃO RÁPIDA — a completa é
-- `supabase/verificacao/019_contagens.sql`, e é ELA que vale.
--
-- ⚠️ Não confie nas queries abaixo como aceite. Elas são para olhar
-- agora; o `019` é que reprova, e reprova levantando exceção em vez de
-- devolver linha para alguém interpretar.
-- ============================================================

-- 1. As três contagens batem?
select
  (select count(*) from public.waitlist)   as origem,
  (select count(*) from public.pessoas)    as pessoas,
  (select count(*) from public.inscricoes) as inscricoes;

-- 2. O passivo atravessou sem ser "resolvido"?
--    Os pares têm que ser IGUAIS. Se o destino tiver menos nulos que a
--    origem, houve backfill — falsificação de prova.
select
  (select count(*) from public.waitlist   where consent is null)      as origem_sem_consent,
  (select count(*) from public.inscricoes where consent is null)      as destino_sem_consent,
  (select count(*) from public.waitlist   where nivel_ingles is null) as origem_sem_perfil,
  (select count(*) from public.inscricoes where nivel_ingles is null) as destino_sem_perfil;

-- 3. Todas em lista de espera, sem safra e sem grupo?
--    Esperado: uma linha só, com status = lista_espera.
select status, count(*) as linhas,
       count(*) filter (where safra_id is not null) as com_safra,
       count(*) filter (where grupo_id is not null) as com_grupo
from public.inscricoes
group by status;

-- 4. Os dois CHECKs entraram, com convalidated = false?
select conname, convalidated as ja_validou_o_passado
from pg_constraint
where conrelid = 'public.inscricoes'::regclass
  and conname in (
    'inscricoes_consentimento_obrigatorio_check',
    'inscricoes_perfil_obrigatorio_check'
  )
order by conname;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- ============================================================

-- A. Rodar esta migração de novo → "RECUSADO: destino nao esta vazio".
--    Se ela rodar até o fim, o guarda 1.4 não pegou e há dado pessoal
--    duplicado. Rode e confirme a mensagem.

-- B. Inscrição NOVA sem consentimento → o CHECK da seção 5.
--    É o que o `not valid` passou a exigir. Se PASSAR, a seção 5 não
--    entrou e o modelo novo aceita o que o antigo aceitava.
-- insert into public.inscricoes (pessoa_id, safra_id, status)
-- select id, null, 'lista_espera' from public.pessoas limit 1;
