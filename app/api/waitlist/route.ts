import { z } from 'zod'
import { insertWaitlistEntry, SupabaseNotConfiguredError } from '@/lib/supabase'

// Nunca pré-renderizar nem cachear: é um POST que escreve no banco.
export const dynamic = 'force-dynamic'

// ============================================================
// VALIDAÇÃO
// Esta é a validação que vale. A do formulário existe só para dar
// retorno imediato — o cliente pode desligar o JS, e aí sobra só isto.
// ============================================================
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  // Honeypot: campo escondido por CSS que só bot preenche. Opcional de
  // propósito — humano nunca manda, e a ausência não pode ser erro.
  website: z.string().optional(),
})

// ============================================================
// RATE LIMIT
// Map em memória com janela deslizante simples.
//
// ⚠️ Em serverless isto é POR INSTÂNCIA: cada lambda fria tem o próprio
// Map, e a Vercel pode ter várias em paralelo. Ou seja, o limite real é
// aproximado e mais frouxo do que os números abaixo sugerem. Segura bot
// ingênuo e clique repetido, que é o que precisamos num MVP. Se um dia
// virar problema de verdade, o lugar certo é um store compartilhado
// (Upstash/Redis) ou o rate limit da própria borda.
// ============================================================
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5
const hits = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)

  // Poda preguiçosa: sem isto o Map cresce indefinidamente numa instância
  // de vida longa. Roda raramente, só quando o Map passa de um tamanho.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key)
    }
  }

  return recent.length > RATE_LIMIT_MAX
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'desconhecido'
}

// Toda resposta ao cliente sai daqui. Mensagens genéricas: o detalhe do que
// deu errado fica no log do servidor, nunca no corpo. E nada do payload
// recebido é ecoado de volta.
function json(body: { ok: boolean; message: string }, status: number) {
  return Response.json(body, { status })
}

const SUCCESS_MESSAGE = 'Pronto! Você está na lista de espera.'
const GENERIC_ERROR = 'Não conseguimos salvar seu cadastro agora. Tente novamente em instantes.'

export async function POST(req: Request) {
  const ip = clientIp(req)

  if (isRateLimited(ip)) {
    return json(
      { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' },
      429,
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, message: 'Requisição inválida.' }, 400)
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return json({ ok: false, message: 'Confira o nome e o e-mail informados.' }, 400)
  }

  const { name, email, website } = parsed.data

  // Honeypot preenchido: responde sucesso e não grava nada. Devolver erro
  // ensinaria o bot que o campo é a armadilha.
  if (website && website.length > 0) {
    console.warn('[waitlist] honeypot acionado')
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200)
  }

  try {
    const result = await insertWaitlistEntry({ name, email })

    // Duplicata é sucesso do ponto de vista de quem preencheu: a pessoa está
    // na lista. Responder diferente aqui transformaria o formulário num
    // oráculo de "este e-mail já está cadastrado?".
    if (result.ok || (!result.ok && result.duplicate)) {
      return json({ ok: true, message: SUCCESS_MESSAGE }, 200)
    }

    console.error('[waitlist] insert falhou', result.status, result.detail)
    return json({ ok: false, message: GENERIC_ERROR }, 500)
  } catch (err) {
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[waitlist]', err.message)
    } else {
      console.error('[waitlist] erro inesperado', err)
    }
    return json({ ok: false, message: GENERIC_ERROR }, 500)
  }
}
