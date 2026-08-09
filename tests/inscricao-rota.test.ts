// ============================================================
// `POST /api/inscricao` — o que a rota decide, e o que ela recusa decidir
//
// Três propriedades, e as três são de consequência:
//
//   1. O PAR (`safra_id`, `status`). O CHECK
//      `inscricoes_safra_status_coerentes_check` da `009` amarra
//      `safra_id is null` ⟺ `lista_espera`. A rota não manda `status` —
//      ele é DERIVADO dentro da função —, então o único jeito de ela
//      errar o par é errando a decisão sobre a safra. É essa decisão que
//      este arquivo prova, nos dois sentidos.
//
//   2. A RESPOSTA DE DUPLICATA. `false` da RPC é sucesso: 200, `ok:
//      true`, `duplicada: true`, e **nenhum e-mail**. A reversão parcial
//      do REPORT §9.2 (decidida no `c21`) mudou a resposta HTTP e NÃO
//      mudou o e-mail — são duas decisões que estavam juntas por
//      acidente, e a segunda continua inteira.
//
//   3. `false` NÃO É EXCEÇÃO. Duplicata é sucesso; exceção da RPC é falha
//      de infra. Colapsar os dois é o erro mais fácil de introduzir aqui,
//      e ele responderia 500 para alguém com o cadastro perfeitamente
//      gravado.
//
// ⚠️ NADA AQUI TOCA BANCO, REDE OU NAVEGADOR. `@/lib/supabase` e
// `@/lib/email` são substituídos por dublês, e a rota é chamada como a
// função que ela é. O que se afirma é o que ela PASSA para a camada de
// baixo e o que ela DEVOLVE — que é exatamente a fronteira onde as três
// decisões acima acontecem.
//
// `next/server` também é dublê: `after` só existe dentro de uma
// requisição de verdade. O dublê guarda a callback em vez de executá-la,
// e é isso que torna "duplicata não dispara e-mail" uma asserção direta —
// não se espera um e-mail que não vem, se conta as tarefas agendadas.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_TEXT } from '@/config/consentimento'

// `@/lib/stripe` é `server-only`, e o pacote LANÇA quando importado fora
// de um Server Component — em Node puro, sempre. O dublê vazio permite
// testar a rota sem afrouxar a proteção: o `import 'server-only'`
// continua no topo do arquivo de produção, que é onde ele protege alguma
// coisa (REPORT §9.5).
vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => {
  // As classes precisam nascer aqui dentro: a fábrica do `vi.mock` é
  // içada para o topo do módulo, e a rota faz `err instanceof
  // SupabaseNotConfiguredError` — tem que ser a MESMA classe dos dois
  // lados, ou o `catch` cai no ramo errado e o teste passa a medir outra
  // coisa.
  class SupabaseNotConfiguredError extends Error {}
  class StripeNotConfiguredError extends Error {}

  return {
    SupabaseNotConfiguredError,
    StripeNotConfiguredError,
    buscarSafraAtiva: vi.fn(),
    criarInscricao: vi.fn(),
    salvarStripePriceId: vi.fn(),
    buscarCupom: vi.fn(),
    salvarStripeCouponId: vi.fn(),
    cupomNoStripe: vi.fn(),
    precoDoContrato: vi.fn(),
    criarSessaoDeCheckout: vi.fn(),
    notificarAdmin: vi.fn(),
    confirmarInscricao: vi.fn(),
    /** O que o `after` agendou. Uma tarefa = um lote de e-mails. */
    tarefas: [] as Array<() => unknown>,
  }
})

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    dubles.tarefas.push(fn)
  },
}))

// ⚠️ `cupomInvalidoPorque` VEM DE VERDADE. Ela é pura — não lê banco, não
// chama Stripe, não olha o relógio por conta própria —, e é a regra que
// decide se um desconto vale. Substituí-la faria os testes de cupom
// abaixo provarem que a rota chama uma função, e não que ela recusa um
// cupom expirado.
vi.mock('@/lib/supabase', async (original) => {
  const real = await original<typeof import('@/lib/supabase')>()
  return {
    cupomInvalidoPorque: real.cupomInvalidoPorque,
    SupabaseNotConfiguredError: dubles.SupabaseNotConfiguredError,
    buscarSafraAtiva: dubles.buscarSafraAtiva,
    criarInscricao: dubles.criarInscricao,
    salvarStripePriceId: dubles.salvarStripePriceId,
    buscarCupom: dubles.buscarCupom,
    salvarStripeCouponId: dubles.salvarStripeCouponId,
  }
})

// ⚠️ `ancorasDaAssinatura` e `trialEhAceitavel` VÊM DE VERDADE. São a
// conta da D-04 e a regra das 48 horas do Stripe — substituí-las
// transformaria os testes de checkout em "a rota chama uma função" em vez
// de "a rota manda a data certa".
vi.mock('@/lib/stripe', async (original) => {
  const real = await original<typeof import('@/lib/stripe')>()
  return {
    ancorasDaAssinatura: real.ancorasDaAssinatura,
    trialEhAceitavel: real.trialEhAceitavel,
    StripeNotConfiguredError: dubles.StripeNotConfiguredError,
    precoDoContrato: dubles.precoDoContrato,
    criarSessaoDeCheckout: dubles.criarSessaoDeCheckout,
    cupomNoStripe: dubles.cupomNoStripe,
  }
})

