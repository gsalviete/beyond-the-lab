import Link from 'next/link'

// Não havia link nenhum neste footer, então não existia "padrão dos
// links existentes" para copiar. O estilo abaixo é derivado do link
// "Voltar" do `PageHeader.jsx`, que é o outro link de navegação secundária
// do projeto: mesma transição (`--motion-fast` + `--ease-out`), mesmo
// destino de hover (`text-brand`). A cor de repouso é `text-muted`, e não
// o `text-ink/80` de lá, porque aqui o vizinho é o parágrafo de copyright
// em `text-muted` — alinhar com ele mantém o rodapé numa única voz.
//
// O foco de teclado não precisa de nada: a regra `a:focus-visible` do
// globals.css já dá o contorno rosa de 3px a todo link do site.
const FOOTER_LINK =
  'rounded font-sans text-sm text-muted [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand'

export default function Footer() {
  return (
    <footer className="border-t border-ink/10 py-8">
      {/* Três blocos agora, não dois. Em mobile eles empilham centralizados
          como antes; a partir de `md` a fileira volta a ser horizontal e os
          links ficam no meio, entre wordmark e copyright. */}
      <div className="container-page flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
        {/* A assinatura do rodapé é o wordmark — não há nome de pessoa aqui.
            O registro entra logo abaixo dele, no mesmo `text-sm text-muted` do
            copyright ao lado: é a "única voz" que o comentário do FOOTER_LINK
            descreve, e o token de legenda do projeto.
            ⚠️ derivado: o container usa gap-4 entre os três blocos, mas não há
            referência de espaçamento DENTRO de um bloco. mt-1 é o menor passo
            que separa as duas linhas sem as colar. */}
        <div className="flex flex-col items-center md:items-start">
          <span className="reveal font-display text-lg font-bold text-grad">Beyond The Lab</span>
          <span className="reveal mt-1 font-sans text-sm text-muted" style={{ '--reveal-delay': '30ms' }}>
            CRBM-7 11567
          </span>
        </div>

        {/* <nav> e não uma <div>: é um grupo de navegação, e o
            `aria-label` o distingue do menu principal para quem navega
            saltando entre landmarks. */}
        <nav aria-label="Documentos legais">
          <ul
            className="reveal flex items-center gap-5"
            style={{ '--reveal-delay': '60ms' }}
          >
            <li>
              <Link href="/termos" className={FOOTER_LINK}>
                Termos de Uso
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className={FOOTER_LINK}>
                Política de Privacidade
              </Link>
            </li>
          </ul>
        </nav>

        <p className="reveal text-sm text-muted" style={{ '--reveal-delay': '90ms' }}>
          © 2026 <span className="font-semibold text-ink">Beyond The Lab</span>. Inglês para Reprodução Humana.
        </p>
      </div>
    </footer>
  )
}
