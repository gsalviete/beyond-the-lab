// ============================================================
// DOMÍNIO E SCHEMA — o que o servidor aceita e o que recusa
//
// Dois blocos, e a fronteira entre eles é a regra do topo do
// `dominio.ts`: **derivar do domínio ≠ restringir ao domínio.**
//
//   1. onde a derivação é TOTAL   — `nivel_ingles`, `disponibilidade`.
//      Não têm "Outro": o que a UI oferece é exatamente o que o servidor
//      aceita, e o mesmo conjunto vai ao CHECK do banco.
//
//   2. onde ela é PARCIAL         — `curso`, `periodo`.
//      Terminam em "Outro", que revela um campo de texto. O que sai no
//      POST não é necessariamente um item da lista, e fechá-los num enum
//      recusaria exatamente as pessoas cujo curso não está nela.
//
// O padrão dos testes de enum é o do `c09`: **varrer e comparar com a
// própria fonte**, nunca congelar a lista aqui. Um teste que repete os
// valores à mão vira a quinta cópia do domínio — que é o que o
// `dominio.ts` existe para eliminar.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CURSOS,
  LISTA_SQL,
  OUTRO,
  PERIODOS,
  ROTULO_DIA_SEMANA,
  ROTULO_NIVEL_INGLES,
  VALORES_DIA_SEMANA,
  VALORES_NIVEL_INGLES,
  listarDias,
} from '@/config/dominio'
import {
  ERRO_CONSENTIMENTO,
  ERRO_DISPONIBILIDADE,
  ERRO_GENERICO,
  inscricaoSchema,
  mensagemDeErro,
} from '@/config/schemas'

/** Um payload completo e válido. Cada teste muda um campo só. */
const VALIDO = {
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  phone: '+5521987654321',
  nivel_ingles: 'basico',
  curso: 'Biomedicina',
  periodo: '1º ao 3º',
  disponibilidade: ['seg'],
  consent: true,
} as const

const com = (patch: Record<string, unknown>) =>
  inscricaoSchema.safeParse({ ...VALIDO, ...patch })

const aceita = (patch: Record<string, unknown>) => com(patch).success

it('o payload de referência é válido', () => {
  expect(inscricaoSchema.safeParse(VALIDO).success).toBe(true)
})

// ============================================================
// 1. DERIVAÇÃO TOTAL — o schema aceita exatamente o domínio
// ============================================================
describe('nivel_ingles', () => {
  // Varredura, não lista congelada: se alguém acrescentar um nível ao
  // domínio, este teste passa a exigi-lo sozinho. Se alguém trocar o
  // `z.enum(VALORES_NIVEL_INGLES)` por uma lista escrita à mão que
  // divirja, ele reprova.
  it('aceita todos os valores do domínio', () => {
    for (const v of VALORES_NIVEL_INGLES) {
      expect(aceita({ nivel_ingles: v }), `deveria aceitar ${v}`).toBe(true)
    }
  })

  it('aceita SOMENTE os valores do domínio', () => {
    const candidatos = [
      ...VALORES_NIVEL_INGLES,
      'fluente', 'nativo', 'BASICO', 'Básico', 'basico ', '', 'null',
    ]
    const aceitos = candidatos.filter((v) => aceita({ nivel_ingles: v }))
    expect([...new Set(aceitos)].sort()).toEqual([...VALORES_NIVEL_INGLES].sort())
  })

  it.each([undefined, null, 1, true, [], {}])('rejeita o não-texto %s', (v) => {
    expect(aceita({ nivel_ingles: v })).toBe(false)
  })

  it('todo valor tem rótulo — o Record é exaustivo por construção', () => {
    for (const v of VALORES_NIVEL_INGLES) {
      expect(ROTULO_NIVEL_INGLES[v], `sem rótulo para ${v}`).toBeTruthy()
    }
    expect(Object.keys(ROTULO_NIVEL_INGLES).sort()).toEqual([...VALORES_NIVEL_INGLES].sort())
  })
})

