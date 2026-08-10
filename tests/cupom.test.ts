// ============================================================
// CUPOM — o que vale, o que não vale, e o que vira desconto no Stripe
//
// Dois blocos, e a divisão é a do próprio código:
//
//   1. `cupomInvalidoPorque` — função PURA. Não lê banco, não chama
//      Stripe, não olha o relógio por conta própria. É onde moram as seis
//      formas de um desconto não valer, e é o único pedaço da regra que
//      dá para exercitar sem dublê nenhum.
//
//   2. `cupomNoStripe` — a tradução dos nossos três tipos para o que o
//      Stripe entende. É aqui que um erro custa dinheiro de verdade: um
//      `percent_off` no campo errado desconta o mês inteiro em vez do
//      primeiro, e ninguém percebe até a segunda fatura.
//
// ⚠️ `agora` É PARÂMETRO, e é isso que torna o teste de expiração
// possível. Uma função que lê `new Date()` por dentro só poderia ser
// testada esperando o tempo passar — ou com datas absurdas que fariam o
// teste passar hoje e falhar em 2027.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => {
  // ⚠️ A CLASSE DE ERRO PRECISA NASCER AQUI, e ser a MESMA dos dois lados.
  // `cupomNoStripe` faz `err instanceof Stripe.errors.StripeInvalidRequestError`
  // para distinguir "não existe, então crie" de "a chave está errada, suba
  // o erro". Um erro solto com `code: 'resource_missing'` não é instância
  // de nada e cai no ramo de rethrow — o teste passaria a medir o caminho
  // de falha achando que mede o de criação.
  class StripeInvalidRequestError extends Error {
    code?: string
    constructor(code?: string) {
      super(code ?? 'erro')
      this.code = code
    }
  }

  return {
    StripeInvalidRequestError,
    couponsRetrieve: vi.fn(),
    couponsCreate: vi.fn(),
  }
})

// Só o SDK é dublê. `cupomNoStripe` roda de verdade — é ela que está sob
// teste, e o que se afirma é exatamente o que ela ENTREGA ao Stripe.
vi.mock('stripe', () => {
  class Stripe {
    coupons = { retrieve: dubles.couponsRetrieve, create: dubles.couponsCreate }
    static errors = { StripeInvalidRequestError: dubles.StripeInvalidRequestError }
  }

  return { default: Stripe }
})

process.env.STRIPE_SECRET_KEY = 'sk_test_que_nao_existe'
process.env.SUPABASE_URL = 'https://exemplo.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-que-nao-existe'

const { cupomNoStripe } = await import('@/lib/stripe')
const { cupomInvalidoPorque } = await import('@/lib/supabase')

const SAFRA = '11111111-2222-3333-4444-555555555555'
const OUTRA_SAFRA = '99999999-8888-7777-6666-555555555555'
const AGORA = new Date('2026-08-09T12:00:00.000Z')

/** Um cupom perfeitamente válido. Cada teste estraga um campo só. */
const VALIDO = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  codigo: 'BEMVINDA',
  tipo: 'primeiro_mes',
  valor: 20,
  stripe_coupon_id: 'cupom_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  safra_id: null,
  usos_max: null,
  usos_atuais: 0,
  expira_em: null,
  ativo: true,
}

// ============================================================
// 0. CONTROLE DO MÉTODO
//
// Tudo abaixo afirma que um cupom estragado é RECUSADO. Se a função
// recusasse tudo, todos passariam sem exercitar nada. Este bloco é o que
// torna os outros interpretáveis.
// ============================================================
describe('o cupom de controle passa', () => {
  it('válido, sem limite, sem validade, em qualquer safra → `null`', () => {
    expect(cupomInvalidoPorque(VALIDO, SAFRA, AGORA)).toBeNull()
  })
})

