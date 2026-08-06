-- ============================================================
-- Beyond The Lab — `criar_inscricao`: pessoa + inscrição numa transação
--
-- ============================================================
-- POR QUE ESTA FUNÇÃO EXISTE, E POR QUE ELA É UMA TRANSAÇÃO SÓ
-- ============================================================
--
-- O consentimento mora em `inscricoes`. `pessoas` guarda só contato.
--
-- Consequência direta, e é ela que decide o desenho deste arquivo: um
-- insert de `pessoas` que PASSA seguido de um insert de `inscricoes`
-- que FALHA deixa nome, e-mail e telefone de gente real gravados COM
-- ZERO REGISTRO DE CONSENTIMENTO.
--
-- Sob a LGPD isso não é "linha órfã", é o REQUISITO PROBATÓRIO QUEBRADO:
-- dado pessoal armazenado sem nenhuma base documentada, que é exatamente
-- o estado que a `008` §5 e o `REPORT.md` §9.4 existem para impedir.
--
-- ⚠️ "Auto-cura na tentativa seguinte" NÃO resolve. A linha existe no
-- intervalo — e o intervalo é aberto, porque a tentativa seguinte pode
-- não vir: a pessoa fecha a aba, a rede cai, o build erra. Um estado
-- inválido que depende de uma ação futura para deixar de existir é um
-- estado inválido, ponto.
--
-- Do lado da aplicação não há como costurar isso: o PostgREST expõe uma
-- requisição HTTP por comando, e duas requisições são duas transações.
-- Não existe `begin` do lado do SDK. A transação só pode existir DENTRO
-- do banco, e é isso que uma função é aqui — não conveniência, não
-- economia de round-trip.
--
-- ============================================================
-- ⚠️ NENHUM `exception when unique_violation` NESTE ARQUIVO
-- ============================================================
--
-- É a armadilha que recriaria o problema que a função resolve. Um bloco
-- `begin ... exception ... end` em PL/pgSQL abre uma SUBTRANSAÇÃO, e o
-- rollback dele volta só até o início DAQUELE bloco. Envolver apenas o
-- insert de `inscricoes` num handler para "tratar a duplicata" faria o
-- insert de `pessoas` SOBREVIVER ao erro — precisamente a linha sem
-- consentimento descrita acima, agora produzida de propósito.
--
-- Por isso a duplicata é tratada por `on conflict do nothing`, que é
-- parte do comando e não abre subtransação nenhuma.
--
-- ============================================================
-- A BARREIRA É A CONSTRAINT, NÃO UM `select` ANTES DO INSERT
-- ============================================================
--
-- `REPORT.md` §9.9. Verificar "já existe?" com um `select` e decidir em
-- seguida é uma corrida: entre a leitura e a escrita cabe outra
-- requisição, e duas submissões simultâneas do mesmo formulário passam
-- pelas duas verificações antes de qualquer uma escrever.
--
-- Quem decide é o índice único, que é atômico com o insert. O `select`
-- não é otimização: é uma segunda fonte de verdade que discorda da
-- primeira sob carga.
--
-- Esta função NÃO CRIA barreira nova. Ela depende das que a `007` e a
-- `008` já criaram, e a seção 1 recusa rodar se alguma faltar.
--
-- ============================================================
-- O QUE ELA DEVOLVE: UM BOOLEANO. SÓ.
-- ============================================================
--
-- `true` = inscrição criada agora. `false` = já existia.
--
-- Nenhum dado pessoal atravessa de volta: nem id de pessoa, nem id de
-- inscrição, nem nome, nem status, nem contagem. É o corte de fronteira
-- do `REPORT.md` §9.6 ("toda travessia carrega o mínimo, com corte
-- explícito"), e ele vale igual para RPC — a fronteira aqui é
-- banco → servidor, e o que não sai não vaza depois por um spread
-- distraído três camadas acima.
--
-- ⚠️ E o booleano NÃO PODE VIRAR RESPOSTA DIFERENTE NA ROTA. Duplicata
-- responde idêntico a sucesso (§9.2): mesmo status, mesmo corpo, sem
-- e-mail disparado. O `false` serve para NÃO disparar o e-mail de
-- boas-vindas duas vezes, e para métrica no servidor. Nada além disso.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PRÉ-REQUISITOS — os três índices de que esta função depende
--
-- A função não cria nenhum deles, de propósito: os três já nasceram na
-- `007` e na `008`, com estes nomes e estas formas. Recriar aqui
-- produziria uma segunda declaração da mesma regra em outro arquivo, e
-- duas declarações é o começo de duas versões.
--
-- O que esta seção faz é RECUSAR RODAR se algum não estiver lá, porque
-- sem eles a função fica silenciosamente errada de três maneiras
-- diferentes:
--
--   pessoas_email_lower_idx      → `on conflict (lower(email))` não tem
--     índice para inferir e o insert falha em tempo de execução com
--     42P10. Falha alto, é o menos grave dos três.
--
--   inscricoes_pessoa_safra_idx  → `on conflict do nothing` não encontra
--     conflito nenhum e a mesma pessoa acumula N inscrições na MESMA
--     safra. A função devolve `true` todas as vezes. Ninguém percebe.
--
--   inscricoes_pessoa_espera_idx → idem para a lista de espera. E este é
--     o que a primeira unique NÃO pega, porque em índice único NULL não
--     é igual a NULL: cada par (pessoa, null) é distinto de todos os
--     outros. Ver a `008` §3.
--
-- ⚠️ Condição sobre CATÁLOGO (`pg_class`, `pg_index`, `pg_constraint`) é
-- sempre segura num `if` de PL/pgSQL, e por isso esta seção não precisa
-- de `execute`. O que precisaria é condição que referencie uma RELAÇÃO
-- que pode não existir: o PL/pgSQL prepara a condição inteira como um
-- comando SQL só, e o parser resolve os nomes de relação antes de o
-- `and` chegar a curto-circuitar — daí o 42P01 apesar do `to_regclass`.
-- Ver a nota do `c16` em `docs/04-PLANO.md` e a seção 1 da `010`.
-- `to_regclass` aqui aparece como VALOR (devolve null se a tabela não
-- existe), nunca como nome de relação a ser lido.
--
-- `indisunique` e `indpred` juntos: não basta "existe um índice com esse
-- nome". Um índice único NÃO-parcial em (pessoa_id, safra_id) passaria
-- por um teste de nome e mudaria a regra — `indpred is not null` é o que
-- confere que a forma é a parcial.
-- ------------------------------------------------------------
do $$
declare
  faltando text[] := array[]::text[];
begin
  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'pessoas_email_lower_idx'
      and x.indrelid = to_regclass('public.pessoas')
      and x.indisunique
  ) then
    faltando := faltando || 'pessoas_email_lower_idx (migracao 007)';
  end if;

  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'inscricoes_pessoa_safra_idx'
      and x.indrelid = to_regclass('public.inscricoes')
      and x.indisunique
      and x.indpred is not null
  ) then
    faltando := faltando || 'inscricoes_pessoa_safra_idx parcial (migracao 008)';
  end if;

  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where i.relname = 'inscricoes_pessoa_espera_idx'
      and x.indrelid = to_regclass('public.inscricoes')
      and x.indisunique
      and x.indpred is not null
  ) then
    faltando := faltando || 'inscricoes_pessoa_espera_idx parcial (migracao 008)';
  end if;

  if cardinality(faltando) > 0 then
    raise exception
      'RECUSADO: esta funcao depende de indice(s) que nao existem: %. '
      'Sem eles a duplicata deixa de ser barrada e a funcao devolve '
      '"criada" todas as vezes, sem erro nenhum. Rode 007 e 008 antes.',
      array_to_string(faltando, ', ')
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. A FUNÇÃO
--
-- ⚠️ `security invoker` (o padrão), e é uma decisão.
--
-- `security definer` faria a função rodar como o dono (superusuário no
-- Supabase) e, com isso, ATRAVESSAR a fechadura da `007` e da `008` —
-- RLS ligada, zero policies, `revoke all` de anon e authenticated.
-- Bastaria alguém esquecer o `revoke execute` da seção 4 para o
-- formulário público virar escrita direta em duas tabelas de dado
-- pessoal. Com `security invoker`, a chamada de um papel sem privilégio
-- falha no insert mesmo que ela chegue à função.
--
-- São duas trancas para a mesma porta (privilégio de execução + de
-- tabela), e é de propósito: tranca que só existe num lugar é a que some
-- quando alguém "resolve" um erro de permissão no Studio.
--
-- `set search_path = ''` + tudo qualificado com `public.`: a função não
-- depende do `search_path` de quem a chamou. Mesma forma do trigger da
-- `009`.
-- ------------------------------------------------------------
create or replace function public.criar_inscricao(
  p_nome            text,
  p_email           text,
  p_telefone        text,
  p_nivel_ingles    text,
  p_curso           text,
  p_periodo         text,
  p_disponibilidade text[],
  p_consent_at      timestamptz,
  p_consent_text    text,
  p_safra_id        uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pessoa_id    uuid;
  v_inscricao_id uuid;
begin
  -- ..........................................................
  -- 2.1 A pessoa, resolvida por e-mail
  --
  -- `on conflict (lower(email))` infere o índice FUNCIONAL da `007`. A
  -- inferência precisa repetir a EXPRESSÃO do índice, não o nome da
  -- coluna: `on conflict (email)` não encontra índice nenhum e falha com
  -- 42P10.
  --
  -- ⚠️ `email` NÃO ENTRA no `do update`. Quem volta com 'Maria@x.com'
  -- depois de ter entrado como 'maria@x.com' continua gravada como
  -- entrou. Reescrever a coluna seria mexer em dado herdado sem
  -- necessidade — o índice funcional já garante que são a MESMA pessoa,
  -- que é a única coisa que o sistema precisa saber. Normalizar a coluna
  -- é decisão separada, e não se toma de passagem dentro de um upsert.
  --
  -- `nome` e `telefone` ENTRAM: são "o dado mais recente serve para
  -- falar com a pessoa" (`007`, comentário das colunas). Quem volta com
  -- telefone novo tem o telefone atualizado, e é o número de agora que o
  -- grupo de WhatsApp usa.
  --
  -- ⚠️ ISTO DEPENDE DE `pessoas.telefone` SER `not null`. Se a decisão
  -- pendente da `007` tornar a coluna NULLABLE, este `do update` vira um
  -- caminho de PERDA DE DADO: uma submissão sem telefone sobrescreveria
  -- com null um número que já se conhecia. Hoje o `not null` recusa a
  -- linha inteira e o problema não existe; no dia em que ele sair, aqui
  -- precisa virar `coalesce(excluded.telefone, public.pessoas.telefone)`.
  -- Escrever o `coalesce` agora seria código morto que ninguém consegue
  -- exercitar — a nota é a forma honesta de deixar isso resolvido.
  --
  -- O upsert é ATÔMICO: duas submissões simultâneas do mesmo e-mail não
  -- criam duas pessoas. Uma insere, a outra atualiza.
  --
  -- E ele NÃO PODE VAZAR se o e-mail já existia (`007`, §CONSEQUÊNCIA):
  -- é por isso que os dois ramos devolvem `id` do mesmo jeito e nada
  -- daqui chega ao valor de retorno da função.
  -- ..........................................................
  insert into public.pessoas (nome, email, telefone)
  values (p_nome, p_email, p_telefone)
  on conflict (lower(email)) do update
    set nome     = excluded.nome,
        telefone = excluded.telefone
  returning id into v_pessoa_id;

  -- ..........................................................
  -- 2.2 A inscrição
  --
  -- STATUS É DERIVADO DE `p_safra_id`, E NÃO É PARÂMETRO.
  --
  -- O CHECK `inscricoes_safra_status_coerentes_check` da `009` amarra os
  -- dois campos: `safra_id is null` ⟺ `status = 'lista_espera'`. Um par
  -- incoerente é recusado pelo banco de qualquer forma — então receber
  -- `status` como parâmetro só criaria uma forma de a chamada estar
  -- errada sem criar nenhuma forma de ela estar mais certa. Derivar aqui
  -- torna o par impossível de escrever torto.
  --
  -- ⚠️ NÃO EXISTE 'aprovada' NEM 'rejeitada' (D-02). Não há entrevista,
  -- análise ou triagem: quem conclui o checkout está dentro, e quem não
  -- tem safra aberta fica esperando. Os dois únicos destinos de uma
  -- inscrição NOVA são estes.
  --
  -- `pendente_pagamento` é INALCANÇÁVEL no corte 1, de propósito: o
  -- corte sobe com `inscricoes_abertas = false` em toda safra, a rota
  -- nunca acha safra ativa e `p_safra_id` chega null sempre. O ramo
  -- existe para que a função não precise ser revisitada quando o
  -- checkout (`c35`) chegar.
  --
  -- ⚠️ QUANDO A `015` CHEGAR (corte 2, `c33`), é AQUI que os valores
  -- travados são copiados da safra (D-06) — dentro desta transação,
  -- junto com a linha que eles descrevem. As colunas ainda não existem;
  -- por isso não estão aqui.
  --
  -- O QUE NÃO É PARÂMETRO, E NÃO É ESQUECIMENTO:
  --
  --   `grupo_id` — alocação é ato da Giovana no painel, ortogonal ao
  --     status (D-03), e inscrição de lista de espera não pode ter
  --     grupo (o trigger da `009` recusa). Uma inscrição nasce sem
  --     horário, sempre.
  --
  --   `payment_choice` — morreu (D-11). O campo perguntava "quer pagar
  --     agora?" numa tela onde pagar era logicamente impossível, e os
  --     dois valores gravavam igual.
  --
  --   contagem de vagas — NÃO se faz aqui. Vaga é limite MOLE (D-08):
  --     o sistema conta antes de abrir o checkout e recusa se estourou,
  --     e não há trava transacional. Contar dentro desta função com o
  --     insert no mesmo comando é justamente criar a trava que a D-08
  --     decidiu não pagar — o painel mostra o estouro em vermelho e a
  --     Giovana resolve com uma conversa.
  --
  --   `consent` — não é parâmetro porque não é uma pergunta que o
  --     chamador responde: inscrição nova SEMPRE grava consentimento
  --     completo, tudo-ou-nada (§9.4). Recebê-lo criaria uma chamada
  --     capaz de pedir `false`, que é "a pessoa recusou e entrou assim
  --     mesmo" — o CHECK `inscricoes_consent_nunca_false_check` da `009`
  --     recusaria, mas o parâmetro sugeriria que existe essa opção.
  --     `consent_at` e `consent_text` SÃO parâmetros porque são gerados
  --     no servidor um passo antes: o carimbo nasce logo depois da
  --     validação que o exigiu (Fluxo 1, ⑤), não dentro da chamada ao
  --     banco, onde mediria a latência do PostgREST em vez do instante
  --     da manifestação. E `consent_text` tem fonte única em
  --     `src/config/consentimento.ts` (§9.7).
  --
  -- Os dois nulos não são checados aqui de propósito: quem recusa é o
  -- CHECK `inscricoes_consentimento_obrigatorio_check` da `010`. Repetir
  -- a regra em PL/pgSQL criaria duas cópias dela, e um dia elas
  -- discordam — constraint no banco vence validação em código (§9.9),
  -- inclusive código que mora dentro do banco.
  --
  -- ⚠️ `null` continua reservado às linhas HERDADAS da `010`. Toda linha
  -- escrita por esta função tem o trio completo. Zero backfill, zero
  -- default: `null` significa "não sabemos", e é o que torna visível em
  -- qualquer query quem não tem base documentada.
  --
  -- `on conflict do nothing` SEM alvo, e é a forma certa:
  --
  --   a) as duas uniques parciais são DOIS alvos, e um comando só não
  --      pode inferir dois. A forma sem alvo cobre as duas.
  --   b) DUPLICATA É MESMA PESSOA NA MESMA SAFRA — regra de negócio.
  --      Safra nova é inscrição nova: o curso é RECOMPRÁVEL, e quem está
  --      hoje na lista de espera precisa conseguir comprar quando o
  --      checkout abrir. Era exatamente isso que o unique de e-mail da
  --      `waitlist` impedia (`007`, o problema 1).
  --   c) `do nothing` e não `do update`: em caso de duplicata, O
  --      CONSENTIMENTO DA INSCRIÇÃO EXISTENTE NÃO É SOBRESCRITO. O
  --      registro probatório é o da PRIMEIRA vez, com a DATA da primeira
  --      vez. Carimbar de novo com `now()` reescreveria a prova para
  --      dizer que a manifestação aconteceu num momento em que ela não
  --      aconteceu — e a coluna existe justamente para que isso seja
  --      impossível (`008` §5: prova não se normaliza, e não se
  --      atualiza).
  --
  --      O perfil da inscrição existente também fica como está, pela
  --      mesma via. Não é omissão: um update que "só atualiza o perfil"
  --      não tem como se distinguir, seis meses depois, de um que
  --      encostou no trio de consentimento, e ninguém pediu essa
  --      atualização. Se um dia ela for pedida, é decisão explícita —
  --      não efeito colateral de reenviar o formulário.
  --
  -- `returning id into v_inscricao_id`: com `do nothing`, um conflito
  -- NÃO devolve linha, e `v_inscricao_id` fica null. É assim que a
  -- função sabe distinguir os dois casos sem um `select` extra e sem
  -- corrida — a resposta vem do mesmo comando que escreveu.
  -- ..........................................................
  insert into public.inscricoes (
    pessoa_id, safra_id, grupo_id, status,
    nivel_ingles, curso, periodo, disponibilidade,
    consent, consent_at, consent_text
  )
  values (
    v_pessoa_id,
    p_safra_id,
    null,                     -- grupo_id — ver acima
    case when p_safra_id is null
         then 'lista_espera'
         else 'pendente_pagamento'
    end,
    p_nivel_ingles,
    p_curso,
    p_periodo,
    p_disponibilidade,
    true,                     -- consent — ver acima
    p_consent_at,
    p_consent_text
  )
  on conflict do nothing
  returning id into v_inscricao_id;

  return v_inscricao_id is not null;
