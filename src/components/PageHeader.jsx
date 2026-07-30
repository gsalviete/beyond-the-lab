import Link from 'next/link'

/**
 * Header das páginas internas.
 *
 * Não reusa o <Navbar/> de propósito: aquele carrega estado de scroll, menu
 * hambúrguer e quatro links âncora (#curso, #como-funciona, #sobre, #faq) que
 * só existem na landing. Fora dela os links não teriam destino. Aqui basta
 * wordmark + volta, então o componente é estático — mesmo wordmark, mesmo
 * container, sem a máquina de estado.
 */
export default function PageHeader() {
  return (
    <header className="intro-nav sticky top-0 z-50 border-b border-border-soft bg-white/85 backdrop-blur-md">
      <div className="container-page flex items-center justify-between py-4">
        <Link
          href="/"
          className="inline-block origin-left font-display text-xl font-bold tracking-tight text-brand [transition:transform_350ms_var(--ease-out)] hover:scale-[1.035]"
        >
          Beyond The Lab
        </Link>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 font-sans text-[16px] font-medium text-ink/80 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Voltar
        </Link>
      </div>
    </header>
  )
}
