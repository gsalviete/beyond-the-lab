import { ArrowUpRight, ChevronRight, Shield, Trophy, Lock } from './Icons.jsx'
import ghostCard from '/assets/ghost-card.png'
import microscope from '/assets/microscope-pink.svg'
import dna from '/assets/dna.svg'

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
      <div className="mx-auto w-[1212px] max-w-full">
        {/* ═══════════ FRAME DA SEÇÃO — 1212×835 ═══════════ */}
        <div
          className="relative h-[835px] overflow-hidden rounded-[36px]
                     border border-[rgba(17,17,17,0.09)]
                     bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                     shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                     p-8 md:p-14"
        >
          {/* ───── DECORATIVOS ───── */}
          {/* ⚠️ derivado: posições estimadas no render, sem X/Y do Inspect */}
          <img
            src={microscope}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -left-54 -top-32 h-[700px] w-[700px]
                       max-w-none select-none opacity-[0.4]"
          />
          <img
            src={dna}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-8 left-2 h-[240px] w-[150px]
                       max-w-none select-none"
          />

          {/* ───── GHOST — left 671 / top 70 (confirmado) ───── */}
          <img
            src={ghostCard}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-[671px] top-[70px] hidden
                       h-[656px] w-[480px] max-w-none select-none md:block"
          />

          {/* ═══════════ CARD DE PREÇO — left 659 / top 164 ═══════════ */}
          <div
            className="reveal-scale absolute left-[659px] top-[164px] z-10 flex h-[492px]
                       w-[427px] flex-col items-center justify-center gap-8 overflow-hidden
                       rounded-2xl border border-[#FF8FAE] bg-price-grad px-9 py-6"
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
              {/* ⚠️ derivado: ancoragem absoluta — pai sem auto-layout confirmado */}
              <span
                className="absolute -right-4 bottom-3 whitespace-nowrap text-center
                           font-display text-[11.803px] font-medium leading-[18.619px]
                           text-[#26020B]"
              >
                por mês
              </span>
            </div>

            {/* CTA — 373×60 (confirmado) */}
            {/* ⚠️ background / box-shadow vêm de .btn-brand, nunca confirmados */}
            {/* ⚠️ ring-4 ring-white/40 não veio do Dev Mode — provável invenção */}
            <a
              href="#lista"
              className="btn-brand flex h-[60px] w-[373px] shrink-0 items-center justify-center
                         gap-2 px-6 text-center font-display text-[22px] font-semibold
                         leading-[19.2px] tracking-[-0.8px] text-white ring-4 ring-white/40"
            >
              Adquirir Beyond the Lab
              <span className="arrow-badge">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </a>

            {/* CHIPS — row 248.69 / gap 12 (confirmado) */}
            <div className="flex w-[248.69px] items-center gap-3">
              {/* 84px = 248.69 − 152.69 − 12 (derivado por subtração) */}
              <span
                className="flex h-[33.19px] w-[84px] shrink-0 items-center justify-center
                           rounded-full bg-[#FDEEF2] font-display text-[12px] font-semibold
                           leading-[19.2px] text-[#FF487A]"
              >
                6 Meses
              </span>
              <span
                className="flex h-[33.19px] w-[152.69px] shrink-0 items-center justify-center
                           rounded-full bg-[#FDEEF2] font-display text-[12px] font-semibold
                           leading-[19.2px] text-[#FF487A]"
              >
                Passo a passo prático
              </span>
            </div>

            {/* TRUST ROW — item: inline-flex, gap 12 (confirmado) */}
            <div className="inline-flex h-[44px] w-[382px] shrink-0 items-center justify-center gap-3">
              {guarantees.map((g) => {
                const Icon = g.icon
                return (
                  <div key={g.label} className="inline-flex items-center justify-center gap-3">
                    <Icon className="h-6 w-6 shrink-0 text-white" />
                    <span className="font-display text-[16px] font-medium leading-[21.6px] text-white">
                      {g.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ═══════════ COLUNA ESQUERDA ═══════════ */}
          <div className="relative w-[492px] max-w-full">
            {/* BADGE */}
            <span
              className="reveal inline-flex items-center gap-2 rounded-full border
                         border-[rgba(247,88,131,0.25)] bg-white
                         py-[11px] pl-[16.34px] pr-[91.996px]"
            >
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#F75883]" />
              <span className="text-grad font-display text-[18px] font-semibold leading-none">
                Beyond The Lab
              </span>
            </span>

            {/* HEADLINE */}
            <h2
              className="reveal mt-5 w-[492px] max-w-full font-display text-[46px]
                         font-semibold leading-[normal] text-[#022D57]"
              style={{ '--reveal-delay': '90ms' }}
            >
              O curso completo pra <span className="text-grad">transformar seu inglês.</span>
            </h2>

            {/* PARÁGRAFO */}
            {/* nota: font-size aumentado manualmente — Figma diz 16px / 25.6px */}
            <p
              className="reveal mt-4 w-[487.5px] max-w-full font-display text-[16px]
                         font-normal leading-[25.6px] text-[#345372]"
              style={{ '--reveal-delay': '170ms' }}
            >
              Turmas, aulas ao vivo e materiais práticos pra estudar, praticar e evoluir do início
              ao fim.
            </p>

            {/* LISTA — 468.0918 × 663.19537 */}
            {/* ⚠️ internos (gap, círculo, pill, conectora) ainda sem Dev Mode */}
            <ul className="relative mt-7 w-[468.0918px] max-w-full space-y-3">
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
        </div>
      </div>
    </section>
  )
}