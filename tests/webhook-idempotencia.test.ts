// ============================================================
// `POST /api/stripe/webhook` — reentrega não conta duas vezes (`c46`)
//
// O Stripe REENTREGA. Não é falha, é o contrato: se o endpoint demorar,
// cair, devolver 500, ou se a resposta se perder no caminho de volta, o
// mesmo evento chega de novo — e pode chegar várias vezes, em qualquer
// ordem, dias depois.
//
// Sem defesa, um `invoice.paid` reentregue faz `ciclos_pagos++` duas
// vezes. A aluna que pagou 3 meses aparece com 4, a D-05 passa a encerrar
// cedo, e alguém deixa de receber aula que pagou. O erro é silencioso e só
// aparece meses depois, na reclamação.
//
// Este arquivo prova quatro coisas, e as quatro são de consequência:
//
//   1. RESERVA ANTES DE EFEITO. O insert em `eventos_stripe` acontece
//      antes de qualquer escrita, porque é a PRIMARY KEY que decide quem
//      processa quando duas entregas chegam ao mesmo tempo.
//   2. REENTREGA NÃO PRODUZ EFEITO NENHUM. 200, e zero escrita.
//   3. FALHA LIBERA A RESERVA. Sem isso, o 500 faria a reentrega ser
//      tratada como "já processado" e o efeito NUNCA aconteceria — uma
//      cobrança confirmada que não vira `ativa`, para sempre.
//   4. O CAS de `ciclos_pagos` devolvendo `false` não vira erro.
//
// ⚠️ CONTROLE NEGATIVO EMBUTIDO, e ele não é cerimônia. "Reentrega não
// escreve nada" é uma asserção sobre AUSÊNCIA, e ausência dá verde
// sozinha: se o dublê da rota nunca chamasse nada, o teste passaria
// medindo o vácuo. Por isso cada asserção de ausência tem, ao lado, a
// mesma chamada com a reserva CONCEDIDA — que precisa ficar vermelha se a
// implementação parar de escrever. É a lição do `c07` (um diferencial que
// deu "0 divergências" comparando vazio com vazio) aplicada aqui.
//
// ⚠️ NADA AQUI TOCA REDE, BANCO OU STRIPE. `@/lib/supabase` é dublê
// inteiro; de `@/lib/stripe` só as funções que falam com a rede são
// substituídas — `somarMeses` e `paraEpoch` continuam sendo as de
// verdade, porque a conta do prazo (D-05) é justamente o que não pode ser
// simulado.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `@/lib/stripe` e `@/lib/supabase` são `server-only`, e o pacote LANÇA
// quando importado fora de um Server Component — em Node puro, sempre. O
// dublê vazio permite testar os módulos sem afrouxar a proteção: o
// `import 'server-only'` continua no topo dos arquivos de produção, que é
// onde ele protege alguma coisa (REPORT §9.5).
vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => {
  // As classes de erro precisam nascer aqui: a fábrica do `vi.mock` é
  // içada para o topo, e a rota faz `err instanceof ...` — tem que ser a
  // MESMA classe dos dois lados, ou o `catch` cai no ramo errado e o teste
  // passa a medir outra coisa.
  class SupabaseNotConfiguredError extends Error {}
  class StripeNotConfiguredError extends Error {}
  class WebhookNotConfiguredError extends Error {}

  return {
    SupabaseNotConfiguredError,
    StripeNotConfiguredError,
    WebhookNotConfiguredError,

    verificarEventoDoStripe: vi.fn(),
    declararFimDaAssinatura: vi.fn(),
    subscriptionsRetrieve: vi.fn(),

    reservarEventoStripe: vi.fn(),
    liberarEventoStripe: vi.fn(),
    registrarAssinatura: vi.fn(),
    mudarStatusInscricao: vi.fn(),
    buscarAssinaturaPorSubscription: vi.fn(),
    buscarTravadosDaInscricao: vi.fn(),
    buscarInscricaoParaEmail: vi.fn(),
    contarCicloPago: vi.fn(),
    confirmarInscricao: vi.fn(),
  }
})

