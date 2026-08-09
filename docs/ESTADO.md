# ESTADO — fonte única operativa

**Escrito em 08/08/2026. Atualizado em 09/08/2026, no fim da sessão do
corte 2.** Este arquivo diz o que é verdade *agora* e o que falta fazer.
Ele existe porque os documentos do pacote original descrevem
majoritariamente o corte 1 — que já está em produção — e porque dois deles se
contradizem em pontos que a implementação atravessa.

## Ordem de leitura para uma sessão nova

| Ler | Por quê |
|---|---|
| `CLAUDE.md` | as regras que não mudam: git, banco, comentários |
| **`docs/ESTADO.md`** (este) | estado real + o que falta |
| `docs/00-DECISOES.md` | **operativo e intacto.** D-01…D-16 |
| o código | onde o conhecimento realmente mora |

O prompt de entrada para uma sessão nova está em **`docs/BRIEFING.md`**.

**Os demais (`01`…`05`, `CHECKLIST-LANCAMENTO.md`, `REPORT.md`) são
históricos.** Consulte para entender *por que* algo é como é; não os use como
especificação. Onde divergirem deste arquivo, **este vence**.

⚠️ **`00-DECISOES.md` não se renumera nem se apaga.** Há **107 referências a
`D-01`…`D-14`** espalhadas por mais de 20 arquivos de código, migração e teste
(`src/lib/supabase.ts` sozinho tem 13). Decisão nova entra por *append*: D-15,
D-16, D-17…

---

## 1. Estado real

### Em produção, funcionando

**O corte 1 está no ar e aceito.** Migrações `005`→`011b` rodadas em staging e
em produção, `019_contagens.sql` com `ACEITE: OK`, query de retardatários
vazia. Nenhuma superfície do sistema afirma preço, duração ou data que não
venha do banco. A tensão 8.1 do `REPORT.md` está fechada.

### O corte 2 está IMPLEMENTADO e NÃO ESTÁ DEPLOYADO

Todo o código do `c34` ao `c57` existe, compila e tem teste. **O que falta é o
aceite manual e o deploy** — ver a seção 4.

⚠️ **O aceite do corte 2 não pode ser delegado ao agente:** ele exige uma
inscrição de ponta a ponta em modo teste do Stripe, com cartão salvo, **zero
débito imediato** e `trial_end` na data certa. O agente não executa nada
contra o banco nem contra o Stripe.

### Migrações rodadas

`000`(só staging) · `001`–`004`(históricas) · `005`–`011b` · `012`–`015` ·
**`016`–`017`** — todas em staging **e** em produção.

A `016` e a `017` foram conferidas com as consultas do próprio arquivo:
`linhas_com_travado = 0` e `pessoas_com_token = 0`, que é o esperado (nenhuma
das duas escreve dado).

### Validação atual

`npx tsc --noEmit` limpo, **378 testes verdes** em 12 arquivos.

---

## 2. Contradições resolvidas — não reabrir

### 2.1 Quando os valores travados passam a existir

`01-MODELO-DADOS.md` diz "travados presentes ⟺ status ≥ `confirmada`".
`02-FLUXOS.md`, passo ⑨, copia os travados já em `pendente_pagamento`.

**Resolvido para o lado conservador**, e implementado assim na
`015_inscricoes_travadas.sql`: tudo-ou-nada entre os três; lista de espera
nunca tem travado; `confirmada`/`ativa`/`inadimplente`/`concluida` têm que
ter. **`pendente_pagamento` e `cancelada` ficam de fora da exigência.**

### 2.2 Onde o checkout é criado

O plano diz `c35 feat(api): POST /api/checkout`. O `02-FLUXOS.md` desenha o
passo ⑩ **dentro** do POST de inscrição.

**Venceu o fluxo: a sessão é criada dentro de `/api/inscricao`**, e é assim
que está implementado. Rota separada teria que receber do cliente qual
inscrição pagar, e "nenhuma decisão de negócio vem do cliente" é a regra que
abre o `02-FLUXOS.md`.

