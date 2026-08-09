import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { VALORES_DIA_SEMANA } from '@/config/dominio'
import { alternarGrupo, criarGrupo } from '@/lib/supabase'

// ============================================================
// HORÁRIOS (`c68`) — grupo é só um horário dentro da safra
//
// ⚠️ PRIMEIRA LINHA É O GUARD, sem exceção.
//
// ⚠️ NENHUM CAMPO DE DATA, VALOR OU DURAÇÃO AQUI, e não é omissão: a D-01
// PROÍBE. Grupo é logística de agenda — o pool de aulas começa no mesmo
// dia para todo mundo, e quem tem calendário e preço é a safra. Um campo
// de preço por horário triplicaria o modelo, o painel e o suporte para
// representar uma diferença que não existe.
// ============================================================

export const dynamic = 'force-dynamic'

const grupoSchema = z.object({
  safra_id: z.uuid(),
  // ⚠️ O domínio vem de `dominio.ts`, o mesmo módulo que a modal usa para
  // desenhar as caixinhas de disponibilidade. Uma lista escrita à mão aqui
  // seria a quinta cópia dos mesmos cinco valores — e a primeira a
  // divergir no dia em que sábado entrasse.
  dia_semana: z.enum(VALORES_DIA_SEMANA),
  // Texto livre de propósito: "19h", "19:00", "19h às 20h30". A forma como
  // ela escreve o horário é a forma como a aluna vai ler, e fechar num
  // formato obrigaria a inventar um que ninguém pediu.
  horario: z.string().trim().min(1).max(40),
  capacidade: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
})

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())

  if (bruto._method === 'PATCH') {
    const p = z.object({ id: z.uuid(), ativo: z.enum(['true', 'false']) }).safeParse(bruto)
    if (!p.success) {
      return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
    }

    try {
      await alternarGrupo(p.data.id, p.data.ativo === 'true')
      revalidatePath('/admin/alocacao')
      return Response.redirect(new URL('/admin/alocacao', req.url), 303)
    } catch (err) {
      console.error('[admin] falha ao alternar grupo', err)
      return Response.json({ ok: false, message: 'Não conseguimos salvar.' }, { status: 500 })
    }
  }

  const parsed = grupoSchema.safeParse(bruto)
  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Confira os campos do horário.' }, { status: 400 })
  }

  try {
    await criarGrupo({
      safraId: parsed.data.safra_id,
      diaSemana: parsed.data.dia_semana,
      horario: parsed.data.horario,
      capacidade:
        parsed.data.capacidade === '' || parsed.data.capacidade === undefined
          ? null
          : parsed.data.capacidade,
    })
    revalidatePath('/admin/alocacao')
    return Response.json({ ok: true, message: 'Horário criado.' }, { status: 200 })
  } catch (err) {
    console.error('[admin] falha ao criar grupo', err)
    return Response.json({ ok: false, message: 'Não conseguimos criar o horário.' }, { status: 500 })
  }
}
