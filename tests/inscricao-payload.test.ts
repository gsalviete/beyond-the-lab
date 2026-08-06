// ============================================================
// O CORPO DO POST — a lacuna que o `c06` deixou aberta
//
// Uma coisa só, e ela vale o arquivo inteiro:
//
//   **Quando a pessoa escolhe "Outro" e digita o curso, o corpo do POST
//   carrega o que ela DIGITOU — "Fonoaudiologia" —, nunca a string
//   "Outro".**
//
// Por que isso precisa de teste. `CURSOS` e `PERIODOS` terminam em
// "Outro", que na modal revela um campo de texto curto. O select guarda
// 'Outro' no estado; o que vai para a coluna é outra variável. São duas
// variáveis parecidas a três linhas de distância, e mandar a errada não
// quebra nada visível: o POST passa no Zod (`curso` é texto livre, min 2),
// o banco aceita, a inscrição é gravada — e a segmentação por curso da
// Giovana ganha uma linha "Outro" que não diz nada sobre ninguém. É um
// defeito que só aparece meses depois, numa planilha.
//
// ⚠️ ESTE ARQUIVO LÊ O CÓDIGO-FONTE DA MODAL. É incomum, e é deliberado.
//
// A alternativa seria renderizar a modal e submeter o formulário, o que
// exigiria jsdom e @testing-library — as duas coisas que o
// `vitest.config.ts` recusa por escrito, e que não passam a valer a pena
// por causa de uma asserção. A tentativa de provar isto por NAVEGADOR
// esbarrou num dev server instável e foi abandonada de propósito
// (`docs/04-PLANO.md`, nota do `c26`): teste frágil é pior que lacuna
// declarada.
//
// O precedente é o bloco "a DIREÇÃO da derivação (D6)" de
// `consentimento.test.ts`, e a natureza da pergunta é a mesma: não é
// "qual valor saiu", é "de onde o valor sai". Isso se afirma sobre a
// declaração, não sobre a execução.
//
// ⚠️ O QUE ELE NÃO GARANTE: que a modal RENDERIZADA se comporta assim. Um
// erro no `onChange` do campo de texto, ou um `disabled` que impeça a
// digitação, passa por aqui em verde. Quem cobre a modal montada continua
// sendo o render do `shot.mjs`, como o `design/SPEC.md` exige.
//
// A metade behavioral desta mesma regra está em `inscricao-rota.test.ts`
// ("curso livre atravessa a rota inteira") e em `dominio.test.ts` (o
// schema aceita curso fora de `CURSOS`). Os três juntos cobrem o caminho:
// a modal MANDA o texto livre, o servidor ACEITA, e ele CHEGA à RPC.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURSOS, OUTRO, PERIODOS } from '@/config/dominio'
import { inscricaoSchema } from '@/config/schemas'

const FONTE = 'src/components/InscricaoModal.jsx'
const fonte = readFileSync(FONTE, 'utf8')

// Comentário fora ANTES de qualquer busca — a lição do bloco 5 do
// `dominio.test.ts`, onde uma varredura ingênua leu um CONTRAEXEMPLO
// comentado como se fosse regra. Aqui o risco é o mesmo e maior: os
// comentários desta modal citam `payment_choice`, `'agora'`, `'depois'` e
// o próprio `curso` dezenas de vezes, explicando por que não estão lá.
const semComentarios = fonte
  .replace(/\/\*[\s\S]*?\*\//g, '') // blocos, inclusive os {/* */} do JSX
  .replace(/^\s*\/\/.*$/gm, '') // linhas inteiras de //

/**
 * O objeto literal passado a `JSON.stringify(...)` no envio.
 *
 * Balanceia chaves em vez de casar com regex: um `{` aninhado (um
 * `headers`, um objeto no meio) faria qualquer `/\{[^}]*\}/` cortar no
 * lugar errado e o teste passaria a afirmar sobre meio objeto.
 */
function corpoDoPost(src: string): string {
  const marca = 'JSON.stringify({'
  const inicio = src.indexOf(marca)
  if (inicio === -1) return ''

  let profundidade = 0
  for (let i = inicio + marca.length - 1; i < src.length; i++) {
    if (src[i] === '{') profundidade++
    else if (src[i] === '}') {
      profundidade--
      if (profundidade === 0) return src.slice(inicio + marca.length, i)
    }
  }
  return ''
}

const corpo = corpoDoPost(semComentarios)

/**
 * As chaves do objeto, na forma `chave:` e na forma abreviada `chave,`.
 *
 * A modal usa as duas: `name,` (o valor veio do FormData com o mesmo
 * nome) e `curso: cursoFinal` (o valor NÃO é o que a variável homônima
 * guarda — que é exatamente o assunto deste arquivo).
 */
const chavesDoCorpo = corpo
  .split('\n')
  .map((l) => l.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(:|,|$)/)?.[1])
  .filter((k): k is string => Boolean(k))

/** A linha que declara uma constante, sem os comentários em volta. */
const declaracaoDe = (nome: string) =>
  semComentarios.split('\n').find((l) => l.includes(`const ${nome} =`))

