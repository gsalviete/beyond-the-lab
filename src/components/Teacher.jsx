import { ArrowUpRight } from './Icons.jsx'
import CtaInscricao from './CtaInscricao.jsx'

const tags = ['Experiência internacional', 'Especialista em Reprodução Humana', 'Vivência prática', 'Mercado internacional']

// Geometria lida direto do SVG — nada estimado
const SCREEN = { left: 13, top: 8, width: 317, height: 626, radius: 16 }

// A moldura tem 343×642 e não pode ser cortada numa tela de 375. Em vez de
// inventar uma segunda geometria, o conjunto vira proporcional: cada medida
// do SVG passa a ser % do frame. Em 343px de largura os valores voltam a bater
// exatamente (13, 8, 317, 626), então o desktop não se mexe.
const pct = (v, base) => `${(v / base) * 100}%`
const SCREEN_PCT = {
  left: pct(SCREEN.left, 343),
  top: pct(SCREEN.top, 642),
  width: pct(SCREEN.width, 343),
  height: pct(SCREEN.height, 642),
}

function PhoneVideo() {
  return (
    /* ⚠️ 343×642 é o tamanho natural do SVG — confirmar o tamanho do nó no Dev Mode */
    <div
      className="relative mx-auto w-full max-w-[343px]"
      style={{ aspectRatio: '343 / 642' }}
    >
      {/* moldura vetorial */}
      <img
        src="/assets/phone-frame.svg"
        alt=""
        aria-hidden="true"
        draggable="false"
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      />

      {/* vídeo por cima (o rect da tela no SVG é branco opaco) */}
      {/* As legendas são queimadas na imagem pela edição — não existe faixa de
         texto para expor num <track>. Não procure o .vtt, ele não existe. */}
      {/* controls nativo de propósito: dá teclado, foco e anúncio de play/pause
         sem estado próprio, e é o que mantém este componente como server. */}
      <video
        className="absolute object-cover"
        src="/assets/teacher.mp4"
        poster="/assets/teacher-poster.jpg"
        aria-label="Giovanna, professora do Beyond The Lab, falando para a câmera"
        controls
        playsInline
        preload="metadata"
        style={{ ...SCREEN_PCT, borderRadius: SCREEN.radius }}
      />
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
        /* decorativo puro, ancorado em coordenadas do frame de 1440 */
        className="pointer-events-none absolute hidden select-none lg:block"
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
            className="reveal h2-section mt-3 w-full text-center font-display font-semibold leading-[normal] text-ink"
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
            <p className="reveal p-section font-display font-normal leading-[1.6] text-body">
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

            <CtaInscricao className="btn-brand reveal mt-8 w-[300px] max-w-full" style={{ '--reveal-delay': '420ms' }}>
              Lista de espera
              <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
            </CtaInscricao>
          </div>
        </div>
      </div>
    </section>
  )
}
