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
import { formatarDataPorExtenso, paraDataUTC } from '@/config/curso'

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

/**
 * O `price` do CONTRATO de uma inscrição — que nem sempre é o da safra.
 *
 * ============================================================
 * ⚠️ POR QUE ESTA FUNÇÃO EXISTE, SE `precoDaSafra` JÁ EXISTE
 * ============================================================
 *
 * Porque os dois números podem divergir, e quando divergem é a D-06 que
 * está em jogo. O caso concreto:
 *
 *   1. alguém abre o checkout por R$ 299,99 e não conclui — a inscrição
 *      fica em `pendente_pagamento`, com 299,99 travado na linha;
 *   2. a Giovanna sobe a safra para R$ 349,99;
 *   3. a pessoa volta pelo link de pagamento pendente (D-15).
 *
 * A `016` devolve o contrato DA LINHA, que continua sendo 299,99 —
 * `on conflict do nothing` não reescreve contrato. Se a sessão fosse
 * montada com o `price` da safra, a tela do Stripe cobraria 349,99 sobre
 * uma inscrição que registra 299,99: o painel diria um número e o cartão
 * seria debitado com outro, que é exatamente o desalinhamento que a
 * `015` existe para impedir do lado do banco.
 *
 * ============================================================
 * ⚠️ `lookup_key` E NÃO `products.create({ id })`
 * ============================================================
 *
 * `price` do Stripe não aceita id nosso — só `product` e `coupon` aceitam.
 * O que ele aceita é `lookup_key`, que é único na conta e, ao contrário
 * de `search`, é consultável por `list` — endpoint de listagem, sem a
 * consistência eventual de ~1 minuto do índice de busca. Dois checkouts
 * no mesmo minuto pelo mesmo valor encontram o mesmo `price`; com
 * `search`, criariam dois e nada reclamaria.
 *
 * A chave carrega o valor em CENTAVOS, e não um contador ou a data: é o
 * valor que define de qual `price` estamos falando, então derivá-la dele
 * torna a busca uma pergunta sobre o dado, e não sobre a ordem em que as
 * coisas aconteceram.
 *
 * ⚠️ ESTE `price` NUNCA É GRAVADO EM `safras.stripe_price_id`, e é por
 * isso que ele volta com `criado: false` mesmo quando acabou de nascer. O
 * campo significa "a coluna da safra está desatualizada" — e ela não
 * está: o `price` do contrato antigo não é o preço da safra, é o preço de
 * uma pessoa. Gravá-lo ali faria a próxima inscrita comprar pelo valor
 * velho.
 */
export async function precoDoContrato(
  safra: SafraParaPrice,
  valorMensalTravado: number,
): Promise<ResultadoPrice> {
  const centavosDoContrato = paraCentavos(valorMensalTravado)

  // O caso normal, que é a esmagadora maioria: o contrato é o preço da
  // safra. Delega, e o chamador persiste como sempre.
  if (centavosDoContrato === paraCentavos(safra.valor_mensal)) {
    return precoDaSafra(safra)
  }

  const lookupKey = `safra_${safra.id}_${centavosDoContrato}`

  const existentes = await stripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  })

  const achado = existentes.data[0]
  if (achado) return { priceId: achado.id, criado: false }

  const price = await stripe().prices.create({
    product: await produtoDaSafra(safra),
    currency: MOEDA,
    unit_amount: centavosDoContrato,
    recurring: { interval: 'month', interval_count: 1 },
    lookup_key: lookupKey,
    metadata: { safra_id: safra.id, contrato_travado: 'true' },
  })

  return { priceId: price.id, criado: false }
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