vi.mock('@/lib/email', () => ({
  notificarAdmin: dubles.notificarAdmin,
  confirmarInscricao: dubles.confirmarInscricao,
}))

const { POST } = await import('../app/api/inscricao/route')

// ------------------------------------------------------------
// Uma safra de mentira, com a forma exata do que `buscarSafraAtiva`
// devolve. `inscricoes_abertas` é o campo que decide tudo aqui.
// ------------------------------------------------------------
const SAFRA_ID = '11111111-2222-3333-4444-555555555555'

const safra = (inscricoes_abertas: boolean) => ({
  id: SAFRA_ID,
  nome: 'Setembro 2026',
  data_inicio_aulas: '2026-09-01',
  data_primeira_cobranca: '2026-09-01',
  valor_mensal: 299.99,
  duracao_meses: 6,
  inscricoes_abertas,
  vagas_total: 20,
  inscritas: 3,
})

/** O payload que a modal manda. Cada teste muda um campo só. */
const VALIDO = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  phone: '+5521987654321',
  nivel_ingles: 'basico',
  curso: 'Biomedicina',
  periodo: '1º ao 3º',
  disponibilidade: ['seg', 'qua'],
  consent: true,
  website: '',
}

// ⚠️ Um IP novo por requisição, e não é enfeite. O rate limit da rota é um
// Map de MÓDULO: cinco chamadas do mesmo IP dentro de um minuto e a sexta
// vira 429. Com IP fixo, o arquivo passaria a medir o rate limit em vez do
// que ele quer medir — e a falha apareceria no teste que por acaso ficasse
// em sexto lugar, não naquele que quebrou.
let contador = 0
const ipNovo = () => `203.0.113.${(contador++ % 250) + 1}`

async function post(patch: Record<string, unknown> = {}) {
  const res = await POST(
    new Request('http://localhost/api/inscricao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ipNovo(),
      },
      body: JSON.stringify({ ...VALIDO, ...patch }),
    }),
  )
  return { res, body: await res.json() }
}

/** Os argumentos com que a rota chamou `criarInscricao`. */
const argumentos = () => dubles.criarInscricao.mock.calls[0][0]

/** Roda o que o `after` agendou — o lote de e-mails, se houver. */
async function rodarTarefas() {
  for (const t of dubles.tarefas) await t()
}

beforeEach(() => {
  vi.clearAllMocks()
  dubles.tarefas.length = 0
  // O default de cada teste: safra existe e está FECHADA, que é o estado
  // em que o corte 1 sobe (`docs/04-PLANO.md`). Quem quiser outro estado
  // o declara.
  dubles.buscarSafraAtiva.mockResolvedValue(safra(false))
  dubles.criarInscricao.mockResolvedValue({ ok: true, criada: true })
})

