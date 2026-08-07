import { CRBM } from '@/config/curso'
import { Shield } from './Icons.jsx'

// ============================================================
// BADGE DE CREDENCIAL — registro profissional da professora
//
// Antes o CRBM aparecia como uma linha de legenda em `text-muted`, do mesmo
// peso do copyright do rodapé: presente, mas sem nenhuma leitura de
// autoridade. Aqui ele vira um selo.
//
// Nada de cor, raio, sombra ou tipografia é inventado:
//   - fundo: `bg-badge-grad`, o mesmo token do badge "Primeira turma" do hero
//     e do chip da bandeira (tailwind.config.js) — é o azul institucional que a
//     página já usa para marcar autoridade, em oposição ao rosa de ação;
//   - sombra: `shadow-badge`, token existente;
//   - ícone: `Shield`, o mesmo já usado em "Compra segura" no card de preço;
//   - o número herda `font-display`, a família única do projeto.
//
// Contraste: branco sobre o ponto mais claro do gradiente (#115CA4) dá
// 6,79:1 — passa AA com folga, e melhora ainda mais em direção ao #102449.
//
// O número é TEXTO REAL, selecionável e copiável. Nunca imagem: quem precisa
// conferir um registro profissional precisa poder colar o número.
// ============================================================

export default function CredencialCrbm({ className = '', compacto = false }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-badge-grad
                  shadow-badge ring-1 ring-white/10
                  ${compacto ? 'py-1 pl-1.5 pr-3' : 'py-1.5 pl-2 pr-4'}
                  ${className}`}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-white/15 text-white
                    ${compacto ? 'h-5 w-5' : 'h-6 w-6'}`}
      >
        <Shield className={compacto ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </span>

      {/* `compacto` some com a legenda e deixa só o número — no rodapé o
          contexto já é institucional e a linha dupla competiria com o
          wordmark logo acima. */}
      <span className="flex flex-col justify-center leading-none">
        <span
          className={`font-display font-semibold leading-none text-white
                      ${compacto ? 'text-[13px]' : 'text-[15px]'}`}
        >
          {CRBM}
        </span>
      </span>
    </span>
  )
}
