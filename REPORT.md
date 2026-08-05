# Beyond The Lab — Relatório Arquitetural

> Estado do produto em **3 de agosto de 2026**, escrito como base para a
> refatoração. Não é manual de operação (isso é o `README.md`) nem
> especificação visual (isso é o `design/SPEC.md`). É o mapa de **como o
> sistema pensa**: que decisões foram tomadas, por quê, onde cada dado
> mora, e onde a estrutura atual já não sustenta o que o produto virou.

---

## 1. O que o sistema é, de fato

Beyond The Lab é uma **landing page de conversão com um único ato
transacional**: alguém preenche um formulário e vira uma linha num banco.
Tudo o mais — hero, seções, animações, conteúdo programático, documentos
legais — existe para levar até esse ato e para torná-lo defensável.

Isso define a forma da arquitetura melhor do que qualquer escolha de
stack. O sistema tem:

- **muita superfície de apresentação** (12 componentes de seção, 4 rotas,
  um design system medido contra o Figma);
- **um caminho de escrita só** (`POST /api/waitlist`);
- **uma leitura de estado de negócio só** (`GET /api/turma-ativa`);
- **nenhuma sessão, nenhum login, nenhum usuário autenticado.**

A consequência arquitetural mais importante: **não existe cliente
confiável em lugar nenhum**. Não há um usuário logado cuja identidade o
servidor conheça. Tudo que chega pela rede é afirmação anônima. Boa parte
das decisões abaixo é derivada disso.

### As três forças que moldaram o desenho

1. **Perder uma inscrição é o único desfecho inaceitável.** Uma pessoa
   interessada que encontra tela quebrada não volta. Isso explica por que
   praticamente todo caminho de erro do sistema **degrada em vez de
   falhar** — e por que as poucas exceções a essa regra são deliberadas e
   documentadas.
2. **A professora precisa operar sem deploy.** Abrir turma, fechar turma,
   ajustar data, montar grupos — tudo pelo Supabase Studio. Foi essa
   força que tirou dados do código e os pôs no banco.
3. **A coleta é de dado pessoal sob LGPD.** Nome, e-mail, celular, curso,
   período. Isso transformou "gravar o consentimento" de detalhe de
   formulário em **requisito estrutural com peso probatório**, com
   consequências que atravessam três camadas.

---

## 2. Panorama

```
                    NAVEGADOR
   ┌────────────────────────────────────────────────┐
   │  Páginas estáticas (RSC)   ·   Modal (client)  │
   │  Hero, Pricing, FAQ…            InscricaoModal │
   │  pré-renderizadas               estado local   │
   └────────────┬──────────────────────┬────────────┘
                │  (nada)              │ GET  /api/turma-ativa
                │                      │ POST /api/waitlist
                ▼                      ▼
   ┌────────────────────────────────────────────────┐
   │              NEXT.JS (Vercel)                  │
   │  ── fronteira de confiança ──                  │
   │  Route handlers · Zod · rate limit · honeypot  │
   │  src/lib/supabase.ts   (server-only)           │
   │  src/lib/email.ts      (server-only)           │
   └────────┬───────────────────────────┬───────────┘
            │ PostgREST                 │ HTTPS
            │ service_role              │ after()
            ▼                           ▼
   ┌──────────────────┐        ┌──────────────────┐
   │    SUPABASE      │        │      RESEND      │
   │  turmas          │        │  2 e-mails       │
   │  waitlist        │        │  transacionais   │
   │  RLS ligada,     │        └──────────────────┘
   │  zero policies   │
   └──────────────────┘
```

Três coisas que este desenho diz e valem sublinhar:

- **O navegador nunca fala com o Supabase.** Não há chave `anon` no
  bundle, não há SDK de banco no cliente, não há RLS a confiar. A
  aplicação Next é a única porta.
- **As páginas não consultam nada.** Toda a landing é pré-renderizada
  estática. O banco só entra em cena quando a modal abre.