/**
 * O Stripe exige que `trial_end` esteja pelo menos 48 horas no futuro.
 *
 * ============================================================
 * ⚠️ NÃO É DETALHE DE VALIDAÇÃO: É UM CASO DE NEGÓCIO REAL
 * ============================================================
 *
 * A regra está escrita no próprio SDK ("Has to be at least 48 hours in the
 * future"), e ela morde num caso que vai acontecer: a safra começa a
 * cobrar na sexta e alguém se inscreve na quinta. Mandar o `trial_end`
 * assim mesmo faz o Stripe RECUSAR a criação da sessão — a pessoa clica
 * em "pagar" e não acontece nada, no dia em que ela finalmente decidiu
 * comprar.
 *
 * A alternativa escolhida é omitir o `trial_end` e deixar a cobrança
 * acontecer na hora. ⚠️ E isso É um débito imediato, o que a D-04
 * evita — então vale dizer exatamente por que aqui não a contradiz: a
 * D-04 existe para que quem se inscreve DOIS MESES ANTES não seja
 * debitada dois meses antes. Quem se inscreve a menos de 48 horas da
 * data de cobrança está sendo debitada, no máximo, dois dias antes do
 * que estava combinado — e a alternativa não é "debitar depois", é "não
 * vender".
 *
 * ⚠️ O QUE NÃO SE PODE FAZER É EMPURRAR A DATA. Um `trial_end = agora +
 * 48h` faria a primeira cobrança cair num dia que não é o da safra, e a
 * partir dali TODO o ciclo daquela assinatura ficaria deslocado — as
 * seis faturas em datas diferentes das de todo mundo, e a conta de
 * `cancel_at` (que sai de `data_primeira_cobranca`, não do que o Stripe
 * fez) apontando para o lugar errado. Melhor cobrar dois dias antes na
 * data certa do que na hora certa por seis meses errados.
 *
 * A margem é de 48 horas exatas, sem folga somada: quem inventa uma
 * folga "por segurança" está escolhendo, sem dizer, cobrar imediatamente
 * pessoas que o Stripe teria aceitado agendar.
 */
const HORAS_MINIMAS_DE_TRIAL = 48
const SEGUNDOS_POR_HORA = 3600

export function trialEhAceitavel(trialEnd: number, agoraEmSegundos: number): boolean {
  return trialEnd - agoraEmSegundos >= HORAS_MINIMAS_DE_TRIAL * SEGUNDOS_POR_HORA
}

// ============================================================
// A CHECKOUT SESSION
// ============================================================
//
// ⚠️⚠️ `cancel_at` NÃO EXISTE EM `subscription_data`, E A D-05 PRECISA
// SABER DISSO.
//
// A D-05 diz: "`cancel_at` na assinatura = `data_primeira_cobranca +
// duracao_meses`, **definido no momento da criação**". A intenção está
// inteira — nada de job nosso encerrando assinatura, porque job uma hora
// não roda e uma aluna é cobrada no 7º mês. O que não é possível é a
// LETRA: a API de Checkout Session não aceita `cancel_at` dentro de
// `subscription_data` (conferido no SDK instalado, `stripe@22.4.0`), e a
// assinatura é criada pelo Stripe, do lado de lá, quando a pessoa termina
// o pagamento. Não existe "o momento da criação" na nossa chamada.
//
// Onde ele é posto, então: no handler de `checkout.session.completed`
// (`c42`), que é o primeiro instante em que a assinatura existe e tem id.
// Uma chamada `subscriptions.update({ cancel_at })`, declarativa, uma vez
// só, e o Stripe cumpre sozinho a partir dali.
//
// ⚠️ ISSO NÃO É UM JOB, e a distinção é a decisão inteira. O que a D-05
// proíbe é código NOSSO AGENDADO — algo que precisa rodar em julho para
// que a assinatura pare em julho. Aqui o nosso código roda uma vez, em
// março, e depois disso o encerramento é obrigação do Stripe. A janela
// existe (entre a assinatura nascer e o webhook ser processado) e ela é
// de segundos, dentro do trial, sem cobrança nenhuma no meio.
//
// ⚠️ E É POR ISSO QUE O `c43` (`invoice.paid`) RECONFERE `cancel_at`. Se
// o webhook de `completed` falhar todas as reentregas — o único jeito de
// a assinatura ficar sem prazo —, a primeira fatura paga é a segunda
// chance de declarar o fim. Sem essa rede, a falha some por seis meses e
// reaparece como a sétima cobrança, que é exatamente a reclamação que a
// D-05 existe para evitar.
//
// O fallback nomeado pela própria D-05 (subscription schedule com
// `end_behavior: 'cancel'`) continua disponível e não foi usado porque
// não precisou: `cancel_at` dá conta, só não no lugar onde se imaginava
// que daria.

