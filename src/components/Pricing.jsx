import { ArrowUpRight, ChevronRight, Shield, Trophy, Lock } from './Icons.jsx'
import { Dna } from './Decor.jsx'

const features = [
  'Turmas reduzidas, com aulas ao vivo',
  'Material complementar e glossário técnico',
  'Avaliação mensal',
  'Comunidade exclusiva de alunos',
  'Avaliação de nível incluída',
  'Certificado de conclusão',
  'Duração de 6 meses',
]

const guarantees = [
  { icon: Shield, label: 'Compra segura' },
  { icon: Trophy, label: 'Satisfação Garantida' },
  { icon: Lock, label: 'Privacidade Garantida' },
]

export default function Pricing() {
  return (
    <section id="lista" className="py-16">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-rose-100 via-rose-50 to-white p-8 shadow-card md:p-14">
          {/* faint ring decoration */}
          <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 rounded-full border-[3px] border-rose-200/50" />
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* left */}
            <div className="relative">
              {/* DNA helix behind the feature list (as in Figma) */}
              <Dna
                className="pointer-events-none absolute -left-6 top-40 hidden h-[430px] w-24 md:block"
                stroke="#FFCBDB"
                strokeWidth={2.4}
              />
              <span className="reveal inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-soft">
                <span className="h-2 w-2 rounded-full bg-brand" /> <span className="text-grad">Beyond The Lab</span>
              </span>
              <h2 className="reveal mt-5 font-display text-[1.7rem] font-bold leading-tight text-ink md:text-[2.1rem]" style={{ '--reveal-delay': '90ms' }}>
                O curso completo pra <span className="text-grad">transformar seu inglês.</span>
              </h2>
              <p className="reveal mt-4 max-w-md text-base text-body" style={{ '--reveal-delay': '170ms' }}>
                Turmas, aulas ao vivo e materiais práticos pra estudar, praticar e evoluir do início ao fim.
              </p>

              <ul className="relative mt-7 max-w-md space-y-3">
                {features.map((f, i) => (
                  <li key={f} className="reveal flex items-center gap-3" style={{ '--reveal-delay': `${i * 70}ms` }}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-brand ring-1 ring-rose-300 transition-transform duration-300 hover:scale-110">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                    <span className="flex-1 rounded-full bg-white py-2.5 px-5 text-sm font-medium text-ink shadow-soft transition-shadow duration-300 hover:shadow-card">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* right price card */}
            <div className="relative">
              {/* offset ghost card behind (as in Figma) */}
              <div className="pointer-events-none absolute -bottom-10 -right-6 hidden h-full w-full rounded-[26px] bg-rose-100/70 md:block" />
              <div
                className="reveal-scale relative overflow-hidden rounded-[26px] bg-price-grad p-8 shadow-pill"
                style={{ '--reveal-delay': '150ms' }}
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/25" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-white/10" />
                <div className="relative z-10">
                  <div className="flex items-end gap-2">
                    <span className="text-grad font-display text-5xl font-extrabold md:text-6xl">R$ 299,99</span>
                    <span className="pb-2 text-sm font-medium text-body/70">por mês</span>
                  </div>

                  <a
                    href="#lista"
                    className="btn-brand mt-6 flex w-full items-center justify-center gap-2 ring-4 ring-white/40"
                  >
                    Adquirir Beyond the Lab
                    <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
                  </a>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <span className="rounded-full bg-white/85 px-4 py-1.5 text-sm font-semibold"><span className="text-grad">6 Meses</span></span>
                    <span className="rounded-full bg-white/85 px-4 py-1.5 text-sm font-semibold"><span className="text-grad">Passo a passo prático</span></span>
                  </div>

                  <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/40 pt-6">
                    {guarantees.map((g) => {
                      const Icon = g.icon
                      return (
                        <div key={g.label} className="flex flex-col items-center gap-2 text-center text-xs font-medium text-white">
                          <Icon className="h-6 w-6" />
                          <span className="leading-tight">{g.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
