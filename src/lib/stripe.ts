// Acesso ao Stripe — EXCLUSIVAMENTE server-side.
//
// `server-only` faz o build quebrar se alguém importar este módulo de um
// client component. É a mesma rede de `src/lib/supabase.ts`, e aqui ela
// protege uma chave que move dinheiro: a `STRIPE_SECRET_KEY` cria
// clientes, assinaturas e cobranças. No bundle do navegador ela é um
// cartão de crédito aberto.
import 'server-only'
import Stripe from 'stripe'
// `curso.ts` é neutro — não toca `server-only` nem segredo —, então este
// módulo pode importá-lo. `paraDataUTC` é usado por `paraEpoch` lá
// embaixo, e a razão de reusar em vez de reescrever está lá.
import { paraDataUTC } from '@/config/curso'

// ============================================================
// A MESMA DISCIPLINA DA `service_role`, PELO MESMO MOTIVO
// ============================================================
//
//   - `import 'server-only'` é a PRIMEIRA linha de código do arquivo, e
//     não uma linha qualquer no meio;
//   - nenhuma variável tem prefixo `NEXT_PUBLIC_`, de propósito: o Next
//     só expõe ao cliente o que tem esse prefixo, e sem ele elas nunca
//     saem do servidor;
//   - **este arquivo é o único lugar do projeto que importa o SDK do
//     Stripe.** Ele é a fachada: quem precisa falar com o Stripe importa
//     uma função daqui, nunca `new Stripe(...)`. A proteção só vale
//     enquanto o número de lugares que conhecem a chave é um.
//
// ⚠️ NÃO EXISTE CHAVE PUBLICÁVEL NESTE PROJETO, e a ausência é desenho.
//
// A integração é Checkout Session hospedada: o servidor cria a sessão e
// devolve uma URL para a qual o navegador navega. Nenhum campo de cartão
// é renderizado por nós, nenhum `Stripe.js` é carregado, e por isso
// nenhuma `pk_test_`/`pk_live_` precisa existir. Se um dia alguém
// acrescentar `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` ao projeto, a
// pergunta certa antes de aceitar é "por que estamos coletando cartão na
// nossa página?" — porque a resposta muda o escopo de PCI inteiro.
// ============================================================
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

export class StripeNotConfiguredError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY ausente no ambiente')
    this.name = 'StripeNotConfiguredError'
  }
}

// ============================================================
// ⚠️ A VERSÃO DA API É FIXADA, E ISSO NÃO É CERIMÔNIA
// ============================================================
//
// Sem `apiVersion`, o SDK usa a versão default da CONTA — um valor que
// vive no Dashboard do Stripe e que alguém pode mudar clicando num botão,
// meses depois, sem tocar neste repositório. O efeito seria uma mudança
// de comportamento em produção sem nenhum commit associado: exatamente a
// classe de problema do incidente da `004` (o banco andou, a aplicação
// não, ninguém tinha como saber), com o Stripe no lugar do banco.
//
// Fixada aqui, a versão é dado versionado. Subir de versão passa a ser um
// commit, com diff, revisável — e o `stripe` do package.json e este
// literal sobem juntos ou o TypeScript reclama.
//
// ⚠️ `satisfies Stripe.LatestApiVersion` é o que torna isso mecânico em
// vez de disciplinado: se um `npm update stripe` trouxer um SDK que fala
// outra versão, este literal para de compilar e a atualização vira uma
// decisão consciente. Sem o `satisfies`, o SDK novo e a versão velha
// conviveriam em silêncio — que é o pior dos dois mundos, porque o
// TypeScript teria como avisar e não avisaria.
const API_VERSION = '2026-07-29.dahlia' satisfies Stripe.LatestApiVersion

let cliente: Stripe | null = null

