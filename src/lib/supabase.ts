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

/** Nível de inglês autodeclarado. Espelha o CHECK de `waitlist.nivel_ingles`. */
export type NivelIngles = 'basico' | 'intermediario' | 'avancado'

/** Dias possíveis. Espelha o CHECK de `waitlist.disponibilidade`. */
export type DiaDaSemana = 'seg' | 'ter' | 'qua' | 'qui' | 'sex'

/**
 * Uma coorte, como vive no banco.
 *
 * Atenção ao `valor_mensal`: é `string`, não `number`. O PostgREST
 * serializa `numeric` como string de propósito — `numeric(10,2)` tem
 * precisão que o double do JSON não garante, e converter no meio do
 * caminho é como se perde centavo. Quem converte é quem vai exibir, no
 * último momento possível.
 *
 * As datas são `date` no banco e chegam como 'YYYY-MM-DD' — dia de
 * calendário, sem fuso. Ver `paraDataUTC` em `src/config/curso.ts`.
 */
export type Turma = {
  id: string
  nome: string
  data_inicio_aulas: string
  data_primeira_cobranca: string
  valor_mensal: string
  duracao_meses: number
}

/** Cabeçalhos de toda chamada ao PostgREST. A key nunca sai daqui. */
function headers(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

/**
 * A turma com `inscricoes_abertas = true`, ou `null` se não houver.
 *
 * O banco garante que existe no máximo uma (índice parcial
 * `turmas_uma_aberta_idx`), então o `limit=1` é só cinto de segurança —
 * não é ele que resolve a ambiguidade, é a constraint.
 *
 * `id` VEM na seleção porque a rota de inscrição precisa dele para
 * gravar a FK. Ele não pode chegar ao navegador — quem faz esse corte é
 * `app/api/turma-ativa/route.ts`, que monta a resposta sem o campo.
 *
 * Erro aqui é lançado, não engolido: cada chamador decide o que fazer.
 * Hoje os dois decidem a mesma coisa — tratar como "nenhuma turma
 * aberta" e cair para lista de espera —, mas quem toma essa decisão é a
 * rota, não esta função.
 */
export async function buscarTurmaAtiva(): Promise<Turma | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  const colunas = 'id,nome,data_inicio_aulas,data_primeira_cobranca,valor_mensal,duracao_meses'
  const url =
    `${SUPABASE_URL}/rest/v1/turmas` +
    `?select=${colunas}&inscricoes_abertas=is.true&limit=1`

  const res = await fetch(url, {
    method: 'GET',
    headers: headers(SUPABASE_SERVICE_ROLE_KEY),
    // Sem cache em nenhuma camada: fechar a turma no Studio precisa
    // refletir no site imediatamente, e é esse imediatismo que torna o
    // controle pelo banco melhor que o deploy que ele substitui.
    cache: 'no-store',
  })

  if (!res.ok) {
    // O corpo do erro do PostgREST pode conter detalhe de schema; ele
    // vai para o log do servidor e para lugar nenhum além disso.
    throw new Error(`turmas: HTTP ${res.status} — ${await res.text()}`)
  }

  const linhas = (await res.json()) as Turma[]
  return linhas[0] ?? null
}

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
  /** E.164, já normalizado pela rota — ver `src/lib/telefone.ts`. */
  phone: string
  payment_choice: 'agora' | 'depois'
  /**
   * Turma da inscrição, ou `null` para lista de espera. Anda sempre em
   * par com o `status` abaixo — quem monta o par é a rota, olhando o
   * banco e não o que o cliente afirmou.
   */
  turma_id: string | null
  /**
   * `pendente` = inscrita numa turma aberta.
   * `lista_espera` = cadastro feito sem turma aberta.
   * Os outros estados do CHECK são do Stripe, no Prompt B2.
   */
  status: 'pendente' | 'lista_espera'
  nivel_ingles: NivelIngles
  curso: string
  periodo: string
  disponibilidade: DiaDaSemana[]
  /**
   * Registro probatório do consentimento — os três andam juntos e não
   * fazem sentido separados. Ver `supabase/migrations/003_consentimento.sql`.
   *
   * `consent_text` é a constante do servidor, não o que o cliente
   * enviou: quem monta este objeto é `/api/waitlist`, que importa
   * `CONSENT_TEXT` de `src/config/consentimento.ts`. O corpo do POST
   * não tem voz sobre este campo.
   */
  consent: boolean
  /** ISO 8601 gerado no servidor no momento em que o consentimento foi validado. */
  consent_at: string
  consent_text: string
}): Promise<InsertResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      ...headers(SUPABASE_SERVICE_ROLE_KEY),
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