// ============================================================
// 1. O PAR `safra_id` / `status`
//
// A rota nunca manda `status`. Ela manda `safra_id`, e o `case when
// p_safra_id is null` da `011b` deriva o resto. Os dois só podem sair
// incoerentes se a decisão sobre a safra estiver errada — e o CHECK da
// `009` recusaria o insert, o que significa uma inscrição PERDIDA, não um
// dado torto.
// ============================================================
describe('o par safra_id / status', () => {
  it('safra FECHADA → `safra_id: null`, e a promessa é a de lista de espera', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(false))

    const { res, body } = await post()

    expect(argumentos().safra_id).toBeNull()
    expect(res.status).toBe(200)
    // A mensagem é a outra metade do par: prometer "inscrição confirmada"
    // a quem foi gravada em `lista_espera` seria a promessa que o banco
    // não registrou.
    expect(body.message).toMatch(/lista de espera|avisaremos/i)
    expect(body.message).not.toMatch(/confirmada/i)
  })

  it('safra ABERTA → `safra_id` é o id daquela safra', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))

    const { res, body } = await post()

    expect(argumentos().safra_id).toBe(SAFRA_ID)
    expect(res.status).toBe(200)
    expect(body.message).toMatch(/confirmada/i)
  })

  // ⚠️ "VEIO SAFRA" NÃO É O SINAL (D-13). `buscarSafraAtiva` devolve a
  // safra de VITRINE — a mais recente, aberta ou não —, porque fechar as
  // inscrições não pode apagar preço e data do site. Se a rota decidisse
  // por `safra !== null`, com as inscrições fechadas TODA inscrição
  // nasceria `pendente_pagamento` numa safra que ninguém abriu.
  it('a decisão é `inscricoes_abertas`, não "veio safra"', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(false))
    await post()
    const comSafraFechada = argumentos().safra_id

    vi.clearAllMocks()
    dubles.criarInscricao.mockResolvedValue({ ok: true, criada: true })
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    await post()
    const comSafraAberta = argumentos().safra_id

    // As duas chamadas receberam uma safra NÃO-NULA. Só a flag diferia.
    expect(comSafraFechada).toBeNull()
    expect(comSafraAberta).toBe(SAFRA_ID)
  })

  // `=== true` e não coerção. Nada além do booleano verdadeiro, vindo do
  // banco, pode abrir o caminho que promete vaga.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string "true"', 'true'],
    ['o número 1', 1],
  ])('`inscricoes_abertas` = %s NÃO abre o caminho de vaga', async (_c, valor) => {
    dubles.buscarSafraAtiva.mockResolvedValue({ ...safra(true), inscricoes_abertas: valor })
    await post()
    expect(argumentos().safra_id).toBeNull()
  })

  it('sem safra nenhuma no banco → lista de espera', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(null)
    const { res } = await post()
    expect(argumentos().safra_id).toBeNull()
    expect(res.status).toBe(200)
  })

  // REPORT §9.3: falha de infra degrada para lista de espera, NUNCA para
  // tela de erro. Ainda dá para gravar o contato de alguém interessada, e
  // é isso que não pode ser perdido. O que não se pode é o contrário —
  // prometer vaga numa safra que não foi possível confirmar.
  it.each([
    ['uma falha qualquer', new Error('PostgREST fora do ar')],
    ['a ausência de env var', 'nao-configurado' as const],
  ])('consulta à safra que estoura (%s) → grava lista de espera, 200', async (_c, erro) => {
    dubles.buscarSafraAtiva.mockRejectedValue(
      erro === 'nao-configurado' ? new dubles.SupabaseNotConfiguredError() : erro,
    )

    const { res, body } = await post()

    expect(dubles.criarInscricao).toHaveBeenCalledTimes(1)
    expect(argumentos().safra_id).toBeNull()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  // O corte de fronteira da chamada. A lista é fechada de propósito:
  // `status` não está (é derivado na `016`), `consent` não está (a função
  // grava `true` fixo), `grupo_id` não está (D-03), `payment_choice` não
  // existe mais (D-11). Uma chave a mais aqui é uma decisão de negócio
  // atravessando por engano.
  //
  // ⚠️ `travados` ENTROU NO `c35`, e é o décimo primeiro. Ele é o contrato
  // copiado da safra (D-06) e anda colado em `safra_id`: `null` nos dois
  // ou preenchido nos dois. Ver o teste do bloco de checkout.
  it('manda exatamente onze campos — nem `status`, nem `consent`, nem `grupo_id`', async () => {
    await post()
    expect(Object.keys(argumentos()).sort()).toEqual(
      [
        'consent_at',
        'consent_text',
        'curso',
        'disponibilidade',
        'email',
        'nivel_ingles',
        'nome',
        'periodo',
        'safra_id',
        'telefone',
        'travados',
      ].sort(),
    )
  })
})

// ============================================================
// 2. CONSENTIMENTO — nasce no servidor, e o cliente não o contamina
//
// A assimetria é o ponto (REPORT §9.7): o navegador é a única fonte
// possível para o ATO de marcar a caixa, e a pior fonte imaginável para a
// hora do relógio e para a redação exibida. Um POST forjado poderia
// declarar que aceitou um texto que nunca existiu, com data conveniente.
// ============================================================
describe('o carimbo de consentimento', () => {
  it('`consent_text` é o CONSENT_TEXT do servidor', async () => {
    await post()
    expect(argumentos().consent_text).toBe(CONSENT_TEXT)
  })

  it('`consent_at` é ISO 8601 e é de AGORA, não do cliente', async () => {
    const antes = Date.now()
    await post()
    const at = argumentos().consent_at

    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    const t = Date.parse(at)
    expect(t).toBeGreaterThanOrEqual(antes)
    expect(t).toBeLessThanOrEqual(Date.now())
  })

  // O teste que dá nome ao bloco. Um POST que MANDA os dois campos, com
  // um texto que nunca existiu e uma data de 2020: nenhum dos dois pode
  // chegar ao banco. Quem os descarta é o `z.object` sem
  // `.passthrough()`; quem nunca os leria é a desestruturação da rota.
  // São duas barreiras para a mesma coisa, e é de propósito.
  it('um POST forjado não contamina nenhum dos dois', async () => {
    await post({
      consent_at: '2020-01-01T00:00:00.000Z',
      consent_text: 'Eu aceito qualquer coisa que você quiser.',
    })

    expect(argumentos().consent_text).toBe(CONSENT_TEXT)
    expect(argumentos().consent_at).not.toBe('2020-01-01T00:00:00.000Z')
    expect(Date.parse(argumentos().consent_at)).toBeGreaterThan(Date.parse('2025-01-01'))
  })

  // `consent` chega no payload (o Zod exige `z.literal(true)`) e NÃO
  // atravessa: a função grava `true` fixo, e um parâmetro capaz de pedir
  // `false` sugeriria que existe a opção "a pessoa recusou e entrou assim
  // mesmo".
  it('`consent` não é repassado — a função grava `true` fixo', async () => {
    await post()
    expect('consent' in argumentos()).toBe(false)
  })
})

