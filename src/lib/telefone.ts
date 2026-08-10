// ============================================================
// TELEFONE BRASILEIRO — máscara, normalização e validação
//
// Compartilhado entre o formulário (client) e a rota de API (server).
// Por isso este módulo NÃO pode importar `server-only` nem nada de
// `src/lib/supabase.ts`: a mesma regra tem que rodar dos dois lados,
// senão a máscara aceita o que o servidor recusa.
//
// O número é guardado em E.164 (`+5521999999999`) porque vai ser usado
// para montar o grupo de WhatsApp — formato que a API do WhatsApp e
// qualquer discador entendem sem reprocessar.
// ============================================================

/**
 * DDDs em uso no Brasil, conforme o plano de numeração da Anatel.
 * A lista é fechada de propósito: `\d{2}` aceitaria "00" e "10", que não
 * existem, e o telefone é o canal de contato do grupo — errar aqui
 * significa uma aluna que não recebe o convite.
 */
export const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/** Forma canônica do que gravamos: +55, DDD, 9 e mais 8 dígitos. */
export const E164_BR_REGEX = /^\+55\d{11}$/

/** Só os dígitos, no máximo 11 (DDD + celular de 9). */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 11)
}

/**
 * Máscara progressiva `(XX) XXXXX-XXXX`.
 *
 * Escrita à mão, sem lib. Recebe o valor cru do input (que pode já vir
 * mascarado, colado ou meio apagado), extrai os dígitos e remonta — assim
 * apagar no meio do número nunca deixa um parêntese órfão para trás.
 */
export function mascararTelefone(valor: string): string {
  const d = somenteDigitos(valor)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Um celular brasileiro válido para nós: 11 dígitos, DDD existente e o
 * nono dígito começando em 9 — é o que a Anatel reserva para móvel, e
 * WhatsApp em fixo não existe.
 */
export function telefoneEhValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11) return false
  if (!DDDS_VALIDOS.has(Number(d.slice(0, 2)))) return false
  return d[2] === '9'
}

/** `(21) 99999-9999` → `+5521999999999`. Retorna null se não for válido. */
export function paraE164(valor: string): string | null {
  if (!telefoneEhValido(valor)) return null
  return `+55${somenteDigitos(valor)}`
}

/**
 * `+5521999999999` → `(21) 99999-9999`. O caminho inverso de `paraE164`.
 *
 * ============================================================
 * ⚠️ ELA EXISTE POR CAUSA DE UM BUG REAL, e o bug era silencioso do pior
 *    jeito: preenchia um campo com um valor INVÁLIDO
 * ============================================================
 *
 * O convite (D-10, D-15) pré-preenche o telefone a partir do que está no
 * banco, que é E.164 — `+5521987654321`, TREZE dígitos. Passar isso direto
 * por `mascararTelefone` produz `(55) 21987-64321`: ela extrai os dígitos e
 * monta assumindo DDD + celular, e o `55` do país vira DDD.
 *
 * O estrago não era só cosmético. `telefoneEhValido` exige exatamente 11
 * dígitos, então a pessoa abria o link do convite, encontrava o telefone
 * já preenchido, e era barrada com "digite um celular válido" num campo
 * que ela não digitou. Medido em uso real, em 10/08/2026.
 *
 * ⚠️ O `+55` SAI POR PREFIXO, e não por "corta os dois primeiros dígitos".
 * A diferença aparece no dia em que alguém colar um número sem o país:
 * `21987654321` já é nacional, e um `slice(2)` cego devolveria
 * `987654321` — um número mutilado que parece plausível. Só remove quem
 * de fato tem o prefixo.
 *
 * Aceita as duas formas de propósito: o que vem do banco (`+55...`) e o
 * que já está nacional. Assim quem chama não precisa saber de onde o valor
 * veio.
 */
export function paraNacional(valor: string): string {
  const semPais = valor.trim().replace(/^\+?55/, '')
  return mascararTelefone(semPais)
}

/** Valida um E.164 já normalizado — é o que a API recebe pela rede. */
export function e164EhValido(valor: string): boolean {
  if (!E164_BR_REGEX.test(valor)) return false
  return telefoneEhValido(valor.slice(3))
}
