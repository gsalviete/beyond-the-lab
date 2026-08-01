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
| `SUPABASE_SERVICE_ROLE_KEY` | sim         | chave `service_role`. **Segredo.** Ignora RLS — é o que permite a tabela `waitlist` não ter nenhuma policy. Sem `NEXT_PUBLIC_`, jamais no cliente |
| `NEXT_PUBLIC_SITE_URL`      | não         | base absoluta de OG/Twitter (`metadataBase`). Sem ela, cai em `VERCEL_PROJECT_PRODUCTION_URL` (injetada pela Vercel) e, fora da Vercel, em `http://localhost:3000` |

Sem as duas do Supabase o site sobe normalmente; só o POST em `/api/waitlist` responde
500 e registra o motivo no log do servidor.

## Inscrição

O formulário é uma **modal**, não uma seção. Antes vivia em `#lista`; essa âncora não
existe mais.

| Arquivo | Papel |
|---|---|
| `src/components/InscricaoProvider.jsx` | estado único da modal + integração com o histórico. Fica no `app/layout.jsx`, então vale para todas as rotas |
| `src/components/InscricaoModal.jsx` | a modal: formulário, tela de sucesso, foco preso, trava de scroll |
| `src/components/CtaInscricao.jsx` | o `<button>` que abre a modal. **Todo CTA usa este componente** — nenhum é `<a href>` |
| `src/config/curso.ts` | só links e formatação. **As datas e o valor vêm do banco** — ver a seção "Turmas" |
| `src/lib/telefone.ts` | máscara, DDDs válidos e E.164. Usado pelo formulário **e** pela API, para os dois não discordarem |
| `app/api/waitlist/route.ts` | validação com Zod e insert na tabela `waitlist` via PostgREST |
| `app/api/turma-ativa/route.ts` | diz à modal se há turma aberta, e com quais datas e valor |

- A tabela tem **RLS ligada e nenhuma policy**, de propósito: todo o acesso é
  server-side com a `service_role`, que ignora RLS. Não crie policy — isso abriria a
  tabela para a chave `anon`.
- E-mail duplicado responde **sucesso**, não erro: a pessoa está na lista, e o
  formulário não pode virar um oráculo de "este e-mail já é cadastrado?".
- **Consentimento** é `z.literal(true)` no servidor: sem ele, 400. É a base legal da
  coleta (LGPD art. 7º, I), então não pode ser opcional nem vir pré-marcado.
- O telefone é gravado em **E.164** (`+5521999999999`); a máscara `(XX) XXXXX-XXXX`
  existe só na interface.
- `payment_choice` registra qual botão foi clicado (`agora` / `depois`). **Hoje os dois
  caminhos gravam igual** — o Stripe entra depois, e o ponto de ramificação está
  marcado com `TODO: Prompt B2` em `InscricaoModal.jsx`. Sem turma aberta o campo é
  **descartado** e gravado como `depois`: não há cobrança a adiantar.
- `status` recebe `pendente` (turma aberta) ou `lista_espera` (nenhuma turma aberta).
  Os outros valores do CHECK existem para a integração do Stripe não precisar de nova
  migração.
- **Quem decide o modo é o servidor, não a modal.** A rota consulta a turma aberta no
  banco antes de gravar; o que o cliente afirmar no corpo do POST é ignorado. A modal
  também consulta, mas só para saber o que desenhar.
- Os campos de perfil (`nivel_ingles`, `curso`, `periodo`, `disponibilidade`) são
  **obrigatórios no Zod e nullable no banco**: as linhas anteriores à migração não os
  têm, e um `not null` na coluna faria o `ALTER` falhar. O banco valida o *domínio* dos
  valores; a API valida a *obrigatoriedade*.
- Há um honeypot (campo `website`, escondido por CSS) e um rate limit por IP em memória
  — aproximado em serverless, por instância.

O SQL das migrações está em `supabase/migrations/` e é rodado à mão no SQL Editor do
Supabase, na ordem numérica.

## Turmas

> Esta seção é para quem administra o curso, não para quem programa. Tudo aqui se faz
> pelo **Supabase Studio**, sem mexer em código e sem publicar nada.

### O que é uma turma

Uma **turma** é uma safra de alunas, com identidade própria: data de início das aulas,
data da primeira cobrança, valor da mensalidade, duração e a janela de inscrição. Hoje
existe uma, a "Turma Setembro 2026". Quando chegar a hora da próxima, ela é uma **linha
nova** na tabela — nunca se edita a turma atual para transformá-la na seguinte, senão
o registro de quem entrou em qual turma se perde.

**Turma não é a mesma coisa que grupo.** O **grupo** ("Grupo A", "Grupo B") é a divisão
de horário *dentro* de uma turma. Ele é só um rótulo: não tem data, não tem cobrança e
não muda nada no sistema. Quem preenche o grupo é você, à mão, depois que as inscrições
chegam — ver "Montando os grupos" mais abaixo.

### Abrir e fechar as inscrições

No Studio, abra **Table Editor → `turmas`**. A coluna que controla tudo é
**`inscricoes_abertas`**:

- **marcada (`true`)** → o site mostra o formulário de inscrição normal, com a data da
  primeira cobrança que estiver nessa linha;
- **desmarcada (`false`)** → o site passa a mostrar **lista de espera**: a pessoa
  continua deixando todos os dados, mas sem menção a valor nem a data, e o botão vira
  "Quero ser avisada".

