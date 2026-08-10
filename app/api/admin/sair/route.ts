import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================
// SAIR (`c63`)
//
// ⚠️ POST, e a escolha não é estilo: um GET de logout é disparado por
// prefetch, por antivírus corporativo que abre todo link, e por qualquer
// crawler que encontre a URL. A Giovanna seria deslogada por algo que ela
// não fez, no meio do trabalho, sem entender por quê.
//
// ⚠️ E ELE NÃO PRECISA DO GUARD. Sair é a única operação do painel que é
// segura de fazer sem estar autorizada: quem não tem sessão sai do mesmo
// jeito, e o efeito é apagar cookie. Exigir `exigirAdmin` aqui impediria
// alguém com sessão INVÁLIDA de se livrar dela — que é justamente quem
// mais precisa.
// ============================================================

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export async function POST(req: Request) {
  const paraLogin = Response.redirect(new URL('/admin/login', req.url), 303)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return paraLogin

  const jar = await cookies()

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        for (const { name, value, options } of novos) jar.set(name, value, options)
      },
    },
  })

  // ⚠️ O erro é registrado e NÃO muda o destino. Se o `signOut` falhar, a
  // pessoa ainda tem que sair da tela — e o cookie expira sozinho. Deixar
  // alguém presa num painel que ela pediu para fechar seria o pior dos dois
  // desfechos.
  const { error } = await supabase.auth.signOut()
  if (error) console.error('[admin] sair: signOut falhou', error)

  return paraLogin
}
