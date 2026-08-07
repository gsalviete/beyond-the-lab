-- ============================================================
-- Beyond The Lab — ACEITE da migração 010/011
--
-- Este é o teste que decide se a migração pode ir para produção. Rode-o
-- DEPOIS da `010` e da `011`, no mesmo banco, e leia o resultado.
--
-- ============================================================
-- ⚠️ ELE NÃO DEVOLVE LINHA PARA ALGUÉM INTERPRETAR. ELE LEVANTA EXCEÇÃO.
-- ============================================================
--
-- Um `select` de conferência é lido como verde num dia corrido. Todo
-- mundo já olhou uma saída de contagem, viu números alinhados e seguiu
-- em frente. Aqui não há o que interpretar: ou termina com
-- `ACEITE: OK`, ou estoura com a razão exata.
--
-- ============================================================
-- O QUE ELE FOI DESENHADO PARA **NÃO** DEIXAR PASSAR
-- ============================================================
--
-- A regra nasceu no `c07`, onde um diferencial de e-mails deu "0
-- divergências" comparando VAZIO COM VAZIO. Um teste que passa sem
-- exercitar nada é indistinguível de um que passa exercitando tudo — e
-- contagem é o formato mais fácil de enganar que existe:
--
--   ✗ ZERO IGUAL A ZERO
--     `count(pessoas) == count(inscricoes) == count(legado)` bate
--     perfeitamente quando as três estão vazias, e uma migração que não
--     migrou nada tem exatamente essa cara. → asserções 2, 3 e 4.
--
--   ✗ LENDO A TABELA ERRADA COM O NOME CERTO
--     Se a `011` não rodou, `public.waitlist` ainda existe e uma query
--     contra `waitlist_legado` falharia — mas uma query mal escrita
--     contra `waitlist` daria o número certo pelo motivo errado, e o
--     aceite passaria sem que a aposentadoria tivesse acontecido.
--     → asserção 1.
--
--   ✗ RODOU DUAS VEZES
--     Contagem dobrada no destino. As uniques da `008` já tornam isso
--     estruturalmente impossível, e esta é a segunda tranca — porque
--     tranca que só existe num lugar some quando alguém dropa um índice
--     para "resolver" um erro de importação. → asserções 5 e 8.
--
--   ✗ O PASSIVO FOI "RESOLVIDO" NO CAMINHO
--     Backfill de `consent` é falsificação de prova, e é a coisa mais
--     tentadora de fazer no meio de uma migração porque deixa tudo
--     bonito. → asserção 6.
--
--   ✗ COMPARAÇÃO FROUXA
--     `>=` em vez de `=` é a forma como um teste de contagem aceita
--     duplicação sem perceber. Não há um único `>=` neste arquivo entre
--     origem e destino.
--
-- Nenhuma asserção usa número escrito à mão. Todas derivam do banco.
--
-- ⚠️ PRODUÇÃO VAI SER MAIS FÁCIL QUE STAGING, E ISSO É ESPERADO.
-- O staging carrega quatro formas difíceis (consent nulo, perfil nulo,
-- par turma/status incoerente, sem telefone) que produção não tem —
-- medido: total=9, sem_telefone=0, sem_consentimento=0, sem_perfil=0.
-- **Passar em staging é a garantia forte.** Passar em produção sem ter
-- passado em staging não garante quase nada.
--
-- Não altera nada. Pode rodar quantas vezes quiser.
-- ============================================================

do $$
declare
  n_legado          bigint;
  n_pessoas         bigint;
  n_inscricoes      bigint;
  n_emails          bigint;
  n_consent_origem  bigint;
  n_consent_destino bigint;
  n_perfil_origem   bigint;
  n_perfil_destino  bigint;
  n_fora_espera     bigint;
  n_com_safra       bigint;
  n_com_grupo       bigint;
  n_dup             bigint;
  n_orfas           bigint;
  amostra_email     text;
  amostra_consent   boolean;
  amostra_ok        boolean;