// ============================================================
// 0. CONTROLE DO MÉTODO — antes de acreditar em qualquer verde abaixo
//
// Todas as asserções deste arquivo são sobre uma string. Se o caminho
// estiver errado, se o arquivo for renomeado, ou se a remoção de
// comentários engolir o código junto, `corpo` vira '' — e aí
// `not.toMatch()` passa trivialmente, `chavesDoCorpo` fica vazio, e o
// arquivo inteiro reporta verde tendo verificado NADA.
//
// É a mesma armadilha do `c07` (diferencial de vazio com vazio) e do
// `c19` (contagem de três tabelas vazias). O bloco existe para que ela
// seja impossível aqui.
// ============================================================
describe('o método não é vácuo', () => {
  it('o arquivo-fonte foi encontrado e tem tamanho de arquivo de verdade', () => {
    expect(fonte.length).toBeGreaterThan(10_000)
  })

  it('a remoção de comentários não engoliu o código', () => {
    expect(semComentarios).toContain('async function handleSubmit')
    expect(semComentarios).toContain("fetch('/api/inscricao'")
    expect(semComentarios.length).toBeGreaterThan(5_000)
  })

  it('o corpo do POST foi isolado e é um objeto com conteúdo', () => {
    expect(corpo.length).toBeGreaterThan(50)
    expect(chavesDoCorpo.length).toBeGreaterThan(5)
  })
})

// ============================================================
// 1. "OUTRO" NÃO É RESPOSTA — é o que revela o campo que tem a resposta
// ============================================================
describe('o texto livre de "Outro" é o que vai no POST', () => {
  // A asserção central do arquivo. `curso: cursoFinal` e NÃO `curso,`:
  // a abreviação mandaria o estado do select, que na escolha "Outro" vale
  // a string 'Outro'.
  it('o corpo manda `curso: cursoFinal`, e não a variável do select', () => {
    expect(corpo).toMatch(/\bcurso:\s*cursoFinal\b/)
    expect(corpo, 'curso abreviado manda o valor do select').not.toMatch(/\bcurso\s*,/)
  })

  it('o corpo manda `periodo: periodoFinal`, e não a variável do select', () => {
    expect(corpo).toMatch(/\bperiodo:\s*periodoFinal\b/)
    expect(corpo, 'periodo abreviado manda o valor do select').not.toMatch(/\bperiodo\s*,/)
  })

  // A outra ponta: as duas variáveis são de fato a resolução do "Outro",
  // e não apelidos do select. Sem este teste, um
  // `const cursoFinal = curso` passaria no anterior.
  it.each([
    ['cursoFinal', 'cursoOutro'],
    ['periodoFinal', 'periodoOutro'],
  ])('`%s` resolve o "Outro" a partir de `%s`', (final, livre) => {
    const decl = declaracaoDe(final)
    expect(decl, `não achei a declaração de ${final} em ${FONTE}`).toBeDefined()
    expect(decl).toContain('OUTRO')
    expect(decl).toContain(livre)
    // `.trim()` não é detalhe de estilo: sem ele, "  " digitado no campo
    // vira um curso de dois caracteres que o `min(2)` do Zod aceita.
    expect(decl).toContain('.trim()')
  })

  // A comparação é com a constante do domínio, nunca com o literal. Duas
  // grafias de 'Outro' em dois arquivos é a duplicação que o `dominio.ts`
  // existe para acabar — e aqui ela falharia em silêncio: o campo de
  // texto simplesmente nunca apareceria.
  it('compara com a constante OUTRO, não com o literal', () => {
    expect(semComentarios).not.toMatch(/===\s*['"]Outro['"]/)
    expect(fonte).toMatch(/import\s*\{[^}]*\bOUTRO\b[^}]*\}\s*from\s*'@\/config\/dominio'/s)
  })

  // O elo que sustenta os dois anteriores: `OUTRO` é de fato a última
  // opção das duas listas. Se ele deixasse de estar em `CURSOS`, o
  // ternário nunca dispararia e o campo de texto viraria código morto.
  it('OUTRO é uma opção real das duas listas', () => {
    expect(CURSOS).toContain(OUTRO)
    expect(PERIODOS).toContain(OUTRO)
  })
})

// ============================================================
// 2. O CORTE DE FRONTEIRA, DO LADO DE CÁ
//
// O `route.ts` tem o corte de entrada (a desestruturação do `parsed.data`
// é a lista do que atravessa). Este é o corte de SAÍDA, e as duas listas
// têm que ser a mesma — derivada do schema, não escrita à mão aqui, que
// seria a quinta cópia.
// ============================================================
describe('o corpo manda exatamente o que o schema espera', () => {
  it('as chaves do POST são as do `inscricaoSchema`, nem mais nem menos', () => {
    expect([...chavesDoCorpo].sort()).toEqual(Object.keys(inscricaoSchema.shape).sort())
  })

  // ⚠️ Estes três não são "campos que a modal esqueceu". Cada um tem uma
  // razão diferente para não estar:
  //
  //   `payment_choice`   — a pergunta morreu (D-11).
  //   `consent_at` /
  //   `consent_text`     — NASCEM NO SERVIDOR. O navegador é a única
  //                        fonte possível do ATO de marcar a caixa e a
  //                        pior fonte imaginável da hora do relógio e da
  //                        redação exibida (REPORT §9.7).
  //
  // O teste acima já os barra por igualdade de conjunto; este nomeia os
  // três para que a falha diga QUAL voltou, e não só "os conjuntos
  // diferem".
  it.each(['payment_choice', 'consent_at', 'consent_text'])(
    'não manda `%s` — e a ausência é decisão, não esquecimento',
    (campo) => {
      expect(chavesDoCorpo).not.toContain(campo)
    },
  )

  // O telefone atravessa em E.164, derivado da máscara — nunca o valor
  // mascarado que está na tela. É a regra que roda dos dois lados a
  // partir do mesmo módulo (REPORT §9.8).
  it('manda o telefone em E.164, não o texto mascarado', () => {
    expect(corpo).toMatch(/\bphone:\s*paraE164\(/)
  })
})