// ============================================================
// 1. AS SEIS FORMAS DE NÃO VALER
// ============================================================
describe('o que faz um cupom não valer', () => {
  it('inexistente — quem digitou errou o código', () => {
    expect(cupomInvalidoPorque(null, SAFRA, AGORA)).toBe('inexistente')
  })

  // O botão de pânico da Giovanna: o cupom vazou num grupo de WhatsApp e
  // ela precisa parar agora, sem apagar o histórico de quem já usou.
  it('inativo — ela desligou', () => {
    expect(cupomInvalidoPorque({ ...VALIDO, ativo: false }, SAFRA, AGORA)).toBe('inativo')
  })

  it('expirado — `expira_em` já passou', () => {
    const ontem = '2026-08-08T12:00:00.000Z'
    expect(cupomInvalidoPorque({ ...VALIDO, expira_em: ontem }, SAFRA, AGORA)).toBe('expirado')
  })

  // ⚠️ O par que prova que a comparação é com o `agora` RECEBIDO, e não
  // com o relógio da máquina que roda o teste.
  it('validade no futuro ainda vale', () => {
    const amanha = '2026-08-10T12:00:00.000Z'
    expect(cupomInvalidoPorque({ ...VALIDO, expira_em: amanha }, SAFRA, AGORA)).toBeNull()
  })

  it('esgotado — `usos_atuais` alcançou `usos_max`', () => {
    expect(
      cupomInvalidoPorque({ ...VALIDO, usos_max: 10, usos_atuais: 10 }, SAFRA, AGORA),
    ).toBe('esgotado')
  })

  // O último uso é uso. `usos_atuais === usos_max` já é esgotado;
  // `usos_max - 1` ainda desconta.
  it('o último uso ainda vale', () => {
    expect(cupomInvalidoPorque({ ...VALIDO, usos_max: 10, usos_atuais: 9 }, SAFRA, AGORA)).toBeNull()
  })

  it('de outra safra', () => {
    expect(cupomInvalidoPorque({ ...VALIDO, safra_id: OUTRA_SAFRA }, SAFRA, AGORA)).toBe(
      'outra_safra',
    )
  })

  // ⚠️ `safra_id` NULO NÃO É AUSÊNCIA DE DADO — é um valor de negócio: o
  // cupom de campanha que vale na turma que estiver aberta (`013`). Tratar
  // o nulo como "sem safra, então recusa" quebraria justamente o cupom que
  // a Giovanna mais usa.
  it('`safra_id` nulo vale em QUALQUER safra', () => {
    expect(cupomInvalidoPorque({ ...VALIDO, safra_id: null }, OUTRA_SAFRA, AGORA)).toBeNull()
  })

  // O cupom existe aqui e ainda não existe no Stripe — estado real e
  // transitório, porque a criação lá é uma chamada de rede que pode falhar
  // depois de a linha estar gravada. Aplicar assim cobraria o valor cheio
  // de quem viu "cupom aplicado" na tela.
  it('sem espelho no Stripe', () => {
    expect(cupomInvalidoPorque({ ...VALIDO, stripe_coupon_id: null }, SAFRA, AGORA)).toBe(
      'sem_espelho',
    )
  })
})

