# Beyond The Lab — Landing page

Landing page do curso de inglês **Beyond The Lab** (inglês para profissionais e estudantes da Reprodução Humana), construída a partir do protótipo do Figma.

## Stack

- **Next.js 16** (App Router) + **React 18**
- **Tailwind CSS 3**
- **TypeScript** configurado (`tsconfig.json`); os componentes ainda são `.jsx`, as views e os dados são `.tsx`/`.ts`
- Fonte: **Geist**, auto-hospedada via `next/font/google` (sem `<link>` para o Google Fonts)
- Deploy: **Vercel**

## Rodando o projeto

```bash
npm ci           # instala exatamente o que está no package-lock.json
npm run dev      # sobe em http://localhost:3000
npm run build    # build de produção em /.next
npm start        # serve o build de produção
```

## Rotas

| Rota                      | Arquivo                              |
|---------------------------|--------------------------------------|
| `/`                       | `app/page.jsx`                       |
| `/conteudo-programatico`  | `app/conteudo-programatico/page.jsx` |
| `/termos`                 | `app/termos/page.jsx`                |
| `/privacidade`            | `app/privacidade/page.jsx`           |

As quatro são estáticas (`○ prerendered` no `next build`) e têm `metadata` própria.

## Estrutura

```
app/                        # App Router: rotas, layout e CSS global
  layout.jsx                # <html>, metadata/OG, fonte Geist, bootstrap do scroll-reveal
  page.jsx                  # landing — monta as seções na ordem dentro de <main>
  globals.css               # base Tailwind + tokens de motion (--motion-*, --ease-*)
  conteudo-programatico/
    page.jsx                # rota do conteúdo programático (metadata própria)

src/
  components/               # componentes de seção e UI
    Navbar.jsx
    Hero.jsx                # "Desenvolva o inglês..."
    PainPoints.jsx          # "Seu inglês acompanha sua carreira?"
    Personas.jsx            # "Feito para profissionais e estudantes..."
    Skills.jsx              # "Habilidades para a sua rotina real"
    Timeline.jsx            # "Do cadastro a primeira aula"
    Teacher.jsx             # "Quem ensina entende seu cenário"
    Pricing.jsx             # "O curso completo pra transformar seu inglês."
    Faq.jsx                 # "Perguntas frequentes"
    FinalCta.jsx            # "Prepare-se para crescer..."
    Footer.jsx
    PageHeader.jsx          # cabeçalho das páginas internas
    ScrollReveal.jsx        # observer que dispara as classes .reveal
    Icons.jsx               # ícones SVG inline
  views/
    SyllabusPage.tsx        # corpo da rota /conteudo-programatico
  data/
    modules.ts              # módulos do conteúdo programático
  hooks/
    useScrollReveal.js      # IntersectionObserver do reveal

public/
  assets/                   # imagens extraídas do protótipo (hero, fotos, ilustrações)
  og.png                    # imagem de Open Graph (placeholder)
  favicon.svg
```

## Renders de validação (`shot.mjs`)

`shot.mjs` é a ferramenta de validação visual do projeto: sobe o dev server na porta
3000, abre as duas rotas em desktop (1440×1024) e mobile (390×844) e grava um PNG por
seção em `design/`. É o que garante que um refactor não deslocou layout.

```bash
node shot.mjs
```

O que ele faz:

- roda com `deviceScaleFactor: 1` e `reducedMotion: 'reduce'` — o scroll-reveal precisa
  estar assentado no print, senão a comparação pega opacidade em transição
- gera, por viewport: `render_<viewport>_full.png`, `render_<viewport>_fold.png`, um PNG
  por seção da landing (`render_<viewport>_s0N_<nome>.png`) e os dois da rota
  `/conteudo-programatico`
- mede `scrollWidth` vs `innerWidth` e imprime `⚠️ OVERFLOW-X` quando há scroll
  horizontal — bug de layout é medido, não notado de olho

Para comparar com um baseline, copie os `design/render_*.png` para fora antes de rodar
de novo — o script sobrescreve no lugar. `design/` é gitignored.

> `design/SPEC.md` está desatualizado — não use como referência.

## Variáveis de ambiente

Copie o `.env.example` para `.env.local` e preencha. `.env*` é gitignored (menos o
próprio `.env.example`). Na Vercel, as duas do Supabase vão em **Settings → Environment
Variables**, marcadas para Production, Preview e Development.