describe('disponibilidade', () => {
  it('aceita cada dia do domínio, isolado', () => {
    for (const d of VALORES_DIA_SEMANA) {
      expect(aceita({ disponibilidade: [d] }), `deveria aceitar ${d}`).toBe(true)
    }
  })

  it('aceita SOMENTE os dias do domínio', () => {
    const candidatos = [...VALORES_DIA_SEMANA, 'sab', 'dom', 'SEG', 'Segunda', '']
    const aceitos = candidatos.filter((d) => aceita({ disponibilidade: [d] }))
    expect([...new Set(aceitos)].sort()).toEqual([...VALORES_DIA_SEMANA].sort())
  })

  it('aceita a semana inteira', () => {
    expect(aceita({ disponibilidade: [...VALORES_DIA_SEMANA] })).toBe(true)
  })

  // `min(1)` é o que barra `[]`. Array vazio não é `undefined` e passaria
  // por qualquer checagem de presença, virando uma inscrita sem nenhum
  // dia — que é o insumo do kanban de horários da Giovana.
  it('rejeita array vazio', () => {
    expect(aceita({ disponibilidade: [] })).toBe(false)
  })

  it('rejeita mais itens do que o domínio tem', () => {
    const demais = [...VALORES_DIA_SEMANA, VALORES_DIA_SEMANA[0]]
    expect(demais.length).toBe(VALORES_DIA_SEMANA.length + 1)
    expect(aceita({ disponibilidade: demais })).toBe(false)
  })

  it('rejeita um dia inválido no meio de válidos', () => {
    expect(aceita({ disponibilidade: ['seg', 'sab', 'qua'] })).toBe(false)
  })

  it('todo dia tem rótulo, e listarDias preserva a ordem recebida', () => {
    expect(Object.keys(ROTULO_DIA_SEMANA).sort()).toEqual([...VALORES_DIA_SEMANA].sort())
    expect(listarDias(['qua', 'seg'])).toBe(
      `${ROTULO_DIA_SEMANA.qua}, ${ROTULO_DIA_SEMANA.seg}`,
    )
  })
})

// ============================================================
// 2. DERIVAÇÃO PARCIAL — onde a lista NÃO fecha o conjunto
//
// Estes testes existem para impedir uma "correção" futura. Fechar
// `curso` num `z.enum(CURSOS)` deixa o formulário coerente na leitura e
// quebra a inscrição de quem escolheu "Outro" — silenciosamente, com a
// mensagem genérica, sem a pessoa saber qual campo revisar.
// ============================================================
describe('curso e periodo — texto livre de propósito', () => {
  it('aceita todas as opções que a UI oferece', () => {
    for (const c of CURSOS) expect(aceita({ curso: c }), c).toBe(true)
    for (const p of PERIODOS) expect(aceita({ periodo: p }), p).toBe(true)
  })

  // O caminho "Outro": o que sai no POST é o que a pessoa digitou.
  it.each(['Fonoaudiologia', 'Nutrição', 'Odontologia', 'Zootecnia', 'Ed. Física'])(
    'aceita o curso livre "%s", que NÃO está em CURSOS',
    (c) => {
      expect(CURSOS).not.toContain(c)
      expect(aceita({ curso: c })).toBe(true)
    },
  )

  it.each(['6º semestre', 'Mestrado', 'Doutorado', 'último ano'])(
    'aceita o período livre "%s", que NÃO está em PERIODOS',
    (p) => {
      expect(PERIODOS).not.toContain(p)
      expect(aceita({ periodo: p })).toBe(true)
    },
  )

  it('"Outro" é a mesma string nas duas listas — é o que a modal compara', () => {
    expect(CURSOS).toContain(OUTRO)
    expect(PERIODOS).toContain(OUTRO)
  })

  // O que limita estes dois campos é o tamanho da coluna, não o domínio.
  it.each([
    ['curso', 'A', false],
    ['curso', 'AB', true],
    ['curso', 'A'.repeat(100), true],
    ['curso', 'A'.repeat(101), false],
    ['periodo', '', false],
    ['periodo', 'A', true],
    ['periodo', 'A'.repeat(40), true],
    ['periodo', 'A'.repeat(41), false],
  ])('%s com %s caracteres → %s', (campo, valor, esperado) => {
    expect(aceita({ [campo]: valor })).toBe(esperado)
  })

  it('apara espaço antes de medir', () => {
    const r = com({ curso: '  Biomedicina  ' })
    expect(r.success && r.data.curso).toBe('Biomedicina')
    expect(aceita({ curso: '   A   ' })).toBe(false)
  })
})

// ============================================================
// 3. OS DEMAIS CAMPOS
// ============================================================
describe('consentimento', () => {
  // `z.literal(true)`, não `z.boolean()`: `false` tem que reprovar. É a
  // base legal da coleta (LGPD art. 7º, I).
  it.each([false, undefined, null, 'true', 1, 0])('rejeita consent = %s', (v) => {
    expect(aceita({ consent: v })).toBe(false)
  })

  it('aceita apenas o booleano true', () => {
    expect(aceita({ consent: true })).toBe(true)
  })
})

