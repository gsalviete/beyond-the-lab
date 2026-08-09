// ============================================================
// `criarInscricao` — a chamada da RPC, nome por nome
//
// ⚠️ `.rpc()` CASA PARÂMETRO POR NOME, e é isso que torna este arquivo o
// de maior valor por linha do `c26`.
//
// Os treze nomes são a assinatura da função NO BANCO, não uma convenção
// nossa. Errar um deles não é erro de tipo — os tipos gerados descrevem a
// função que existia no dia em que alguém rodou `supabase gen types` — é
// erro de RUNTIME: o PostgREST responde "function not found" porque a
// assinatura não bate, e isso só aparece quando alguém real se inscreve.
//
// Por isso a comparação aqui não é com uma lista escrita à mão neste
// arquivo, que seria a segunda cópia da assinatura. É com o PRÓPRIO
// `.sql` da migração `016` — o texto que roda no SQL Editor e cria a
// função.
//
// ============================================================
// ⚠️ AQUI O CONJUNTO DE NOMES FAZ MAIS DO QUE CASAR: ELE ESCOLHE A FUNÇÃO
// ============================================================
//
// Existem DUAS `criar_inscricao` no banco enquanto a `018` não roda: a de
// dez argumentos da `011b`, que o build em produção chama entre a migração
// e o deploy, e a de treze da `016`. O PostgREST resolve sobrecarga pelo
// CONJUNTO DE CHAVES do corpo JSON.
//
// A consequência é que um `undefined` a mais neste objeto não é um
// parâmetro faltando — é OUTRA FUNÇÃO SENDO CHAMADA, a que devolve um
// booleano onde `criarInscricao` espera uma linha. Este arquivo é o que
// impede isso de acontecer sem ninguém perceber, e é por isso que ele
// afirma os treze nomes como CONJUNTO e não um a um.
//
// ============================================================
// ⚠️ O LIMITE, E ELE É O MESMO DO BLOCO 5 DO `dominio.test.ts`
// ============================================================
//
// Isto compara o call site com a MIGRAÇÃO VERSIONADA. Não abre conexão,
// não consulta `pg_proc`, e não sabe nada sobre a função que está em
// produção. Um verde aqui significa:
//
//   ✓ a chamada concorda com a migração do repositório
//   ✗ o banco em produção concorda com qualquer um dos dois
//
// A distância entre as duas é o incidente da `004`. Quem verifica a
// segunda linha é gente, na mão, com o `CHECKLIST-LANCAMENTO.md`.
// ============================================================
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ⚠️ Import de TIPO, e é por isso que ele pode existir aqui em cima
// enquanto o de `@/lib/supabase` precisa ser dinâmico lá embaixo: `import
// type` é apagado na compilação e não carrega módulo nenhum em runtime.
// `@/config/dominio` é neutro (não toca `server-only` nem env var), mas o
// que garante que este import não interfere na ordem de carga do arquivo
// é a palavra `type`, não a neutralidade do módulo.
import type { DiaDaSemana } from '@/config/dominio'

// `@/lib/supabase` é `server-only`, e o pacote `server-only` LANÇA quando
// importado fora de um Server Component — em Node puro, sempre. O dublê
// vazio é o que permite testar o módulo sem afrouxar a proteção: o
// `import 'server-only'` continua no topo do arquivo de produção, que é
// onde ele protege alguma coisa (REPORT §9.5).
vi.mock('server-only', () => ({}))

const dubles = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

// O SDK inteiro substituído. É o único lugar do projeto que o importa, e
// aqui o que interessa é exatamente o que atravessa para ele.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: dubles.rpc, from: dubles.from }),
}))

// ⚠️ As env vars são lidas na CARGA DO MÓDULO (`const SUPABASE_URL =
// process.env...`), então elas precisam existir ANTES do import — e o
// import precisa ser dinâmico por causa disso. Sem elas, `supabase()`
// levanta `SupabaseNotConfiguredError` e a chamada nunca chega ao dublê:
// o arquivo inteiro passaria a testar o erro de configuração.
//
// É a forma exata do controle negativo que falhou no `c07`, onde as env
// vars do Resend eram lidas na carga e as duas versões abortavam antes de
// montar qualquer coisa — comparando vazio com vazio.
process.env.SUPABASE_URL = 'https://exemplo.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste-que-nao-existe'