| Variável                    | Obrigatória | Uso |
|-----------------------------|-------------|-----|
| `SUPABASE_URL`              | sim         | Project URL do Supabase. Usada só no servidor, por `src/lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | sim         | chave `service_role`. **Segredo.** Ignora RLS — é o que permite `safras`, `grupos`, `pessoas` e `inscricoes` não terem nenhuma policy. Sem `NEXT_PUBLIC_`, jamais no cliente |
| `RESEND_API_KEY`            | não         | chave da API do Resend. **Segredo.** Usada só por `src/lib/email.ts`. Sem ela a inscrição grava normalmente e o e-mail não sai — ver *E-mails transacionais* |
| `EMAIL_REMETENTE`           | não         | remetente dos dois e-mails. O domínio precisa estar verificado no Resend |
| `EMAIL_ADMIN`               | não         | caixa da Giovanna. Destinatário da notificação **e** `reply_to` da confirmação |
| `NEXT_PUBLIC_SITE_URL`      | não         | base absoluta de OG/Twitter (`metadataBase`). Sem ela, cai em `VERCEL_PROJECT_PRODUCTION_URL` (injetada pela Vercel) e, fora da Vercel, em `http://localhost:3000` |

Sem as duas do Supabase o `npm run build` **falha**, e é de propósito: a landing lê preço,
duração e data de início do banco, e não existe fallback honesto para "quanto custa" — a
D-13 proíbe literal de preço, duração ou data inclusive como fallback. Uma página que não
consegue afirmar o preço não deve ser publicada, e o momento de descobrir isso é o deploy,
não o primeiro visitante. Build que falha é deploy que não acontece: a versão anterior
continua no ar com o último preço bom. Se o build passar e as variáveis sumirem depois, o
POST em `/api/inscricao` responde 500 e registra o motivo no log do servidor.

As três do e-mail são opcionais no sentido estrito de que a aplicação sobe e **grava
inscrições** sem elas — o que se perde é a notificação. Faltando qualquer uma, o log
registra qual, e ninguém fica sabendo da inscrição além do banco. Na prática, em
produção, configure as três.

## Inscrição

O formulário é uma **modal**, não uma seção. Antes vivia em `#lista`; essa âncora não
existe mais.

| Arquivo | Papel |
|---|---|
| `src/components/InscricaoProvider.jsx` | estado único da modal + integração com o histórico. Fica no `app/layout.jsx`, então vale para todas as rotas |
| `src/components/InscricaoModal.jsx` | a modal: formulário, tela de sucesso, foco preso, trava de scroll |
| `src/components/CtaInscricao.jsx` | o `<button>` que abre a modal. **Um único ponto de uso** — o "Garantir minha vaga" de dentro do card de preço. Ver *Os oito CTAs* logo abaixo |
| `src/components/LinkListaEspera.jsx` | a âncora `<a href="#planos">` dos outros sete CTAs: rola até o card de preço, não abre a modal |
| `src/config/curso.ts` | só links e formatação. **As datas e o valor vêm do banco** — ver a seção "Safras" |
| `src/lib/telefone.ts` | máscara, DDDs válidos e E.164. Usado pelo formulário **e** pela API, para os dois não discordarem |
| `app/api/inscricao/route.ts` | validação com Zod e escrita em `pessoas` + `inscricoes`, numa transação só, pela RPC `criar_inscricao` |
| `app/api/safra-ativa/route.ts` | diz à modal se há safra aberta, e com quais datas e valor |

### Os oito CTAs, e por que sete deles não abrem a modal

O fluxo é de **duas etapas**, de propósito:

1. os sete CTAs espalhados pela página — navbar (desktop e menu mobile), Hero,
   PainPoints, Teacher, FinalCta e o da rota `/conteudo-programatico` — usam
   `LinkListaEspera` e **rolam até o card de preço** (`#planos`);
2. só o "Garantir minha vaga" de dentro desse card usa `CtaInscricao` e **abre o
   formulário**.

O motivo é a informação que a decisão precisa: quem clica no CTA do topo ainda não viu o
preço. Mandar a modal direto dali pularia justamente o dado que a pessoa precisa ter para
decidir, e o cadastro chegaria de alguém que não sabe quanto custa.

