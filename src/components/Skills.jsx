import Image from 'next/image'

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
    <section id="como-funciona" className="relative pb-[69px] pt-[21px]">
      {/* ⚠️ derivado: 62px de respiro entre título e cards é medida de 1440 */}
      <div className="container-page relative flex flex-col items-center gap-10 lg:gap-[62px]">
        {/* H2 — Geist 46/600/normal/ink — CONFIRMADO no Dev Mode */}
        <h2 className="reveal h2-section w-full text-center font-display font-semibold leading-[normal] text-ink">
          Habilidades para a sua <span className="text-grad">rotina real</span>
        </h2>

        {/* ⚠️ gap entre cards DERIVADO do card de persona (24px) — não medido aqui */}
        <div className="grid w-full gap-6 text-left md:grid-cols-2 lg:grid-cols-3">
          {skills.map((s, i) => (
            <article
              key={s.title}
              className="reveal-card card-lift group flex items-center justify-center rounded-2xl border border-border-soft bg-white pb-[30px] pl-[13px] pr-[10px] pt-[6px]"
              style={{ '--reveal-delay': `${i * 70}ms` }}
            >
              {/* ⚠️ gap interno DERIVADO do card de persona (6px) — não medido aqui */}
              <div className="flex w-full flex-col items-start gap-[6px]">
                {/* Bloco da ilustração — h 111, radius 13, badge-grad, stretch */}
                <div className="h-[111px] w-full overflow-hidden rounded-[13px] bg-badge-grad">
                  {/* 658×222 natural; a caixa é 111px de altura em 3 colunas. */}
                  <Image
                    src={s.img}
                    alt=""
                    width={658}
                    height={222}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1024px) 380px, (min-width: 768px) 45vw, 90vw"
                    className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                </div>

                {/* Título — Geist 16/600/normal/ink, stretch */}
                <h3 className="w-full font-display text-[16px] font-semibold leading-[normal] text-ink">
                  {s.title}
                </h3>

                {/* Descrição — Geist 14/400/normal/ink */}
                <p className="font-display text-[14px] font-normal leading-[normal] text-ink">
                  {s.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}