// ============================================================
// A janela da vitrine é UM número declarado em DOIS arquivos
//
// `app/page.jsx` traz `export const revalidate = 60`, que diz de quanto
// em quanto tempo o Next regenera a landing. `src/lib/supabase.ts` traz
// `JANELA_VITRINE_SEGUNDOS`, que diz por quanto tempo a resposta do
// PostgREST fica no Data Cache. São camadas diferentes e as duas
// precisam do mesmo número.
//
// ⚠️ POR QUE NÃO IMPORTAR A CONSTANTE NOS DOIS LADOS — a pergunta óbvia,
// e ela tem resposta. `export const revalidate` é lido por ANÁLISE
// ESTÁTICA do arquivo, antes de o Next executar qualquer linha: o valor
// tem que estar escrito ali como literal. Um identificador importado não
// é lido de forma confiável, e o modo de falhar é silencioso — o Next
// não reclama, ele simplesmente trata a rota como se não houvesse
// revalidação.
//
// Então a duplicação é forçada, e o que resta é impedir que as duas
// cópias divirjam. É isto aqui.
//
// ============================================================
// ⚠️ O QUE ESTE TESTE NÃO COBRE
// ============================================================
//
// Ele compara dois números escritos. Não sobe o Next, não exercita o
// Data Cache e NÃO teria pego o defeito que o originou — que era um
// `cache: 'force-cache'` sem `revalidate` nenhum, ou seja, um número
// AUSENTE, não um número diferente.
//
// Aquele defeito só apareceu no aceite manual: mudar o preço no Studio e
// ver a landing não mudar. Continua sendo assim, e o item está no
// `CHECKLIST-LANCAMENTO.md` (bloco 6) por isso. Este arquivo cobre a
// regressão que sobra depois da correção — alguém mexer em 60 num lugar
// só —, que é pequena mas é a única mecanizável aqui.
// ============================================================
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const paginaLanding = readFileSync('app/page.jsx', 'utf8')
const moduloSupabase = readFileSync('src/lib/supabase.ts', 'utf8')

/**
 * O arquivo sem comentário nenhum — blocos `/* *\/` e linhas `//`.
 *
 * ⚠️ ISTO NÃO É ZELO, É UM FALSO POSITIVO QUE JÁ ACONTECEU, na primeira
 * execução deste próprio arquivo. O `04-PLANO.md` registra a lição para
 * os `.sql` ("teste que lê `.sql` como texto tira os comentários antes de
 * comparar", nascida no `c10`, onde os contraexemplos em prosa do `002`
 * foram lidos como se fossem regra). Vale idêntico para `.ts`, e o
 * motivo é o mesmo: **neste repositório o comentário CITA o código que
 * saiu.**
 *
 * `supabase.ts` preserva, entre aspas e dentro de um bloco, o comentário
 * antigo que justificava `cache: 'force-cache'` — porque entender por que
 * aquele texto convencia é o que impede a linha de voltar. Uma busca no
 * arquivo cru acha essa citação e acusa um defeito que foi corrigido.
 *
 * O efeito perverso, se ninguém tirasse os comentários: o teste ficaria
 * vermelho JUSTAMENTE por o comentário estar bem escrito, e a saída mais
 * rápida seria apagar a explicação — destruindo o ativo que o `CLAUDE.md`
 * chama de mais valioso do repositório para calar um teste errado.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const codigoSupabase = semComentarios(moduloSupabase)

/** `export const revalidate = 60` — o literal, como o Next o lê. */
const revalidateDaPagina = paginaLanding.match(/export\s+const\s+revalidate\s*=\s*(\d+)/)

/** `export const JANELA_VITRINE_SEGUNDOS = 60` */
const janelaDoModulo = moduloSupabase.match(
  /export\s+const\s+JANELA_VITRINE_SEGUNDOS\s*=\s*(\d+)/,
)

