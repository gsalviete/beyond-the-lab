import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ============================================================
// MIDDLEWARE DO PAINEL (`c60`) — ⚠️ ISTO É UX, NÃO SEGURANÇA
// ============================================================
//
// O `04-PLANO.md` diz, com todas as letras: "`c61` e `c62` são o que
// realmente protege. `c60` é UX." Este arquivo faz duas coisas, e nenhuma
// delas é autorizar:
//
//   1. RENOVA O COOKIE de sessão. O token do Supabase expira em uma hora;
//      sem alguém renovando, a Giovanna é deslogada no meio do trabalho.
//      Server Components não podem escrever cookie — é aqui que a
//      renovação cabe.
//   2. EVITA O PISCA. Sem middleware, quem não está logada carrega a
//      página, o layout roda o guard e só então redireciona. Funciona, e
//      é feio.
//
// ⚠️ POR QUE ELE NÃO É A TRANCA, e por que isso precisa estar escrito
// aqui e não só no plano:
//
//   - middleware é CONFIGURAÇÃO. O `matcher` abaixo é uma string, e uma
//     string com um caractere a menos deixa um caminho inteiro
//     desprotegido sem que nada reclame — nem o TypeScript, nem o teste,
//     nem o build.
//   - ele NÃO cobre as rotas de API. `/api/admin/*` é alcançável direto,
//     com `curl`, e quem nega ali é `exigirAdmin` (`c61`).
//   - ele NÃO confere a allowlist. Aqui só se pergunta "existe sessão?".
//     Quem pergunta "esta pessoa pode entrar?" é `sessaoAdmin`, no
//     servidor, a cada requisição (D-09).
//
// Ou seja: se este arquivo sumisse, o painel continuaria protegido — só
// ficaria desconfortável de usar. Se `exigirAdmin` sumisse, o painel
// ficaria aberto. É por isso que a ordem de implementação foi essa.
// ============================================================

export async function middleware(req: NextRequest) {
  // ⚠️ A RESPOSTA É CRIADA ANTES E DEVOLVIDA DEPOIS, sempre a mesma
  // instância. O SDK escreve os cookies renovados NELA; criar uma resposta
  // nova no fim descartaria a renovação em silêncio, e o sintoma seria a
  // Giovanna sendo deslogada de hora em hora sem explicação.
  let resposta = NextResponse.next({ request: req })

  const url = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY

  // Sem configuração não há o que renovar. Seguir em frente é o certo: quem
  // nega é o guard, e derrubar a requisição aqui transformaria uma env var
  // faltando numa página branca.
  if (!url || !anon) return resposta

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (novos) => {
        for (const { name, value } of novos) req.cookies.set(name, value)
        resposta = NextResponse.next({ request: req })
        for (const { name, value, options } of novos) resposta.cookies.set(name, value, options)
      },
    },
  })

  // ⚠️ `getUser()` E NUNCA `getSession()`, mesmo aqui onde a decisão é só
  // de UX. `getUser()` valida o token com o Supabase — e é a chamada que,
  // de quebra, dispara a renovação do cookie. `getSession()` leria o
  // cookie e não renovaria nada, o que faria este arquivo inteiro deixar
  // de cumprir a razão número 1 de existir.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const caminho = req.nextUrl.pathname

  // ⚠️ `/admin/login` e `/admin/callback` FICAM DE FORA do redirecionamento,
  // senão o login redireciona para o login, para sempre. É o mesmo motivo
  // pelo qual eles moram fora do grupo `(protegido)`.
  const ehPortaDeEntrada = caminho === '/admin/login' || caminho.startsWith('/admin/callback')

  if (!user && !ehPortaDeEntrada) {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }

  return resposta
}

// ⚠️ O MATCHER NÃO INCLUI `/api/admin/*`, E A AUSÊNCIA É DELIBERADA.
//
// Não é esquecimento nem economia: as rotas de API já são protegidas por
// `exigirAdmin`, que é chamada DENTRO de cada uma. Pôr o matcher aqui
// também criaria a impressão de que a proteção é do middleware — e no dia
// em que alguém escrevesse uma rota nova sem o guard, a tranca dependeria
// de uma string de configuração que ninguém revisa.
//
// A regra do projeto é: toda rota `/api/admin/*` começa com
// `const negado = await exigirAdmin(); if (negado) return negado`.
export const config = {
  matcher: ['/admin/:path*'],
}
