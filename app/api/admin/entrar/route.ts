import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================
// O INÍCIO DO LOGIN (`c58`) — a única rota de `/api/admin/*` SEM guard
//
// ⚠️ E A EXCEÇÃO É ÓBVIA MAS PRECISA ESTAR ESCRITA: quem chega aqui ainda
// não logou, então exigir sessão seria exigir que a pessoa já tivesse o
// que ela veio buscar. Toda OUTRA rota sob `/api/admin/` começa com
// `const negado = await exigirAdmin(); if (negado) return negado` — sem
// exceção, inclusive as que só leem.
//
// ⚠️ ESTA ROTA NÃO AUTORIZA NINGUÉM. Ela devolve um redirecionamento para
// o Google, e mais nada. Quem decide se a pessoa entra é o callback, que
// confere a allowlist depois de saber quem ela é. Iniciar o OAuth é
// público por natureza: o botão de "entrar com Google" de qualquer site
// do mundo é público.
// ============================================================

// Nunca cachear: a resposta é um redirecionamento com estado (o code
// verifier do PKCE fica num cookie desta requisição).
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

/**
 * ⚠️ POST, E NÃO UM LINK.
 *
 * Um `<Link>` para uma rota GET seria mais simples e seria PREFETCHADO
 * pelo Next assim que o link aparecesse na tela — e o prefetch dispararia
 * a criação do code verifier do PKCE, gravando cookie de uma tentativa de
 * login que ninguém pediu. Com POST, o fluxo começa quando alguém aperta
 * o botão.
 */
export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[admin] entrar: SUPABASE_URL e/ou SUPABASE_ANON_KEY ausentes no ambiente')
    return Response.redirect(new URL('/admin/login?erro=config', req.url), 303)
  }

  const jar = await cookies()

  // ⚠️ Cliente próprio, e não o de `src/lib/admin.ts`: aqui a ESCRITA de
  // cookie é obrigatória (é onde o code verifier do PKCE nasce), enquanto
  // lá o `setAll` é engolido de propósito porque o chamador principal é um
  // Server Component, que não pode escrever. São os dois lados do mesmo
  // SDK com permissões diferentes, e fundi-los faria um dos dois estar
  // errado.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        for (const { name, value, options } of novos) jar.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // ⚠️ ABSOLUTA, e derivada da requisição. Em Preview da Vercel cada
      // deploy tem domínio próprio; um valor fixo mandaria quem testou na
      // Preview cair na produção com um `code` que aquele ambiente não
      // reconhece.
      //
      // ⚠️ ESTA URL PRECISA ESTAR NA LISTA DE "Redirect URLs" DO SUPABASE.
      // Se não estiver, o Supabase redireciona para o Site URL do projeto
      // e o login termina em silêncio na página errada — sem erro visível
      // em lugar nenhum.
      redirectTo: new URL('/admin/callback', req.url).toString(),
      // Sem isto o SDK tenta navegar por conta própria, o que só existe no
      // navegador. Aqui quem navega é a resposta HTTP.
      skipBrowserRedirect: true,
    },
  })

  if (error || !data?.url) {
    console.error('[admin] entrar: falha ao montar o OAuth', error)
    return Response.redirect(new URL('/admin/login?erro=oauth', req.url), 303)
  }

  // 303 e não 302: o POST vira GET na URL do Google, que é o que a
  // especificação manda quando a resposta a um POST é "vá para outro
  // lugar". Com 302, alguns clientes repetem o POST no destino.
  return Response.redirect(data.url, 303)
}