⚠️ **O commit NÃO usou a mensagem do plano.** Ficou
`feat(api): a sessão de checkout nasce em /api/inscricao — vagas e travados`.
A versão anterior deste arquivo dizia "o nome do commit fica como está"; foi
mudado por decisão do dono, porque uma mensagem que nomeia um endpoint
inexistente manda a próxima pessoa procurar um arquivo que não está lá.

### 2.3 ⚠️ `cancel_at` NÃO existe em `subscription_data` — a D-05 é cumprida no webhook

Decidido em **09/08/2026**, e é a resolução mais importante desta sessão.

A D-05 diz: `cancel_at` "definido no momento da criação". **A API de Checkout
Session não aceita `cancel_at`** — conferido no SDK instalado (`stripe@22.4.0`,
`SessionCreateParams.SubscriptionData`). E a assinatura é criada pelo Stripe,
do lado de lá, quando a pessoa termina o pagamento: não existe "o momento da
criação" na nossa chamada.

**Onde ele é posto:** no handler de `checkout.session.completed`, primeiro
instante em que a assinatura existe e tem id. Uma chamada
`subscriptions.update({ cancel_at })`, declarativa, uma vez só.

**Por que isso NÃO viola a D-05:** o que ela proíbe é código NOSSO AGENDADO —
algo que precise rodar em julho para a assinatura parar em julho, porque um
dia ele não roda. Aqui o nosso código roda uma vez, hoje, e depois o Stripe
cumpre sozinho. A janela entre a assinatura nascer e o webhook processar é de
segundos, dentro do trial, sem cobrança no meio.

**A rede:** `invoice.paid` reconfere `cancel_at` e o declara se estiver
faltando. Se todas as reentregas de `completed` falharem, a primeira fatura
paga é a segunda chance — sem ela, a falha sumiria por seis meses e
reapareceria como a sétima cobrança.

O fallback nomeado pela própria D-05 (subscription schedule com
`end_behavior: 'cancel'`) continua disponível e **não foi usado porque não
precisou**.

### 2.4 O e-mail de confirmação da aluna saiu do insert

Decidido em **09/08/2026**.

Ele era disparado quando a inscrição era criada. Com checkout no fluxo isso
passou a ser mentira: diria "sua inscrição está confirmada" para alguém que
ainda ia digitar o cartão, e pela D-02 é pagar que faz entrar.

**Agora ele sai do webhook**, depois de `checkout.session.completed`. O aviso
para a Giovanna continua saindo no insert nos dois modos — o e-mail dela é
OPERACIONAL, não promessa, e ela precisa saber que existe gente chegando,
inclusive quem abandona o checkout e vira fila de pendência (D-15).

### 2.5 O `c54` virou um `.sql`, e não um script Node

Decidido em **09/08/2026**. O plano previa `script(ops)`. Um script Node
exigiria criar um **segundo** cliente Supabase (o `src/lib/supabase.ts` é
`server-only` e não pode ser importado de Node puro), quebrando a regra de que
só um arquivo conhece a `service_role` (REPORT §9.5).

O arquivo é **`supabase/operacao/gerar_convites.sql`** — diretório novo, e ele
não é `migrations/` de propósito: não muda schema, escreve dado, e roda
quantas vezes for preciso.

### 2.6 Vagas não são fixas

Respondido pela Giovanna em **08/08/2026**: *"não precisa ter número de vagas
fixas. Podemos ter mais ou menos alunos dependendo da aderência deles e da
disponibilidade da professora."*

Consequência: `vagas_total` fica **null** (= sem limite, D-08) na prática. A
checagem do `c36` existe e só morde se alguém preencher a coluna. A pergunta
antiga "inscrição cancelada devolve a vaga?" deixa de bloquear — ela só volta
a importar no dia em que um teto for posto, e o lugar de respondê-la é o
comentário da contagem em `buscarSafraAtiva`.

