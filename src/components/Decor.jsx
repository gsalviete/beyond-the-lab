// Decorative motifs used across sections (hero accent + faint backgrounds).

// Pink sperm illustration — teardrop head + smooth tapered S-tail (matches Figma asset).
export const Sperm = ({ className = 'h-24 w-24', gradFrom = '#FF9CB6', gradTo = '#F0477C', id = 'spermG' }) => (
  <svg className={className} viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={id} x1="30" y1="220" x2="160" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor={gradFrom} />
        <stop offset="1" stopColor={gradTo} />
      </linearGradient>
    </defs>
    {/* tail — tapered S curve */}
    <path
      d="M124 100 C 102 132, 66 128, 55 158"
      stroke={`url(#${id})`}
      strokeWidth="15"
      strokeLinecap="round"
    />
    <path
      d="M55 158 C 46 184, 22 190, 10 222"
      stroke={`url(#${id})`}
      strokeWidth="8.5"
      strokeLinecap="round"
    />
    {/* head — rounded teardrop pointing down-left toward tail */}
    <path
      d="M124 104 C 106 88, 106 60, 126 44 C 146 28, 176 32, 186 54 C 196 76, 184 100, 160 108 C 146 113, 133 112, 124 104 Z"
      fill={`url(#${id})`}
    />
  </svg>
)

// Big faint outline sperm — background motif (light blue line-art like the Figma bg icons).
export const SpermOutline = ({ className = 'h-96 w-96', stroke = '#DDE8F5', strokeWidth = 10 }) => (
  <svg className={className} viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="268" cy="130" rx="78" ry="92" transform="rotate(32 268 130)" stroke={stroke} strokeWidth={strokeWidth} />
    <path
      d="M215 195 C 160 260, 90 250, 70 310 C 55 355, 20 360, 4 396"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </svg>
)

// Faint cell (célula) — outlined circle with nucleus.
export const Cell = ({ className = 'h-16 w-16', stroke = '#DDE8F5' }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" stroke={stroke} strokeWidth="3" />
    <circle cx="34" cy="30" r="9" stroke={stroke} strokeWidth="3" />
  </svg>
)

// Ring + dot (óvulo simplificado) — used on pink boxes.
export const RingDot = ({ className = 'h-10 w-10', stroke = '#FFFFFF' }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="20" stroke={stroke} strokeWidth="3.5" />
    <circle cx="24" cy="24" r="7" fill={stroke} fillOpacity="0.9" />
  </svg>
)

// Faint DNA double helix.
export const Dna = ({ className = 'h-24 w-12', stroke = '#DDE8F5', strokeWidth = 3 }) => (
  <svg className={className} viewBox="0 0 48 120" fill="none">
    <path d="M12 4C40 24 8 44 36 64C8 84 40 104 12 116" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    <path d="M36 4C8 24 40 44 12 64C40 84 8 104 36 116" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    <path d="M16 16h16M15 34h18M15 82h18M16 100h16" stroke={stroke} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
  </svg>
)

// Faint microscope outline.
export const Microscope = ({ className = 'h-20 w-20', stroke = '#DDE8F5' }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 52h28" stroke={stroke} strokeWidth="3" />
    <path d="M26 52c-8-4-12-14-8-24" stroke={stroke} strokeWidth="3" />
    <rect x="30" y="10" width="9" height="24" rx="4" transform="rotate(18 34 22)" stroke={stroke} strokeWidth="3" />
    <path d="M22 40l6-3M40 44h6a6 6 0 0 0 6-6" stroke={stroke} strokeWidth="3" />
  </svg>
)

// Speech-bubble line motif (squared, matches the Figma background line-art).
export const Bubble = ({ className = 'h-40 w-40', stroke = '#DDE8F5', strokeWidth = 8 }) => (
  <svg className={className} viewBox="0 0 160 130" fill="none">
    <path d="M10 10h140v78H74l-24 24V88H10z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </svg>
)
