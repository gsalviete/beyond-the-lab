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
