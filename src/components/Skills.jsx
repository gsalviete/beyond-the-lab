const skills = [
  {
    img: '/assets/skill1.png',
    title: 'Leitura de artigos científicos',
    text: 'Compreensão rápida e precisa de papers e publicações',
  },
  {
    img: '/assets/skill2.png',
    title: 'Vocabulário técnico',
    text: 'Os termos que você usa todos os dias no laboratório e na clínica.',
  },
  {
    img: '/assets/skill3.png',
    title: 'Comunicação profissional',
    text: 'Segurança para se comunicar em laboratório e fazer relatórios.',
  },
]

export default function Skills() {
  return (
    <section id="como-funciona" className="relative overflow-hidden py-16">
      <div className="container-page relative text-center">
        {/* ⚠️ DERIVADO do token de Personas — validar no Dev Mode */}
        <h2 className="reveal w-full text-center font-display text-[46px] font-semibold leading-[normal] text-ink">
          Habilidades para a sua <span className="text-grad">rotina real</span>
        </h2>

        <div className="mt-12 grid gap-6 text-left md:grid-cols-3">
          {skills.map((s, i) => (
            <article
              key={s.title}
              className="reveal card-lift group rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/5"
              style={{ '--reveal-delay': `${i * 110}ms` }}
            >
              <div className="overflow-hidden rounded-xl">
                <img
                  src={s.img}
                  alt=""
                  className="h-36 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <h3 className="mt-4 px-1 font-display text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 px-1 pb-2 text-sm leading-relaxed text-body">{s.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
