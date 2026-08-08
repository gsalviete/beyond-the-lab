import type Stripe from 'stripe'
import {
  declararFimDaAssinatura,
  somarMeses,
  paraEpoch,
  stripe,
  StripeNotConfiguredError,
  verificarEventoDoStripe,
  WebhookNotConfiguredError,
} from '@/lib/stripe'
import {
  buscarAssinaturaPorSubscription,
  buscarTravadosDaInscricao,
  contarCicloPago,
  liberarEventoStripe,
  mudarStatusInscricao,
  registrarAssinatura,
  reservarEventoStripe,
  SupabaseNotConfiguredError,
} from '@/lib/supabase'

// ============================================================
// O WEBHOOK DO STRIPE — onde o dinheiro vira estado
// ============================================================
//
// Esta rota é pública por obrigação: o Stripe precisa alcançá-la, e não há
// como pôr sessão, allowlist ou token na frente dela. O que a protege é
// UMA coisa só — a verificação de assinatura do corpo (`c40`). Sem ela,
// qualquer POST com o formato certo põe uma inscrição em `ativa` sem um
// centavo ter saído de lugar nenhum.
//
// ⚠️ ESTA ROTA NÃO DEGRADA. É a exceção declarada ao REPORT §9.3, e a
// razão é simétrica à da rota de inscrição: lá, falhar em silêncio custa
// uma tela de erro para alguém que podia ter entrado na lista de espera;
// aqui, falhar em silêncio custa uma cobrança que aconteceu e que o
// sistema não registrou. Um evento que não pôde ser processado TEM que
// devolver 500, porque 500 é o que faz o Stripe reentregar. Engolir o
// erro transformaria uma cobrança perdida em silêncio permanente.
//
// ⚠️ E O CONTRÁRIO TAMBÉM VALE: nada aqui pode devolver 4xx por um
// problema NOSSO. O Stripe não reentrega 4xx — ele marca o evento como
// entregue e vai embora. 400 é só para o que nunca vai melhorar por ser
// tentado de novo: corpo sem assinatura, assinatura que não confere.
// ============================================================

// Nunca pré-renderizar nem cachear: cada requisição é um efeito.
export const dynamic = 'force-dynamic'

// ⚠️ Runtime Node explícito, e não o default implícito. A verificação de
// assinatura usa HMAC do `crypto` de Node; no runtime Edge o SDK exige a
// variante assíncrona (`constructEventAsync`) e a síncrona falha em tempo
// de execução. Deixar isso ao acaso significa descobrir que o webhook não
// funciona no dia em que alguém acrescentar `export const runtime = 'edge'`
// em outro arquivo e o default do projeto mudar junto.
export const runtime = 'nodejs'

/**
 * A resposta é sempre curta e nunca conta nada.
 *
 * O Stripe não lê o corpo — ele olha o status. O texto existe para quem
 * abre o log de entregas no Dashboard tentando entender o que aconteceu.
 */
function resposta(texto: string, status: number) {
  return new Response(texto, { status, headers: { 'content-type': 'text/plain' } })
}

