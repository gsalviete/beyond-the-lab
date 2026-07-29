import { useEffect } from 'react'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import PainPoints from './components/PainPoints.jsx'
import Personas from './components/Personas.jsx'
import Skills from './components/Skills.jsx'
import Timeline from './components/Timeline.jsx'
import Teacher from './components/Teacher.jsx'
import Pricing from './components/Pricing.jsx'
import Faq from './components/Faq.jsx'
import FinalCta from './components/FinalCta.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  // Scroll-reveal: cada elemento entra uma única vez, ao se aproximar da viewport.
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

  return (
    <div className="relative">
      <Navbar />
      <main>
        <Hero />
        <PainPoints />
        <Personas />
        <Skills />
        <Timeline />
        <Teacher />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
