-- ============================================================
-- Beyond The Lab — `criar_inscricao`, versão do checkout
--
-- ⛔ Rode depois da `015`. Ela depende das três colunas travadas.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela cria uma SEGUNDA
--    sobrecarga de `criar_inscricao` e não toca em nenhuma linha.
--
-- ============================================================
-- O QUE MUDA EM RELAÇÃO À `011b`, E POR QUÊ
-- ============================================================
--
-- Duas coisas, e as duas são exigidas pelo checkout (`c35`):
--
--   1. OS TRÊS VALORES TRAVADOS ENTRAM COMO PARÂMETRO (D-06). Eles são
--      escritos na MESMA transação que cria a inscrição, e não por um
--      `update` logo depois. A alternativa — inserir e depois atualizar —
--      produziria, no intervalo entre os dois comandos, uma inscrição em
--      `pendente_pagamento` sem contrato nenhum: um estado inválido que
--      depende de uma ação futura para deixar de existir, que é a mesma
--      coisa que o cabeçalho da `011b` recusa para o par pessoa/inscrição.
--      A `015` deixa `pendente_pagamento` de fora da exigência do CHECK
--      justamente porque as colunas "estão sendo escritas" ali — o que
--      esta função faz é encurtar esse "estão sendo escritas" para zero.
--
--   2. ELA DEVOLVE O ID DA INSCRIÇÃO, e não só o booleano.
--
--      ⚠️ E o motivo NÃO é conveniência. A Checkout Session precisa do id
--      da inscrição em `client_reference_id` — é ele que o webhook usa
--      para saber qual linha confirmar. Logo a inscrição tem que existir
--      ANTES da sessão. Se o Stripe falhar nesse instante, sobra alguém em
--      `pendente_pagamento` sem sessão nenhuma: um estado sem saída,
--      alcançado por acidente.
--
--      Com o id na mão, a segunda tentativa da MESMA pessoa encontra a
--      inscrição que já existe e abre uma sessão PARA ELA, em vez de
--      responder "você já está inscrita" e deixá-la presa. O estado órfão
--      passa a ser recuperável pela própria pessoa, sem a Giovanna abrir
--      o Studio (D-07) e sem link com id cru em e-mail (D-15).
--
-- ============================================================
-- ⚠️⚠️ POR QUE A FUNÇÃO DE 10 ARGUMENTOS CONTINUA VIVA DEPOIS DAQUI
-- ============================================================
--
-- Porque dropá-la aqui DERRUBA O FORMULÁRIO, e "nenhum passo pode
-- derrubar o formulário" é a regra de ouro do plano — há gente real na
-- lista de espera.
--
-- A sequência real é: migração roda, DEPOIS o deploy sobe. Entre os dois
-- momentos, o build que está no ar continua chamando `criar_inscricao`
-- com os dez argumentos da `011b`. Se a de dez não existir mais, o
-- PostgREST responde "function not found" e toda inscrição vira 500 até
-- o deploy terminar. É exatamente a janela que a `011` abriu de propósito
-- (renomear `waitlist`) e que foi declarada, lá, como a ÚNICA interrupção
-- aceita do projeto inteiro. Uma segunda não é aceita.
--
-- ⚠️ E não adianta dar `default null` aos três parâmetros novos para que
-- a chamada antiga caia na função nova. Ela cairia — e voltaria um objeto
-- onde o build antigo espera um booleano. O `typeof data !== 'boolean'`
-- de `src/lib/supabase.ts` trataria isso como falha e responderia 500
-- DEPOIS de a linha já ter sido gravada: a pessoa vê "tente de novo",
-- tenta, e a segunda tentativa responde duplicata. O pior dos dois
-- mundos, porque o dado entrou e a pessoa foi informada do contrário.
--
-- Por isso os três entram SEM DEFAULT: assim a chamada de dez argumentos
-- só casa com a função de dez, e a de treze só com a de treze. O
-- PostgREST resolve sobrecarga pelo CONJUNTO DE CHAVES do corpo JSON, e
-- sem default não há interseção entre os dois conjuntos.
--
-- ⚠️ CONSEQUÊNCIA NA ORDEM DOS PARÂMETROS: em PL/pgSQL, parâmetro sem
-- default não pode vir depois de um com default. `p_safra_id uuid default
-- null` é contrato travado (ver o bloco dele na `011b` e o teste que o
-- lê), então os três travados entram ANTES dele. A ordem parece torta —
-- `p_safra_id` e os travados são a mesma decisão — e é o preço de manter
-- o default que a lista de espera inteira depende. Ninguém chama esta
-- função por posição: o `.rpc()` casa por nome.
--
-- ⚠️ A DE DEZ MORRE NA `018`, e não antes. Ordem: rodar esta → regerar
-- tipos → deployar → conferir que ninguém mais chama a antiga → rodar a
-- `018`. Enquanto as duas existirem, `supabase gen types` descreve as
-- duas, e é assim que tem que ser.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PRÉ-REQUISITOS
--
-- Os mesmos três índices da `011b` — a função não cria nenhum deles, de
-- propósito, porque duas declarações da mesma regra é o começo de duas
-- versões dela. Sem eles a função fica silenciosamente errada:
--
--   pessoas_email_lower_idx      → `on conflict (lower(email))` não tem
--     índice para inferir e o insert falha com 42P10. Falha alto, é o
--     menos grave dos três.
--
--   inscricoes_pessoa_safra_idx  → `on conflict do nothing` não encontra
--     conflito e a mesma pessoa acumula N inscrições na MESMA safra. A
--     função devolve `criada = true` todas as vezes. Ninguém percebe.
--
--   inscricoes_pessoa_espera_idx → idem para a lista de espera. Este é o
--     que a primeira unique NÃO pega, porque em índice único NULL não é
--     igual a NULL: cada par (pessoa, null) é distinto de todos os
--     outros. Ver a `008` §3.
--
-- Mais um, que a `011b` não tinha como exigir: AS TRÊS COLUNAS TRAVADAS
-- (`015`). Sem elas o `insert` abaixo falha com 42703 — falha alto, mas
-- só no primeiro checkout de verdade, que é o pior momento possível para
-- descobrir que uma migração ficou para trás.
--
-- ⚠️ Condição sobre CATÁLOGO (`pg_class`, `pg_index`, `pg_attribute`) é
-- sempre segura num `if` de PL/pgSQL, e por isso esta seção não precisa
-- de `execute`. O que precisaria é condição que referencie uma RELAÇÃO
-- que pode não existir: o PL/pgSQL prepara a condição inteira como um
-- comando SQL só, e o parser resolve os nomes de relação antes de o `and`
-- chegar a curto-circuitar — daí o 42P01 apesar do `to_regclass`. Ver a
-- nota do `c16` em `docs/04-PLANO.md`. `to_regclass` aqui aparece como
-- VALOR (devolve null se a tabela não existe), nunca como nome de relação
-- a ser lido.
--
-- `indisunique` e `indpred` juntos: não basta "existe um índice com esse
-- nome". Um índice único NÃO-parcial em (pessoa_id, safra_id) passaria
-- por um teste de nome e mudaria a regra.
-- ------------------------------------------------------------
do $$
declare
  faltando text[] := array[]::text[];
  coluna   text;
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

  foreach coluna in array array[
    'valor_mensal_travado',
    'duracao_meses_travada',
    'data_primeira_cobranca_travada'
  ] loop
    if not exists (
      select 1
      from pg_attribute a
      where a.attrelid = to_regclass('public.inscricoes')
        and a.attname = coluna
        and a.attnum > 0
        and not a.attisdropped
    ) then
      faltando := faltando || (coluna || ' em inscricoes (migracao 015)');
    end if;
  end loop;

  if cardinality(faltando) > 0 then
    raise exception
      'RECUSADO: esta funcao depende de objeto(s) que nao existem: %. '
      'Sem os indices a duplicata deixa de ser barrada e a funcao devolve '
      '"criada" todas as vezes, sem erro nenhum; sem as colunas travadas o '
      'checkout grava contrato vazio. Rode 007, 008 e 015 antes.',
      array_to_string(faltando, ', ')
      using errcode = 'raise_exception';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. A FUNÇÃO