const { criarInscricao } = await import('@/lib/supabase')

// ------------------------------------------------------------
// A ASSINATURA, LIDA DA MIGRAÇÃO
//
// ⚠️ Só o bloco do `create or replace function`. O fim da `016` tem
// TESTES DE BARREIRA comentados — chamadas de exemplo com argumentos
// nomeados — e um varredor ingênuo os leria como se fossem a assinatura.
// É a mesma armadilha que fez o bloco 5 do `dominio.test.ts` reprovar
// procurando `'sab'` num contraexemplo comentado.
// ------------------------------------------------------------
const MIGRACAO = 'supabase/migrations/016_rpc_criar_inscricao_travados.sql'
const sql = readFileSync(MIGRACAO, 'utf8')

const ABRE = 'create or replace function public.criar_inscricao('
const inicio = sql.indexOf(ABRE)
const fim = sql.indexOf('returns table (', inicio)
const listaDeParametros = sql
  .slice(inicio + ABRE.length, fim)
  .replace(/--[^\n]*/g, '')
  .replace(/\)\s*$/, '')

/** `['p_nome text', 'p_email text', …]` — declaração inteira de cada um. */
const declaracoes = listaDeParametros
  .split(',')
  .map((s) => s.trim().replace(/\s+/g, ' '))
  .filter(Boolean)

/** Só os nomes, na ordem em que a função os declara. */
const NOMES_NO_SQL = declaracoes.map((d) => d.split(' ')[0])

// ------------------------------------------------------------
// Um conjunto de dados completo. A rota é quem monta isto de verdade —
// ver `inscricao-rota.test.ts`.
// ------------------------------------------------------------
const SAFRA_ID = '11111111-2222-3333-4444-555555555555'
const INSCRICAO_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const DADOS = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  telefone: '+5521987654321',
  nivel_ingles: 'basico' as const,
  curso: 'Fonoaudiologia',
  periodo: '6º semestre',
  // ⚠️ `as DiaDaSemana[]` e NÃO `as const`, e a diferença derrubava o
  // build. `as const` congela o literal como `readonly ['seg', 'qua']`, e
  // `readonly` não é atribuível ao `DiaDaSemana[]` mutável que
  // `criarInscricao` declara — 12 erros de `tsc`, um por chamada. O
  // vitest não typechecka, então os testes ficavam verdes enquanto o
  // `next build` (que roda `tsc` sobre o `include`, e o `include` pega
  // `tests/`) falhava. Verde no runner não é prova de que compila.
  //
  // O cast preserva o que o `as const` dava de útil aqui: os elementos
  // continuam sendo do domínio, então trocar 'qua' por 'sáb' segue sendo
  // erro de tipo. O que ele solta é só a imutabilidade, que nunca foi o
  // ponto — este objeto não é mutado por ninguém.
  disponibilidade: ['seg', 'qua'] as DiaDaSemana[],
  consent_at: '2026-08-06T12:00:00.000Z',
  consent_text: 'Texto do consentimento, gravado como prova.',
  safra_id: null,
  // Lista de espera: sem safra, sem contrato. Os dois andam colados — o
  // `inscricoes_espera_sem_travado_check` da `015` recusa contrato numa
  // linha sem safra, porque seria um preço acordado numa safra que não
  // existe.
  travados: null,
}

/** O contrato de uma inscrição em safra aberta (D-06). */
const CONTRATO = {
  valorMensal: 299.99,
  duracaoMeses: 6,
  dataPrimeiraCobranca: '2026-09-01',
}

/** O nome da função e o objeto de argumentos da última chamada. */
const chamada = () => ({
  funcao: dubles.rpc.mock.calls[0][0] as string,
  args: dubles.rpc.mock.calls[0][1] as Record<string, unknown>,
})

beforeEach(() => {
  vi.clearAllMocks()
  // A forma que a `016` devolve: UMA linha, sempre — inclusive na
  // duplicata. `returns table` chega pelo PostgREST como array.
  dubles.rpc.mockResolvedValue({
    data: [
      {
        inscricao_id: INSCRICAO_ID,
        criada: true,
        valor_mensal_travado: null,
        duracao_meses_travada: null,
        data_primeira_cobranca_travada: null,
      },
    ],
    error: null,
    status: 200,
  })
})