begin

  -- ==========================================================
  -- 1. AS TABELAS CERTAS EXISTEM, E AS ERRADAS NÃO
  --
  -- Esta asserção vem primeiro porque é a única que distingue "os
  -- números batem" de "os números batem pelo motivo certo".
  -- ==========================================================
  if to_regclass('public.waitlist_legado') is null then
    raise exception 'ACEITE FALHOU (1a): public.waitlist_legado nao existe. A 011 nao rodou.';
  end if;

  -- ⚠️ A recíproca, e é ela que pega o modo de falha mais traiçoeiro.
  -- Enquanto `public.waitlist` existir, a aposentadoria não aconteceu:
  -- um build antigo continua conseguindo gravar ali com sucesso, e essa
  -- inscrição não existe no modelo novo. Foi assim que a linha do
  -- incidente da `004` nasceu.
  if to_regclass('public.waitlist') is not null then
    raise exception
      'ACEITE FALHOU (1b): public.waitlist AINDA EXISTE. Ou a 011 nao '
      'rodou, ou alguem recriou a tabela. Enquanto ela existir, um build '
      'antigo grava ali com sucesso e a inscricao nao aparece no modelo '
      'novo — silenciosamente.';
  end if;

  if to_regclass('public.pessoas') is null or to_regclass('public.inscricoes') is null then
    raise exception 'ACEITE FALHOU (1c): pessoas e/ou inscricoes nao existem.';
  end if;

  -- ==========================================================
  -- 2. A ORIGEM TEM CONTEÚDO
  --
  -- Antes de qualquer comparação. É o que mata o "zero igual a zero":
  -- com o legado vazio, toda igualdade abaixo passaria trivialmente.
  -- ==========================================================
  select count(*) into n_legado from public.waitlist_legado;

  if n_legado = 0 then
    raise exception
      'ACEITE FALHOU (2): waitlist_legado esta VAZIA. Nenhuma comparacao '
      'de contagem significa nada a partir daqui — zero e igual a zero.';
  end if;

  -- ==========================================================
  -- 3. AS DUAS PONTAS DO DESTINO TÊM CONTEÚDO — separadamente
  --
  -- Duas asserções e não uma: se só houvesse a igualdade final, um
  -- destino parcialmente vazio poderia coincidir com um legado também
  -- pequeno. Cada ponta precisa falhar sozinha.
  -- ==========================================================
  select count(*) into n_pessoas    from public.pessoas;
  select count(*) into n_inscricoes from public.inscricoes;

  if n_pessoas = 0 then
    raise exception 'ACEITE FALHOU (3a): public.pessoas esta VAZIA, mas o legado tem % linhas.', n_legado;
  end if;

  if n_inscricoes = 0 then
    raise exception 'ACEITE FALHOU (3b): public.inscricoes esta VAZIA, mas o legado tem % linhas.', n_legado;
  end if;

  -- ==========================================================
  -- 4. AS CONTAGENS BATEM — igualdade exata, nunca `>=`
  --
  -- `pessoas` conta por e-mail distinto (lower); `inscricoes` conta por
  -- linha. Hoje os dois números coincidem porque não há colisão de
  -- caixa, mas as asserções são diferentes de propósito: se um dia
  -- houver colisão, esta é a que explica onde ela está.
  -- ==========================================================
  select count(distinct lower(email)) into n_emails from public.waitlist_legado;

  if n_pessoas <> n_emails then
    raise exception
      'ACEITE FALHOU (4a): pessoas = %, mas o legado tem % e-mails distintos. '
      'Diferenca de %. Se pessoas for MAIOR, a 010 rodou duas vezes ou o '
      'unique de lower(email) nao existe.',
      n_pessoas, n_emails, n_pessoas - n_emails;
  end if;

  if n_inscricoes <> n_legado then
    raise exception
      'ACEITE FALHOU (4b): inscricoes = %, legado = %. Diferenca de %. '
      'Se inscricoes for MAIOR, houve duplicacao; se MENOR, linhas foram '
      'perdidas na migracao.',
      n_inscricoes, n_legado, n_inscricoes - n_legado;
  end if;

  -- ==========================================================
  -- 5. NINGUÉM TEM INSCRIÇÃO A MAIS — a segunda tranca do duplo-run
  --
  -- Redundante com `inscricoes_pessoa_espera_idx` de propósito. A
  -- unique impede a escrita; esta asserção detecta o estado, e continua
  -- valendo se o índice for removido.
  -- ==========================================================
  select count(*) into n_dup
  from (
    select pessoa_id
    from public.inscricoes
    where safra_id is null
    group by pessoa_id
    having count(*) > 1
  ) x;

  if n_dup > 0 then
    raise exception
      'ACEITE FALHOU (5): % pessoa(s) com mais de uma inscricao de lista '
      'de espera. A 010 rodou duas vezes, ou a unique parcial '
      'inscricoes_pessoa_espera_idx nao existe.', n_dup;
  end if;

  -- ==========================================================
  -- 6. O PASSIVO ATRAVESSOU INTACTO — o teste anti-backfill
  --
  -- `null` em `consent` significa "NÃO SABEMOS", e é o que torna
  -- visível, em qualquer consulta, quem não tem base documentada.
  -- Escrever `true` ali resolveria o desconforto e produziria um
  -- registro que afirma algo que ninguém verificou — consentimento
  -- presumido não é consentimento (LGPD art. 5º, XII).
  --
  -- A comparação é de igualdade nos dois sentidos: menos nulos no
  -- destino é backfill; mais nulos é perda de dado probatório.
  -- ==========================================================
  select count(*) into n_consent_origem  from public.waitlist_legado where consent is null;
  select count(*) into n_consent_destino from public.inscricoes      where consent is null;

  if n_consent_destino <> n_consent_origem then
    raise exception
      'ACEITE FALHOU (6a): consent nulo — origem = %, destino = %. '
      'MENOS no destino significa BACKFILL, que e falsificacao de prova. '
      'MAIS significa perda de registro probatorio.',
      n_consent_origem, n_consent_destino;
  end if;

  select count(*) into n_perfil_origem
  from public.waitlist_legado
  where nivel_ingles is null or curso is null or periodo is null or disponibilidade is null;

  select count(*) into n_perfil_destino
  from public.inscricoes
  where nivel_ingles is null or curso is null or periodo is null or disponibilidade is null;

  if n_perfil_destino <> n_perfil_origem then
    raise exception
      'ACEITE FALHOU (6b): perfil incompleto — origem = %, destino = %.',
      n_perfil_origem, n_perfil_destino;
  end if;

  -- ==========================================================
  -- 7. TODAS EM LISTA DE ESPERA, SEM SAFRA E SEM GRUPO
  --
  -- A base atual é de um tipo que o sistema novo não produz mais: gente
  -- que se cadastrou quando não havia compra possível. Se alguma linha
  -- chegou com safra, o painel do corte 3 vai mostrá-la como aluna e o
  -- corte 2 vai tentar cobrar por uma inscrição que ninguém completou.
  -- ==========================================================
  select count(*) into n_fora_espera from public.inscricoes where status <> 'lista_espera';
  select count(*) into n_com_safra   from public.inscricoes where safra_id is not null;
  select count(*) into n_com_grupo   from public.inscricoes where grupo_id is not null;

  if n_fora_espera > 0 then
    raise exception 'ACEITE FALHOU (7a): % inscricao(oes) com status diferente de lista_espera.', n_fora_espera;
  end if;

  if n_com_safra > 0 then
    raise exception 'ACEITE FALHOU (7b): % inscricao(oes) com safra_id preenchido.', n_com_safra;
  end if;

  if n_com_grupo > 0 then
    raise exception 'ACEITE FALHOU (7c): % inscricao(oes) com grupo_id preenchido.', n_com_grupo;
  end if;

  -- ==========================================================
  -- 8. NENHUMA INSCRIÇÃO ÓRFÃ, NENHUMA PESSOA SEM INSCRIÇÃO
  --
  -- A FK já garante o primeiro. O segundo não tem constraint que o
  -- expresse — e uma pessoa criada sem inscrição correspondente seria
  -- exatamente o resíduo de uma execução parcial.
  -- ==========================================================
  select count(*) into n_orfas
  from public.pessoas p
  where not exists (select 1 from public.inscricoes i where i.pessoa_id = p.id);

  if n_orfas > 0 then
    raise exception
      'ACEITE FALHOU (8): % pessoa(s) sem nenhuma inscricao. Residuo de '
      'execucao parcial ou de uma segunda rodada abortada no meio.', n_orfas;
  end if;

  -- ==========================================================
  -- 9. UMA LINHA CONHECIDA, DE PONTA A PONTA
  --
  -- Contagem prova volume; esta asserção prova CONTEÚDO. Pega o registro
  -- mais antigo do legado — o que tem mais chance de carregar passivo —
  -- e confere que ele atravessou como pessoa e como inscrição, com o
  -- `consent` exatamente igual, `null` inclusive.
  --
  -- `is not distinct from` e não `=`: com `=`, `null = null` devolve
  -- NULL, e a comparação seria descartada em silêncio justamente no
  -- caso que mais importa verificar.
  -- ==========================================================
  select email, consent into amostra_email, amostra_consent
  from public.waitlist_legado
  order by created_at asc, id asc
  limit 1;

  select exists (
    select 1
    from public.pessoas p
    join public.inscricoes i on i.pessoa_id = p.id
    where lower(p.email) = lower(amostra_email)
      and i.consent is not distinct from amostra_consent
  ) into amostra_ok;

  if not amostra_ok then
    raise exception
      'ACEITE FALHOU (9): a linha mais antiga do legado (%) nao foi '
      'encontrada no destino com o mesmo consent (%). A contagem bate mas '
      'o conteudo nao — e o pior dos dois mundos.',
      amostra_email, coalesce(amostra_consent::text, 'null');
  end if;

  -- ==========================================================
  -- 10. OS DOIS CHECKS DIFERIDOS ENTRARAM
  --
  -- Eles são a razão de a `010` ter a ordem que tem. Se não estiverem
  -- aqui, a migração passou mas o modelo novo aceita inscrição sem
  -- consentimento — que é o estado que a `004` existiu para fechar.
  -- ==========================================================
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscricoes_consentimento_obrigatorio_check'
      and conrelid = to_regclass('public.inscricoes')
  ) then
    raise exception
      'ACEITE FALHOU (10a): inscricoes_consentimento_obrigatorio_check nao '
      'existe. A secao 5 da 010 nao rodou, e o modelo novo aceita '
      'inscricao sem prova de consentimento.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inscricoes_perfil_obrigatorio_check'
      and conrelid = to_regclass('public.inscricoes')
  ) then
    raise exception 'ACEITE FALHOU (10b): inscricoes_perfil_obrigatorio_check nao existe.';
  end if;

  -- ==========================================================
  -- PASSOU
  -- ==========================================================
  raise notice '';
  raise notice 'ACEITE: OK';
  raise notice '  legado ........... % linhas (% e-mails distintos)', n_legado, n_emails;
  raise notice '  pessoas .......... %', n_pessoas;
  raise notice '  inscricoes ....... % (todas lista_espera, sem safra, sem grupo)', n_inscricoes;
  raise notice '  passivo preservado: % sem consent, % sem perfil', n_consent_origem, n_perfil_origem;
  raise notice '  amostra conferida: %', amostra_email;
  raise notice '';

