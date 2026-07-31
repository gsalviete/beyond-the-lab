'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight } from './Icons.jsx'
import CtaInscricao from './CtaInscricao.jsx'

const links = [
  { label: 'O curso', href: '#curso' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Sobre mim', href: '#sobre' },
  { label: 'Perguntas', href: '#faq' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // O menu só existe abaixo de lg. Se a janela cruzar o breakpoint com ele
  // aberto, o painel some mas o estado ficaria preso em `true`.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => e.matches && setOpen(false)
    window.addEventListener('keydown', onKey)
    mq.addEventListener('change', onChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onChange)
    }
  }, [open])

  return (
    <header
      /* `scroll-lock-shift`: sendo `fixed`, este header não herda o padding
         que a trava de scroll da modal aplica no body. Sem a classe, ele
         seria o único elemento a saltar quando a barra de rolagem some. */
      className={`intro-nav scroll-lock-shift fixed inset-x-0 top-0 z-50 [transition:background-color_var(--motion-short)_var(--ease-out),box-shadow_var(--motion-short)_var(--ease-out)] ${
        scrolled || open ? 'bg-white/85 shadow-soft backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      {/* Figma: centro da nav em y=48 → padding 27px com CTA de 41px */}
      <nav
        className={`container-page flex items-center justify-between [transition:padding_var(--motion-short)_var(--ease-out)] ${
          scrolled ? 'py-3' : 'py-[27px]'
        }`}
      >
        <a
          href="#top"
          className="inline-block origin-left font-display text-xl font-bold tracking-tight text-brand [transition:transform_350ms_var(--ease-out)] hover:scale-[1.035]"
        >
          Beyond The Lab
        </a>

        {/* Figma: gap ~19px, fonte ~18px */}
        {/* ⚠️ derivado: os links caem no hambúrguer até lg, não até md — em 768
            o trio logo + 4 links + CTA de 190px não cabe sem apertar */}
        <ul className="hidden items-center gap-5 lg:flex">
          {links.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="relative text-[18px] font-medium text-ink/80
                           [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand
                           after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full
                           after:origin-left after:scale-x-0 after:rounded-full after:bg-brand
                           after:[transition:transform_var(--motion-short)_var(--ease-out)]
                           hover:after:scale-x-100 focus-visible:after:scale-x-100"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Figma: 190 x 41, padding 8/24, gap 8, sem effects */}
        <CtaInscricao className="btn-brand-sm hidden w-[190px] lg:inline-flex">
          Lista de espera
          <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
        </CtaInscricao>

        {/* ⚠️ derivado: não há botão de menu no design de 1440 — 44x44 é o
            alvo de toque mínimo, e as duas barras viram "X" quando abre */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink lg:hidden"
        >
          <span className="relative block h-4 w-6">
            <span
              className={`absolute left-0 block h-[2px] w-6 rounded-full bg-current [transition:transform_var(--motion-short)_var(--ease-out),top_var(--motion-short)_var(--ease-out)] ${
                open ? 'top-[7px] rotate-45' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 block h-[2px] w-6 rounded-full bg-current [transition:transform_var(--motion-short)_var(--ease-out),top_var(--motion-short)_var(--ease-out)] ${
                open ? 'top-[7px] -rotate-45' : 'top-[14px]'
              }`}
            />
          </span>
        </button>
      </nav>

      {/* Painel do menu — só abaixo de lg. Anima por grid-template-rows para
          não precisar medir a altura do conteúdo. */}
      <div
        id="menu-mobile"
        className={`grid overflow-hidden border-border-soft bg-white/95 backdrop-blur-md
                    [transition:grid-template-rows_var(--motion-short)_var(--ease-out),opacity_var(--motion-short)_var(--ease-out)]
                    lg:hidden ${open ? 'grid-rows-[1fr] border-t opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="container-page flex flex-col gap-1 py-4">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl py-3 text-[18px] font-medium text-ink/80
                             [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-3">
              <CtaInscricao
                onClick={() => setOpen(false)}
                className="btn-brand-sm w-full"
              >
                Lista de espera
                <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
              </CtaInscricao>
            </li>
          </ul>
        </div>
      </div>
    </header>
  )
}
