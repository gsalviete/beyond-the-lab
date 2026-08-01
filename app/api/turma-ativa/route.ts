import { buscarTurmaAtiva } from '@/lib/supabase'

// Nunca pré-renderizar nem cachear. Uma turma fechada no Studio precisa
// refletir no site na próxima abertura da modal — se esta resposta fosse
// estática, o controle pelo banco não teria tirado a necessidade de
// deploy, só a teria disfarçado.
export const dynamic = 'force-dynamic'

/**
 * O que a interface recebe. Note o que NÃO está aqui: o `id` da turma.
 *
 * Ele existe no objeto que `buscarTurmaAtiva` devolve, porque
 * `/api/waitlist` precisa dele para gravar a FK — mas é um identificador
 * interno, e não há uma única coisa que a modal faça com ele. O corte é
 * aqui, na montagem da resposta, e é explícito de propósito: um
 * `select *` ou um spread do objeto inteiro vazaria o campo sem ninguém
 * perceber.
 */
type TurmaPublica = {
  nome: string
  data_inicio_aulas: string
  data_primeira_cobranca: string
  /** Convertido para número aqui — o PostgREST manda `numeric` como string. */
  valor_mensal: number
  duracao_meses: number
}

/** Corpo único da rota: ou tem turma, ou tem `null`. Nunca erro. */
function json(turma: TurmaPublica | null) {
  return Response.json(
    { turma },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

export async function GET() {
  try {
    const turma = await buscarTurmaAtiva()

    if (!turma) return json(null)

    return json({
      nome: turma.nome,
      data_inicio_aulas: turma.data_inicio_aulas,
      data_primeira_cobranca: turma.data_primeira_cobranca,
      valor_mensal: Number(turma.valor_mensal),
      duracao_meses: turma.duracao_meses,
    })
  } catch (err) {
    // Falha para o lado seguro: banco fora do ar, variável de ambiente
    // faltando, schema divergente — em qualquer desses casos a resposta é
    // a mesma que "não há turma aberta", e a modal cai em lista de espera.
    //
    // A alternativa seria devolver 500 e a modal mostrar erro. Seria pior:
    // prometer uma vaga que talvez não exista é o único desfecho de fato
    // ruim aqui, e capturar o contato de alguém interessada é sempre
    // melhor do que mostrar a ela uma tela quebrada. O problema fica
    // visível no log do servidor, que é onde ele pode ser consertado.
    console.error('[turma-ativa] falha ao consultar turma aberta', err)
    return json(null)
  }
}
