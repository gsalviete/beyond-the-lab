// ============================================================
// CONFIGURAÇÃO DO CURSO
// Fonte única de verdade para datas, preço e links institucionais.
// Nenhum destes valores pode ser reescrito à mão em outro arquivo —
// se um número do curso aparecer literal em componente, API ou copy,
// é bug: importe daqui.
// ============================================================

/**
 * Data da primeira cobrança.
 *
 * É este valor que vira o `trial_end` da assinatura do Stripe no Prompt B:
 * quem escolhe "Garantir minha vaga" entra em trial e só é cobrado aqui.
 * Também é a data que aparece na copy abaixo dos botões do formulário.
 *
 * Construída em UTC de propósito. `new Date('2026-08-28')` seria
 * interpretado como meia-noite UTC e, formatado no fuso de São Paulo
 * (UTC-3), voltaria como 27 de agosto. `Date.UTC` + formatação fixada em
 * UTC (ver `formatarDataPorExtenso`) mantém o dia 28 em qualquer fuso.
 *
 * Nota: o mês em `Date.UTC` é 0-indexado — 7 é agosto.
 */
export const DATA_PRIMEIRA_COBRANCA = new Date(Date.UTC(2026, 7, 28))

/**
 * Início das aulas — primeira semana de setembro de 2026.
 *
 * ⚠️ provisório: o dia exato ainda não foi confirmado pela cliente.
 * Até lá vale 1 de setembro. Quando fechar, muda só esta linha.
 */
export const INICIO_DAS_AULAS = new Date(Date.UTC(2026, 8, 1)) // ⚠️ provisório

/** Perfil oficial no Instagram — destino do CTA da tela de sucesso. */
export const INSTAGRAM_URL = 'https://www.instagram.com/giovanna.embrio/'

/** Mensalidade em reais. */
export const VALOR_MENSAL = 299.99

/** Duração do programa, em meses. */
export const DURACAO_MESES = 6

/**
 * Formata uma data por extenso em pt-BR — "28 de agosto de 2026".
 *
 * `timeZone: 'UTC'` é obrigatório aqui: as constantes acima são instantes
 * UTC, e sem isso o navegador de quem está em São Paulo renderizaria o dia
 * anterior. Fixar o fuso na formatação garante que servidor e cliente
 * produzam a mesma string — o que também evita divergência de hidratação.
 */
export function formatarDataPorExtenso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data)
}

/** Mensalidade formatada como moeda — "R$ 299,99". */
export function formatarValorMensal(valor: number = VALOR_MENSAL): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