// ============================================================
// 0. CONTROLE DO MÉTODO
//
// Tudo abaixo compara duas listas. Se a leitura do `.sql` falhar, as duas
// ficam vazias e comparar vazio com vazio dá verde — que é literalmente o
// defeito que o `c07` produziu e o `c19` quase repetiu.
// ============================================================
describe('a leitura da migração não é vácuo', () => {
  it('o bloco da assinatura foi encontrado', () => {
    expect(inicio).toBeGreaterThan(-1)
    expect(fim).toBeGreaterThan(inicio)
    expect(listaDeParametros.length).toBeGreaterThan(100)
  })

  it('saíram treze parâmetros, todos com o prefixo `p_`', () => {
    expect(NOMES_NO_SQL).toHaveLength(13)
    for (const n of NOMES_NO_SQL) expect(n).toMatch(/^p_[a-z_]+$/)
  })

  it('cada declaração tem nome E tipo — não sobrou lixo do split', () => {
    for (const d of declaracoes) {
      expect(d, `declaração incompleta: "${d}"`).toMatch(/^p_[a-z_]+ [a-z]/)
    }
  })
})

// ============================================================
// 1. OS DEZ NOMES
// ============================================================
describe('a chamada casa com a assinatura da `011b`', () => {
  it('chama a função pelo nome que a migração cria', async () => {
    await criarInscricao(DADOS)
    expect(chamada().funcao).toBe('criar_inscricao')
    expect(sql).toContain('public.criar_inscricao(')
  })

  it('manda exatamente os treze nomes do SQL — nem um a mais, nem um a menos', async () => {
    await criarInscricao(DADOS)
    expect(Object.keys(chamada().args).sort()).toEqual([...NOMES_NO_SQL].sort())
  })

  // O anterior já barra estes por igualdade de conjunto. Este os nomeia
  // para que a falha diga QUAL apareceu — e cada um tem uma razão
  // diferente para não existir:
  //
  //   p_status         — DERIVADO de p_safra_id dentro da função. Um par
  //                      incoerente é recusado pelo CHECK da `009` de
  //                      qualquer forma, então recebê-lo só criaria uma
  //                      forma de a chamada estar errada.
  //   p_consent        — a função grava `true` fixo. Um parâmetro capaz
  //                      de pedir `false` sugeriria que existe a opção
  //                      "recusou e entrou assim mesmo".
  //   p_grupo_id       — alocação é ato da Giovana no painel (D-03).
  //   p_payment_choice — morreu (D-11).
  it.each(['p_status', 'p_consent', 'p_grupo_id', 'p_payment_choice'])(
    '`%s` não é parâmetro, e a ausência é decisão',
    async (nome) => {
      await criarInscricao(DADOS)
      expect(NOMES_NO_SQL).not.toContain(nome)
      expect(Object.keys(chamada().args)).not.toContain(nome)
    },
  )

  it('cada valor vai no parâmetro do próprio nome', async () => {
    await criarInscricao({ ...DADOS, safra_id: SAFRA_ID, travados: CONTRATO })
    const { args } = chamada()

    expect(args.p_valor_mensal_travado).toBe(CONTRATO.valorMensal)
    expect(args.p_duracao_meses_travada).toBe(CONTRATO.duracaoMeses)
    expect(args.p_data_primeira_cobranca_travada).toBe(CONTRATO.dataPrimeiraCobranca)

    expect(args.p_nome).toBe(DADOS.nome)
    expect(args.p_email).toBe(DADOS.email)
    expect(args.p_telefone).toBe(DADOS.telefone)
    expect(args.p_nivel_ingles).toBe(DADOS.nivel_ingles)
    expect(args.p_curso).toBe(DADOS.curso)
    expect(args.p_periodo).toBe(DADOS.periodo)
    expect(args.p_disponibilidade).toEqual([...DADOS.disponibilidade])
    expect(args.p_consent_at).toBe(DADOS.consent_at)
    expect(args.p_consent_text).toBe(DADOS.consent_text)
    expect(args.p_safra_id).toBe(SAFRA_ID)
  })

  // O par nome/valor não basta: `p_nome` recebendo o e-mail passaria em
  // "manda os dez nomes". Este confere que nenhum valor foi para o
  // vizinho — o erro que o TypeScript não pega porque os dois são `text`.
  it('nenhum valor foi parar no parâmetro vizinho', async () => {
    await criarInscricao(DADOS)
    const { args } = chamada()
    expect(args.p_nome).not.toBe(DADOS.email)
    expect(args.p_email).not.toBe(DADOS.telefone)
    expect(args.p_curso).not.toBe(DADOS.periodo)
    expect(args.p_consent_text).not.toBe(DADOS.consent_at)
  })
})

