// ============================================================
// `GET /api/pessoa/:token` — o convite identifica, e NÃO autoriza
//
// Três propriedades, e as três são de consequência:
//
//   1. TOKEN VÁLIDO devolve CONTATO — e o PERFIL só quando existe
//      inscrição pendente na safra ABERTA (D-15). Nem id de pessoa, nem id
//      de inscrição, nem a validade do próprio token.
//   2. TODO O RESTO CAI NO FLUXO LIMPO — vencido, inexistente, banco fora
//      do ar. Mesmo envelope, `pessoa: null`, sempre 200. Nunca uma tela
//      de erro para quem clicou num convite antigo.
//   3. A ROTA NÃO ESCREVE NADA. Ela não abre sessão, não muda status e
//      não cria checkout. É um GET, e GET é disparado por prefetch de
//      navegador, por antivírus corporativo e por preview de cliente de
//      e-mail — efeito colateral aqui seria efeito de ninguém ter
//      clicado em nada.
//
// ⚠️ `tokenVenceu` é a função de VERDADE neste arquivo. Ela é pura e
// recebe `agora` por parâmetro, o que é o que torna o teste de expiração
// possível — uma função que lê o relógio por dentro só poderia ser testada
// esperando o tempo passar.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => {
  class SupabaseNotConfiguredError extends Error {}
  return {
    SupabaseNotConfiguredError,
    buscarPessoaPorToken: vi.fn(),
    buscarSafraAtiva: vi.fn(),
    buscarPerfilPendente: vi.fn(),
  }
})

// Só a LEITURA é dublê. `tokenVenceu` vem de verdade: é ela que decide se
// o convite ainda vale, e substituí-la faria este arquivo provar que a
// rota chama uma função em vez de provar que um convite vencido não
// pré-preenche nada.
vi.mock('@/lib/supabase', async (original) => {
  const real = await original<typeof import('@/lib/supabase')>()
  return {
    tokenVenceu: real.tokenVenceu,
    SupabaseNotConfiguredError: dubles.SupabaseNotConfiguredError,
    buscarPessoaPorToken: dubles.buscarPessoaPorToken,
    buscarSafraAtiva: dubles.buscarSafraAtiva,
    buscarPerfilPendente: dubles.buscarPerfilPendente,
  }
})

const { GET } = await import('../app/api/pessoa/[token]/route')
const { tokenVenceu } = await import('@/lib/supabase')

const TOKEN = 'kkZ0m3xQe9dR4tYuIoPaSdFgHjKlZxCvBnM1234567'

const PESSOA = {
  // ⚠️ O `id` existe no objeto do banco e NÃO pode atravessar para a
  // resposta — ver o bloco de `PessoaDoToken`.
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  telefone: '+5521987654321',
  // Muito no futuro: os testes que não são sobre expiração não podem
  // depender da data em que a suíte roda.
  token_expira_em: '2099-01-01T00:00:00.000Z',
}

async function get(token = TOKEN) {
  const res = await GET(new Request(`https://exemplo.invalid/api/pessoa/${token}`), {
    params: Promise.resolve({ token }),
  })
  return { res, body: await res.json() }
}

const SAFRA_ABERTA = { id: '11111111-2222-4333-8444-555555555555', inscricoes_abertas: true }

const PERFIL = {
  nivel_ingles: 'basico',
  curso: 'Fonoaudiologia',
  periodo: '6º semestre',
  disponibilidade: ['seg', 'qua'],
}

beforeEach(() => {
  vi.clearAllMocks()
  dubles.buscarPessoaPorToken.mockResolvedValue(PESSOA)
  // O caso normal do convite da D-10: safra aberta, mas nenhuma inscrição
  // pendente — quem vem da lista de espera nunca preencheu perfil para
  // esta turma.
  dubles.buscarSafraAtiva.mockResolvedValue(SAFRA_ABERTA)
  dubles.buscarPerfilPendente.mockResolvedValue(null)
})

// ============================================================
// 0. CONTROLE DO MÉTODO
//
// Tudo abaixo afirma que alguma coisa NÃO volta. Se a rota nunca
// devolvesse nada, todos passariam medindo o vácuo.
// ============================================================
describe('o convite válido pré-preenche', () => {
  it('devolve nome, e-mail e telefone', async () => {
    const { res, body } = await get()

    expect(res.status).toBe(200)
    // A forma INTEIRA da resposta, e não um `toMatchObject`: um campo a
    // mais aqui é dado pessoal atravessando sem ninguém decidir.
    expect(body.pessoa).toEqual({
      nome: PESSOA.nome,
      email: PESSOA.email,
      telefone: PESSOA.telefone,
      perfil: null,
    })
  })

  it('procura pelo token que veio na URL', async () => {
    await get()
    expect(dubles.buscarPessoaPorToken).toHaveBeenCalledWith(TOKEN)
  })
})