end;
$$;

-- ------------------------------------------------------------
-- 3. Documentação
-- ------------------------------------------------------------
comment on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text, uuid
) is
  'Cria pessoa + inscrição NUMA TRANSAÇÃO SÓ. Existe porque o '
  'consentimento mora em inscricoes: um insert de pessoas que passa '
  'seguido de um insert de inscricoes que falha deixaria dado pessoal '
  'gravado sem NENHUM registro de consentimento, e sob LGPD isso é o '
  'requisito probatório quebrado, não uma linha órfã. Duas requisições '
  'do PostgREST sao duas transacoes; a transacao so pode existir aqui. '
  'Resolve a pessoa por lower(email) com upsert (nome e telefone viram '
  'os mais recentes; o email NAO e reescrito) e insere a inscricao com '
  'on conflict do nothing — duplicata e MESMA PESSOA NA MESMA SAFRA, e '
  'safra nova e inscricao nova, porque o curso e recompravel. '
  'Em duplicata o consentimento existente NAO e sobrescrito: a prova e a '
  'da primeira vez, com a data da primeira vez. '
  'status e DERIVADO de safra_id (null -> lista_espera, senao '
  'pendente_pagamento), respeitando o CHECK da 009; nao existe aprovada '
  'nem rejeitada (D-02). '
  'Devolve APENAS um booleano: true = criada agora, false = ja existia. '
  'Nenhum dado pessoal atravessa de volta (REPORT §9.6), e o booleano '
  'nao pode virar resposta diferente na rota (§9.2).';