export async function POST(req: Request) {
  const assinatura = req.headers.get('stripe-signature')

  if (!assinatura) {
    // Sem cabeçalho de assinatura não é o Stripe. 400 e ponto: reentregar
    // não vai fazer aparecer um cabeçalho que nunca existiu.
    console.error('[webhook] POST sem stripe-signature')
    return resposta('sem assinatura', 400)
  }

  // ⚠️ O CORPO CRU, byte a byte, e é por isso que ele é lido como TEXTO
  // antes de qualquer outra coisa. `await req.json()` seguido de
  // `JSON.stringify` produz uma string DIFERENTE — ordem de chaves,
  // espaços, escapes — e o HMAC deixa de conferir para eventos
  // perfeitamente legítimos. O corpo só vira objeto depois de verificado,
  // e o objeto vem do próprio SDK.
  const corpoCru = await req.text()

  let evento: Stripe.Event
  try {
    evento = verificarEventoDoStripe(corpoCru, assinatura)
  } catch (err) {
    if (err instanceof WebhookNotConfiguredError || err instanceof StripeNotConfiguredError) {
      // ⚠️ ESTE CASO É NOSSO, E POR ISSO É 500 E NÃO 400. Falta de env var
      // não é assinatura inválida: o evento é legítimo e vai poder ser
      // processado assim que a variável existir. Um 400 aqui faria o
      // Stripe desistir de um pagamento verdadeiro por causa de um deploy
      // mal configurado.
      console.error('[webhook]', err.message)
      return resposta('nao configurado', 500)
    }

    // Assinatura que não confere: forja, corpo alterado no caminho, ou
    // segredo errado dos dois lados. Nenhum deles melhora com reentrega.
    console.error('[webhook] assinatura invalida', err)
    return resposta('assinatura invalida', 400)
  }

  // ------------------------------------------------------------
  // A RESERVA — o insert vem ANTES de qualquer efeito (`014`, `c41`)
  //
  // Duas entregas do mesmo evento podem chegar simultaneamente, em duas
  // instâncias serverless diferentes. Quem decide qual delas processa é a
  // PRIMARY KEY de `eventos_stripe`, e não um `select` antes — o `select`
  // teria uma janela, e reentrega em rajada é o caso normal quando o
  // endpoint fica lento.
  // ------------------------------------------------------------
  let reservado: boolean
  try {
    reservado = await reservarEventoStripe({
      id: evento.id,
      tipo: evento.type,
      payload: evento,
    })
  } catch (err) {
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[webhook]', err.message)
    } else {
      console.error('[webhook] falha ao reservar o evento', evento.id, evento.type, err)
    }
    return resposta('falha ao reservar', 500)
  }

  if (!reservado) {
    // Reentrega de algo já processado. 200 — o Stripe cumpriu a parte
    // dele e não há nada a fazer. Este é o caminho que o `c46` exercita.
    console.info('[webhook] evento ja processado, ignorado', evento.id, evento.type)
    return resposta('ja processado', 200)
  }

  try {
    await processar(evento)
  } catch (err) {
    // ------------------------------------------------------------
    // ⚠️ A LIBERAÇÃO É O QUE IMPEDE A FALHA DE VIRAR SILÊNCIO ETERNO
    //
    // A reserva já está gravada. Se devolvêssemos 500 sem apagá-la, a
    // reentrega encontraria o evento como "já processado" e pularia — e o
    // efeito nunca aconteceria. Uma cobrança confirmada que não vira
    // `ativa`, para sempre, sem erro nenhum aparecendo depois da primeira
    // tentativa. Ver o bloco de `liberarEventoStripe`.
    // ------------------------------------------------------------
    console.error('[webhook] handler falhou', evento.id, evento.type, err)

    try {
      await liberarEventoStripe(evento.id)
    } catch (erroDaLiberacao) {
      // ⚠️ ISTO É PIOR DO QUE A FALHA ORIGINAL, e o log tem que dizer
      // isso: a reserva ficou de pé sem efeito correspondente, e a
      // reentrega vai pular o evento. A partir daqui só um reprocessamento
      // à mão resolve — o `payload` guardado na `014` existe exatamente
      // para esse dia.
      console.error(
        '[webhook] ⚠️ evento reservado SEM efeito e sem liberacao — reprocessar a mao:',
        evento.id,
        erroDaLiberacao,
      )
    }

    return resposta('falha ao processar', 500)
  }

  return resposta('ok', 200)
}

/**
 * O roteador dos eventos. Tudo que ele lança vira 500 + liberação.
 *
 * ⚠️ O `default` NÃO É ERRO. O Stripe manda muito mais tipo de evento do
 * que os quatro que nos interessam, e um endpoint configurado com "todos
 * os eventos" no Dashboard recebe dezenas por dia. Tratar o desconhecido
 * como falha faria o Stripe reentregar para sempre um `customer.updated`
 * que nunca vai ter handler.
 *
 * ⚠️ E ELE FICA REGISTRADO NA `eventos_stripe` MESMO ASSIM. Não é
 * desperdício: a tabela passa a ser o histórico completo do que a conta
 * viveu, e é ele que permite responder "o que aconteceu com esta aluna em
 * março" sem depender da janela de retenção do Dashboard.
 */
async function processar(evento: Stripe.Event): Promise<void> {
  switch (evento.type) {
    case 'checkout.session.completed':
      await sessaoConcluida(evento.data.object)
      break

    case 'invoice.paid':
      await faturaPaga(evento.data.object)
      break

    case 'invoice.payment_failed':
      await faturaRecusada(evento.data.object)
      break

    case 'customer.subscription.deleted':
      await assinaturaEncerrada(evento.data.object)
      break

    default:
      console.info('[webhook] evento sem handler, so registrado', evento.id, evento.type)
  }
}

