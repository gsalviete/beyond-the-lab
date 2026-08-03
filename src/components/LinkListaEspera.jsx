'use client'

/**
 * CTA "Lista de espera" — leva ao card de compra, não à modal.
 *
 * O fluxo passou a ser em duas etapas: todo "Lista de espera" espalhado pela
 * página rola até o card de preço, e só o "Garantir minha vaga" de dentro do
 * card abre o formulário. Quem clica no topo ainda não viu o preço; mandar a
 * modal direto pulava justamente a informação que a decisão precisa.
 *
 * É uma âncora de verdade (`<a href>`), não um handler de scroll:
 *  - funciona com JS desligado ou ainda não hidratado;
 *  - o link é copiável e compartilhável;
 *  - o scroll suave e o recuo do header sticky vêm do CSS
 *    (`html { scroll-behavior: smooth; scroll-padding-top: 96px }`), que já
 *    respeita `prefers-reduced-motion` no bloco de acessibilidade.
 *
 * Sobre o foco: o alvo tem `tabIndex={-1}`, e navegador nenhum é obrigado a
 * focar o destino de um fragmento. Sem isso, quem navega por teclado clica no
 * CTA do rodapé, a página rola, e o Tab seguinte continua lá no topo. O
 * `preventScroll: true` é o detalhe que faz os dois conviverem: sem ele o
 * `focus()` salta para o alvo na hora e mata a animação do scroll suave.
 *
 * Assinatura igual à do CtaInscricao (className/style/children/onClick) para
 * que cada ponto de uso mantenha exatamente as classes que já tinha.
 */
export const ID_CARD_COMPRA = 'planos'

/**
 * @param {{
 *   className?: string,
 *   style?: import('react').CSSProperties,
 *   children?: import('react').ReactNode,
 *   onClick?: (e: import('react').MouseEvent<HTMLAnchorElement>) => void,
 *   href?: string,
 * }} props
 */
export default function LinkListaEspera({
  className = '',
  style,
  children,
  onClick,
  // A rota /conteudo-programatico precisa do caminho absoluto: lá o card não
  // existe no documento, então o `#planos` sozinho não iria a lugar nenhum.
  href = `#${ID_CARD_COMPRA}`,
}) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={(e) => {
        // A navbar mobile fecha o próprio menu antes de rolar.
        onClick?.(e)
        const alvo = document.getElementById(ID_CARD_COMPRA)
        // null quando o clique veio de outra rota — ali o próprio navegador
        // resolve o fragmento no carregamento da landing.
        if (!alvo) return
        requestAnimationFrame(() => alvo.focus({ preventScroll: true }))
      }}
    >
      {children}
    </a>
  )
}
