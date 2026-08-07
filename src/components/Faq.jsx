'use client'

import { useId, useState } from 'react'
import { Plus } from './Icons.jsx'
// Módulo NEUTRO — não é client nem server, e é por isso que este
// componente `'use client'` pode importá-lo. Mesma porta pela qual
// `consentimento.ts` e `dominio.ts` já entram aqui.
import { formatarDuracao } from '@/config/curso'

// Virou função por causa de UMA resposta: "Quanto tempo dura?" dizia
// "6 meses" escrito à mão. É a pergunta cuja resposta o banco conhece, e
// a única do array que muda de safra para safra — as outras seis
// descrevem o formato do curso, que não tem coluna e não deve ter.
const montarFaqs = (duracaoMeses) => [
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
    a: `O programa tem duração de ${formatarDuracao(duracaoMeses)}, com encontros ao vivo e materiais de apoio.`,
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

// Coordenada de cada card na grade de 1440 — escritas por extenso porque o
// scanner do Tailwind não enxerga classe montada por template string.
const CELL = [
  'md:col-start-1 md:row-start-1',
  'md:col-start-2 md:row-start-1',
  'md:col-start-1 md:row-start-2',
  'md:col-start-2 md:row-start-2',
  'md:col-start-1 md:row-start-3',
  'md:col-start-2 md:row-start-3',
]

function Item({ q, a, delay = 0, className = '' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const panelId = `${id}-panel`
  const triggerId = `${id}-trigger`

  return (
    <div
      className={`reveal rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5 ${className}`}
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
        {/* a div intermediária é a caixa de overflow do grid; o respiro de
            12px virou padding dela para sair do caminho da animação */}
        <div>
          {/* pt-3 = os 12px que eram margin-top animado do painel */}
          <p className="faq-panel-inner pt-3 text-sm leading-relaxed text-body">{a}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * `duracaoMeses` é obrigatório e sem default — ver o porquê em
 * `Pricing.jsx`.
 *
 * A prop atravessa a fronteira servidor → cliente, o que quer dizer que
 * ela vai no payload de hidratação em texto claro. É um número que já
 * está impresso no HTML em outros três lugares da mesma página, então não
 * há nada a proteger aqui — e é exatamente por isso que o corte de
 * `app/page.jsx` manda só ele, e não a `SafraAtiva` inteira, que carrega
 * `id` e a contagem de inscritas.
 */
export default function Faq({ duracaoMeses }) {
  const faqs = montarFaqs(duracaoMeses)

  return (
    <section id="faq" className="py-16">
      <div className="container-page">
        <h2 className="reveal h2-section text-center font-display font-semibold text-ink leading-normal">
          Perguntas frequentes
        </h2>
        {/* Antes eram duas <div> empilhadas (pares à esquerda, ímpares à
            direita). Numa coluna só isso lê 1,3,5,2,4,6 — ordem errada.
            Agora a lista é plana (ordem natural no mobile) e o posicionamento
            explícito em md: reconstrói exatamente a mesma grade de 1440.
            `items-start` mantém cada card com a própria altura, como no
            layout de duas pilhas. */}
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2 md:items-start">
          {faqs.map((f, i) => (
            <Item
              key={f.q}
              {...f}
              /* stagger por linha: as duas colunas entram em par */
              delay={Math.floor(i / 2) * 70}
              className={CELL[i]}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
