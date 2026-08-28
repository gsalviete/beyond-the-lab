// ============================================================
// ÍCONES DO PAINEL
//
// ⚠️ ELES NÃO MORAM EM `src/components/Icons.jsx` DE PROPÓSITO. Aquele
// arquivo é o conjunto da landing, e é importado por componentes que a
// pessoa de fora baixa; estes quatro só existem dentro de `/admin`, que
// pela D-07 é a ferramenta da Giovanna. Separar mantém a fronteira
// visível: um ícone daqui aparecendo numa tela pública é sinal de que
// alguma coisa cruzou a linha errada.
//
// O traço, o `viewBox` e o `stroke="currentColor"` são os mesmos de
// `Icons.jsx` — não é conjunto novo de desenho, é a mesma família num
// arquivo diferente.
// ============================================================

export const Olho = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

/** O mesmo olho com o traço em cima — o "olhinho riscado". */
export const OlhoRiscado = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    <path d="m3 3 18 18" />
  </svg>
)

export const Info = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
)

/** A seta para baixo dos campos de escolha — chevron, não triângulo. */
export const ChevronBaixo = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** A seta de voltar. Fica maior que os outros ícones porque é alvo de toque. */
export const SetaEsquerda = ({ className = 'h-6 w-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
)

export const Calendario = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
)
