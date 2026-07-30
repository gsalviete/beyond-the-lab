import { Geist } from 'next/font/google'
import './globals.css'

// Antes vinha de um <link> do Google Fonts no index.html. Via next/font a
// fonte é auto-hospedada e o @font-face entra no HTML inicial — sem FOUT.
// Mesma família e mesmo eixo de peso (100..900) do link original.
const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
})

const SITE_TITLE = 'Beyond The Lab — Inglês para Reprodução Humana'
const SITE_DESCRIPTION =
  'Beyond The Lab — curso de inglês para profissionais e estudantes da Reprodução Humana.'

// URLs absolutas de OG/Twitter precisam de uma base. Em produção a Vercel
// injeta o domínio; localmente cai no dev server.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
    locale: 'pt_BR',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og.png'],
  },
}

// Habilita o estado inicial do scroll-reveal antes do primeiro paint.
// Sem JS (ou sem IntersectionObserver) a classe nunca entra e o
// conteúdo permanece visível — o reveal é progressive enhancement.
const REVEAL_BOOTSTRAP = `if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js-reveal')
}`

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: o script abaixo acrescenta `js-reveal` ao
    // <html> antes da hidratação, então o className do cliente diverge do
    // servidor por construção. Manter a classe fora do HTML inicial é
    // proposital — sem JS nada pode ficar invisível.
    <html lang="pt-BR" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
