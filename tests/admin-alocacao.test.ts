// ============================================================
// ALOCAÇÃO NÃO DISPARA CHAMADA AO STRIPE (`c76`) — D-03
//
// "Arrastar uma aluna de segunda para quarta no painel não dispara,
// cancela ou altera nada no Stripe."
//
// *Por quê:* ela já pagou antes de ser alocada. Separar as duas coisas é o
// que torna o kanban seguro de usar — a Giovanna pode reorganizar a semana
// inteira sem medo. A decisão PROÍBE "qualquer chamada ao Stripe nos
// handlers de alocação".
//
// ⚠️ ESTE ARQUIVO PROVA A AUSÊNCIA DE ALGO, e ausência dá verde sozinha.
// Por isso ele tem duas metades que se sustentam:
//
//   1. FUNCIONAL — a rota é chamada de verdade, com o Stripe inteiro
//      substituído por dublês, e nenhum deles é tocado.
//   2. CONTROLE NEGATIVO — a MESMA rota, com a ação de CANCELAR, toca o
//      Stripe. Sem esta metade, "não chamou" seria indistinguível de "os
//      dublês não estão ligados em nada".
//
// A segunda é o que dá sentido à primeira, e ela também documenta a
// fronteira: cancelar é a única ação do painel que move dinheiro.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => ({
  // Stripe — nenhum destes pode ser tocado numa alocação.
  encerrarAssinatura: vi.fn(),
  // Banco
  moverParaGrupo: vi.fn(),
  mudarStatusInscricao: vi.fn(),
  buscarFicha: vi.fn(),
  // Sessão: o guard precisa passar, senão o teste mediria o 403.
  getUser: vi.fn(),
  cookieJar: { getAll: () => [], set: vi.fn() },
}))

vi.mock('next/headers', () => ({ cookies: async () => dubles.cookieJar }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: dubles.getUser } }),
}))

vi.mock('@/lib/stripe', () => ({ encerrarAssinatura: dubles.encerrarAssinatura }))

vi.mock('@/lib/supabase', () => ({
  moverParaGrupo: dubles.moverParaGrupo,
  mudarStatusInscricao: dubles.mudarStatusInscricao,
  buscarFicha: dubles.buscarFicha,
}))

process.env.SUPABASE_URL = 'https://exemplo.invalid'
process.env.SUPABASE_ANON_KEY = 'chave-anon-de-teste'
process.env.EMAIL_ADMIN = 'giovanna@exemplo.com'

const { POST } = await import('../app/api/admin/inscricoes/route')

// ⚠️ UUIDs DE VERDADE, com o nibble de versão e o de variante válidos.
// `z.uuid()` do Zod 4 valida a RFC — um `aaaaaaaa-bbbb-cccc-dddd-...` tem a
// forma certa e é REJEITADO, e o sintoma é a rota inteira devolvendo 400
// "Requisição inválida". Custou sete testes vermelhos que pareciam bug de
// implementação.
const INSCRICAO = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const GRUPO = '11111111-2222-4333-8444-555555555555'

