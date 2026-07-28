import { ArrowUpRight, ChevronRight, Shield, Trophy, Lock } from './Icons.jsx'
import ghostCard from '/assets/ghost-card.png'

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
        {/* FRAME DA SEÇÃO — Dev Mode confirmado */}
        <div
          className="relative overflow-hidden rounded-[36px] border border-[rgba(17,17,17,0.09)]
                     bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                     shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                     p-8 md:p-14 lg:h-[835px]"
        >
          {/* TODO Bloco D: watermark do microscópio (SVG) + onda/hélice (SVG) */}

          <div className="grid h-full items-center gap-10 lg:grid-cols-2">
            {/* ───────────────── COLUNA ESQUERDA ───────────────── */}
            <div className="relative">
              <span className="reveal inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold shadow-soft">
                <span className="h-2 w-2 rounded-full bg-brand" />
                <span className="text-grad">Beyond The Lab</span>
              </span>

              <h2
                className="reveal mt-5 font-display text-[1.7rem] font-bold leading-tight text-ink md:text-[2.1rem]"
                style={{ '--reveal-delay': '90ms' }}
              >
                O curso completo pra <span className="text-grad">transformar seu inglês.</span>
              </h2>

              <p
                className="reveal mt-4 max-w-md text-base text-body"
                style={{ '--reveal-delay': '170ms' }}
              >
                Turmas, aulas ao vivo e materiais práticos pra estudar, praticar e evoluir do início
                ao fim.
              </p>

              <ul className="relative mt-7 max-w-md space-y-3">
                {features.map((f, i) => (
                  <li
                    key={f}
                    className="reveal flex items-center gap-3"
                    style={{ '--reveal-delay': `${i * 70}ms` }}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-brand ring-1 ring-rose-300 transition-transform duration-300 hover:scale-110">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                    <span className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-soft transition-shadow duration-300 hover:shadow-card">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* ───────────────── COLUNA DIREITA ───────────────── */}
            <div className="relative flex justify-center lg:justify-end">
              {/* GHOST — asset raster, 480×656 @2x */}
              {/* ⚠️ derivado: posição relativa ao card não confirmada */}
              <img
                src={ghostCard}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -left-14 -top-20 hidden h-[656px] w-[480px]
                           max-w-none select-none md:block"
              />

              {/* CARD DE PREÇO — Dev Mode confirmado */}
              <div
                className="reveal-scale relative flex h-[492px] w-[427px] max-w-full flex-col
                           items-center justify-center gap-8 overflow-hidden rounded-2xl
                           border border-[#FF8FAE] bg-price-grad px-9 py-6"
                style={{ '--reveal-delay': '150ms' }}
              >
                {/* PREÇO */}
                <div className="relative w-[339px] max-w-full">
                  <span
                    className="text-grad block whitespace-nowrap text-center font-display
                               text-[64.776px] font-medium leading-[87.448px]"
                  >
                    R$ 299,99
                  </span>
                  {/* ⚠️ derivado: ancoragem absoluta — aguardando auto-layout do pai */}
                  <span
                    className="absolute -right-4 bottom-3 whitespace-nowrap text-center font-display
                               text-[11.803px] font-medium leading-[18.619px] text-[#26020B]"
                  >
                    por mês
                  </span>
                </div>

                {/* CTA */}
                <a
                  href="#lista"
                  className="btn-brand flex w-full items-center justify-center gap-2 ring-4 ring-white/40"
                >
                  Adquirir Beyond the Lab
                  <span className="arrow-badge">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </a>

                {/* CHIPS */}
                <div className="flex flex-wrap justify-center gap-3">
                  <span className="rounded-full bg-white/85 px-4 py-1.5 text-sm font-semibold">
                    <span className="text-grad">6 Meses</span>
                  </span>
                  <span className="rounded-full bg-white/85 px-4 py-1.5 text-sm font-semibold">
                    <span className="text-grad">Passo a passo prático</span>
                  </span>
                </div>

                {/* TRUST ROW — ícone à esquerda, label em 2 linhas, sem divisória */}
                <div className="grid w-full grid-cols-3 gap-3">
                  {guarantees.map((g) => {
                    const Icon = g.icon
                    return (
                      <div
                        key={g.label}
                        className="flex items-center gap-2 text-left text-xs font-medium text-white"
                      >
                        <Icon className="h-6 w-6 shrink-0" />
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
    </section>
  )
}