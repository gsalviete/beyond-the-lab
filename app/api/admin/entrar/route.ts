import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { emailAutorizado, parsearAllowlist } from '@/lib/admin'

// ============================================================
// O LOGIN (`c58`) — a única rota de `/api/admin/*` SEM guard
//
// ⚠️ E A EXCEÇÃO É ÓBVIA MAS PRECISA ESTAR ESCRITA: quem chega aqui ainda
// não logou, então exigir sessão seria exigir que a pessoa já tivesse o
// que ela veio buscar. Toda OUTRA rota sob `/api/admin/` começa com
// `const negado = await exigirAdmin(); if (negado) return negado` — sem
// exceção, inclusive as que só leem.
//
// ============================================================
// ⚠️⚠️ DESVIO TEMPORÁRIO E DATADO DA D-09 — senha no lugar do Google
// ============================================================
//
// A D-09 diz "Google OAuth via Supabase Auth, com allowlist de e-mails
// validada no servidor". Em **09/08/2026**, por urgência de publicação, o
// dono do repositório decidiu começar com e-mail e senha e viabilizar o
// Google depois.
//
// ⚠️ O QUE A D-09 PROÍBE CONTINUA INTEIRO. A proibição dela é "decidir
// acesso a partir de qualquer coisa que venha do cliente", e a allowlist
// no servidor não mudou uma linha: `sessaoAdmin` continua chamando
// `getUser()` (que valida o token com o Supabase) e conferindo o e-mail
// contra `ADMIN_EMAILS` em todo request. O raciocínio da decisão — "logou
// com Google não é autorização, qualquer pessoa tem conta Google" — nunca
// dependeu do Google: ele vale igual para "digitou uma senha".
//
// ⚠️ O QUE SE PERDE, ESCRITO PARA NÃO SER ESQUECIDO: o Google carregava
// 2FA, detecção de vazamento e política de senha. Com senha própria, a
// força da senha é a fechadura inteira. Duas contenções obrigatórias, e
// as duas são no Supabase, não aqui:
//
//   1. **Cadastro público DESLIGADO** (Authentication → Providers →
//      Email → "Enable email signup"). Ligado, qualquer pessoa cria conta
//      no projeto. Elas não entrariam no painel — a allowlist barra —, mas
//      encheriam `auth.users` e você perderia o sinal de "alguém tentou".
//   2. **Usuário criado à mão**, com senha forte e única.
//
// ⚠️ O CAMINHO DO GOOGLE CONTINUA ESCRITO. `app/admin/callback/route.ts`
// está de pé e não é código morto: ele é o destino do OAuth quando o
// provider for ligado. Voltar para a D-09 completa é trocar o corpo desta
// função por `signInWithOAuth` — o resto (allowlist, guard, middleware,
// callback) já está pronto e não muda.
// ============================================================

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export async function POST(req: Request) {
  const paraLogin = (erro: string) =>
    Response.redirect(new URL(`/admin/login?erro=${erro}`, req.url), 303)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[admin] entrar: SUPABASE_URL e/ou SUPABASE_ANON_KEY ausentes no ambiente')
    return paraLogin('config')
  }

  const form = await req.formData()
  const email = String(form.get('email') ?? '').trim()
  const senha = String(form.get('senha') ?? '')

  // ⚠️ NENHUMA VALIDAÇÃO DE FORMA AQUI, e a ausência é decisão. Um
  // "digite um e-mail válido" distinguiria um endereço malformado de um
  // que não existe — e essa distinção é o começo de um oráculo. Campo
  // vazio e senha errada terminam na MESMA tela, com a MESMA frase.
  if (!email || !senha) return paraLogin('credenciais')

  const jar = await cookies()

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        for (const { name, value, options } of novos) jar.set(name, value, options)
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error || !data?.user?.email) {
    // ⚠️ O LOG NÃO CARREGA A SENHA, e não carrega nem por acidente: o que
    // vai para ele é a MENSAGEM do erro, nunca o objeto de credenciais.
    // Um `console.error('[admin] login', { email, senha })` escrito num
    // dia de depuração é uma senha em texto puro no log da Vercel, para
    // sempre e para quem tiver acesso ao painel de logs.
    //
    // ⚠️ E O E-MAIL TAMBÉM NÃO ENTRA. Um log de tentativas com e-mail
    // legível é uma lista de quem tentou entrar no painel — dado pessoal
    // acumulado por um caminho que ninguém revisou. O que interessa é que
    // houve tentativa falha; quem foi, o Supabase já registra do lado
    // dele.
    console.warn('[admin] login recusado:', error?.message ?? 'sem usuário')
    return paraLogin('credenciais')
  }

  // ============================================================
  // ⚠️ AQUI "AUTENTICADO" DEIXA DE SER SUFICIENTE — é a D-09 inteira
  // ============================================================
  //
  // A senha certa prova que a pessoa é quem diz ser. Não prova que ela
  // pode entrar. Com o cadastro público ligado por engano no Supabase,
  // qualquer pessoa chega até esta linha com credencial perfeitamente
  // válida — e é a allowlist que decide.
  if (!emailAutorizado(data.user.email, parsearAllowlist(process.env.ADMIN_EMAILS))) {
    // ⚠️ A SESSÃO É DERRUBADA NA HORA. Deixá-la de pé daria a alguém não
    // autorizado um cookie válido do nosso domínio — inútil hoje (o guard
    // nega tudo), e uma peça a mais para alguém combinar com um bug de
    // amanhã. Autenticado sem autorização é o estado que menos deve
    // persistir neste sistema.
    console.warn('[admin] e-mail autenticado FORA da allowlist:', data.user.email)
    await supabase.auth.signOut()
    return paraLogin('sem-permissao')
  }

  return Response.redirect(new URL('/admin', req.url), 303)
}
