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
  // Scroll-reveal: observe every .reveal / .reveal-scale element once.
  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-scale')
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in-view'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
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