O primeiro salto é uma **âncora de verdade** (`<a href>`), não um handler de scroll: ela
funciona com JS desligado ou ainda não hidratado, e o link é copiável e compartilhável. O
scroll suave e o recuo do header sticky vêm do CSS (`scroll-behavior` e
`scroll-padding-top`), que já respeita `prefers-reduced-motion`. O alvo tem `tabIndex={-1}`
e recebe `focus({ preventScroll: true })` porque navegador nenhum é obrigado a focar o
destino de um fragmento — sem isso, quem navega por teclado clica no CTA do rodapé, a
página rola, e o Tab seguinte continua lá no topo.

O raciocínio inteiro está no cabeçalho de `src/components/LinkListaEspera.jsx`.

### O que a rota faz, e o que o banco garante

- As tabelas têm **RLS ligada e nenhuma policy**, de propósito — `safras`, `grupos`,
  `pessoas` e `inscricoes`, todas. Todo o acesso é server-side com a `service_role`, que
  ignora RLS, e há `revoke all ... from anon, authenticated` como cinto além do
  suspensório. Não crie policy — isso abriria as tabelas para a chave `anon`.
- E-mail duplicado **não é erro**: HTTP 200, `ok: true`, mais `duplicada: true` e uma
  mensagem que diz que aquele e-mail já tem cadastro. Antes a resposta era idêntica à de
  sucesso, para o formulário não virar um oráculo de "este e-mail já é cadastrado?" — foi
  revertido de propósito, porque o que a tela de sucesso promete mudou: com pagamento no
  fluxo, "Pronto!" para quem se cadastra de novo achando que garantiu a vaga é informação
  falsa a quem está comprando. O e-mail passou a ser consultável, e as contenções são o
  rate limit por IP e a mensagem, que não revela mais nada além disso — sem nome, sem
  data, sem status, sem posição na fila. **Duplicata continua não disparando e-mail**: é
  outra decisão, com outra razão, e ela ficou inteira.
- **Consentimento** é `z.literal(true)` no servidor: sem ele, 400. É a base legal da
  coleta (LGPD art. 7º, I), então não pode ser opcional nem vir pré-marcado.
- O telefone é gravado em **E.164** (`+5521999999999`); a máscara `(XX) XXXXX-XXXX`
  existe só na interface.
- `status` é uma máquina de estados fechada, declarada no CHECK
  `inscricoes_status_check` da migração `009`:

  ```
  lista_espera ──► pendente_pagamento ──► confirmada ──► ativa
                                                           │
                             ┌─────────────────────────────┤
                             ▼                             ▼
                       inadimplente ──► cancelada      concluida
  ```

  Ele anda sempre em par com `safra_id`, e um segundo CHECK obriga os dois a contarem a
  mesma história: `safra_id is null` ⟺ `status = 'lista_espera'`. Não existe `aprovada`
  nem `rejeitada` — não há entrevista, análise nem triagem, e quem conclui o checkout
  está dentro.

  **⚠️ No corte 1, tudo a partir de `pendente_pagamento` é inalcançável de propósito.** O
  checkout ainda não existe, então "safra aberta" não significaria nada: gravaria gente
  em `pendente_pagamento` sem nenhuma sessão de pagamento criada e sem caminho para sair
  — um estado sem saída inventado para não mexer numa flag. Por isso o corte 1 sobe com
  **`inscricoes_abertas = false` em toda safra**, e **todo mundo cai em `lista_espera`**.
  O domínio já contempla os outros estados para que as migrações não precisem ser
  revisitadas quando o pagamento entrar.
- **Quem decide o modo é o servidor, não a modal.** A rota consulta o banco antes de
  gravar; o que o cliente afirmar no corpo do POST é ignorado. A modal também consulta,
  mas só para saber o que desenhar. E o sinal é `inscricoes_abertas`, **não** "veio
  safra": pela D-13 a consulta devolve a safra mais recente sempre, aberta ou não, para
  que fechar as inscrições não apague preço e data do site junto.
- **Falha ao consultar a safra degrada para lista de espera**, nunca para tela de erro:
  banco fora do ar, contagem que não veio ou schema divergente ainda permitem gravar o
  contato de alguém interessada, e é isso que não pode ser perdido. O contrário — prometer
  vaga numa safra que não foi possível confirmar — é que não se pode fazer.
- Os campos de perfil (`nivel_ingles`, `curso`, `periodo`, `disponibilidade`) são
  **obrigatórios no Zod e nullable no banco**: as linhas trazidas da base antiga pela
  migração `010` não os têm, e um `not null` na coluna faria a migração falhar. O banco
  valida o *domínio* dos valores; a API valida a *obrigatoriedade*.
