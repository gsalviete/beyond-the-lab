// ============================================================
// OS NÚMEROS DA TURMA QUE O PAINEL SUGERE
//
// ⚠️ ISTO NÃO É O PREÇO DO CURSO. O preço de cada turma é a coluna
// `safras.valor_mensal`, e o preço de cada inscrição é
// `inscricoes.valor_mensal_travado` — copiado no checkout e imutável
// depois (D-06). O que mora aqui é o que o FORMULÁRIO oferece: o valor
// que ele assume quando o campo fica em branco, e a lista de atalhos do
// menu de escolha.
//
// ⚠️ E ELE EXISTE PARA TER UM DONO SÓ. O padrão de 299 é lido em dois
// lados da mesma requisição — o formulário, que promete "em branco =
// R$ 299,00", e a rota, que é quem de fato grava. Duas cópias divergiriam
// numa edição futura, e a divergência apareceria como uma turma criada com
// um preço que a tela nunca mostrou.
//
// Se um dia o padrão mudar, ele muda aqui e nos dois lugares ao mesmo
// tempo.
// ============================================================

/**
 * O que vai para o banco quando a mensalidade não é preenchida.
 *
 * Combinado com o dono do repositório em 27/08/2026. Em reais, não em
 * centavos — a coluna `valor_mensal` é `numeric` e guarda reais; quem
 * converte para centavos é o Stripe, na borda.
 */
export const VALOR_MENSAL_PADRAO = 299

/**
 * Os atalhos do menu de mensalidade.
 *
 * ⚠️ SÃO SUGESTÃO, NÃO DOMÍNIO. Ao contrário de `dominio.ts`, esta lista
 * não é espelhada em CHECK nenhum: o formulário deixa digitar qualquer
 * valor positivo, e o schema da rota aceita qualquer valor positivo. Tirar
 * um número daqui não invalida turma nenhuma que já o use.
 */
export const MENSALIDADES_SUGERIDAS = [199, 249, 299, 349, 399, 449] as const

/** `299` → `R$ 299,00`. O mesmo formato que a ficha e a landing mostram. */
export function formatarReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