describe('email', () => {
  it('normaliza para minúsculo — o unique da coluna depende disso', () => {
    const r = com({ email: '  MARIA@Exemplo.COM  ' })
    expect(r.success && r.data.email).toBe('maria@exemplo.com')
  })

  it.each(['maria', 'maria@', '@exemplo.com', 'maria exemplo.com', ''])(
    'rejeita "%s"',
    (v) => expect(aceita({ email: v })).toBe(false),
  )
})

describe('honeypot', () => {
  // Opcional de propósito: humano nunca manda o campo, e a ausência não
  // pode ser erro. Quem decide o que fazer quando ele vem preenchido é a
  // rota, não o schema — aqui ele só precisa passar.
  it('aceita ausente e aceita preenchido', () => {
    expect(aceita({})).toBe(true)
    expect(aceita({ website: 'http://spam.example' })).toBe(true)
  })
})

describe('payment_choice — a pergunta que morreu (D-11)', () => {
  // Este bloco substituiu o caso `['payment_choice', { payment_choice:
  // 'talvez' }]` da tabela de mensagens genéricas, que só fazia sentido
  // enquanto o schema EXIGIA o campo e um valor fora do enum reprovava.
  //
  // O que precisa ser garantido agora é o oposto, e são duas coisas
  // distintas — por isso duas asserções e não uma:
  //
  //   1. Um payload SEM o campo passa. É o que a modal manda desde o
  //      `c25`; se o Zod voltasse a exigi-lo, todo POST daria 400.
  //   2. Um payload COM o campo passa E o valor não atravessa. É a aba
  //      aberta há meia hora com o bundle velho: ela continua conseguindo
  //      se inscrever, e o campo morto não chega ao outro lado do parse.
  //
  // A segunda depende de o `z.object` não ter `.passthrough()`. Se alguém
  // acrescentar um, este teste é quem avisa — e o que estaria vazando não
  // é só este campo, é qualquer chave que um POST forjado inventar.
  it('não é exigido — o payload válido não o tem', () => {
    expect(inscricaoSchema.safeParse(VALIDO).success).toBe(true)
  })

  it('não é aceito — se vier, é descartado no parse', () => {
    const r = com({ payment_choice: 'agora' })
    expect(r.success).toBe(true)
    expect(r.success && 'payment_choice' in r.data).toBe(false)
  })
})

// ============================================================
// 4. A MENSAGEM DE ERRO — genérica por segurança
//
// Mensagem detalhada devolveria de graça o formato exato que o servidor
// espera, e o formulário viraria a documentação de como forjar um POST
// que ele aceita. As duas exceções revelam apenas o que a tela já mostra.
// ============================================================
describe('mensagem de erro', () => {
  const msg = (patch: Record<string, unknown>) => {
    const r = com(patch)
    return r.success ? '(aceitou)' : mensagemDeErro(r.error)
  }

  it('específica quando o ÚNICO erro é o consentimento', () => {
    expect(msg({ consent: false })).toBe(ERRO_CONSENTIMENTO)
  })

  it('específica quando o ÚNICO erro é a disponibilidade', () => {
    expect(msg({ disponibilidade: [] })).toBe(ERRO_DISPONIBILIDADE)
  })

  it.each([
    ['phone', { phone: 'x' }],
    ['email', { email: 'x' }],
    ['name', { name: '' }],
    ['curso', { curso: '' }],
    ['periodo', { periodo: '' }],
    ['nivel_ingles', { nivel_ingles: 'z' }],
  ])('genérica para %s — formato não é coisa que se revele', (_c, patch) => {
    expect(msg(patch)).toBe(ERRO_GENERICO)
  })

  // `campos.size === 1` é o que mantém isso apertado. Um payload forjado
  // que erra vários campos recebe a genérica, e não um relatório campo a
  // campo do que o servidor quer.
  it.each([
    ['consent + phone', { consent: false, phone: 'x' }],
    ['consent + disponibilidade', { consent: false, disponibilidade: [] }],
    ['disponibilidade + email', { disponibilidade: [], email: 'x' }],
    ['cinco campos', { consent: false, disponibilidade: [], phone: 'x', email: 'y', name: '' }],
  ])('genérica quando há mais de um campo errado (%s)', (_c, patch) => {
    expect(msg(patch)).toBe(ERRO_GENERICO)
  })

  it('as três mensagens são distintas entre si', () => {
    expect(new Set([ERRO_GENERICO, ERRO_CONSENTIMENTO, ERRO_DISPONIBILIDADE]).size).toBe(3)
  })
})

