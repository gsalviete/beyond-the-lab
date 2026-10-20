// ============================================================
// O parcelado no Stripe (D-17) — as fases do schedule, e o cancelamento
//
// É a parte do corte 4 que decide quanto alguém paga por mês durante um
// ano. O schedule é declarado UMA vez (no webhook) e o Stripe cumpre —
// então o erro aqui não aparece na hora: aparece na 12ª fatura, ou na 13ª.
//
// ⚠️ O SDK DO STRIPE É DUBLADO, e o que se afirma é o que `stripe.ts`
// MANDA para ele. O que NÃO se prova aqui: que o Stripe interpreta essas
// fases como a documentação diz. Isso só fecha no aceite do corte 4, com
// um schedule real em modo teste.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const sdk = vi.hoisted(() => ({
  subscriptionsRetrieve: vi.fn(),
  subscriptionsUpdate: vi.fn(),
  schedulesCreate: vi.fn(),
  schedulesRetrieve: vi.fn(),
  schedulesUpdate: vi.fn(),
  schedulesRelease: vi.fn(),
  pricesList: vi.fn(),
  pricesCreate: vi.fn(),
  productsRetrieve: vi.fn(),
}))

vi.mock('stripe', () => {
  class StripeInvalidRequestError extends Error {
    code?: string
  }

  class Stripe {
    static errors = { StripeInvalidRequestError }
    subscriptions = { retrieve: sdk.subscriptionsRetrieve, update: sdk.subscriptionsUpdate }
    subscriptionSchedules = {
      create: sdk.schedulesCreate,
      retrieve: sdk.schedulesRetrieve,
      update: sdk.schedulesUpdate,
      release: sdk.schedulesRelease,
    }
    prices = { list: sdk.pricesList, create: sdk.pricesCreate }
    products = { retrieve: sdk.productsRetrieve }
  }

  return { default: Stripe }
})

// A chave é lida na CARGA do módulo — tem que existir antes do import.
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dublado')

const { declararParcelamento, encerrarAssinatura, precosDoParcelado } = await import(
  '@/lib/stripe'
)

const SUB = 'sub_parcelado'
const SCHEDULE = 'sub_sched_1'
const T = 1_793_577_600 // 2026-11-02 00:00 UTC — o fim do trial
const CRIADA = 1_792_368_000

/** A fase que `from_subscription` cria: o período atual, com o trial. */
function faseAtual(trial: boolean) {
  return {
    start_date: CRIADA,
    end_date: trial ? T : CRIADA + 30 * 86400,
    trial_end: trial ? T : null,
    items: [{ price: 'price_16667' }],
  }
}

const PARCELADO = {
  subscriptionId: SUB,
  parcelas: 12,
  priceRegular: 'price_16667',
  priceUltima: 'price_16663',
}

beforeEach(() => {
  vi.clearAllMocks()
  sdk.subscriptionsRetrieve.mockResolvedValue({
    id: SUB,
    schedule: null,
    metadata: { inscricao_id: 'insc_1' },
  })
  sdk.schedulesCreate.mockResolvedValue({
    id: SCHEDULE,
    end_behavior: 'release',
    phases: [faseAtual(true)],
  })
})

describe('declararParcelamento — as fases', () => {
  it('com trial: trial até T, depois 11 regulares, depois 1 última, e cancela', async () => {
    await declararParcelamento(PARCELADO)

    expect(sdk.schedulesCreate).toHaveBeenCalledWith({ from_subscription: SUB })
    const [id, params] = sdk.schedulesUpdate.mock.calls[0]

    expect(id).toBe(SCHEDULE)
    expect(params.end_behavior).toBe('cancel')
    expect(params.proration_behavior).toBe('none')
    expect(params.phases).toHaveLength(3)

    // ⚠️ O TRIAL É REPASSADO. Sem ele, a atualização tiraria o trial da
    // fase atual e a 1ª parcela sairia hoje, contra a D-04.
    expect(params.phases[0]).toMatchObject({
      start_date: CRIADA,
      end_date: T,
      trial_end: T,
      items: [{ price: 'price_16667', quantity: 1 }],
    })
    expect(params.phases[1]).toMatchObject({
      items: [{ price: 'price_16667', quantity: 1 }],
      duration: { interval: 'month', interval_count: 11 },
    })
    expect(params.phases[2]).toMatchObject({
      items: [{ price: 'price_16663', quantity: 1 }],
      duration: { interval: 'month', interval_count: 1 },
    })
  })

  // ⚠️ 11 + 1 = 12 COBRANÇAS. Nem 13 (o mês "de folga"), nem 11.
  it('com trial, as fases cobradas somam 12 meses', async () => {
    await declararParcelamento(PARCELADO)
    const { phases } = sdk.schedulesUpdate.mock.calls[0][1]

    const cobradas = phases
      .slice(1)
      .reduce((n: number, f: { duration: { interval_count: number } }) => n + f.duration.interval_count, 0)
    expect(cobradas).toBe(12)
  })

  // Inscrição a menos de 48h da cobrança: o Stripe já cobrou a 1ª parcela
  // na criação, e a fase atual É o primeiro mês pago.
  it('sem trial: a fase atual já é a 1ª parcela → 10 regulares + 1 última', async () => {
    sdk.schedulesCreate.mockResolvedValue({
      id: SCHEDULE,
      end_behavior: 'release',
      phases: [faseAtual(false)],
    })

    await declararParcelamento(PARCELADO)
    const { phases } = sdk.schedulesUpdate.mock.calls[0][1]

    expect(phases[0].trial_end).toBeUndefined()
    expect(phases[1].duration.interval_count).toBe(10)
    expect(phases[2].items[0].price).toBe('price_16663')
    expect(1 + phases[1].duration.interval_count + phases[2].duration.interval_count).toBe(12)
  })

  it('os metadados da assinatura seguem em toda fase', async () => {
    await declararParcelamento(PARCELADO)
    for (const f of sdk.schedulesUpdate.mock.calls[0][1].phases) {
      expect(f.metadata).toEqual({ inscricao_id: 'insc_1' })
    }
  })
})

