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

const dubles = vi.hoisted(() => {
  // A classe precisa nascer aqui dentro: a fábrica do `vi.mock` é içada
  // para o topo do módulo, e a rota faz `err instanceof
  // SupabaseNotConfiguredError` — tem que ser a MESMA classe dos dois
  // lados, ou o `catch` cai no ramo errado e o teste passa a medir outra
  // coisa.
  class SupabaseNotConfiguredError extends Error {}

  return {
    SupabaseNotConfiguredError,
    buscarSafraAtiva: vi.fn(),
    criarInscricao: vi.fn(),
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

vi.mock('@/lib/supabase', () => ({
  SupabaseNotConfiguredError: dubles.SupabaseNotConfiguredError,
  buscarSafraAtiva: dubles.buscarSafraAtiva,
  criarInscricao: dubles.criarInscricao,
}))

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
  // `status` não está (é derivado na `011b`), `consent` não está (a função
  // grava `true` fixo), `grupo_id` não está (D-03), `payment_choice` não
  // existe mais (D-11). Uma chave a mais aqui é uma decisão de negócio
  // atravessando por engano.
  it('manda exatamente dez campos — nem `status`, nem `consent`, nem `grupo_id`', async () => {
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

  it('safra aberta → os e-mails recebem a safra que foi gravada', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(safra(true))
    await post()
    await rodarTarefas()

    expect(dubles.notificarAdmin.mock.calls[0][1]?.id).toBe(SAFRA_ID)
    expect(dubles.confirmarInscricao.mock.calls[0][1]?.id).toBe(SAFRA_ID)
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