A mudança vale **na hora**. Não precisa publicar nada, não precisa avisar ninguém — a
próxima pessoa que abrir a modal já vê o outro modo.

### Só uma turma aberta por vez

O banco **recusa** deixar duas turmas com `inscricoes_abertas` marcado ao mesmo tempo.
Se você tentar, o Studio devolve um erro de índice duplicado (`turmas_uma_aberta_idx`)
e não salva.

Isso é proteção, não limitação. Com duas turmas abertas o site não teria como saber em
qual inscrever as pessoas, e a cobrança automática (que entra no Prompt B2) poderia
cobrar alguém na data da turma errada.

**Para trocar de turma: desmarque a atual primeiro, salve, depois marque a nova.**

### Criar uma turma nova

**Table Editor → `turmas` → Insert row**. Preencha:

| Campo | O que é | Exemplo |
|---|---|---|
| `nome` | como você chama a turma | `Turma Março 2027` |
| `slug` | o mesmo nome em minúsculas, sem acento, com hífen | `marco-2027` |
| `data_inicio_aulas` | primeiro dia de aula | `2027-03-01` |
| `data_primeira_cobranca` | quando a primeira mensalidade é cobrada | `2027-02-25` |
| `valor_mensal` | mensalidade em reais | `299.99` |
| `duracao_meses` | quantos meses o programa dura | `6` |
| `inscricoes_abertas` | deixe **desmarcado** por ora | — |

As datas vão no formato **ano-mês-dia**. O valor usa **ponto**, não vírgula.

Duas coisas que o banco recusa, de propósito:

- **cobrança depois do início das aulas** — quase sempre é engano de digitação;
- **`slug` repetido** — dois `marco-2027` tornariam impossível saber qual é qual.

Depois de criada e conferida, desmarque `inscricoes_abertas` da turma antiga e marque a
nova. A partir daí, toda inscrição nova entra na turma nova.

> ⚠️ A data de início da Turma Setembro 2026 está como **1 de setembro**, que era
> provisório. Quando o dia exato for definido, é só editar essa célula.

### Montando os grupos

Cada inscrição na tabela `waitlist` traz o que você precisa para dividir os horários:

- **`nivel_ingles`** — `basico`, `intermediario` ou `avancado` (autodeclarado pela
  aluna, não é resultado de prova)
- **`disponibilidade`** — os dias em que ela pode assistir, ex.: `{seg,qua,sex}`
- **`curso`** e **`periodo`** — o que ela estuda e em que fase está

Para **filtrar por dia** no Studio, vá em **SQL Editor** e rode:

```sql
select name, email, nivel_ingles, disponibilidade, grupo
from public.waitlist
where disponibilidade @> array['ter']
order by nivel_ingles, name;
```

Trocando `'ter'` pelo dia que interessar (`seg`, `ter`, `qua`, `qui`, `sex`). Para quem
pode **dois dias específicos**, some os dois no array:

```sql
where disponibilidade @> array['ter','qui']
```

Decidido o horário, escreva o rótulo na coluna **`grupo`** de cada pessoa — direto no
Table Editor. Pode ser o que fizer sentido: `Grupo A`, `Terça 19h`, o que for. **O campo
`grupo` não afeta cobrança nem nada automático**; ele existe só para você se organizar.

### Quem está na lista de espera

São as linhas com **`status = 'lista_espera'`** — elas têm `turma_id` vazio, porque
entraram quando não havia turma aberta. Quando você abrir a próxima turma, é essa lista
que vale a pena avisar primeiro:

```sql
select name, email, phone, nivel_ingles, disponibilidade, created_at
from public.waitlist
where status = 'lista_espera'
order by created_at;
```

### E o painel?

Tudo isto vai virar tela no **Prompt C**. Até lá, é pelo Studio mesmo.

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

> **Os dois são rascunhos não revisados por advogado.** Precisam de revisão profissional
> antes de o site operar com cobrança recorrente. O aviso está no topo de cada arquivo e
> também visível na própria página.

**Antes do push:** os dois documentos têm marcadores `[[PREENCHER: ...]]` que renderizam
destacados na tela. Liste todos com:

```bash
grep -rn "PREENCHER" src
```

São quatro dados, repetidos entre os arquivos: nome civil completo, CPF, endereço completo
e e-mail de contato. Nenhum deles pode ir para produção em branco.

Ao alterar a frase do consentimento, mexa em `src/config/consentimento.ts` e em mais lugar
nenhum: modal e API leem de lá, e o texto exato é gravado em `waitlist.consent_text` a cada
inscrição.

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

## Observações

- **Vídeo da professora:** `*.mp4` é gitignored (o arquivo tinha 71 MB). O `Teacher.jsx`
  exibe hoje um frame estático, `public/assets/teacher-poster.jpg`. Quando o storage
  externo estiver configurado, restaurar o `<video>` — o `TODO` está no componente.
- As imagens em `public/assets/` foram extraídas do export do Figma. Para produção, vale
  substituir por exports otimizados (WebP) direto do Figma.
- `public/og.png` ainda é placeholder — especificação do arquivo definitivo na seção
  *Imagem de compartilhamento*, acima.
- Os textos dos accordions do FAQ foram redigidos como placeholder plausível — ajuste
  conforme o conteúdo oficial.