- Há um honeypot (campo `website`, escondido por CSS) e um rate limit por IP em memória
  — aproximado em serverless, por instância.

O SQL das migrações está em `supabase/migrations/` e é rodado à mão no SQL Editor do
Supabase, na ordem numérica.

## E-mails transacionais

Cada inscrição nova dispara **dois** e-mails, pelo **Resend** (`src/lib/email.ts`, chamado
por `app/api/inscricao/route.ts`):

| Para | Assunto | Conteúdo |
|------|---------|----------|
| `EMAIL_ADMIN` — a Giovanna | `Nova inscrição: [nome]` | todos os dados da inscrição, WhatsApp clicável, safra e horário de chegada |
| quem se inscreveu | `Inscrição recebida` ou `Você está na lista de espera` | confirmação, recapitulação do que informou, próximos passos, **a semana** de início e Instagram |

A data de início nunca sai seca no e-mail, pelo mesmo motivo da landing (D-14): a frase é
"na primeira semana de setembro", derivada de `data_inicio_aulas`. Cada grupo começa num
dia diferente da mesma semana, então um `dd/mm/yyyy` seria uma promessa que o produto não
faz para a maior parte das inscritas.

Ambos saem de `EMAIL_REMETENTE`, com `reply_to` apontando para `EMAIL_ADMIN` — responder
qualquer um dos dois cai no Gmail dela.

**Falha de envio não bloqueia inscrição, em nenhuma hipótese.** Nenhuma função de
`email.ts` lança: erro de rede, chave inválida ou domínio não verificado viram log no
servidor e param ali. A inscrição já foi gravada quando o envio começa, e o dado da
pessoa é o que importa — perder o aviso é ruim, perder a inscrição é inaceitável.

Três detalhes de comportamento que não são óbvios:

- **Duplicata não dispara e-mail.** A resposta HTTP de duplicata mudou (ver a seção
  *Inscrição*); o e-mail não. Eram duas coisas juntas na mesma decisão por acidente: a
  primeira existia para não revelar quem está na lista, a segunda existe para não mandar
  mensagem que ninguém pediu — bastaria reenviar o formulário dez vezes para a pessoa
  receber dez e-mails, e a Giovanna também. Essa razão continua inteira.
- **Honeypot não dispara nada** — ele nem chega ao banco.
- **O disparo usa `after` do `next/server`**, não uma promessa solta. Em serverless a
  função pode ser congelada assim que devolve a resposta, e uma promessa não aguardada
  morreria no meio do envio. O `after` roda depois da resposta, com a Vercel mantendo a
  execução viva até terminar — a pessoa vê a tela de sucesso sem esperar o Resend.

O HTML é montado à mão, com tabela e estilo inline, **sem biblioteca de template e sem
nenhuma imagem**. Cliente de e-mail não roda flexbox, grid nem variável CSS, e bloqueia
imagem por padrão — logo remoto viraria retângulo vazio. As cores vêm dos tokens de
`tailwind.config.js`, copiadas como literais porque não há como referenciar classe
utilitária dentro de um e-mail. Vai junto uma versão em texto puro, que ajuda na
entregabilidade e cobre quem lê sem HTML.

## Safras

> Esta seção é para quem administra o curso, não para quem programa. Tudo aqui se faz
> pelo **Supabase Studio**, sem mexer em código e sem publicar nada.

### O que é uma safra

Uma **safra** é uma leva de alunas, com identidade própria: data de início das aulas,
data da primeira cobrança, valor da mensalidade, duração e a janela de inscrição. Hoje
existe uma, a "Turma Setembro 2026". Quando chegar a hora da próxima, ela é uma **linha
nova** na tabela — nunca se edita a safra atual para transformá-la na seguinte, senão
o registro de quem entrou em qual safra se perde.

**Safra não é a mesma coisa que grupo.** O **grupo** é a divisão de horário *dentro* de
uma safra ("quarta, 19:00"). Ele não tem data, não tem preço e não tem duração próprios:
o pool de aulas começa no mesmo dia para todo mundo da safra, e a divisão por dia da
semana é logística de agenda, não de contrato. Grupo virou **tabela própria** (`grupos`)
na migração `006` — ver "Grupos" mais abaixo.

### Abrir e fechar as inscrições

