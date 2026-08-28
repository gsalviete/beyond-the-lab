'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ============================================================
// OS ITENS DO MENU, NUM LUGAR SÓ
//
// ⚠️ ELES ESTAVAM ESCRITOS DUAS VEZES — uma no menu de desktop, outra no
// de mobile — e a duplicação produziu o mesmo defeito TRÊS vezes seguidas
// durante a implementação: acrescentar um item numa lista e não na outra,
// ou acrescentar duas vezes na mesma. Nenhuma das três apareceu no `tsc`
// (que não verifica `.jsx`) nem em teste nenhum; as três apareceram
// abrindo a página.
//
// Uma lista só é o mecanismo que torna aquilo impossível, em vez da
// disciplina de lembrar dos dois lugares. É a 8.3 do `REPORT.md` aplicada
// a um `<nav>`.
//
// ⚠️ ELE VIROU CLIENT COMPONENT PARA SABER ONDE A PESSOA ESTÁ. O casco
// continua sendo Server Component — quem desceu para o cliente foi só a
// lista de links, que não lê nada do banco. O guard de sessão não é
// afetado: ele roda no layout, no servidor, antes de isto existir.
//
// ⚠️ E O ESTADO ATIVO É MARCADO DE TRÊS JEITOS DE PROPÓSITO: cor, peso da
// fonte e a barrinha embaixo. Cor sozinha não serve — quem não distingue o
// rosa do azul-tinta ficaria sem saber em que tela está, e "onde eu estou"
// é a pergunta que uma navegação existe para responder.
// ============================================================

const ITENS = [
  { href: '/admin', rotulo: 'Página inicial' },
  { href: '/admin/safras', rotulo: 'Turmas' },
  { href: '/admin/alunas', rotulo: 'Alunas' },
  { href: '/admin/alocacao', rotulo: 'Horários' },
  { href: '/admin/espera', rotulo: 'Lista de espera' },
  { href: '/admin/pendentes', rotulo: 'Pendentes' },
  { href: '/admin/cupons', rotulo: 'Cupons' },
]

export default function MenuDoPainel() {
  const caminho = usePathname()

  return (
    <>
      {ITENS.map((item) => (
        <ItemDeMenu key={item.href} href={item.href} ativo={estaEm(caminho, item.href)}>
          {item.rotulo}
        </ItemDeMenu>
      ))}
    </>
  )
}

/**
 * ⚠️ `/admin` PRECISA DE COMPARAÇÃO EXATA e o resto não.
 *
 * Todas as rotas do painel começam com `/admin`, então um `startsWith`
 * cru deixaria a página inicial marcada como ativa em TODAS as telas — e
 * dois itens acesos ao mesmo tempo é pior do que nenhum. Já a ficha de uma
 * aluna (`/admin/alunas/<id>`) tem que acender "Alunas": é onde a pessoa
 * está, mesmo não sendo a URL do item.
 */
function estaEm(caminho, href) {
  if (href === '/admin') return caminho === '/admin'
  return caminho === href || caminho.startsWith(`${href}/`)
}

function ItemDeMenu({ href, ativo, children }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      className={`relative shrink-0 whitespace-nowrap pb-1 font-sans text-[15px]
                  [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand ${
                    ativo ? 'font-semibold text-brand' : 'font-medium text-ink/80'
                  }`}
    >
      {children}
      {/* A barrinha. `absolute` para não empurrar os outros itens quando
          aparece — um menu que muda de altura ao navegar pisca a cada
          clique. */}
      {ativo && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full bg-brand"
        />
      )}
    </Link>
  )
}
