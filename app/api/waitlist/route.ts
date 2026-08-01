import { z } from 'zod'
import { buscarTurmaAtiva, insertWaitlistEntry, SupabaseNotConfiguredError } from '@/lib/supabase'
import { E164_BR_REGEX, e164EhValido } from '@/lib/telefone'

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
  // O cliente já manda em E.164; aqui conferimos a forma e, além dela, o
  // DDD e o nono dígito — a mesma função que a máscara usa, para os dois
  // lados não discordarem sobre o que é um celular válido.
  phone: z.string().trim().regex(E164_BR_REGEX).refine(e164EhValido),
  payment_choice: z.enum(['agora', 'depois']),
  // ------------------------------------------------------------
  // PERFIL — obrigatórios AQUI, nullable no banco.
  //
  // A divisão é proposital: as linhas anteriores a esta migração não
  // têm nenhum destes campos, e um `not null` na coluna faria o ALTER
  // falhar. Quem exige o preenchimento é este schema, por onde passa
  // toda escrita nova. O banco cuida do domínio dos valores (os CHECK
  // de `nivel_ingles` e `disponibilidade`), a aplicação cuida da
  // obrigatoriedade.
  // ------------------------------------------------------------
  nivel_ingles: z.enum(['basico', 'intermediario', 'avancado']),
  curso: z.string().trim().min(2).max(100),
  periodo: z.string().trim().min(1).max(40),
  // `min(1)` é o que barra `[]`. Array vazio não é undefined e passaria
  // por qualquer checagem de presença, virando uma inscrita sem nenhum
  // dia — exatamente o que o formulário proíbe e o CHECK do banco
  // também barra, em segunda instância.
  disponibilidade: z.array(z.enum(['seg', 'ter', 'qua', 'qui', 'sex'])).min(1).max(5),
  // Consentimento: `z.literal(true)` e não `z.boolean()` — `false` tem que
  // reprovar. É a base legal da coleta (LGPD art. 7º, I); sem ela não há
  // por que gravar dado nenhum.
  consent: z.literal(true),
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

const SUCCESS_MESSAGE = 'Pronto! Sua inscrição está confirmada.'
// Sem turma aberta a promessa é outra, e prometer "inscrição confirmada"
// a quem entrou na lista de espera seria mentira. A modal mostra a tela
// dela e ignora este texto; quem lê é o honeypot e qualquer cliente que
// não seja o nosso formulário.
const SUCCESS_MESSAGE_ESPERA = 'Pronto! Avisaremos você assim que a próxima turma abrir.'
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
    // Consentimento e disponibilidade merecem mensagem própria: são os
    // dois erros que a pessoa corrige com um clique, e "confira seus
    // dados" a mandaria revisar campos que estão certos. O resto continua
    // genérico de propósito — nada do payload recebido é ecoado de volta.
    const campos = new Set(parsed.error.issues.map((i) => i.path[0]))
    const so = (campo: string) => campos.size === 1 && campos.has(campo)

    let message = 'Confira os dados informados e tente de novo.'
    if (so('consent')) {
      message = 'É preciso concordar em receber as comunicações para concluir a inscrição.'
    } else if (so('disponibilidade')) {
      message = 'Marque pelo menos um dia da semana em que você pode assistir às aulas.'
    }

    return json({ ok: false, message }, 400)
  }

  const {
    name,
    email,
    phone,
    payment_choice,
    website,
    nivel_ingles,
    curso,
    periodo,
    disponibilidade,
  } = parsed.data

  // Honeypot preenchido: responde sucesso e não grava nada. Devolver erro
  // ensinaria o bot que o campo é a armadilha.
  if (website && website.length > 0) {
    console.warn('[waitlist] honeypot acionado')
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200)
  }

  try {
    // ------------------------------------------------------------
    // QUAL É A TURMA — pergunta feita AO BANCO, não ao cliente.
    //
    // A modal também consulta `/api/turma-ativa` para decidir o que
    // mostrar, mas aquilo é interface. Qualquer pessoa pode mandar um
    // POST direto afirmando o que quiser, e entre a resposta que a modal
    // recebeu e este insert a professora pode ter fechado a turma. A
    // única leitura que vale para gravar é esta, feita agora.
    //
    // Se a consulta falhar, o `catch` de fora trata: não gravamos
    // ninguém como inscrita numa turma que não conseguimos confirmar.
    // ------------------------------------------------------------
    const turma = await buscarTurmaAtiva()

    // Sem turma aberta, `payment_choice` é DESCARTADO e vira 'depois'.
    // Não há o que escolher: não existe cobrança para adiantar, e
    // registrar 'agora' aqui deixaria no banco um sinal de intenção de
    // pagamento que a pessoa nunca teve a chance de dar — e que o
    // Prompt B2 poderia ler como fila de cobrança.
    const result = await insertWaitlistEntry({
      name,
      email,
      phone,
      payment_choice: turma ? payment_choice : 'depois',
      turma_id: turma?.id ?? null,
      // `pendente` = inscrita numa turma, nada cobrado ainda. Quem move
      // daqui em diante é o Stripe, no Prompt B2.
      status: turma ? 'pendente' : 'lista_espera',
      nivel_ingles,
      curso,
      periodo,
      disponibilidade,
    })

    // Duplicata é sucesso do ponto de vista de quem preencheu: a pessoa está
    // na lista. Responder diferente aqui transformaria o formulário num
    // oráculo de "este e-mail já está cadastrado?".
    if (result.ok || (!result.ok && result.duplicate)) {
      return json(
        { ok: true, message: turma ? SUCCESS_MESSAGE : SUCCESS_MESSAGE_ESPERA },
        200,
      )
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