No Studio, abra **Table Editor → `safras`**. A coluna que controla tudo é
**`inscricoes_abertas`**:

- **marcada (`true`)** → o site mostra o formulário de inscrição normal, com a data da
  primeira cobrança que estiver nessa linha;
- **desmarcada (`false`)** → o site passa a mostrar **lista de espera**: a pessoa
  continua deixando todos os dados, mas sem menção a valor nem a data, e o botão vira
  "Quero ser avisada".

A mudança vale **na hora**. Não precisa publicar nada, não precisa avisar ninguém — a
próxima pessoa que abrir a modal já vê o outro modo.

> ⚠️ **No corte 1 a resposta certa é `false` em todas as safras**, e isso não é
> esquecimento. Sem o checkout, marcar `true` gravaria gente em `pendente_pagamento` sem
> nenhuma sessão de pagamento criada e sem caminho para sair. Ver a máquina de estados na
> seção *Inscrição*.

**A flag governa só o CTA, não a vitrine.** Com as inscrições fechadas, a landing
continua mostrando preço, duração e mês de início — são duas perguntas diferentes.
"Quanto custa e quando começa" é informação de vitrine e não pode sumir da página;
"dá para comprar agora" é estado de operação. Amarradas na mesma flag, fechar as
inscrições apagaria o preço do site junto.

### Só uma safra aberta por vez

O banco **recusa** deixar duas safras com `inscricoes_abertas` marcado ao mesmo tempo.
Se você tentar, o Studio devolve um erro de índice duplicado (`safras_uma_aberta_idx`)
e não salva.

Isso é proteção, não limitação. Com duas safras abertas o site não teria como saber em
qual inscrever as pessoas, e a cobrança automática poderia cobrar alguém na data da
safra errada.

**Para trocar de safra: desmarque a atual primeiro, salve, depois marque a nova.**

### Criar uma safra nova

**Table Editor → `safras` → Insert row**. Preencha:

| Campo | O que é | Exemplo |
|---|---|---|
| `nome` | como você chama a safra | `Turma Março 2027` |
| `slug` | o mesmo nome em minúsculas, sem acento, com hífen | `marco-2027` |
| `data_inicio_aulas` | primeiro dia de aula | `2027-03-01` |
| `data_primeira_cobranca` | quando a primeira mensalidade é cobrada | `2027-02-25` |
| `valor_mensal` | mensalidade em reais | `299.99` |
| `duracao_meses` | quantos meses o programa dura | `6` |
| `vagas_total` | teto de inscritas, ou **em branco** para sem limite | `20` |
| `inscricoes_abertas` | deixe **desmarcado** por ora | — |

As datas vão no formato **ano-mês-dia**. O valor usa **ponto**, não vírgula.

`vagas_total` em branco (`null`) significa **sem limite**, e não "zero". Ele é limite
**mole**: o sistema conta antes de abrir o checkout e recusa se estourou, mas não há
trava transacional — duas pessoas fechando o checkout no mesmo segundo pela última vaga é
possível e aceito. Na escala do curso isso se resolve com uma conversa.

Duas coisas que o banco recusa, de propósito:

- **cobrança depois do início das aulas** — quase sempre é engano de digitação;
- **`slug` repetido** — dois `marco-2027` tornariam impossível saber qual é qual.

Depois de criada e conferida, desmarque `inscricoes_abertas` da safra antiga e marque a
nova. A partir daí, toda inscrição nova entra na safra nova.

> ⚠️ A data de início da Turma Setembro 2026 está como **1 de setembro**, que era
> provisório. Quando o dia exato for definido, é só editar essa célula. A landing não
> imprime esse dia: ela diz "na primeira semana de setembro", derivado dele (D-14).

### Quem se inscreveu

Cada inscrição está espalhada por **duas** tabelas, de propósito: `pessoas` guarda o
contato (nome, e-mail, telefone), que é o mesmo em toda safra; `inscricoes` guarda o
vínculo, o estado e o **perfil naquela safra** — quem estava no 3º período em janeiro
está no 5º em julho.

O que interessa para dividir horários está em `inscricoes`:

- **`nivel_ingles`** — `basico`, `intermediario` ou `avancado` (autodeclarado pela
  aluna, não é resultado de prova)
- **`disponibilidade`** — os dias em que ela pode assistir, ex.: `{seg,qua,sex}`
- **`curso`** e **`periodo`** — o que ela estuda e em que fase está

