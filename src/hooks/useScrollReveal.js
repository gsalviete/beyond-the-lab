import { useEffect } from 'react'

/**
 * Scroll-reveal: cada elemento entra uma única vez, ao se aproximar da viewport.
 *
 * Extraído do App para que qualquer rota possa consumir. Necessário porque
 * `.js-reveal .reveal { opacity: 0 }` é global: uma página sem observer
 * deixaria todo elemento com classe de reveal (o Footer, por exemplo)
 * invisível para sempre.
 */
export default function useScrollReveal() {
  useEffect(() => {
    const SELECTOR = '.reveal, .reveal-card, .reveal-hero, .reveal-soft, .hero-surface'
    const els = document.querySelectorAll(SELECTOR)

    // Sem IntersectionObserver a classe .js-reveal nunca foi aplicada,
    // então nada está escondido — não há o que revelar.
    if (!('IntersectionObserver' in window)) return

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.add('in-view')
          io.unobserve(e.target)
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => io.observe(el))

    // Rede de segurança: um elemento cortado por um ancestral com overflow
    // (seções de largura fixa no mobile) nunca cruza o observer e ficaria
    // invisível para sempre. Nesses casos revela direto — a animação é
    // acabamento, o conteúdo nunca pode depender dela.
    const isUnreachable = (el) => {
      const r = el.getBoundingClientRect()
      if (r.left >= window.innerWidth || r.right <= 0) return true
      for (let a = el.parentElement; a; a = a.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(a)
        if (overflowX === 'visible' && overflowY === 'visible') continue
        const ar = a.getBoundingClientRect()
        if (r.left >= ar.right || r.right <= ar.left || r.top >= ar.bottom || r.bottom <= ar.top) {
          return true
        }
      }
      return false
    }

    const sweep = () => {
      els.forEach((el) => {
        if (el.classList.contains('in-view') || !isUnreachable(el)) return
        el.classList.add('in-view')
        io.unobserve(el)
      })
    }
    sweep()
    window.addEventListener('load', sweep)
    window.addEventListener('resize', sweep)

    return () => {
      io.disconnect()
      window.removeEventListener('load', sweep)
      window.removeEventListener('resize', sweep)
    }
  }, [])
}