/** O que a sessão precisa saber, e nada além disso. */
export type SessaoDeCheckout = {
  /** `client_reference_id` — a linha de `inscricoes` que este pagamento paga. */
  inscricaoId: string
  /** O `price` da safra, já garantido por `precoDaSafra`. */
  priceId: string
  /** Para onde o Stripe manda a pessoa depois. Absolutas, montadas pela rota. */
  sucessoUrl: string
  canceladoUrl: string
  /**
   * E-mail da inscrita. Vai como `customer_email` para que ela não digite
   * de novo o que acabou de digitar — e para que a fatura chegue no
   * endereço que está na inscrição, e não num que ela invente na tela do
   * Stripe.
   */
  email: string
  /** Epoch de `ancorasDaAssinatura`. Omitido quando não passa no `trialEhAceitavel`. */
  trialEnd: number | null
  /**
   * `'YYYY-MM-DD'` da primeira cobrança, para a frase da tela do Stripe.
   *
   * ⚠️ É a MESMA data que virou `trialEnd`, e ela viaja também como string
   * porque epoch não se imprime. Vem do CONTRATO da inscrição (D-06), não
   * da safra — quem retomou um checkout antigo tem que ler a data que ela
   * combinou, não a de hoje.
   */
  dataPrimeiraCobranca: string
  /** `coupons.id` do Stripe, quando há cupom aplicado. Ver `cupomNoStripe`. */
  stripeCouponId?: string | null
  /**
   * `cupons.id` do NOSSO banco, quando há cupom aplicado.
   *
   * ⚠️ ELE VIAJA SÓ EM METADATA, e é assim que o webhook grava
   * `assinaturas.cupom_id` — que é FK para a nossa tabela, não para o
   * Stripe. A alternativa seria mapear de volta a partir do `coupon` do
   * Stripe fatiando o id `cupom_<uuid>`, ou seja, decidir identidade pelo
   * formato de uma string. Quem sabe qual cupom foi aplicado é quem o
   * aplicou; o resto é adivinhação com passo intermediário.
   */
  cupomId?: string | null
  /** Só para rastrear no Dashboard e conciliar depois. */
  safraId: string
}

/**
 * Cria a sessão hospedada e devolve a URL para a qual o navegador navega.
 *
 * ⚠️ `mode: 'subscription'` COM TRIAL É O QUE SALVA O CARTÃO SEM COBRAR
 * (D-04). Não é `mode: 'setup'` — aquilo salva o cartão e não cria
 * assinatura nenhuma, e alguém teria que criar a assinatura depois, o que
 * é código nosso agendado por outro nome. Aqui a assinatura nasce agora,
 * com a primeira fatura marcada para a data da safra.
 *
 * ⚠️ `payment_method_collection: 'always'` EXPLÍCITO, e não o default.
 * Com trial, o Stripe permite `'if_required'` — que pula a coleta do
 * cartão e cria a assinatura sem meio de pagamento. A tela ficaria mais
 * curta, a conversão subiria, e em setembro a primeira fatura falharia
 * para todo mundo de uma vez, sem cartão para tentar. O produto inteiro
 * depende de o cartão estar salvo HOJE.
 *
 * ⚠️ `allow_promotion_codes` FICA FORA, de propósito. Ele abre um campo
 * "código promocional" na tela do Stripe, e ali a pessoa pode digitar
 * qualquer promotion code que exista na conta — inclusive um que a
 * Giovanna criou para outra safra, ou um que vazou. Pela D-07 o cupom
 * nasce no nosso banco, é validado por nós (`c49`) e chega aqui já
 * resolvido em `discounts`. Um segundo caminho de desconto seria um
 * desconto que o painel não sabe explicar.
 *
 * ⚠️ SEM `idempotencyKey` DERIVADA DA INSCRIÇÃO, e a ausência é decisão.
 * Ela parece a resposta óbvia para "duplo clique cria duas sessões" — e
 * criaria um problema pior: a chave de idempotência do Stripe vive 24
 * horas, e a sessão também expira. Quem voltar no dia seguinte pelo link
 * de pagamento pendente (D-15) receberia de volta a sessão VELHA, já
 * expirada, e ficaria olhando para uma página do Stripe dizendo que o
 * link não vale mais — sem nenhuma forma de pedir outra. Duas sessões
 * abertas para a mesma inscrição não cobram duas vezes: a segunda que
 * for concluída encontra a assinatura já criada, e o webhook é
 * idempotente por construção (`014`).
 */
