import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { alternarInscricoes, atualizarSafra, criarSafra } from '@/lib/supabase'

// ============================================================
// SAFRAS — o CRUD (`c65`) e o abrir/fechar (`c67`)
//
// ⚠️ PRIMEIRA LINHA É O GUARD, sem exceção.
//
// ⚠️ E TODA ESCRITA AQUI CHAMA `revalidatePath('/')`. É a D-13 se
// completando: a landing é estática com `revalidate = 60`, e um minuto de
// defasagem foi o preço aceito no corte 1 — "no `c36` o painel dispara
// `revalidatePath` ao salvar e a defasagem some". É este ponto.
//
// Sem isso, a Giovanna muda o preço, recarrega o site, vê o número velho, e
// muda de novo achando que não salvou.
// ============================================================

export const dynamic = 'force-dynamic'

const safraSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  // ⚠️ `date` do Postgres é DIA DE CALENDÁRIO, sem fuso — e o input
  // `type="date"` do navegador manda exatamente 'YYYY-MM-DD'. Passar por
  // `new Date()` aqui seria introduzir um instante onde não há um, e o
  // fuso do servidor comeria um dia. A string vai como veio.
  data_inicio_aulas: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_primeira_cobranca: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // `coerce` porque `<input type="number">` chega como string no FormData.
  valor_mensal: z.coerce.number().positive(),
  duracao_meses: z.coerce.number().int().positive(),
  // Vazio = SEM LIMITE (D-08). Não é "zero vagas": é null no banco, e a
  // Giovanna respondeu em 08/08/2026 que não quer número fixo de vagas.
  vagas_total: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
})

/** O corpo comum a criar e editar. */
function paraSalvar(d: z.infer<typeof safraSchema>) {
  return {
    nome: d.nome,
    data_inicio_aulas: d.data_inicio_aulas,
    data_primeira_cobranca: d.data_primeira_cobranca,
    valor_mensal: d.valor_mensal,
    duracao_meses: d.duracao_meses,
    vagas_total: d.vagas_total === '' || d.vagas_total === undefined ? null : d.vagas_total,
  }
}

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())

  // O mesmo remendo de `_method` dos cupons, pela mesma razão: formulário
  // HTML só fala GET e POST, e o botão de abrir/fechar inscrições precisa
  // funcionar sem JavaScript. Ver o bloco em `app/api/admin/cupons`.
  if (bruto._method === 'PATCH') return alternar(bruto, req)
  if (bruto._method === 'PUT') return editar(bruto, req)

  const parsed = safraSchema.safeParse(bruto)
  if (!parsed.success) {
    console.warn('[admin] safra recusada pelo schema', parsed.error.issues)
    return Response.json({ ok: false, message: 'Confira os campos da turma.' }, { status: 400 })
  }

  try {
    await criarSafra(paraSalvar(parsed.data))
    revalidatePath('/')
    return Response.json({ ok: true, message: 'Turma criada.' }, { status: 200 })
  } catch (err) {
    return falha(err, 'criar')
  }
}

async function editar(bruto: Record<string, unknown>, req: Request) {
  const parsed = safraSchema.extend({ id: z.uuid() }).safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Confira os campos da turma.' }, { status: 400 })
  }

  try {
    // ⚠️ MUDAR O PREÇO AQUI NÃO MEXE EM QUEM JÁ ASSINOU (D-06): o valor de
    // cada inscrição está copiado em `valor_mensal_travado` desde o
    // checkout, e o `price` do Stripe é imutável. Quem avisa isso na tela é
    // o `c66`, com a contagem de `contarComContrato`.
    await atualizarSafra(parsed.data.id, paraSalvar(parsed.data))
    revalidatePath('/')
    return Response.redirect(new URL('/admin/safras', req.url), 303)
  } catch (err) {
    return falha(err, 'editar')
  }
}

async function alternar(bruto: Record<string, unknown>, req: Request) {
  const parsed = z.object({ id: z.uuid(), abertas: z.enum(['true', 'false']) }).safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    await alternarInscricoes(parsed.data.id, parsed.data.abertas === 'true')
    revalidatePath('/')
    return Response.redirect(new URL('/admin/safras', req.url), 303)
  } catch (err) {
    // ⚠️ `23505` AQUI SÓ PODE SER UMA COISA: `safras_uma_aberta_idx`, o
    // índice único parcial da `005` que garante no máximo UMA safra com
    // inscrições abertas. A mensagem diz o que fazer, porque a alternativa
    // ("não conseguimos salvar") mandaria a Giovanna tentar de novo para
    // sempre.
    //
    // ⚠️ E O SISTEMA NÃO FECHA A OUTRA SOZINHO — ver `alternarInscricoes`.
    // Fechar uma turma pode ter gente no meio do checkout, e é decisão
    // dela, não efeito colateral de abrir outra.
    const codigo = (err as { codigoPg?: string })?.codigoPg
    if (codigo === '23505') {
      console.warn('[admin] tentativa de abrir uma segunda safra')
      return Response.redirect(new URL('/admin/safras?erro=ja-aberta', req.url), 303)
    }
    return falha(err, 'abrir/fechar')
  }
}

function falha(err: unknown, acao: string) {
  const texto = String(err)
  const duplicado = texto.includes('23505')

  console.error(`[admin] falha ao ${acao} safra`, err)

  return Response.json(
    {
      ok: false,
      message: duplicado
        ? 'Já existe uma turma com esse nome.'
        : err instanceof Error && err.message.startsWith('O nome da turma')
          ? err.message
          : 'Não conseguimos salvar a turma.',
    },
    { status: duplicado ? 409 : 500 },
  )
}
