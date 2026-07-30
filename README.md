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

| Variável               | Obrigatória | Uso |
|------------------------|-------------|-----|
| `NEXT_PUBLIC_SITE_URL` | não         | base absoluta de OG/Twitter (`metadataBase`). Sem ela, cai em `VERCEL_PROJECT_PRODUCTION_URL` (injetada pela Vercel) e, fora da Vercel, em `http://localhost:3000` |

## Tema

Cores centrais (em `tailwind.config.js`):

| Token        | Hex        | Uso                          |
|--------------|------------|------------------------------|
| `ink`        | `#022D57`  | títulos e texto escuro       |
| `body`       | `#345372`  | parágrafos                   |
| `brand`      | `#F76C93`  | rosa da marca (gradiente)    |
| `cobalt`     | `#114883`  | badge azul / ícone do FAQ    |
| `rose-100`   | `#FFE8EF`  | fundos rosa claros           |

## Observações

- **Vídeo da professora:** `*.mp4` é gitignored (o arquivo tinha 71 MB). O `Teacher.jsx`
  exibe hoje um frame estático, `public/assets/teacher-poster.jpg`. Quando o storage
  externo estiver configurado, restaurar o `<video>` — o `TODO` está no componente.
- As imagens em `public/assets/` foram extraídas do export do Figma. Para produção, vale
  substituir por exports otimizados (WebP) direto do Figma.
- `public/og.png` ainda é placeholder.
- Os textos dos accordions do FAQ foram redigidos como placeholder plausível — ajuste
  conforme o conteúdo oficial.