// ============================================================
// 3. DUPLICATA — 200, o sinal chega ao cliente, e NENHUM e-mail
// ============================================================
describe('duplicata (`criada: false`)', () => {
  beforeEach(() => {
    dubles.criarInscricao.mockResolvedValue({ ok: true, criada: false })
  })

  // Ninguém preencheu nada errado: a pessoa está cadastrada, que é o
  // desfecho que ela queria. Um 4xx/5xx faria a modal mostrar "não
  // conseguimos salvar" sobre um cadastro que existe e está correto.
  it('responde 200 e `ok: true` — duplicata NÃO é erro', async () => {
    const { res, body } = await post()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  // A reversão parcial do §9.2 (c21): a modal precisa poder mostrar "já
  // tem cadastro" em vez da tela de sucesso, que promete vaga — e, quando
  // houver checkout, promete preço e desconto junto.
  it('o cliente recebe o sinal `duplicada: true`', async () => {
    const { body } = await post()
    expect(body.duplicada).toBe(true)
  })

  // ⚠️ A METADE DO §9.2 QUE **NÃO** AFROUXOU, e é a que impede a rota de
  // virar canhão de spam: reenviar o mesmo formulário dez vezes mandaria
  // dez e-mails para a pessoa e dez para a Giovana.
  it('NÃO dispara e-mail — nenhuma tarefa é sequer agendada', async () => {
    await post()
    expect(dubles.tarefas).toHaveLength(0)

    // E se alguém agendar alguma coisa no futuro, ela não pode mandar
    // e-mail: rodar o que foi agendado tem que continuar não chamando
    // nada. Sem isto, o teste acima passaria a ser sobre o `after`, e não
    // sobre o e-mail.
    await rodarTarefas()
    expect(dubles.notificarAdmin).not.toHaveBeenCalled()
    expect(dubles.confirmarInscricao).not.toHaveBeenCalled()
  })

  // A promessa é diferente nos dois modos, pelo motivo de sempre: dizer
  // "sua inscrição já está confirmada" a quem está na lista de espera
  // prometeria uma vaga que não existe.
  it('a mensagem acompanha o modo, e não afirma nada além do cadastro', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(false))
    const espera = (await post()).body.message

    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    const turma = (await post()).body.message

    expect(espera).toMatch(/lista de espera/i)
    expect(turma).toMatch(/turma/i)
    expect(espera).not.toBe(turma)

    // Nada além de "já existe cadastro para este e-mail". Sem nome, sem
    // data, sem posição na fila — cada um desses seria dado pessoal
    // entregue a quem só provou saber digitar um endereço.
    for (const m of [espera, turma]) {
      expect(m).not.toMatch(/Maria|maria@exemplo\.com|\d{2}\/\d{2}/)
    }
  })
})

// ============================================================
// 4. INSCRIÇÃO NOVA — o contraste que dá sentido ao bloco 3
//
// Sem ele, "duplicata não manda e-mail" passaria numa versão que não
// manda e-mail nunca. É o controle negativo embutido no arquivo.
// ============================================================
describe('inscrição nova (`criada: true`)', () => {
  it('agenda UM lote de e-mails, e ele manda os dois', async () => {
    await post()
    expect(dubles.tarefas).toHaveLength(1)

    await rodarTarefas()
    expect(dubles.notificarAdmin).toHaveBeenCalledTimes(1)
    expect(dubles.confirmarInscricao).toHaveBeenCalledTimes(1)
  })

  // A safra que vai ao e-mail é `null` quando ela não está ABERTA — e não
  // quando ela não existe. Um e-mail dizendo "sua turma começa em
  // setembro" para quem foi gravada em `lista_espera` seria a promessa que
  // o banco não registrou.
  it('safra fechada → os e-mails recebem `null` no lugar da safra', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(false))
    await post()
    await rodarTarefas()

    expect(dubles.notificarAdmin.mock.calls[0][1]).toBeNull()
    expect(dubles.confirmarInscricao.mock.calls[0][1]).toBeNull()
  })

  // ⚠️ COM SAFRA ABERTA, A CONFIRMAÇÃO PARA A ALUNA NÃO SAI MAIS AQUI, e
  // a mudança é do `c35`. Ela diria "sua inscrição está confirmada" para
  // alguém que ainda não pagou — e pela D-02 é pagar que faz entrar.
  // Quem manda é o webhook, depois de `checkout.session.completed`, que é
  // o instante em que a frase passa a ser verdade.
  //
  // O aviso para a Giovanna sai dos dois jeitos: o e-mail dela é
  // OPERACIONAL, não promessa. "Fulana está se inscrevendo agora" é
  // verdade mesmo que o cartão nunca seja digitado — e é ela que precisa
  // saber que existe gente chegando, inclusive gente que abandona o
  // checkout e vira fila de pendência (D-15).
  it('safra aberta → só a Giovanna é avisada, e com a safra que foi gravada', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    await post()
    await rodarTarefas()

    expect(dubles.notificarAdmin.mock.calls[0][1]?.id).toBe(SAFRA_ID)
    expect(dubles.confirmarInscricao).not.toHaveBeenCalled()
  })

  // `payment_choice` alimentava a linha "Pagamento" do e-mail da Giovana.
  // As duas saíram (D-11), e a linha não virou "—" nem "(não perguntado)".
  it('o objeto do e-mail não carrega `payment_choice`', async () => {
    await post()
    await rodarTarefas()
    expect('payment_choice' in dubles.notificarAdmin.mock.calls[0][0]).toBe(false)
  })
})