// ============================================================
// 2. A TRADUÇÃO PARA O STRIPE — onde o erro custa dinheiro
//
// ⚠️ A LEITURA DE `valor` MUDA CONFORME O `tipo`, e é a decisão mais fácil
// de errar deste projeto (está escrita assim na `013`):
//
//   primeiro_mes  → `valor` é PERCENTUAL   (20 = 20% no 1º mês)
//   todos_meses   → `valor` é PERCENTUAL   (15 = 15% em todas)
//   meses_gratis  → `valor` é CONTAGEM     (1 = 1 mês grátis)
// ============================================================
describe('o espelho no Stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `resource_missing` é o único erro que vira "então crie". Qualquer
    // outro sobe — ver `cupomNoStripe`.
    dubles.couponsRetrieve.mockRejectedValue(
      new dubles.StripeInvalidRequestError('resource_missing'),
    )
    dubles.couponsCreate.mockResolvedValue({ id: 'ok' })
  })

  /** O que foi entregue ao Stripe na criação. */
  const criado = () => dubles.couponsCreate.mock.calls[0][0]

  it('o id é determinístico — `cupom_<uuid>`', async () => {
    const id = await cupomNoStripe({ ...VALIDO, tipo: 'primeiro_mes' })

    expect(id).toBe(`cupom_${VALIDO.id}`)
    expect(criado().id).toBe(`cupom_${VALIDO.id}`)
  })

  // ⚠️ Se o cupom JÁ existe lá, nada é criado. É o que torna a chamada
  // idempotente: o checkout tenta espelhar a cada compra, e espelhar duas
  // vezes não pode virar dois cupons.
  it('cupom que já existe não é recriado', async () => {
    dubles.couponsRetrieve.mockResolvedValue({ id: `cupom_${VALIDO.id}` })

    const id = await cupomNoStripe(VALIDO)

    expect(id).toBe(`cupom_${VALIDO.id}`)
    expect(dubles.couponsCreate).not.toHaveBeenCalled()
  })

  it('`primeiro_mes` vira `percent_off` com `duration: once`', async () => {
    await cupomNoStripe({ ...VALIDO, tipo: 'primeiro_mes', valor: 20 })

    expect(criado().percent_off).toBe(20)
    expect(criado().duration).toBe('once')
  })

  // ⚠️ `forever` NÃO É "para sempre" NA PRÁTICA, e é seguro por causa da
  // D-05: a assinatura morre no 6º mês por `cancel_at`. "Para sempre" dura
  // o que o contrato durar. A alternativa (`repeating` + duração da safra)
  // faria o cupom depender da duração vigente quando ele foi criado.
  it('`todos_meses` vira `percent_off` com `duration: forever`', async () => {
    await cupomNoStripe({ ...VALIDO, tipo: 'todos_meses', valor: 15 })

    expect(criado().percent_off).toBe(15)
    expect(criado().duration).toBe('forever')
  })

  // ⚠️ `meses_gratis` vira 100% por N meses, e NÃO `amount_off`. Um
  // `amount_off` teria que ser a mensalidade em centavos — o cupom passaria
  // a conhecer o preço da safra e ficaria errado no dia em que o preço
  // mudasse.
  it('`meses_gratis` vira 100% por N meses, e o valor é CONTAGEM', async () => {
    await cupomNoStripe({ ...VALIDO, tipo: 'meses_gratis', valor: 2 })

    expect(criado().percent_off).toBe(100)
    expect(criado().duration).toBe('repeating')
    expect(criado().duration_in_months).toBe(2)
  })

  // ⚠️ O `default` do switch não é defensivo: ele impede um `tipo` novo de
  // virar um `coupon` SEM `percent_off`, que o Stripe aceita e que não
  // desconta nada. A aluna pagaria o valor cheio achando que usou o cupom.
  it('tipo desconhecido LANÇA, e não cria cupom sem desconto', async () => {
    await expect(cupomNoStripe({ ...VALIDO, tipo: 'meia_entrada' })).rejects.toThrow(
      'tipo desconhecido',
    )
    expect(dubles.couponsCreate).not.toHaveBeenCalled()
  })

  // ⚠️ `currency` fica de fora: ela só faz sentido com `amount_off`, e os
  // três tipos deste projeto são percentuais.
  it('nenhum dos três manda `currency` ou `amount_off`', async () => {
    for (const [tipo, valor] of [
      ['primeiro_mes', 20],
      ['todos_meses', 15],
      ['meses_gratis', 1],
    ] as const) {
      dubles.couponsCreate.mockClear()
      await cupomNoStripe({ ...VALIDO, tipo, valor })

      expect(criado().currency).toBeUndefined()
      expect(criado().amount_off).toBeUndefined()
    }
  })

  // A validade, o limite de usos e o vínculo com a safra NÃO viajam para o
  // Stripe: são regra NOSSA, verificada antes de a sessão nascer. Espelhar
  // `redeem_by` e `max_redemptions` duplicaria a regra em dois sistemas, e
  // um dia os dois discordam — com o agravante de que o Stripe seria a
  // versão que a aluna vê.
  it('validade, limite de usos e safra NÃO são espelhados', async () => {
    await cupomNoStripe({ ...VALIDO, tipo: 'primeiro_mes' })

    expect(criado().redeem_by).toBeUndefined()
    expect(criado().max_redemptions).toBeUndefined()
    expect(criado().applies_to).toBeUndefined()
  })
})

// ============================================================
// 3. ⚠️ SÓ `resource_missing` VIRA "ENTÃO CRIE"
//
// Tratar qualquer erro como "não existe" faria uma falha de autenticação
// virar uma tentativa de criar um cupom que já existe — e o erro real
// desapareceria atrás de um segundo erro sem relação nenhuma com a causa.
// ============================================================
describe('erro do Stripe que não é `resource_missing`', () => {
  // Os dublês são de módulo e sobrevivem entre `describe`s: sem isto, a
  // contagem de `couponsCreate` traria as chamadas do bloco anterior e o
  // `not.toHaveBeenCalled()` mediria o histórico em vez deste teste.
  beforeEach(() => vi.clearAllMocks())

  it('sobe, e não cria cupom nenhum', async () => {
    dubles.couponsRetrieve.mockRejectedValue(
      new dubles.StripeInvalidRequestError('api_key_expired'),
    )

    await expect(cupomNoStripe(VALIDO)).rejects.toThrow('api_key_expired')
    expect(dubles.couponsCreate).not.toHaveBeenCalled()
  })
})