--
-- ⚠️ `security invoker` (o padrão), e é a mesma decisão da `011b`.
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
-- depende do `search_path` de quem a chamou.
--
-- ============================================================
-- ⚠️ NENHUM `exception when unique_violation` NESTE ARQUIVO
-- ============================================================
--
-- É a armadilha que recriaria o problema que a função resolve. Um bloco
-- `begin ... exception ... end` em PL/pgSQL abre uma SUBTRANSAÇÃO, e o
-- rollback dele volta só até o início DAQUELE bloco. Envolver apenas o
-- insert de `inscricoes` num handler para "tratar a duplicata" faria o
-- insert de `pessoas` SOBREVIVER ao erro — uma linha de dado pessoal sem
-- nenhum registro de consentimento, agora produzida de propósito. Sob a
-- LGPD isso não é "linha órfã", é o requisito probatório quebrado.
--
-- Por isso a duplicata é tratada por `on conflict do nothing`, que é
-- parte do comando e não abre subtransação nenhuma.
--
-- ============================================================
-- O QUE ELA DEVOLVE, E O QUE CONTINUA NÃO ATRAVESSANDO
-- ============================================================
--
-- Cinco campos: o id da inscrição, o booleano `criada`, e os três
-- valores travados DAQUELA LINHA.
--
-- ⚠️ O RECORTE ALARGOU, E A REGRA NÃO AFROUXOU. O corte de fronteira do
-- `REPORT.md` §9.6 é "carregar o mínimo, com o corte explícito" — não
-- "carregar um booleano para sempre". O mínimo mudou porque o chamador
-- mudou: quem monta a Checkout Session precisa saber qual inscrição pagar
-- e QUANTO ela deve pagar. Continua fora, e continua sendo o que importa:
-- nome, e-mail, telefone, status, consentimento, contagem — nada de dado
-- pessoal atravessa de volta, e o que não sai não vaza depois por um
-- spread distraído três camadas acima.
--
-- ⚠️ POR QUE OS TRAVADOS VOLTAM, SE O CHAMADOR ACABOU DE MANDÁ-LOS: eles
-- só coincidem no caminho de inscrição NOVA. Na duplicata — que é
-- justamente o caso que esta versão existe para destravar — a linha que
-- já está no banco tem os valores da PRIMEIRA vez, e o `on conflict do
-- nothing` não os sobrescreve. Devolver o que está gravado faz a sessão
-- de checkout cobrar o que a inscrição diz, e não o que o chamador
-- supunha. É a diferença entre mecanismo e disciplina: sem isso, a rota
-- teria que lembrar de reler a linha, e um dia não lembra.
--
-- ⚠️ E o `criada = false` NÃO PODE VIRAR ERRO NA ROTA. Duplicata é
-- sucesso: HTTP 200, `ok: true`, e nenhum e-mail disparado. O booleano
-- serve para NÃO mandar boas-vindas duas vezes e para métrica no
-- servidor. Ver o bloco DUPLICATA em `app/api/inscricao/route.ts`, que
-- documenta o que mudou e o que não mudou do §9.2.
-- ------------------------------------------------------------
create or replace function public.criar_inscricao(
  p_nome                           text,
  p_email                          text,
  p_telefone                       text,
  p_nivel_ingles                   text,
  p_curso                          text,
  p_periodo                        text,
  p_disponibilidade                text[],
  p_consent_at                     timestamptz,
  p_consent_text                   text,
  p_valor_mensal_travado           numeric,
  p_duracao_meses_travada          int,
  p_data_primeira_cobranca_travada date,
  p_safra_id                       uuid default null
)
returns table (
  inscricao_id                   uuid,
  criada                         boolean,
  valor_mensal_travado           numeric,
  duracao_meses_travada          int,
  data_primeira_cobranca_travada date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pessoa_id    uuid;
  v_inscricao_id uuid;
  v_criada       boolean;
  v_valor        numeric;
  v_duracao      int;
  v_data         date;
begin
  -- ..........................................................
  -- 2.1 A pessoa, RESOLVIDA — não atualizada
  --
  -- Este passo só responde "qual é o id desta pessoa?". Ele NÃO
  -- SOBRESCREVE NENHUM DADO DE CONTATO. A atualização de `nome` e
  -- `telefone` acontece na 2.4, depois de a inscrição ter nascido, e só
  -- se ela tiver nascido.
  --
  -- ⚠️⚠️ POR QUE O UPSERT NÃO PODE ATUALIZAR AQUI
  --
  -- Um `do update set nome = excluded.nome, telefone = excluded.telefone`
  -- parece o óbvio ("o dado mais recente serve para falar com a pessoa",
  -- `007`) e é um DEFEITO DE SEGURANÇA, porque este é um formulário
  -- PÚBLICO e SEM AUTENTICAÇÃO. Qualquer pessoa que digite um e-mail
  -- conhecido troca o nome e o telefone daquele contato no banco, em
  -- silêncio e sem rastro. Somado à resposta de duplicata, o formulário
  -- deixaria de ser só um oráculo de "este e-mail existe?" e passaria a
  -- ser um oráculo QUE TAMBÉM EDITA: digita o e-mail, descobre que
  -- existe, substitui o telefone. A Giovanna liga para o número errado e
  -- não tem como saber por quê — a linha não guarda quem a mudou.
  --
  -- Escrever contato só quando uma INSCRIÇÃO NOVA nasce é o que amarra a
  -- edição a um ato que a pessoa de fato praticou. Não é autenticação —
  -- o formulário não tem —, mas é a diferença entre "quem se inscreve
  -- atualiza o próprio contato" e "quem adivinha um e-mail edita o
  -- contato alheio".
  --
  -- ⚠️ O `set email = pessoas.email` é um TOQUE NO-OP, e cada metade dele
  -- é obrigatória:
  --
  --   ...POR QUE `do update` E NÃO `do nothing`: com `do nothing` o
  --   comando não devolve linha nenhuma no conflito, e `v_pessoa_id`
  --   ficaria null. O remendo seria um `select` depois — e aí volta a
  --   corrida: se outra transação acabou de inserir o mesmo e-mail e
  --   ainda não commitou, o `select` não a enxerga e a função escreve uma
  --   inscrição com pessoa nula. O `do update` é o idioma que faz o
  --   `returning` disparar nos dois caminhos, e é atômico com o insert.
  --
  --   ...POR QUE `pessoas.email` E NUNCA `excluded.email`: o conflito
  --   casa por `lower()`, então `excluded` pode trazer OUTRA CAIXA.
  --   `set email = excluded.email` reescreveria 'maria@x.com' como
  --   'Maria@x.com' — mudança silenciosa na grafia de dado herdado da
  --   `010`, feita de passagem, por quem só digitou o e-mail com o shift
  --   preso. `pessoas.email` é o valor JÁ ARMAZENADO: a linha continua
  --   exatamente como entrou.
  --
  -- `on conflict (lower(email))` infere o índice FUNCIONAL da `007`. A
  -- inferência precisa repetir a EXPRESSÃO do índice, não o nome da
  -- coluna: `on conflict (email)` não encontra índice nenhum e falha com
  -- 42P10.
  -- ..........................................................
  insert into public.pessoas (nome, email, telefone)
  values (p_nome, p_email, p_telefone)
  on conflict (lower(email)) do update
    set email = pessoas.email   -- toque no-op, valor já armazenado — ver acima
  returning id into v_pessoa_id;

  -- ..........................................................
  -- 2.2 A inscrição, com o contrato dentro
  --
  -- STATUS É DERIVADO DE `p_safra_id`, E NÃO É PARÂMETRO.
  --
  -- O CHECK `inscricoes_safra_status_coerentes_check` da `009` amarra os
  -- dois campos: `safra_id is null` ⟺ `status = 'lista_espera'`. Um par
  -- incoerente é recusado pelo banco de qualquer forma — então receber
  -- `status` como parâmetro só criaria uma forma de a chamada estar
  -- errada sem criar nenhuma forma de ela estar mais certa.
  --
  -- ⚠️ NÃO EXISTE 'aprovada' NEM 'rejeitada' (D-02). Não há entrevista,
  -- análise ou triagem: quem conclui o checkout está dentro, e quem não
  -- tem safra aberta fica esperando. Os dois únicos destinos de uma
  -- inscrição NOVA continuam sendo estes.
  --
  -- ⚠️ OS TRÊS TRAVADOS ENTRAM COMO VIERAM, SEM VALIDAÇÃO AQUI, e a
  -- ausência de validação é decisão — a mesma da `011b` sobre os nulos de
  -- consentimento. Quem recusa combinação inválida são os CHECKs da
  -- `015`:
  --
  --   tudo-ou-nada entre os três     → inscricoes_travados_tudo_ou_nada_check
  --   lista de espera sem travado    → inscricoes_espera_sem_travado_check
  --   quem já pagou tem que ter      → inscricoes_paga_tem_travado_check
  --
  -- Repetir essas regras em PL/pgSQL criaria uma segunda cópia delas, e
  -- um dia as duas discordam. Constraint no banco vence validação em
  -- código (§9.9), inclusive código que mora dentro do banco. Em
  -- particular: chamar esta função com `p_safra_id` null e travados
  -- preenchidos é ERRO, e quem levanta o erro é o CHECK — não um `raise`
  -- daqui que dissesse a mesma coisa com outras palavras.
  --
  -- O QUE CONTINUA NÃO SENDO PARÂMETRO, E NÃO É ESQUECIMENTO:
  --
  --   `grupo_id` — alocação é ato da Giovanna no painel, ortogonal ao
  --     status (D-03), e inscrição de lista de espera não pode ter grupo
  --     (o trigger da `009` recusa). Uma inscrição nasce sem horário,
  --     sempre.
  --
  --   `payment_choice` — morreu (D-11). O campo perguntava "quer pagar
  --     agora?" numa tela onde pagar era logicamente impossível, e os
  --     dois valores gravavam igual.
  --
  --   contagem de vagas — NÃO se faz aqui. Vaga é limite MOLE (D-08): o
  --     sistema conta antes de abrir o checkout e recusa se estourou, e
  --     não há trava transacional. Contar dentro desta função com o
  --     insert no mesmo comando é justamente criar a trava que a D-08
  --     decidiu não pagar — o painel mostra o estouro em vermelho e a
  --     Giovanna resolve com uma conversa.
  --
  --   `consent` — não é parâmetro porque não é uma pergunta que o
  --     chamador responde: inscrição nova SEMPRE grava consentimento
  --     completo, tudo-ou-nada (§9.4). Recebê-lo criaria uma chamada
  --     capaz de pedir `false`, que é "a pessoa recusou e entrou assim
  --     mesmo". `consent_at` e `consent_text` SÃO parâmetros porque são
  --     gerados no servidor um passo antes: o carimbo nasce logo depois
  --     da validação que o exigiu, não dentro da chamada ao banco, onde
  --     mediria a latência do PostgREST. E `consent_text` tem fonte única
  --     em `src/config/consentimento.ts` (§9.7).
  --
  -- ⚠️ `null` em consentimento continua reservado às linhas HERDADAS da
  -- `010`. Toda linha escrita por esta função tem o trio completo. Zero
  -- backfill, zero default: `null` significa "não sabemos", e é o que
  -- torna visível em qualquer query quem não tem base documentada.
  --
  -- `on conflict do nothing` SEM alvo, e é a forma certa:
  --
  --   a) as duas uniques parciais são DOIS alvos, e um comando só não
  --      pode inferir dois. A forma sem alvo cobre as duas.
  --   b) DUPLICATA É MESMA PESSOA NA MESMA SAFRA — regra de negócio.
  --      Safra nova é inscrição nova: o curso é RECOMPRÁVEL, e quem está
  --      hoje na lista de espera precisa conseguir comprar quando o
  --      checkout abrir.
  --   c) `do nothing` e não `do update`: em caso de duplicata, O
  --      CONSENTIMENTO DA INSCRIÇÃO EXISTENTE NÃO É SOBRESCRITO. O
  --      registro probatório é o da PRIMEIRA vez, com a DATA da primeira
  --      vez. Carimbar de novo com `now()` reescreveria a prova para
  --      dizer que a manifestação aconteceu num momento em que ela não
  --      aconteceu (`008` §5: prova não se normaliza, e não se atualiza).
  --
  --      ⚠️ E ISSO AGORA VALE TAMBÉM PARA OS TRAVADOS. Um `do update` que
  --      "só atualiza o preço" reescreveria o contrato de quem abriu o
  --      checkout na semana passada com o valor de hoje — a D-06 ao
  --      contrário, feita de passagem, sem ninguém decidir. O que a
  --      pessoa vê na segunda tentativa é o que ela viu na primeira, e é
  --      isso que a 2.3 devolve.
  -- ..........................................................
  insert into public.inscricoes (
    pessoa_id, safra_id, grupo_id, status,
    nivel_ingles, curso, periodo, disponibilidade,
    consent, consent_at, consent_text,
    valor_mensal_travado, duracao_meses_travada, data_primeira_cobranca_travada
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
    p_consent_text,
    p_valor_mensal_travado,
    p_duracao_meses_travada,
    p_data_primeira_cobranca_travada
  )
  on conflict do nothing
  -- ⚠️ AS TRÊS COLUNAS QUALIFICADAS COM `inscricoes.`, e não soltas. Elas
  -- têm o MESMO NOME das colunas de saída do `returns table`, que são
  -- identificadores dentro da função — a referência solta seria ambígua e
  -- levantaria 42702 em tempo de execução, no primeiro checkout de
  -- verdade. `id` não precisa: não há coluna de saída com esse nome.
  returning
    id,
    inscricoes.valor_mensal_travado,
    inscricoes.duracao_meses_travada,
    inscricoes.data_primeira_cobranca_travada
  into v_inscricao_id, v_valor, v_duracao, v_data;

  -- `criada` é decidido AQUI, e não no fim: com `do nothing`, um conflito
  -- não devolve linha e `v_inscricao_id` fica null. A releitura da 2.3
  -- preenche a variável de novo, e depois dela a pergunta "nasceu agora?"
  -- não teria mais resposta. A resposta vem do mesmo comando que escreveu
  -- — sem `select` extra e sem corrida.
  v_criada := v_inscricao_id is not null;

  -- ..........................................................
  -- 2.3 A INSCRIÇÃO QUE JÁ EXISTIA — a releitura que destrava o checkout
  --
  -- Só roda no caminho de duplicata, e é o coração do que muda nesta
  -- versão. Sem ela, quem ficou em `pendente_pagamento` e voltou não teria
  -- como pagar: a rota não saberia qual linha é a dela, e responder "você
  -- já está inscrita" a quem está tentando pagar é o beco sem saída que a
  -- D-15 descreve.
  --
  -- ⚠️ ESTE `select` NÃO É A CORRIDA QUE O §9.9 PROÍBE, e a distinção é
  -- exata. O que o §9.9 proíbe é DECIDIR com um `select` antes de
  -- escrever ("já existe? então não insira") — aí cabe outra requisição
  -- entre a leitura e a escrita, e duas submissões simultâneas passam
  -- pelas duas verificações antes de qualquer uma gravar. Aqui a decisão
  -- já foi tomada, e foi tomada pelo índice único, que é atômico com o
  -- insert. Este comando só LÊ DE VOLTA o que a barreira já decidiu.
  --
  -- ⚠️ O QUE ELE PODE DEVOLVER, E É HONESTO SOBRE ISSO: nada. `on conflict
  -- do nothing` também não insere quando o conflito é com uma linha de
  -- uma transação AINDA NÃO COMMITADA — o comando não espera, ele desiste.
  -- Nesse caso a linha da outra transação ainda não é visível para este
  -- `select`, e `v_inscricao_id` continua null. A função devolve
  -- `criada = false` com `inscricao_id` nulo, e quem trata é a rota: sem
  -- id não há sessão de checkout, e a resposta é a de duplicata. É raro
  -- (exige duas submissões da mesma pessoa no mesmo instante) e é
  -- recuperável (a pessoa tenta de novo e a segunda vez enxerga a linha).
  -- O que NÃO se pode fazer é fingir que o id existe.
  --
  -- `is not distinct from` e não `=`: `p_safra_id` pode ser null, e
  -- `safra_id = null` não casa com nada. É a mesma razão pela qual a `008`
  -- precisou de DUAS uniques parciais em vez de uma — em índice único,
  -- NULL não é igual a NULL.
  -- ..........................................................
  if not v_criada then
    select i.id,
           i.valor_mensal_travado,
           i.duracao_meses_travada,
           i.data_primeira_cobranca_travada
      into v_inscricao_id, v_valor, v_duracao, v_data
    from public.inscricoes i
    where i.pessoa_id = v_pessoa_id
      and i.safra_id is not distinct from p_safra_id;
  end if;

  -- ..........................................................
  -- 2.4 O contato, atualizado SE E SÓ SE a inscrição nasceu agora
  --
  -- `nome` e `telefone` são "o dado mais recente serve para falar com a
  -- pessoa" (`007`, comentário das colunas): quem volta para comprar com
  -- telefone novo fica com o telefone novo, e é o número de agora que o
  -- grupo de WhatsApp usa. O que muda em relação ao upsert ingênuo é
  -- QUANDO isso acontece — ver o ⚠️ da 2.1.
  --
  -- O `if` é a barreira inteira. Ele produz duas propriedades, e as duas
  -- valem mais do que a economia de uma linha:
  --
  --   INSCRIÇÃO NOVA, inclusive em SAFRA NOVA → o contato é atualizado.
  --     Quem estava na lista de espera e agora compra passa pelo `if`, e
  --     o telefone que ela acabou de digitar é o que fica.
  --
  --   DUPLICATA → a função NÃO ALTERA UM ÚNICO VALOR. Não é "no-op na
  --     inscrição": é no-op na transação toda. Quem enumera e-mails no
  --     formulário não edita nada, porque não há nada a editar sem uma
  --     inscrição nova para justificar a edição.
  --
  -- ⚠️ `v_criada` E NÃO `v_inscricao_id is not null`. Depois da 2.3 as
  -- duas expressões deixaram de significar a mesma coisa: na duplicata o
  -- id está preenchido de novo, e um `if` sobre ele devolveria a edição de
  -- contato exatamente para o caso que a 2.1 existe para fechar. É a
  -- armadilha que esta versão da função cria e que a `011b` não tinha.
  --
  -- ⚠️ Não converta isto num `update ... where id = v_pessoa_id and
  -- <alguma condição sobre os valores>`. A condição que autoriza a
  -- escrita não é "o telefone está diferente", é "esta pessoa acabou de
  -- se inscrever". Comparar valores devolveria a edição para quem só
  -- adivinhou o e-mail, e passaria a vazar mais uma coisa: o tempo de
  -- resposta diferiria conforme o telefone digitado bater ou não com o
  -- armazenado.
  --
  -- ⚠️ ISTO DEPENDE DE `pessoas.telefone` SER `not null`. Se a decisão
  -- pendente da `007` tornar a coluna NULLABLE, este `update` vira um
  -- caminho de PERDA DE DADO: uma inscrição nova sem telefone
  -- sobrescreveria com null um número que já se conhecia. Hoje o
  -- `not null` recusa a linha e o problema não existe; no dia em que ele
  -- sair, aqui precisa virar `coalesce(p_telefone, telefone)`. Escrever o
  -- `coalesce` agora seria código morto que ninguém consegue exercitar.
  -- ..........................................................
  if v_criada then
    update public.pessoas
      set nome     = p_nome,
          telefone = p_telefone
    where id = v_pessoa_id;
  end if;

  -- ⚠️ `return query select` com variáveis locais, e não atribuição
  -- direta às colunas de saída. As cinco colunas declaradas no `returns
  -- table` viram identificadores dentro da função, e três delas têm o
  -- MESMO NOME de colunas de `inscricoes` — `valor_mensal_travado` e as
  -- outras duas. Toda referência não qualificada a esses nomes num
  -- comando SQL daqui de dentro seria ambígua (erro 42702, em tempo de
  -- execução, no primeiro checkout de verdade). Manter tudo em `v_*` e
  -- projetar uma vez só no fim é o que torna a ambiguidade impossível em
  -- vez de evitada com cuidado.
  return query select v_inscricao_id, v_criada, v_valor, v_duracao, v_data;
