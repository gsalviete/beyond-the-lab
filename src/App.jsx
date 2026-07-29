import useScrollReveal from './hooks/useScrollReveal.js'
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
  useScrollReveal()

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
