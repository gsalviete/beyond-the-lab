import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { encerrarAssinatura } from '@/lib/stripe'
import { buscarFicha, moverParaGrupo, mudarStatusInscricao } from '@/lib/supabase'

// ============================================================
// INSCRIÇÕES — alocação (`c72`) e cancelamento (`c73`)
//
// ⚠️ PRIMEIRA LINHA É O GUARD, sem exceção.
//
// ⚠️⚠️ AS DUAS AÇÕES DESTE ARQUIVO SÃO DE NATUREZAS OPOSTAS, e é por isso
// que elas convivem aqui com uma separação tão marcada:
//
//   ALOCAR   → NÃO TOCA NO STRIPE (D-03). A aluna já pagou antes de ser
//              alocada. É o que torna o kanban seguro de usar: a Giovanna
//              reorganiza a semana inteira sem medo.
//   CANCELAR → TOCA no Stripe, de propósito. É o único handler deste
//              arquivo que move dinheiro, e ele exige confirmação por nome
//              na tela antes de chegar aqui.
//
// A D-03 proíbe "qualquer chamada ao Stripe nos handlers de alocação", e
// `tests/admin-alocacao.test.ts` verifica isso lendo este arquivo como
// texto: o `import` do Stripe existe, e o que o teste garante é que ele
// não é usado dentro do bloco de alocação.
// ============================================================

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())

  if (bruto._acao === 'cancelar') return cancelar(bruto)
  return alocar(bruto)
}

/**
 * Move de horário. ⚠️ NENHUMA CHAMADA AO STRIPE AQUI (D-03).
 */
async function alocar(bruto: Record<string, unknown>) {
  const parsed = z
    .object({
      inscricao_id: z.uuid(),
      // String vazia = tirar de todos os horários. "Ainda não alocada" é um
      // estado legítimo, não um erro — uma inscrição nasce sem grupo.
      grupo_id: z.union([z.uuid(), z.literal('')]),
    })
    .safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    await moverParaGrupo(parsed.data.inscricao_id, parsed.data.grupo_id || null)
    revalidatePath('/admin/alocacao')
    return Response.json({ ok: true }, { status: 200 })
  } catch (err) {
    // ⚠️ O trigger `inscricao_grupo_da_mesma_safra` da `009` recusa grupo
    // de outra safra e grupo em inscrição de lista de espera. Ele levanta
    // `P0001` (raise exception), e a mensagem dele é técnica demais para a
    // tela — mas o CASO é explicável, e explicá-lo evita que a Giovanna
    // tente de novo achando que foi falha de rede.
    const codigo = (err as { codigoPg?: string })?.codigoPg
    console.error('[admin] falha ao alocar', codigo, err)

    return Response.json(
      {
        ok: false,
        message:
          codigo === 'P0001'
            ? 'Esse horário é de outra turma, ou essa inscrição ainda está na lista de espera.'
            : 'Não conseguimos mover agora.',
      },
      { status: codigo === 'P0001' ? 409 : 500 },
    )
  }
}

/**
 * Cancela a inscrição (`c73`, Fluxo 6).
 *
 * ⚠️ A CONFIRMAÇÃO POR NOME ACONTECE NA TELA, e ela é conferida AQUI
 * TAMBÉM. Uma confirmação só no cliente é um `if` que qualquer requisição
 * direta pula — e este handler cancela a assinatura de alguém.
 *
 * ⚠️ E A COMPARAÇÃO É COM O NOME DO BANCO, não com o que o formulário
 * mandou junto. Mandar nome e confirmação no mesmo POST e comparar os dois
 * seria comparar o cliente com ele mesmo.
 */
async function cancelar(bruto: Record<string, unknown>) {
  const parsed = z
    .object({ inscricao_id: z.uuid(), confirmacao: z.string().trim().min(1) })
    .safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    const ficha = await buscarFicha(parsed.data.inscricao_id)

    if (!ficha) {
      return Response.json({ ok: false, message: 'Inscrição não encontrada.' }, { status: 404 })
    }

    // Normaliza caixa e espaço: quem digita o nome de alguém não acerta a
    // acentuação nem a caixa, e exigir isso transformaria a confirmação num
    // teste de digitação em vez de um ato deliberado.
    const igual =
      parsed.data.confirmacao.toLocaleLowerCase('pt-BR') ===
      ficha.pessoa.nome.trim().toLocaleLowerCase('pt-BR')

    if (!igual) {
      return Response.json(
        { ok: false, message: 'O nome não confere. Digite exatamente como está na ficha.' },
        { status: 400 },
      )
    }

    // ------------------------------------------------------------
    // ⚠️ O STRIPE PRIMEIRO, O NOSSO BANCO DEPOIS.
    //
    // Se o Stripe falhar, nada foi gravado do nosso lado e ela tenta de
    // novo. Na ordem inversa, a inscrição ficaria `cancelada` aqui com a
    // assinatura viva lá — e o cartão seria debitado no mês seguinte de
    // alguém que o painel diz que cancelou. É a mesma ordem do
    // `checkout.session.completed`, pela mesma razão.
    //
    // ⚠️ SEM ASSINATURA NÃO HÁ O QUE ENCERRAR, e isso é comum: quem
    // abandonou o checkout está em `pendente_pagamento` e nunca teve
    // assinatura nenhuma. Cancelar essa inscrição é só mudar o status.
    // ------------------------------------------------------------
    if (ficha.assinatura?.stripe_subscription_id) {
      await encerrarAssinatura(ficha.assinatura.stripe_subscription_id)
    }

    await mudarStatusInscricao(parsed.data.inscricao_id, 'cancelada')

    revalidatePath('/admin/alunas')
    revalidatePath('/admin/alocacao')

    return Response.json(
      {
        ok: true,
        message: ficha.assinatura?.stripe_subscription_id
          ? 'Inscrição cancelada. As cobranças param no fim do mês já pago.'
          : 'Inscrição cancelada.',
      },
      { status: 200 },
    )
  } catch (err) {
    console.error('[admin] falha ao cancelar', err)
    return Response.json({ ok: false, message: 'Não conseguimos cancelar agora.' }, { status: 500 })
  }
}
