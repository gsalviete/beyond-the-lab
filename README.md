# Beyond The Lab — Landing page

Landing page do curso de inglês **Beyond The Lab** (inglês para profissionais e estudantes da Reprodução Humana), construída a partir do protótipo do Figma.

## Stack

- **React 18** + **Vite 5**
- **Tailwind CSS 3**
- Fontes: Poppins (títulos) + Inter (corpo), via Google Fonts

## Rodando o projeto

```bash
npm install      # já instalado
npm run dev      # sobe em http://localhost:5173
npm run build    # build de produção em /dist
```

## Estrutura

```
src/
  App.jsx                 # monta as seções na ordem
  components/
    Navbar.jsx
    Hero.jsx              # "Desenvolva o inglês..."
    PainPoints.jsx        # "Seu inglês acompanha sua carreira?"
    Personas.jsx          # "Feito para profissionais e estudantes..."
    Skills.jsx            # "Habilidades para a sua rotina real"
    Timeline.jsx          # "Do cadastro a primeira aula"
    Teacher.jsx           # "Quem ensina entende seu cenário"
    Pricing.jsx           # "O curso completo pra transformar seu inglês."
    Faq.jsx               # "Perguntas frequentes"
    FinalCta.jsx          # "Prepare-se para crescer..."
    Footer.jsx
    Icons.jsx             # ícones SVG inline
public/assets/            # imagens extraídas do protótipo (hero, fotos, ilustrações)
```

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

- As imagens em `public/assets/` foram extraídas do export do Figma. Para produção, vale substituir por exports otimizados (WebP) direto do Figma.
- Os textos dos accordions do FAQ foram redigidos como placeholder plausível — ajuste conforme o conteúdo oficial.
- Vídeos (hero/professora) estão como imagem estática com botão de play; é só plugar o player real.