export async function criarSessaoDeCheckout(dados: SessaoDeCheckout): Promise<string> {
  const sessao = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: dados.priceId, quantity: 1 }],

    // ⚠️ ESTE É O FIO QUE LIGA O PAGAMENTO À INSCRIÇÃO. O webhook não
    // recebe nada nosso além do que puséssemos aqui: sem
    // `client_reference_id`, `checkout.session.completed` chega com um id
    // de sessão do Stripe e nenhuma forma de saber qual linha confirmar.
    // Casar por e-mail seria a alternativa, e é frágil pelo motivo de
    // sempre — a pessoa pode ter duas inscrições (safras diferentes), e o
    // e-mail não distingue qual delas foi paga.
    client_reference_id: dados.inscricaoId,
    customer_email: dados.email,

    success_url: dados.sucessoUrl,
    cancel_url: dados.canceladoUrl,

    // A tela do Stripe em português. Não é cosmético: é a única tela do
    // fluxo que não é nossa, e ela em inglês faz a pessoa achar que saiu
    // do site certo bem na hora de digitar o cartão.
    locale: 'pt-BR',

    payment_method_collection: 'always',

    subscription_data: {
      // Omitido quando falta menos de 48h — ver `trialEhAceitavel`.
      ...(dados.trialEnd !== null ? { trial_end: dados.trialEnd } : {}),
      // O mesmo par de metadados na assinatura, porque o webhook de
      // `invoice.paid` NÃO carrega `client_reference_id`: ele fala de
      // fatura e assinatura, não de sessão. Sem isto, o `c43` teria que
      // reconsultar a sessão para descobrir a inscrição.
      // ⚠️ `cupom_id` só entra quando existe. Metadata do Stripe não
      // aceita `null`, e uma string vazia seria pior: o webhook leria
      // `''` como valor presente e tentaria buscar um cupom de id vazio.
      metadata: {
        inscricao_id: dados.inscricaoId,
        safra_id: dados.safraId,
        ...(dados.cupomId ? { cupom_id: dados.cupomId } : {}),
      },
    },

    // `discounts` e não `allow_promotion_codes` — ver acima. Ausente
    // quando não há cupom: mandar `discounts: []` é diferente de não
    // mandar, e o Stripe trata a lista vazia como "remova todo desconto".
    ...(dados.stripeCouponId ? { discounts: [{ coupon: dados.stripeCouponId }] } : {}),

    // ============================================================
    // ⚠️ O TEXTO DA TELA DO STRIPE — o pouco que dá para controlar
    // ============================================================
    //
    // O Stripe renderiza o cabeçalho sozinho a partir do trial, e ele sai
    // **"Testar <nome do produto>"** com **"N dias grátis"**. Nenhum dos
    // dois é configurável, e os dois dizem a coisa errada: isto não é
    // período de avaliação, é matrícula com o cartão guardado (D-04).
    // Medido na primeira inscrição de verdade — "17 dias grátis" foi o que
    // apareceu.
    //
    // `custom_text.submit` é o texto NOSSO logo acima do botão de pagar, e
    // é o último lugar onde a pessoa lê alguma coisa antes de decidir. É o
    // ponto certo para desfazer o mal-entendido: nada é cobrado hoje, e a
    // data em que será é esta.
    //
    // ⚠️ A DATA SAI SECA AQUI, e é a única do modelo que pode. Cobrança
    // tem dia exato — o cartão é debitado no dia 26, não "na última semana
    // de agosto". É o oposto de `data_inicio_aulas`, que a D-14 manda
    // dizer por semana justamente porque cada grupo começa num dia
    // diferente. `formatarDataPorExtenso` existia desde o corte 1 esperando
    // exatamente este chamador; o comentário dela em `src/config/curso.ts`
    // diz isso com todas as letras.
    custom_text: {
      submit: {
        message:
          dados.trialEnd !== null
            ? `Seu cartão é salvo agora, sem nenhuma cobrança hoje. ` +
              `A primeira mensalidade é debitada em ` +
              `${formatarDataPorExtenso(paraDataUTC(dados.dataPrimeiraCobranca))}, ` +
              `quando a turma começa.`
            : // Sem trial: a data está a menos de 48h e o Stripe recusaria
              // agendar. A frase muda junto — prometer "nada hoje" aqui
              // seria mentira, e é a mentira que a pessoa descobre no
              // extrato. Ver `trialEhAceitavel`.
              `A primeira mensalidade é debitada agora, porque a turma já vai começar.`,
      },
      after_submit: {
        message: 'Você recebe a confirmação por e-mail em alguns minutos.',
      },
    },

    metadata: {
      inscricao_id: dados.inscricaoId,
      safra_id: dados.safraId,
    },
  })

  // ⚠️ `url` é `string | null` na tipagem, e o `null` acontece de verdade
  // — em sessões de `ui_mode: 'embedded'`, que não é o nosso caso. Tratar
  // como erro em vez de `!` porque um `null` aqui significaria que a
  // sessão foi criada e não tem para onde mandar a pessoa: a inscrição
  // ficaria em `pendente_pagamento` sem que ninguém soubesse por quê.
  if (!sessao.url) {
    throw new Error(`checkout.session ${sessao.id} criada sem url`)
  }

  return sessao.url
}