/**
 * O cliente do Stripe, criado uma vez por processo.
 *
 * ⚠️ LANÇA se a chave não estiver no ambiente, e o `throw` é o
 * comportamento certo — mas quem chama precisa decidir o que fazer com
 * ele, e a decisão NÃO é a mesma em todo lugar:
 *
 *   - na rota de inscrição, falta de Stripe tem para onde degradar: a
 *     pessoa cai em lista de espera, que é uma verdade menor mas é uma
 *     verdade (REPORT §9.3). Ela NUNCA pode ver tela de erro por causa
 *     disto;
 *   - no webhook, não tem: um evento que não pôde ser processado precisa
 *     devolver 500 para o Stripe reentregar. Engolir o erro ali
 *     transformaria uma cobrança perdida em silêncio.
 *
 * Por isso este módulo não decide nada: ele lança um erro NOMEADO, e cada
 * chamador trata segundo a própria regra. Um fallback aqui dentro
 * imporia a política errada a metade dos chamadores.
 *
 * ⚠️ O cache em `cliente` é por PROCESSO, e em serverless isso significa
 * "por instância quente". Não é otimização importante — o SDK é barato de
 * construir — mas mantém `maxNetworkRetries` e a versão da API idênticos
 * em toda chamada, que é o que interessa.
 */
export function stripe(): Stripe {
  if (!STRIPE_SECRET_KEY) throw new StripeNotConfiguredError()

  if (cliente) return cliente

  cliente = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: API_VERSION,

    // ⚠️ RETRY AUTOMÁTICO SÓ É SEGURO PORQUE O SDK MANDA CHAVE DE
    // IDEMPOTÊNCIA SOZINHO nas requisições que escrevem. Sem isso, uma
    // resposta perdida no caminho de volta viraria uma SEGUNDA assinatura
    // criada para a mesma pessoa — o retry não sabe que a primeira deu
    // certo.
    //
    // 2 e não 0: a rede da Vercel para o Stripe falha de vez em quando, e
    // uma sessão de checkout que não abre é uma venda perdida em silêncio.
    // 2 e não 5: acima disso a pessoa está olhando para um botão travado,
    // e a espera vira um problema pior que a falha.
    maxNetworkRetries: 2,
  })

  return cliente
}

/**
 * Reais (o que vem do banco) → centavos (o que o Stripe cobra).
 *
 * ============================================================
 * ⚠️ POR QUE ISTO NÃO É `valor * 100`
 * ============================================================
 *
 * `valor_mensal` é `numeric(10,2)` no Postgres e chega como NÚMERO JSON
 * pelo PostgREST — medido: `299.99`. Um `299.99 * 100` em ponto flutuante
 * dá `29998.999999999996`, e o Stripe recusa não-inteiro. O `Math.round`
 * não é defensivo: ele é a conversão.
 *
 * O comentário de `formatarValorMensal` em `src/config/curso.ts` já
 * avisava que aritmética de dinheiro não acontece em float e que "a
 * conversão para inteiro é do corte 2, no ponto que monta a Checkout
 * Session". É este ponto. Aqui, e em nenhum outro lugar.
 *
 * ⚠️ A CONVERSÃO ACONTECE UMA VEZ SÓ, na fronteira. Depois daqui o valor
 * é centavo inteiro e permanece inteiro — não volta para reais, não é
 * somado a nada em float, não é reconvertido para exibir. O que a tela
 * mostra sai de `formatarValorMensal` a partir do valor do BANCO, não
 * deste. Duas conversões em direções opostas é como se descobre, meses
 * depois, que alguém está pagando um centavo a menos.
 */
export function paraCentavos(reais: number): number {
  return Math.round(reais * 100)
}