// ============================================================
// 5. `false` NÃO É EXCEÇÃO — os dois caminhos não podem se colapsar
//
// É o erro mais fácil de introduzir nesta rota, e o mais caro: responder
// 500 para alguém cujo cadastro está perfeitamente gravado no banco.
//
// A distinção existe porque as duas coisas são de naturezas diferentes.
// `false` é um VALOR DE RETORNO que a `011b` dá de propósito (o `on
// conflict do nothing` absorveu o conflito). Exceção é falha de infra —
// env var ausente, PostgREST fora do ar — e não tem para onde degradar:
// se a escrita não aconteceu, não existe versão reduzida do resultado que
// ainda seja verdade.
// ============================================================
describe('`false` é sucesso; exceção é falha', () => {
  it('duplicata → 200; exceção da RPC → 500. Nunca o contrário', async () => {
    dubles.criarInscricao.mockResolvedValue({ ok: true, criada: false })
    expect((await post()).res.status).toBe(200)

    dubles.criarInscricao.mockRejectedValue(new Error('PostgREST fora do ar'))
    expect((await post()).res.status).toBe(500)
  })

  it.each([
    ['uma falha qualquer', new Error('PostgREST fora do ar')],
    ['a ausência de env var', 'nao-configurado' as const],
  ])('exceção (%s) → 500, `ok: false`, e nenhum e-mail', async (_c, erro) => {
    dubles.criarInscricao.mockRejectedValue(
      erro === 'nao-configurado' ? new dubles.SupabaseNotConfiguredError() : erro,
    )

    const { res, body } = await post()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.duplicada).toBeUndefined()
    expect(dubles.tarefas).toHaveLength(0)
  })

  // O outro caminho de falha: a RPC respondeu, mas com erro do PostgREST.
  // `ok: false` é o insert que falha de verdade — a única exceção que o
  // §9.3 abre à regra de nunca mostrar tela de erro.
  it('`ok: false` da camada de baixo → 500, sem e-mail', async () => {
    dubles.criarInscricao.mockResolvedValue({
      ok: false,
      status: 400,
      detail: '23514 · check constraint',
    })

    const { res, body } = await post()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(dubles.tarefas).toHaveLength(0)
  })

  // Nenhum detalhe do banco atravessa para o cliente em nenhum dos
  // caminhos de falha. O `detail` existe só para o log do servidor.
  it('nenhuma resposta de falha ecoa detalhe do banco', async () => {
    dubles.criarInscricao.mockResolvedValue({
      ok: false,
      status: 400,
      detail: '23514 · inscricoes_consentimento_obrigatorio_check',
    })

    const { body } = await post()

    expect(JSON.stringify(body)).not.toMatch(/23514|constraint|inscricoes_/)
  })
})

// ============================================================
// 6. O QUE NÃO CHEGA A ESCREVER
// ============================================================
describe('as barreiras antes da escrita', () => {
  it('payload que o Zod recusa → 400, e a RPC não é chamada', async () => {
    const { res } = await post({ consent: false })
    expect(res.status).toBe(400)
    expect(dubles.criarInscricao).not.toHaveBeenCalled()
  })

  it('JSON quebrado → 400, e a RPC não é chamada', async () => {
    const res = await POST(
      new Request('http://localhost/api/inscricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ipNovo() },
        body: '{isto não é json',
      }),
    )
    expect(res.status).toBe(400)
    expect(dubles.criarInscricao).not.toHaveBeenCalled()
  })

  // ⚠️ O honeypot responde a mensagem de SUCESSO e nunca a de duplicata —
  // o caminho nem chega ao banco, então não há o que duplicar. Um bot que
  // recebesse "este e-mail já está inscrito" daqui teria descoberto, de
  // graça e sem rate limit, exatamente o que a resposta de duplicata
  // custou uma decisão consciente para conceder.
  it('honeypot preenchido → 200 de sucesso, sem escrita e sem e-mail', async () => {
    const { res, body } = await post({ website: 'http://spam.example' })

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.duplicada).toBeUndefined()
    expect(dubles.criarInscricao).not.toHaveBeenCalled()
    expect(dubles.tarefas).toHaveLength(0)
  })
})

// ============================================================
// 7. O TEXTO LIVRE DE "OUTRO" ATRAVESSA A ROTA INTEIRA
//
// A metade behavioral da lacuna do `c06`. A outra está em
// `inscricao-payload.test.ts` (a modal MANDA o texto digitado); esta
// afirma que o servidor não o perde no caminho — nem no Zod, nem na
// desestruturação, nem na montagem da chamada.
//
// Fechar `curso` num `z.enum(CURSOS)` faria estes testes reprovarem, que
// é exatamente para isso que eles existem.
// ============================================================
describe('curso e período livres chegam à RPC como foram digitados', () => {
  it.each([
    ['Fonoaudiologia', '6º semestre'],
    ['Nutrição', 'Mestrado'],
  ])('curso "%s" e período "%s" atravessam intactos', async (curso, periodo) => {
    await post({ curso, periodo })
    expect(argumentos().curso).toBe(curso)
    expect(argumentos().periodo).toBe(periodo)
    expect(argumentos().curso).not.toBe('Outro')
  })

  it('e o caminho comum também: a opção da lista chega como está', async () => {
    await post({ curso: 'Biomedicina', periodo: '1º ao 3º' })
    expect(argumentos().curso).toBe('Biomedicina')
    expect(argumentos().periodo).toBe('1º ao 3º')
  })
})