### 2.7 Retomada mantém o preço da primeira vez

Respondido pela Giovanna em **08/08/2026**. Quem abriu o checkout, não pagou,
e volta depois de o preço mudar **paga o valor travado da primeira vez**. A
`016` não sobrescreve os travados na duplicata, e a sessão é montada com
`precoDoContrato`, que resolve um `price` para o valor da INSCRIÇÃO — não o da
safra.

---

## 3. Fatos operacionais que não estão em documento nenhum

Descobertos na implementação. Perdê-los custa caro.

- **A `010` RECUSA rodar duas vezes.** Ela aborta se `pessoas` ou `inscricoes`
  tiver qualquer linha. Isso fecha "deployar primeiro, migrar depois" para
  sempre.
- **A `011` é a única migração que derrubou o formulário** — renomeou
  `waitlist`. Rodada **depois** do deploy, de propósito.
- **`cache: 'force-cache'` sem `next.revalidate` congela o dado para sempre.**
  `export const revalidate` governa a PÁGINA, não o Data Cache.
- **`export const revalidate` precisa ser literal**, por isso `60` está
  escrito em dois lugares e um teste amarra os dois.
- **Teste que lê arquivo como texto tira os comentários antes de comparar.**
- **`tests/` está no `include` do `tsconfig.json`**: erro de tipo em teste
  quebra o `next build`. O vitest não typechecka.
- **`supabase gen types` exige login de conta**, não a chave do projeto.
- **Não existe chave publicável do Stripe neste projeto**, e a ausência é
  desenho: o Checkout é hospedado.

### Novos, desta sessão

- ⚠️ **`allowJs` sem `checkJs`: `.jsx` NÃO é verificado pelo `tsc`.** Um
  identificador fora de escopo num componente é `ReferenceError` em runtime, e
  nada na suíte pega — não há ESLint no projeto. Aconteceu de verdade nesta
  sessão (uma substituição casou a ocorrência errada de `inscricaoAberta` e a
  modal quebrou ao abrir). **A defesa hoje é abrir a página.** Se isso doer de
  novo, o conserto mecânico é ESLint com `no-undef`, e é decisão do dono.
- ⚠️ **`invoice.subscription` NÃO EXISTE MAIS.** Foi removido da API do Stripe
  e substituído por `invoice.parent.subscription_details.subscription`. A
  versão fixada do projeto (`2026-07-29.dahlia`) é posterior à remoção. Em
  TypeScript não compila; em JS solto daria `undefined` e todo `invoice.paid`
  viraria "fatura avulsa, nada a fazer", em silêncio e para sempre.
- ⚠️ **`subscription_data` não tem `cancel_at`.** Ver §2.3.
- ⚠️ **`trial_end` precisa estar ≥ 48h no futuro**, ou o Stripe recusa a
  sessão. Quem se inscrever a menos de dois dias da `data_primeira_cobranca` é
  cobrada na hora (`trialEhAceitavel` devolve `false` e o campo é omitido). A
  data **não** é empurrada: isso desalinharia os seis ciclos inteiros.
- ⚠️ **Existem DUAS `criar_inscricao` no banco** — a de 10 argumentos da
  `011b` e a de 13 da `016`. O PostgREST resolve sobrecarga pelo CONJUNTO DE
  CHAVES do corpo JSON, e é por isso que os três parâmetros travados **não têm
  default**: sem eles, uma chamada de 10 chaves cairia na função nova e
  devolveria um objeto onde o build antigo espera um booleano. **A `018` dropa
  a antiga, e só depois do deploy.**
- ⚠️ **O `select` do SDK do Supabase precisa ser uma STRING LITERAL.** O tipo
  do resultado é inferido do texto; quebrar a string com `+` produz `string`,
  a inferência desiste, e o erro é críptico (`Property 'x' does not exist on
  type '{ error: true } & String'`).
