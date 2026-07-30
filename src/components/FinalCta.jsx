import { ArrowUpRight } from './Icons.jsx'

const bgCta = '/assets/background-cta.svg'
const ovary = '/assets/ovary.svg'

export default function FinalCta() {
  return (
    <section id="final-cta" className="pb-20"> {/* ⚠️ derivado */}
      <div className="container-page">
        {/* ⚠️ derivado: height 636.107 (48 + 540.107 + 48) e radius 32 */}
        {/* ⚠️ derivado: no mobile a altura fixa não cabe o texto — vira
            padding vertical e o bloco cresce com o conteúdo */}
        <div className="relative flex items-center justify-center overflow-hidden rounded-[32px] px-6 py-14 lg:h-[636.107px] lg:px-0 lg:py-0">
          {/* fundo completo: gradiente + grid já no SVG */}
          {/* o SVG é 1212x632 e em 1440 é esticado de propósito (a caixa tem
              1120x636.1) — `object-fill` é o default, então lg: preserva isso;
              no mobile a distorção seria absurda, daí o cover */}
          <img
            src={bgCta}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover lg:object-fill"
          />

          {/* óvulo — asset completo, sem wrapper, sem opacity, sem rotação */}
          {/* left 790px é coordenada do frame de 1440: decorativo, some no mobile */}
          <img
            src={ovary}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-[790px] top-[48px] hidden h-[540.107px] w-[540.794px] max-w-none lg:block"
          />

          {/* stack central — gaps do autolayout: 8 / 16 / 16 */}
          {/* o `max-w-full` do H1/parágrafo precisa de um pai com largura
              definida; sem `w-full` o pai encolhe pro conteúdo e os 718px
              vazam. Em lg volta a `w-auto`, como estava. */}
          <div className="relative flex w-full flex-col items-center text-center lg:w-auto">
            <p className="reveal font-sans text-[12px] font-semibold uppercase leading-[16px] tracking-[2.16px] text-[#F15D89]">
              Vagas limitadas
            </p>

            <h2
              className="reveal h2-cta mt-2 w-[718px] max-w-full font-display font-extrabold text-[#022D57]"
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