/**
 * `checkout.session.completed` → a inscrição vira `confirmada` (`c42`).
 *
 * "Confirmada" significa: cartão salvo, assinatura criada, cobrança
 * agendada. NÃO significa que alguém pagou — pela D-04 ninguém foi
 * debitado ainda, e é `invoice.paid` que traz `ativa`. Os dois estados
 * existem separados justamente porque, entre um e outro, podem passar
 * dois meses.
 */
async function sessaoConcluida(sessao: Stripe.Checkout.Session): Promise<void> {
  const inscricaoId = sessao.client_reference_id
  const subscriptionId = idDe(sessao.subscription)
  const customerId = idDe(sessao.customer)

  if (!inscricaoId || !subscriptionId || !customerId) {
    // ⚠️ LANÇA, e não "ignora silenciosamente". Uma sessão concluída sem
    // um destes três é uma sessão que NÃO foi criada por
    // `criarSessaoDeCheckout` — alguém abriu um Payment Link no
    // Dashboard, por exemplo. O 500 e a reentrega não vão consertar isso,
    // mas o log é a única forma de alguém ficar sabendo que existe
    // dinheiro entrando por uma porta que o sistema não conhece.
    throw new Error(
      `sessao ${sessao.id} sem client_reference_id/subscription/customer — ` +
        'ela nao foi criada por este sistema',
    )
  }

  // ------------------------------------------------------------
  // D-05, CUMPRIDA AQUI — e o "aqui" é o ponto inteiro
  //
  // A decisão diz `cancel_at` "definido no momento da criação". A API de
  // Checkout Session não aceita `cancel_at` em `subscription_data` (ver o
  // bloco em `src/lib/stripe.ts`), e a assinatura nasce do lado do
  // Stripe: este é o primeiro instante em que ela existe e tem id.
  //
  // O que a D-05 proíbe é código NOSSO AGENDADO — algo que precise rodar
  // em julho para que a assinatura pare em julho, porque um dia ele não
  // roda e alguém é cobrada no 7º mês. Isto não é um job: roda uma vez,
  // agora, e depois o Stripe cumpre sozinho.
  //
  // ⚠️ A CONTA SAI DA INSCRIÇÃO, NUNCA DA SAFRA. Entre o checkout e este
  // webhook a Giovanna pode ter mudado preço ou duração; a assinatura que
  // está sendo criada é a do contrato que a pessoa aceitou (D-06). Ler da
  // safra faria a assinatura terminar num mês que ninguém combinou.
  // ------------------------------------------------------------
  const travados = await buscarTravadosDaInscricao(inscricaoId)

  if (
    !travados?.data_primeira_cobranca_travada ||
    travados.duracao_meses_travada === null
  ) {
    // Estado impossível pelo CHECK `inscricoes_paga_tem_travado_check` da
    // `015` — chegar aqui significa que a linha foi escrita por um caminho
    // que não passa pela `016`. É falha, não ausência.
    throw new Error(`inscricao ${inscricaoId} confirmada sem contrato travado`)
  }

  const cancelAt = paraEpoch(
    somarMeses(travados.data_primeira_cobranca_travada, travados.duracao_meses_travada),
  )

  // ⚠️ O STRIPE PRIMEIRO, O ESPELHO DEPOIS. Se o `update` do Stripe
  // falhar, nada foi gravado do nosso lado e a reentrega refaz tudo. Na
  // ordem inversa, o nosso banco afirmaria um `cancel_at` que a assinatura
  // não tem — e a diferença só apareceria na sétima cobrança.
  await declararFimDaAssinatura(subscriptionId, cancelAt)

  // Relemos a assinatura do Stripe em vez de deduzir o estado dela: o
  // `status` e o `trial_end` reais são os que o Stripe diz que são, e
  // acabamos de mexer no objeto.
  const assinatura = await stripe().subscriptions.retrieve(subscriptionId)

  await registrarAssinatura({
    inscricaoId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: sessao.id,
    statusStripe: assinatura.status,
    trialEnd: paraIso(assinatura.trial_end),
    cancelAt: paraIso(assinatura.cancel_at),
    // ⚠️ O cupom aplicado NÃO é lido do Stripe aqui. `assinaturas.cupom_id`
    // é FK para a NOSSA tabela, e o `coupon` do Stripe é o espelho dela
    // (D-07) — mapear de volta exigiria fatiar o id `cupom_<uuid>`, que é
    // decidir a identidade pelo formato de uma string. Quem sabe qual
    // cupom foi aplicado é a rota que criou a sessão, e é ela que vai
    // gravá-lo no `c49`.
    cupomId: null,
  })

  await mudarStatusInscricao(inscricaoId, 'confirmada')
}

