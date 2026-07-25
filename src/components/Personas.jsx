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

import { Bubble, SpermOutline, Dna } from './Decor.jsx'

export default function Personas() {
  return (
    <section id="curso" className="relative overflow-hidden py-20">
      {/* light-blue line-art background icons (as in Figma) */}
      <Bubble className="pointer-events-none absolute -top-8 right-24 hidden h-56 w-64 lg:block" strokeWidth={10} />
      <SpermOutline className="pointer-events-none absolute -right-40 top-1/3 hidden h-[520px] w-[520px] rotate-12 lg:block" />
      <Dna className="pointer-events-none absolute -left-4 bottom-16 h-40 w-20 opacity-90" />
      <div className="container-page relative text-center">
        <h2 className="reveal mx-auto max-w-2xl font-display text-[1.75rem] font-bold leading-tight text-ink md:text-[2.2rem]">
          Feito para profissionais e estudantes da reprodução humana
        </h2>
        <p className="reveal mt-4 text-base text-body" style={{ '--reveal-delay': '120ms' }}>
          Se você se identifica com algum desses perfis, o <span className="font-semibold text-grad">Beyond The Lab</span> foi pensado para você
        </p>

        <div className="mt-12 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((p, i) => (
            <article
              key={p.title}
              className="reveal card-lift group overflow-hidden rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink/5"
              style={{ '--reveal-delay': `${i * 100}ms` }}
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
    </section>
  )
}