- ⚠️ **`supabase gen types` não expressa nulidade de ARGUMENTO de função.** Os
  três travados chegam tipados como não-anuláveis apesar de a lista de espera
  precisar mandar `null`. O escape é a função `nulavel()` em
  `src/lib/supabase.ts` — um lugar só, nomeado e grep-ável.
- ⚠️ **`eventos_stripe` precisa de LIBERAÇÃO, não só de reserva.** "Grava o
  evento antes do efeito" + "reentrega não conta duas vezes" juntas produzem
  um terceiro comportamento: evento gravado → efeito falha → 500 → reentrega
  vê "já processado" → **o efeito nunca acontece**. Por isso
  `liberarEventoStripe` apaga a reserva antes de devolver 500.
- **`coupons.create` não aceita `currency` junto de `percent_off`.** Os três
  tipos deste projeto são percentuais (`meses_gratis` é `percent_off: 100`).
- **`price` do Stripe não aceita id nosso, mas aceita `lookup_key`** — que é
  consultável por `list` (estritamente consistente), ao contrário de `search`.
  É o que torna `precoDoContrato` idempotente.

---

## 4. O que falta — corte 2

### O código está pronto. Falta rodar, conferir e subir.

⚠️ **Nesta ordem, e a ordem importa:**

1. **Configurar o Stripe em modo teste**: `STRIPE_SECRET_KEY` e
   `STRIPE_WEBHOOK_SECRET` no ambiente (ver `.env.example`). Local, o
   `whsec_` sai de `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   e muda a cada execução.
2. **Abrir a safra**: `inscricoes_abertas = true` numa safra com
   `data_primeira_cobranca` a mais de 48h no futuro.
3. ⛔ **O CHECKPOINT QUE NÃO SE DELEGA:** uma inscrição completa em modo
   teste, do formulário ao webhook. Confirmar: **cartão salvo**, **zero débito
   imediato**, `trial_end` na data certa, e `cancel_at` = primeira cobrança +
   `duracao_meses` (seis faturas, não sete).
4. **Conferir o cupom** com um registro de teste na tabela `cupons`.
5. **Reentregar um evento** pelo Dashboard e confirmar que nada é contado duas
   vezes.
6. **Deploy.**
7. **Só então a `018`** — dropar a sobrecarga de 10 argumentos da `011b`.
   Antes do deploy, ela é o que mantém o formulário no ar.

### A `018` está escrita e NÃO deve ser rodada ainda

`supabase/migrations/018_drop_criar_inscricao_v1.sql` dropa a sobrecarga de
10 argumentos da `011b`. Ela tem uma guarda que recusa rodar se a função de
13 argumentos não existir — sem isso, um banco onde a `016` não rodou ficaria
sem NENHUMA `criar_inscricao`, e o formulário morreria por completo.

⛔ **É o único arquivo do projeto cuja hora de rodar não é "assim que estiver
pronto".** Antes do deploy, a função antiga é o que mantém o formulário no ar.

### Validação visual pendente

As telas `/inscricao/sucesso` e `/inscricao/cancelado`, e o campo de cupom na
modal, **não passaram pelo `shot.mjs`**. O agente não pode rodá-lo: ele sobe
um `next dev` cuja checagem de saúde renderiza `/`, que lê `public.safras` —
e o `CLAUDE.md` proíbe o agente de abrir conexão com o banco, inclusive para
`select`. Nenhuma medida nova foi inventada nessas telas (todas as classes já
existiam), mas ninguém olhou.

---

## 5. O que falta — corte 3 (painel)

`c58`–`c79` do `04-PLANO.md`, **mais D-15 e D-16**, que são novas e mudam o
escopo do painel.

### O que o corte 2 já deixou pronto para ele

- **`convidarParaInscricao(convite, safra, motivo)`** em `src/lib/email.ts`
  manda o link de pagamento para UMA pessoa. É exatamente o que a fila da
  D-15 precisa (`c75`).
- **`cupomInvalidoPorque`** e **`cupomNoStripe`** já existem; o `c74` (CRUD de
  cupons) só precisa da tela.
- **`supabase/operacao/gerar_convites.sql`** gera os tokens e o CSV da base
  atual, sem painel nenhum.

### ⚠️ EXCEÇÃO DECLARADA — o design de `/admin`

**Decidida em 09/08/2026 pelo dono do repositório.** Não existe Figma do
painel e o `design/SPEC.md` cobre só a landing, então a regra "nenhum número
visual estimado, valor de layout vem do Figma Dev Mode" **fica suspensa para
`/admin`, e só para ele**, com uma condição:

> **Nenhuma medida nova é inventada.** Tudo sai de classe que já foi medida em
> outro lugar — `container-page`, `btn-brand`, `font-display`, os tokens de cor
> do `tailwind.config.js`, e os tamanhos que a modal e o `DocumentoLegal` já
> usam.

O registro fica em três lugares que a pessoa que mexer vai abrir de qualquer
jeito: `app/admin/login/page.jsx`, `app/admin/(protegido)/layout.jsx` e
`src/components/admin/FormularioCupom.jsx`. Se um Figma do painel aparecer,
esses comentários são o que diz o que foi assumido.

### Dependência nova

**`@supabase/ssr`** entrou no corte 3. Ela é o que faz a sessão viver em cookie
no App Router (renovação, chunking, leitura em Server Component) — escrever isso
à mão é o tipo de coisa que quebra em silêncio.

⚠️ **Ela NÃO afrouxa a regra do "único lugar que conhece a chave".** São dois
clientes com chaves e propósitos diferentes: `service_role` (lê e escreve dado
pessoal, ignora RLS) mora só em `src/lib/supabase.ts`; `anon` + sessão (só
resolve "quem é você?") mora em `src/lib/admin.ts` e nas rotas de OAuth. Com RLS
ligada e zero policies, a `anon` não lê uma linha sequer.

### ⚠️ Configuração fora do código, sem a qual o login não funciona

Está escrita no `.env.example`, e o passo 3 é o que falha em silêncio:

1. Google Cloud → OAuth 2.0 Client ID. O redirect URI é o do **Supabase**
   (`https://<projeto>.supabase.co/auth/v1/callback`), não o nosso.
