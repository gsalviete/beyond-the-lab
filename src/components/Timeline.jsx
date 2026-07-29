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
    <section id="timeline" className="py-16">
      <div className="container-page text-center">
        {/* H2 — mesma tipografia de Skills: Geist 46/600/normal/ink */}
        <h2 className="reveal w-full text-center font-display text-[46px] font-semibold leading-[normal] text-ink">
          Do cadastro a <span className="text-grad">primeira aula</span>
        </h2>

        {/* Subtítulo da seção — Geist 18/400/normal/body (igual Personas e PainPoints) */}
        <p
          className="reveal mx-auto mt-4 max-w-[640px] font-display text-[18px] font-normal leading-[normal] text-body"
          style={{ '--reveal-delay': '110ms' }}
        >
          Um processo simples e transparente, pensado para formar turmas coesas e no nível certo.
        </p>

        <div className="timeline-track relative mt-16">
          {/* linha de conexão + traço que "desenha" no hover da etapa */}
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-rose-300 to-transparent md:block" />
          <div className="grid gap-10 md:grid-cols-5">
            {steps.map((s, i) => {
              const Icon = s.icon
              const active = i === 0
              return (
                <div
                  key={s.etapa}
                  className="reveal timeline-step group relative flex cursor-default flex-col items-center text-center"
                  style={{ '--reveal-delay': `${i * 120}ms` }}
                >
                  {/* segmento da linha que se preenche no hover */}
                  {i < steps.length - 1 && (
                    <span className="pointer-events-none absolute left-1/2 right-[-50%] top-6 hidden h-px origin-left scale-x-0 bg-brand-grad transition-transform duration-500 ease-out group-hover:scale-x-100 md:block" />
                  )}

                  <span
                    className={`relative z-10 grid h-12 w-12 place-items-center rounded-full [transition:transform_var(--motion-short)_var(--ease-out),box-shadow_var(--motion-short)_var(--ease-out),background-color_var(--motion-short)_var(--ease-out),color_var(--motion-short)_var(--ease-out)] group-hover:-translate-y-1 group-hover:scale-[1.08] group-hover:shadow-[0_14px_28px_-10px_rgba(247,88,131,0.55)] ${
                      active
                        ? 'bg-brand-grad text-white shadow-pill'
                        : 'bg-white text-brand ring-1 ring-rose-200 group-hover:bg-brand-grad group-hover:text-white group-hover:ring-transparent'
                    }`}
                  >
                    {/* halo pulsante no hover */}
                    <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand/30 opacity-0 [transition:transform_var(--motion-medium)_var(--ease-out),opacity_var(--motion-medium)_var(--ease-out)] group-hover:scale-[1.35] group-hover:opacity-100" />
                    <Icon className="h-5 w-5 transition-transform duration-300 ease-out group-hover:scale-110" />
                  </span>

                  {/* ETAPA — Geist 14/600/normal/ink */}
                  <span className="mt-5 font-display text-[14px] font-semibold leading-[normal] tracking-wide text-ink transition-colors duration-300 group-hover:text-brand">
                    {s.etapa}
                  </span>

                  {/* Título — Geist 16/600/normal */}
                  <h3 className="mt-1 whitespace-nowrap font-display text-[16px] font-semibold leading-[normal] text-grad transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
                    {s.title}
                  </h3>

                  {/* Descrição — Geist 14/400/normal/ink */}
                  <p className="mt-1.5 max-w-[13rem] font-display text-[14px] font-normal leading-[normal] text-ink transition-opacity duration-300 group-hover:opacity-100 md:opacity-90">
                    {s.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