-- ------------------------------------------------------------
-- 4. Fechadura
--
-- ⚠️ O Postgres concede `execute` a `PUBLIC` em TODA função nova, por
-- padrão. No Supabase isso significa que a função nasce publicada no
-- PostgREST e chamável por `anon` — quer dizer, por qualquer pessoa com
-- a chave que está no bundle do navegador.
--
-- O `revoke` abaixo não é zelo: sem ele, esta função é um endpoint
-- público de escrita em duas tabelas de dado pessoal. `security invoker`
-- impediria a escrita mesmo assim (a `007` e a `008` revogam tudo de
-- anon e authenticated), mas as duas trancas existem porque uma delas
-- vai ser aberta por engano algum dia.
--
-- `service_role` é o único chamador, e ele vem de módulo `server-only`,
-- sem `NEXT_PUBLIC_` em lugar nenhum (§9.5).
--
-- A assinatura completa é obrigatória: `revoke` e `grant` operam sobre
-- uma sobrecarga específica, não sobre o nome.
-- ------------------------------------------------------------
revoke execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text, uuid
) from public, anon, authenticated;

grant execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text, uuid
) to service_role;

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. A função existe, com a assinatura e a volatilidade certas?
--    Esperado: uma linha, prosecdef = false (security INVOKER),
--    proconfig contendo search_path=.
select
  p.proname                       as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_function_result(p.oid)   as devolve,
  p.prosecdef                     as security_definer,
  p.proconfig                     as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 2. ⚠️ QUEM PODE EXECUTAR?
