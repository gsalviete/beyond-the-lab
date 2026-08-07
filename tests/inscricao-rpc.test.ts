// ============================================================
// `criarInscricao` — a chamada da RPC, nome por nome
//
// ⚠️ `.rpc()` CASA PARÂMETRO POR NOME, e é isso que torna este arquivo o
// de maior valor por linha do `c26`.
//
// Os dez nomes são a assinatura da função NO BANCO, não uma convenção
// nossa. Errar um deles não é erro de tipo — os tipos gerados descrevem a
// função que existia no dia em que alguém rodou `supabase gen types` — é
// erro de RUNTIME: o PostgREST responde "function not found" porque a
// assinatura não bate, e isso só aparece quando alguém real se inscreve.
//
// Por isso a comparação aqui não é com uma lista escrita à mão neste
// arquivo, que seria a segunda cópia da assinatura. É com o PRÓPRIO
// `.sql` da migração `011b` — o texto que roda no SQL Editor e cria a
// função.
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
// ⚠️ Só o bloco do `create or replace function`. O fim do `011b` tem
// TESTES DE BARREIRA comentados — chamadas de exemplo com argumentos
// posicionais — e um varredor ingênuo os leria como se fossem a
// assinatura. É a mesma armadilha que fez o bloco 5 do `dominio.test.ts`
// reprovar procurando `'sab'` num contraexemplo comentado.
// ------------------------------------------------------------
const MIGRACAO = 'supabase/migrations/011b_rpc_criar_inscricao.sql'
const sql = readFileSync(MIGRACAO, 'utf8')

const ABRE = 'create or replace function public.criar_inscricao('
const inicio = sql.indexOf(ABRE)
const fim = sql.indexOf('returns boolean', inicio)
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
}

/** O nome da função e o objeto de argumentos da última chamada. */
const chamada = () => ({
  funcao: dubles.rpc.mock.calls[0][0] as string,
  args: dubles.rpc.mock.calls[0][1] as Record<string, unknown>,
})

beforeEach(() => {
  vi.clearAllMocks()
  dubles.rpc.mockResolvedValue({ data: true, error: null, status: 200 })
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

  it('saíram dez parâmetros, todos com o prefixo `p_`', () => {
    expect(NOMES_NO_SQL).toHaveLength(10)
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

  it('manda exatamente os dez nomes do SQL — nem um a mais, nem um a menos', async () => {
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
    await criarInscricao({ ...DADOS, safra_id: SAFRA_ID })
    const { args } = chamada()

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
// 3. O QUE A FUNÇÃO DEVOLVE — e por que `false` não pode virar erro
// ============================================================
describe('a tradução do retorno', () => {
  it('`true` → inscrição criada agora', async () => {
    dubles.rpc.mockResolvedValue({ data: true, error: null, status: 200 })
    expect(await criarInscricao(DADOS)).toEqual({ ok: true, criada: true })
  })

  // ⚠️ `criada: false` mora DENTRO do ramo `ok: true`. A união anterior
  // tinha `{ ok: false; duplicate: true }` — duplicata como espécie de
  // erro —, herança de o mecanismo ser uma unique violation. Com a RPC,
  // "já existia" é uma resposta que a função dá de propósito, e
  // colapsá-la de novo em erro faria a rota responder 500 para alguém
  // cujo cadastro está perfeitamente gravado.
  it('`false` → duplicata, e ela é SUCESSO', async () => {
    dubles.rpc.mockResolvedValue({ data: false, error: null, status: 200 })
    const r = await criarInscricao(DADOS)
    expect(r).toEqual({ ok: true, criada: false })
    expect(r.ok).toBe(true)
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

  // ⚠️ `data` não-booleano é FALHA, e não "provavelmente deu certo". A
  // função declara `returns boolean` e sempre devolve um; outra coisa
  // significa que a resposta não tem a forma que a assinatura promete —
  // schema divergente, função substituída — que é a classe de incidente
  // da `004`.
  //
  // Assumir `true` mandaria e-mail de confirmação por uma inscrição que
  // talvez não exista. Assumir `false` diria "você já está cadastrada"
  // para quem não está. As duas mentem; só o erro não mente.
  it.each([
    ['null', null],
    ['a string "true"', 'true'],
    ['o número 1', 1],
    ['undefined', undefined],
    ['um objeto', { criada: true }],
  ])('`data` = %s → falha, nunca um palpite', async (_c, data) => {
    dubles.rpc.mockResolvedValue({ data, error: null, status: 200 })
    const r = await criarInscricao(DADOS)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.detail).toContain('esperado boolean')
  })
})