/**
 * `Date`/data-do-Postgres → segundos do epoch, que é o que o Stripe usa.
 *
 * ⚠️ O STRIPE CONTA EM SEGUNDOS; O JAVASCRIPT, EM MILISSEGUNDOS. Mandar
 * `Date.now()` cru num `trial_end` é a forma mais fácil de agendar a
 * primeira cobrança para o ano 57000 — e o Stripe ACEITA, porque é um
 * inteiro válido. A falha não aparece na criação: aparece quando a
 * cobrança não acontece, meses depois, e ninguém liga uma coisa à outra.
 *
 * Recebe a string `'YYYY-MM-DD'` do Postgres, não um `Date`, e por isso
 * passa por `paraDataUTC` — a mesma ponte que `src/config/curso.ts`
 * documenta. `new Date('2026-09-01')` interpretado no fuso do Brasil
 * volta como 31/08, e um dia a menos num `trial_end` é uma cobrança um
 * dia adiantada na fatura de alguém.
 */
export function paraEpoch(isoDate: string): number {
  return Math.floor(paraDataUTC(isoDate).getTime() / 1000)
}

// ============================================================
// O `price` DA SAFRA (D-07: nasce no nosso banco, é espelhado no Stripe)
// ============================================================
//
// A direção é uma só, e nunca a inversa: a safra existe no Postgres, e
// esta camada garante que exista no Stripe um `price` que a represente.
// `price` criado à mão no Dashboard não existe para o sistema.
//
// ⚠️ A DURAÇÃO **NÃO** ENTRA NO PRICE, e é o erro mais natural de
// cometer aqui. Não existe "preço de 6 meses" no Stripe: o `price` é
// mensal e recorrente, e o que faz a assinatura terminar no 6º mês é o
// `cancel_at` posto na criação da assinatura (D-05). Modelar a duração
// como `interval_count: 6` cobraria seis mensalidades de uma vez, e
// modelá-la como um `price` de valor sextuplicado cobraria tudo à vista.
// As duas leituras estão erradas pelo mesmo motivo: `duracao_meses` é
// prazo de contrato, não unidade de cobrança.
// ============================================================

/** A moeda é fixa, e o produto é vendido só no Brasil. */
const MOEDA = 'brl'

/**
 * O que esta camada precisa saber de uma safra para espelhá-la.
 *
 * Recorte deliberado, e não `Tables<'safras'>` inteiro: `valor_mensal` é
 * o único número que atravessa para o Stripe, e nem `duracao_meses` nem
 * as datas têm o que fazer num `price` (ver o cabeçalho). Um tipo largo
 * aqui convidaria a mandar mais do que o necessário para fora.
 */
export type SafraParaPrice = {
  id: string
  nome: string
  valor_mensal: number
  stripe_price_id: string | null
}

export type ResultadoPrice = {
  /** O `price` a usar na Checkout Session. */
  priceId: string
  /**
   * `true` quando um `price` NOVO foi criado e a coluna
   * `safras.stripe_price_id` está desatualizada. Quem persiste é o
   * chamador — ver `salvarStripePriceId` em `src/lib/supabase.ts`.
   */
  criado: boolean
}

/**
 * O `product` da safra, com id DETERMINÍSTICO.
 *
 * ⚠️ `products.create({ id })` É A ÚNICA FORMA IDEMPOTENTE AQUI, e as
 * alternativas todas falham de um jeito silencioso:
 *
 *   - `products.search({ query: "metadata['safra_id']:'...'" })` parece
 *     a resposta certa e tem CONSISTÊNCIA EVENTUAL: o índice de busca do
 *     Stripe leva cerca de um minuto para enxergar um objeto recém-criado.
 *     Duas inscrições no mesmo minuto criariam dois `product` para a
 *     mesma safra, e nada reclamaria;
 *   - guardar o id do produto numa coluna nova exigiria migração, e a
 *     coluna seria uma segunda fonte de verdade para algo que o próprio
 *     id já expressa;
 *   - `price.product_data` (criar produto junto do preço) cria um
 *     produto NOVO a cada mudança de valor, e o Dashboard vira uma lista
 *     de produtos homônimos.
 *
 * O id derivado do uuid da safra é estritamente consistente: `retrieve`
 * ou acha, ou devolve `resource_missing`. Não há janela.
 */