--    Esperado: service_role, e SÓ ele. Se `anon` ou `PUBLIC` aparecer,
--    o formulário virou escrita direta em duas tabelas de dado pessoal.
select
  p.proname,
  coalesce(p.proacl::text, 'NULO = PUBLIC PODE EXECUTAR — ERRADO') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao';

-- 3. Os três índices de que ela depende continuam de pé, e parciais?
--    Esperado: três linhas. As duas de `inscricoes` com WHERE na
--    definição. Se uma sumir, a duplicata deixa de ser barrada e a
--    função devolve `true` todas as vezes, SEM ERRO.
select
  c.relname   as tabela,
  i.relname   as indice,
  pg_get_indexdef(x.indexrelid) as definicao
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class c on c.oid = x.indrelid
where i.relname in (
  'pessoas_email_lower_idx',
  'inscricoes_pessoa_safra_idx',
  'inscricoes_pessoa_espera_idx'
)
order by c.relname, i.relname;

-- ============================================================
-- TESTES DE BARREIRA — o que a função tem que fazer, e o que ela tem
-- que RECUSAR.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS e escritas de teste,
-- não regra. Ver a nota do `c16` em docs/04-PLANO.md sobre teste que lê
-- .sql como texto — um varredor ingênuo lê o bloco abaixo como se fosse
-- parte da migração.
--
-- ⚠️ NÃO RODE ESTES EM PRODUÇÃO. Eles gravam pessoa e inscrição de
-- verdade, e `pessoas` não tem delete em cascata (FK `restrict`, `008`
-- §2): limpar exige apagar a inscrição primeiro. Staging.
-- ============================================================