vi.mock('@/lib/stripe', async (original) => {
  const real = await original<typeof import('@/lib/stripe')>()
  return {
    // ⚠️ `somarMeses` e `paraEpoch` VÊM DE VERDADE. São a conta que
    // decide em que mês a assinatura morre (D-05), e substituí-las
    // transformaria este arquivo num teste de que a rota chama uma função
    // — não de que ela declara a data certa.
    somarMeses: real.somarMeses,
    paraEpoch: real.paraEpoch,
    StripeNotConfiguredError: dubles.StripeNotConfiguredError,
    WebhookNotConfiguredError: dubles.WebhookNotConfiguredError,
    verificarEventoDoStripe: dubles.verificarEventoDoStripe,
    declararFimDaAssinatura: dubles.declararFimDaAssinatura,
    stripe: () => ({ subscriptions: { retrieve: dubles.subscriptionsRetrieve } }),
  }
})

vi.mock('@/lib/supabase', () => ({
  SupabaseNotConfiguredError: dubles.SupabaseNotConfiguredError,
  reservarEventoStripe: dubles.reservarEventoStripe,
  liberarEventoStripe: dubles.liberarEventoStripe,
  registrarAssinatura: dubles.registrarAssinatura,
  mudarStatusInscricao: dubles.mudarStatusInscricao,
  buscarAssinaturaPorSubscription: dubles.buscarAssinaturaPorSubscription,
  buscarTravadosDaInscricao: dubles.buscarTravadosDaInscricao,
  buscarInscricaoParaEmail: dubles.buscarInscricaoParaEmail,
  contarCicloPago: dubles.contarCicloPago,
}))

vi.mock('@/lib/email', () => ({ confirmarInscricao: dubles.confirmarInscricao }))

// Caminho relativo, e não `@/`: o alias aponta para `src/`, e as rotas
// moram em `app/`. Mesma forma de `inscricao-rota.test.ts`.
const { POST } = await import('../app/api/stripe/webhook/route')

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------
const INSCRICAO_ID = '11111111-2222-3333-4444-555555555555'
const SUB_ID = 'sub_TESTE'
const ASSINATURA_ID = '99999999-8888-7777-6666-555555555555'

/** Um POST com o cabeçalho que o Stripe manda. O corpo é opaco: quem o
 *  interpreta é `verificarEventoDoStripe`, que aqui é dublê. */
function requisicao(corpo = '{"cru":true}', assinatura: string | null = 't=1,v1=abc') {
  return new Request('https://exemplo.invalid/api/stripe/webhook', {
    method: 'POST',
    body: corpo,
    headers: assinatura ? { 'stripe-signature': assinatura } : {},
  })
}

const SESSAO_COMPLETA = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_teste',
      client_reference_id: INSCRICAO_ID,
      subscription: SUB_ID,
      customer: 'cus_teste',
    },
  },
}

const FATURA_PAGA = {
  id: 'evt_2',
  type: 'invoice.paid',
  data: {
    object: {
      id: 'in_teste',
      parent: { subscription_details: { subscription: SUB_ID } },
    },
  },
}

/** Todas as escritas que um evento pode produzir. Uma lista só, para que
 *  "nada aconteceu" seja uma asserção sobre o conjunto e não sobre um
 *  dublê escolhido a dedo. */
function escritas() {
  return [
    dubles.declararFimDaAssinatura,
    dubles.registrarAssinatura,
    dubles.mudarStatusInscricao,
    dubles.contarCicloPago,
  ]
}

beforeEach(() => {
  vi.clearAllMocks()

  dubles.verificarEventoDoStripe.mockReturnValue(SESSAO_COMPLETA)
  dubles.reservarEventoStripe.mockResolvedValue(true)
  dubles.liberarEventoStripe.mockResolvedValue(undefined)
  dubles.buscarTravadosDaInscricao.mockResolvedValue({
    valor_mensal_travado: 299.99,
    duracao_meses_travada: 6,
    data_primeira_cobranca_travada: '2026-09-01',
  })
  dubles.subscriptionsRetrieve.mockResolvedValue({
    id: SUB_ID,
    status: 'trialing',
    trial_end: 1_788_220_800,
    cancel_at: 1_803_945_600,
  })
  dubles.buscarAssinaturaPorSubscription.mockResolvedValue({
    id: ASSINATURA_ID,
    inscricao_id: INSCRICAO_ID,
    ciclos_pagos: 2,
    cancel_at: '2027-03-01T00:00:00.000Z',
  })
  dubles.contarCicloPago.mockResolvedValue(true)
  dubles.buscarInscricaoParaEmail.mockResolvedValue({
    nome: 'Maria Silva',
    email: 'maria@exemplo.com',
    telefone: '+5521987654321',
    nivel_ingles: 'basico',
    curso: 'Fonoaudiologia',
    periodo: '6º semestre',
    disponibilidade: ['seg', 'qua'],
    safra: { nome: 'Setembro 2026', data_inicio_aulas: '2026-09-01' },
  })
})

