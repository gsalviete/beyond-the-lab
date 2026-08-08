-- ============================================================
-- Beyond The Lab — `token_acesso` e `token_expira_em` em `pessoas`
--
-- ⛔ Rode depois da `016`.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO MOVE UM ÚNICO DADO. Ela acrescenta duas colunas
--    nulas, um índice único parcial e um CHECK `NOT VALID`. Toda linha
--    existente continua exatamente como está — inclusive as pessoas
--    herdadas da `010`, que é justamente quem vai receber o primeiro
--    token.
--
-- ============================================================
-- UM MECANISMO, DOIS USOS — D-10 E D-15
-- ============================================================
--
-- D-10 · **Dois caminhos de entrada, não um.** A Giovanna vai postar o
-- link no Instagram; se o fluxo dependesse de token, o Instagram
-- quebraria. Então o link limpo continua abrindo o formulário do zero, e
-- o token existe só para o e-mail dirigido à base atual: ele IDENTIFICA
-- a pessoa e pré-preenche a modal, para que quem já se cadastrou não
-- digite tudo de novo.
--
-- D-15 · **Pagamento pendente é uma fila que a Giovanna trabalha à mão.**
-- Quem está em `pendente_pagamento` não tem como sair sozinha: não sabe
-- que está pendente, e refazer o formulário devolve "você já está
-- inscrita". A Giovanna dispara um e-mail, e esse e-mail leva um link
-- que abre o pagamento DAQUELA inscrição.
--
-- ⚠️⚠️ E É AQUI QUE ESTÁ A PARTE QUE PARECE DETALHE E É A DECISÃO: O
-- LINK NÃO CARREGA O `inscricao_id` CRU.
--
-- A ideia original era mandar o id da inscrição na URL. Ele não serve:
-- uma URL é copiada, encaminhada, indexada e fica em histórico de
-- navegador para sempre. Um id que abre checkout é, na prática, uma
-- credencial — e uma credencial SEM EXPIRAÇÃO, exatamente o que a D-10
-- proíbe ("token em URL postada publicamente; token sem expiração").
--
-- O token destas colunas expira, identifica a pessoa e **não autoriza**:
-- chegando por ele, o servidor procura a inscrição pendente daquela
-- pessoa e abre a sessão. Um mecanismo, dois usos; nenhuma credencial
-- eterna em e-mail.
--
-- ============================================================
-- ⚠️ O TOKEN É GUARDADO EM CLARO, E O CUSTO DISSO ESTÁ ESCRITO AQUI
-- ============================================================
--
-- A alternativa — guardar `sha256(token)` e comparar o hash do que chega
-- — é estritamente melhor sob a hipótese de alguém conseguir LER esta
-- tabela sem poder ESCREVER nela. Ela não foi adotada porque a D-15 nomeia
-- `pessoas.token_acesso` como o mecanismo, e trocar o significado da
-- coluna por baixo seria decidir numa migração uma coisa que se decide
-- numa conversa.
--
-- O que isso custa, dito por extenso: quem lê `pessoas` consegue abrir o
-- checkout de qualquer pessoa cujo token ainda não expirou. Hoje isso não
-- amplia superfície nenhuma — a tabela tem RLS ligada, zero policies, e o
-- único papel que a lê é a `service_role`, que já enxerga nome, e-mail e
-- telefone de todo mundo. Ou seja: quem tem acesso de leitura aqui já tem
-- o dado pessoal inteiro; o token não é a peça mais valiosa da linha.
--
-- ⚠️ O DIA EM QUE ISSO DEIXA DE VALER: se o token passar a autorizar
-- QUALQUER COISA além de identificar e pré-preencher — cancelar, ver
-- ficha, mudar horário —, a conta muda e a coluna vira hash. O caminho
-- é: gerar continua igual, o script exporta o valor cru para o CSV, o
-- banco guarda só o digest, e a busca passa a ser pelo digest do que
-- chegou. Nada disso exige mudar a forma do link.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. As duas colunas
--
-- Ambas NULLABLE, e o nulo significa **esta pessoa nunca recebeu
-- convite** — o estado de toda a base hoje.
--
-- ⚠️ `add column ... if not exists` sem DEFAULT é operação de CATÁLOGO no
-- Postgres moderno: não reescreve a tabela, não trava escrita, não tem
-- downtime. É por isso que este arquivo pode rodar com o formulário no ar
-- — que é requisito, não conveniência (há gente real na lista de espera).
--
-- ⚠️ NENHUM DEFAULT, E EM ESPECIAL NENHUM `default gen_random_uuid()`.
-- Um default geraria token para TODA linha nova, inclusive para quem se
-- inscreve pelo formulário público e nunca vai receber convite nenhum —
-- credenciais criadas em massa, todas válidas, nenhuma pedida por
-- ninguém. Token nasce de um ATO da Giovanna (o `c54`), e é isso que
-- torna a lista de tokens vivos uma lista curta e explicável.
--
-- `text` e não `uuid`: o valor vem do gerador do script, que usa bytes
-- aleatórios em base64url. Não é um identificador de linha, é um segredo
-- — e o formato dele pode mudar sem migração.
-- ------------------------------------------------------------
alter table public.pessoas
  add column if not exists token_acesso     text,
  add column if not exists token_expira_em  timestamptz;