// ============================================================
// 1. O CORTE DE FRONTEIRA — o que NÃO atravessa
// ============================================================
describe('o que a resposta não carrega', () => {
  // ⚠️ `token_expira_em` veio do banco para a decisão de validade e para
  // mais nada. Um spread do objeto inteiro devolveria a validade do
  // convite ao navegador sem ninguém decidir isso.
  it('a validade do token não volta', async () => {
    const { body } = await get()
    expect(body.pessoa.token_expira_em).toBeUndefined()
  })

  // ⚠️ SEM PENDÊNCIA NA SAFRA ABERTA, O PERFIL NÃO VOLTA. Ele descreve a
  // pessoa NAQUELA safra (`008`) — quem estava no 3º período em janeiro
  // está no 5º em julho. Devolvê-lo a partir de uma inscrição antiga
  // apresentaria uma resposta desatualizada JÁ MARCADA, que é a forma mais
  // eficiente de gravar dado errado: a pessoa confirma sem ler.
  it('perfil vem `null` para quem vem da lista de espera', async () => {
    const { body } = await get()
    expect(body.pessoa.perfil).toBeNull()
  })

  // ⚠️ E o `id` da pessoa NUNCA atravessa, mesmo agora que ele é lido do
  // banco para procurar a inscrição pendente. O corte é na montagem da
  // resposta.
  it('o id da pessoa não volta', async () => {
    const { body } = await get()
    expect(body.pessoa.id).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain(PESSOA.id)
  })

  // Nada que destranque pagamento atravessa. O caminho de pagamento
  // continua sendo o POST de `/api/inscricao`, que decide tudo relendo o
  // banco (D-15: nenhum id de banco como parâmetro que destranque
  // pagamento).
  it.each(['inscricao_id', 'id', 'safra_id', 'status'])(
    '`%s` não volta — o convite não autoriza nada',
    async (campo) => {
      const { body } = await get()
      expect(Object.keys(body.pessoa)).not.toContain(campo)
    },
  )
})

// ============================================================
// 2. TUDO QUE NÃO É UM CONVITE VÁLIDO CAI NO FLUXO LIMPO
//
// ⚠️ SEMPRE 200, E SEMPRE O MESMO ENVELOPE. Duas razões: "expirado cai no
// fluxo limpo" (o formulário do zero é uma tela boa, não uma degradação
// que mereça 404), e um 404 distinguiria "este token não existe" de "este
// token existe e venceu" — o que é um oráculo.
// ============================================================
describe('o fluxo limpo é o fallback de tudo', () => {
  it('token vencido → `pessoa: null`, e 200', async () => {
    dubles.buscarPessoaPorToken.mockResolvedValue({
      ...PESSOA,
      token_expira_em: '2020-01-01T00:00:00.000Z',
    })

    const { res, body } = await get()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.pessoa).toBeNull()
  })

  it('token inexistente → `pessoa: null`, e 200', async () => {
    dubles.buscarPessoaPorToken.mockResolvedValue(null)

    const { res, body } = await get()

    expect(res.status).toBe(200)
    expect(body.pessoa).toBeNull()
  })

  // ⚠️ FALHA DE INFRA TAMBÉM, e não tela de erro (REPORT §9.3). O pior
  // desfecho aqui é a pessoa digitar o próprio nome — o que ela faria de
  // qualquer forma sem o convite. Um 500 transformaria um banco lento numa
  // inscrição perdida.
  it('banco fora do ar → `pessoa: null`, e 200', async () => {
    dubles.buscarPessoaPorToken.mockRejectedValue(new Error('banco fora do ar'))

    const { res, body } = await get()

    expect(res.status).toBe(200)
    expect(body.pessoa).toBeNull()
  })

  it('token absurdamente longo nem chega ao banco', async () => {
    const { res, body } = await get('x'.repeat(500))

    expect(res.status).toBe(200)
    expect(body.pessoa).toBeNull()
    expect(dubles.buscarPessoaPorToken).not.toHaveBeenCalled()
  })

  // ⚠️ A resposta é indistinguível nos quatro casos acima. Se um dia
  // alguém acrescentar um campo `motivo` "para ajudar no debug", este
  // teste fica vermelho — e é para isso que ele existe.
  it('os quatro casos respondem exatamente a mesma coisa', async () => {
    const respostas: unknown[] = []

    dubles.buscarPessoaPorToken.mockResolvedValue(null)
    respostas.push((await get()).body)

    dubles.buscarPessoaPorToken.mockResolvedValue({ ...PESSOA, token_expira_em: '2020-01-01T00:00:00.000Z' })
    respostas.push((await get()).body)

    dubles.buscarPessoaPorToken.mockRejectedValue(new Error('x'))
    respostas.push((await get()).body)

    respostas.push((await get('x'.repeat(500))).body)

    for (const r of respostas) expect(r).toEqual({ ok: true, pessoa: null })
  })
})

