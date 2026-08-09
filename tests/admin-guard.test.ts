// ============================================================
// A ALLOWLIST E O GUARD (`c59`, `c61`, `c62`) — D-09
//
// ⚠️ "LOGOU COM GOOGLE" NÃO É AUTORIZAÇÃO. Qualquer pessoa do planeta tem
// conta Google, e o fluxo de OAuth funciona perfeitamente para todas elas.
// O que autoriza é o e-mail estar na lista, conferido NO SERVIDOR, em todo
// request.
//
// Este arquivo cobre as duas metades:
//
//   1. `emailAutorizado` — função pura. É onde mora a decisão, e onde o
//      erro mais caro é possível: uma lista vazia que deixa passar.
//   2. `exigirAdmin` — o guard das rotas de API, que é o que REALMENTE
//      protege (o middleware é UX; o plano diz isso com todas as letras).
//
// ⚠️ O QUE ESTE ARQUIVO NÃO PROVA, e precisa ser dito: ele não abre
// navegador, não fala com o Google e não valida um JWT de verdade. Um
// verde aqui significa "a decisão de autorização está certa dado o que o
// Supabase respondeu" — não "o login funciona". A outra metade é o
// checkpoint manual do `c61`: logar com um e-mail fora da allowlist e
// confirmar 403 NA API, não só a tela sumindo.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookieJar: { getAll: () => [], set: vi.fn() },
}))

// `next/headers` só existe dentro de uma requisição de verdade.
vi.mock('next/headers', () => ({ cookies: async () => dubles.cookieJar }))

// Só o SDK é dublê. `emailAutorizado`, `parsearAllowlist` e `sessaoAdmin`
// rodam de verdade — são elas que estão sob teste.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: dubles.getUser } }),
}))

process.env.SUPABASE_URL = 'https://exemplo.invalid'
process.env.SUPABASE_ANON_KEY = 'chave-anon-de-teste'
process.env.ADMIN_EMAILS = 'giovanna@exemplo.com'

const { emailAutorizado, exigirAdmin, parsearAllowlist, sessaoAdmin } = await import('@/lib/admin')

