import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, Check } from './Icons.jsx'
import LinkListaEspera from './LinkListaEspera.jsx'

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
          <span className="reveal-hero inline-flex h-7 items-center gap-2 rounded-full bg-white pl-[1px] pr-4
                           text-[13.722px] font-normal leading-none tracking-[-0.352px] text-ink
                           shadow-[0_10px_26px_-16px_rgba(2,45,87,0.18)] ring-1 ring-ink/[0.05]"
                style={{ '--reveal-delay': '40ms' }}>
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

          {/* Figma: flex column, gap 24, width 665 (H1 limitado a 608) */}
          <div className="mt-[26px] flex max-w-[665px] flex-col items-start gap-6">
            <h1
              className="reveal-hero h1-hero max-w-[608px] font-display font-semibold text-ink"
              style={{ '--reveal-delay': '130ms' }}
            >
              Desenvolva o <span className="text-grad">inglês</span> que te impulsiona no laboratório da{' '}
              <span className="text-grad">Reprodução Humana.</span>
            </h1>

            <p className="reveal text-[16px] leading-6 text-body" style={{ '--reveal-delay': '240ms' }}>
              Um curso com duração de 6 meses desenvolvido por quem entende o cenário para quem quer estudar,
              pesquisar e atuar com mais segurança em um mercado cada vez mais global.
            </p>

            {/* CTA principal nunca passa de 500ms — a pessoa precisa poder agir logo */}
            <div className="reveal flex flex-wrap items-center gap-4" style={{ '--reveal-delay': '340ms' }}>
              <LinkListaEspera className="btn-brand w-[300px] max-w-full">
                Lista de espera
                <span className="arrow-badge"><ArrowUpRight className="h-4 w-4" /></span>
              </LinkListaEspera>
              <Link href="/conteudo-programatico" className="btn-outline">Conteúdo programático</Link>
            </div>
          </div>

          {/* Figma: uma linha, gap 16, itens 96 / 102 / auto / auto */}
          {/* flex-wrap: em telas estreitas os 4 perks não podem sair da viewport
              (fora da tela eles nunca cruzariam o observer e ficariam invisíveis) */}
          <ul className="mt-6 flex flex-wrap items-start gap-4 text-[13.722px] font-normal
                         leading-none tracking-[-0.352px] text-body">
            {perks.map(({ label, w }, i) => (
              <li
                key={label}
                className={`reveal flex shrink-0 items-center gap-1 ${w}`}
                style={{ '--reveal-delay': `${420 + i * 60}ms` }}
              >
                <Check className="h-3 w-3 shrink-0 text-cobalt" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ---------- COLUNA DIREITA ---------- */}
        {/* card 41px mais baixo que o texto (Figma: badge y=190, card y=231) */}
        <div className="relative lg:mt-[41px]">

          {/* CARD — Figma: 480 x 656, radius 24, border 0.873px #FF5986 */}
          {/* superfície visual do hero: fade + escala mínima, terminando estável */}
          <div className="hero-surface relative h-[560px] w-full overflow-hidden rounded-[24px]
                          border-[0.873px] border-brand-line bg-white sm:h-[656px]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFEAF1] via-[#FFF6F9] to-white" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_70%_at_50%_0%,rgba(255,205,220,0.38)_0%,transparent_65%)]" />

            {/* grade sutil */}
            <div className="pointer-events-none absolute inset-0 opacity-40
                            bg-[linear-gradient(to_right,rgba(255,255,255,0.65)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.65)_1px,transparent_1px)]
                            bg-[length:38px_38px]" />

            {/* brilho — atrás da foto */}
            <div className="pointer-events-none absolute left-[12%] top-[6%] z-0 h-20 w-20 rounded-full
                            bg-[radial-gradient(circle,rgba(255,255,255,0.75)_0%,transparent_70%)]" />

            {/* elemento LCP da página. `priority` = preload + fetchpriority="high"
                e desliga o lazy; `sizes` mantém o mobile em ~380px de largura
                servida em vez do PNG de 906px. As medidas vêm da altura do card:
                h-[95%] de 560/656 com w-auto e proporção 906/1312. */}
            <Image
              src={PORTRAIT}
              alt="Profissional de laboratório sorrindo em jaleco branco"
              width={906}
              height={1312}
              priority
              sizes="(min-width: 640px) 460px, 380px"
              className="absolute bottom-0 left-1/2 z-10 h-[95%] w-auto max-w-none -translate-x-1/2 object-contain"
            />
          </div>

          {/* BADGE — Figma: padding 13/37/13/16, radius 16, gradiente 87deg */}
          {/* ⚠️ derivado: no mobile o badge não pode sangrar pra fora do card
              (a coluna ocupa a largura toda), então recolhe pra dentro do topo */}
          <div className="reveal absolute right-3 top-3 z-30 rounded-2xl bg-badge-grad
                          py-[13px] pl-4 pr-[37px] text-white
                          lg:-top-[52px] lg:-right-[42px]"
               style={{ '--reveal-delay': '460ms' }}>
            <p className="text-[13px] leading-[17px] text-white/80">Primeira turma</p>
            <p className="font-display text-[30px] font-semibold leading-[37px]">Setembro</p>
          </div>

          {/* BANDEIRA — Figma: 62.36 x 59.2, rotate -10.174°, radius 19 */}
          {/* BANDEIRA — SVG completo do Figma (chip + bandeira + rotação embutidos) */}
          <img
            src="/assets/flag.svg"
            alt="Inglês"
            /* 122×120 é o viewBox do SVG — presente só para reservar a caixa
               e não deixar o CLS sair de 0; a largura real vem do w-[82px] */
            width={122}
            height={120}
            decoding="async"
            /* ⚠️ derivado: no mobile encosta na borda de dentro em vez de sangrar */
            className="animate-floaty absolute -bottom-4 left-2 z-30 w-[82px]
                       lg:-bottom-[38px] lg:-left-[30px]"
          />
          
          {/* ESPERMATOZOIDE — SVG do Figma, 159 x 152 */}
          <svg
            width="159" height="152" viewBox="0 0 159 152" fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            /* puramente decorativo e ancorado ao frame de 1440: no mobile só
               sangraria pra fora do card, então sai de cena */
            className="animate-floaty pointer-events-none absolute -bottom-[63px] -right-[78px] z-20 hidden lg:block"
          >
            <g clipPath="url(#spermClip)">
              <path
                opacity="0.85"
                d="M118.785 62.1585L117.617 62.2754C110.882 58.1271 104.556 52.521 100.067 46.1139C100.232 45.979 100.383 45.61 100.183 45.3401C98.2613 42.717 96.7233 40.1119 95.7114 36.9534C93.955 31.4642 94.8109 25.4801 98.6937 20.9043C106.571 11.6133 117.194 4.90931 128.923 1.65631C137.054 -0.597838 149.309 -1.36272 154.814 4.73834C160.632 11.1858 159.468 23.6939 156.851 32.1481C153.504 42.9509 147.329 52.6559 138.949 60.1113C133.104 65.3125 125.392 65.6949 118.785 62.154V62.1585Z"
                fill="url(#spermGradA)"
              />
              <path
                opacity="0.85"
                d="M100.062 46.1126C100.7 45.9867 101.065 46.5131 101.466 47.026C105.835 52.5826 112.825 58.9582 118.781 62.1527C111.675 66.139 102.385 65.1132 96.955 67.7903C93.1747 69.6575 90.4821 73.2839 89.4657 77.3648L87.794 84.0958C86.7687 88.2306 84.7448 91.6411 82.1191 94.8896C76.2926 102.097 68.1213 106.106 58.9068 106.633C50.4323 107.119 43.2551 112 40.7453 120.275L37.6158 130.583C33.5859 140.612 24.0148 146.695 13.3827 147.208C8.30513 147.45 4.07013 149.133 -0.00439453 151.995C3.4906 148.044 8.25164 145.957 13.4496 144.976C22.8334 143.199 30.5055 136.594 32.36 126.97L33.2828 118.862C33.7107 115.096 35.1729 112.018 37.1701 108.905C41.8107 101.666 48.9166 96.7568 57.4045 95.2451C59.941 94.7951 62.2725 93.8593 64.4925 92.6445C74.5094 87.1598 72.1869 75.3896 74.9329 67.7633C78.9718 56.551 88.6276 48.4163 100.062 46.1126Z"
                fill="url(#spermGradB)"
              />
            </g>
            <defs>
              <linearGradient id="spermGradA" x1="94.8408" y1="54.6244" x2="164.624" y2="49.005"
                              gradientUnits="userSpaceOnUse">
                <stop stopColor="#F75883" />
                <stop offset="0.514976" stopColor="#FF7EA1" />
                <stop offset="1" stopColor="#FF487A" />
              </linearGradient>
              <linearGradient id="spermGradB" x1="-0.00439405" y1="135.815" x2="128.96" y2="124.111"
                              gradientUnits="userSpaceOnUse">
                <stop stopColor="#F75883" />
                <stop offset="0.514976" stopColor="#FF7EA1" />
                <stop offset="1" stopColor="#FF487A" />
              </linearGradient>
              <clipPath id="spermClip">
                <rect width="159" height="152" fill="white" />
              </clipPath>
            </defs>
          </svg>
        </div>
      </div>
    </section>
  )
}