// ============================================================
// 5. O QUARTO CONSUMIDOR: o CHECK do SQL
//
// ⚠️ LEIA O QUE ESTE BLOCO **NÃO** GARANTE ANTES DE CONFIAR NELE.
//
// Ele compara o domínio com o arquivo `.sql` DO REPOSITÓRIO. Isso é
// tudo. Ele não abre conexão, não consulta `pg_constraint`, e **não sabe
// nada sobre o banco que está em produção.**
//
// A distância entre as duas coisas não é teórica: é exatamente o
// incidente da migração `004`. Uma inscrição real gravou com perfil e
// consentimento inteiros nulos porque a migração chegou ao banco e o
// deploy da aplicação, não — repositório e produção em fases diferentes,
// e ninguém tinha como saber. O inverso (aplicação nova, banco velho)
// tem a mesma forma e é igualmente invisível daqui.
//
// Então o que um verde aqui significa, exatamente:
//
//   ✓ a migração versionada concorda com o domínio versionado
//   ✗ o banco em produção concorda com qualquer um dos dois
//
// Quem verifica a segunda linha é o `CHECKLIST-LANCAMENTO.md`, na mão,
// olhando o commit que está em Production na Vercel. Um teste verde não
// substitui isso e não deve dar a impressão de substituir.
// ============================================================
describe('CHECK do SQL espelha o domínio (com limite conhecido)', () => {
  const MIGRACAO = 'supabase/migrations/002_turmas_e_perfil.sql'
  const sql = readFileSync(MIGRACAO, 'utf8')

  // Normalizar o espaço em branco, e não comparar byte a byte.
  //
  // O SQL usa as duas formas: `in ('a', 'b')` COM espaço depois da
  // vírgula e `array['a','b']` SEM. Não é descuido — são duas construções
  // do Postgres escritas em momentos diferentes. Um teste que exigisse a
  // string exata quebraria na primeira vez que alguém formatasse a
  // migração, e o que interessa verificar é o conjunto de valores, não a
  // tipografia.
  const semEspaco = (s: string) => s.replace(/\s+/g, '')

  // Comentários fora ANTES de tudo, e esta linha tem história.
  //
  // A primeira versão deste bloco varria o arquivo inteiro e reprovou
  // procurando `'sab'`. A migração estava certa: `'sab'` aparece nos
  // TESTES DE BARREIRA comentados no fim do `002` —
  // `-- update public.waitlist set disponibilidade = array['sab'] ...` —
  // que são exemplos do que o CHECK deve RECUSAR.
  //
  // Ou seja: o arquivo contém de propósito os contraexemplos do próprio
  // domínio, em prosa. Um teste que não distingue SQL executável de
  // comentário lê o contraexemplo como se fosse regra.
  const semComentarios = sql.replace(/--[^\n]*/g, '')
  const sqlNormalizado = semEspaco(semComentarios)

  it('o CHECK de nivel_ingles contém exatamente os valores do domínio', () => {
    expect(sqlNormalizado).toContain(semEspaco(`nivel_ingles in (${LISTA_SQL.nivelIngles})`))
  })

  it('o CHECK de disponibilidade contém exatamente os dias do domínio', () => {
    expect(sqlNormalizado).toContain(semEspaco(`array[${LISTA_SQL.diaSemana}]`))
  })

  // O controle negativo do próprio método: um valor que NÃO está no
  // domínio também não pode estar na migração. Sem isto, os dois testes
  // acima passariam com um `in ('basico','intermediario','avancado','x')`
  // — `toContain` é subcadeia, não igualdade.
  it('a migração não aceita valor fora do domínio', () => {
    for (const intruso of ['fluente', 'nativo', 'sab', 'dom']) {
      expect(sqlNormalizado).not.toContain(`'${intruso}'`)
    }
  })

  // Controle contra o verde vazio: se o caminho estivesse errado, se o
  // arquivo fosse renomeado, ou se a remoção de comentários engolisse o
  // SQL todo, os `toContain` acima passariam a comparar contra string
  // vazia — e `not.toContain` passaria trivialmente.
  it('a normalização não é vácuo: sobrou SQL executável para conferir', () => {
    expect(sql.length).toBeGreaterThan(1000)
    expect(sqlNormalizado.length).toBeGreaterThan(1000)
    expect(sqlNormalizado).toContain('createtableifnotexistspublic.turmas')
    expect(sqlNormalizado).toContain('waitlist_nivel_ingles_check')
    expect(sqlNormalizado).toContain('waitlist_disponibilidade_check')
  })
})