/** O Supabase respondendo "este token é de fulana". */
function logadaComo(email: string | null) {
  dubles.getUser.mockResolvedValue({
    data: { user: email ? { email } : null },
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  logadaComo('giovanna@exemplo.com')
})

// ============================================================
// 0. CONTROLE DO MÉTODO
//
// Tudo abaixo afirma que alguém é RECUSADO. Se o guard recusasse todo
// mundo, os testes passariam medindo o vácuo.
// ============================================================
describe('quem está na lista entra', () => {
  it('`sessaoAdmin` devolve o e-mail', async () => {
    expect(await sessaoAdmin()).toEqual({ email: 'giovanna@exemplo.com' })
  })

  it('`exigirAdmin` devolve `null` — que é o sinal de "pode seguir"', async () => {
    expect(await exigirAdmin()).toBeNull()
  })
})

// ============================================================
// 1. ⚠️ A LISTA VAZIA RECUSA TODO MUNDO
//
// O erro natural é o contrário: "se a allowlist não estiver configurada,
// deixa passar, senão ninguém entra em desenvolvimento". Essa linha,
// escrita uma vez por conveniência, abre o painel para a internet no dia
// em que alguém esquecer a variável num deploy — e o sintoma é ZERO.
// ============================================================
describe('falha fechada', () => {
  it.each([
    ['undefined', undefined],
    ['string vazia', ''],
    ['só vírgulas', ',,,'],
    ['só espaço', '   '],
  ])('allowlist %s → ninguém entra', (_c, valor) => {
    expect(emailAutorizado('giovanna@exemplo.com', parsearAllowlist(valor))).toBe(false)
  })

  // ⚠️ Controle negativo do bloco: com a lista preenchida, a MESMA pessoa
  // entra. Sem este par, "não entrou" seria indistinguível de "a função
  // nunca deixa ninguém entrar".
  it('controle negativo: com a lista preenchida, a mesma pessoa entra', () => {
    expect(emailAutorizado('giovanna@exemplo.com', parsearAllowlist('giovanna@exemplo.com'))).toBe(
      true,
    )
  })
})

// ============================================================
// 2. A NORMALIZAÇÃO — o que quebraria em silêncio
//
// O e-mail do Google vem em minúscula, mas quem edita a variável na Vercel
// digita à mão, com espaço depois da vírgula e às vezes com maiúscula. Uma
// comparação crua viraria "o login não funciona", que é indistinguível de
// dez outras causas.
// ============================================================
describe('a comparação normaliza caixa e espaço', () => {
  const lista = parsearAllowlist(' Giovanna@Exemplo.com , outra@exemplo.com ')

  it.each([
    'giovanna@exemplo.com',
    'GIOVANNA@EXEMPLO.COM',
    '  giovanna@exemplo.com  ',
    'outra@exemplo.com',
  ])('`%s` entra', (email) => {
    expect(emailAutorizado(email, lista)).toBe(true)
  })

  // ⚠️ E a normalização NÃO pode virar "parecido o bastante". Um domínio
  // diferente é outra pessoa.
  it.each(['giovanna@exemplo.com.br', 'giovanna@outro.com', 'xgiovanna@exemplo.com'])(
    '`%s` NÃO entra',
    (email) => {
      expect(emailAutorizado(email, lista)).toBe(false)
    },
  )

  it('e-mail ausente não entra', () => {
    expect(emailAutorizado(null, lista)).toBe(false)
    expect(emailAutorizado(undefined, lista)).toBe(false)
    expect(emailAutorizado('', lista)).toBe(false)
  })
})

// ============================================================
// 3. ⚠️ O GUARD DEVOLVE 403 — o coração do `c62`
// ============================================================
describe('o guard das rotas de API', () => {
  it('e-mail FORA da allowlist → 403', async () => {
    logadaComo('estranho@exemplo.com')

    const res = await exigirAdmin()

    expect(res).not.toBeNull()
    expect(res?.status).toBe(403)
  })

  // ⚠️ 403 E NÃO 401, e a diferença importa: 401 significa "autentique-se",
  // e quem chega aqui autenticado e fora da lista JÁ se autenticou.
  // Mandá-lo logar de novo o faria repetir o Google indefinidamente sem
  // nunca entender por quê.
  it('não é 401 — a pessoa já se autenticou', async () => {
    logadaComo('estranho@exemplo.com')
    expect((await exigirAdmin())?.status).not.toBe(401)
  })

  it('sem sessão nenhuma → 403 também', async () => {
    logadaComo(null)
    expect((await exigirAdmin())?.status).toBe(403)
  })

  it('erro do Supabase ao validar o token → 403', async () => {
    dubles.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } })
    expect((await exigirAdmin())?.status).toBe(403)
  })

  // ⚠️ FALHA DE INFRA NEGA, e não degrada. É o oposto da rota de inscrição,
  // onde falhar em silêncio custa uma tela de erro para alguém que queria
  // estudar; aqui, degradar para "deixa passar" custa acesso a dado pessoal
  // de todas elas. Auth que falha, fecha.
  it('Supabase fora do ar → 403, nunca "deixa passar"', async () => {
    dubles.getUser.mockRejectedValue(new Error('rede fora'))
    expect((await exigirAdmin())?.status).toBe(403)
  })

  // ⚠️ A resposta não confirma nem nega a existência da allowlist, e não
  // devolve o e-mail. Quem tentou entrar não descobre nada sobre quem pode.
  it('a mensagem não vaza nada sobre quem tem acesso', async () => {
    logadaComo('estranho@exemplo.com')
    const corpo = await (await exigirAdmin())!.json()

    expect(corpo).toEqual({ ok: false, message: 'Sem permissão.' })
    expect(JSON.stringify(corpo)).not.toContain('estranho@exemplo.com')
    expect(JSON.stringify(corpo)).not.toContain('giovanna@exemplo.com')
  })
})

// ============================================================
// 4. ⚠️ `getUser()` E NUNCA `getSession()`
//
// Os dois parecem intercambiáveis e não são. `getSession()` LÊ O COOKIE e
// devolve o que ele diz, sem verificar nada — num servidor, isso é confiar
// num dado que veio do navegador de quem está tentando entrar.
// `getUser()` manda o token para o Supabase e pergunta se ele vale.
//
// É a D-09 literal: "decidir acesso a partir de qualquer coisa que venha
// do cliente" é o que ela proíbe. O nome de `getSession()` não avisa nada
// disso, e é o tipo de troca que alguém faz "para otimizar" e que não
// quebra teste nenhum — a menos que exista este.
// ============================================================
describe('a validação não confia no cookie', () => {
  it('`sessaoAdmin` chama `getUser`', async () => {
    await sessaoAdmin()
    expect(dubles.getUser).toHaveBeenCalledTimes(1)
  })

  it('o módulo não menciona `getSession` em lugar nenhum', async () => {
    const { readFileSync } = await import('node:fs')

    // Comentários fora: este repositório CITA o código que não usa, e uma
    // busca no arquivo cru acusaria o próprio parágrafo que explica por
    // que `getSession` não está lá. É a mesma armadilha do `c10`.
    const fonte = readFileSync('src/lib/admin.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    expect(fonte).toContain('getUser')
    expect(fonte).not.toContain('getSession')
  })

  // Controle do método: se a remoção de comentários engolisse o código
  // junto, o teste acima passaria comparando vazio com vazio.
  it('a remoção de comentários não engoliu o código', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/lib/admin.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    expect(fonte.length).toBeGreaterThan(500)
    expect(fonte).toContain('export async function exigirAdmin')
  })
})
