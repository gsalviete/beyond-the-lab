import { buscarSafraAtiva } from '@/lib/supabase'

// Nunca pré-renderizar nem cachear. Uma safra fechada no Studio precisa
// refletir no site na próxima abertura da modal — se esta resposta fosse
// estática, o controle pelo banco não teria tirado a necessidade de
// deploy, só a teria disfarçado.
//
// Isto vale para ESTA rota, que é a leitura da modal, e não contradiz a
// D-13: a landing lê a mesma safra por outro caminho e é estática com
// `revalidate = 60`, porque lá um minuto de defasagem é aceitável e o
// cache é o que mantém a página de pé com o banco fora do ar. Aqui não —
// quem abriu a modal está decidindo agora.
export const dynamic = 'force-dynamic'

/**
 * O que a interface recebe. Note o que NÃO está aqui: o `id` da safra e
 * a contagem crua de inscritas.
 *
 * O `id` existe no objeto que `buscarSafraAtiva` devolve, porque
 * `/api/inscricao` precisa dele para gravar a FK — mas é um identificador
 * interno, e não há uma única coisa que a modal faça com ele. As
 * `inscritas` existem lá porque o painel da Giovana vai precisar delas
 * (`c36`), e são operação: quantas pessoas já entraram é conta dela, não
 * informação de vitrine.
 *
 * O corte é aqui, na montagem da resposta, e é explícito de propósito:
 * um `select *` ou um spread do objeto inteiro vazaria os dois campos
 * sem ninguém perceber.
 */
type SafraPublica = {
  nome: string
  data_inicio_aulas: string
  data_primeira_cobranca: string
  /**
   * Número JSON, medido na resposta real do PostgREST (`299.99`) — o
   * `Number()` que existia aqui era redundante e saiu.
   *
   * ⚠️ Este campo é para EXIBIR. Aritmética de dinheiro não acontece em
   * float: o Stripe cobra centavo inteiro, e a conversão é do corte 2,
   * no ponto que monta a Checkout Session. Nada aqui soma, multiplica ou
   * aplica desconto sobre ele.
   */
  valor_mensal: number
  duracao_meses: number
  /**
   * Governa o CTA, e SÓ o CTA (D-13).
   *
   * Ele é campo próprio, e não filtro da query, para que fechar as
   * inscrições não apague preço e data do site junto. `true` = botão de
   * inscrição; `false` = lista de espera. Quem lê este campo para
   * decidir o que desenhar está certo; quem o ler para decidir o que
   * GRAVAR está errado — essa pergunta é refeita ao banco no POST, ver
   * `app/api/inscricao/route.ts`.
   */
  inscricoes_abertas: boolean
  /**
   * Quantas vagas sobraram, ou `null` para **SEM LIMITE**.
   *
   * `null` não é "não sabemos" nem "zero": é `vagas_total is null` no
   * banco, que pela D-08 significa safra sem teto. A modal não deve
   * desenhar contador nenhum nesse caso.
   *
   * Nunca negativo. Se a Giovana baixar `vagas_total` abaixo de quem já
   * entrou — ou se o limite mole for estourado por duas pessoas fechando
   * o checkout no mesmo segundo —, o valor é 0. Mostrar "-2 vagas" seria
   * expor a contagem interna de inscritas por subtração, que é
   * exatamente o dado que este DTO corta.
   */
  vagas_restantes: number | null
}

/** Corpo único da rota: ou tem safra, ou tem `null`. Nunca erro. */
function json(safra: SafraPublica | null) {
  return Response.json(
    { safra },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

export async function GET() {
  try {
    const safra = await buscarSafraAtiva()

    if (!safra) return json(null)

    return json({
      nome: safra.nome,
      data_inicio_aulas: safra.data_inicio_aulas,
      data_primeira_cobranca: safra.data_primeira_cobranca,
      valor_mensal: safra.valor_mensal,
      duracao_meses: safra.duracao_meses,
      inscricoes_abertas: safra.inscricoes_abertas,
      // `Math.max(0, ...)` é a garantia de nunca negativo descrita no
      // DTO. O `null` passa direto, sem virar 0: as duas coisas dizem
      // coisas opostas — "sem limite" e "acabou" — e colapsá-las aqui
      // faria a modal desenhar "esgotado" numa safra sem teto.
      vagas_restantes:
        safra.vagas_total === null ? null : Math.max(0, safra.vagas_total - safra.inscritas),
    })
  } catch (err) {
    // Falha para o lado seguro: banco fora do ar, variável de ambiente
    // faltando, schema divergente, contagem que não veio — em qualquer
    // desses casos a resposta é a mesma que "não há safra", e a modal
    // cai em lista de espera.
    //
    // A alternativa seria devolver 500 e a modal mostrar erro. Seria pior:
    // prometer uma vaga que talvez não exista é o único desfecho de fato
    // ruim aqui, e capturar o contato de alguém interessada é sempre
    // melhor do que mostrar a ela uma tela quebrada. O problema fica
    // visível no log do servidor, que é onde ele pode ser consertado.
    console.error('[safra-ativa] falha ao consultar a safra mais recente', err)
    return json(null)
  }
}