- **O e-mail sai depois da resposta**, via `after()` do `next/server`, e
  não no caminho crítico da inscrição.

---

## 3. Onde cada dado mora

Esta é a pergunta central do relatório. Inventário completo, por
localização e por tempo de vida.

### 3.1 No banco (Supabase / Postgres) — a única persistência real

**`public.turmas`** — a safra de alunas. Uma linha por turma.

| Coluna | Tipo | O que guarda |
|---|---|---|
| `id` | uuid | identidade interna — **nunca sai para o navegador** |
| `nome`, `slug` | text | rótulo humano e chave estável de identidade |
| `data_inicio_aulas`, `data_primeira_cobranca` | `date` | dia de calendário, não instante |
| `valor_mensal` | `numeric(10,2)` | mensalidade |
| `duracao_meses` | integer | duração do programa |
| `inscricoes_abertas` | boolean | **a chave que a professora liga e desliga** |
| `created_at` | timestamptz | |

**`public.waitlist`** — a inscrição. Uma linha por pessoa.

| Grupo | Colunas | Natureza |
|---|---|---|
| Identificação | `name`, `email` (unique), `phone` (E.164) | dado pessoal, canal de contato |
| Vínculo | `turma_id` (FK, nullable), `status`, `grupo` | estado de negócio |
| Perfil | `nivel_ingles`, `curso`, `periodo`, `disponibilidade` (`text[]`) | insumo para montar os grupos de horário |
| Intenção | `payment_choice` | `agora` / `depois` — hoje sem efeito |
| **Prova** | `consent`, `consent_at`, `consent_text` | registro probatório LGPD |

### 3.2 Fora do banco

| Onde | O que | Tempo de vida |
|---|---|---|
| **Estado React da modal** | tudo que a pessoa digita, antes do envio | até fechar a modal — nada é rascunhado, nada persiste |
| **`window.history`** | uma entrada empurrada ao abrir a modal | enquanto a modal está aberta (faz o botão "voltar" do Android fechá-la) |
| **Map em memória do servidor** | timestamps de requisição por IP (rate limit) | janela de 60s, **por instância serverless** |
| **Log do servidor (Vercel)** | erros, status HTTP, e-mail como referência | retenção da Vercel |
| **Resend** | os dois e-mails transacionais, com todos os dados da inscrição no corpo | retenção do Resend — **é uma cópia do dado pessoal fora do banco** |
| **Env vars (Vercel)** | `SUPABASE_*`, `RESEND_API_KEY`, `EMAIL_*` | segredos, nenhum com prefixo `NEXT_PUBLIC_` |
| **Código-fonte** | textos, módulos do curso (`src/data/modules.ts`), CRBM, texto do consentimento | versionado — muda com deploy |

**Não existe:** cookie, localStorage, sessionStorage, analytics,
telemetria, tracking de terceiro, CDN de fonte externa, nenhum pixel.
A página não escreve **nada** no dispositivo de quem visita.

### 3.3 A hierarquia de autoridade sobre os dados

Este é o princípio que amarra tudo, e é o que a refatoração mais precisa
preservar:

| Dado | Fonte de verdade | Por quê |
|---|---|---|
| Qual turma está aberta | **o banco, lido no ato do insert** | a modal também consulta, mas só para desenhar; entre a resposta que ela recebeu e o envio, a professora pode ter fechado a turma |
| `turma_id`, `status` | **o servidor**, derivados da leitura acima | o cliente não tem voz — um POST forjado poderia se declarar inscrito em qualquer turma |
| `consent` (marcou?) | **o cliente** | é o único que sabe; o Zod exige `z.literal(true)` |
| `consent_at` (quando?) | **o servidor** | relógio de cliente é a pior fonte imaginável para um carimbo probatório |
| `consent_text` (a quê?) | **o servidor**, da constante `CONSENT_TEXT` | um POST forjado poderia declarar ter aceitado texto que nunca existiu |
| `payment_choice` | cliente, **mas descartado** se não houver turma aberta | sem cobrança não há intenção de pagamento a registrar |