function requisicao(campos: Record<string, string>) {
  const corpo = new FormData()
  for (const [k, v] of Object.entries(campos)) corpo.set(k, v)
  return new Request('https://exemplo.invalid/api/admin/inscricoes', {
    method: 'POST',
    body: corpo,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dubles.getUser.mockResolvedValue({
    data: { user: { email: 'giovanna@exemplo.com' } },
    error: null,
  })
  dubles.moverParaGrupo.mockResolvedValue(undefined)
  dubles.mudarStatusInscricao.mockResolvedValue(undefined)
  dubles.buscarFicha.mockResolvedValue({
    inscricao: { id: INSCRICAO },
    pessoa: { nome: 'Maria Silva' },
    safra: null,
    grupo: null,
    assinatura: { stripe_subscription_id: 'sub_TESTE' },
  })
})

// ============================================================
// 1. A ALOCAÇÃO — o coração do `c76`
// ============================================================
describe('mover de horário', () => {
  it('grava o grupo novo e responde ok', async () => {
    const res = await POST(requisicao({ inscricao_id: INSCRICAO, grupo_id: GRUPO }))

    expect(res.status).toBe(200)
    expect(dubles.moverParaGrupo).toHaveBeenCalledWith(INSCRICAO, GRUPO)
  })

  // ⚠️ A asserção que a D-03 pede, escrita do jeito mais direto possível.
  it('NÃO toca no Stripe', async () => {
    await POST(requisicao({ inscricao_id: INSCRICAO, grupo_id: GRUPO }))
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
  })

  // ⚠️ E não muda status: alocação é ortogonal ao estado do pagamento.
  // Uma aluna inadimplente que muda de horário continua inadimplente.
  it('NÃO muda o status da inscrição', async () => {
    await POST(requisicao({ inscricao_id: INSCRICAO, grupo_id: GRUPO }))
    expect(dubles.mudarStatusInscricao).not.toHaveBeenCalled()
  })

  // `null` é destino válido: tirar de todos os horários. Uma inscrição
  // nasce sem grupo e pode voltar a ficar sem — "ainda não alocada" é um
  // estado legítimo, não um erro.
  it('grupo vazio significa "sem horário", e também não toca no Stripe', async () => {
    await POST(requisicao({ inscricao_id: INSCRICAO, grupo_id: '' }))

    expect(dubles.moverParaGrupo).toHaveBeenCalledWith(INSCRICAO, null)
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
  })

  // O trigger `inscricao_grupo_da_mesma_safra` da `009` é quem recusa
  // grupo de outra safra — não um `if` desta camada. Repetir a regra aqui
  // criaria uma segunda cópia dela (REPORT §9.9).
  it('recusa do trigger vira mensagem explicável, e não "erro"', async () => {
    const erro = Object.assign(new Error('grupo pertence a outra safra'), { codigoPg: 'P0001' })
    dubles.moverParaGrupo.mockRejectedValue(erro)

    const res = await POST(requisicao({ inscricao_id: INSCRICAO, grupo_id: GRUPO }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.message).toContain('outra turma')
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
  })
})

// ============================================================
// 2. ⚠️ CONTROLE NEGATIVO — cancelar TOCA no Stripe
//
// Sem este bloco, "a alocação não chamou o Stripe" seria indistinguível de
// "o dublê do Stripe não está ligado em nada". É a lição do `c07`, onde um
// diferencial deu "0 divergências" comparando vazio com vazio.
// ============================================================
describe('cancelar — a única ação do painel que move dinheiro', () => {
  it('encerra a assinatura e muda o status', async () => {
    const res = await POST(
      requisicao({ _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: 'Maria Silva' }),
    )

    expect(res.status).toBe(200)
    expect(dubles.encerrarAssinatura).toHaveBeenCalledWith('sub_TESTE')
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO, 'cancelada')
  })

  // ⚠️ A CONFIRMAÇÃO POR NOME É CONFERIDA NO SERVIDOR. Uma confirmação só
  // na tela é um `if` que qualquer requisição direta pula — e este handler
  // cancela a assinatura de alguém.
  it('nome errado não cancela nada', async () => {
    const res = await POST(
      requisicao({ _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: 'Outra Pessoa' }),
    )

    expect(res.status).toBe(400)
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
    expect(dubles.mudarStatusInscricao).not.toHaveBeenCalled()
  })

  // Caixa e acento não são o ponto: exigir digitação exata transformaria a
  // confirmação num teste de datilografia em vez de um ato deliberado.
  it('caixa diferente ainda confirma', async () => {
    const res = await POST(
      requisicao({ _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: '  maria silva ' }),
    )

    expect(res.status).toBe(200)
  })

  // ⚠️ Quem nunca pagou não tem assinatura, e cancelar é só mudar o status.
  // É o caso comum de quem abandonou o checkout.
  it('sem assinatura, cancela sem chamar o Stripe', async () => {
    dubles.buscarFicha.mockResolvedValue({
      inscricao: { id: INSCRICAO },
      pessoa: { nome: 'Maria Silva' },
      safra: null,
      grupo: null,
      assinatura: null,
    })

    const res = await POST(
      requisicao({ _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: 'Maria Silva' }),
    )

    expect(res.status).toBe(200)
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO, 'cancelada')
  })

  // ⚠️ O STRIPE PRIMEIRO, O NOSSO BANCO DEPOIS. Na ordem inversa, a
  // inscrição ficaria `cancelada` aqui com a assinatura viva lá — e o
  // cartão seria debitado no mês seguinte de alguém que o painel diz que
  // cancelou.
  it('se o Stripe falhar, o status NÃO muda', async () => {
    dubles.encerrarAssinatura.mockRejectedValue(new Error('stripe fora do ar'))

    const res = await POST(
      requisicao({ _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: 'Maria Silva' }),
    )

    expect(res.status).toBe(500)
    expect(dubles.mudarStatusInscricao).not.toHaveBeenCalled()
  })
})

// ============================================================
// 3. O GUARD — esta rota move dinheiro e cancela assinatura
// ============================================================
describe('sem sessão autorizada, nada acontece', () => {
  it.each([
    ['alocar', { inscricao_id: INSCRICAO, grupo_id: GRUPO }],
    ['cancelar', { _acao: 'cancelar', inscricao_id: INSCRICAO, confirmacao: 'Maria Silva' }],
  ])('%s fora da allowlist → 403 e zero efeito', async (_c, campos) => {
    dubles.getUser.mockResolvedValue({
      data: { user: { email: 'estranho@exemplo.com' } },
      error: null,
    })

    const res = await POST(requisicao(campos as Record<string, string>))

    expect(res.status).toBe(403)
    expect(dubles.moverParaGrupo).not.toHaveBeenCalled()
    expect(dubles.mudarStatusInscricao).not.toHaveBeenCalled()
    expect(dubles.encerrarAssinatura).not.toHaveBeenCalled()
  })
})
