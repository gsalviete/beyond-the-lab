'use client'

import { useInscricao } from './InscricaoProvider.jsx'

/**
 * CTA que abre a modal de inscrição.
 *
 * Substitui as âncoras `<a href>` que apontavam para a seção da lista de
 * espera — ela deixou de existir. Repassa `className` e `style` intactos para
 * que cada ponto de uso mantenha exatamente as classes que já tinha.
 *
 * `type="button"` é obrigatório: fora de formulário não muda nada, mas o
 * default de `<button>` é `submit`, e um CTA que virasse submit de um form
 * ancestral seria um bug difícil de enxergar depois.
 *
 * Sobre paridade visual com o `<a>` que era antes: as classes .btn-brand /
 * .btn-brand-sm / .btn-outline já fixam `display: inline-flex`, altura
 * explícita e `items-center`, então nem `line-height` nem `display` de
 * `<button>` participam do resultado. O preflight do Tailwind zera margin,
 * padding e borda e força `font: inherit`, o que cobre o resto da diferença
 * entre os dois elementos.
 */
// O JSDoc abaixo não é enfeite. Este componente é `.jsx`, e sem ele o
// TypeScript infere as props a partir da desestruturação: parâmetro sem
// valor padrão vira prop obrigatória, e `children = null` fixaria o tipo
// dos filhos em `null`. Como o único consumidor tipado (SyllabusPage.tsx)
// passa vários filhos e omite `onClick`, o build quebrava nos dois casos.
/**
 * @param {{
 *   className?: string,
 *   style?: import('react').CSSProperties,
 *   children?: import('react').ReactNode,
 *   onClick?: (e: import('react').MouseEvent<HTMLButtonElement>) => void,
 * }} props
 */
export default function CtaInscricao({ className = '', style, children, onClick }) {
  const { abrir } = useInscricao()

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={(e) => {
        // Alguns pontos de uso precisam de efeito próprio junto — o CTA da
        // navbar mobile fecha o menu antes de abrir a modal.
        onClick?.(e)
        abrir()
      }}
    >
      {children}
    </button>
  )
}
