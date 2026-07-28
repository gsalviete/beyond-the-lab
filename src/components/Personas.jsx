import { Microscope } from './Icons.jsx'

const personas = [
  {
    img: '/assets/profile1.png',
    title: 'Estudantes de Biomedicina, Medicina e Embriologia',
    text: 'Quer aprender o inglês técnico desde a formação, sem depender de tradução.',
  },
  {
    img: '/assets/profile2.png',
    title: 'Profissionais de laboratório e da rotina clínica',
    text: 'Trabalha com protocolos, equipamentos e termos técnicos em inglês todos os dias.',
  },
  {
    img: '/assets/profile3.png',
    title: 'Pesquisadores da área de reprodução humana',
    text: 'Precisa ler, escrever e publicar artigos científicos com mais autonomia.',
  },
  {
    img: '/assets/profile4.png',
    title: 'Quem quer atuar no mercado internacional',
    text: 'Busca confiança pra estudar, se candidatar e trabalhar em outros países.',
  },
]

export default function Personas() {
  return (
    <section id="curso" className="relative py-20">
      <div className="relative mx-auto flex w-[1117px] flex-col items-center gap-6">
        {/* H2 — Geist 46/600, line-height normal, #022D57, caixa = 1117 (stretch) */}
        <h2 className="reveal w-full text-center font-display text-[46px] font-semibold leading-[normal] text-ink">
          Feito para profissionais e{' '}
          <br />
          estudantes da reprodução humana
        </h2>

        {/* Subtítulo — Geist 18/400, line-height normal, body */}
        <p
          className="reveal w-full text-center font-display text-[18px] font-normal leading-[normal] text-body"
          style={{ '--reveal-delay': '120ms' }}
        >
          Se você se identifica com algum desses perfis, o{' '}
          <span className="font-semibold text-grad">Beyond The Lab</span> foi pensado para você
        </p>

        {/* wrapper de ancoragem: microscópio preso à fileira de cards */}
        <div className="relative w-full">
          {/* Microscópio — 536×759, decor-blue, opacity 0.15 embutida no path
              ⚠️ left/top DERIVADOS por medição no print (escala 1.045×) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute select-none"
            style={{ left: '823.5px', top: '-182px', width: '536px', height: '759px' }}
          >
            <Microscope />
          </div>

          <div className="relative z-10 grid w-full gap-6 text-left sm:grid-cols-2 lg:grid-cols-4">
            {personas.map((p) => (
              <article
                key={p.title}
                /* linha única no desktop — todos sobem juntos, sem varredura lateral */
                className="reveal card-lift group overflow-hidden rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink/5"
                style={{ '--reveal-delay': '180ms' }}
              >
                <div className="overflow-hidden rounded-xl">
                  <img
                    src={p.img}
                    alt=""
                    className="h-40 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-4 px-1 font-display text-base font-semibold leading-snug text-ink">
                  {p.title}
                </h3>
                <p className="mt-2 px-1 pb-2 text-sm leading-relaxed text-body">{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}