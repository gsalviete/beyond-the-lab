import DocumentoLegal from '@/components/DocumentoLegal.jsx'
import ConteudoPrivacidade, { PRIVACIDADE_ATUALIZADO_EM } from '@/content/privacidade.jsx'

const TITLE = 'Política de Privacidade — Beyond The Lab'
const DESCRIPTION =
  'Quais dados o Beyond The Lab coleta no formulário de inscrição, para que servem, com quem são compartilhados e como exercer seus direitos.'

// Ver a nota sobre `openGraph` em `app/termos/page.jsx`.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'pt_BR',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
}

export default function Page() {
  return (
    <DocumentoLegal titulo="Política de Privacidade" atualizadoEm={PRIVACIDADE_ATUALIZADO_EM}>
      <ConteudoPrivacidade />
    </DocumentoLegal>
  )
}