2. Supabase → Authentication → Providers → Google: ligar e colar client
   id/secret.
3. Supabase → Authentication → URL Configuration → **Redirect URLs**:
   acrescentar `http://localhost:3000/admin/callback` e a de produção. Sem
   isso o login termina numa página errada **sem erro visível em lugar
   nenhum**.

### ⚠️ Limitação de modelo que o painel vai encostar

Os três tipos de cupom da `013` cobrem: percentual no 1º mês, percentual em
todos os meses, e N meses grátis (100%). **"20% nos 3 primeiros meses" não é
representável.** O conserto é uma coluna `duracao_meses` em `cupons`, nullable,
lida só quando `tipo = 'todos_meses'` — migração aditiva, sem downtime.

Levantado em 09/08/2026; o dono decidiu **manter como está** por ora. ⚠️ O
custo cresce com o tempo: depois de existirem cupons em produção, mudar a
semântica de `todos_meses` é mexer em contrato de gente que já comprou.

---

## 6. Pendências pequenas, registradas

- `c28` (`docs: SPEC.md — tokens novos do corte 1`) **não é commitável**:
  `design/` está no `.gitignore`. O `SPEC.md` foi atualizado no working tree e
  fica só local.
- `design/SPEC.md` diz "Stack: Vite + React + Tailwind". É Next.js. Nunca
  corrigido.
- `next-env.d.ts` é gerado pelo Next e alterna com `dev`/`build`. Ruído; não
  entra em commit.
- **Não há campo de cupom para quem está na lista de espera**, e é
  intencional: sem checkout não há o que descontar. O servidor ignora o campo
  nesse modo.