/**
 * Declara o fim da assinatura (D-05). Chamada uma vez, pelo webhook.
 *
 * ⚠️ IDEMPOTENTE POR CONSTRUÇÃO: mandar o mesmo `cancel_at` de novo é um
 * `update` com o valor que já está lá. É o que permite o `c43`
 * reconferir sem precisar perguntar antes se já foi posto — e perguntar
 * antes seria uma leitura a mais para decidir uma escrita que não custa
 * nada repetir.
 *
 * ⚠️ NÃO USE `cancel_at_period_end`. Ele encerra no fim do ciclo ATUAL —
 * ou seja, no mês que vem —, e não na data do fim do curso. Os dois
 * nomes se parecem e fazem coisas muito diferentes: um cancela em
 * outubro, o outro em fevereiro.
 */
export async function declararFimDaAssinatura(
  subscriptionId: string,
  cancelAt: number,
): Promise<void> {
  await stripe().subscriptions.update(subscriptionId, { cancel_at: cancelAt })
}

/**
 * Encerra a assinatura de quem cancelou a inscrição (`c73`, Fluxo 6).
 *
 * ============================================================
 * ⚠️ `cancel_at_period_end` E NÃO CANCELAMENTO IMEDIATO
 * ============================================================
 *
 * As duas formas param as cobranças futuras; a diferença é o que acontece
 * com o mês que a pessoa JÁ PAGOU.
 *
 *   `subscriptions.cancel()` mata a assinatura na hora. Quem pagou dia 5 e
 *     cancelou dia 20 perde os dez dias restantes do mês que comprou — e o
 *     sistema não faz reembolso (está fora de escopo, e reembolso de
 *     assinatura é o pior fluxo de suporte que existe, D-04).
 *
 *   `cancel_at_period_end` para no fim do ciclo pago. Nenhuma cobrança
 *     nova, e ninguém perde o que já comprou.
 *
 * A segunda é a leitura conservadora, e é a escolhida: cancelar não pode
 * significar "tomar de volta". ⚠️ **É uma decisão de negócio que o dono do
 * repositório não tomou explicitamente** — está registrada aqui e no
 * `ESTADO.md` para ser revista. Se a intenção for cortar o acesso na hora,
 * a troca é de uma linha, e o custo dela é o reembolso que ninguém quer
 * fazer.
 *
 * ⚠️ ELA NÃO É CHAMADA PELA ALOCAÇÃO. A D-03 proíbe qualquer chamada ao
 * Stripe nos handlers de alocação — arrastar alguém de segunda para quarta
 * não move dinheiro. Esta função pertence ao cancelamento, que é outro
 * ato, com outra tela e outra confirmação.
 *
 * ⚠️ IDEMPOTENTE: marcar de novo uma assinatura já marcada é um `update`
 * com o valor que já está lá. Cancelar duas vezes por engano no painel não
 * produz nada de novo.
 */