// ============================================================
// 2. `p_safra_id` É OMITIDO — não enviado como `null`
//
// ⚠️ Este é o teste que pega alguém trocando o `default null` da `011b`
// por um uuid real, e o estrago desse dia seria silencioso: toda chamada
// que omite o argumento — ou seja, TODA A LISTA DE ESPERA — passaria a
// gravar inscrição naquela safra, e nada reclamaria. O `status` é
// derivado do próprio parâmetro dentro da função, então o par
// (safra_id, status) sairia coerente e o CHECK da `009` aprovaria. A
// diferença entre lista de espera e inscrição paga ficaria decidida por
// um valor invisível no call site.
//
// A omissão acontece em DOIS lugares e os dois importam:
//
//   1. `?? undefined` no objeto — os tipos gerados trazem `p_safra_id?:
//      string`, OPCIONAL e não anulável. `supabase gen types` não
//      expressa nulidade de ARGUMENTO de função, só de coluna.
//   2. `JSON.stringify` descartando a chave `undefined` — é assim que a
//      ausência de fato viaja até o PostgREST, que então aplica o
//      DEFAULT do parâmetro.
// ============================================================
describe('a lista de espera OMITE o argumento', () => {
  it('`safra_id: null` vira `p_safra_id: undefined`, não `null`', async () => {
    await criarInscricao({ ...DADOS, safra_id: null })
    const { args } = chamada()

    expect(args.p_safra_id).toBeUndefined()
    expect(args.p_safra_id).not.toBeNull()
  })

  // O que de fato atravessa. Um `null` explícito seria enviado como
  // `{"p_safra_id":null}` e o PostgREST NÃO aplicaria o default.
  it('a chave não sobrevive à serialização — é ausência no corpo', async () => {
    await criarInscricao({ ...DADOS, safra_id: null })
    expect(JSON.stringify(chamada().args)).not.toContain('p_safra_id')
  })

  it('com safra, a chave viaja com o uuid', async () => {
    await criarInscricao({ ...DADOS, safra_id: SAFRA_ID })
    expect(JSON.stringify(chamada().args)).toContain(SAFRA_ID)
  })

  // ⚠️ A OUTRA METADE: a omissão só é segura porque o default é `null`.
  // Esta asserção é sobre o `.sql`, e é a rede descrita no topo do bloco.
  it('o default de `p_safra_id` na migração é `null`, e tem que continuar sendo', () => {
    const decl = declaracoes.find((d) => d.startsWith('p_safra_id'))
    expect(decl).toBe('p_safra_id uuid default null')
  })

  // O complemento: nenhum outro parâmetro tem default. Se `p_consent_at`
  // ganhasse um, uma chamada que o esquecesse gravaria consentimento
  // incompleto sem que nada no TypeScript reclamasse — e quem recusaria
  // seria o CHECK da `010`, no ato da escrita de gente real.
  it('nenhum outro parâmetro tem default', () => {
    const comDefault = declaracoes.filter((d) => d.includes('default'))
    expect(comDefault).toEqual(['p_safra_id uuid default null'])
  })
})