// ============================================================
// 7. O CHECKOUT (`c35`, `c36`, `c37`) — a sessão nasce nesta rota
//
// ⚠️ NÃO EXISTE `POST /api/checkout`, e a ausência é a decisão. Uma rota
// separada teria que receber do cliente QUAL inscrição pagar, e "nenhuma
// decisão de negócio vem do cliente" é a regra que abre o
// `02-FLUXOS.md` — qualquer pessoa abriria o checkout de uma inscrição
// alheia mandando outro id. Aqui o id vem da RPC que acabou de escrever a
// linha, na mesma requisição.
//
// ⚠️ `ancorasDaAssinatura` e `trialEhAceitavel` são as de VERDADE neste
// arquivo (ver os `vi.mock` do topo). O que se afirma abaixo sobre datas
// é a conta real, não um dublê concordando consigo mesmo.
// ============================================================
const INSCRICAO_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const CONTRATO = {
  valorMensal: 299.99,
  duracaoMeses: 6,
  dataPrimeiraCobranca: '2026-09-01',
}

/** A RPC devolvendo uma inscrição pagável. */
function rpcComCheckout(criada = true, contrato = CONTRATO) {
  dubles.criarInscricao.mockResolvedValue({
    ok: true,
    criada,
    inscricaoId: INSCRICAO_ID,
    contrato,
  })
}

describe('safra aberta abre o checkout', () => {
  beforeEach(() => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    rpcComCheckout()
    dubles.precoDoContrato.mockResolvedValue({ priceId: 'price_teste', criado: false })
    dubles.criarSessaoDeCheckout.mockResolvedValue('https://checkout.stripe.com/c/pay/teste')
  })

  it('responde `modo: checkout` com a url do Stripe', async () => {
    const { res, body } = await post()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.modo).toBe('checkout')
    expect(body.url).toBe('https://checkout.stripe.com/c/pay/teste')
  })

  // ⚠️ O fio que liga o pagamento à inscrição. Sem `client_reference_id` o
  // webhook recebe um id de sessão do Stripe e nenhuma forma de saber qual
  // linha confirmar.
  it('a sessão carrega o id da inscrição que a RPC devolveu', async () => {
    await post()
    expect(dubles.criarSessaoDeCheckout.mock.calls[0][0].inscricaoId).toBe(INSCRICAO_ID)
  })

  // D-06: o contrato é COPIADO da safra no momento do checkout.
  it('os travados enviados à RPC são os da safra', async () => {
    await post()
    expect(argumentos().travados).toEqual(CONTRATO)
  })

  // ⚠️ D-04: `trial_end` é a data de cobrança da safra, em epoch de
  // SEGUNDOS. A conta é a de verdade — 2026-09-01 UTC.
  it('`trial_end` é a data de primeira cobrança, em segundos', async () => {
    await post()
    const esperado = Math.floor(Date.UTC(2026, 8, 1) / 1000)
    expect(dubles.criarSessaoDeCheckout.mock.calls[0][0].trialEnd).toBe(esperado)
  })

  // ⚠️ O Stripe recusa `trial_end` a menos de 48h. Omitir e cobrar na hora
  // é o menos ruim: a alternativa não é "cobrar depois", é "não vender". E
  // o que NÃO se pode fazer é empurrar a data, que desalinharia os seis
  // ciclos inteiros.
  it('cobrança a menos de 48h → `trialEnd: null`, e a data NÃO é empurrada', async () => {
    const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    rpcComCheckout(true, { ...CONTRATO, dataPrimeiraCobranca: amanha })

    await post()
    expect(dubles.criarSessaoDeCheckout.mock.calls[0][0].trialEnd).toBeNull()
  })

  // ⚠️ O `price` sai do CONTRATO DA LINHA, não do valor da safra. Os dois
  // coincidem no caminho normal e divergem na retomada depois de uma
  // mudança de preço — e aí é o contrato que vale (D-06).
  it('o `price` é pedido para o valor do contrato devolvido', async () => {
    rpcComCheckout(false, { ...CONTRATO, valorMensal: 249.99 })
    await post()
    expect(dubles.precoDoContrato.mock.calls[0][1]).toBe(249.99)
  })

  // ⚠️ DUPLICATA TAMBÉM PAGA. Quem abandonou o checkout ficava preso em
  // `pendente_pagamento` recebendo "você já está inscrita" (D-15). Agora a
  // segunda tentativa abre a sessão da inscrição que já existe.
  it('duplicata em safra aberta abre o checkout, não a mensagem de duplicata', async () => {
    rpcComCheckout(false)
    const { body } = await post()

    expect(body.modo).toBe('checkout')
    expect(body.duplicada).toBeUndefined()
  })

  it('e a duplicata continua não disparando e-mail nenhum', async () => {
    rpcComCheckout(false)
    await post()
    await rodarTarefas()

    expect(dubles.notificarAdmin).not.toHaveBeenCalled()
    expect(dubles.confirmarInscricao).not.toHaveBeenCalled()
  })

  // ⚠️ A inscrição JÁ ESTÁ GRAVADA quando o Stripe falha. Não dá para
  // degradar para lista de espera — o par (safra_id, status) está no banco
  // —, e responder erro diria "não conseguimos salvar" sobre um cadastro
  // que existe. O que é verdade é a fila da D-15: alguém manda o link.
  it('Stripe fora do ar → 200 com a promessa da fila, nunca 500', async () => {
    dubles.criarSessaoDeCheckout.mockRejectedValue(new Error('stripe fora do ar'))
    const { res, body } = await post()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    // ⚠️ `modo: 'fila'` e não ausência de `modo`: sem ele a modal cai na
    // tela de sucesso genérica, que prometeria vaga reservada a quem não
    // pagou. É o servidor que sabe que o checkout não abriu.
    expect(body.modo).toBe('fila')
    expect(body.url).toBeUndefined()
    expect(body.message).toContain('link de pagamento')
  })

  // A gravação do `price` na safra é otimização de próxima chamada, não
  // requisito desta: o `priceId` devolvido pelo Stripe é válido agora.
  it('falha ao gravar o price na safra não derruba o checkout', async () => {
    dubles.precoDoContrato.mockResolvedValue({ priceId: 'price_novo', criado: true })
    dubles.salvarStripePriceId.mockRejectedValue(new Error('banco fora do ar'))

    const { body } = await post()
    expect(body.modo).toBe('checkout')
  })
})