---

## 4. As duas chamadas de API

Só existem duas. Ambas `force-dynamic`, ambas `no-store`, ambas em
`app/api/`.

### 4.1 `GET /api/turma-ativa` — "o que eu desenho?"

Chamada **uma vez, na montagem da modal**. A modal só é montada quando
abre, então o efeito de montagem *é* o "ao abrir".

```
modal abre → status='carregando' → GET /api/turma-ativa
                                     ↓
                            buscarTurmaAtiva()
                                     ↓
                   PostgREST: turmas?inscricoes_abertas=is.true&limit=1
                                     ↓
              { turma: {...} }  ou  { turma: null }   — sempre HTTP 200
                                     ↓
                          status='idle', modal renderiza
```

Três decisões dentro desta rota merecem registro:

**Nunca devolve erro.** Banco fora do ar, env faltando, schema
divergente — todos viram `{ turma: null }` com status 200. O raciocínio
é o da força nº 1: cair em lista de espera captura o contato; devolver
500 mostra tela quebrada e perde a pessoa. O problema fica visível no
log, que é onde se conserta.

**O `id` da turma é cortado na montagem da resposta.** `buscarTurmaAtiva`
seleciona o `id` porque `/api/waitlist` precisa dele para a FK, mas a
rota pública monta um objeto campo a campo, sem ele. O corte é explícito
de propósito: um `select *` ou um spread vazaria o identificador sem
ninguém notar.

**`valor_mensal` vira número aqui.** O PostgREST serializa `numeric` como
string — precisão que o double do JSON não garante. A conversão acontece
no último momento possível.

### 4.2 `POST /api/waitlist` — o único caminho de escrita do sistema

```
   corpo JSON do cliente
            ↓
   ① rate limit por IP ────────── 429
            ↓
   ② parse JSON ───────────────── 400
            ↓
   ③ Zod safeParse ─────────────── 400  (mensagem genérica, exceto
            ↓                            consentimento e disponibilidade)
   ④ honeypot preenchido? ──────► 200 "sucesso" e NÃO grava
            ↓
   ⑤ consentAt = agora()   ← carimbo aqui, não no insert
            ↓
   ⑥ buscarTurmaAtiva()    ← a pergunta é feita AO BANCO
            ↓
   ⑦ INSERT via PostgREST (Prefer: return=minimal)
            ↓
      ok ──────────────► after(): 2 e-mails em paralelo, allSettled
      duplicata ───────► 200 (mesma resposta do sucesso), sem e-mail
      outro erro ──────► 500 genérico, detalhe só no log
```

**A ordem importa e não é acidental.** O carimbo de consentimento (⑤) é
gerado logo depois da validação que exigiu `consent: true` e do honeypot
que descartou o que não é gente — não dentro da chamada ao banco, onde
mediria a latência do PostgREST em vez do instante da manifestação.

**Duplicata responde sucesso.** É a decisão contra-intuitiva mais
deliberada do sistema: e-mail já cadastrado devolve exatamente a mesma
resposta que uma inscrição nova. Responder diferente transformaria o
formulário num oráculo de "este e-mail existe no banco?". E é por isso
que a duplicata **também não dispara e-mail** — o envio silencioso seria
um canal lateral contornando a resposta HTTP idêntica.

**Os e-mails nunca bloqueiam.** `after()` do `next/server`, não uma
promessa solta: em serverless a função pode ser congelada assim que
devolve a resposta, e uma promessa não aguardada morre no meio do fetch.
Os dois envios vão em paralelo com `allSettled`, e **nenhuma função de
`email.ts` lança** — erro de rede, chave inválida ou domínio não
verificado viram log e param ali. A inscrição já está gravada; perder o
aviso é ruim, perder a inscrição é inaceitável.

