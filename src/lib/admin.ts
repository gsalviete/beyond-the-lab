// Sessão e autorização do painel — EXCLUSIVAMENTE server-side.
//
// `server-only` faz o build quebrar se alguém importar este módulo de um
// client component. Aqui ele protege duas coisas: a allowlist (que não
// pode ser lida nem contornada pelo navegador) e a decisão de acesso, que
// pela D-09 acontece no servidor e em lugar nenhum além dele.
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ============================================================
// D-09 · EXISTE UM CLIENTE AUTENTICADO AGORA — EXATAMENTE UM
// ============================================================
//
// O painel introduz a primeira sessão do sistema. Google OAuth via
// Supabase Auth, com **allowlist de e-mails validada no servidor**.
//
// ⚠️ "LOGOU COM GOOGLE" NÃO É AUTORIZAÇÃO, e é isto que a decisão diz:
// qualquer pessoa do planeta tem conta Google, e o fluxo de OAuth
// funciona perfeitamente para todas elas. O que autoriza é o e-mail estar
// na lista. Sem a allowlist, `/admin` seria uma porta com fechadura que
// aceita qualquer chave.
//
// ⚠️ E A VERIFICAÇÃO ACONTECE EM TODO REQUEST — não só no middleware. O
// middleware é UX: ele evita que uma tela pisque antes de redirecionar.
// Quem protege é o guard, chamado dentro de cada rota e do layout. Um
// middleware sozinho é contornável por qualquer requisição que não passe
// por ele (rotas de API chamadas direto, matcher mal escrito, um `fetch`
// que ninguém previu), e o custo de errar isso é dar acesso a dado
// pessoal de gente real.
//
// ============================================================
// ⚠️ ESTE É O SEGUNDO CLIENTE SUPABASE DO PROJETO, E ELE NÃO É O OUTRO
// ============================================================
//
// `src/lib/supabase.ts` diz, no topo, que é "o único lugar do projeto que
// importa o SDK", e a regra continua valendo para o que ela protege: a
// `service_role`, que ignora RLS e enxerga tudo.
//
// Este arquivo é outra coisa, com outra chave e outro propósito:
//
//   `service_role`  → escreve e lê dado de gente real, ignora RLS.
//                     Um lugar só: `src/lib/supabase.ts`.
//   `anon` + sessão → só resolve "quem é você?". Com RLS ligada e ZERO
//                     policies em todas as tabelas, esta chave não lê uma
//                     única linha de dado pessoal.
//
// Misturar os dois seria pior do que separá-los: o cliente de auth
// precisa carregar cookies da requisição e mudar a cada request, e o de
// `service_role` é um singleton de processo sem sessão nenhuma
// (`persistSession: false`, e o comentário lá explica por quê). São
// objetos com ciclos de vida opostos.
//
// ⚠️ E A `anon` NÃO GANHA PREFIXO `NEXT_PUBLIC_`, apesar de ela ser
// desenhada para ser pública. Não é contradição — é que o navegador
// **nunca fala com o Supabase** neste projeto: o fluxo de OAuth inteiro
// é iniciado e concluído por rotas nossas, do lado do servidor. Uma
// variável que ninguém no cliente usa não tem por que ser embutida no
// bundle, e o prefixo ausente mantém a regra do repositório sem exceção
// para alguém interpretar depois.
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL e/ou SUPABASE_ANON_KEY ausentes no ambiente')
    this.name = 'AuthNotConfiguredError'
  }
}

/**
 * A allowlist, lida do ambiente.
 *
 * ============================================================
 * POR QUE UMA ENV VAR, E NÃO UMA TABELA
 * ============================================================
 *
 * Uma tabela `administradores` pareceria mais "certa" e traria dois
 * problemas que uma variável não tem:
 *
 *   1. QUEM ADMINISTRA OS ADMINISTRADORES? Uma tela de gestão de acessos
 *      para um sistema com UMA pessoa autorizada é código que ninguém vai
 *      usar e que precisa ser protegido pelo acesso que ele mesmo
 *      concede.
 *   2. UM `delete` ERRADO VIRA ESCALADA. Se a lista mora no banco e o
 *      painel escreve no banco, um bug no painel pode conceder acesso ao
 *      painel. A env var quebra esse laço: mudar quem entra exige um
 *      deploy, que é revisável e tem histórico.
 *
 * O custo é real e aceito: acrescentar alguém à equipe exige mexer na
 * Vercel. Na escala deste produto (uma professora), é o custo certo.
 */
