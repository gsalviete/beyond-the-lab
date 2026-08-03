import Image from 'next/image'
import { ArrowUpRight, FileText } from './Icons.jsx'
import LinkListaEspera from './LinkListaEspera.jsx'

const cards = [
  { n: '01', text: 'Dificuldade para compreender artigos científicos.' },
  { n: '02', text: 'Dificuldade em acompanhar conteúdos estrangeiros.' },
  { n: '03', text: 'Insegurança em congressos internacionais.' },
  { n: '04', text: 'Inglês genérico que não prepara para o laboratório.' },
]

export default function PainPoints() {
  return (
    <section
        id="pain-points"
        className="relative overflow-hidden py-20"
      >
      {/* Era `background-image` em CSS: o PNG de 2880px (949 KB) baixava inteiro
          em qualquer viewport, sem webp e sem srcset. Como <Image fill> ele
          passa pelo otimizador e o mobile recebe a versão estreita. O resultado
          visual é idêntico ao `bg-cover bg-center` anterior. */}
      <Image
        src="/assets/painpoints-bg.png"
        alt=""
        aria-hidden="true"
        fill
        sizes="100vw"
        loading="lazy"
        className="pointer-events-none -z-10 select-none object-cover object-center"
      />

      <div className="container-page relative grid items-center gap-12 lg:grid-cols-2">
        {/* ⚠️ min-w-0 nos dois filhos: `min-width: auto` de item de grid punha
            piso no min-content, e o botão de 300px esticava a coluna além dos
            272 de área útil em 320px. Em lg as duas colunas medem 536 e o
            min-content nunca chega perto — o desktop não se mexe. */}
        <div className="flex min-w-0 flex-col gap-6">
          <h2 className="reveal h2-section max-w-[332px] font-display font-semibold leading-normal text-ink">
            Seu <span className="text-brand-line">inglês</span> acompanha sua carreira?
          </h2>
          <p
            className="reveal p-section font-sans font-normal leading-normal text-body"
            style={{ '--reveal-delay': '110ms' }}
          >
            Se você se identifica com alguma dessas situações, talvez seja hora de dar um novo passo na sua carreira.
          </p>

          <LinkListaEspera className="btn-brand reveal w-[300px] max-w-full" style={{ '--reveal-delay': '220ms' }}>
            Lista de espera
            <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
          </LinkListaEspera>
        </div>

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div
              key={c.n}
              className="reveal-card card-lift group relative overflow-hidden rounded-2xl bg-white p-6 shadow-card"
              /* stagger por linha (2 colunas) — sobem de baixo pra cima, sem varredura lateral */
              style={{ '--reveal-delay': `${Math.floor(i / 2) * 110}ms` }}
            >
              <span
                className="pointer-events-none absolute right-4 top-2 select-none font-display text-6xl font-extrabold text-transparent transition-colors duration-300 group-hover:[-webkit-text-stroke-color:#FFB3C8]"
                style={{ WebkitTextStroke: '2px #FFD3E0' }}
              >
                {c.n}
              </span>
              <span className="shine grid h-11 w-11 place-items-center rounded-xl bg-brand-grad text-white shadow-pill transition-transform duration-300 group-hover:scale-110">
                <FileText className="h-5 w-5" />
              </span>
              <p className="mt-8 max-w-[15rem] font-medium leading-snug text-ink">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}