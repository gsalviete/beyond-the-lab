import SyllabusPage from '@/views/SyllabusPage'

const TITLE = 'Conteúdo programático — Beyond The Lab'
const DESCRIPTION =
  'Os 12 módulos do Beyond The Lab, do vocabulário da rotina de bancada até a discussão de artigos científicos com profissionais internacionais.'

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'pt_BR',
    images: ['public/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['public/og.png'],
  },
}

export default function Page() {
  return <SyllabusPage />
}
