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

/** Mensalidade formatada como moeda — "R$ 299,99". */
export function formatarValorMensal(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