Para **filtrar por dia** no Studio, vá em **SQL Editor** e rode:

```sql
select p.nome, p.email, i.nivel_ingles, i.disponibilidade, i.status
from public.inscricoes i
join public.pessoas p on p.id = i.pessoa_id
where i.disponibilidade @> array['ter']
order by i.nivel_ingles, p.nome;
```

Trocando `'ter'` pelo dia que interessar (`seg`, `ter`, `qua`, `qui`, `sex`). Para quem
pode **dois dias específicos**, some os dois no array:

```sql
where i.disponibilidade @> array['ter','qui']
```

### Grupos

`grupos` é uma tabela: cada linha é um horário de uma safra (`safra_id`, `dia_semana`,
`horario`, `capacidade`, `ativo`). Alocar uma aluna é apontar `inscricoes.grupo_id` para
uma dessas linhas, e o banco tem um **trigger** que recusa alocar alguém num grupo de
outra safra — sem ele, um erro colocaria uma aluna de setembro num horário de janeiro e
nada quebraria.

`horario` é texto (`19:00`) porque é rótulo de agenda, não instante: as aulas são no Meet
e todas as alunas estão no Brasil. `capacidade` em branco = sem limite, mesma convenção
de `vagas_total`.

**No corte 1 não há o que alocar.** Com `inscricoes_abertas = false` em toda safra, toda
inscrição nova entra em `lista_espera` com `safra_id` vazio — e um grupo pertence a uma
safra, então uma linha sem safra não pode ter horário. A tela de arrastar alunas entre
horários é do painel, que ainda não existe.

> ⚠️ A coluna `grupo` de texto livre, onde antes se escrevia "Grupo A" à mão, **não foi
> migrada**. Ela ficou em `waitlist_legado`. Eram valores digitados à mão, sem
> correspondência garantida com nenhum horário real de agora, em linhas que hoje estão
> todas na lista de espera. Antes de apagar aquela tabela, vale olhar o que tem lá: se o
> campo foi usado, aquilo é informação de alocação que não se recupera depois.

### Quem está na lista de espera

São as linhas com **`status = 'lista_espera'`** — elas têm `safra_id` vazio, porque
entraram quando não havia safra aberta. Como no corte 1 todo mundo cai aí, é essa a lista
inteira. Quando a próxima safra abrir, é ela que vale a pena avisar primeiro:

```sql
select p.nome, p.email, p.telefone,
       i.nivel_ingles, i.disponibilidade, i.created_at
from public.inscricoes i
join public.pessoas p on p.id = i.pessoa_id
where i.status = 'lista_espera'
order by i.created_at;
```

### E o painel?

Tudo isto vai virar tela no painel, no corte 3. Até lá, é pelo Studio mesmo.

## Tema

Cores centrais (em `tailwind.config.js`):

| Token        | Hex        | Uso                          |
|--------------|------------|------------------------------|
| `ink`        | `#022D57`  | títulos e texto escuro       |
| `body`       | `#345372`  | parágrafos                   |
| `brand`      | `#F76C93`  | rosa da marca (gradiente)    |
| `cobalt`     | `#114883`  | badge azul / ícone do FAQ    |
| `rose-100`   | `#FFE8EF`  | fundos rosa claros           |

## Documentos legais (`/termos` e `/privacidade`)

O conteúdo mora em `src/content/termos.jsx` e `src/content/privacidade.jsx` — texto e
estrutura, sem nenhuma classe de CSS. A apresentação inteira está em
`src/components/DocumentoLegal.jsx`.

> **Os dois textos foram homologados por advogado.** O aviso de rascunho que ficava no
> topo das duas páginas foi removido junto com essa homologação. Mudança de redação volta
> a ser assunto jurídico: passa pela revisão antes de virar commit.

**Antes do push:** os dois documentos têm marcadores `[[PREENCHER: ...]]` que renderizam
destacados na tela. Liste todos com:

```bash
grep -rn "PREENCHER" src
```

São quatro dados, repetidos entre os arquivos: nome civil completo, CPF, endereço completo
e e-mail de contato. Nenhum deles pode ir para produção em branco.

Ao alterar a frase do consentimento, mexa em `src/config/consentimento.ts` e em mais lugar
nenhum: modal e API leem de lá, e o texto exato é gravado em `inscricoes.consent_text` a
cada inscrição.

## Imagem de compartilhamento (`public/og.png`)