### 4.3 A camada de acesso a dados

Não existe ORM, não existe `@supabase/supabase-js`, não existe padrão
Repository formal. Existe **`src/lib/supabase.ts`**: dois `fetch` para o
PostgREST, tipados à mão, com `import 'server-only'` no topo — o que faz
o build quebrar se alguém importar isso de um client component. É a rede
de segurança que impede a `service_role` de acabar no bundle.

A justificativa registrada no código: a única operação do projeto é um
INSERT; o SDK traria auth, realtime e storage para o bundle do servidor
sem nenhum uso. **A própria decisão vem com a condição de revisão
escrita**: "se o escopo crescer (queries, admin, auth), vale trocar pelo
SDK". A refatoração deve tratar isso como um gatilho já armado.

---

## 5. O modelo de dados e suas invariantes

O que distingue este schema de um CRUD comum é que **as regras de negócio
estão no banco, não só na aplicação** — e a história de por que chegaram
lá está registrada na migração `004`.

### As invariantes garantidas pelo Postgres

| Invariante | Mecanismo |
|---|---|
| No máximo **uma** turma aberta por vez | índice único parcial `turmas_uma_aberta_idx` |
| Cobrança nunca depois do início das aulas | CHECK em `turmas` |
| Apagar turma com inscrição é recusado | FK `on delete restrict` |
| `turma_id` nulo ⟺ `status = 'lista_espera'` | CHECK `waitlist_turma_status_coerentes_check` |
| Perfil completo em toda inscrição nova | CHECK `waitlist_perfil_obrigatorio_check` |
| Consentimento completo (os três campos, tudo-ou-nada) | CHECK `waitlist_consentimento_obrigatorio_check` |
| Domínio dos valores (`nivel_ingles`, `disponibilidade`) | CHECKs da migração `002` |
| E-mail único | constraint unique — é ela que produz o caminho de duplicata |

### A lição embutida na migração 004

As migrações `002` e `003` dividiram o trabalho assim: **o banco cuida do
domínio, a aplicação cuida da obrigatoriedade.** Era a decisão certa
naquele momento — as colunas acabavam de nascer e as linhas antigas não
tinham o dado.

Aí uma inscrição real gravou em produção com perfil e consentimento
inteiros nulos. Não foi bug do repositório: **um build antigo continuava
no ar**. A migração chegou ao banco; o deploy da aplicação, não. E o build
antigo respondeu "Inscrição confirmada!" com 200. Ninguém tinha como
saber, exceto abrindo a linha no Studio.

O buraco: a única coisa que exigia aqueles campos era o Zod da rota — o
que funciona enquanto o código no ar é o código do repositório. Um deploy
atrasado, um rollback ou uma instância velha desmentem essa suposição em
silêncio.

A `004` fecha isso com `NOT VALID`: **toda linha nova é verificada; as
antigas não são lidas nem reescritas.** É a forma que as migrações
anteriores procuravam e não tinham — obrigar sem falsificar histórico.

> **Esta é a lição arquitetural mais transferível do projeto:** validação
> na aplicação é uma promessa sobre qual código está rodando. Constraint
> no banco é um fato. Onde a diferença importa — dado pessoal, base legal,
> coerência de estado — o fato vence.

### O passivo, deliberadamente visível

`consent` é nullable e **`null` significa "não sabemos"**, não `true`. A
tentação era backfill com `not null default true` e resolver numa linha —
e seria falsificação de prova. Consentimento presumido não é
consentimento. O estado desconfortável é intencional: ele torna visível,
em qualquer consulta, exatamente quais contatos não têm base documentada.

Mesma lógica em `consent_text`: a string inteira é copiada em cada linha.
Redundância deliberada. A alternativa normalizada (tabela de versões +
FK) economizaria bytes e criaria o risco que a coluna existe para
eliminar — um UPDATE reescreveria retroativamente o que todo mundo teria
"aceitado". **Prova não se normaliza.**