// ============================================================
// 0. CONTROLE DO MÉTODO
//
// Tudo abaixo compara dois `match`. Se os dois regexes falharem, as duas
// pontas ficam `null` e um `expect(a).toBe(b)` distraído passaria
// comparando nada com nada — o defeito do `c07`, que deu "0
// divergências" comparando vazio com vazio.
// ============================================================
describe('as duas declarações foram realmente encontradas', () => {
  it('`export const revalidate` existe em app/page.jsx', () => {
    expect(revalidateDaPagina, 'não achei `export const revalidate` em app/page.jsx').not.toBeNull()
  })

  it('`JANELA_VITRINE_SEGUNDOS` existe em src/lib/supabase.ts', () => {
    expect(janelaDoModulo, 'não achei `JANELA_VITRINE_SEGUNDOS` em src/lib/supabase.ts').not.toBeNull()
  })

  it('o revalidate da página é um literal, não um identificador importado', () => {
    // Se alguém "melhorar" isto para `export const revalidate =
    // JANELA_VITRINE_SEGUNDOS`, o regex de dígitos acima para de casar e
    // o teste anterior fica vermelho. Este nomeia o motivo, para a falha
    // não parecer um regex frágil: o literal é exigência do Next.
    expect(paginaLanding).toMatch(/export\s+const\s+revalidate\s*=\s*\d+/)
  })
})

// ============================================================
// 1. OS DOIS NÚMEROS CONCORDAM
// ============================================================
describe('a janela da vitrine é a mesma nos dois arquivos', () => {
  it('revalidate da landing == JANELA_VITRINE_SEGUNDOS', () => {
    expect(Number(revalidateDaPagina?.[1])).toBe(Number(janelaDoModulo?.[1]))
  })
})

// ============================================================
// 2. A LINHA QUE CONGELAVA O PREÇO NÃO VOLTOU
//
// `cache: 'force-cache'` no cliente de vitrine é o defeito original. Ele
// põe a resposta no Data Cache SEM PRAZO: a página regenera a cada 60s,
// relê o mesmo corpo e devolve HTML idêntico. O preço fica preso no
// valor do build até alguém deployar — a dependência de commit que o
// corte 1 existiu para acabar.
//
// ⚠️ A busca é no CÓDIGO, sem comentário — ver `semComentarios` acima. O
// arquivo cru contém a citação do comentário antigo e acusaria um
// defeito já corrigido.
//
// A busca cobre o arquivo todo e não só o cliente de vitrine: o de
// OPERAÇÃO usa `cache: 'no-store'`, que é correto e continua lá;
// `force-cache` não tem uso legítimo em nenhum dos dois.
// ============================================================
describe('o cliente de vitrine não volta a cachear sem prazo', () => {
  it("não há `cache: 'force-cache'` no código de src/lib/supabase.ts", () => {
    expect(codigoSupabase).not.toMatch(/cache:\s*['"]force-cache['"]/)
  })

  it('o fetch da vitrine declara a janela por `next.revalidate`', () => {
    expect(codigoSupabase).toMatch(/next:\s*\{\s*revalidate:\s*JANELA_VITRINE_SEGUNDOS\s*\}/)
  })

  it("o cliente de operação continua `no-store` — a correção não vazou para ele", () => {
    expect(codigoSupabase).toMatch(/cache:\s*['"]no-store['"]/)
  })
})

// ============================================================
// 3. CONTROLE NEGATIVO DO `semComentarios`
//
// Um stripper com regex quebrado devolveria string vazia, e string vazia
// passa em todo `not.toMatch` do bloco 2 — verde comparando nada com
// nada, de novo. Estas duas asserções provam que ele tira o comentário E
// preserva o código.
// ============================================================
describe('o stripper de comentários faz as duas coisas', () => {
  it('tirou a citação de `force-cache` que está no comentário', () => {
    expect(moduloSupabase).toMatch(/force-cache/)
    expect(codigoSupabase).not.toMatch(/force-cache/)
  })

  it('preservou o código em volta', () => {
    expect(codigoSupabase).toMatch(/export\s+const\s+JANELA_VITRINE_SEGUNDOS/)
    expect(codigoSupabase).toMatch(/createClient<Database>/)
  })
})