end;
$$;

-- ------------------------------------------------------------
-- 3. Documentação
-- ------------------------------------------------------------
comment on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, uuid
) is
  'Cria pessoa + inscricao NUMA TRANSACAO SO, com os tres valores '
  'TRAVADOS da D-06 dentro do mesmo insert. Existe porque o consentimento '
  'mora em inscricoes: um insert de pessoas que passa seguido de um '
  'insert de inscricoes que falha deixaria dado pessoal gravado sem '
  'NENHUM registro de consentimento, e sob LGPD isso e o requisito '
  'probatorio quebrado, nao uma linha orfa. Duas requisicoes do PostgREST '
  'sao duas transacoes; a transacao so pode existir aqui. '
  'DEVOLVE o id da inscricao alem do booleano `criada`, e o id e o que '
  'permite a Checkout Session existir (client_reference_id) e uma segunda '
  'tentativa RETOMAR uma inscricao presa em pendente_pagamento em vez de '
  'receber "voce ja esta inscrita" e ficar sem saida (D-15). '
  'Devolve tambem os tres travados DA LINHA QUE EXISTE: na duplicata eles '
  'sao os da PRIMEIRA vez, porque on conflict do nothing nao sobrescreve '
  'contrato — a sessao cobra o que a inscricao diz, nao o que o chamador '
  'supunha. '
  'RESOLVE a pessoa por lower(email) — o upsert e um toque no-op que so '
  'devolve o id, e NAO sobrescreve contato: o formulario e publico e sem '
  'autenticacao, e um do update ali deixaria qualquer um trocar o nome e '
  'o telefone de um contato conhecido so digitando o e-mail. '
  'Nome e telefone so sao atualizados SE a inscricao nasceu agora. '
  'status e DERIVADO de safra_id (null -> lista_espera, senao '
  'pendente_pagamento), respeitando o CHECK da 009; nao existe aprovada '
  'nem rejeitada (D-02). Combinacao invalida de travados e recusada pelos '
  'CHECKs da 015, nao por validacao repetida aqui dentro (REPORT 9.9). '
  'SOBRECARGA: a versao de 10 argumentos (011b, returns boolean) continua '
  'existindo ate a 018 porque o build em producao a chama entre a '
  'migracao e o deploy. Os tres parametros travados NAO tem default de '
  'proposito — e isso que impede a chamada antiga de cair aqui.';