---

## 6. Catálogo de decisões arquiteturais

Formato: decisão · por quê · consequência viva hoje.

### D1 — Next.js App Router, páginas estáticas, dois route handlers
As quatro rotas são pré-renderizadas. O único dinamismo é a modal.
**Consequência:** performance de página estática sem cache a invalidar; em
troca, nenhum dado de negócio pode aparecer no HTML inicial — e é
exatamente isso que produz a tensão da seção 8.1.

### D2 — O banco como painel de controle
Datas, valor, duração e a janela de inscrição saíram de
`src/config/curso.ts` e viraram colunas. Motivo: enquanto eram
constantes, abrir a próxima turma exigia commit e deploy.
**Consequência:** `force-dynamic` e `no-store` em toda a cadeia — se a
resposta fosse cacheada, o controle pelo banco não teria tirado a
necessidade de deploy, só a teria disfarçado.

### D3 — `service_role` no servidor, RLS ligada com zero policies
Sem policy, RLS nega tudo: `anon` e `authenticated` não leem nem escrevem
nada. A `service_role` ignora RLS, e é por isso que a tabela pode ficar
sem policy nenhuma. Há ainda `revoke all` em `turmas` como cinto além do
suspensório.
**Consequência:** a segurança do dado depende inteiramente de a chave
nunca vazar — daí o `server-only`, a ausência de `NEXT_PUBLIC_` e o corte
manual de campos na montagem da resposta. **E há um aviso explícito no
SQL: não crie policy, isso abriria a tabela para a chave `anon`.**

### D4 — `fetch` direto ao PostgREST, sem SDK
Ver 4.3. Decisão com gatilho de revisão já escrito.

### D5 — Falha segura como padrão, com exceções nomeadas
Turma indisponível → lista de espera. E-mail falha → log. Honeypot →
sucesso falso. **A exceção é o insert**: se ele falhar de verdade, a
pessoa vê erro — porque prometer vaga que não existe é o único desfecho
pior que mostrar erro.

### D6 — Consentimento como fonte única compartilhada
`src/config/consentimento.ts` existe por motivo probatório, não de
organização. A frase vive em **segmentos** (`CONSENT_SEGMENTS`), e não
como string: a modal precisa renderizar dois links no meio dela, o banco
precisa gravar a sentença corrida. Uma string para gravar + um JSX à
parte para exibir seria a duplicação disfarçada — as duas divergiriam na
primeira revisão de redação. `CONSENT_TEXT` é **derivada** dos segmentos,
nunca escrita à mão.
**Consequência:** o módulo é neutro de propósito — não pode ser
`server-only` (a modal não conseguiria importar) nem ficar em
`curso.ts` (aquilo varia por safra; isto varia por revisão jurídica).

### D7 — Regra compartilhada de telefone
`src/lib/telefone.ts` roda nos dois lados, com a lista fechada de DDDs da
Anatel. Não pode importar `server-only`. Motivo: se a máscara aceitasse o
que o servidor recusa, a pessoa veria erro depois de preencher tudo.
E.164 no banco porque é o formato que a API do WhatsApp entende sem
reprocessar — e o WhatsApp é como o grupo da turma é montado.

### D8 — Modal com estado global, montada uma vez
`InscricaoProvider` no `app/layout.jsx`. Oito CTAs em seis componentes
abrem o **mesmo** formulário; montar oito instâncias deixaria oito cópias
de cada campo no DOM.
**Consequência:** o provider carrega responsabilidades não óbvias —
histórico do navegador (para o "voltar" do Android fechar a modal),
devolução de foco ao gatilho, e a manipulação de `history` vive nos
handlers e não num efeito, porque o StrictMode do dev duplicaria o par
push/back.

