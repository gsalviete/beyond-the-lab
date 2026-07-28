import { ArrowUpRight, FileText } from './Icons.jsx'

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
        className="relative overflow-hidden bg-cover bg-center bg-no-repeat py-20"
        style={{ backgroundImage: "url('/assets/painpoints-bg.png')" }}
      >
      
      <div className="container-page relative grid items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="max-w-[332px] font-display text-[46px] font-semibold leading-normal text-ink">
            Seu <span className="text-brand-line">inglês</span> acompanha sua carreira?
          </h2>
          <p className="font-sans text-[18px] font-normal leading-normal text-body">
            Se você se identifica com alguma dessas situações, talvez seja hora de dar um novo passo na sua carreira.
          </p>

          <a href="#lista" className="btn-brand w-[300px]">
            Lista de espera
            <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div
              key={c.n}
              className="reveal card-lift group relative overflow-hidden rounded-2xl bg-white p-6 shadow-card"
              /* stagger por linha (2 colunas) — sobem de baixo pra cima, sem varredura lateral */
              style={{ '--reveal-delay': `${Math.floor(i / 2) * 120}ms` }}
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