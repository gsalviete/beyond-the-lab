import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { cupomNoStripe } from '@/lib/stripe'
import { alternarCupom, criarCupom, salvarStripeCouponId } from '@/lib/supabase'

// ============================================================
// CUPONS — a escrita do painel (`c74`)
//
// ⚠️ AS DUAS PRIMEIRAS LINHAS DE CADA HANDLER SÃO O GUARD, e não há
// exceção. Esta rota é alcançável direto, com `curl`, sem passar por
// layout nenhum — o middleware não cobre `/api/*` de propósito (ver o
// comentário dele). Uma rota de `/api/admin/` sem `exigirAdmin` é uma
// rota aberta, e o único jeito de saber é lendo a primeira linha.
// ============================================================

export const dynamic = 'force-dynamic'

// ⚠️ O DOMÍNIO DE `tipo` ESTÁ AQUI **E** NO CHECK DA `013`, e a duplicação
// é deliberada — não é a "segunda cópia" que o REPORT §9.9 proíbe.
//
// A diferença: o CHECK é quem RECUSA (constraint no banco vence validação
// na aplicação, e ele continua sendo a barreira). Este enum existe para
// que um `tipo` errado vire uma mensagem legível em vez de um erro `23514`
// do Postgres na cara da Giovanna. Se os dois divergirem, quem ganha é o
// banco — e o sintoma é uma opção do formulário que não salva, que é
// barulhento e fácil de achar.
//
// ⚠️ A LEITURA DE `valor` MUDA CONFORME O TIPO (`013`):
//   primeiro_mes → percentual · todos_meses → percentual ·
//   meses_gratis → CONTAGEM DE MESES.
const cupomSchema = z.object({
  codigo: z.string().trim().min(1).max(60),
  tipo: z.enum(['primeiro_mes', 'todos_meses', 'meses_gratis']),
  valor: z.coerce.number().positive(),
  // `null` = vale em QUALQUER safra. Não é ausência de dado, é um valor de
  // negócio — o cupom de campanha que funciona na turma que estiver aberta.
  safra_id: z.union([z.uuid(), z.literal('')]).optional(),
  usos_max: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
  // `datetime-local` do navegador manda 'YYYY-MM-DDTHH:mm', sem fuso.
  expira_em: z.string().optional(),
})

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())

  // ------------------------------------------------------------
  // ⚠️ `_method` — o remendo que mantém o painel funcionando SEM JAVASCRIPT
  //
  // Formulário HTML só fala GET e POST. O botão de ligar/desligar cupom é
  // um `<form method="post">` de propósito: assim ele funciona com o JS
  // desligado, num navegador velho, ou nos segundos em que o bundle ainda
  // não hidratou — que é exatamente quando alguém aperta o botão de pânico
  // porque um cupom vazou.
  //
  // A alternativa seria um `fetch` com PATCH, e ela transformaria o único
  // controle URGENTE do painel em algo que depende de JavaScript ter
  // carregado. O feio aqui compra disponibilidade.
  //
  // ⚠️ E O `_method` NÃO É UMA PORTA: o guard já rodou duas linhas acima, e
  // este `if` só escolhe qual handler AUTORIZADO atende. Um `_method` num
  // sistema sem guard seria contorno; aqui é roteamento.
  // ------------------------------------------------------------
  if (bruto._method === 'PATCH') return alternar(bruto, req)

  const parsed = cupomSchema.safeParse(bruto)

  if (!parsed.success) {
    // ⚠️ AQUI A MENSAGEM PODE SER ESPECÍFICA, ao contrário da rota pública.
    // A regra da mensagem genérica é de segurança — não virar oráculo para
    // quem não deveria estar ali. Atrás da allowlist, quem lê é a Giovanna,
    // e "confira os dados" a deixaria adivinhando qual campo está errado.
    console.warn('[admin] cupom recusado pelo schema', parsed.error.issues)
    return Response.json(
      { ok: false, message: 'Confira os campos do cupom.', detalhes: parsed.error.issues },
      { status: 400 },
    )
  }

  const { codigo, tipo, valor, safra_id, usos_max, expira_em } = parsed.data

  try {
    const cupom = await criarCupom({
      codigo,
      tipo,
      valor,
      // String vazia é o que um `<select>` sem escolha manda. Ela significa
      // "qualquer safra", que no banco é `null` — e não uma FK vazia.
      safraId: safra_id ? safra_id : null,
      usosMax: usos_max === '' || usos_max === undefined ? null : usos_max,
      // ⚠️ `datetime-local` não tem fuso. `new Date('2026-09-01T12:00')` é
      // interpretado no fuso do SERVIDOR, que na Vercel é UTC — então o
      // que a Giovanna digitou como meio-dia vira meio-dia UTC, nove da
      // manhã aqui. Aceito e documentado: a precisão de expiração de cupom
      // é de dias, não de horas, e inventar um seletor de fuso numa tela
      // que ela usa uma vez por campanha custaria mais do que resolve.
      expiraEm: expira_em ? new Date(expira_em).toISOString() : null,
    })

    // ------------------------------------------------------------
    // O ESPELHO (D-07) — e a falha dele NÃO desfaz o cupom
    //
    // ⚠️ `stripe_coupon_id` nulo é um estado REAL e previsto: o cupom
    // existe aqui e ainda não existe lá. A `013` já dizia isso, e o painel
    // mostra "não publicado" em vez de fingir que está pronto.
    //
    // Desfazer o insert seria pior: o cupom sumiria da tela sem
    // explicação, e a Giovanna o criaria de novo — com o mesmo código, que
    // o unique funcional recusaria, produzindo um segundo erro que não tem
    // nada a ver com o primeiro. A próxima tentativa de USO reespelha
    // sozinha (`/api/inscricao` tenta antes de recusar), então o estado se
    // resolve sem ninguém fazer nada.
    // ------------------------------------------------------------
    try {
      const espelho = await cupomNoStripe(cupom)
      await salvarStripeCouponId(cupom.id, espelho)
    } catch (err) {
      console.error('[admin] cupom criado mas nao espelhado no Stripe', cupom.id, err)
      return Response.json(
        {
          ok: true,
          message: 'Cupom criado, mas ainda não publicado no Stripe. Ele publica no primeiro uso.',
        },
        { status: 200 },
      )
    }

    return Response.json({ ok: true, message: 'Cupom criado.' }, { status: 200 })
  } catch (err) {
    // O `23505` aqui é o unique funcional sobre `upper(codigo)` da `013`:
    // `bemvinda` e `BEMVINDA` são o mesmo cupom, e é o banco que garante
    // isso. A mensagem diz o que aconteceu porque quem lê pode agir.
    const codigoPg = (err as { code?: string })?.code
    const duplicado = typeof err === 'object' && err !== null && String(err).includes('23505')

    console.error('[admin] falha ao criar cupom', codigoPg, err)

    return Response.json(
      {
        ok: false,
        message: duplicado ? 'Já existe um cupom com esse código.' : 'Não conseguimos criar o cupom.',
      },
      { status: duplicado ? 409 : 500 },
    )
  }
}

