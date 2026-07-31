'use client'

import { useId, useState, type CSSProperties } from 'react'
import PageHeader from '@/components/PageHeader.jsx'
import CtaInscricao from '@/components/CtaInscricao.jsx'
import Footer from '@/components/Footer.jsx'
import { ArrowUpRight } from '@/components/Icons.jsx'
import useScrollReveal from '@/hooks/useScrollReveal.js'
import modules, { type Module } from '@/data/modules'

function Chevron() {
  return (
    <svg
      className="syl-icon h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function AccordionItem({
  module,
  defaultOpen = false,
  delay = 0,
}: {
  module: Module
  defaultOpen?: boolean
  delay?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const panelId = `${id}-panel`
  const triggerId = `${id}-trigger`

  return (
    <div
      className="reveal-card rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5"
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      <h3>
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="syl-trigger flex w-full items-center justify-between gap-4 text-left"
        >
          <span className="font-display text-base font-semibold text-ink md:text-[18px]">
            <span className="text-muted">Module {module.id}</span>
            {' — '}
            {module.title}
          </span>
          {/* mesmo selo do FAQ: 32px, radius 12, gradiente do badge */}
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-badge-grad text-white">
            <Chevron />
          </span>
        </button>
      </h3>

      {/* .syl-panel anima grid-template-rows (0fr→1fr) — não precisa medir
          altura — e some para leitores de tela quando fechado, sem tirar o
          conteúdo do DOM */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="syl-panel"
        data-open={open}
      >
        <ul className="flex flex-col gap-2 pt-1">
          {module.topics.map((topic) => (
            <li key={topic} className="flex items-start gap-3 text-sm leading-relaxed text-body">
              <span
                aria-hidden="true"
                className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-brand"
              />
              <span>{topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function SyllabusPage() {
  useScrollReveal()

  return (
    <div className="relative min-h-screen">
      <PageHeader />

      <main className="py-14 lg:py-20">
        <div className="container-page">
          {/* mesma cadência da primeira dobra da landing: kicker → título →
              apoio, com o título no curso longo do .reveal-hero */}
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-4 text-center">
            <p
              className="reveal font-sans text-[12px] font-semibold uppercase leading-[16px] tracking-[2.16px] text-[#F15D89]"
              style={{ '--reveal-delay': '40ms' } as CSSProperties}
            >
              6 meses · 12 módulos
            </p>
            <h1
              className="reveal-hero h2-section font-display font-semibold leading-[normal] text-ink"
              style={{ '--reveal-delay': '130ms' } as CSSProperties}
            >
              Conteúdo <span className="text-grad">programático</span>
            </h1>
            <p
              className="reveal p-section font-display font-normal leading-[normal] text-body"
              style={{ '--reveal-delay': '240ms' } as CSSProperties}
            >
              Do vocabulário da rotina de bancada até a discussão de artigos científicos com
              profissionais internacionais.
            </p>
          </div>

          <div className="mx-auto mt-12 flex max-w-4xl flex-col gap-4">
            {modules.map((m, i) => (
              <AccordionItem
                key={m.id}
                module={m}
                defaultOpen={i === 0}
                /* stagger só nos cards da primeira dobra: mais abaixo eles
                   entram por scroll, um a um, e um delay ali só atrasaria */
                delay={i < 4 ? 320 + i * 70 : 0}
              />
            ))}
          </div>

          <div className="mx-auto mt-14 flex max-w-4xl flex-col items-center gap-4 text-center">
            <p className="reveal p-section font-display text-body">
              As turmas são reduzidas e separadas por nível de inglês.
            </p>
            {/* Antes navegava de volta para a âncora da lista na landing. A
                modal está no layout raiz, que cobre esta rota também, então
                abre aqui mesmo — sem mandar a pessoa sair da página só para
                ver um formulário. */}
            <CtaInscricao
              className="btn-brand reveal w-[300px] max-w-full"
              style={{ '--reveal-delay': '90ms' } as CSSProperties}
            >
              Lista de espera
              <span className="arrow-badge">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </CtaInscricao>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