É a prévia que aparece quando o link é colado no WhatsApp, Instagram ou LinkedIn — na
prática, a primeira coisa que a maioria vê do site. **O arquivo atual é placeholder cinza e
precisa ser substituído pela arte da cliente.**

Especificação do arquivo definitivo:

| Item        | Valor                                                              |
|-------------|--------------------------------------------------------------------|
| Dimensões   | **1200 × 630 px** (proporção 1,91:1)                               |
| Formato     | PNG ou JPG — não use WebP nem SVG, o WhatsApp não renderiza        |
| Peso        | abaixo de 300 KB; acima disso o WhatsApp costuma desistir da prévia |
| Caminho     | `public/og.png` (substituir o arquivo, sem renomear)               |

O requisito de conteúdo é um só, e é o que mais se erra: **o nome do curso tem que ser
legível em miniatura.** A prévia do WhatsApp aparece com poucos centímetros de largura, e
uma arte bonita em tamanho real vira borrão ali. Na prática: título ocupando boa parte da
altura, alto contraste com o fundo, e nada de texto secundário fino. Confira reduzindo a
imagem a ~300px de largura na tela — se o nome não se lê, o público também não vai ler.

A dimensão atual do placeholder já está correta (1200×630); o que falta é a arte. Nenhuma
mudança de código é necessária ao substituí-lo — as quatro rotas já apontam para
`/og.png` no `openGraph` e no `twitter`.

> O cache de prévia do WhatsApp é agressivo. Depois de trocar a imagem, teste com um link
> que ainda não circulou (por exemplo `?v=2` no fim da URL) para não ver a versão antiga.

## Vídeo da professora (`public/assets/teacher.mp4`)

O vídeo é **versionado no repositório de propósito**. São ~11 MB, um arquivo só, servido
pela Vercel junto com o resto do `public/`. Storage externo (S3, Mux, Cloudinary) resolveria
o mesmo problema cobrando uma conta, uma chave e um ponto de falha a mais — desproporcional
para um único asset desse tamanho, que muda uma vez por ano. Se um dia forem vários vídeos,
ou vídeos bem maiores, aí sim vale reconsiderar.

O `.gitignore` ignora `*.mp4` de forma geral e abre **uma exceção nomeada** para este
arquivo:

```
*.mp4
!public/assets/teacher.mp4
```

Sem essa linha o vídeo não entra no commit e a seção "Sobre a professora" sobe quebrada em
produção. O comentário no `.gitignore` explica isso — não "limpe" a exceção.

**O master sem compressão está fora do repo**, em `~/beyondthelab-assets/teacher.mp4`
(71 MB, 1080×1920, ~9,5 Mbps — export direto da edição, sem tratamento para web). Ele não é
versionado e não deve ser: quem precisar regerar o arquivo publicado parte dele.

Comando que gerou a versão em produção:

```bash
ffmpeg -i ~/beyondthelab-assets/teacher.mp4 \
  -vf "scale=720:1280:flags=lanczos" \
  -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  public/assets/teacher.mp4
```

Duas escolhas do comando que não são opcionais:

- **`-movflags +faststart`** move o índice (`moov`) para o começo do arquivo. Sem ele o
  navegador precisa baixar o vídeo inteiro antes de tocar o primeiro frame.
- **720×1280** porque o elemento exibe em 317×626 CSS px — 1080 de largura era desperdício
  puro, e o mesmo orçamento de bits distribuído em menos pixels deixa as legendas queimadas
  mais nítidas, não menos.

O `-crf` controla o tamanho: mais alto = arquivo menor e mais artefato. 28 foi o valor que
coube abaixo de 12 MB mantendo as legendas indistinguíveis do original no tamanho real de
exibição. Mexeu no vídeo? Confira o peso e olhe uma legenda antes de commitar.

O áudio é preservado (AAC 128k estéreo) — o play é com som, o vídeo não é decorativo. As
legendas são **queimadas na imagem** pela edição, então não há `<track>`/`.vtt` para expor.

## Observações
- As imagens em `public/assets/` foram extraídas do export do Figma. Para produção, vale
  substituir por exports otimizados (WebP) direto do Figma.
- `public/og.png` ainda é placeholder — especificação do arquivo definitivo na seção
  *Imagem de compartilhamento*, acima.
- Os textos dos accordions do FAQ foram redigidos como placeholder plausível — ajuste
  conforme o conteúdo oficial.
