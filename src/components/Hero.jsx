import { ArrowUpRight, Check } from './Icons.jsx'
import { Cell } from './Decor.jsx'

const perks = [
  { label: 'Conteúdo especializado',       w: 'w-[96px]'  },
  { label: 'Separado por nível de inglês', w: 'w-[102px]' },
  { label: 'Grupo no whatsapp',            w: '' },
  { label: 'Aula ao vivo',                 w: '' },
]

const PORTRAIT = '/assets/hero.png'

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-28 lg:pt-[190px]">
      <div className="container-page grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-0">

        {/* ---------- COLUNA ESQUERDA ---------- */}
        <div>
          {/* Figma: 244 x 28 */}
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-white pl-[1px] pr-4
                 text-[11.722px] font-normal leading-none tracking-[-0.352px] text-ink
                 shadow-[0_10px_26px_-16px_rgba(2,45,87,0.18)] ring-1 ring-ink/[0.05]">

            {/* Figma: 30x26, radius full, gradiente 180deg, shadow lilás */}
            <span className="flex h-[26px] w-[30px] shrink-0 items-center justify-center rounded-full
                            bg-[linear-gradient(180deg,rgba(196,68,222,0)_0%,rgba(255,69,119,0.17)_100%)]
                            shadow-[0_3.168px_4.816px_0_rgba(97,83,238,0.10)]">
              <svg
                width="25" height="23" viewBox="0 0 25 23" fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ filter: 'drop-shadow(0 3.485px 5.386px rgba(97,83,238,0.31))' }}
              >
                <path
                  d="M5.38593 4.05259L12.0866 1.90091V16.7914C7.3001 14.8058 5.38593 11.0005 5.38593 8.85031V4.05259ZM18.7874 4.05259L12.0866 1.90091V16.7914C16.8732 14.8058 18.7874 11.0005 18.7874 8.85031V4.05259Z"
                  fill="url(#shieldGrad)"
                  fillOpacity="0.7"
                />
                <defs>
                  <linearGradient id="shieldGrad" x1="12.0866" y1="1.90091" x2="12.0866" y2="16.7914"
                                  gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FF4B7C" />
                    <stop offset="1" stopColor="#FF4E7E" />
                  </linearGradient>
                </defs>
              </svg>
            </span>

            Especialista em Reprodução Humana
          </span>

          {/* Figma: flex column, gap 24, width 665 (conteúdo 608) */}
          <div className="mt-[26px] flex max-w-[665px] flex-col items-start gap-6">
            <h1 className="max-w-[608px] font-display text-[46px] font-semibold leading-[55px] text-ink">
              Desenvolva o <span className="text-grad">inglês</span> que te impulsiona no laboratório da{' '}
              <span className="text-grad">Reprodução Humana.</span>
            </h1>

            <p className="text-[16px] leading-6 text-body">
              Um curso com duração de 6 meses desenvolvido por quem entende o cenário para quem quer estudar,
              pesquisar e atuar com mais segurança em um mercado cada vez mais global.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <a href="#lista" className="btn-brand w-[300px]">
                Lista de espera
                <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
              </a>
              <a href="#curso" className="btn-outline">Conteúdo programático</a>
            </div>
          </div>

          {/* Figma: UMA linha só, ~480px, fonte 12px */}
          {/* sem max-w no ul; shrink-0 impede o esmagamento */}
          <ul className="mt-6 flex items-start gap-4 text-[11.722px] font-normal
               leading-none tracking-[-0.352px] text-body">
            {perks.map(({ label, w }) => (
              <li key={label} className={`flex shrink-0 items-center gap-1 ${w}`}>
                <Check className="h-3 w-3 shrink-0 text-cobalt" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ---------- COLUNA DIREITA ---------- */}
        {/* card 41px mais baixo que o texto (Figma: badge y=190, card y=231) */}
        <div className="relative lg:mt-[41px]">

          {/* CARD — Figma: 480 x 656, radius 24, border 0.873px #FF5986, bg #FFF */}
          <div className="relative h-[560px] w-full overflow-hidden rounded-[24px]
                          border-[0.873px] border-brand-line bg-white sm:h-[656px]">
            {/* washes rosa */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFEAF1] via-[#FFF6F9] to-white" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_70%_at_50%_0%,rgba(255,205,220,0.38)_0%,transparent_65%)]" />

            {/* grade sutil — o Figma tem essa textura */}
            <div className="pointer-events-none absolute inset-0 opacity-40
                            bg-[linear-gradient(to_right,rgba(255,255,255,0.65)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.65)_1px,transparent_1px)]
                            bg-[length:38px_38px]" />

            <div className="pointer-events-none absolute left-[12%] top-[6%] z-0 h-20 w-20 rounded-full
                bg-[radial-gradient(circle,rgba(255,255,255,0.75)_0%,transparent_70%)]" /> 

            <img
              src={PORTRAIT}
              alt="Profissional de laboratório sorrindo em jaleco branco"
              className="absolute bottom-0 left-1/2 z-10 h-[95%] w-auto max-w-none -translate-x-1/2 object-contain"
            />
          </div>

          {/* BADGE — transborda 42px à direita, 52px acima do topo do card */}
          {/* Figma: padding 13/37/13/16, radius 16, gradiente 87deg */}
          <div className="absolute -top-[52px] -right-[42px] z-30 rounded-2xl bg-badge-grad
                py-[13px] pl-4 pr-[37px] text-white">
            <p className="text-[13px] leading-[17px] text-white/80">Primeira turma</p>
            <p className="font-display text-[30px] font-semibold leading-[37px]">Setembro</p>
          </div>

          {/* BANDEIRA — Figma: ~35px acima da base do card */}
          <img
            src="/assets/flag.png"
            alt="Inglês"
            className="animate-floaty absolute bottom-[35px] -left-8 z-30 h-16 w-16 rounded-2xl shadow-card"
          />

          {/* ESPERMATOZOIDE — cabeça fora do canto inferior direito */}
          <img
            src="/assets/sperm.png"
            alt=""
            className="animate-floaty pointer-events-none absolute -bottom-16 -right-10 z-20 h-[180px] w-auto"
          />
        </div>
      </div>
    </section>
  )
}