// ============================================================
// 3. `tokenVenceu` — a regra, sem rede e sem banco
// ============================================================
describe('quando um token venceu', () => {
  const AGORA = new Date('2026-08-09T12:00:00.000Z')

  it('validade no futuro → não venceu', () => {
    expect(tokenVenceu({ ...PESSOA, token_expira_em: '2026-08-10T12:00:00.000Z' }, AGORA)).toBe(
      false,
    )
  })

  it('validade no passado → venceu', () => {
    expect(tokenVenceu({ ...PESSOA, token_expira_em: '2026-08-08T12:00:00.000Z' }, AGORA)).toBe(true)
  })

  // ⚠️ NULO CONTA COMO VENCIDO. O CHECK `pessoas_token_tudo_ou_nada_check`
  // da `017` torna esse par impossível de escrever — token sem validade é
  // o link eterno que a D-10 proíbe —, então chegar aqui com nulo
  // significa que alguém contornou o CHECK. Tratar como válido concederia
  // acesso perpétuo justamente no caso em que o mecanismo falhou.
  it('sem validade → venceu, e é a leitura conservadora', () => {
    expect(tokenVenceu({ ...PESSOA, token_expira_em: null }, AGORA)).toBe(true)
  })

  // O instante exato: `<=` e não `<`. Um token que vence às 12h não vale
  // às 12h.
  it('no instante exato da expiração, já venceu', () => {
    expect(tokenVenceu({ ...PESSOA, token_expira_em: AGORA.toISOString() }, AGORA)).toBe(true)
  })
})

// ============================================================
// 4. O PERFIL — só com pendência NA SAFRA ABERTA (D-15)
//
// ⚠️ AS DUAS CONDIÇÕES SÃO NECESSÁRIAS. "Tem inscrição pendente" não
// basta: a pendência pode ser de uma safra que já passou, e aí o perfil é
// velho. "A safra está aberta" também não basta sozinho — sem pendência,
// quem vem pelo convite é da lista de espera e nunca preencheu perfil
// para esta turma.
//
// Quem está em `pendente_pagamento` na safra aberta preencheu isso DIAS
// ATRÁS, para esta turma. Fazê-la digitar de novo é o atrito que a D-15
// existe para tirar: "sem a pessoa preencher nada de novo".
// ============================================================
describe('o perfil de quem tem pagamento pendente', () => {
  it('volta inteiro quando há pendência na safra aberta', async () => {
    dubles.buscarPerfilPendente.mockResolvedValue(PERFIL)

    const { body } = await get()

    expect(body.pessoa.perfil).toEqual(PERFIL)
    expect(dubles.buscarPerfilPendente).toHaveBeenCalledWith(PESSOA.id, SAFRA_ABERTA.id)
  })

  // ⚠️ Safra FECHADA não pré-preenche perfil: não há inscrição nova a
  // fazer, e o formulário que ela veria é o de lista de espera.
  it('safra fechada → perfil `null`, e o banco nem é consultado', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue({ ...SAFRA_ABERTA, inscricoes_abertas: false })

    const { body } = await get()

    expect(body.pessoa.perfil).toBeNull()
    expect(dubles.buscarPerfilPendente).not.toHaveBeenCalled()
  })

  it('sem safra nenhuma → perfil `null`', async () => {
    dubles.buscarSafraAtiva.mockResolvedValue(null)

    const { body } = await get()

    expect(body.pessoa.perfil).toBeNull()
    expect(dubles.buscarPerfilPendente).not.toHaveBeenCalled()
  })

  // ⚠️ FALHA NO PERFIL NÃO DERRUBA O CONTATO. O perfil é conforto; o
  // contato é o que a D-10 promete. Um `catch` que devolvesse
  // `pessoa: null` trocaria o essencial pelo acessório.
  it('erro ao buscar o perfil não tira o pré-preenchimento do contato', async () => {
    dubles.buscarPerfilPendente.mockRejectedValue(new Error('banco fora do ar'))

    const { res, body } = await get()

    expect(res.status).toBe(200)
    expect(body.pessoa.nome).toBe(PESSOA.nome)
    expect(body.pessoa.perfil).toBeNull()
  })
})
