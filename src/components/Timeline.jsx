import { Clipboard, Cap, Users, Rocket, TrendUp } from './Icons.jsx'

const steps = [
  { icon: Clipboard, etapa: 'ETAPA 1', title: 'Lista de espera', text: 'Garanta prioridade nas próximas turmas.' },
  { icon: Cap, etapa: 'ETAPA 2', title: 'Avaliação do nível', text: 'Diagnóstico individual do seu inglês.' },
  { icon: Users, etapa: 'ETAPA 3', title: 'Formação das turmas', text: 'Grupos alinhados por nível e objetivo.' },
  { icon: Rocket, etapa: 'ETAPA 4', title: 'Início das aulas', text: 'Aulas ao vivo com foco na sua rotina.' },
  { icon: TrendUp, etapa: 'ETAPA 5', title: 'Desenvolvimento contínuo', text: 'Evolução constante com suporte próximo.' },
]

export default function Timeline() {
  return (
    <section className="py-16">
      <div className="container-page text-center">
        <h2 className="reveal font-display text-[1.75rem] font-bold text-ink md:text-[2.2rem]">
          Do cadastro a <span className="text-brand">primeira aula</span>
        </h2>
        <p className="reveal mx-auto mt-4 max-w-lg text-base text-body" style={{ '--reveal-delay': '110ms' }}>
          Um processo simples e transparente, pensado para formar turmas coesas e no nível certo.
        </p>

        <div className="relative mt-16">
          {/* connecting line */}
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-rose-300 to-transparent md:block" />
          <div className="grid gap-10 md:grid-cols-5">
            {steps.map((s, i) => {
              const Icon = s.icon
              const active = i === 0
              return (
                <div
                  key={s.etapa}
                  className="reveal relative flex flex-col items-center text-center"
                  style={{ '--reveal-delay': `${i * 120}ms` }}
                >
                  <span
                    className={`relative z-10 grid h-12 w-12 place-items-center rounded-full transition-transform duration-300 hover:scale-110 ${
                      active ? 'bg-brand-grad text-white shadow-pill' : 'bg-white text-brand ring-1 ring-rose-200'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-5 text-xs font-bold tracking-wide text-ink">{s.etapa}</span>
                  <h3 className="mt-1 whitespace-nowrap font-display text-[15px] font-semibold leading-snug text-brand md:text-base lg:whitespace-nowrap">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 max-w-[13rem] text-sm text-body">{s.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