const ADMIN_EMAILS = process.env.ADMIN_EMAILS

/**
 * A lista, normalizada. Exportada para o teste — e para nada além disso.
 *
 * ⚠️ NORMALIZA `trim` E CAIXA. O e-mail que o Google devolve vem em
 * minúscula, mas quem edita a variável na Vercel digita à mão, com
 * espaço depois da vírgula e às vezes com maiúscula. Uma comparação crua
 * transformaria `Giovanna@Gmail.com ` num acesso negado sem nenhuma
 * mensagem que explicasse por quê — e o sintoma seria "o login não
 * funciona", que é indistinguível de dez outras causas.
 */
export function parsearAllowlist(valor: string | undefined): string[] {
  if (!valor) return []
  return valor
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Este e-mail pode entrar?
 *
 * ============================================================
 * ⚠️ LISTA VAZIA RECUSA TODO MUNDO — E ESTA LINHA É A DECISÃO INTEIRA
 * ============================================================
 *
 * O erro natural aqui é o contrário: "se a allowlist não estiver
 * configurada, deixa passar, senão ninguém consegue entrar no ambiente de
 * desenvolvimento". Essa linha, escrita uma vez por conveniência, é a que
 * abre o painel para a internet no dia em que alguém esquecer a variável
 * num deploy — e o sintoma é ZERO. Nada quebra, nada avisa, e o acesso
 * fica aberto até alguém notar.
 *
 * Falhar fechado tem o sintoma oposto e ele é ótimo: ninguém entra, a
 * pessoa que devia entrar reclama em cinco minutos, e o conserto é uma
 * variável de ambiente.
 *
 * ⚠️ Função PURA e sem `process.env` dentro, de propósito: é o que
 * permite testar a lista vazia, a caixa alta e o espaço sobrando sem
 * mexer no ambiente do processo de teste — que é global e vaza entre
 * arquivos.
 */
export function emailAutorizado(email: string | null | undefined, allowlist: string[]): boolean {
  if (!email) return false
  if (allowlist.length === 0) return false
  return allowlist.includes(email.trim().toLowerCase())
}

/**
 * O cliente de auth desta requisição.
 *
 * ⚠️ ELE NÃO É CACHEADO EM MÓDULO, ao contrário dos dois de
 * `src/lib/supabase.ts`. Aqueles são a `service_role` e não representam
 * ninguém; este carrega os COOKIES DE UMA PESSOA. Um singleton aqui
 * serviria a sessão de quem chegou primeiro para todo mundo depois — em
 * serverless, dentro da mesma instância quente. É a classe de bug que dá
 * acesso ao painel para quem nunca logou.
 */
async function clienteAuth() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new AuthNotConfiguredError()

  const jar = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        // ⚠️ ESTE `try` NÃO É PREGUIÇA. Server Components não podem
        // escrever cookie — o Next lança se tentarem —, e é justamente de
        // um Server Component (o layout de `/admin`) que este cliente é
        // usado para LER a sessão. A escrita que interessa acontece no
        // middleware e nas rotas, onde é permitida; aqui ela é o efeito
        // colateral de o SDK querer renovar o token, e engoli-lo é o
        // comportamento correto e documentado pelo próprio Supabase.
        try {
          for (const { name, value, options } of novos) jar.set(name, value, options)
        } catch {
          // Server Component: a renovação sai pelo middleware.
        }
      },
    },
  })
}

/** Quem está logado e autorizado, ou `null`. */
export type Admin = { email: string }

