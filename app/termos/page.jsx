import DocumentoLegal from '@/components/DocumentoLegal.jsx'
import ConteudoTermos, { TERMOS_ATUALIZADO_EM } from '@/content/termos.jsx'

const TITLE = 'Termos de Uso — Beyond The Lab'
const DESCRIPTION =
  'Condições de contratação do Beyond The Lab: duração, cobrança mensal, direito de arrependimento de 7 dias e cancelamento.'

// Mesmo formato de metadata de /conteudo-programatico, inclusive o
// `images: ['/og.png']` explícito. Ele repete o do layout raiz de
// propósito: `openGraph` não é mesclado campo a campo quando a rota
// declara o objeto, então omitir a imagem aqui a apagaria — e o link
// destes documentos, que é o que se cola numa conversa quando alguém
// pergunta "e se eu desistir?", perderia a prévia.
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
    <DocumentoLegal titulo="Termos de Uso" atualizadoEm={TERMOS_ATUALIZADO_EM}>
      <ConteudoTermos />
    </DocumentoLegal>
  )
}