-- ------------------------------------------------------------
-- 2. O índice único — PARCIAL, e a parcialidade é obrigatória
--
-- ⚠️ Um unique NÃO-parcial em `token_acesso` funcionaria hoje e é a
-- armadilha: em índice único do Postgres, NULL não é igual a NULL, então
-- as milhares de linhas sem token passariam. O problema não é
-- corretude — é que o índice indexaria a base inteira para proteger um
-- punhado de linhas, e cresceria com a lista de espera para sempre.
--
-- Mas a razão principal é outra e é de significado: `where token_acesso
-- is not null` declara no próprio objeto que **token é exceção, não
-- atributo**. Quem ler o schema daqui a um ano vê que a coluna é
-- esparsa sem precisar de comentário.
--
-- ⚠️ A UNICIDADE É O QUE IMPEDE UMA COLISÃO DE VIRAR TROCA DE IDENTIDADE.
-- Dois tokens iguais em duas pessoas fariam o link de uma abrir a
-- inscrição da outra — e como o token pré-preenche o formulário, a
-- segunda pessoa veria nome e telefone da primeira. A chance de colisão
-- com bytes aleatórios é desprezível; a consequência dela não é, e o
-- índice custa nada.
--
-- Guarda por `to_regclass('public.nome')`, e NÃO por `conname` solto:
-- nomes de constraint são únicos POR TABELA, não por banco. Mesma
-- pegadinha que a `009` documenta.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.pessoas_token_acesso_idx') is null then
    create unique index pessoas_token_acesso_idx
      on public.pessoas (token_acesso)
      where token_acesso is not null;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. O CHECK — `NOT VALID`, como todo CHECK novo deste projeto
--
-- ⚠️ `NOT VALID` dispensa a varredura das linhas que JÁ ESTÃO na tabela
-- no instante do `ALTER`, e NÃO dispensa nada de um `INSERT` ou `UPDATE`
-- futuro. É a lição da `004`: obrigar em toda escrita nova sem reescrever
-- nem falsificar o passado.
--
-- Aqui é indolor — as linhas existentes têm as duas colunas nulas e
-- passariam de qualquer forma —, mas a regra vale sem exceção. Uma
-- exceção "porque neste caso não fazia diferença" é como uma regra deixa
-- de ser seguida.
--
-- TUDO-OU-NADA, e é o mesmo formato do CHECK de consentimento e do de
-- valores travados. As duas metades do estrago, se separadas:
--
--   TOKEN SEM EXPIRAÇÃO é precisamente o que a D-10 proíbe. Um link
--     eterno em e-mail, que continua abrindo o checkout de alguém dois
--     anos depois, encaminhado para sabe-se lá quem.
--
--   EXPIRAÇÃO SEM TOKEN é inofensiva e mentirosa: uma data que promete
--     governar um acesso que não existe. Ela apareceria no painel como se
--     houvesse convite pendente.
--
-- ⚠️ O CHECK NÃO DIZ NADA SOBRE A DATA ESTAR NO FUTURO, e a ausência é
-- decisão. Um `token_expira_em > now()` seria um CHECK que muda de
-- resultado com o relógio: a linha nasce válida e vira inválida sozinha,
-- e qualquer `UPDATE` posterior naquela pessoa — trocar o telefone, por
-- exemplo — passaria a ser recusado por causa de um token vencido que não
-- tem nada a ver com a edição. Constraint não pode depender do tempo.
-- Quem recusa token vencido é a rota, na leitura (`c52`).
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pessoas'::regclass
      and conname = 'pessoas_token_tudo_ou_nada_check'
  ) then
    alter table public.pessoas
      add constraint pessoas_token_tudo_ou_nada_check
      check (
        (token_acesso is null and token_expira_em is null)
        or
        (token_acesso is not null and token_expira_em is not null)
      )
      not valid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Documentação
