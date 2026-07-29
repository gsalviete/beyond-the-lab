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
    /* o padding lateral fica na section: o frame de 1117 continua centrado
       e intacto em 1440, e no mobile a caixa vira fluida com gutter */
    <section id="curso" className="relative px-6 py-20 md:px-10">
      <div className="relative mx-auto flex w-full max-w-[1117px] flex-col items-center gap-6">
        {/* H2 — Geist 46/600, line-height normal, #022D57, caixa = 1117 (stretch) */}
        <h2 className="reveal h2-section w-full text-center font-display font-semibold leading-[normal] text-ink">
          Feito para profissionais e{' '}
          {/* ⚠️ derivado: a quebra manual é do texto de 1117px — no mobile
              a linha tem que quebrar sozinha, senão sobra uma órfã */}
          <br className="hidden lg:inline" />
          estudantes da reprodução humana
        </h2>

        {/* Subtítulo — Geist 18/400, line-height normal, body */}
        <p
          className="reveal p-section w-full text-center font-display font-normal leading-[normal] text-body"
          style={{ '--reveal-delay': '120ms' }}
        >
          Se você se identifica com algum desses perfis, o{' '}
          <span className="font-semibold text-grad">Beyond The Lab</span> foi pensado para você
        </p>

        {/* wrapper de ancoragem: microscópio preso à fileira de cards */}
        <div className="relative w-full">
          {/* Microscópio — 536×759, decor-blue, opacity 0.15 embutida no path
              ⚠️ left/top DERIVADOS por medição no print (escala 1.045×)
              left 823.5 + 536 = 1359.5 só faz sentido dentro do frame de 1117;
              em qualquer largura menor ele só vaza. Decorativo → some. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute hidden select-none lg:block"
            style={{ left: '823.5px', top: '-182px', width: '536px', height: '759px' }}
          >
            <Microscope />
          </div>

          <div className="relative z-10 grid w-full gap-6 text-left md:grid-cols-2 lg:grid-cols-4">
            {personas.map((p, i) => (
              <article
                key={p.title}
                /* stagger curto: 4 cards em 210ms no total */
                className="reveal-card card-lift group overflow-hidden rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink/5"
                style={{ '--reveal-delay': `${i * 70}ms` }}
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