-- A. Primeira chamada → true. Segunda, idêntica → false.
--    É o caminho de duplicata inteiro. Se a segunda devolver `true`,
--    alguma das uniques parciais não está lá.
-- select public.criar_inscricao(
--   'Teste Barreira', 'barreira@exemplo.invalid', '+5521999999999',
--   'basico', 'Fonoaudiologia', '3', array['seg','qua'],
--   now(), 'texto de consentimento do teste'
-- );  -- esperado: true
-- select public.criar_inscricao(
--   'Teste Barreira', 'barreira@exemplo.invalid', '+5521999999999',
--   'basico', 'Fonoaudiologia', '3', array['seg','qua'],
--   now(), 'texto de consentimento do teste'
-- );  -- esperado: FALSE

-- B. O consentimento da primeira vez sobreviveu à segunda chamada?
--    Esperado: `consent_at` e `consent_text` iguais aos da chamada A, e
--    UMA linha só. Se a data for a da segunda chamada, o `do nothing`
--    virou `do update` e a prova foi reescrita.
-- select i.consent, i.consent_at, i.consent_text, i.created_at
-- from public.inscricoes i
-- join public.pessoas p on p.id = i.pessoa_id
-- where lower(p.email) = 'barreira@exemplo.invalid';

-- C. Mesmo e-mail em caixa diferente, com telefone novo → false,
--    e o telefone da pessoa atualizado SEM criar segunda pessoa.
--    Esperado: uma pessoa só, telefone = ...998, e-mail ainda em
--    minúscula (o `do update` não toca em `email`).
-- select public.criar_inscricao(
--   'Teste Barreira', 'BARREIRA@exemplo.invalid', '+5521999999998',
--   'basico', 'Fonoaudiologia', '3', array['seg','qua'],
--   now(), 'texto de consentimento do teste'
-- );  -- esperado: FALSE
-- select nome, email, telefone from public.pessoas
-- where lower(email) = 'barreira@exemplo.invalid';