export async function encerrarAssinatura(subscriptionId: string): Promise<void> {
  await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true })
}

// ============================================================
// O CUPOM, ESPELHADO (D-07: nasce no nosso banco, nunca o contrário)
// ============================================================
//
// A direção é a mesma do `price`: o cupom existe na tabela `cupons` e
// esta camada garante que exista no Stripe um `coupon` que o represente.
// Cupom criado à mão no Dashboard não existe para o sistema — não aparece
// no painel, não tem contagem de uso, e a Giovanna não teria como saber
// que ele existe.
//
// ⚠️ A LEITURA DE `valor` MUDA CONFORME O `tipo`, e é a decisão mais
// fácil de errar deste projeto (está escrita assim na `013`):
//
//   primeiro_mes  → `valor` é PERCENTUAL   (20 = 20% no 1º mês)
//   todos_meses   → `valor` é PERCENTUAL   (15 = 15% em todas)
//   meses_gratis  → `valor` é CONTAGEM     (1 = 1 mês grátis)
//
// ⚠️ `meses_gratis` VIRA `percent_off: 100`, E NÃO `amount_off`. Um
// `amount_off` teria que ser o valor da mensalidade em centavos — o que
// obrigaria o cupom a conhecer o preço da safra, e o tornaria errado no
// dia em que o preço mudasse. 100% por N meses é a mesma coisa para a
// aluna e não depende de preço nenhum.
//
// ⚠️ `duration: 'forever'` em `todos_meses` NÃO É "para sempre" NA
// PRÁTICA, e é seguro exatamente por causa da D-05: a assinatura morre no
// 6º mês por `cancel_at`. "Para sempre" dura o que o contrato durar. A
// alternativa (`repeating` + `duration_in_months = duracao_meses`) faria
// o cupom depender da duração da safra e quebraria silenciosamente se uma
// safra tivesse duração diferente da que estava valendo quando ele foi
// criado.

/** O recorte de `cupons` que o espelho precisa. */
export type CupomParaEspelho = {
  id: string
  codigo: string
  tipo: string
  valor: number
}

/**
 * Cria no Stripe o `coupon` correspondente e devolve o id dele.
 *
 * ⚠️ O ID É DETERMINÍSTICO (`cupom_<uuid>`), pela mesma razão do
 * `produtoDaSafra`: `coupons.create({ id })` é a única forma idempotente
 * aqui. `coupons.list` com filtro por metadata tem consistência eventual
 * no índice de busca do Stripe, e dois cliques no mesmo minuto criariam
 * dois cupons para o mesmo registro sem que nada reclamasse.
 *
 * ⚠️ CUPOM DO STRIPE É IMUTÁVEL no que importa: `percent_off` e
 * `duration` não são editáveis. Editar o cupom no nosso painel depois de
 * espelhado precisa criar OUTRO no Stripe — e é por isso que o id carrega
 * o uuid da linha, e não o código digitável: mudar o código não deve
 * mudar a identidade do espelho.
 *
 * A validade (`expira_em`), o limite de usos (`usos_max`) e o vínculo com
 * a safra NÃO viajam para cá. Eles são regra NOSSA, verificada em `c49`
 * antes de a sessão ser criada. Espelhar `redeem_by` e `max_redemptions`
 * duplicaria a regra em dois sistemas, e um dia os dois discordam — com
 * o agravante de que o Stripe seria a versão que a aluna vê.
 */
