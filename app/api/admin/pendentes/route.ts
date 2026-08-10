import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { convidarParaInscricao } from '@/lib/email'
import { buscarSafraAtiva, garantirConvite, listarPendentes } from '@/lib/supabase'

// ============================================================
// A FILA DA D-15 (`c75`) — dispara o link de pagamento
//
// ⚠️ PRIMEIRA LINHA É O GUARD, sem exceção. Esta rota é alcançável direto,
// com `curl`, sem passar por layout nenhum — e ela manda e-mail para gente
// real com um link que abre um checkout.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * ⚠️ 30 DIAS, decidido em 08/08/2026 pelo dono do repositório, e a
 * constante mora AQUI e no `gerar_convites.sql` — os dois lugares que
 * criam convite.
 *
 * É folga para quem só abre e-mail no fim de semana, sem virar link eterno
 * (que é o que a D-10 proíbe). Encurtar aumenta o reenvio manual; alongar
 * aumenta a janela em que um link encaminhado continua abrindo o
 * formulário com o contato de outra pessoa dentro.
 */
const VALIDADE_DO_CONVITE_EM_DIAS = 30

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())
  const parsed = z.object({ pessoa_id: z.uuid() }).safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    // ⚠️ A PESSOA É RESOLVIDA A PARTIR DA FILA, e não do que o formulário
    // mandou. O `pessoa_id` do corpo diz QUAL linha, mas o nome e o e-mail
    // saem da consulta — senão o corpo do POST poderia mandar um e-mail
    // qualquer e o painel viraria uma ferramenta de disparo arbitrário.
    // "Nenhuma decisão de negócio vem do cliente" vale igual atrás da
    // allowlist.
    const pendente = (await listarPendentes()).find((p) => p.pessoa_id === parsed.data.pessoa_id)

    if (!pendente) {
      // Ou a inscrição saiu da fila (ela pagou enquanto a tela estava
      // aberta), ou o id não existe. Os dois terminam igual: recarregue.
      return Response.json(
        { ok: false, message: 'Essa inscrição não está mais pendente. Recarregue a página.' },
        { status: 409 },
      )
    }

    const convite = await garantirConvite(pendente.pessoa_id, VALIDADE_DO_CONVITE_EM_DIAS)

    // ⚠️ A base da URL vem da REQUISIÇÃO e não de um literal: em Preview
    // da Vercel cada deploy tem domínio próprio, e um link apontando para
    // produção mandaria quem testou para o site de verdade.
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
    const link = new URL(`/?convite=${convite.token}`, base).toString()

    // A safra vai para o e-mail poder dizer quando as aulas começam. Falha
    // aqui não impede o envio: a frase da data some, o link fica.
    const safra = await buscarSafraAtiva().catch(() => null)

    // ⚠️ `convidarParaInscricao` NUNCA LANÇA (contrato do topo de
    // `src/lib/email.ts`), então o `await` aqui não protege nada — ele só
    // garante que o envio termine antes da resposta. É de propósito: a
    // Giovanna precisa saber se o e-mail saiu, e um `after()` responderia
    // "enviado" antes de tentar.
    await convidarParaInscricao(
      { nome: pendente.nome, email: pendente.email, link },
      safra ? { nome: safra.nome, data_inicio_aulas: safra.data_inicio_aulas } : null,
      'pendente',
    )

    return Response.json(
      {
        ok: true,
        // ⚠️ A distinção importa para ela: reaproveitado significa que o
        // link é o MESMO que já está na caixa de entrada da pessoa. Se ela
        // reenviar duas vezes, os dois e-mails abrem — e é isso que se
        // quer, porque gerar um novo mataria o primeiro.
        message: convite.reaproveitado
          ? `E-mail reenviado para ${pendente.nome} — mesmo link de antes.`
          : `Link de pagamento enviado para ${pendente.nome}.`,
      },
      { status: 200 },
    )
  } catch (err) {
    console.error('[admin] falha ao enviar o link de pagamento', err)
    return Response.json({ ok: false, message: 'Não conseguimos enviar agora.' }, { status: 500 })
  }
}