async function produtoDaSafra(safra: SafraParaPrice): Promise<string> {
  const produtoId = `safra_${safra.id}`

  try {
    await stripe().products.retrieve(produtoId)
    return produtoId
  } catch (err) {
    // ⚠️ Só `resource_missing` vira "então crie". Qualquer outro erro —
    // chave inválida, rede, rate limit — TEM que subir: tratá-lo como
    // "não existe" faria uma falha de autenticação virar uma tentativa
    // de criar um produto que já existe, e o erro real desapareceria
    // atrás de um segundo erro sem relação nenhuma com a causa.
    if (!(err instanceof Stripe.errors.StripeInvalidRequestError) || err.code !== 'resource_missing') {
      throw err
    }
  }

  await stripe().products.create({
    id: produtoId,
    name: safra.nome,
    // O uuid da safra também vai para metadata, e não só para o id. O id
    // é nosso e legível; o metadata é o que uma consulta futura no
    // Stripe (relatório, conciliação) usa sem ter que fatiar string.
    metadata: { safra_id: safra.id },
  })

  return produtoId
}

/**
 * Garante que existe no Stripe um `price` mensal que representa esta
 * safra, e devolve o id a usar.
 *
 * ============================================================
 * ⚠️ `price` DO STRIPE É IMUTÁVEL. MUDAR O VALOR CRIA OUTRO.
 * ============================================================
 *
 * Não existe "atualizar o preço": `unit_amount` não é editável, por
 * desenho do Stripe. Quando a Giovana muda `valor_mensal` no painel,
 * esta função cria um `price` novo e o chamador grava o id.
 *
 * ⚠️ E ISSO É EXATAMENTE O QUE A D-06 QUER. O `price` antigo continua
 * existindo e continua sendo o que as assinaturas já criadas cobram —
 * quem assinou por R$ 299,99 segue pagando R$ 299,99 depois de a safra
 * passar a valer R$ 349,99. A imutabilidade do Stripe não é obstáculo
 * aqui: é a mesma garantia que `valor_mensal_travado` dá do nosso lado,
 * vinda de graça do outro.
 *
 * ⚠️ POR ISSO O `price` ANTIGO NÃO É APAGADO NEM ARQUIVADO. Ele é o
 * contrato de quem já paga. Arquivar não cancela assinatura nenhuma, mas
 * é a única operação deste arquivo que chega perto de tocar em quem já
 * comprou — e não há nada a ganhar com ela. Preço velho fica.
 *
 * A comparação é feita contra o `price` REAL no Stripe, e não contra o
 * que a nossa coluna diz que ele é: a coluna pode estar apontando para
 * um `price` de outro valor se alguém editou algo pelo Dashboard, e o
 * único jeito de descobrir isso é perguntando.
 */
export async function precoDaSafra(safra: SafraParaPrice): Promise<ResultadoPrice> {
  const centavos = paraCentavos(safra.valor_mensal)

  if (safra.stripe_price_id) {
    try {
      const atual = await stripe().prices.retrieve(safra.stripe_price_id)

      const confere =
        atual.active &&
        atual.unit_amount === centavos &&
        atual.currency === MOEDA &&
        atual.recurring?.interval === 'month' &&
        atual.recurring?.interval_count === 1

      if (confere) return { priceId: atual.id, criado: false }
    } catch (err) {
      // Mesma regra do `produtoDaSafra`: só "sumiu" justifica seguir e
      // criar outro. O resto sobe.
      if (
        !(err instanceof Stripe.errors.StripeInvalidRequestError) ||
        err.code !== 'resource_missing'
      ) {
        throw err
      }
    }
  }

  const price = await stripe().prices.create({
    product: await produtoDaSafra(safra),
    currency: MOEDA,
    unit_amount: centavos,
    // Mensal e recorrente. A duração do curso NÃO mora aqui — ver o
    // cabeçalho desta seção.
    recurring: { interval: 'month', interval_count: 1 },
    metadata: { safra_id: safra.id },
  })

  return { priceId: price.id, criado: true }
}

