import { useState } from 'react'
import { Plus } from './Icons.jsx'

const faqs = [
  {
    q: 'Preciso ter inglês avançado?',
    a: 'Não. O curso separa as turmas por nível, então você começa exatamente de onde está.',
  },
  {
    q: 'As aulas ficam gravadas?',
    a: 'Sim. Todas as aulas ao vivo ficam gravadas para você rever quando quiser.',
  },
  {
    q: 'Como são divididas as turmas?',
    a: 'As turmas são reduzidas e formadas por nível de inglês e objetivo, após uma avaliação inicial.',
  },
  {
    q: 'Quanto tempo dura?',
    a: 'O programa tem duração de 6 meses, com encontros ao vivo e materiais de apoio.',
  },
  {
    q: 'Tem certificado no final do curso?',
    a: 'Sim, você recebe um certificado de conclusão ao final do programa.',
  },
  {
    q: 'Como funcionam as aulas?',
    a: 'Aulas ao vivo, com foco na rotina do laboratório, além de material complementar e comunidade exclusiva.',
  },
]

function Item({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-display text-base font-semibold text-ink">{q}</span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cobalt text-white transition ${
            open ? 'rotate-45' : ''
          }`}
        >
          <Plus className="h-4 w-4" />
        </span>
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <p className="overflow-hidden text-sm leading-relaxed text-body">{a}</p>
      </div>
    </div>
  )
}

export default function Faq() {
  const left = faqs.filter((_, i) => i % 2 === 0)
  const right = faqs.filter((_, i) => i % 2 === 1)
  return (
    <section id="faq" className="py-16">
      <div className="container-page">
        <h2 className="text-center font-display text-[1.75rem] font-bold text-ink md:text-[2.2rem]">
          Perguntas frequentes
        </h2>
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="space-y-5">{left.map((f) => <Item key={f.q} {...f} />)}</div>
          <div className="space-y-5">{right.map((f) => <Item key={f.q} {...f} />)}</div>
        </div>
      </div>
    </section>
  )
}