-- ------------------------------------------------------------
comment on column public.pessoas.token_acesso is
  'Segredo de uso único-por-pessoa que IDENTIFICA e NÃO AUTORIZA (D-10). '
  'NULL = esta pessoa nunca recebeu convite, que é o estado de toda a '
  'base hoje. Dois usos, um mecanismo: pré-preencher a modal para quem '
  'veio do e-mail dirigido à base atual (D-10) e abrir o pagamento de uma '
  'inscrição presa em pendente_pagamento (D-15). ⚠️ O LINK NUNCA CARREGA '
  'inscricao_id CRU: uma URL é copiada, encaminhada e indexada, e um id '
  'que abre checkout é credencial sem expiração. Chegando pelo token, o '
  'servidor procura a inscrição pendente DAQUELA pessoa. Guardado em '
  'claro; o parágrafo da migração 017 explica o custo e qual é o dia em '
  'que a coluna precisa virar hash.';

comment on column public.pessoas.token_expira_em is
  'Quando o token deixa de valer (D-10: token sem expiração é proibido). '
  'Anda junto de token_acesso — tudo-ou-nada, pessoas_token_tudo_ou_nada_check. '
  '⚠️ Quem compara com o relógio é a ROTA, não um CHECK: constraint que '
  'depende do tempo faria a linha nascer válida e virar inválida sozinha, '
  'e um UPDATE de telefone seria recusado por causa de um token vencido '
  'sem relação nenhuma com a edição. Token vencido cai no fluxo limpo — o '
  'formulário do zero —, nunca numa tela de erro.';

commit;

-- ============================================================
-- VERIFICAÇÃO — rode separado, depois do commit. Não altera nada.
-- ============================================================

-- 1. As duas colunas existem, nullable, sem default?
--    Esperado: duas linhas, is_nullable = YES, column_default nulo.
--    ⚠️ Um default aqui geraria credencial para toda inscrição nova.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'pessoas'
  and column_name in ('token_acesso', 'token_expira_em')
order by column_name;

-- 2. O índice é único E parcial?
--    Esperado: uma linha, com `UNIQUE` e `WHERE (token_acesso IS NOT NULL)`
--    na definição. Sem o WHERE, o índice cobre a base inteira para
--    proteger um punhado de linhas.
select i.relname as indice, x.indisunique, pg_get_indexdef(x.indexrelid) as definicao
from pg_index x
join pg_class i on i.oid = x.indexrelid
where x.indrelid = 'public.pessoas'::regclass
  and i.relname = 'pessoas_token_acesso_idx';

-- 3. O CHECK existe e está NOT VALID?
--    Esperado: uma linha, convalidated = false.
select conname, convalidated, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.pessoas'::regclass
  and conname = 'pessoas_token_tudo_ou_nada_check';

-- 4. NENHUMA pessoa ganhou token por causa desta migração?
--    Esperado: 0. Esta migração não escreve dado — token nasce de um ato
--    da Giovanna (o script do `c54`), nunca de um default.
select count(*) as pessoas_com_token
from public.pessoas
where token_acesso is not null;

-- ============================================================
-- TESTES DE BARREIRA — o banco tem que RECUSAR os dois.
--
-- ⚠️ Comentados de propósito: são CONTRAEXEMPLOS, não regra.
-- Troque <PESSOA> por um id real. Staging.
-- ============================================================

-- A. Token sem expiração → erro em `pessoas_token_tudo_ou_nada_check`.
--    É o link eterno que a D-10 proíbe.
-- update public.pessoas set token_acesso = 'abc' where id = '<PESSOA>';

-- B. Expiração sem token → mesmo erro. Uma data que promete governar um
--    acesso que não existe, e que apareceria no painel como convite
--    pendente.
-- update public.pessoas set token_expira_em = now() + interval '30 days'
-- where id = '<PESSOA>';

-- C. Dois tokens iguais em duas pessoas → erro em
--    `pessoas_token_acesso_idx`. Se passar, o link de uma abre a inscrição
--    da outra — e como o token pré-preenche o formulário, a segunda vê
--    nome e telefone da primeira.
-- update public.pessoas set token_acesso = 'colisao',
--        token_expira_em = now() + interval '30 days'
-- where id in ('<PESSOA_1>', '<PESSOA_2>');