-- D. ⚠️ A TRANSAÇÃO É UMA SÓ — o teste que justifica o arquivo inteiro.
--    Consentimento incompleto: o CHECK da `010` recusa a inscrição, e a
--    PESSOA NÃO PODE FICAR GRAVADA.
--    Esperado: erro inscricoes_consentimento_obrigatorio_check, e a
--    consulta seguinte devolvendo ZERO linhas. Se ela devolver uma
--    pessoa, existe dado pessoal no banco sem nenhum registro de
--    consentimento, e é exatamente o que esta função existe para
--    impedir.
-- select public.criar_inscricao(
--   'Teste Orfao', 'orfao@exemplo.invalid', '+5521999999997',
--   'basico', 'Fonoaudiologia', '3', array['seg','qua'],
--   null, null
-- );
-- select count(*) as deve_ser_zero from public.pessoas
-- where lower(email) = 'orfao@exemplo.invalid';

-- E. Perfil incompleto → inscricoes_perfil_obrigatorio_check, e de novo
--    ZERO pessoa gravada. Mesma prova que D, por outro caminho.
-- select public.criar_inscricao(
--   'Teste Orfao 2', 'orfao2@exemplo.invalid', '+5521999999996',
--   null, null, null, null,
--   now(), 'texto de consentimento do teste'
-- );
-- select count(*) as deve_ser_zero from public.pessoas
-- where lower(email) = 'orfao2@exemplo.invalid';

-- F. Safra inexistente → erro de FK, e ZERO pessoa gravada.
-- select public.criar_inscricao(
--   'Teste Orfao 3', 'orfao3@exemplo.invalid', '+5521999999995',
--   'basico', 'Fonoaudiologia', '3', array['seg'],
--   now(), 'texto de consentimento do teste',
--   '00000000-0000-0000-0000-000000000000'
-- );

-- G. A mesma pessoa se inscreve numa SAFRA de verdade depois de estar na
--    lista de espera → true. NÃO é duplicata: safra nova é inscrição
--    nova, e é o que destrava quem está esperando o checkout abrir.
--    Troque <SAFRA> por um id real.
-- select public.criar_inscricao(
--   'Teste Barreira', 'barreira@exemplo.invalid', '+5521999999999',
--   'basico', 'Fonoaudiologia', '3', array['seg','qua'],
--   now(), 'texto de consentimento do teste',
--   '<SAFRA>'
-- );  -- esperado: TRUE, e a linha nasce em pendente_pagamento
