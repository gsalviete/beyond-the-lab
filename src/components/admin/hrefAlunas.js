// ============================================================
// A URL DA LISTA DE ALUNAS, MONTADA NUM LUGAR SÓ
//
// ⚠️ ELA MORA FORA DAS DUAS TELAS QUE A USAM porque as duas são de lados
// diferentes da fronteira: a página é Server Component (as pills de turma
// são links renderizados no servidor) e os controles são Client Component
// (a caixa de situação e a de quantas mostrar navegam pelo `router`).
// Passar a função de lá para cá seria impossível — função não atravessa a
// fronteira do servidor para o cliente —, e escrevê-la duas vezes é como
// os dois lados divergem sem ninguém notar: um filtro que some ao trocar
// o outro.
//
// ⚠️ O QUE NÃO É PASSADO É PRESERVADO. Cada chamada manda só o que muda, e
// o resto vem de `atuais` — trocar a situação não pode apagar a turma
// escolhida.
// ============================================================

/**
 * @param atuais os três parâmetros como estão na URL agora
 * @param mudancas o que muda; `null` num campo o remove da URL
 */
export function hrefAlunas(atuais, mudancas = {}) {
  const final = { ...atuais, ...mudancas }
  const p = new URLSearchParams()

  if (final.turma) p.set('turma', final.turma)
  if (final.status) p.set('status', final.status)
  if (final.por) p.set('por', String(final.por))

  const q = p.toString()
  return q ? `/admin/alunas?${q}` : '/admin/alunas'
}
