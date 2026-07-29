import { useId, useState } from 'react'
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

function Item({ q, a, delay = 0 }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const panelId = `${id}-panel`
  const triggerId = `${id}-trigger`

  return (
    <div
      className="reveal rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5"
      style={{ '--reveal-delay': `${delay}ms` }}
    >
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="faq-trigger flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-display text-base font-semibold text-ink">{q}</span>
        <span className="faq-icon grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white bg-[linear-gradient(87deg,#115CA4_0.82%,#102449_130.57%)]">
          <Plus className="h-4 w-4" />
        </span>
      </button>

      {/* .faq-panel anima grid-template-rows e esconde de leitores de tela
          quando fechado (visibility), sem tirar a resposta do DOM */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="faq-panel"
        data-open={open}
      >
        <p className="text-sm leading-relaxed text-body">{a}</p>
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
        <h2 className="reveal text-center font-display text-[36px] md:text-[46px] font-semibold text-ink leading-normal">
          Perguntas frequentes
        </h2>
        {/* stagger por linha: as duas colunas entram em par */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <div className="space-y-5">
            {left.map((f, i) => <Item key={f.q} {...f} delay={i * 70} />)}
          </div>
          <div className="space-y-5">
            {right.map((f, i) => <Item key={f.q} {...f} delay={i * 70} />)}
          </div>
        </div>
      </div>
    </section>
  )
}