// ============================================================
// 8. VAGAS — D-08, limite MOLE (`c36`)
//
// ⚠️ `vagas_total` nulo significa SEM LIMITE, e é o caso normal: a
// Giovanna respondeu que não precisa de número fixo de vagas — "podemos
// ter mais ou menos alunos dependendo da aderência deles e da
// disponibilidade da professora". A coluna existe para o dia em que ela
// quiser um teto.
//
// ⚠️ ESTOURO NÃO É ERRO — É LISTA DE ESPERA. Recusar aqui significa não
// abrir o checkout, nunca mostrar tela de erro (REPORT §9.3).
// ============================================================
describe('vaga é limite mole', () => {
  beforeEach(() => {
    rpcComCheckout()
    dubles.precoDoContrato.mockResolvedValue({ priceId: 'price_teste', criado: false })
    dubles.criarSessaoDeCheckout.mockResolvedValue('https://checkout.stripe.com/c/pay/teste')
  })

  it('`vagas_total` null → sem limite, o checkout abre', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue({
      ...safra(true),
      vagas_total: null,
      inscritas: 9999,
    })

    const { body } = await post()
    expect(body.modo).toBe('checkout')
  })

  it('vagas esgotadas → grava lista de espera, sem safra e sem contrato', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue({ ...safra(true), vagas_total: 20, inscritas: 20 })

    const { res, body } = await post()

    expect(argumentos().safra_id).toBeNull()
    expect(argumentos().travados).toBeNull()
    expect(res.status).toBe(200)
    expect(body.modo).toBeUndefined()
    expect(dubles.criarSessaoDeCheckout).not.toHaveBeenCalled()
  })

  // A última vaga é vaga. `inscritas === vagas_total` já é estouro;
  // `inscritas === vagas_total - 1` ainda compra.
  it('a última vaga ainda abre o checkout', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue({ ...safra(true), vagas_total: 20, inscritas: 19 })

    const { body } = await post()
    expect(body.modo).toBe('checkout')
  })
})

// ============================================================
// 9. CUPOM (`c49`) — validado ANTES de qualquer escrita
//
// ⚠️ A ORDEM É O COMPORTAMENTO. Validar depois do insert deixaria a pessoa
// gravada em `pendente_pagamento` por causa de um código digitado errado,
// e ela cairia na fila da D-15 sem ter feito nada além de trocar uma
// letra. Aqui, cupom inválido é 400, o formulário continua preenchido na
// tela, ela corrige e reenvia.
//
// ⚠️ `cupomInvalidoPorque` é a de VERDADE neste arquivo (ver os `vi.mock`
// do topo): o que se afirma abaixo é a regra real, não um dublê
// concordando consigo mesmo.
// ============================================================
const CUPOM_VALIDO = {
  id: 'cccccccc-dddd-eeee-ffff-000000000000',
  codigo: 'PARCERIA',
  tipo: 'primeiro_mes',
  valor: 20,
  stripe_coupon_id: 'cupom_cccccccc-dddd-eeee-ffff-000000000000',
  safra_id: null,
  usos_max: null,
  usos_atuais: 0,
  expira_em: null,
  ativo: true,
}

