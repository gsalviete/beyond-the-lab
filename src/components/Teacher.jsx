import { useRef, useState } from 'react'
import { ArrowUpRight, Play } from './Icons.jsx'

const tags = ['Experiência internacional', 'Especialista em Reprodução Humana', 'Vivência prática', 'Mercado internacional']

function PhoneVideo() {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      v.muted = false
      v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="relative mx-auto w-[290px] max-w-full">
      {/* phone frame */}
      <div className="relative aspect-[9/19.2] rounded-[44px] bg-gradient-to-b from-[#3a3542] to-[#241f2b] p-[7px] shadow-[0_30px_60px_-20px_rgba(2,45,87,0.45)] ring-1 ring-black/40">
        {/* side buttons */}
        <span className="absolute -left-[2.5px] top-[110px] h-9 w-[3px] rounded-l bg-[#2a2531]" />
        <span className="absolute -left-[2.5px] top-[158px] h-14 w-[3px] rounded-l bg-[#2a2531]" />
        <span className="absolute -right-[2.5px] top-[130px] h-16 w-[3px] rounded-r bg-[#2a2531]" />
        <div className="relative h-full w-full overflow-hidden rounded-[37px] bg-black">
          <video
            ref={ref}
            className="h-full w-full cursor-pointer object-cover"
            src="/assets/teacher.mp4"
            poster="/assets/teacher_poster.png"
            playsInline
            loop
            preload="metadata"
            onClick={toggle}
            onEnded={() => setPlaying(false)}
          />
          {/* dynamic island */}
          <div className="absolute left-1/2 top-2.5 h-[22px] w-[88px] -translate-x-1/2 rounded-full bg-black" />
          {/* play overlay */}
          {!playing && (
            <button
              onClick={toggle}
              aria-label="Reproduzir vídeo"
              className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-ink shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-all duration-300 hover:scale-110 hover:text-brand"
            >
              <Play className="h-6 w-6 translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
      {/* soft glow under the phone */}
      <div className="pointer-events-none absolute -bottom-6 left-1/2 h-10 w-3/4 -translate-x-1/2 rounded-full bg-ink/20 blur-2xl" />
    </div>
  )
}

export default function Teacher() {
  return (
    <section id="sobre" className="relative overflow-hidden py-20">
      {/* faint decorative rings behind the phone */}
      <div className="pointer-events-none absolute -left-28 bottom-10 h-96 w-96">
        <div className="animate-ring absolute inset-0 rounded-full border-[3px] border-rose-200/80" />
        <div className="animate-ring absolute inset-10 rounded-full border-[3px] border-rose-200/60" style={{ animationDelay: '1.2s' }} />
        <div className="absolute inset-24 rounded-full border-[3px] border-rose-100" />
      </div>
      <div className="container-page relative">
        <div className="text-center">
          <p className="reveal text-sm font-semibold uppercase tracking-[0.25em] text-grad">Sobre a professora</p>
          {/* H2 — mesma tipografia de Skills: Geist 46/600/normal/ink */}
          <h2
            className="reveal mt-3 w-full text-center font-display text-[46px] font-semibold leading-[normal] text-ink"
            style={{ '--reveal-delay': '90ms' }}
          >
            Quem ensina <span className="text-grad">entende seu cenário</span>
          </h2>
        </div>

        <div className="mt-12 grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="reveal-scale" style={{ '--reveal-delay': '150ms' }}>
            <PhoneVideo />
          </div>

          <div>
            {/* Texto — Geist 18/400/normal/body (mesmo padrão de Personas e PainPoints) */}
            <p className="reveal font-display text-[18px] font-normal leading-[1.6] text-body">
              Idealizado por Giovanna, uma profissional que viveu a rotina do laboratório, participou de congressos
              internacionais e sentiu na pele a diferença que o inglês certo faz na carreira. O Beyond The Lab nasceu
              para encurtar esse caminho, com proximidade, profundidade técnica e um método pensado para gente como você.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {tags.map((t, i) => (
                <span
                  key={t}
                  className="reveal rounded-full bg-white px-4 py-2 text-sm font-medium text-body shadow-soft ring-1 ring-ink/5 transition-all duration-300 hover:-translate-y-0.5 hover:text-brand hover:shadow-card hover:ring-brand/30"
                  style={{ '--reveal-delay': `${120 + i * 70}ms` }}
                >
                  {t}
                </span>
              ))}
            </div>

            <a href="#lista" className="btn-brand reveal mt-8" style={{ '--reveal-delay': '420ms' }}>
              Lista de espera
              <span className="arrow-badge"><ArrowUpRight className="h-3.5 w-3.5" /></span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
