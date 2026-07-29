import { useRef, useState } from 'react'
import { ArrowUpRight, Play } from './Icons.jsx'

const tags = ['Experiência internacional', 'Especialista em Reprodução Humana', 'Vivência prática', 'Mercado internacional']

// Geometria lida direto do SVG — nada estimado
const SCREEN = { left: 13, top: 8, width: 317, height: 626, radius: 16 }

function PhoneVideo() {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) { v.muted = false; v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  return (
    /* ⚠️ 343×642 é o tamanho natural do SVG — confirmar o tamanho do nó no Dev Mode */
    <div className="relative mx-auto" style={{ width: 343, height: 642 }}>
      {/* moldura vetorial */}
      <img
        src="/assets/phone-frame.svg"
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute inset-0 select-none"
        style={{ width: 343, height: 642 }}
      />

      {/* vídeo por cima (o rect da tela no SVG é branco opaco) */}
      <video
        ref={ref}
        className="absolute cursor-pointer object-cover"
        src="/assets/teacher.mp4"
        playsInline
        loop
        preload="metadata"
        onClick={toggle}
        onEnded={() => setPlaying(false)}
        style={{
          left: SCREEN.left,
          top: SCREEN.top,
          width: SCREEN.width,
          height: SCREEN.height,
          borderRadius: SCREEN.radius,
        }}
      />

      {!playing && (
        <button
          onClick={toggle}
          aria-label="Reproduzir vídeo"
          className="absolute grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#2B2A35] text-white [transition:transform_var(--motion-short)_var(--ease-out),background-color_var(--motion-short)_var(--ease-out)] hover:scale-[1.08] active:scale-100"
          style={{ left: SCREEN.left + SCREEN.width / 2, top: SCREEN.top + SCREEN.height / 2 }}
        >
          <Play className="h-3.5 w-3.5 translate-x-px" />
        </button>
      )}
    </div>
  )
}

export default function Teacher() {
  return (
    <section id="sobre" className="relative py-20">
      {/* faint decorative rings behind the phone */}
      {/* decor: célula — asset completo do Figma, não rotacionar nem envolver em wrapper */}
      <img
        src="/assets/cell.svg"
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute select-none"
        style={{
          width: 439,
          height: 439,

          left: -13,  /* ⚠️ derivado */
          top: 505,   /* ⚠️ derivado */
        }}
      />
      <div className="container-page relative z-10">
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
          <div className="reveal-soft" style={{ '--reveal-delay': '150ms' }}>
            <PhoneVideo />
          </div>

          <div>
            {/* Texto — Geist 18/400/normal/body (mesmo padrão de Personas e PainPoints) */}
            <p className="reveal font-display text-[18px] font-normal leading-[1.6] text-body">
              Idealizado por Giovanna, uma profissional que viveu a rotina do laboratório, participou de congressos
              internacionais e sentiu na pele a diferença que o inglês certo faz na carreira. O Beyond The Lab nasceu
              para encurtar esse caminho, com proximidade, profundidade técnica e um método pensado para gente como você.
            </p>

            <div className="mt-7 flex flex-wrap" style={{ rowGap: 10, columnGap: 24 /* ⚠️ derivado */ }}>
              {tags.map((t, i) => (
                <span
                  key={t}
                  /* ⚠️ font-size 16 / leading 22 — desvio do Dev Mode (12/16), pedido manual */
                  /* scale + cor: a tag nunca desloca o layout ao redor */
                  className="reveal relative inline-flex items-center gap-2 rounded-full border border-[#E8E3E3] bg-white px-[14px] py-[6px] font-display text-[16px] font-medium leading-[22px] text-[#345372] [transition:transform_var(--motion-short)_var(--ease-out),border-color_var(--motion-short)_var(--ease-out),color_var(--motion-short)_var(--ease-out)] hover:z-10 hover:scale-[1.06] hover:border-brand/30 hover:text-brand"
                  style={{ '--reveal-delay': `${120 + i * 70}ms` }}
                >
                  {t}
                </span>
              ))}
            </div>

            <a href="#lista" className="btn-brand reveal mt-8 w-[300px]" style={{ '--reveal-delay': '420ms' }}>
              Lista de espera
              <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