// ============================================================
// 0. CONTROLE DO MÉTODO — o caminho feliz escreve mesmo?
//
// Tudo abaixo mede AUSÊNCIA de escrita. Se a rota não escrevesse nada em
// situação nenhuma, os testes de ausência passariam medindo o vácuo. Este
// bloco é o que torna os outros interpretáveis.
// ============================================================
describe('o caminho feliz produz efeito — sem isto, "nada aconteceu" não prova nada', () => {
  it('sessão concluída: declara o fim, espelha a assinatura e confirma a inscrição', async () => {
    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    expect(dubles.declararFimDaAssinatura).toHaveBeenCalledTimes(1)
    expect(dubles.registrarAssinatura).toHaveBeenCalledTimes(1)
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO_ID, 'confirmada')
  })

  // A conta da D-05, com as funções de verdade: 2026-09-01 + 6 meses =
  // 2027-03-01. Seis faturas, não sete. Se alguém trocar `somarMeses` por
  // `+ duracao` em milissegundos, ou contar intervalos em vez de faturas,
  // é aqui que fica vermelho.
  it('o `cancel_at` declarado é `data_primeira_cobranca_travada + duracao_meses_travada`', async () => {
    await POST(requisicao())

    const esperado = Math.floor(Date.UTC(2027, 2, 1) / 1000)
    expect(dubles.declararFimDaAssinatura).toHaveBeenCalledWith(SUB_ID, esperado)
  })

  // ⚠️ A conta sai da INSCRIÇÃO, nunca da safra: entre o checkout e este
  // webhook a Giovanna pode ter mudado preço ou duração, e a assinatura
  // que está nascendo é a do contrato que a pessoa aceitou (D-06).
  it('os travados vêm da inscrição, e é a inscrição da sessão', async () => {
    await POST(requisicao())
    expect(dubles.buscarTravadosDaInscricao).toHaveBeenCalledWith(INSCRICAO_ID)
  })

  it('fatura paga: conta o ciclo e ativa', async () => {
    dubles.verificarEventoDoStripe.mockReturnValue(FATURA_PAGA)

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    expect(dubles.contarCicloPago).toHaveBeenCalledWith(ASSINATURA_ID, 2)
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO_ID, 'ativa')
  })
})

// ============================================================
// 1. A RESERVA VEM ANTES DO EFEITO (`014`, `c41`)
// ============================================================
describe('o insert do evento acontece antes de qualquer escrita', () => {
  it('reserva o evento com id, tipo e payload', async () => {
    await POST(requisicao())

    expect(dubles.reservarEventoStripe).toHaveBeenCalledWith({
      id: 'evt_1',
      tipo: 'checkout.session.completed',
      payload: SESSAO_COMPLETA,
    })
  })

  // A ordem é o mecanismo inteiro: duas entregas simultâneas em duas
  // instâncias serverless são separadas pela PRIMARY KEY, e só funciona
  // se a reserva for a PRIMEIRA coisa. Um `select` antes teria janela.
  it('a reserva é a primeira chamada — nenhuma escrita a precede', async () => {
    const ordem: string[] = []
    dubles.reservarEventoStripe.mockImplementation(async () => {
      ordem.push('reserva')
      return true
    })
    for (const escrita of escritas()) {
      escrita.mockImplementation(async () => {
        ordem.push('escrita')
        return true
      })
    }

    await POST(requisicao())

    expect(ordem[0]).toBe('reserva')
    expect(ordem.length).toBeGreaterThan(1)
  })
})

