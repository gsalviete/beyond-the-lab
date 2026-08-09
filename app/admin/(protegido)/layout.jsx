import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sessaoAdmin } from '@/lib/admin'

// ============================================================
// O CASCO DO PAINEL (`c63`) — e o guard que vale para tudo dentro dele
//
// ⚠️ ESTE LAYOUT É UM SERVER COMPONENT, e é isso que torna o guard real.
// Ele roda no servidor a cada requisição, antes de qualquer coisa desta
// árvore renderizar. Um `useEffect` que redirecionasse no cliente
// desenharia a tela inteira — com dado pessoal dentro — e só depois
// mandaria a pessoa embora.
//
// ⚠️ E ELE NÃO SUBSTITUI O `exigirAdmin` DAS ROTAS DE API. Este guard
// protege PÁGINAS; as rotas de `/api/admin/*` são alcançáveis direto, com
// `curl`, sem passar por layout nenhum. As duas trancas existem porque
// protegem coisas diferentes — e é a de API que o `c62` testa.
//
// ⚠️ O GRUPO `(protegido)` NÃO APARECE NA URL. `/admin/login` e
// `/admin/callback` ficam FORA dele de propósito: dentro, o guard
// redirecionaria para o login, que redirecionaria para o login, para
// sempre. A pasta entre parênteses é o que separa "as telas do painel" de
// "as telas de entrar no painel" sem inventar um segundo prefixo de URL.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. Nenhuma medida nova é inventada
// aqui: tudo sai de classe já medida na landing.
// ============================================================

// ⚠️ Nunca estático. Uma página do painel prerenderizada seria HTML com
// dado de gente real servido a quem pedisse — e o guard não roda em build.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Painel — Beyond The Lab',
  robots: { index: false, follow: false },
}

export default async function Layout({ children }) {
  const admin = await sessaoAdmin()

  // `redirect` lança por dentro, então nada abaixo executa. É o
  // comportamento certo: não existe "renderizar meio painel".
  if (!admin) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/85 backdrop-blur-md">
        <div className="container-page flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="font-display text-xl font-bold tracking-tight text-brand"
            >
              Beyond The Lab
            </Link>
            <nav className="hidden items-center gap-5 sm:flex">
              <ItensDoMenu />
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* O e-mail na tela não é enfeite: é como ela confere, num
                relance, que está na conta certa — e é o que faz uma sessão
                esquecida num computador emprestado ser visível. */}
            <span className="hidden font-sans text-[14px] text-muted sm:inline">{admin.email}</span>

            {/* POST, pelo mesmo motivo da rota: um link de logout é
                disparado por prefetch e por antivírus corporativo. */}
            <form action="/api/admin/sair" method="post">
              <button
                type="submit"
                className="rounded-full px-3 py-2 font-sans text-[14px] font-medium text-ink/80
                           [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* A navegação de mobile fica abaixo do header em vez de virar
          hambúrguer: são cinco itens curtos. Um menu que esconde cinco
          links custa mais toque do que economiza espaço — e o item que mais
          importa (Pendentes) é justamente o que não pode ficar escondido
          atrás de um clique.

          `overflow-x-auto` porque cinco itens não cabem em 390px: rolar na
          horizontal uma faixa de links é gesto conhecido, e é melhor do que
          quebrar em duas linhas ou encolher a fonte abaixo do que o resto
          do site usa. */}
      <nav className="border-b border-border-soft sm:hidden">
        <div className="container-page flex items-center gap-5 overflow-x-auto py-3">
          <ItensDoMenu />
        </div>
      </nav>

      <main className="container-page py-10">{children}</main>
    </div>
  )
}

/**
 * Os itens do menu, num lugar só.
 *
 * ⚠️ ELES ESTAVAM ESCRITOS DUAS VEZES — uma no menu de desktop, outra no
 * de mobile — e a duplicação produziu o mesmo defeito TRÊS vezes seguidas
 * durante a implementação: acrescentar um item numa lista e não na outra,
 * ou acrescentar duas vezes na mesma. Nenhuma das três apareceu no `tsc`
 * (que não verifica `.jsx`) nem em teste nenhum; as três apareceram
 * abrindo a página.
 *
 * Uma lista só é o mecanismo que torna aquilo impossível, em vez da
 * disciplina de lembrar dos dois lugares. É a 8.3 do `REPORT.md` aplicada
 * a um `<nav>`.
 */
function ItensDoMenu() {
  return (
    <>
      <ItemDeMenu href="/admin">Hoje</ItemDeMenu>
      <ItemDeMenu href="/admin/safras">Turmas</ItemDeMenu>
      <ItemDeMenu href="/admin/alunas">Alunas</ItemDeMenu>
      <ItemDeMenu href="/admin/alocacao">Horários</ItemDeMenu>
      <ItemDeMenu href="/admin/pendentes">Pendentes</ItemDeMenu>
      <ItemDeMenu href="/admin/cupons">Cupons</ItemDeMenu>
    </>
  )
}

function ItemDeMenu({ href, children }) {
  return (
    <Link
      href={href}
      className="font-sans text-[15px] font-medium text-ink/80
                 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
    >
      {children}
    </Link>
  )
}
