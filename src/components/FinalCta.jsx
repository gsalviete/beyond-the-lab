import { ArrowUpRight } from './Icons.jsx'
import { Sperm, RingDot } from './Decor.jsx'

export default function FinalCta() {
  return (
    <section className="pb-20">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[32px] bg-cta-grad px-8 py-16 text-center shadow-card md:py-20">
          {/* faint grid, like the pink band */}
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'linear-gradient(#ffffff55 1px, transparent 1px), linear-gradient(90deg, #ffffff55 1px, transparent 1px)',
              backgroundSize: '46px 46px',
            }}
          />
          {/* big ovum on the right with a small white sperm swimming toward it */}
          <div className="pointer-events-none absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2">
            <div className="animate-ring absolute inset-0 rounded-full bg-brand-light/30" />
            <div className="absolute inset-10 rounded-full border-[22px] border-white/40" />
            <div className="absolute inset-28 rounded-full bg-white/25" />
            <Sperm
              className="animate-swim absolute -left-16 top-8 h-28 w-28 -scale-x-100"
              gradFrom="#FFFFFF"
              gradTo="#FFE3EC"
              id="spermCta"
            />
          </div>
          {/* small line-art accents */}
          <RingDot className="pointer-events-none absolute left-14 top-10 h-12 w-12 opacity-80" />
          <RingDot className="pointer-events-none absolute bottom-10 right-1/3 h-8 w-8 opacity-60" />
          <Sperm
            className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rotate-[165deg] opacity-90"
            id="spermCta2"
          />
          <div className="relative">
            <p className="reveal text-sm font-semibold uppercase tracking-[0.25em] text-brand">Vagas limitadas</p>
            <h2 className="reveal mx-auto mt-4 max-w-2xl font-display text-[1.9rem] font-bold leading-tight text-ink md:text-[2.4rem]" style={{ '--reveal-delay': '100ms' }}>
              Prepare-se para crescer em um mercado cada vez mais global.
            </h2>
            <p className="reveal mx-auto mt-5 max-w-xl text-base text-body" style={{ '--reveal-delay': '190ms' }}>
              Entre para a lista de espera do Beyond The Lab e seja avisada em primeira mão sobre a abertura das próximas turmas.
            </p>
            <a href="#lista" className="btn-brand reveal mx-auto mt-9" style={{ '--reveal-delay': '280ms' }}>
              Lista de espera
              <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