describe('o cupom', () => {
  beforeEach(() => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    rpcComCheckout()
    dubles.precoDoContrato.mockResolvedValue({ priceId: 'price_teste', criado: false })
    dubles.criarSessaoDeCheckout.mockResolvedValue('https://checkout.stripe.com/c/pay/teste')
    dubles.buscarCupom.mockResolvedValue(CUPOM_VALIDO)
    dubles.cupomNoStripe.mockResolvedValue(CUPOM_VALIDO.stripe_coupon_id)
  })

  it('válido → viaja para a sessão, com o id do Stripe e o nosso', async () => {
    const { body } = await post({ cupom: 'PARCERIA' })

    expect(body.modo).toBe('checkout')
    const sessao = dubles.criarSessaoDeCheckout.mock.calls[0][0]
    expect(sessao.stripeCouponId).toBe(CUPOM_VALIDO.stripe_coupon_id)
    expect(sessao.cupomId).toBe(CUPOM_VALIDO.id)
  })

  // ⚠️ Controle do método: sem cupom, os dois campos vão nulos. Sem este
  // par, "o cupom viajou" seria indistinguível de "a rota sempre manda
  // alguma coisa nesses campos".
  it('sem cupom → os dois campos vão nulos, e o banco nem é consultado', async () => {
    const { body } = await post()

    expect(body.modo).toBe('checkout')
    expect(dubles.buscarCupom).not.toHaveBeenCalled()
    const sessao = dubles.criarSessaoDeCheckout.mock.calls[0][0]
    expect(sessao.stripeCouponId).toBeNull()
    expect(sessao.cupomId).toBeNull()
  })

  // ⚠️ NADA É GRAVADO. É a propriedade que separa "corrige uma letra e
  // reenvia" de "você agora está em pendente_pagamento por engano".
  it.each([
    ['inexistente', null, 'Não encontramos'],
    ['expirado', { ...CUPOM_VALIDO, expira_em: '2020-01-01T00:00:00.000Z' }, 'expirou'],
    ['esgotado', { ...CUPOM_VALIDO, usos_max: 5, usos_atuais: 5 }, 'limite de usos'],
    ['inativo', { ...CUPOM_VALIDO, ativo: false }, 'não está mais disponível'],
    [
      'de outra safra',
      { ...CUPOM_VALIDO, safra_id: '00000000-0000-0000-0000-000000000000' },
      'não vale para esta turma',
    ],
  ])('%s → 400 com mensagem própria, e NADA é gravado', async (_c, registro, trecho) => {
    dubles.buscarCupom.mockResolvedValue(registro)

    const { res, body } = await post({ cupom: 'PARCERIA' })

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.message).toContain(trecho)
    expect(dubles.criarInscricao).not.toHaveBeenCalled()
    expect(dubles.criarSessaoDeCheckout).not.toHaveBeenCalled()
  })

  // ⚠️ O espelho é TENTADO antes de a falta dele virar recusa. O cupom
  // nasce no nosso banco e o `coupon` do Stripe é consequência (D-07) —
  // recusar de cara faria a Giovanna criar um cupom no painel, ele parecer
  // pronto, e a primeira aluna a usá-lo ouvir que não dá.
  it('sem espelho → espelha no Stripe e segue, em vez de recusar', async () => {
    dubles.buscarCupom.mockResolvedValue({ ...CUPOM_VALIDO, stripe_coupon_id: null })

    const { body } = await post({ cupom: 'PARCERIA' })

    expect(dubles.cupomNoStripe).toHaveBeenCalledTimes(1)
    expect(dubles.salvarStripeCouponId).toHaveBeenCalledWith(
      CUPOM_VALIDO.id,
      CUPOM_VALIDO.stripe_coupon_id,
    )
    expect(body.modo).toBe('checkout')
  })

  it('falha ao gravar o espelho não derruba o checkout', async () => {
    dubles.buscarCupom.mockResolvedValue({ ...CUPOM_VALIDO, stripe_coupon_id: null })
    dubles.salvarStripeCouponId.mockRejectedValue(new Error('banco fora do ar'))

    const { body } = await post({ cupom: 'PARCERIA' })
    expect(body.modo).toBe('checkout')
  })

  // ⚠️ FALHA DE INFRA NÃO VIRA "SEGUE SEM DESCONTO". A pessoa digitou um
  // cupom; abrir o checkout pelo valor cheio cobraria mais do que ela
  // aceitou pagar, e ela só descobriria no extrato.
  it('banco fora do ar na validação → 500, e nada é gravado', async () => {
    dubles.buscarCupom.mockRejectedValue(new Error('banco fora do ar'))

    const { res } = await post({ cupom: 'PARCERIA' })

    expect(res.status).toBe(500)
    expect(dubles.criarInscricao).not.toHaveBeenCalled()
  })

  // Sem safra aberta não há o que descontar. Recusar a inscrição por causa
  // de um cupom que não seria usado trocaria um cadastro por uma mensagem
  // de erro.
  it('sem safra aberta → o cupom é ignorado em silêncio, e a pessoa entra na lista', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(false))
    dubles.buscarCupom.mockResolvedValue(null)

    const { res, body } = await post({ cupom: 'INEXISTENTE' })

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(dubles.buscarCupom).not.toHaveBeenCalled()
    expect(argumentos().safra_id).toBeNull()
  })
})
