import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { emailAutorizado, parsearAllowlist } from '@/lib/admin'

// ============================================================
// A VOLTA DO GOOGLE (`c58`, `c59`) — onde a allowlist decide
//
// ⚠️⚠️ ESTA ROTA ESTÁ DORMENTE, E NÃO É CÓDIGO MORTO.
//
// Em 09/08/2026 o login passou temporariamente para e-mail e senha, por
// urgência de publicação (o raciocínio inteiro está em
// `app/api/admin/entrar/route.ts`). Enquanto o provider Google não for
// ligado no Supabase, ninguém chega aqui.
//
// Ela fica porque a D-09 continua sendo o destino, e apagá-la significa
// reescrevê-la depois — na pressa, refazendo as duas decisões que ela
// carrega: derrubar a sessão de quem não está na allowlist, e não
// distinguir "cancelou" de "token inválido" na tela. Voltar para o Google
// é trocar o corpo de `/api/admin/entrar` por `signInWithOAuth`; esta
// rota não muda uma linha.
// ============================================================
//
// ⚠️ É AQUI QUE "LOGOU COM GOOGLE" DEIXA DE SER SUFICIENTE. O `code` que
// chega prova que a pessoa se autenticou; não prova que ela pode entrar.
// Qualquer pessoa do planeta tem conta Google e consegue chegar até esta
// linha com um `code` perfeitamente válido (D-09).
//
// ⚠️ E A CONFERÊNCIA AQUI NÃO SUBSTITUI O GUARD. Ela existe para não
// deixar uma sessão inútil de pé: sem ela, quem não está na lista ficaria
// com cookie válido, veria o middleware deixar passar, e só levaria 403 na
// primeira chamada de API — uma tela quebrada em vez de uma mensagem. A
// tranca continua sendo `exigirAdmin`, chamada em toda rota.
// ============================================================

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')

  const paraLogin = (erro: string) =>
    Response.redirect(new URL(`/admin/login?erro=${erro}`, req.url), 303)

  if (!code) {
    // Pode ser o Google devolvendo `error=access_denied` (a pessoa
    // cancelou na tela dele), ou alguém abrindo a URL na mão. Os dois
    // terminam na mesma tela, sem explicação diferente — não há o que
    // contar a quem não completou o login.
    return paraLogin('cancelado')
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[admin] callback: SUPABASE_URL e/ou SUPABASE_ANON_KEY ausentes no ambiente')
    return paraLogin('config')
  }

  const jar = await cookies()

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        for (const { name, value, options } of novos) jar.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user?.email) {
    console.error('[admin] callback: troca do code falhou', error)
    return paraLogin('invalido')
  }

  if (!emailAutorizado(data.user.email, parsearAllowlist(process.env.EMAIL_ADMIN))) {
    // ⚠️ A SESSÃO É DERRUBADA NA HORA. Deixá-la de pé daria a alguém não
    // autorizado um cookie válido do nosso domínio — inútil hoje (o guard
    // nega tudo), e uma peça a mais para alguém combinar com um bug de
    // amanhã. Autenticado sem autorização é o estado que menos deve
    // persistir neste sistema.
    console.warn('[admin] callback: e-mail FORA da allowlist:', data.user.email)
    await supabase.auth.signOut()
    return paraLogin('sem-permissao')
  }

  return Response.redirect(new URL('/admin', req.url), 303)
}