### D9 — Fluxo de conversão em duas etapas
Todo "Lista de espera" da página **rola até o card de preço**
(`LinkListaEspera`, âncora real); só o "Garantir minha vaga" de dentro do
card abre a modal (`CtaInscricao`, `<button>`). Quem clica no topo ainda
não viu o preço — mandar a modal direto pularia a informação que a
decisão precisa.

### D10 — E-mail em HTML de 2003, sem biblioteca e sem imagem
Tabela e estilo inline; Gmail remove `<style>`, Outlook renderiza com o
motor do Word. Nenhuma imagem — cliente de e-mail bloqueia por padrão, e
logo remoto viraria retângulo vazio. As cores são literais copiadas dos
tokens do Tailwind, porque não há como referenciar classe utilitária
dentro de e-mail. Todo texto livre passa por `esc()`: `name`, `curso` e
`periodo` são digitados por terceiros e chegam na caixa da professora.

### D11 — Validação visual por render, não por teste
`shot.mjs` sobe o dev server, abre as rotas em 1440×1024 e 390×844 e grava
um PNG por seção em `design/`. É a única suíte de verificação do projeto.
O `design/SPEC.md` proíbe estimar valores: todo número vem do Figma Dev
Mode, e o que é derivado é marcado com `⚠️ derivado` no próprio código.
**Consequência:** o CSS tem rastreabilidade excepcional e **a lógica não
tem nenhuma cobertura automatizada.**

---

## 7. Fronteiras de confiança

Vale enumerar, porque a refatoração vai mexer nelas.

| Fronteira | O que a atravessa | O que a protege |
|---|---|---|
| Navegador → API | JSON arbitrário | Zod, rate limit, honeypot, `z.literal(true)` |
| API → banco | payload montado pelo servidor | CHECKs `NOT VALID`, unique, FK |
| Servidor → navegador | resposta montada campo a campo | corte explícito do `id`; mensagens genéricas; nada do payload é ecoado |
| Servidor → Resend | dados da inscrição | `esc()` em todo texto livre; `InscricaoEmail` é um tipo próprio que **não** inclui `consent_text`, `consent_at` nem `turma_id` |
| Servidor → log | status HTTP e o e-mail como referência | nunca corpo de mensagem, nunca chave, nunca payload inteiro |
| Código → bundle | — | `import 'server-only'`, ausência de `NEXT_PUBLIC_` |

O padrão recorrente: **cada travessia carrega o mínimo, e o corte é
explícito e comentado no ponto onde acontece.** Não há um único
`select *` nem um único spread de objeto de banco no projeto.

---

## 8. Tensões atuais — a agenda da refatoração

Estas não são bugs. São lugares onde a estrutura atual já não corresponde
ao que o produto virou.

### 8.1 O banco virou fonte de verdade, mas a página não a lê — a tensão central

`GET /api/turma-ativa` devolve `nome`, `data_inicio_aulas`,
`data_primeira_cobranca`, `valor_mensal` e `duracao_meses`.

**A interface hoje usa exatamente um bit disso: `turma !== null`.**

Nenhum consumidor de `valor_mensal`, `duracao_meses` ou das datas existe
mais no cliente:

- `Pricing.jsx` tem **`R$ 299,99` escrito à mão** (linha 144) e
  "Duração de 6 meses" na lista de features;
- `formatarValorMensal()` em `src/config/curso.ts` **não é chamada em
  lugar nenhum**;
- a tela de sucesso da modal e o `email.ts` voltaram a usar **texto
  literal** ("primeira semana de setembro de 2026"), porque a turma começa
  num dia escolhido pela aluna e uma coluna `date` não representa isso. A
  decisão está bem documentada nos dois lugares — mas o efeito é que a
  coluna `data_inicio_aulas` no banco **não corresponde ao que o site
  diz**.

Ou seja: a D2 foi executada pela metade. O painel de controle existe, o
transporte existe, e o consumo foi desfeito peça a peça por bons motivos
locais. **Hoje a professora pode mudar o valor no Studio e o site
continuará dizendo R$ 299,99.**

