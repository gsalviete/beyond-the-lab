// ============================================================
// CONFIGURAÇÃO DO CURSO
// Links institucionais e formatação. Só isto.
//
// As datas, o valor e a duração NÃO moram mais aqui: são colunas da
// tabela `public.safras` e chegam pela rota `/api/safra-ativa`. Foi uma
// troca deliberada — enquanto eram constantes, mudar a data de cobrança
// ou abrir a turma seguinte exigia commit e deploy. Agora é um UPDATE no
// Supabase Studio.
//
// O que sobrou aqui é o que não varia por turma. Se um dado do curso
// mudar de safra para safra, ele pertence ao banco, não a este arquivo.
// ============================================================

/** Perfil oficial no Instagram — destino do CTA da tela de sucesso. */
export const INSTAGRAM_URL = 'https://www.instagram.com/giovanna.embrio/'

/**
 * Registro profissional da professora.
 *
 * Estava escrito à mão em dois lugares (`Footer.jsx` e `Teacher.jsx`), com
 * o risco óbvio de os dois divergirem numa edição futura. O valor abaixo foi
 * copiado VERBATIM de lá: hífen entre `CRBM` e `7`, espaço simples antes do
 * número, sem `nº`, sem barra, sem região por extenso.
 *
 * ⚠️ Não reformatar, não normalizar, não completar. É dado de credencial —
 * se precisar mudar, confirme na fonte antes.
 */
export const CRBM = 'CRBM-7 11567'

/**
 * Converte a `date` do Postgres ('YYYY-MM-DD') num `Date` em UTC.
 *
 * É a ponte entre o banco e `formatarDataPorExtenso`, e ela precisa
 * existir: `new Date('2026-08-28')` é interpretado como meia-noite UTC
 * e, formatado no fuso de São Paulo (UTC-3), volta como 27 de agosto.
 * Um dia inteiro de diferença numa data de cobrança.
 *
 * `Date.UTC` explícito a partir das partes, somado ao `timeZone: 'UTC'`
 * da formatação, mantém o dia 28 sendo 28 em qualquer fuso — e faz
 * servidor e cliente produzirem a mesma string, o que também evita
 * divergência de hidratação.
 *
 * Nota: o mês em `Date.UTC` é 0-indexado, daí o `- 1`.
 */
export function paraDataUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

/**
 * Formata uma data por extenso em pt-BR — "28 de agosto de 2026".
 *
 * `timeZone: 'UTC'` é obrigatório: as datas vêm de `paraDataUTC`, que as
 * constrói como instantes UTC. Ver o comentário lá.
 */
export function formatarDataPorExtenso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data)
}

/**
 * Mensalidade formatada como moeda — "R$ 299,99".
 *
 * ⚠️ Esta função passou meses SEM NENHUM CHAMADOR, e isso era o sintoma
 * da tensão 8.1 do `REPORT.md`: o banco era fonte de verdade, o
 * transporte existia, e a página exibia `R$ 299,99` escrito à mão. A
 * professora podia mudar o valor no Studio e o site continuava dizendo o
 * número velho. O `c22` ligou o consumo — quem chama é `app/page.jsx`,
 * pela `Pricing`.
 *
 * O parâmetro é `number` porque é o que o PostgREST devolve (medido:
 * `299.99`, número JSON). ⚠️ Isto é FORMATAÇÃO PARA EXIBIR e nada mais.
 * Aritmética de dinheiro não acontece em float: o Stripe cobra em
 * centavo inteiro, e a conversão para inteiro é do corte 2, no ponto que
 * monta a Checkout Session. Se um dia aparecer soma, desconto ou
 * proporcional escrito sobre este valor, o erro está em quem somou.
 */
export function formatarValorMensal(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

/**
 * Duração em meses, com a concordância certa — "6 meses", "1 mês".
 *
 * Existe porque o literal que ela substitui era sempre "6 meses", e o
 * plural estava embutido na frase. `duracao_meses` é uma coluna de
 * `safras` (D-01: o calendário é da safra) e a Giovana pode publicar uma
 * safra de um mês sem falar com ninguém — aí a página diria "1 meses".
 *
 * Devolve minúscula sempre. Onde a tela pede caixa alta (o chip do card
 * de preço, "6 Meses"), quem resolve é `capitalize` no CSS: a variação é
 * de apresentação e não merece uma segunda string para divergir da
 * primeira.
 */
export function formatarDuracao(meses: number): string {
  return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
}