/**
 * `invoice.paid` → `ativa`, e `ciclos_pagos` anda um (`c43`).
 *
 * ⚠️ ESTE HANDLER TAMBÉM RECONFERE `cancel_at`, e a rede não é zelo. Se
 * todas as reentregas de `checkout.session.completed` falharem — o único
 * jeito de uma assinatura ficar sem prazo —, a falha sumiria por seis
 * meses e reapareceria como a sétima cobrança, que é exatamente a
 * reclamação que a D-05 existe para evitar. A primeira fatura paga é a
 * segunda chance de declarar o fim, e `subscriptions.update` com o mesmo
 * valor é idempotente.
 */
async function faturaPaga(fatura: Stripe.Invoice): Promise<void> {
  const subscriptionId = subscriptionDaFatura(fatura)
  if (!subscriptionId) return // fatura avulsa, sem assinatura. Nada a fazer.

  const assinatura = await buscarAssinaturaPorSubscription(subscriptionId)

  if (!assinatura) {
    // ⚠️ ORDEM DE ENTREGA NÃO É GARANTIDA: `invoice.paid` pode chegar
    // antes de `checkout.session.completed`. O 500 devolve o evento para a
    // fila, e a reentrega (segundos depois) encontra a linha já criada.
    // Ignorar aqui perderia a contagem do primeiro mês em silêncio.
    throw new Error(
      `invoice ${fatura.id}: assinatura ${subscriptionId} ainda nao espelhada — ` +
        'evento fora de ordem, sera reentregue',
    )
  }

  if (assinatura.cancel_at === null) {
    const travados = await buscarTravadosDaInscricao(assinatura.inscricao_id)

    if (travados?.data_primeira_cobranca_travada && travados.duracao_meses_travada !== null) {
      const cancelAt = paraEpoch(
        somarMeses(travados.data_primeira_cobranca_travada, travados.duracao_meses_travada),
      )
      console.warn(
        '[webhook] assinatura sem cancel_at — declarando agora (rede da D-05)',
        subscriptionId,
      )
      await declararFimDaAssinatura(subscriptionId, cancelAt)
    }
  }

  // ⚠️ `false` do CAS NÃO É FALHA: significa que outra tentativa já somou
  // este ciclo. Refazer contaria duas vezes o mesmo mês, e a aluna que
  // pagou três apareceria com quatro — a D-05 passaria a encerrar cedo e
  // alguém deixaria de receber aula que pagou. Ver `contarCicloPago`.
  const somou = await contarCicloPago(assinatura.id, assinatura.ciclos_pagos)
  if (!somou) {
    console.warn('[webhook] ciclo ja contado por outra tentativa', fatura.id, subscriptionId)
  }

  await mudarStatusInscricao(assinatura.inscricao_id, 'ativa')
}

/**
 * `invoice.payment_failed` → `inadimplente` (`c44`).
 *
 * ⚠️ É O ÚNICO EVENTO QUE GRITA. O `c56` pendura o alerta por e-mail para
 * a Giovanna aqui — cobrança recusada é a única coisa neste fluxo que
 * exige uma pessoa fazer alguma coisa, e ela não tem como descobrir
 * sozinha: o Stripe avisa por e-mail a ALUNA, não a professora.
 */
async function faturaRecusada(fatura: Stripe.Invoice): Promise<void> {
  const subscriptionId = subscriptionDaFatura(fatura)
  if (!subscriptionId) return

  const assinatura = await buscarAssinaturaPorSubscription(subscriptionId)
  if (!assinatura) {
    throw new Error(
      `invoice ${fatura.id}: assinatura ${subscriptionId} ainda nao espelhada — ` +
        'evento fora de ordem, sera reentregue',
    )
  }

  await mudarStatusInscricao(assinatura.inscricao_id, 'inadimplente')
}