Isto é o item nº 1 da refatoração, e a decisão não é técnica: é decidir
**quais dados do curso realmente pertencem ao banco** e modelar os que
pertencem de forma que representem a realidade (um campo de texto por
extenso para o início, ao lado da `date`, é a solução já apontada nos
comentários). O que não pertencer deve sair do banco, não ficar lá sem
consumidor.

### 8.2 Não existe camada de domínio

As regras de negócio estão distribuídas em quatro lugares sem um centro:
o Zod da rota, as constantes da modal (`NIVEIS`, `CURSOS`, `PERIODOS`,
`DIAS`), os tipos de `supabase.ts` e os CHECKs do SQL. Os valores
precisam bater nos quatro, e **hoje isso é mantido por disciplina e
comentário** — `email.ts` inclusive duplica os rótulos de `NIVEIS` e
`DIAS` porque a modal é client component e arrastá-la para o servidor
seria pior.

Um módulo de domínio neutro (à la `consentimento.ts`, que provou o
padrão) do qual derivassem o schema Zod, as opções da UI, os rótulos de
e-mail e — idealmente — o SQL, elimina a classe inteira.

### 8.3 O tipo de acoplamento que a `004` já expôs uma vez

O incidente do build antigo mostrou o padrão: **aplicação e banco
evoluem em cadências diferentes e ninguém verifica se estão em fase.** As
migrações são rodadas à mão no SQL Editor, na ordem numérica, sem
registro de versão aplicada. O `CHECKLIST-LANCAMENTO.md` cobre isso com
disciplina humana ("confira na Vercel qual commit está em Production").

A refatoração deve substituir disciplina por mecanismo: migrações
versionadas com histórico consultável, e — no mínimo — uma verificação de
compatibilidade de schema no boot.

### 8.4 Rate limit que não limita

`Map` em memória, janela deslizante, **por instância serverless**. A
Vercel pode ter várias em paralelo, então o limite real é bem mais frouxo
que os 5/min declarados. O comentário no código já nomeia a saída
(store compartilhado ou rate limit da borda). Segura bot ingênuo e
duplo-clique; não segura mais que isso.

### 8.5 Zero cobertura de lógica

Não há teste. Nenhum. As regras de maior consequência do sistema — o
pareamento `turma_id`/`status`, a resposta idêntica na duplicata, o
descarte de `payment_choice`, a validação de DDD — são verificadas por
leitura de código e por render de PNG. `shot.mjs` é excelente no que faz
e não faz nada disso.

Alvos naturais, em ordem de retorno: `telefone.ts` (função pura, regra
compartilhada entre client e server), o schema Zod da rota, e a
montagem do payload de insert.

### 8.6 Fronteira de linguagem inconsistente

Componentes em `.jsx`, libs e dados em `.ts`, uma view em `.tsx`. O custo
já apareceu: `CtaInscricao.jsx` precisa de um bloco JSDoc só para o build
não quebrar quando o consumidor tipado (`SyllabusPage.tsx`) o usa. A
tipagem do banco também é manual — `type Turma` é mantida à mão em
paralelo ao schema real.

### 8.7 `payment_choice` é vestígio

Hoje **os dois valores gravam igual**; sem turma aberta o campo é
descartado. O ponto de ramificação para o Stripe está marcado com
`TODO: Prompt B2` no `handleSubmit`. Os status `agendado`, `ativo`,
`falhou` e `cancelado` já existem no CHECK esperando essa integração.
Enquanto ela não vem, há um campo no banco que registra intenção sem
efeito — e a refatoração precisa decidir se o Stripe entra antes ou
depois dela, porque a resposta muda o desenho do fluxo de sucesso.

### 8.8 Observabilidade é `console.error`

Toda falha de e-mail, todo insert recusado, toda queda do Supabase vira
uma linha no log da Vercel que **ninguém é notificado a ler**. Como o
sistema degrada silenciosamente por design (D5), o silêncio é
indistinguível de "não teve inscrição" — que é exatamente o que o
checklist de lançamento adverte sobre as env vars do Resend.

