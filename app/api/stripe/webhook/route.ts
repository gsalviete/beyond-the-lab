import type Stripe from 'stripe'
import {
  declararFimDaAssinatura,
  declararParcelamento,
  fimDoContrato,
  precosDoParcelado,
  stripe,
  StripeNotConfiguredError,
  verificarEventoDoStripe,
  WebhookNotConfiguredError,
} from '@/lib/stripe'
import { alertarCobrancaFalhada, confirmarInscricao } from '@/lib/email'
import {
  buscarAssinaturaPorSubscription,
  buscarCupomPorId,
  buscarInscricaoParaEmail,
  buscarSafraDaInscricao,
  buscarTravadosDaInscricao,
  contarUsoDeCupom,
  contarCicloPago,
  contratoDosTravados,
  liberarEventoStripe,
  mudarStatusInscricao,
  registrarAssinatura,
  registrarPagamentoPix,
  reservarEventoStripe,
  SupabaseNotConfiguredError,
  type ContratoTravado,
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
    // ------------------------------------------------------------
    // ⚠️ O CONTEXTO RASTREÁVEL (`c57`) — o que torna este log utilizável
    //
    // Um `console.error(err)` seco produz um stack trace sem dono: não dá
    // para dizer QUAL evento falhou, nem correlacionar com o Dashboard do
    // Stripe, que é onde a outra metade da história está.
    //
    // ⚠️ `requestId` É O CAMPO QUE FECHA A PONTE. Todo erro do SDK do
    // Stripe carrega o id da requisição (`req_...`), e é por ele que o
    // suporte do Stripe encontra a chamada exata nos logs deles. Sem esse
    // id, uma investigação vira "aconteceu por volta das 14h" — com ele, é
    // uma linha. Ele não existe em erro que não seja do Stripe, e por isso
    // entra como opcional em vez de virar `unknown` no meio da mensagem.
    // ------------------------------------------------------------
    console.error('[webhook] handler falhou', {
      evento: evento.id,
      tipo: evento.type,
      requestId: (err as { requestId?: string })?.requestId,
      erro: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })

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

    // ------------------------------------------------------------
    // OS TRÊS DO PIX (D-17) — o dono do repositório os acrescentou ao
    // endpoint no Dashboard em 20/10/2026
    //
    // ⚠️ PIX É ASSÍNCRONO: `checkout.session.completed` chega quando a
    // pessoa VÊ o QR, e o dinheiro chega depois, por
    // `async_payment_succeeded`. Ver o bloco do Pix em `src/lib/stripe.ts`.
    // ------------------------------------------------------------
    case 'checkout.session.async_payment_succeeded':
      await pixPago(evento.data.object)
      break

    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      sessaoSemPagamento(evento.type, evento.data.object)
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
  // ⚠️ SESSÃO DE PAGAMENTO ÚNICO É O PIX (D-17), e ela não tem assinatura
  // para confirmar. Sem este desvio, a falta de `subscription` abaixo
  // seria lida como "sessão criada fora do sistema" e o evento lançaria —
  // o Stripe reentregaria um Pix legítimo para sempre.
  if (sessao.mode === 'payment') return pixConcluido(sessao)

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
  const contrato = contratoDosTravados(await buscarTravadosDaInscricao(inscricaoId))

  if (!contrato) {
    // Estado impossível pelo CHECK `inscricoes_paga_tem_travado_check` da
    // `015` — chegar aqui significa que a linha foi escrita por um caminho
    // que não passa pela `016`/`022`. É falha, não ausência.
    throw new Error(`inscricao ${inscricaoId} confirmada sem contrato travado`)
  }

  // ⚠️ O STRIPE PRIMEIRO, O ESPELHO DEPOIS. Se o `update` do Stripe
  // falhar, nada foi gravado do nosso lado e a reentrega refaz tudo. Na
  // ordem inversa, o nosso banco afirmaria um `cancel_at` que a assinatura
  // não tem — e a diferença só apareceria na sétima cobrança.
  //
  // ⚠️ DESDE A D-17, "DECLARAR O FIM" DEPENDE DA FORMA — e quem decide é o
  // contrato da LINHA, não o metadata da sessão. Ver `declararFim`.
  await declararFim(subscriptionId, inscricaoId, contrato)

  // Relemos a assinatura do Stripe em vez de deduzir o estado dela: o
  // `status` e o `trial_end` reais são os que o Stripe diz que são, e
  // acabamos de mexer no objeto.
  const assinatura = await stripe().subscriptions.retrieve(subscriptionId)

  // ⚠️ O CUPOM VEM DO NOSSO METADATA, e não do `discount` do Stripe.
  // `assinaturas.cupom_id` é FK para a NOSSA tabela; o `coupon` do Stripe
  // é o espelho dela (D-07). Mapear de volta exigiria fatiar o id
  // `cupom_<uuid>` — decidir identidade pelo formato de uma string, que
  // quebra no dia em que o formato mudar. Quem sabe qual cupom foi
  // aplicado é a rota que o aplicou, e ela o carimbou aqui.
  const cupomId = assinatura.metadata?.cupom_id || null

  await registrarAssinatura({
    inscricaoId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: sessao.id,
    statusStripe: assinatura.status,
    trialEnd: paraIso(assinatura.trial_end),
    cancelAt: paraIso(assinatura.cancel_at),
    cupomId,
  })

  await mudarStatusInscricao(inscricaoId, 'confirmada')

  // ------------------------------------------------------------
  // O USO DO CUPOM — contado no PAGAMENTO, não na abertura do checkout
  //
  // ⚠️ Contar ao criar a sessão gastaria o cupom de quem abriu a tela e
  // desistiu: um cupom de 10 usos se esgotaria com 10 pessoas curiosas e
  // zero vendas.
  //
  // ⚠️ E A FALHA AQUI NÃO VIRA 500. O pagamento aconteceu, a inscrição já
  // está `confirmada`, e devolver 500 faria o Stripe reentregar o evento
  // inteiro para corrigir um CONTADOR. A contagem é informação de painel;
  // o desconto já foi dado pelo Stripe de qualquer forma. O CHECK
  // `cupons_usos_check` da `013` é quem impede o número de ficar
  // impossível — ele recusa `usos_atuais > usos_max`, e a recusa vira este
  // log em vez de uma contagem mentirosa.
  // ------------------------------------------------------------
  if (cupomId) {
    try {
      const registro = await buscarCupomPorId(cupomId)

      if (!registro) {
        console.error('[webhook] cupom do metadata nao existe mais', cupomId)
      } else if (!(await contarUsoDeCupom(registro.id, registro.usos_atuais))) {
        console.warn('[webhook] uso de cupom ja contado por outra tentativa', cupomId)
      }
    } catch (err) {
      console.error('[webhook] falha ao contar o uso do cupom', cupomId, err)
    }
  }

  // ------------------------------------------------------------
  // O E-MAIL DA ALUNA — e ele sai AQUI, e não no insert
  //
  // ⚠️ A ROTA DE INSCRIÇÃO DEIXOU DE MANDÁ-LO no `c35`, e o motivo é a
  // D-02: pagar é o que faz entrar. Uma confirmação disparada no momento
  // do insert diria "sua inscrição está confirmada" para alguém que ainda
  // ia digitar o cartão — e que pode fechar a aba. Este é o primeiro
  // instante em que a frase é verdade.
  //
  // ⚠️ POR ÚLTIMO, DEPOIS DE TODAS AS ESCRITAS, e não é ordem estética. O
  // e-mail não pode ser mandado por um handler que ainda vai falhar: se
  // ele saísse antes de `mudarStatusInscricao` e o `update` quebrasse, o
  // 500 faria o Stripe reentregar, a reserva seria liberada, e a segunda
  // passagem mandaria um SEGUNDO e-mail para a mesma pessoa. Aqui, tudo
  // que podia falhar já falhou.
  //
  // ⚠️ E ELE NÃO PODE DERRUBAR O PAGAMENTO. Nenhuma função de
  // `src/lib/email.ts` lança, por contrato escrito no topo daquele arquivo
  // — mas a LEITURA que monta o payload lança, e por isso ela tem try
  // próprio. Um Resend fora do ar, ou uma linha herdada da `010` sem
  // perfil, viraria 500 aqui e o Stripe reentregaria um evento cujo efeito
  // financeiro inteiro já aconteceu: a inscrição voltaria a ser processada
  // do zero para reenviar um e-mail. Falha de e-mail é log, não reentrega.
  //
  // ⚠️ SEM `after()`, ao contrário da rota de inscrição. Lá o `after`
  // existe para a pessoa ver a tela de sucesso sem esperar o Resend; aqui
  // não há ninguém esperando — o Stripe não lê nem o corpo nem o tempo de
  // resposta, dentro do timeout dele. E `after` num handler que pode
  // devolver 500 agendaria e-mail para um evento que vai ser reentregue.
  // ------------------------------------------------------------
  try {
    const paraEmail = await buscarInscricaoParaEmail(inscricaoId)

    if (!paraEmail) {
      console.error(
        '[webhook] inscricao confirmada sem perfil completo — e-mail nao enviado',
        inscricaoId,
      )
      return
    }

    await confirmarInscricao(
      {
        name: paraEmail.nome,
        email: paraEmail.email,
        phone: paraEmail.telefone,
        nivel_ingles: paraEmail.nivel_ingles,
        curso: paraEmail.curso,
        periodo: paraEmail.periodo,
        disponibilidade: paraEmail.disponibilidade,
      },
      paraEmail.safra,
      // D-17: o e-mail diz o que foi combinado — a forma e o valor da
      // LINHA, nunca os da safra.
      paraEmail.contrato,
    )
  } catch (err) {
    console.error('[webhook] falha ao enviar a confirmacao', inscricaoId, err)
  }
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

  // ⚠️ NO PARCELADO, `cancel_at` NULO É O ESTADO NORMAL, e a rede não pode
  // tratá-lo como falha. Quem decide o fim do parcelado é o schedule
  // (D-17), e o Stripe só preenche `cancel_at` quando a assinatura entra
  // na fase final. Pôr `cancel_at` à mão numa assinatura com schedule é
  // recusado pelo Stripe — o 500 viraria reentrega eterna, e nenhum ciclo
  // seria contado. A rede do parcelado é outra: garantir que o schedule
  // foi declarado. `declararFim` sabe as duas e é idempotente nas duas.
  if (assinatura.cancel_at === null) {
    const contrato = contratoDosTravados(await buscarTravadosDaInscricao(assinatura.inscricao_id))

    if (contrato) {
      if (contrato.modalidade !== 'parcelado') {
        console.warn(
          '[webhook] assinatura sem cancel_at — declarando agora (rede da D-05)',
          subscriptionId,
        )
      }
      await declararFim(subscriptionId, assinatura.inscricao_id, contrato)
    }
  }

  // ============================================================
  // ⚠️⚠️ A FATURA DE R$ 0,00 DO TRIAL NÃO É UM CICLO PAGO
  // ============================================================
  //
  // Quando a assinatura nasce com `trial_end` (D-04), o Stripe emite na
  // hora uma fatura de VALOR ZERO e a marca como paga — `invoice.paid`
  // dispara no mesmo segundo do cadastro, antes de alguém ter sido
  // debitado. Medido na primeira inscrição de ponta a ponta, em
  // 09/08/2026.
  //
  // Sem esta distinção, o efeito seria duplo e silencioso:
  //
  //   1. A inscrição viraria `ativa` ("Pagando", no painel) enquanto o
  //      cartão só está salvo. A Giovanna veria como pagante quem ainda
  //      não pagou nada.
  //   2. `ciclos_pagos` começaria em 1. Num curso de seis meses a conta
  //      fecharia em SETE — a mesma reclamação de julho que a D-05 existe
  //      para evitar, chegando por outra porta.
  //
  // ⚠️ O DISCRIMINADOR É `billing_reason`, E NÃO "o valor é zero".
  // Um ciclo mensal legítimo TAMBÉM pode ser R$ 0,00 — é o que um cupom
  // de `meses_gratis` produz —, e esse mês FOI consumido: ele conta. As
  // três combinações, por extenso:
  //
  //   `subscription_cycle`                 → mês do contrato. Conta
  //                                          sempre, inclusive a R$ 0.
  //   `subscription_create`, valor > 0     → não houve trial (inscrição a
  //                                          menos de 48h da cobrança, e
  //                                          o débito saiu na hora). Conta.
  //   `subscription_create`, valor zero    → a fatura do trial. NÃO conta.
  //
  // ⚠️ E ISSO RESPONDE 200. Não é falha: o evento é legítimo, foi
  // processado, e a decisão foi "não há ciclo aqui". Devolver 500 faria o
  // Stripe reentregar para sempre uma fatura que nunca vai ter o que
  // somar.
  // ============================================================
  const ehCicloDoContrato =
    fatura.billing_reason === 'subscription_cycle' ||
    (fatura.billing_reason === 'subscription_create' && fatura.amount_paid > 0)

  if (!ehCicloDoContrato) {
    console.info(
      '[webhook] fatura sem ciclo a contar (trial ou ajuste), ignorada',
      fatura.id,
      fatura.billing_reason,
      fatura.amount_paid,
    )
    return
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

  // ------------------------------------------------------------
  // O ALERTA (`c56`) — a Giovanna não descobre isto sozinha
  //
  // O Stripe avisa por e-mail a ALUNA, não a professora. Sem este alerta,
  // uma inadimplência só aparece quando ela abre o painel por outro
  // motivo, ou quando a aluna some da aula.
  //
  // ⚠️ MESMO TRATAMENTO DO E-MAIL DE CONFIRMAÇÃO: por último, depois da
  // escrita, e com try próprio. Falha de e-mail não pode virar 500 — o
  // evento seria reentregue e a inscrição reprocessada para reenviar um
  // aviso, e a segunda passagem mandaria um SEGUNDO alerta.
  // ------------------------------------------------------------
  try {
    const paraEmail = await buscarInscricaoParaEmail(assinatura.inscricao_id)

    if (!paraEmail) {
      console.error(
        '[webhook] cobranca recusada mas perfil incompleto — alerta nao enviado',
        assinatura.inscricao_id,
      )
      return
    }

    await alertarCobrancaFalhada(
      { name: paraEmail.nome, email: paraEmail.email, phone: paraEmail.telefone },
      paraEmail.safra,
    )
  } catch (err) {
    console.error('[webhook] falha ao alertar a cobranca recusada', assinatura.inscricao_id, err)
  }
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

/**
 * Declara o fim da assinatura conforme a forma do contrato (D-05, D-17).
 * Chamada pelo `completed` e pela rede do `invoice.paid`; idempotente nos
 * dois ramos.
 *
 *   mensal, à vista no cartão → `cancel_at`, como desde o corte 2. O
 *     à vista só difere na conta quando não houve trial — ver
 *     `fimDoContrato`.
 *   parcelado → subscription schedule de 11 + 1 fases, com
 *     `end_behavior: 'cancel'` — ver `declararParcelamento`.
 *
 * ⚠️ OS `price` DO PARCELADO SAEM DO TOTAL DA LINHA, e não da safra
 * (D-06). A safra entra só para o Stripe achar o `product` e a
 * `lookup_key` — os mesmos que a rota usou ao abrir o checkout, então a
 * parcela regular aqui é o MESMO `price` que a sessão cobrou.
 */
async function declararFim(
  subscriptionId: string,
  inscricaoId: string,
  contrato: ContratoTravado,
): Promise<void> {
  if (contrato.modalidade === 'parcelado') {
    const safra = await buscarSafraDaInscricao(inscricaoId)
    if (!safra) throw new Error(`inscricao ${inscricaoId} parcelada sem safra`)

    const precos = await precosDoParcelado(safra, contrato)
    await declararParcelamento({ subscriptionId, parcelas: contrato.parcelas, ...precos })
    return
  }

  // A assinatura só é lida quando a conta depende dela (à vista sem
  // trial). O mensal segue com uma chamada a menos, como sempre foi.
  const cancelAt =
    contrato.modalidade === 'a_vista_cartao'
      ? fimDoContrato(contrato, await stripe().subscriptions.retrieve(subscriptionId))
      : fimDoContrato(contrato, null)

  await declararFimDaAssinatura(subscriptionId, cancelAt)
}

// ============================================================
// O PIX (D-17)
// ============================================================

/**
 * `checkout.session.completed` de uma sessão Pix.
 *
 * ⚠️ NA MAIOR PARTE DAS VEZES ELA CHEGA SEM PAGAMENTO, e isso não é
 * falha: a pessoa concluiu a sessão ao VER o QR. O dinheiro chega depois,
 * em `async_payment_succeeded`. Responder 200 aqui sem escrever nada é o
 * certo — a inscrição continua em `pendente_pagamento`, que é a verdade.
 *
 * Se ela já chegar paga (o Stripe pode confirmar dentro da mesma
 * sessão), é tratada como pagamento.
 */
async function pixConcluido(sessao: Stripe.Checkout.Session): Promise<void> {
  if (sessao.payment_status === 'paid') return pixPago(sessao)

  console.info(
    '[webhook] pix aguardando pagamento — inscricao segue pendente',
    sessao.id,
    sessao.client_reference_id,
  )
}

/**
 * O Pix caiu → a inscrição vira `ativa` (D-17).
 *
 * ⚠️ `ativa` DIRETO, SEM PASSAR POR `confirmada`. "Confirmada" significa
 * "cartão salvo, cobrança agendada" (`c42`); no Pix o dinheiro inteiro já
 * entrou, e o estado verdadeiro é `ativa`. Decisão do dono do
 * repositório em 20/10/2026, junto com a consequência: ela NUNCA vira
 * `concluida` sozinha, porque não existe evento do Stripe no fim do curso
 * e a D-05 proíbe job nosso.
 *
 * ⚠️ A ORDEM É STATUS → REGISTRO → E-MAIL, e cada passo é idempotente:
 *
 *   1. status: escrever `ativa` duas vezes não muda nada;
 *   2. registro: o unique da sessão faz a segunda vez virar `ja_registrado`;
 *   3. e-mail: sai só quando o registro NASCEU agora. É o que impede a
 *      reentrega — ou o segundo evento do mesmo Pix — de mandar dois.
 *
 * Se o registro falhar depois do status, a reentrega refaz o status (sem
 * efeito) e o registro, e o e-mail sai na segunda passagem.
 */
async function pixPago(sessao: Stripe.Checkout.Session): Promise<void> {
  const inscricaoId = sessao.client_reference_id

  if (!inscricaoId) {
    // Mesma regra de `sessaoConcluida`: sem o fio, o dinheiro entrou por
    // uma porta que o sistema não conhece, e o log é o único aviso.
    throw new Error(`sessao pix ${sessao.id} sem client_reference_id — nao foi criada por este sistema`)
  }

  if (sessao.amount_total === null) {
    throw new Error(`sessao pix ${sessao.id} paga sem amount_total`)
  }

  await mudarStatusInscricao(inscricaoId, 'ativa')

  const resultado = await registrarPagamentoPix({
    inscricaoId,
    stripeCheckoutSessionId: sessao.id,
    stripePaymentIntentId: idDe(sessao.payment_intent),
    // O que o Stripe diz ter recebido, de centavos para reais, para a
    // coluna `numeric(10,2)`. Não é cópia do travado: é o espelho.
    valor: sessao.amount_total / 100,
    pagoEm: new Date().toISOString(),
  })

  if (resultado === 'pago_em_dobro') {
    // ⚠️ ALARME, não duplicata. A mesma inscrição pagou dois Pix (duas
    // abas, dois QRs), e o segundo dinheiro entrou de verdade. O
    // reembolso é manual, no Dashboard (D-17) — este log é o aviso.
    console.error(
      '[webhook] ⚠️ PIX PAGO EM DOBRO — reembolsar no Dashboard do Stripe',
      inscricaoId,
      sessao.id,
    )
    return
  }

  if (resultado === 'ja_registrado') {
    console.info('[webhook] pix ja registrado por outra entrega', sessao.id)
    return
  }

  // Mesmo tratamento do e-mail do `completed` de cartão: por último, com
  // try próprio, e falha de e-mail é log — nunca 500.
  try {
    const paraEmail = await buscarInscricaoParaEmail(inscricaoId)

    if (!paraEmail) {
      console.error('[webhook] pix pago sem perfil completo — e-mail nao enviado', inscricaoId)
      return
    }

    await confirmarInscricao(
      {
        name: paraEmail.nome,
        email: paraEmail.email,
        phone: paraEmail.telefone,
        nivel_ingles: paraEmail.nivel_ingles,
        curso: paraEmail.curso,
        periodo: paraEmail.periodo,
        disponibilidade: paraEmail.disponibilidade,
      },
      paraEmail.safra,
      paraEmail.contrato,
    )
  } catch (err) {
    console.error('[webhook] falha ao enviar a confirmacao do pix', inscricaoId, err)
  }
}

/**
 * `async_payment_failed` e `checkout.session.expired` — NÃO ESCREVEM NADA.
 *
 * ⚠️ A INSCRIÇÃO JÁ ESTÁ ONDE TEM QUE ESTAR: `pendente_pagamento`. Pix
 * expirado ou checkout abandonado é exatamente o estado que a fila da
 * D-15 trabalha — a Giovanna vê, manda o link, e a pessoa paga sem
 * preencher nada de novo. "Pix não pago volta para a fila" (D-17) não
 * exige escrita: exige não escrever outra coisa por cima.
 *
 * O evento continua registrado em `eventos_stripe` (a reserva já
 * aconteceu), que é onde alguém investigando "por que ela não pagou?"
 * vai encontrar a resposta.
 */
function sessaoSemPagamento(tipo: string, sessao: Stripe.Checkout.Session): void {
  console.info(
    '[webhook] sessao sem pagamento — inscricao segue na fila da D-15',
    tipo,
    sessao.id,
    sessao.client_reference_id,
  )
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