end $$;

-- ============================================================
-- CONTROLE NEGATIVO — este teste sabe ficar vermelho?
--
-- ⚠️ Um verde só vale se puder ser vermelho. Rode PELO MENOS UM destes
-- em STAGING, confirme a exceção, e desfaça. Nenhum deles em produção.
--
-- Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- ============================================================

-- A. Verde trivial (asserção 2) — o modo de falha que originou o teste.
--    begin;
--      delete from public.inscricoes;
--      delete from public.pessoas;
--      delete from public.waitlist_legado;
--      -- rode este arquivo: tem que falhar em (2), nao passar com 0=0=0
--    rollback;

-- B. Tabela errada com o nome certo (asserção 1b).
--    begin;
--      create table public.waitlist (id uuid);
--      -- rode este arquivo: tem que falhar em (1b)
--    rollback;

-- C. Duplo-run (asserções 4 e 5).
--    begin;
--      insert into public.inscricoes (pessoa_id, safra_id, status)
--        select id, null, 'lista_espera' from public.pessoas limit 1;
--      -- deve falhar antes disso na unique parcial; se PASSAR, rode este
--      -- arquivo e confirme que (4b) ou (5) pega
--    rollback;

-- D. Backfill de consent (asserção 6a) — o mais importante dos quatro.
--    begin;
--      update public.inscricoes
--         set consent = true, consent_at = now(), consent_text = 'x'
--       where consent is null;
--      -- rode este arquivo: tem que falhar em (6a)
--    rollback;
