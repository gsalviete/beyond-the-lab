import { useEffect, useState } from 'react'
import { ArrowUpRight } from './Icons.jsx'

const links = [
  { label: 'O curso', href: '#curso' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Sobre mim', href: '#sobre' },
  { label: 'Perguntas', href: '#faq' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/85 shadow-soft backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      {/* Figma: centro da nav em y=48 → padding 27px com CTA de 41px */}
      <nav
        className={`container-page flex items-center justify-between transition-all duration-300 ${
          scrolled ? 'py-3' : 'py-[27px]'
        }`}
      >
        <a href="#top" className="font-display text-xl font-bold tracking-tight text-brand">
          Beyond The Lab
        </a>

        {/* Figma: gap ~19px, fonte ~18px */}
        <ul className="hidden items-center gap-5 md:flex">
          {links.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="relative text-[18px] font-medium text-ink/80 transition hover:text-brand
                           after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-0
                           after:rounded-full after:bg-brand after:transition-all after:duration-300
                           hover:after:w-full"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Figma: 190 x 41, padding 8/24, gap 8, sem effects */}
        <a href="#lista" className="btn-brand-sm w-[190px]">
          Lista de espera
          <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
        </a>
      </nav>
    </header>
  )
}