-- ------------------------------------------------------------
-- 4. Fechadura
--
-- ⚠️ O Postgres concede `execute` a `PUBLIC` em TODA função nova, por
-- padrão. No Supabase isso significa que a função nasce publicada no
-- PostgREST e chamável por `anon` — quer dizer, por qualquer pessoa com a
-- chave que está no bundle do navegador.
--
-- O `revoke` abaixo não é zelo: sem ele, esta função é um endpoint
-- público de escrita em duas tabelas de dado pessoal. `security invoker`
-- impediria a escrita mesmo assim (a `007` e a `008` revogam tudo de anon
-- e authenticated), mas as duas trancas existem porque uma delas vai ser
-- aberta por engano algum dia.
--
-- `service_role` é o único chamador, e ele vem de módulo `server-only`,
-- sem `NEXT_PUBLIC_` em lugar nenhum (§9.5).
--
-- ⚠️ A assinatura completa é obrigatória: `revoke` e `grant` operam sobre
-- uma SOBRECARGA específica, não sobre o nome. E é por isso que este
-- bloco não afeta a função de dez argumentos — que continua com a própria
-- fechadura, posta pela `011b`.
-- ------------------------------------------------------------
revoke execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, uuid
) from public, anon, authenticated;

grant execute on function public.criar_inscricao(
  text, text, text, text, text, text, text[], timestamptz, text,
  numeric, int, date, uuid
) to service_role;

