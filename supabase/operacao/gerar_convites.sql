-- ============================================================
-- Beyond The Lab — gera os convites da base atual (D-10, D-15, `c54`)
--
-- ⛔ Rode depois da `017`. Ele depende de `pessoas.token_acesso` e
--    `pessoas.token_expira_em`.
--
-- ⚠️ ESTE ARQUIVO NÃO É UMA MIGRAÇÃO, e por isso não mora em
--    `supabase/migrations/`. Ele não muda schema: ele ESCREVE DADO, e
--    escreve dado de gente real. Numerá-lo junto das migrações faria
--    parecer que existe uma ordem em que "já rodou" — e este aqui roda
--    quantas vezes a Giovanna precisar, sempre que houver gente nova para
--    convidar.
--
-- ============================================================
-- POR QUE ISTO É UM `.sql` E NÃO UM SCRIPT NODE
-- ============================================================
--
-- O `04-PLANO.md` previa `c54 script(ops): gera tokens e exporta CSV`. Um
-- script Node faria a mesma coisa e traria três custos que este arquivo
-- não tem:
--
--   1. SEGUNDA CÓPIA DA `service_role`. `src/lib/supabase.ts` é o único
--      lugar do projeto que conhece a chave, e ele é `server-only` — um
--      script Node não consegue importá-lo (o pacote `server-only` lança
--      fora de um Server Component), então ele teria que criar o próprio
--      cliente. A proteção do REPORT §9.5 só vale enquanto o número de
--      lugares que conhecem a chave é UM.
--
--   2. UMA FERRAMENTA A MAIS PARA A GIOVANNA. Pela D-07 ela não abre o
--      Dashboard do Stripe nem o Studio para operar — mas o SQL Editor
--      é onde ela já roda tudo deste projeto, e o resultado sai de lá com
--      um botão de "download CSV". Um script exigiria terminal, Node e
--      variáveis de ambiente.
--
--   3. UM CAMINHO DE ESCRITA QUE NINGUÉM REVISA. O `.sql` é lido antes de
--      ser colado. Um script é executado.
--
-- O que se perde: nada que este arquivo não devolva. A última consulta
-- imprime nome, e-mail e o LINK PRONTO, que é exatamente o CSV que o
-- disparo manual consome.
--
-- ============================================================
-- ⚠️⚠️ ANTES DE RODAR, LEIA AS DUAS LINHAS ABAIXO
-- ============================================================
--
-- 1. TROQUE A `base_url` DA SEÇÃO 1 pelo domínio de verdade. Com o valor
--    errado, os links saem apontando para lugar nenhum e o convite inteiro
--    vira um e-mail com um link quebrado — para a base mais interessada
--    que o produto tem.
--
-- 2. ⚠️ ESTE ARQUIVO NÃO MANDA E-MAIL, E NÃO DEVE MANDAR. Ele produz a
--    lista. O disparo é manual e revisado, de propósito: um mecanismo que
--    manda e-mail sozinho para a base inteira é a coisa mais fácil de
--    errar aqui, e o erro não tem desfazer.
--
-- Rode no SQL Editor do Supabase. Pode rodar de novo — ver a seção 2.
-- ============================================================

-- ------------------------------------------------------------
-- 0. O QUE VAI ACONTECER — rode SOZINHO primeiro, e confira o número
--
-- Nenhuma escrita nesta seção. Ela responde "quantas pessoas vão receber
-- convite novo" antes de qualquer coisa ser escrita.
--
-- ⚠️ Se o número vier maior do que você espera, PARE. É o sinal de que o
-- filtro da seção 2 está pegando gente demais — e a diferença entre 40 e
-- 400 convites é a diferença entre um e-mail dirigido e um disparo em
-- massa para pessoas que não pediram nada.
-- ------------------------------------------------------------
select
  count(*) filter (where p.token_acesso is null)                              as sem_token_nenhum,
  count(*) filter (where p.token_expira_em is not null
                     and p.token_expira_em <= now())                          as com_token_vencido,
  count(*) filter (where p.token_expira_em is not null
                     and p.token_expira_em > now())                           as com_token_valido,
  count(*)                                                                    as total_elegivel
from public.pessoas p
where exists (
  select 1 from public.inscricoes i
  where i.pessoa_id = p.id
    and i.status = 'lista_espera'
);

-- ============================================================
-- A PARTIR DAQUI ESCREVE. Rode o bloco inteiro de uma vez.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Os parâmetros desta rodada
--
-- ⚠️ `base_url` É O ÚNICO VALOR QUE VOCÊ PRECISA TROCAR, e ele está aqui
-- em cima de propósito: espalhado pela query, alguém mudaria um e
-- esqueceria o outro, e metade dos convites apontaria para o domínio
-- errado.
--
-- ⚠️ `validade` = 30 DIAS, decidido em 08/08/2026 pelo dono do
-- repositório. É folga para quem só abre e-mail no fim de semana, sem
-- virar link eterno — que é o que a D-10 proíbe. Encurtar aumenta o
-- reenvio manual; alongar aumenta a janela em que um link encaminhado
-- continua abrindo o formulário com o contato de outra pessoa dentro.
--
-- ⚠️ O PARÂMETRO DA URL É `convite`, E NÃO `token`. A URL fica visível na
-- barra de endereço e vai para o histórico, e "token" anuncia credencial
-- para quem passar o olho. O nome tem que bater com o `PARAM_CONVITE` de
-- `src/components/InscricaoModal.jsx` — se um dos dois mudar, o link para
-- de pré-preencher e ninguém recebe erro nenhum: a pessoa só vê o
-- formulário vazio.
-- ------------------------------------------------------------
create temporary table parametros_convite on commit drop as
select
  'https://beyondthelab.com.br'::text as base_url,   -- ⛔ CONFIRA ISTO
  interval '30 days'                  as validade;

