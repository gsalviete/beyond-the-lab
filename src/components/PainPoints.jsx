import { ArrowUpRight, FileText } from './Icons.jsx'

const cards = [
  { n: '01', text: 'Dificuldade para compreender artigos científicos.' },
  { n: '02', text: 'Dificuldade em acompanhar conteúdos estrangeiros.' },
  { n: '03', text: 'Insegurança em congressos internacionais.' },
  { n: '04', text: 'Inglês genérico que não prepara para o laboratório.' },
]

export default function PainPoints() {
  return (
    <section className="relative overflow-hidden bg-rose-grad py-20">
      {/* subtle grid across the whole band */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(#ffffff66 1px, transparent 1px), linear-gradient(90deg, #ffffff66 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }}
      />
      {/* soft highlight */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/40 blur-3xl" />
      <div className="container-page relative grid items-center gap-12 lg:grid-cols-2">
        <div>
          <h2 className="reveal font-display text-[1.75rem] font-bold leading-tight text-ink md:text-[2.2rem]">
            Seu <span className="text-brand">inglês</span>
            <br /> acompanha
            <br /> sua carreira?
          </h2>
          <p className="reveal mt-5 max-w-md text-base text-body" style={{ '--reveal-delay': '120ms' }}>
            Se você se identifica com alguma dessas situações, talvez seja hora de dar um novo passo na sua carreira.
          </p>
          <a href="#lista" className="btn-brand reveal mt-8" style={{ '--reveal-delay': '220ms' }}>
            Lista de espera
            <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
          </a>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {cards.map((c, i) => (
            <div
              key={c.n}
              className="reveal card-lift group relative overflow-hidden rounded-2xl bg-white p-6 shadow-card"
              style={{ '--reveal-delay': `${i * 90}ms` }}
            >
              <span
                className="pointer-events-none absolute right-4 top-2 select-none font-display text-6xl font-extrabold text-transparent transition-colors duration-300 group-hover:[-webkit-text-stroke-color:#FFB3C8]"
                style={{ WebkitTextStroke: '2px #FFD3E0' }}
              >
                {c.n}
              </span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-grad text-white shadow-pill transition-transform duration-300 group-hover:scale-110">
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