commit;

-- ⚠️ O PostgREST guarda o schema em cache e não enxerga função nova até
-- recarregar. O Supabase tem um event trigger de DDL que dispara isso
-- sozinho; este `notify` é o cinto de segurança para quando ele não
-- dispara — sintoma: "Could not find the function public.criar_inscricao
-- with parameters ..." logo depois de a migração ter rodado com sucesso.
-- Fora da transação de propósito: `notify` só é entregue no commit.
notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. ⚠️ AS DUAS SOBRECARGAS EXISTEM?
--    Esperado: DUAS linhas. A de 10 argumentos devolvendo `boolean` e a
--    de 13 devolvendo `TABLE(...)`. As duas com prosecdef = false
--    (security INVOKER) e proconfig contendo search_path=.
--    Se vier só uma, ou o arquivo não rodou, ou alguém dropou a antiga
--    antes do deploy — e nesse caso o formulário está fora do ar AGORA.
select
  p.proname                                 as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_function_result(p.oid)             as devolve,
  p.prosecdef                               as security_definer,
  p.proconfig                               as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
order by p.pronargs;

-- 2. ⚠️ QUEM PODE EXECUTAR?
--    Esperado: service_role, e SÓ ele, nas DUAS. Se `anon` ou `PUBLIC`
--    aparecer, o formulário virou escrita direta em duas tabelas de dado
--    pessoal.
select
  p.proname,
  p.pronargs,
  coalesce(p.proacl::text, 'NULO = PUBLIC PODE EXECUTAR — ERRADO') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
