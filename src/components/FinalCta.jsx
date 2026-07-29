import bgCta from '/assets/background-cta.svg'
import ovary from '/assets/ovary.svg'
import { ArrowUpRight } from './Icons.jsx'

export default function FinalCta() {
  return (
    <section id="final-cta" className="pb-20"> {/* ⚠️ derivado */}
      <div className="container-page">
        {/* ⚠️ derivado: height 636.107 (48 + 540.107 + 48) e radius 32 */}
        <div className="relative flex h-[636.107px] items-center justify-center overflow-hidden rounded-[32px]">
          {/* fundo completo: gradiente + grid já no SVG */}
          <img
            src={bgCta}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          {/* óvulo — asset completo, sem wrapper, sem opacity, sem rotação */}
          <img
            src={ovary}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-[790px] top-[48px] h-[540.107px] w-[540.794px] max-w-none"
          />

          {/* stack central — gaps do autolayout: 8 / 16 / 16 */}
          <div className="relative flex flex-col items-center text-center">
            <p className="reveal font-sans text-[12px] font-semibold uppercase leading-[16px] tracking-[2.16px] text-[#F15D89]">
              Vagas limitadas
            </p>

            <h2
              className="reveal mt-2 w-[718px] max-w-full font-display text-[44px] font-extrabold leading-[46.2px] tracking-[-1.1px] text-[#022D57]"
              style={{ '--reveal-delay': '100ms' }}
            >
              Prepare-se para crescer em um mercado cada vez mais global.
            </h2>

            <p
              className="reveal mt-4 w-[576px] max-w-full font-sans text-[17px] font-normal leading-[27.625px] text-[#345372]"
              style={{ '--reveal-delay': '190ms' }}
            >
              Entre para a lista de espera do Beyond The Lab e seja avisada em primeira mão sobre a abertura das próximas turmas.
            </p>

            <a href="#lista" className="btn-brand reveal mt-4" style={{ '--reveal-delay': '280ms' }}>
              Lista de espera
              <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}