Um sistema cuja estratégia de erro é falhar em silêncio precisa, mais que
os outros, de um canal que grite.

### 8.9 Menores, mas reais

- **Painel administrativo não existe.** Toda operação é Supabase Studio +
  SQL colado do README. Previsto como "Prompt C".
- **`InscricaoModal.jsx` tem 998 linhas** e acumula: fetch de estado,
  máquina de estados de quatro fases, validação client, oito campos,
  captura de teclado, trava de scroll, portal e duas telas alternativas.
  É o arquivo mais denso do repositório e o mais provável de esconder
  regressão.
- **Templates de e-mail são strings HTML no meio da lógica de envio.**
  Funcional e bem justificado, mas `email.ts` mistura transporte,
  formatação e conteúdo editorial num arquivo só.
- **Assets ainda são PNG do export do Figma**, não WebP otimizado
  (registrado no README).
- **`teacher.mp4` (~11 MB) está versionado**, com um `git filter-repo`
  pendente por causa disso.

---

## 9. O que a refatoração não deve perder

Se algo deste relatório sobreviver ao refactor, que seja esta lista. São
as decisões que custaram caro para chegar onde estão:

1. **Nenhuma decisão de negócio vem do cliente.** Turma, status e carimbo
   de consentimento são lidos ou gerados no servidor, sempre.
2. **A resposta de duplicata é idêntica à de sucesso** — e por isso não
   dispara e-mail.
3. **Falha de infraestrutura degrada para lista de espera**, nunca para
   tela de erro. A única exceção é o insert que falha de verdade.
4. **O registro de consentimento é tudo-ou-nada e não se normaliza.**
   `null` continua significando "não sabemos".
5. **`server-only` e a ausência de `NEXT_PUBLIC_`** são o que mantém a
   `service_role` fora do navegador.
6. **Toda travessia de fronteira carrega o mínimo, com corte explícito.**
   Nada de `select *`, nada de spread de objeto de banco.
7. **O texto do consentimento tem fonte única, e a versão exibida é
   derivada dela** — nunca o contrário.
8. **A regra de telefone roda nos dois lados a partir do mesmo módulo.**
9. **Constraint no banco vence validação na aplicação** onde a diferença
   importa. `NOT VALID` é a ferramenta para exigir sem falsificar o
   passado.
10. **O comentário que explica *por que não* vale mais que o que explica
    *o que*.** Esse é o traço mais forte deste código, e o mais fácil de
    perder num refactor — a maior parte do conhecimento arquitetural do
    projeto está em comentário, não em documento. Se ele não migrar para
    a estrutura nova, some.

---

## 10. Ordem sugerida

| # | Frente | Por que primeiro |
|---|---|---|
| 1 | **Resolver a tensão dado-do-curso (8.1)** | é a única onde o sistema hoje pode dizer algo falso à pessoa que está comprando |
| 2 | **Extrair o domínio (8.2)** | destrava tipagem, testes e a reconciliação com o SQL |
| 3 | **Testar `telefone.ts`, o schema Zod e o payload de insert (8.5)** | maior retorno por linha; nenhuma refatoração adiante é segura sem isso |
| 4 | **Observabilidade mínima (8.8)** | um sistema que falha em silêncio precisa disso antes de ser mexido |
| 5 | **Quebrar `InscricaoModal.jsx` (8.9)** | agora com testes atrás |
| 6 | **Migrações versionadas + verificação de fase (8.3)** | fecha a classe de incidente que a `004` documentou |
| 7 | **Stripe / `payment_choice` (8.7)** e **painel (8.9)** | features, depois da base |

Rate limit compartilhado (8.4) e unificação TypeScript (8.6) entram
oportunisticamente, junto de quem tocar naquelas áreas.