order by p.pronargs;

-- 3. Nenhum dos três parâmetros travados tem default?
--    Esperado: 1 (só `p_safra_id`). Se vier mais que 1, a chamada antiga
--    de dez argumentos passa a casar com esta função e o build em
--    produção recebe um objeto onde espera um booleano.
select pronargdefaults as parametros_com_default
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_inscricao'
  and p.pronargs = 13;

-- 4. Os três índices de que ela depende continuam de pé, e parciais?
--    Esperado: três linhas. As duas de `inscricoes` com WHERE na
--    definição. Se uma sumir, a duplicata deixa de ser barrada e a função
--    devolve `criada` todas as vezes, SEM ERRO.
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

-- 5. NENHUMA linha ganhou valor travado por causa desta migração?
--    Esperado: 0 antes do primeiro checkout de verdade. Esta migração não
--    escreve dado — se vier diferente de zero antes de o checkout estar
--    no ar, alguém rodou um UPDATE que não está neste arquivo.
select count(*) as linhas_com_travado
from public.inscricoes
where valor_mensal_travado is not null;

-- ============================================================
-- TESTES DE BARREIRA — o que a função tem que fazer, e o que ela tem que
-- RECUSAR.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS e escritas de teste, não
-- regra. Ver a nota do `c16` em docs/04-PLANO.md sobre teste que lê .sql
-- como texto — um varredor ingênuo lê o bloco abaixo como se fosse parte
-- da migração.
--
-- ⚠️ NÃO RODE ESTES EM PRODUÇÃO. Eles gravam pessoa e inscrição de
-- verdade, e `pessoas` não tem delete em cascata (FK `restrict`, `008`):
-- limpar exige apagar a inscrição primeiro. Staging.
--
-- ⚠️ Argumentos NOMEADOS, e não posicionais: com duas sobrecarregas
-- vivas, uma chamada posicional de dez argumentos casa com a versão
-- antiga sem avisar, e o teste passaria testando a função errada.
-- ============================================================

