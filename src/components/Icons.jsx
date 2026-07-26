// Simple inline SVG icon set — stroke inherits currentColor unless noted.

export const ArrowUpRight = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7" /><path d="M8 7h9v9" />
  </svg>
)

export const ArrowCta = ({ className = 'h-10 w-10' }) => (
  <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g clipPath="url(#arrow-cta-clip)">
      <path opacity="0.4" d="M28.0486 28.0486C32.6047 23.4925 32.6047 16.1055 28.0486 11.5494C23.4925 6.99329 16.1055 6.99333 11.5494 11.5494C6.99329 16.1055 6.99329 23.4924 11.5494 28.0486C16.1055 32.6046 23.4925 32.6047 28.0486 28.0486Z" fill="white"/>
      <path d="M22.6856 16.0367L17.7359 16.0367C17.2574 16.0367 16.8614 16.4327 16.8614 16.9112C16.8614 17.3896 17.2574 17.7856 17.7359 17.7856H20.5737L16.2922 22.0671C15.954 22.4054 15.954 22.9663 16.2922 23.3046C16.6304 23.6428 17.1914 23.6428 17.5297 23.3046L21.8112 19.0231L21.8112 21.8609C21.8112 22.3394 22.2072 22.7354 22.6856 22.7354C22.9331 22.7354 23.1476 22.6364 23.3044 22.4796C23.4611 22.3229 23.5601 22.1084 23.5601 21.8609L23.5601 16.9112C23.5601 16.4327 23.1641 16.0367 22.6856 16.0367Z" fill="white"/>
    </g>
    <defs>
      <clipPath id="arrow-cta-clip">
        <rect width="28" height="28" fill="white" transform="translate(0 19.799) rotate(-45)"/>
      </clipPath>
    </defs>
  </svg>
)

export const Check = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const ChevronRight = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const Plus = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Play = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)

export const FileText = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 9h1M9 13h6M9 17h6" />
  </svg>
)

export const Shield = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
  </svg>
)

export const Trophy = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12v3a6 6 0 0 1-12 0Z" /><path d="M18 5h2a2 2 0 0 1 0 4h-2M6 5H4a2 2 0 0 0 0 4h2" /><path d="M9 15h6M10 15l-1 4h6l-1-4M8 19h8" />
  </svg>
)

export const Lock = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

// Timeline step icons
export const Clipboard = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="4" width="10" height="16" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h4" />
  </svg>
)
export const Cap = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-4 9 4-9 4-9-4Z" /><path d="M7 11v4c0 1 2.5 2.5 5 2.5s5-1.5 5-2.5v-4" />
  </svg>
)
export const Users = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5" />
  </svg>
)
export const Rocket = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5" /><path d="M9 15a15 15 0 0 1 8-11c3 0 4 1 4 4a15 15 0 0 1-11 8Z" /><circle cx="15" cy="9" r="1.6" />
  </svg>
)
export const TrendUp = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" />
  </svg>
)

export const Logo = ({ className = 'h-7' }) => (
  <span className={`font-display text-xl font-extrabold tracking-tight ${className}`} />
)

export const Microscope = ({ className = '', style }) => (
  <svg
    className={className}
    width="536"
    height="759"
    viewBox="0 0 536 759"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      opacity="0.15"
      fill="#115CA4"
      d="M450.299 759H127.709C117.9 759 109.875 750.979 109.875 741.176V737.215L151.685 709.192C154.558 706.32 158.422 704.637 162.484 704.637H246.104V605.119H237.088C173.977 605.02 114.532 580.264 69.6503 535.308C24.769 490.352 0 430.938 0 367.861C0 304.784 24.769 245.172 69.7494 200.315C114.73 155.458 174.274 130.603 237.386 130.603H368.661L413.146 23.6587C421.468 3.95317 444.157 -5.25593 463.774 3.06196L511.726 23.2626C531.343 31.5804 540.657 54.2566 532.334 73.8631L434.745 306.962C428.701 321.221 414.731 330.43 399.573 330.629L385.108 364.89L307.333 332.114L321.996 297.258C312.386 286.266 309.711 270.621 315.457 256.857L326.356 230.913H246.6C210.14 230.913 175.76 245.172 149.803 271.215C123.845 297.159 109.479 331.52 109.479 367.96V368.257C109.479 404.697 123.746 439.058 149.803 465.002C175.76 490.946 210.14 505.304 246.6 505.304H486.066C513.114 505.304 536 527.881 536 554.617V556.4C536 583.433 514.005 605.416 486.957 605.416H331.805V704.934H415.425C419.487 704.934 423.351 706.518 426.224 709.489L468.133 737.512V741.473C468.133 751.078 460.108 759 450.299 759ZM126.52 743.949C126.916 744.147 127.312 744.147 127.709 744.147H450.299C450.696 744.147 451.092 744.048 451.488 743.949L416.416 720.381L415.722 719.589C415.722 719.49 415.623 719.49 415.524 719.49H317.043V590.266H487.156C505.98 590.266 521.337 574.917 521.337 556.103V554.32C521.337 535.605 505.286 519.861 486.264 519.861H246.798C206.375 519.861 168.231 504.017 139.499 475.3C110.767 446.584 94.9146 408.46 94.9146 368.059V367.762C94.9146 327.361 110.767 289.237 139.499 260.521C168.231 231.804 206.375 215.96 246.798 215.96H348.945L329.328 262.501C325.266 272.007 327.941 282.999 335.768 289.831L339.83 293.396L326.851 324.192L377.281 345.383L390.16 314.785L395.808 315.577C406.508 317.062 416.911 311.22 421.072 301.318L518.662 68.2188C521.139 62.3765 521.139 55.94 518.761 49.9986C516.383 44.0573 511.826 39.5023 505.98 37.0267L458.027 16.8261C452.182 14.3505 445.742 14.3505 439.797 16.7271C433.853 19.1036 429.295 23.6586 426.818 29.501L378.569 145.654H237.584C178.436 145.654 122.557 168.826 80.4495 211.009C38.3423 253.193 15.0595 308.943 15.0595 368.059C15.0595 427.175 38.2432 482.925 80.3505 525.01C122.458 567.094 178.237 590.365 237.386 590.464H261.164V719.688H162.682C162.583 719.688 162.484 719.688 162.385 719.787L161.692 720.579L126.52 743.949Z"
    />
  </svg>
)
