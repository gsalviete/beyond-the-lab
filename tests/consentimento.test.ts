// ============================================================
// CONSENTIMENTO — a direção da derivação
//
// O menor teste do corte e o de maior consequência jurídica.
//
// A LGPD (art. 8º, §1º) põe no controlador o ônus de PROVAR que o
// consentimento foi obtido. Provar isso exige saber, para cada linha do
// banco, qual redação a pessoa tinha diante dos olhos quando marcou a
// caixa. O sistema atende a isso copiando `CONSENT_TEXT` inteiro em
// `consent_text`, em toda inscrição — prova não se normaliza.
//
// O QUE ESTE ARQUIVO PROVA, E É UMA COISA SÓ:
//
//   **`CONSENT_TEXT` sai de `CONSENT_SEGMENTS`, nunca o contrário.**
//
// A frase vive em segmentos porque a modal precisa renderizar dois links
// no meio dela (Termos e Política) enquanto o banco precisa da sentença
// corrida. A saída óbvia — uma string para gravar e um JSX à parte para
// exibir — é a duplicação disfarçada: as duas ficariam a um `git blame`
// de distância e divergiriam na primeira revisão de redação. A partir
// dali, o que o banco guarda como prova deixa de ser o que a pessoa leu
// na tela, e ninguém teria como saber.
//
// Por isso há aqui DOIS testes de natureza diferente, e os dois são
// necessários:
//
//   1. COMPORTAMENTAL — o texto é igual à concatenação dos segmentos.
//      Pega quem editar um dos dois e esquecer o outro.
//
//   2. ESTRUTURAL — a declaração de `CONSENT_TEXT` no código-fonte é uma
//      expressão sobre `CONSENT_SEGMENTS`, e não um literal.
//      Pega quem substituir a derivação por uma string escrita à mão com
//      o mesmo conteúdo de hoje. O teste 1 passaria; o acoplamento teria
//      sumido; e a divergência apareceria só na revisão de redação
//      seguinte, que é tarde demais.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONSENT_SEGMENTS, CONSENT_TEXT } from '@/config/consentimento'

const FONTE = 'src/config/consentimento.ts'

describe('a derivação', () => {
  it('CONSENT_TEXT é exatamente a concatenação dos segmentos', () => {
    expect(CONSENT_TEXT).toBe(CONSENT_SEGMENTS.map((s) => s.texto).join(''))
  })

  it('preserva a ordem — cada segmento aparece depois do anterior', () => {
    let cursor = 0
    for (const seg of CONSENT_SEGMENTS) {
      const at = CONSENT_TEXT.indexOf(seg.texto, cursor)
      expect(at, `segmento fora de ordem: "${seg.texto}"`).toBeGreaterThanOrEqual(cursor)
      cursor = at + seg.texto.length
    }
    // O cursor termina no fim da string: não sobra texto que não venha de
    // segmento nenhum.
    expect(cursor).toBe(CONSENT_TEXT.length)
  })

  it('não perde nem inventa caractere na junção', () => {
    const somaDosPedacos = CONSENT_SEGMENTS.reduce((n, s) => n + s.texto.length, 0)
    expect(CONSENT_TEXT.length).toBe(somaDosPedacos)
  })
})

// ------------------------------------------------------------
// O teste que a D6 realmente pede
//
// Ele lê o próprio arquivo-fonte. É incomum, e é o único jeito de
// afirmar algo sobre COMO o valor foi produzido em vez de sobre qual
// valor ele tem — que é exatamente a pergunta aqui.
// ------------------------------------------------------------
describe('a DIREÇÃO da derivação (D6)', () => {
  const fonte = readFileSync(FONTE, 'utf8')

  /** A linha que declara `CONSENT_TEXT`, sem comentários em volta. */
  const declaracao = fonte
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .find((l) => l.includes('export const CONSENT_TEXT'))

  it('a declaração existe e foi encontrada', () => {
    expect(declaracao, `não achei a declaração de CONSENT_TEXT em ${FONTE}`).toBeDefined()
  })

  it('CONSENT_TEXT é derivada de CONSENT_SEGMENTS, não escrita à mão', () => {
    expect(declaracao).toContain('CONSENT_SEGMENTS')
  })

  // O complemento do anterior: derivar E ter um literal na mesma linha
  // seria `CONSENT_SEGMENTS.map(...).join('') + ' e mais isto'` — meia
  // derivação, que é pior que nenhuma porque parece derivação inteira.
  //
  // A exceção é o separador do `join`, que é uma string vazia por
  // definição. Qualquer outro literal com conteúdo reprova.
  it('não há literal com conteúdo na declaração', () => {
    const literais = [...(declaracao ?? '').matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3])
      .filter((s) => s.length > 0)
    expect(literais, 'CONSENT_TEXT não pode conter texto escrito à mão').toEqual([])
  })

  // Se algum dia `CONSENT_SEGMENTS` deixar de ser a fonte, este arquivo
  // inteiro perde o sentido em silêncio. A asserção existe para que a
  // remoção seja barulhenta.
  it('CONSENT_SEGMENTS é declarada ANTES de CONSENT_TEXT no arquivo', () => {
    const iSeg = fonte.indexOf('export const CONSENT_SEGMENTS')
    const iTxt = fonte.indexOf('export const CONSENT_TEXT')
    expect(iSeg).toBeGreaterThan(-1)
    expect(iTxt).toBeGreaterThan(iSeg)
  })
})