// ============================================================
// A CONTA DO PRAZO — 6 débitos, não 7
// ============================================================
//
// É a conta que evita a reclamação de julho, e o `04-PLANO.md` reserva um
// teste só para ela (`c47`). Escrita por extenso, com T = a data da
// primeira cobrança:
//
//   trial termina em T   →  fatura 1 em T
//                           fatura 2 em T + 1 mês
//                           ...
//                           fatura 6 em T + 5 meses  (cobre até T + 6)
//
//   logo:  cancel_at = T + 6 meses
//
// O erro natural é `T + 5`, por contar os intervalos em vez das faturas,
// e ele cobraria cinco meses de um curso de seis. O erro oposto —
// `T + 7`, por somar um mês "de folga" — é o que produz a sétima
// cobrança, que é a que gera reclamação e pedido de reembolso.
//
// ⚠️ `cancel_at` é posto na CRIAÇÃO da assinatura (D-05) e o Stripe
// cumpre sozinho. Não existe job nosso encerrando assinatura: job uma
// hora não roda, e uma aluna é cobrada no 7º mês.

/**
 * Soma meses a uma data `'YYYY-MM-DD'` do Postgres, em UTC.
 *
 * ⚠️ NÃO EXISTE `setMonth` SEGURO SEM TRATAR O ESTOURO DE DIA, e este é
 * o bug clássico de aritmética de calendário:
 *
 *   31/01 + 1 mês  →  `setMonth` produz 31/02, que o JavaScript
 *                     "corrige" para 03/03. Um mês inteiro a mais.
 *
 * Para uma `data_primeira_cobranca` isso significaria a assinatura
 * terminando um mês depois do combinado — a sétima cobrança, chegando
 * pela porta dos fundos. Aqui o dia é GRAMPEADO no último dia do mês de
 * destino: 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto).
 *
 * ⚠️ A data entra como string e sai como string, sem nunca virar `Date`
 * local. `new Date('2026-09-01')` lido no fuso do Brasil é 31/08 — ver
 * `paraDataUTC` em `src/config/curso.ts`. Um dia a menos aqui é uma
 * cobrança um dia adiantada na fatura de alguém.
 */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)

  // Mês 0-indexado para a conta, e de volta para 1-indexado no fim.
  const totalDeMeses = (mes - 1) + meses
  const anoDestino = ano + Math.floor(totalDeMeses / 12)
  const mesDestino = ((totalDeMeses % 12) + 12) % 12

  // Dia 0 do mês SEGUINTE é o último dia do mês de destino — a forma
  // idiomática de perguntar "quantos dias tem este mês?" sem tabela nem
  // regra de ano bissexto escrita à mão.
  const ultimoDia = new Date(Date.UTC(anoDestino, mesDestino + 1, 0)).getUTCDate()

  const diaDestino = Math.min(dia, ultimoDia)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${anoDestino}-${pad(mesDestino + 1)}-${pad(diaDestino)}`
}

/**
 * As duas âncoras temporais da assinatura, em epoch, prontas para o
 * Stripe.
 *
 * Separada da montagem da sessão de propósito: é a única parte deste
 * arquivo que dá para testar sem rede, e é onde está o risco real. A
 * montagem da sessão é encanamento; esta conta é dinheiro.
 */
export function ancorasDaAssinatura(safra: {
  data_primeira_cobranca: string
  duracao_meses: number
}): { trialEnd: number; cancelAt: number } {
  return {
    // D-04: a aluna confirma o cartão hoje e não é debitada até aqui.
    trialEnd: paraEpoch(safra.data_primeira_cobranca),
    // D-05: a assinatura morre sozinha. Ver a conta acima.
    cancelAt: paraEpoch(somarMeses(safra.data_primeira_cobranca, safra.duracao_meses)),
  }
}