// ============================================================
// 2. ⚠️ O CORAÇÃO DO `c46` — reentrega não conta duas vezes
// ============================================================
describe('reentrega do mesmo evento não produz efeito nenhum', () => {
  it('responde 200 — o Stripe cumpriu a parte dele', async () => {
    dubles.reservarEventoStripe.mockResolvedValue(false)
    const res = await POST(requisicao())
    expect(res.status).toBe(200)
  })

  it('nenhuma das escritas acontece', async () => {
    dubles.reservarEventoStripe.mockResolvedValue(false)
    await POST(requisicao())

    for (const escrita of escritas()) {
      expect(escrita, `${escrita.getMockName()} foi chamada numa reentrega`).not.toHaveBeenCalled()
    }
  })

  // O caso que o `012` descreve por extenso: a aluna que pagou 3 meses
  // aparecendo com 4, a D-05 encerrando cedo, e alguém deixando de receber
  // aula que pagou.
  it('`invoice.paid` reentregue NÃO soma um segundo ciclo', async () => {
    dubles.verificarEventoDoStripe.mockReturnValue(FATURA_PAGA)
    dubles.reservarEventoStripe.mockResolvedValue(false)

    await POST(requisicao())

    expect(dubles.contarCicloPago).not.toHaveBeenCalled()
  })

  // ⚠️ CONTROLE NEGATIVO do teste acima, e ele é obrigatório: a mesma
  // chamada, com a reserva CONCEDIDA, tem que somar. Sem este par, "não
  // somou" seria indistinguível de "a rota não sabe somar".
  it('controle negativo: com a reserva concedida, o mesmo evento SOMA', async () => {
    dubles.verificarEventoDoStripe.mockReturnValue(FATURA_PAGA)
    dubles.reservarEventoStripe.mockResolvedValue(true)

    await POST(requisicao())

    expect(dubles.contarCicloPago).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// 3. ⚠️ FALHA LIBERA A RESERVA
//
// A armadilha: "grava antes" + "reentrega não conta duas vezes" juntas
// produzem um terceiro comportamento que ninguém pediu — evento gravado,
// efeito falha, 500, reentrega vê "já processado" e pula, e o efeito NUNCA
// acontece. Silencioso, financeiro, indistinguível de sucesso.
// ============================================================
describe('handler que falha devolve o evento para a fila', () => {
  beforeEach(() => {
    dubles.declararFimDaAssinatura.mockRejectedValue(new Error('stripe fora do ar'))
  })

  it('responde 500 — é o que faz o Stripe reentregar', async () => {
    const res = await POST(requisicao())
    expect(res.status).toBe(500)
  })

  it('apaga a reserva daquele evento, e só dele', async () => {
    await POST(requisicao())
    expect(dubles.liberarEventoStripe).toHaveBeenCalledWith('evt_1')
  })

  // ⚠️ Se a própria liberação falhar, a resposta continua sendo 500 e o
  // log grita. Trocar o 500 por outra coisa aqui esconderia a falha
  // original atrás da consequência dela.
  it('liberação que também falha não muda a resposta', async () => {
    dubles.liberarEventoStripe.mockRejectedValue(new Error('banco fora do ar'))
    const res = await POST(requisicao())
    expect(res.status).toBe(500)
  })

  it('sucesso NÃO libera a reserva', async () => {
    dubles.declararFimDaAssinatura.mockResolvedValue(undefined)
    await POST(requisicao())
    expect(dubles.liberarEventoStripe).not.toHaveBeenCalled()
  })
})

// ============================================================
// 4. A SEGUNDA TRANCA — o compare-and-swap de `ciclos_pagos`
// ============================================================
describe('`contarCicloPago` devolvendo false não é falha', () => {
  it('responde 200 e ativa a inscrição do mesmo jeito', async () => {
    dubles.verificarEventoDoStripe.mockReturnValue(FATURA_PAGA)
    dubles.contarCicloPago.mockResolvedValue(false)

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO_ID, 'ativa')
  })
})

// ============================================================
// 5. A VERIFICAÇÃO DE ASSINATURA — o que separa "o Stripe disse" de
//    "alguém disse"
// ============================================================
describe('sem assinatura válida, nada é reservado e nada é escrito', () => {
  it('POST sem `stripe-signature` → 400', async () => {
    const res = await POST(requisicao('{}', null))

    expect(res.status).toBe(400)
    expect(dubles.reservarEventoStripe).not.toHaveBeenCalled()
  })

  // ⚠️ 400 e não 500, e a diferença é deliberada: o Stripe NÃO reentrega
  // 4xx. Reentregar um evento forjado não o tornaria verdadeiro.
  it('assinatura que não confere → 400, e o evento nem é reservado', async () => {
    dubles.verificarEventoDoStripe.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })

    const res = await POST(requisicao())

    expect(res.status).toBe(400)
    expect(dubles.reservarEventoStripe).not.toHaveBeenCalled()
    for (const escrita of escritas()) expect(escrita).not.toHaveBeenCalled()
  })

  // ⚠️ Falta de env var é problema NOSSO: 500, porque o evento é legítimo
  // e vai poder ser processado assim que a variável existir. Um 400 faria
  // o Stripe desistir de um pagamento verdadeiro por causa de um deploy
  // mal configurado.
  it('segredo ausente → 500, não 400', async () => {
    dubles.verificarEventoDoStripe.mockImplementation(() => {
      throw new dubles.WebhookNotConfiguredError('sem segredo')
    })

    const res = await POST(requisicao())
    expect(res.status).toBe(500)
  })
})

// ============================================================
// 6. EVENTO SEM HANDLER — registrado, e não tratado como erro
//
// Um endpoint configurado com "todos os eventos" recebe dezenas por dia.
// Tratar o desconhecido como falha faria o Stripe reentregar para sempre
// um `customer.updated` que nunca vai ter handler.
// ============================================================
describe('evento sem handler', () => {
  it('é reservado, responde 200 e não escreve nada', async () => {
    dubles.verificarEventoDoStripe.mockReturnValue({
      id: 'evt_9',
      type: 'customer.updated',
      data: { object: {} },
    })

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    expect(dubles.reservarEventoStripe).toHaveBeenCalledTimes(1)
    for (const escrita of escritas()) expect(escrita).not.toHaveBeenCalled()
  })
})

// ============================================================
// 7. A CONFIRMAÇÃO DA ALUNA — sai daqui, e não do insert
//
// ⚠️ A ROTA DE INSCRIÇÃO DEIXOU DE MANDÁ-LA no `c35`: pela D-02 é pagar
// que faz entrar, e uma confirmação disparada no insert diria "sua
// inscrição está confirmada" para alguém que ainda ia digitar o cartão.
// Este é o primeiro instante em que a frase é verdade.
// ============================================================
describe('o e-mail de confirmação', () => {
  it('sai depois do pagamento, com os dados da inscrição', async () => {
    await POST(requisicao())

    expect(dubles.buscarInscricaoParaEmail).toHaveBeenCalledWith(INSCRICAO_ID)
    expect(dubles.confirmarInscricao).toHaveBeenCalledTimes(1)

    const [inscricao, safra] = dubles.confirmarInscricao.mock.calls[0]
    expect(inscricao.email).toBe('maria@exemplo.com')
    expect(safra?.data_inicio_aulas).toBe('2026-09-01')
  })

  // ⚠️ DEPOIS de todas as escritas, e a ordem é o comportamento: se o
  // e-mail saísse antes de `mudarStatusInscricao` e o update quebrasse, o
  // 500 faria o Stripe reentregar e a segunda passagem mandaria um SEGUNDO
  // e-mail para a mesma pessoa.
  it('só depois de a inscrição virar `confirmada`', async () => {
    const ordem: string[] = []
    dubles.mudarStatusInscricao.mockImplementation(async () => {
      ordem.push('status')
    })
    dubles.confirmarInscricao.mockImplementation(async () => {
      ordem.push('email')
    })

    await POST(requisicao())
    expect(ordem).toEqual(['status', 'email'])
  })

  // ⚠️ FALHA DE E-MAIL É LOG, NÃO REENTREGA. O efeito financeiro inteiro
  // já aconteceu; devolver 500 faria o Stripe reprocessar um pagamento
  // para reenviar uma mensagem.
  it('Resend fora do ar não vira 500', async () => {
    dubles.confirmarInscricao.mockRejectedValue(new Error('resend fora do ar'))
    const res = await POST(requisicao())
    expect(res.status).toBe(200)
  })

  it('leitura que falha também não vira 500', async () => {
    dubles.buscarInscricaoParaEmail.mockRejectedValue(new Error('banco fora do ar'))
    const res = await POST(requisicao())
    expect(res.status).toBe(200)
  })

  // Linha herdada da `010`: `consent` e perfil podem ser nulos, porque
  // `null` significa "não sabemos" e não houve backfill. Sem perfil a
  // mensagem sairia com um buraco no meio.
  it('perfil incompleto → nenhum e-mail, e ainda assim 200', async () => {
    dubles.buscarInscricaoParaEmail.mockResolvedValue(null)

    const res = await POST(requisicao())

    expect(res.status).toBe(200)
    expect(dubles.confirmarInscricao).not.toHaveBeenCalled()
    // ⚠️ Controle negativo do teste acima: o mesmo evento, com perfil
    // completo, MANDA. Sem este par, "não mandou" seria indistinguível de
    // "a rota não sabe mandar".
    expect(dubles.mudarStatusInscricao).toHaveBeenCalledWith(INSCRICAO_ID, 'confirmada')
  })
})