describe('declararParcelamento — idempotência', () => {
  // ⚠️ REENTREGA DO WEBHOOK, ou a rede do `invoice.paid`: já declarado, não
  // mexe em nada.
  it('schedule já declarado (cancel + várias fases) → nenhuma escrita', async () => {
    sdk.subscriptionsRetrieve.mockResolvedValue({ id: SUB, schedule: SCHEDULE, metadata: {} })
    sdk.schedulesRetrieve.mockResolvedValue({
      id: SCHEDULE,
      end_behavior: 'cancel',
      phases: [faseAtual(true), {}, {}],
    })

    await declararParcelamento(PARCELADO)

    expect(sdk.schedulesCreate).not.toHaveBeenCalled()
    expect(sdk.schedulesUpdate).not.toHaveBeenCalled()
  })

  // ⚠️ A CRIAÇÃO DEU CERTO E A ATUALIZAÇÃO FALHOU: o schedule existe mas
  // não foi declarado. Pular deixaria a parcela regular sendo cobrada para
  // sempre — então ele é COMPLETADO, sem criar outro.
  it('schedule existente mas não declarado → completa, sem criar outro', async () => {
    sdk.subscriptionsRetrieve.mockResolvedValue({ id: SUB, schedule: SCHEDULE, metadata: {} })
    sdk.schedulesRetrieve.mockResolvedValue({
      id: SCHEDULE,
      end_behavior: 'release',
      phases: [faseAtual(true)],
    })

    await declararParcelamento(PARCELADO)

    expect(sdk.schedulesCreate).not.toHaveBeenCalled()
    expect(sdk.schedulesUpdate).toHaveBeenCalledTimes(1)
    expect(sdk.schedulesUpdate.mock.calls[0][1].end_behavior).toBe('cancel')
  })
})

describe('precosDoParcelado — a divisão em centavos chega ao Stripe', () => {
  it('R$ 2.000,00 em 12 → um `price` de 16667 e um de 16663', async () => {
    sdk.pricesList.mockImplementation(({ lookup_keys }: { lookup_keys: string[] }) =>
      Promise.resolve({ data: [{ id: `price_de_${lookup_keys[0]}` }] }),
    )

    const precos = await precosDoParcelado(
      { id: 'safra_1', nome: 'Novembro 2026', valor_mensal: 299.99, stripe_price_id: null },
      { valorTotal: 2000, parcelas: 12 },
    )

    expect(precos).toEqual({
      priceRegular: 'price_de_safra_safra_1_16667',
      priceUltima: 'price_de_safra_safra_1_16663',
    })
  })
})

describe('encerrarAssinatura com schedule (D-17)', () => {
  // ⚠️ Assinatura com schedule recusa `cancel_at_period_end` direto. Sem o
  // `release`, cancelar uma aluna do 12x daria erro e as parcelas
  // continuariam saindo.
  it('parcelado: solta o schedule ANTES de marcar o fim do período', async () => {
    sdk.subscriptionsRetrieve.mockResolvedValue({ id: SUB, schedule: SCHEDULE })

    await encerrarAssinatura(SUB)

    expect(sdk.schedulesRelease).toHaveBeenCalledWith(SCHEDULE)
    expect(sdk.subscriptionsUpdate).toHaveBeenCalledWith(SUB, { cancel_at_period_end: true })
    expect(sdk.schedulesRelease.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.subscriptionsUpdate.mock.invocationCallOrder[0],
    )
  })

  it('sem schedule: só marca o fim do período, como sempre', async () => {
    sdk.subscriptionsRetrieve.mockResolvedValue({ id: SUB, schedule: null })

    await encerrarAssinatura(SUB)

    expect(sdk.schedulesRelease).not.toHaveBeenCalled()
    expect(sdk.subscriptionsUpdate).toHaveBeenCalledWith(SUB, { cancel_at_period_end: true })
  })
})
