// Acesso ao Supabase — EXCLUSIVAMENTE server-side.
//
// `server-only` faz o build quebrar se alguém importar este módulo de um
// client component. É a rede de segurança que impede a service_role key de
// acabar no bundle do navegador.
import 'server-only'

// Nenhuma das duas tem prefixo NEXT_PUBLIC_, de propósito: o Next só expõe
// ao cliente as variáveis com esse prefixo. Sem ele, elas nunca saem do
// servidor.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Código de erro do Postgres para violação de constraint unique.
 * O PostgREST repassa o `code` do banco no corpo do erro.
 */
export const UNIQUE_VIOLATION = '23505'

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente')
    this.name = 'SupabaseNotConfiguredError'
  }
}

export type InsertResult =
  | { ok: true }
  | { ok: false; duplicate: true }
  | { ok: false; duplicate: false; status: number; detail: string }

/**
 * Insere uma linha na `waitlist` via PostgREST.
 *
 * Falamos com a API REST do Supabase por `fetch` em vez de usar o
 * `@supabase/supabase-js`: a única operação do projeto é um INSERT, e o SDK
 * traria auth, realtime e storage junto para o bundle do servidor sem nenhum
 * uso. Se o escopo crescer (queries, admin, auth), vale trocar pelo SDK.
 *
 * A service_role key ignora RLS — é justamente por isso que a tabela pode
 * ficar sem nenhuma policy. Ver o comentário no SQL do schema.
 */
export async function insertWaitlistEntry(entry: {
  name: string
  email: string
}): Promise<InsertResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      // `return=minimal` evita que o banco devolva a linha gravada. Não
      // precisamos dela e não há motivo para trafegar dado pessoal de volta.
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(entry),
    cache: 'no-store',
  })

  if (res.ok) return { ok: true }

  // O corpo do erro do PostgREST é JSON; se não for, ficamos com o texto cru.
  const raw = await res.text()
  let code: string | undefined
  try {
    code = JSON.parse(raw)?.code
  } catch {
    /* corpo não-JSON: cai no ramo genérico abaixo */
  }

  if (code === UNIQUE_VIOLATION) return { ok: false, duplicate: true }

  return { ok: false, duplicate: false, status: res.status, detail: raw }
}