/**
 * A pergunta que governa o painel inteiro: quem é esta pessoa, e ela pode
 * entrar?
 *
 * ============================================================
 * ⚠️ `getUser()` E NUNCA `getSession()`
 * ============================================================
 *
 * Os dois parecem intercambiáveis e não são, e a diferença é exatamente a
 * D-09 ("não confiança no token"):
 *
 *   `getSession()` LÊ O COOKIE e devolve o que ele diz, sem verificar
 *     nada. É rápido porque não sai da máquina. Num servidor, isso
 *     significa confiar num dado que veio do navegador — e o navegador é
 *     de quem está tentando entrar.
 *
 *   `getUser()` MANDA O TOKEN PARA O SUPABASE e pergunta se ele é
 *     válido. Custa uma ida à rede e devolve uma resposta que não veio do
 *     cliente.
 *
 * Num painel que lê dado pessoal de gente real sob LGPD, a ida à rede é
 * barata. O próprio Supabase documenta `getSession()` como inseguro em
 * código de servidor, e o nome dele não avisa nada disso — é o tipo de
 * troca que alguém faz "para otimizar" e que não quebra teste nenhum.
 *
 * ⚠️ E A ALLOWLIST É CONFERIDA DEPOIS, SEMPRE. Um token válido prova que
 * a pessoa é quem diz ser; não prova que ela pode entrar aqui.
 */
export async function sessaoAdmin(): Promise<Admin | null> {
  const supabase = await clienteAuth()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user?.email) return null

  if (!emailAutorizado(user.email, parsearAllowlist(ADMIN_EMAILS))) {
    // ⚠️ O LOG REGISTRA A TENTATIVA, e ele importa: alguém autenticado
    // batendo numa porta fechada é o sinal mais próximo de um incidente
    // que este sistema produz. Sem a linha, a tentativa é indistinguível
    // de um erro de digitação no e-mail.
    console.warn('[admin] e-mail autenticado FORA da allowlist:', user.email)
    return null
  }

  return { email: user.email }
}

/**
 * O guard das rotas de API. Devolve `403` quando não passa (`c61`).
 *
 * ============================================================
 * ⚠️ É ESTE, E NÃO O MIDDLEWARE, QUE PROTEGE
 * ============================================================
 *
 * O `04-PLANO.md` já dizia: "`c61` e `c62` são o que realmente protege.
 * `c60` é UX." A razão é que middleware é configuração — um `matcher`
 * escrito com um caractere a menos deixa um caminho inteiro de fora, e
 * nada reclama. O guard é chamada de função: uma rota que não o chama não
 * está protegida, e isso é visível na leitura do arquivo.
 *
 * ⚠️ USO OBRIGATÓRIO: TODA rota `/api/admin/*` começa com
 * `const negado = await exigirAdmin(); if (negado) return negado`. Não há
 * exceção "esta rota só lê" — leitura de dado pessoal é exatamente o que
 * a D-09 protege.
 *
 * ⚠️ 403 E NÃO 401, e a diferença é semântica e importa: 401 significa
 * "autentique-se", e quem chega aqui autenticado e fora da lista JÁ se
 * autenticou. Mandá-lo logar de novo o faria repetir o Google
 * indefinidamente sem nunca entender por quê. 403 é "eu sei quem você é,
 * e não".
 *
 * ⚠️ A MENSAGEM NÃO DIZ SE O E-MAIL ESTÁ NA LISTA. "Sem permissão" é tudo
 * que sai — o corpo não confirma nem nega a existência da allowlist, e
 * não repete o e-mail de volta.
 */
export async function exigirAdmin(): Promise<Response | null> {
  try {
    const admin = await sessaoAdmin()
    if (admin) return null
  } catch (err) {
    // ⚠️ FALHA DE INFRA AQUI NEGA, e não degrada. É o oposto da rota de
    // inscrição, onde falhar em silêncio custa uma tela de erro para
    // alguém que queria estudar; aqui, degradar para "deixa passar" custa
    // acesso a dado pessoal de todas elas. Auth que falha, fecha.
    if (err instanceof AuthNotConfiguredError) {
      console.error('[admin]', err.message)
    } else {
      console.error('[admin] falha ao resolver a sessão — negando', err)
    }
  }

  return Response.json({ ok: false, message: 'Sem permissão.' }, { status: 403 })
}