-- A. Lista de espera: sem safra, sem travados → uma linha,
--    `criada = true`, `inscricao_id` preenchido, travados nulos.
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Barreira 016', p_email => 'barreira016@exemplo.invalid',
--   p_telefone => '+5521999999999', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg','qua'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => null, p_duracao_meses_travada => null,
--   p_data_primeira_cobranca_travada => null
-- );

-- B. A MESMA chamada de novo → `criada = FALSE` e o MESMO
--    `inscricao_id` da chamada A. É a propriedade nova: a duplicata agora
--    devolve a linha que existe, e é ela que destrava o pagamento.
--    Se `inscricao_id` vier nulo, a releitura da 2.3 não está rodando.

-- C. ⚠️ DUPLICATA NÃO EDITA NADA. Mesmo e-mail em CAIXA DIFERENTE, com
--    nome e telefone diferentes: é a forma exata do ataque (adivinhar o
--    e-mail para trocar o contato alheio).
--    Esperado: `criada = false`, UMA pessoa só, e a linha INTEIRA intacta.
--    Se o nome virar 'Invasor' ou o telefone virar ...998, o `if` da 2.4
--    está lendo `v_inscricao_id` em vez de `v_criada`.
-- select * from public.criar_inscricao(
--   p_nome => 'Invasor', p_email => 'BARREIRA016@exemplo.invalid',
--   p_telefone => '+5521999999998', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg','qua'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => null, p_duracao_meses_travada => null,
--   p_data_primeira_cobranca_travada => null
-- );
-- select nome, email, telefone from public.pessoas
-- where lower(email) = 'barreira016@exemplo.invalid';