// ------------------------------------------------------------
// O CONTEÚDO — o mínimo que a frase precisa dizer e ser
// ------------------------------------------------------------
describe('a frase', () => {
  it('tem exatamente dois links, para os Termos e para a Política', () => {
    const comLink = CONSENT_SEGMENTS.filter((s) => s.href)
    expect(comLink.map((s) => s.href)).toEqual(['/termos', '/privacidade'])
  })

  it('o texto dos links faz parte da sentença gravada', () => {
    // Os links são links na TELA. No banco vira texto corrido — e tem que
    // virar, senão a prova ficaria com buracos onde a pessoa leu palavras.
    for (const seg of CONSENT_SEGMENTS.filter((s) => s.href)) {
      expect(CONSENT_TEXT).toContain(seg.texto)
    }
  })

  it('nenhum segmento é vazio', () => {
    for (const [i, seg] of CONSENT_SEGMENTS.entries()) {
      expect(seg.texto.length, `segmento ${i} vazio`).toBeGreaterThan(0)
    }
  })

  it('é texto puro — nada de HTML, que é problema da camada de exibição', () => {
    expect(CONSENT_TEXT).not.toMatch(/<[a-z/]/i)
    expect(CONSENT_TEXT).not.toContain('&nbsp;')
  })

  // A junção de segmentos é onde nasce o erro de espaçamento: um segmento
  // que termina sem espaço colado no seguinte produz "aceito osTermos", e
  // isso vai para o banco como prova.
  it('não tem espaço duplicado nem sobra nas pontas', () => {
    expect(CONSENT_TEXT).not.toMatch(/ {2}/)
    expect(CONSENT_TEXT).toBe(CONSENT_TEXT.trim())
  })

  // ⚠️ Este teste nasceu de um controle negativo que FALHOU EM FALHAR.
  //
  // Apaguei o espaço de um segmento (`' e a '` → `'e a '`), o que produz
  // "Termos de Usoe a Política de Privacidade", e a suíte continuou
  // verde. O teste acima pega espaço a MAIS; ninguém pegava espaço a
  // MENOS.
  //
  // A costura é o ponto frágil por construção: cada segmento é editado
  // isolado, e o espaço que separa dois deles pertence visualmente a um
  // e logicamente aos dois. Na tela o erro é discreto; no banco ele fica
  // gravado como a redação que a pessoa teria lido.
  //
  // A regra: em toda emenda, se o segmento da esquerda termina em letra,
  // o da direita não pode começar em letra. Pontuação e espaço passam.
  it('nenhuma emenda entre segmentos cola duas palavras', () => {
    for (let i = 0; i < CONSENT_SEGMENTS.length - 1; i++) {
      const esquerda = CONSENT_SEGMENTS[i].texto
      const direita = CONSENT_SEGMENTS[i + 1].texto
      const colou = /[\p{L}\p{N}]$/u.test(esquerda) && /^[\p{L}\p{N}]/u.test(direita)
      expect(
        colou,
        `emenda ${i}/${i + 1} sem separação: "…${esquerda.slice(-12)}" + "${direita.slice(0, 12)}…"`,
      ).toBe(false)
    }
  })

  it('é uma sentença de verdade, não um rascunho', () => {
    expect(CONSENT_TEXT.length).toBeGreaterThan(80)
    expect(CONSENT_TEXT).toMatch(/\.$/)
  })
})
