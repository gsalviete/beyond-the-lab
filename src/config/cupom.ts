// ============================================================
// CUPOM — a descrição em português, num lugar só
//
// Módulo NEUTRO: sem `server-only`, sem JSX, sem env var. É o que permite
// a MESMA frase aparecer no e-mail (servidor), no painel (cliente) e em
// qualquer tela futura — em vez de três cópias que divergem na primeira
// edição. Mesmo padrão de `consentimento.ts` e `dominio.ts`.
//
// ⚠️ A LEITURA DE `valor` MUDA CONFORME O `tipo`, e é a decisão mais fácil
// de errar deste projeto (está escrita assim na migração `013`):
//
//   primeiro_mes  → `valor` é PERCENTUAL   (20 = 20% no 1º mês)
//   todos_meses   → `valor` é PERCENTUAL   (15 = 15% em todas)
//   meses_gratis  → `valor` é CONTAGEM     (1 = 1 mês grátis)
//
// Concentrar a frase aqui é o que impede alguém de imprimir "1%" onde o
// cupom dá "1 mês grátis".
// ============================================================

export function descreverCupom(tipo: string, valor: number): string {
  switch (tipo) {
    case 'primeiro_mes':
      return `${valor}% de desconto na primeira mensalidade`
    case 'todos_meses':
      return `${valor}% de desconto em todas as mensalidades`
    case 'meses_gratis':
      return valor === 1 ? 'o primeiro mês grátis' : `os ${valor} primeiros meses grátis`
    default:
      // ⚠️ Não é defensivo: é o que impede um `tipo` novo de virar uma
      // frase vazia num e-mail que promete desconto. Se cair aqui, alguém
      // acrescentou um quarto tipo no banco e não neste arquivo.
      return 'um desconto'
  }
}