-- D. ⚠️ A TRANSAÇÃO É UMA SÓ — o teste que justifica o arquivo inteiro.
--    Consentimento incompleto: o CHECK da `010` recusa a inscrição, e a
--    PESSOA NÃO PODE FICAR GRAVADA. Esperado: erro, e ZERO linhas na
--    consulta seguinte.
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Orfao 016', p_email => 'orfao016@exemplo.invalid',
--   p_telefone => '+5521999999997', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg','qua'],
--   p_consent_at => null, p_consent_text => null,
--   p_valor_mensal_travado => null, p_duracao_meses_travada => null,
--   p_data_primeira_cobranca_travada => null
-- );
-- select count(*) as deve_ser_zero from public.pessoas
-- where lower(email) = 'orfao016@exemplo.invalid';

-- E. ⚠️ TRAVADO EM LISTA DE ESPERA → erro em
--    `inscricoes_espera_sem_travado_check`, e ZERO pessoa gravada. É o
--    teste de que a função NÃO valida por conta própria e deixa o CHECK
--    decidir — se passar, alguém pôs um `raise` na 2.2 ou, pior, um
--    `case` que zera os travados quando a safra é nula.
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Travado Solto', p_email => 'travado016@exemplo.invalid',
--   p_telefone => '+5521999999996', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => 299.99, p_duracao_meses_travada => 6,
--   p_data_primeira_cobranca_travada => '2026-09-01'
-- );

-- F. ⚠️ CONTRATO PELA METADE → erro em
--    `inscricoes_travados_tudo_ou_nada_check`. Valor sem duração: dá para
--    dizer quanto custa o mês e não por quantos meses, e a conta de
--    `cancel_at` (D-05) fica impossível de refazer.
--    Troque <SAFRA> por um id real.
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Meio Contrato', p_email => 'meio016@exemplo.invalid',
--   p_telefone => '+5521999999995', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => 299.99, p_duracao_meses_travada => null,
--   p_data_primeira_cobranca_travada => null,
--   p_safra_id => '<SAFRA>'
-- );

-- G. ⚠️ O CONTRATO DA PRIMEIRA VEZ SOBREVIVE À SEGUNDA TENTATIVA — o
--    teste da D-06 no caminho que esta versão criou.
--    Inscreva numa safra com 299.99 e repita a MESMA chamada com 349.99.
--    Esperado na segunda: `criada = false` e `valor_mensal_travado`
--    voltando **299.99**. Se voltar 349.99, o `on conflict do nothing`
--    virou `do update` e a sessão de checkout passaria a cobrar um valor
--    que a inscrição não registra.
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Contrato', p_email => 'contrato016@exemplo.invalid',
--   p_telefone => '+5521999999994', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => 299.99, p_duracao_meses_travada => 6,
--   p_data_primeira_cobranca_travada => '2026-09-01',
--   p_safra_id => '<SAFRA>'
-- );  -- esperado: criada = true, valor 299.99
-- select * from public.criar_inscricao(
--   p_nome => 'Teste Contrato', p_email => 'contrato016@exemplo.invalid',
--   p_telefone => '+5521999999994', p_nivel_ingles => 'basico',
--   p_curso => 'Fonoaudiologia', p_periodo => '3',
--   p_disponibilidade => array['seg'],
--   p_consent_at => now(), p_consent_text => 'texto de consentimento do teste',
--   p_valor_mensal_travado => 349.99, p_duracao_meses_travada => 6,
--   p_data_primeira_cobranca_travada => '2026-09-01',
--   p_safra_id => '<SAFRA>'
-- );  -- esperado: criada = FALSE, valor 299.99 — o da PRIMEIRA vez

-- H. A sobrecarga antiga continua respondendo — o teste de que o
--    formulário em produção não caiu. Dez argumentos, `returns boolean`.
-- select public.criar_inscricao(
--   'Teste Sobrecarga', 'sobrecarga016@exemplo.invalid', '+5521999999993',
--   'basico', 'Fonoaudiologia', '3', array['seg'],
--   now(), 'texto de consentimento do teste'
-- );  -- esperado: um BOOLEANO, não uma linha
