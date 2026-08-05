import { after } from 'next/server'
import { buscarTurmaAtiva, insertWaitlistEntry, SupabaseNotConfiguredError } from '@/lib/supabase'
import { confirmarInscricao, notificarAdmin } from '@/lib/email'
// O schema e a mensagem de erro moram juntos, em `src/config/schemas.ts`.
// Metade do schema é derivada de `dominio.ts` e a outra metade não é
// (`curso` e `periodo` continuam texto livre) — a fronteira está comentada
// lá. A regra da mensagem genérica também: ela é decisão de segurança, não
// de UX, e ficava exposta a "melhoria" enquanto morava aqui no meio do
// fluxo da requisição.
import { inscricaoSchema, mensagemDeErro } from '@/config/schemas'
// O MESMO módulo que a modal importa para exibir a frase. É essa
// identidade que dá valor ao que gravamos: o texto registrado no banco
// não é uma cópia parecida do que estava na tela, é o mesmo objeto.
import { CONSENT_TEXT } from '@/config/consentimento'

// Nunca pré-renderizar nem cachear: é um POST que escreve no banco.
export const dynamic = 'force-dynamic'

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

  const parsed = inscricaoSchema.safeParse(payload)
  if (!parsed.success) {
    // Genérica por padrão; específica só para consentimento e
    // disponibilidade, e só quando são o único erro. A regra inteira, com
    // o porquê de serem exatamente essas duas exceções, está em
    // `schemas.ts` — nada do payload recebido é ecoado de volta.
    return json({ ok: false, message: mensagemDeErro(parsed.error) }, 400)
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
    consent,
  } = parsed.data

  // Honeypot preenchido: responde sucesso e não grava nada. Devolver erro
  // ensinaria o bot que o campo é a armadilha.
  if (website && website.length > 0) {
    console.warn('[waitlist] honeypot acionado')
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200)
  }

  // Carimba o consentimento AGORA, e não lá embaixo no insert. A
  // diferença é de significado, não de milissegundos: o instante que
  // interessa é aquele em que a manifestação chegou e foi aceita como
  // válida — logo depois do `safeParse` que exigiu `consent: true` e do
  // honeypot que descartou o que não é gente. Gerar isto dentro da
  // chamada ao banco faria a coluna medir a latência do PostgREST.
  const consentAt = new Date().toISOString()

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
      // ------------------------------------------------------------
      // CONSENTIMENTO — o que a pessoa afirmou, quando, e a quê.
      //
      // `consent` vem do payload validado, onde o Zod já o obrigou a ser
      // exatamente `true`. `consent_at` e `consent_text` NÃO vêm de lá,
      // e essa assimetria é o ponto: o cliente é a única fonte possível
      // para o ato de marcar a caixa, mas é a pior fonte imaginável para
      // a hora do relógio e para a redação exibida. Um POST forjado
      // poderia declarar que aceitou um texto que nunca existiu, com
      // data conveniente. O servidor sabe as duas coisas por conta
      // própria e é isso que grava.
      // ------------------------------------------------------------
      consent,
      consent_at: consentAt,
      consent_text: CONSENT_TEXT,
    })

    // ------------------------------------------------------------
    // E-MAILS — só para inserção NOVA, e nunca bloqueando a resposta.
    //
    // `result.ok` sozinho, sem o ramo da duplicata logo abaixo: mandar
    // confirmação de novo para quem já estava na lista revelaria que o
    // e-mail existe no banco. É exatamente o oráculo que a resposta
    // genérica de duplicata existe para evitar — e o envio silencioso
    // seria um canal lateral contornando a resposta HTTP idêntica.
    //
    // `after` do next/server, e não uma promessa solta: em serverless a
    // função pode ser congelada assim que devolve a resposta, e uma
    // promessa não aguardada morre no meio do fetch para o Resend. O
    // `after` é o contrato que a Vercel respeita — a execução continua
    // depois da resposta ir embora, com a plataforma mantendo a lambda
    // viva até estas tasks terminarem. A pessoa vê a tela de sucesso sem
    // esperar o Resend.
    //
    // Os dois envios em paralelo, com `allSettled` e try/catch próprio
    // dentro de cada função: nenhum dos dois pode impedir o outro, e o
    // conjunto não pode virar rejeição não tratada aqui dentro.
    // ------------------------------------------------------------
    if (result.ok) {
      const paraEmail = {
        name,
        email,
        phone,
        nivel_ingles,
        curso,
        periodo,
        disponibilidade,
        payment_choice: turma ? payment_choice : ('depois' as const),
      }

      after(async () => {
        await Promise.allSettled([
          notificarAdmin(paraEmail, turma),
          confirmarInscricao(paraEmail, turma),
        ])
      })
    }

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