-- ------------------------------------------------------------
-- 2. Os tokens
--
-- ⚠️ QUEM RECEBE: pessoas com inscrição em `lista_espera`. É o conjunto
-- que a `010` migrou — a base que se cadastrou quando não havia nada para
-- comprar, algumas esperando há meses. É também o critério provisório da
-- D-16 enquanto a "data de corte da primeira semana" não for decidida:
-- um conjunto FECHADO e CONHECIDO, porque a `010` recusa rodar duas
-- vezes.
--
-- ⚠️⚠️ TOKEN AINDA VÁLIDO NÃO É SOBRESCRITO, e esta é a linha mais
-- importante do arquivo.
--
-- Regenerar o token de quem já recebeu o convite INVALIDA o link que está
-- na caixa de entrada dela. Ela clica, cai no fluxo limpo, e preenche o
-- formulário inteiro de novo — exatamente o que o convite existe para
-- evitar. E como o e-mail já foi disparado, não há como avisar: o link
-- morto continua lá.
--
-- Por isso o `where`: só ganha token quem não tem nenhum, ou quem tem um
-- VENCIDO. Rodar este arquivo duas vezes seguidas escreve zero linhas na
-- segunda — e é isso que o torna seguro de repetir quando a Giovanna
-- quiser convidar quem entrou depois.
--
-- ⚠️ O TOKEN NASCE NO BANCO, com `gen_random_bytes(32)`, e não em código
-- nosso. São 32 bytes de aleatoriedade criptográfica — 2^256 — e é a
-- ENTROPIA que defende esta URL, não um rate limit. `GET /api/pessoa/:token`
-- documenta por que não há rate limit lá, e a premissa daquele parágrafo é
-- esta linha aqui: se o token um dia encolher ou virar previsível, a
-- análise morre junto.
--
-- base64url e não base64 cru: `+` e `/` viram `%2B` e `%2F` numa URL, e o
-- `=` do padding vira `%3D`. Um token que muda de forma ao ser colado num
-- e-mail é um token que não casa com nada quando volta.
-- ------------------------------------------------------------
update public.pessoas p
set
  token_acesso = rtrim(
    translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'),
    '='
  ),
  token_expira_em = now() + (select validade from parametros_convite)
where exists (
  select 1 from public.inscricoes i
  where i.pessoa_id = p.id
    and i.status = 'lista_espera'
)
  and (p.token_acesso is null or p.token_expira_em <= now());

commit;

-- ============================================================
-- 3. O CSV — o resultado desta consulta é o que vai para o disparo
--
-- Exporte pelo botão de download do SQL Editor.
--
-- ⚠️ ESTE ARQUIVO SAI COM DADO PESSOAL E COM CREDENCIAL DENTRO. Cada
-- linha carrega nome, e-mail e um link que abre o formulário com o
-- contato daquela pessoa preenchido. Ele não vai para o repositório, não
-- vai para o Drive compartilhado e não fica no Downloads depois do
-- disparo. Tratar como a planilha de senhas que ele é.
--
-- ⚠️ SÓ QUEM TEM TOKEN VÁLIDO APARECE. Quem já tinha um link vivo entra
-- aqui de novo COM O MESMO LINK — de propósito: se o disparo anterior
-- falhou para alguém, reenviar tem que mandar o link que já está na caixa
-- de entrada dela, e não um novo.
-- ============================================================
select
  p.nome,
  p.email,
  (select base_url from parametros_convite) || '/?convite=' || p.token_acesso as link,
  p.token_expira_em
from public.pessoas p
where exists (
  select 1 from public.inscricoes i
  where i.pessoa_id = p.id
    and i.status = 'lista_espera'
)
  and p.token_acesso is not null
  and p.token_expira_em > now()
order by p.nome;

-- ============================================================
-- VERIFICAÇÃO — rode depois. Não altera nada.
-- ============================================================

-- 1. Nenhum token repetido?
--    Esperado: nenhuma linha. O índice único parcial da `017` já impede,
--    e esta consulta é a prova de que ele está de pé — dois tokens iguais
--    fariam o link de uma pessoa abrir o formulário com o contato de
--    outra dentro.
select token_acesso, count(*)
from public.pessoas
where token_acesso is not null
group by token_acesso
having count(*) > 1;

-- 2. Nenhum token sem validade?
--    Esperado: 0. É o link eterno que a D-10 proíbe, e o CHECK
--    `pessoas_token_tudo_ou_nada_check` da `017` recusa — se vier
--    diferente de zero, alguém contornou o CHECK.
select count(*) as tokens_sem_validade
from public.pessoas
where token_acesso is not null and token_expira_em is null;

-- 3. Ninguém FORA da lista de espera ganhou token?
--    Esperado: 0. Token nasce de um ato deliberado; se alguém que se
--    inscreveu pelo formulário público aparecer aqui, o `where` da seção
--    2 pegou gente demais.
select count(*) as tokens_fora_da_lista_de_espera
from public.pessoas p
where p.token_acesso is not null
  and not exists (
    select 1 from public.inscricoes i
    where i.pessoa_id = p.id and i.status = 'lista_espera'
  );

-- 4. O formato do token é o esperado?
--    Esperado: 0 linhas. base64url de 32 bytes tem 43 caracteres e nenhum
--    `+`, `/` ou `=`. Qualquer um desses três quebra o token ao passar
--    por uma URL.
select id, length(token_acesso) as tamanho
from public.pessoas
where token_acesso is not null
  and (length(token_acesso) <> 43 or token_acesso ~ '[+/=]');
