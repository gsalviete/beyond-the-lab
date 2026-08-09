// ============================================================
// O E-MAIL DE CONVITE (`c55`) — um mecanismo, dois usos
//
// O MESMO e-mail serve à D-10 (a base atual, convidada a se inscrever) e
// à D-15 (quem ficou presa em `pendente_pagamento`). Só o texto muda.
//
// Três propriedades, e as três são de consequência:
//
//   1. O LINK APARECE — e aparece DUAS vezes, como botão e como URL por
//      extenso. Cliente de e-mail que bloqueia HTML mostra só a segunda,
//      e é ela que a pessoa copia. Um convite que só funciona com imagens
//      habilitadas não chega para parte da lista.
//   2. NENHUM DOS DOIS PROMETE VAGA, PREÇO OU DESCONTO. Vaga é limite
//      mole (D-08), quem entra é quem paga (D-02), e o valor de quem já
//      abriu checkout é o travado na inscrição (D-06) — repeti-lo aqui
//      abriria a chance de os dois divergirem.
//   3. NUNCA LANÇA. Contrato do topo de `src/lib/email.ts`: e-mail que
//      falha não pode derrubar nada.
//
// ⚠️ As env vars são lidas na CARGA DO MÓDULO, então elas precisam existir
// ANTES do import — e o import precisa ser dinâmico por causa disso. Sem
// elas, `enviar` aborta antes de montar qualquer coisa e o arquivo
// passaria a testar o erro de configuração. É a forma exata do controle
// negativo que falhou no `c07`, onde as duas versões comparadas abortavam
// antes de montar e o diferencial deu "0 divergências" comparando vazio
// com vazio.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

process.env.RESEND_API_KEY = 're_teste_que_nao_existe'
process.env.EMAIL_REMETENTE = 'contato@exemplo.invalid'
process.env.EMAIL_ADMIN = 'giovanna@exemplo.invalid'

const { convidarParaInscricao } = await import('@/lib/email')

const CONVITE = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  link: 'https://beyondthelab.com.br/?convite=kkZ0m3xQe9dR4tYuIoPaSdFgHjKlZxCvBnM1234567',
}

const SAFRA = { nome: 'Setembro 2026', data_inicio_aulas: '2026-09-01' }

/** O corpo que teria ido para o Resend. */
function enviado() {
  const chamada = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
  return JSON.parse(String((chamada[1] as RequestInit).body))
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'x' }), { status: 200 }),
  )
})

// ============================================================
// 0. CONTROLE DO MÉTODO — sem isto, "não contém X" passa medindo o vácuo
// ============================================================
describe('o e-mail é de fato montado e enviado', () => {
  it('chama o Resend, com o endereço de quem foi convidada', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'convite')

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    // O Resend recebe `to` como ARRAY — é o formato da API, e é o que
    // `enviar` monta. Afirmar a string crua aqui passaria a testar uma
    // suposição sobre o corpo em vez do corpo.
    expect(enviado().to).toEqual([CONVITE.email])
    expect(enviado().html.length).toBeGreaterThan(500)
  })
})

describe('o link', () => {
  it('aparece como botão E como URL por extenso', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'convite')

    const ocorrencias = enviado().html.split(CONVITE.link).length - 1
    expect(ocorrencias).toBe(2)
  })

  it('está também na versão em texto puro', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'convite')
    expect(enviado().text).toContain(CONVITE.link)
  })
})

describe('os dois motivos falam coisas diferentes', () => {
  it('`convite` fala em inscrição aberta', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'convite')

    expect(enviado().subject).toContain('inscrições abriram')
    expect(enviado().text).toContain('chegou a sua vez')
  })

  it('`pendente` fala em pagamento que faltou', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'pendente')

    expect(enviado().subject).toContain('esperando o pagamento')
    expect(enviado().text).toContain('faltou só o pagamento')
    // A frase que fecha o beco sem saída da D-15: ela não precisa
    // preencher o formulário de novo.
    expect(enviado().text).toContain('sem preencher nada de novo')
  })
})

// ============================================================
// 1. O QUE O CONVITE NÃO PODE DIZER
// ============================================================
describe('nenhuma promessa que o produto não faz', () => {
  it.each(['convite', 'pendente'] as const)(
    '%s: não promete vaga garantida nem reservada',
    async (motivo) => {
      await convidarParaInscricao(CONVITE, SAFRA, motivo)

      expect(enviado().text.toLowerCase()).not.toContain('vaga garantida')
      expect(enviado().text.toLowerCase()).not.toContain('vaga reservada')
      expect(enviado().text.toLowerCase()).not.toContain('vaga está garantida')
    },
  )

  // ⚠️ Nenhum valor em reais. Quem mostra o preço é o checkout, que lê o
  // contrato travado da própria inscrição (D-06). Um número aqui viraria
  // uma segunda fonte, e ela divergiria na primeira edição da safra.
  it.each(['convite', 'pendente'] as const)('%s: não imprime valor', async (motivo) => {
    await convidarParaInscricao(CONVITE, SAFRA, motivo)

    expect(enviado().text).not.toMatch(/R\$\s*\d/)
    expect(enviado().html).not.toMatch(/R\$\s*\d/)
  })

  // ⚠️ D-14: a data de início NUNCA sai seca. Nem `dd/mm/yyyy`, nem
  // `2026-09-01`, nem por extenso — é "na primeira semana de setembro",
  // derivada de `data_inicio_aulas`.
  it('a data de início sai por semana, nunca seca', async () => {
    await convidarParaInscricao(CONVITE, SAFRA, 'convite')

    expect(enviado().text).toContain('na primeira semana de setembro')
    expect(enviado().text).not.toContain('2026-09-01')
    expect(enviado().text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  // Sem safra, o e-mail não fala em data. Nenhuma. Sem fallback, sem data
  // inventada, sem `undefined` impresso — a mesma regra da landing.
  it('sem safra, nenhuma data é afirmada', async () => {
    await convidarParaInscricao(CONVITE, null, 'pendente')

    expect(enviado().text).not.toContain('As aulas começam')
    expect(enviado().text).not.toContain('undefined')
  })
})

// ============================================================
// 2. O CONTRATO DO ARQUIVO: NUNCA LANÇA
// ============================================================
describe('falha não sobe', () => {
  it('Resend fora do ar resolve mesmo assim', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede fora'))
    await expect(convidarParaInscricao(CONVITE, SAFRA, 'convite')).resolves.toBeUndefined()
  })

  it('resposta de erro do Resend também não lança', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 422 }))
    await expect(convidarParaInscricao(CONVITE, SAFRA, 'convite')).resolves.toBeUndefined()
  })
})