/** Liga e desliga — o botão de pânico. Para quem chama por `fetch`. */
export async function PATCH(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  return alternar(Object.fromEntries(await req.formData()), req)
}

/**
 * O corpo compartilhado pelos dois caminhos.
 *
 * ⚠️ UMA FUNÇÃO E NÃO DUAS CÓPIAS: o `POST` com `_method` e o `PATCH`
 * fazem exatamente a mesma coisa, e duas implementações da mesma regra é o
 * começo de duas versões dela — uma delas esquecida numa correção futura.
 *
 * ⚠️ ELA NÃO CHAMA `exigirAdmin`. Não é esquecimento: os dois chamadores
 * já chamaram, e repetir aqui daria a impressão de que a autorização é
 * desta camada. Ela é da ROTA, feita uma vez, na primeira linha do
 * handler — que é onde dá para auditar lendo.
 */
async function alternar(bruto: Record<string, unknown>, req: Request) {
  const parsed = z.object({ id: z.uuid(), ativo: z.enum(['true', 'false']) }).safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    await alternarCupom(parsed.data.id, parsed.data.ativo === 'true')
  } catch (err) {
    console.error('[admin] falha ao alternar cupom', parsed.data.id, err)
    return Response.json({ ok: false, message: 'Não conseguimos salvar.' }, { status: 500 })
  }

  // ⚠️ REDIRECIONAMENTO, e não JSON. Quem chega aqui pelo `_method` é um
  // formulário HTML de verdade: sem o 303, o navegador mostraria o JSON
  // cru numa página em branco. `fetch` segue o redirect sem reclamar, então
  // o mesmo retorno serve aos dois.
  //
  // ⚠️ O destino é derivado da REQUISIÇÃO, e não de uma env var com
  // fallback para localhost. Em Preview da Vercel cada deploy tem domínio
  // próprio, e um literal mandaria a Giovanna de um ambiente para outro no
  // meio de uma ação.
  return Response.redirect(new URL('/admin/cupons', req.url), 303)
}
