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

// Timeline step icons — Lucide 20×20, stroke 1.58333 (= 1.9 em viewBox 24)
// Cor via currentColor: o wrapper de cada etapa define text-white ou text-[#F15D89]
export const Clipboard = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.4998 1.66797H7.49984C7.0396 1.66797 6.6665 2.04106 6.6665 2.5013V4.16797C6.6665 4.62821 7.0396 5.0013 7.49984 5.0013H12.4998C12.9601 5.0013 13.3332 4.62821 13.3332 4.16797V2.5013C13.3332 2.04106 12.9601 1.66797 12.4998 1.66797Z" />
    <path d="M13.3335 3.33203H15.0002C15.4422 3.33203 15.8661 3.50763 16.1787 3.82019C16.4912 4.13275 16.6668 4.55667 16.6668 4.9987V16.6654C16.6668 17.1074 16.4912 17.5313 16.1787 17.8439C15.8661 18.1564 15.4422 18.332 15.0002 18.332H5.00016C4.55814 18.332 4.13421 18.1564 3.82165 17.8439C3.50909 17.5313 3.3335 17.1074 3.3335 16.6654V4.9987C3.3335 4.55667 3.50909 4.13275 3.82165 3.82019C4.13421 3.50763 4.55814 3.33203 5.00016 3.33203H6.66683" />
    <path d="M10 9.16797H13.3333" />
    <path d="M10 13.332H13.3333" />
    <path d="M6.6665 9.16797H6.67484" />
    <path d="M6.6665 13.332H6.67484" />
  </svg>
)

export const Cap = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.8498 9.10131C17.999 9.0355 18.1256 8.92737 18.2139 8.79032C18.3023 8.65326 18.3485 8.49331 18.3468 8.33026C18.3451 8.16722 18.2956 8.00825 18.2045 7.87305C18.1133 7.73785 17.9845 7.63236 17.834 7.56965L10.6915 4.31631C10.4744 4.21727 10.2385 4.16602 9.99983 4.16602C9.76117 4.16602 9.5253 4.21727 9.30816 4.31631L2.1665 7.56631C2.01814 7.63129 1.89193 7.73809 1.8033 7.87366C1.71468 8.00923 1.66748 8.16768 1.66748 8.32965C1.66748 8.49161 1.71468 8.65007 1.8033 8.78563C1.89193 8.9212 2.01814 9.028 2.1665 9.09298L9.30816 12.3496C9.5253 12.4487 9.76117 12.4999 9.99983 12.4999C10.2385 12.4999 10.4744 12.4487 10.6915 12.3496L17.8498 9.10131Z" />
    <path d="M18.3335 8.33203V13.332" />
    <path d="M5 10.418V13.3346C5 13.9977 5.52678 14.6336 6.46447 15.1024C7.40215 15.5712 8.67392 15.8346 10 15.8346C11.3261 15.8346 12.5979 15.5712 13.5355 15.1024C14.4732 14.6336 15 13.9977 15 13.3346V10.418" />
  </svg>
)

export const Users = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.9998 17.4987C14.9998 15.7306 14.2975 14.0349 13.0472 12.7847C11.797 11.5344 10.1013 10.832 8.33317 10.832C6.56506 10.832 4.86937 11.5344 3.61913 12.7847C2.36888 14.0349 1.6665 15.7306 1.6665 17.4987" />
    <path d="M8.33335 10.8333C10.6345 10.8333 12.5 8.96785 12.5 6.66667C12.5 4.36548 10.6345 2.5 8.33335 2.5C6.03217 2.5 4.16669 4.36548 4.16669 6.66667C4.16669 8.96785 6.03217 10.8333 8.33335 10.8333Z" />
    <path d="M18.3333 16.6654C18.3333 13.857 16.6667 11.2487 15 9.9987C15.5478 9.58767 15.9859 9.04794 16.2755 8.42725C16.565 7.80657 16.6971 7.12409 16.66 6.4402C16.6229 5.75631 16.4178 5.0921 16.0629 4.50636C15.7079 3.92063 15.2141 3.43142 14.625 3.08203" />
  </svg>
)

export const Rocket = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 12.4987V16.6654C10 16.6654 12.525 16.207 13.3333 14.9987C14.2333 13.6487 13.3333 10.832 13.3333 10.832" />
    <path d="M2.08331 17.9167C2.08331 17.9167 2.49998 14.8 3.74998 13.75C4.09238 13.4615 4.52928 13.3095 4.97683 13.3234C5.42439 13.3372 5.85107 13.5159 6.17498 13.825C6.83331 14.475 6.84165 15.55 6.24998 16.25C5.19998 17.5 2.08331 17.9167 2.08331 17.9167Z" />
    <path d="M7.5 9.99956C7.94345 8.84908 8.50184 7.74627 9.16667 6.70789C10.1377 5.15538 11.4897 3.8771 13.0942 2.99463C14.6986 2.11217 16.5022 1.65486 18.3333 1.66622C18.3333 3.93289 17.6833 7.91622 13.3333 10.8329C12.2806 11.4982 11.1639 12.0566 10 12.4996L7.5 9.99956Z" />
    <path d="M7.49998 9.99991H3.33331C3.33331 9.99991 3.79165 7.47491 4.99998 6.66658C6.34998 5.76658 9.16665 6.70824 9.16665 6.70824" />
  </svg>
)

export const TrendUp = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.3335 5.83203H18.3335V10.832" />
    <path d="M18.3332 5.83203L11.2498 12.9154L7.08317 8.7487L1.6665 14.1654" />
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