// ============================================================
// 2b. OS TRÊS TRAVADOS VÃO COMO `null` EXPLÍCITO — nunca omitidos
//
// ⚠️ É O OPOSTO EXATO DO BLOCO ACIMA, e a assimetria é o ponto. Omitir
// `p_safra_id` é como a lista de espera diz "sem safra", porque ele TEM
// `default null` no SQL. Omitir os três travados produziria um corpo com
// exatamente as dez chaves da sobrecarga ANTIGA (`011b`) — e o PostgREST
// resolveria a chamada para ela, que devolve um booleano onde
// `criarInscricao` espera uma linha. A inscrição seria gravada e a rota
// responderia falha.
//
// É por isso que os três NÃO têm default na `016`, e é isto que este
// bloco tranca dos dois lados: o call site manda os três, e o `.sql` não
// dá default a nenhum.
// ============================================================
describe('os travados viajam como null, e não como ausência', () => {
  it('lista de espera manda os três como `null` explícito', async () => {
    await criarInscricao({ ...DADOS, safra_id: null, travados: null })
    const { args } = chamada()

    expect(args.p_valor_mensal_travado).toBeNull()
    expect(args.p_duracao_meses_travada).toBeNull()
    expect(args.p_data_primeira_cobranca_travada).toBeNull()
  })

  // O que de fato atravessa. Uma chave `undefined` sumiria no
  // `JSON.stringify` e o corpo cairia na sobrecarga de dez.
  it('as três chaves SOBREVIVEM à serialização', async () => {
    await criarInscricao({ ...DADOS, safra_id: null, travados: null })
    const corpo = JSON.stringify(chamada().args)

    expect(corpo).toContain('p_valor_mensal_travado')
    expect(corpo).toContain('p_duracao_meses_travada')
    expect(corpo).toContain('p_data_primeira_cobranca_travada')
  })

  // ⚠️ Contagem de chaves, que é literalmente o que o PostgREST usa para
  // escolher a sobrecarga. Dez seria a função errada.
  it('o corpo de uma lista de espera tem doze chaves, não dez', async () => {
    await criarInscricao({ ...DADOS, safra_id: null, travados: null })
    const chaves = Object.keys(JSON.parse(JSON.stringify(chamada().args)))

    expect(chaves).toHaveLength(12) // 13 menos `p_safra_id`, que é omitido
    expect(chaves).not.toHaveLength(10)
  })

  // A outra metade, e ela é sobre o `.sql`: se alguém der `default null`
  // aos três para "simplificar", a chamada de dez argumentos do build
  // antigo passa a casar com esta função.
  it('nenhum dos três tem default na migração', () => {
    for (const nome of [
      'p_valor_mensal_travado',
      'p_duracao_meses_travada',
      'p_data_primeira_cobranca_travada',
    ]) {
      const decl = declaracoes.find((d) => d.startsWith(nome))
      expect(decl, `${nome} nao encontrado na assinatura`).toBeDefined()
      expect(decl).not.toContain('default')
    }
  })
})