/**
 * `customer.subscription.deleted` → `concluida` ou `cancelada` (`c45`).
 *
 * ⚠️ OS DOIS DESTINOS SÃO A MESMA MENSAGEM DO STRIPE, E DISTINGUI-LOS É O
 * TRABALHO DESTE HANDLER. O Stripe manda o mesmo evento quando a
 * assinatura chega ao fim combinado e quando alguém a encerra antes — para
 * ele, as duas são "acabou".
 *
 * Para nós não são: `concluida` é uma aluna que cursou tudo, `cancelada` é
 * uma que saiu no meio. Confundi-las faria o painel mostrar como formada
 * quem desistiu no segundo mês.
 *
 * O sinal é `ended_at >= cancel_at`: a assinatura morreu na data que a
 * D-05 declarou. Qualquer encerramento anterior a essa data foi ato de
 * alguém — a Giovanna no painel (`c73`), ou o Stripe desistindo depois de
 * uma sequência de cobranças recusadas.
 *
 * ⚠️ Sem `cancel_at`, a resposta é `cancelada`. É a leitura conservadora:
 * uma assinatura que nunca teve prazo declarado não tem como ter chegado
 * ao fim dele, então ela foi interrompida. Chamar isso de `concluida`
 * afirmaria um curso completo sobre uma assinatura que o sistema nunca
 * soube quando deveria terminar.
 */
async function assinaturaEncerrada(sub: Stripe.Subscription): Promise<void> {
  const assinatura = await buscarAssinaturaPorSubscription(sub.id)
  if (!assinatura) {
    throw new Error(
      `subscription ${sub.id} encerrada mas nao espelhada — evento fora de ordem, ` +
        'sera reentregue',
    )
  }

  const chegouAoFim = sub.cancel_at !== null && sub.ended_at !== null && sub.ended_at >= sub.cancel_at

  await mudarStatusInscricao(assinatura.inscricao_id, chegouAoFim ? 'concluida' : 'cancelada')
}

// ------------------------------------------------------------
// Utilidades de leitura do evento
// ------------------------------------------------------------

/**
 * Um campo do Stripe que é `string | Objeto | null` vira o id, ou `null`.
 *
 * ⚠️ Esses campos SÃO expandíveis: `sessao.subscription` chega como string
 * normalmente e como objeto inteiro se alguém ligar `expand` na criação da
 * sessão ou no endpoint do webhook. Um `as string` funcionaria hoje e
 * viraria `"[object Object]"` no banco no dia em que alguém expandisse —
 * um id que não casa com nada e um erro que aparece meses depois.
 */
function idDe(campo: string | { id: string } | null | undefined): string | null {
  if (!campo) return null
  return typeof campo === 'string' ? campo : campo.id
}

/**
 * A assinatura de uma fatura.
 *
 * ⚠️ NÃO É `fatura.subscription`. O campo foi REMOVIDO da API do Stripe e
 * substituído por `parent.subscription_details.subscription` — e a versão
 * fixada deste projeto (ver `API_VERSION` em `src/lib/stripe.ts`) é
 * posterior à remoção. Escrever `fatura.subscription` aqui não compila, e
 * é bom que não compile: em JavaScript solto ele daria `undefined` e todo
 * `invoice.paid` viraria "fatura avulsa, nada a fazer" — silenciosamente,
 * para sempre.
 */
function subscriptionDaFatura(fatura: Stripe.Invoice): string | null {
  return idDe(fatura.parent?.subscription_details?.subscription)
}

/**
 * Epoch do Stripe (segundos) → ISO, que é o que o Postgres `timestamptz`
 * recebe.
 *
 * ⚠️ O STRIPE CONTA EM SEGUNDOS; O JAVASCRIPT, EM MILISSEGUNDOS. É a
 * mesma armadilha que `paraEpoch` documenta na direção contrária, e aqui
 * ela produziria uma data em 1970 — visível, ao menos, ao contrário do
 * ano 57000 que a outra direção produz.
 */
function paraIso(epoch: number | null | undefined): string | null {
  if (epoch === null || epoch === undefined) return null
  return new Date(epoch * 1000).toISOString()
}