export async function cupomNoStripe(cupom: CupomParaEspelho): Promise<string> {
  const cupomId = `cupom_${cupom.id}`

  try {
    await stripe().coupons.retrieve(cupomId)
    return cupomId
  } catch (err) {
    // Mesma regra do `produtoDaSafra`: só `resource_missing` vira "então
    // crie". Qualquer outro erro — chave inválida, rede, rate limit — TEM
    // que subir, para que o erro real não desapareça atrás de um segundo
    // erro sem relação nenhuma com a causa.
    if (
      !(err instanceof Stripe.errors.StripeInvalidRequestError) ||
      err.code !== 'resource_missing'
    ) {
      throw err
    }
  }

  // ⚠️ SEM `currency` AQUI, e a ausência não é esquecimento: `currency` só
  // faz sentido junto de `amount_off`, e os três tipos deste projeto são
  // percentuais (ver o bloco acima — `meses_gratis` é `percent_off: 100`).
  // Mandá-la junto de `percent_off` é pedir ao Stripe que interprete um
  // desconto de moeda que ninguém declarou.
  const comum = {
    id: cupomId,
    name: cupom.codigo,
    metadata: { cupom_id: cupom.id, codigo: cupom.codigo },
  }

  switch (cupom.tipo) {
    case 'primeiro_mes':
      await stripe().coupons.create({ ...comum, percent_off: cupom.valor, duration: 'once' })
      break

    case 'todos_meses':
      await stripe().coupons.create({ ...comum, percent_off: cupom.valor, duration: 'forever' })
      break

    case 'meses_gratis':
      await stripe().coupons.create({
        ...comum,
        percent_off: 100,
        duration: 'repeating',
        duration_in_months: cupom.valor,
      })
      break

    default:
      // ⚠️ Não é defensivo: é o `default` que impede um `tipo` novo de
      // virar cupom sem desconto. O CHECK da `013` restringe a coluna a
      // três valores, então chegar aqui significa que alguém acrescentou
      // um quarto no banco e não neste `switch` — e o desfecho silencioso
      // seria um `coupon` criado sem `percent_off`, que o Stripe aceita e
      // que não desconta nada. A aluna paga o valor cheio achando que
      // usou o cupom.
      throw new Error(`cupom ${cupom.id}: tipo desconhecido "${cupom.tipo}"`)
  }

  return cupomId
}

// ============================================================
// O WEBHOOK — a verificação de assinatura é o que separa "o Stripe
// disse" de "alguém disse"
// ============================================================
//
// ⚠️ SEM ISTO, A ROTA É UM ENDPOINT PÚBLICO ONDE QUALQUER UM DECLARA QUE
// UMA ASSINATURA FOI PAGA. Um POST com o corpo certo bastaria para pôr
// uma inscrição em `ativa`, sem um centavo ter saído de lugar nenhum. É a
// única defesa que existe ali — a rota não tem sessão, não tem allowlist,
// e é pública por obrigação (o Stripe precisa alcançá-la).
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

export class WebhookNotConfiguredError extends Error {
  constructor() {
    super('STRIPE_WEBHOOK_SECRET ausente no ambiente')
    this.name = 'WebhookNotConfiguredError'
  }
}

/**
 * Verifica a assinatura e devolve o evento. LANÇA se não conferir.
 *
 * ⚠️ O CORPO TEM QUE SER O TEXTO CRU, byte a byte. `await req.json()`
 * seguido de `JSON.stringify` produz uma string DIFERENTE — ordem de
 * chaves, espaços, escapes — e a verificação falha para eventos
 * perfeitamente legítimos. Quem chama passa `await req.text()`, e é por
 * isso que a rota não pode usar o corpo parseado antes desta linha.
 *
 * ⚠️ E ELA PROTEGE CONTRA REPLAY, não só contra forja. O `Stripe-
 * Signature` carrega um timestamp que entra no HMAC, e o SDK recusa
 * assinatura velha (tolerância default de 5 minutos). Um POST capturado e
 * reenviado amanhã não passa — o que importa porque a idempotência da
 * `014` protege contra reprocessar o MESMO evento, e não contra alguém
 * reenviar um evento antigo de propósito.
 *
 * O erro sobe. No webhook não há para onde degradar: assinatura que não
 * confere é 400, e o Stripe não reentrega 4xx — que é o certo, porque
 * reentregar um evento forjado não o tornaria verdadeiro.
 */
export function verificarEventoDoStripe(corpoCru: string, assinatura: string): Stripe.Event {
  if (!STRIPE_WEBHOOK_SECRET) throw new WebhookNotConfiguredError()

  return stripe().webhooks.constructEvent(corpoCru, assinatura, STRIPE_WEBHOOK_SECRET)
}