// ============================================================
// 3. O QUE A FUNÇÃO DEVOLVE — e por que `false` não pode virar erro
// ============================================================
describe('a tradução do retorno', () => {
  it('`criada: true` → inscrição criada agora, com o id na mão', async () => {
    expect(await criarInscricao(DADOS)).toEqual({
      ok: true,
      criada: true,
      inscricaoId: INSCRICAO_ID,
      contrato: null,
    })
  })

  // ⚠️ O id é o que permite a Checkout Session existir
  // (`client_reference_id`) — sem ele o webhook não teria como saber qual
  // linha confirmar.
  it('o id da inscrição atravessa', async () => {
    const r = await criarInscricao(DADOS)
    expect(r.ok === true && r.inscricaoId).toBe(INSCRICAO_ID)
  })

  // ⚠️ O contrato que volta é o DA LINHA, e na duplicata ele é o da
  // PRIMEIRA vez (D-06) — pode diferir do que foi enviado. É ele que a
  // sessão de checkout tem que cobrar.
  it('o contrato volta montado a partir das três colunas', async () => {
    dubles.rpc.mockResolvedValue({
      data: [
        {
          inscricao_id: INSCRICAO_ID,
          criada: false,
          valor_mensal_travado: 299.99,
          duracao_meses_travada: 6,
          data_primeira_cobranca_travada: '2026-09-01',
        },
      ],
      error: null,
      status: 200,
    })

    const r = await criarInscricao({ ...DADOS, safra_id: SAFRA_ID, travados: CONTRATO })
    expect(r.ok === true && r.contrato).toEqual(CONTRATO)
  })

  // ⚠️ MEIO CONTRATO NÃO VIRA CONTRATO. É o
  // `inscricoes_travados_tudo_ou_nada_check` da `015` reafirmado na
  // fronteira: valor sem duração produziria um `cancel_at` calculado
  // sobre `undefined`, e o erro só apareceria seis meses depois.
  it('travado incompleto vira `contrato: null`, nunca um objeto pela metade', async () => {
    dubles.rpc.mockResolvedValue({
      data: [
        {
          inscricao_id: INSCRICAO_ID,
          criada: true,
          valor_mensal_travado: 299.99,
          duracao_meses_travada: null,
          data_primeira_cobranca_travada: null,
        },
      ],
      error: null,
      status: 200,
    })

    const r = await criarInscricao(DADOS)
    expect(r.ok === true && r.contrato).toBeNull()
  })

  // O caso raro e real: conflito com transação ainda não commitada. Sem
  // id não há checkout, e a rota responde duplicata — o que não se pode
  // fazer é fingir que o id existe.
  it('`inscricao_id` nulo com `criada: false` é resultado válido', async () => {
    dubles.rpc.mockResolvedValue({
      data: [
        {
          inscricao_id: null,
          criada: false,
          valor_mensal_travado: null,
          duracao_meses_travada: null,
          data_primeira_cobranca_travada: null,
        },
      ],
      error: null,
      status: 200,
    })

    const r = await criarInscricao(DADOS)
    expect(r).toEqual({ ok: true, criada: false, inscricaoId: null, contrato: null })
  })

  // ⚠️ `criada: false` mora DENTRO do ramo `ok: true`. A união anterior
  // tinha `{ ok: false; duplicate: true }` — duplicata como espécie de
  // erro —, herança de o mecanismo ser uma unique violation. Com a RPC,
  // "já existia" é uma resposta que a função dá de propósito, e
  // colapsá-la de novo em erro faria a rota responder 500 para alguém
  // cujo cadastro está perfeitamente gravado.
  it('`criada: false` → duplicata, e ela é SUCESSO', async () => {
    dubles.rpc.mockResolvedValue({
      data: [
        {
          inscricao_id: INSCRICAO_ID,
          criada: false,
          valor_mensal_travado: null,
          duracao_meses_travada: null,
          data_primeira_cobranca_travada: null,
        },
      ],
      error: null,
      status: 200,
    })

    const r = await criarInscricao(DADOS)
    expect(r.ok).toBe(true)
    expect(r.ok === true && r.criada).toBe(false)
    // ⚠️ E ELA VOLTA COM O ID. É o que destrava quem ficou preso em
    // `pendente_pagamento`: a segunda tentativa abre o checkout da
    // inscrição que já existe, em vez de receber "você já está inscrita"
    // e ficar sem saída (D-15).
    expect(r.ok === true && r.inscricaoId).toBe(INSCRICAO_ID)
  })

  it('erro do PostgREST → falha, com o detalhe montado para o log', async () => {
    dubles.rpc.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'check violation', details: 'd', hint: 'h' },
      status: 400,
    })

    const r = await criarInscricao(DADOS)
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ status: 400 })
    expect(r.ok === false && r.detail).toContain('23514')
  })

  // ⚠️ RESPOSTA COM FORMA INESPERADA É FALHA, e não "provavelmente deu
  // certo". A `016` declara `returns table (...)` e devolve sempre
  // exatamente uma linha; outra coisa significa que a resposta não tem a
  // forma que a assinatura promete — schema divergente, função
  // substituída, ou a chamada tendo caído na sobrecarga de dez argumentos
  // da `011b`. É a classe de incidente da `004`.
  //
  // ⚠️ E O `true` SECO ESTÁ NESTA LISTA DE PROPÓSITO: ele é EXATAMENTE o
  // que a função antiga devolve. Se um dia alguém omitir os travados no
  // call site, é este caso que fica vermelho — e a mensagem diz onde
  // olhar.
  //
  // Assumir `criada: true` mandaria e-mail de confirmação por uma
  // inscrição que talvez não exista. Assumir `false` diria "você já está
  // cadastrada" para quem não está. As duas mentem; só o erro não mente.
  it.each([
    ['null', null],
    ['`true` seco — a resposta da sobrecarga de dez', true],
    ['`false` seco', false],
    ['a string "true"', 'true'],
    ['um array vazio', []],
    ['undefined', undefined],
    ['um objeto fora de array', { criada: true }],
    ['uma linha sem `criada`', [{ inscricao_id: 'x' }]],
  ])('`data` = %s → falha, nunca um palpite', async (_c, data) => {
    dubles.rpc.mockResolvedValue({ data, error: null, status: 200 })
    const r = await criarInscricao(DADOS)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.detail).toContain('esperado uma linha')
  })
})
