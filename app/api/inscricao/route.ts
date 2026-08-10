import { after } from 'next/server'
import {
  buscarCupom,
  buscarSafraAtiva,
  criarInscricao,
  cupomInvalidoPorque,
  salvarStripeCouponId,
  salvarStripePriceId,
  SupabaseNotConfiguredError,
  type MotivoCupomInvalido,
  type SafraAtiva,
} from '@/lib/supabase'
import {
  ancorasDaAssinatura,
  criarSessaoDeCheckout,
  cupomNoStripe,
  precoDoContrato,
  StripeNotConfiguredError,
  trialEhAceitavel,
} from '@/lib/stripe'
import { confirmarInscricao, notificarAdmin } from '@/lib/email'
// O schema e a mensagem de erro moram juntos, em `src/config/schemas.ts`.
// Metade do schema é derivada de `dominio.ts` e a outra metade não é
// (`curso` e `periodo` continuam texto livre) — a fronteira está comentada
// lá. A regra da mensagem genérica também: ela é decisão de segurança, não
// de UX, e ficava exposta a "melhoria" enquanto morava aqui no meio do
// fluxo da requisição.
import { inscricaoSchema, mensagemDeErro } from '@/config/schemas'
// O MESMO módulo que a modal importa para exibir a frase. É essa
// identidade que dá valor ao que gravamos: o texto registrado no banco
// não é uma cópia parecida do que estava na tela, é o mesmo objeto.
import { CONSENT_TEXT } from '@/config/consentimento'

// ============================================================
// ESTA ROTA SUBSTITUI `POST /api/waitlist`
//
// O caminho mudou porque a coisa mudou de nome: não se entra mais numa
// "waitlist", cria-se uma INSCRIÇÃO — que pode ser numa safra ou na lista
// de espera, e a lista de espera passou a ser um estado da inscrição, não
// uma tabela. Manter `/api/waitlist` apontando para `pessoas` +
// `inscricoes` deixaria o vocabulário da URL contando a história do
// modelo antigo para sempre.
//
// ⚠️ A JANELA ENTRE A MIGRAÇÃO E ESTE DEPLOY É A ÚNICA INTERRUPÇÃO
// ACEITA DO PROJETO INTEIRO, e ela é documentada em vez de disfarçada.
//
// Depois da `011`, a tabela `waitlist` não existe mais (virou
// `waitlist_legado`, arquivo morto que não recebe linha nova). O build
// anterior continua no ar até este commit subir, e nesse intervalo o POST
// antigo responde 500 — não degrada, não engole, não grava. É a única
// exceção documentada à regra de degradar em silêncio (REPORT §9.3), e
// ela existe porque a alternativa era pior: manter os dois caminhos vivos
// significaria escrever nas duas estruturas ao mesmo tempo, e uma
// inscrição gravada só na `waitlist_legado` seria dado que ninguém mais
// lê. O intervalo é de minutos e o remédio é deployar isto logo depois de
// rodar a migração — nessa ordem, nunca a inversa.
// ============================================================

// Nunca pré-renderizar nem cachear: é um POST que escreve no banco.
export const dynamic = 'force-dynamic'

// ============================================================
// RATE LIMIT
// Map em memória com janela deslizante simples.
//
// ⚠️ Em serverless isto é POR INSTÂNCIA: cada lambda fria tem o próprio
// Map, e a Vercel pode ter várias em paralelo. Ou seja, o limite real é
// aproximado e mais frouxo do que os números abaixo sugerem. Segura bot
// ingênuo e clique repetido, que é o que precisamos num MVP. Se um dia
// virar problema de verdade, o lugar certo é um store compartilhado
// (Upstash/Redis) ou o rate limit da própria borda.
//
// ⚠️ ELE FICOU MAIS IMPORTANTE NESTE COMMIT, e o motivo merece estar
// escrito: a resposta de duplicata deixou de ser idêntica à de sucesso
// (ver o bloco DUPLICATA lá embaixo), então o formulário passou a
// responder se um e-mail já tem cadastro. Isso torna a enumeração de
// e-mails POSSÍVEL, e este Map é o que a torna CARA — cinco tentativas
// por minuto por IP não é barreira contra um atacante determinado, mas é
// a diferença entre varrer uma lista e conferir um endereço por vez.
// Afrouxar os números aqui afrouxa aquela decisão junto.
// ============================================================
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5
const hits = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)

  // Poda preguiçosa: sem isto o Map cresce indefinidamente numa instância
  // de vida longa. Roda raramente, só quando o Map passa de um tamanho.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key)
    }
  }

  return recent.length > RATE_LIMIT_MAX
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'desconhecido'
}

// Toda resposta ao cliente sai daqui. Mensagens genéricas: o detalhe do que
// deu errado fica no log do servidor, nunca no corpo. E nada do payload
// recebido é ecoado de volta.
//
// `duplicada` é o único campo novo, e é opcional de propósito: quem não
// passa não afirma nada. Ele existe para a modal poder mostrar a mensagem
// de "já tem cadastro" em vez da tela de sucesso — ver o bloco DUPLICATA.
// `modo` e `url` são os dois campos do corte 2, e eles andam juntos:
// `modo: 'checkout'` sem `url` não teria para onde mandar ninguém. Quem os
// lê é a modal, que navega para a URL do Stripe em vez de mostrar a tela
// de sucesso. ⚠️ A URL é do Stripe e é gerada por requisição — ela não é
// um segredo nosso, mas também não é endereço estável: não cacheie, não
// guarde, não reaproveite.
function json(
  body: {
    ok: boolean
    message: string
    duplicada?: boolean
    modo?: 'checkout' | 'fila'
    url?: string
  },
  status: number,
) {
  return Response.json(body, { status })
}

/**
 * A base absoluta para onde o Stripe devolve a pessoa.
 *
 * ⚠️ O STRIPE EXIGE URL ABSOLUTA — caminho relativo é recusado na criação
 * da sessão. `NEXT_PUBLIC_SITE_URL` é a fonte canônica (e é `NEXT_PUBLIC_`
 * legitimamente: é o endereço público do site, não segredo).
 *
 * O `fallback` para a origem da requisição não é zelo: em Preview da
 * Vercel cada deploy tem um domínio próprio, e uma variável apontando para
 * produção mandaria quem testou na Preview parar no site de verdade — com
 * um `session_id` que aquele ambiente não conhece.
 */
function paginaDeRetorno(req: Request, caminho: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  return new URL(caminho, base).toString()
}

const SUCCESS_MESSAGE = 'Pronto! Sua inscrição está confirmada.'
// Lida por quem não é a nossa modal — ela navega para o Stripe e nunca
// mostra este texto. "Recebemos" e não "confirmada": entre esta resposta e
// o cartão digitado ainda há uma tela, e ela pode ser abandonada.
const SUCCESS_MESSAGE_CHECKOUT = 'Recebemos sua inscrição. Vamos abrir o pagamento.'
// ⚠️ O caso em que a inscrição foi gravada e o checkout NÃO abriu. A frase
// não pode prometer nem "confirmada" (não pagou) nem "lista de espera"
// (não é o que o banco registrou). O que ela promete é o que a D-15
// garante: alguém vai mandar o link.
const SUCCESS_MESSAGE_FILA =
  'Recebemos sua inscrição! Vamos enviar o link de pagamento para o seu e-mail.'
// Sem safra aberta a promessa é outra, e prometer "inscrição confirmada"
// a quem entrou na lista de espera seria mentira. A modal mostra a tela
// dela e ignora este texto; quem lê é o honeypot e qualquer cliente que
// não seja o nosso formulário.
const SUCCESS_MESSAGE_ESPERA = 'Pronto! Avisaremos você assim que a próxima turma abrir.'

// ============================================================
// AS DUAS MENSAGENS DE DUPLICATA
//
// ⚠️ Elas não confirmam NADA além de já existir cadastro para aquele
// e-mail naquela turma. Sem nome, sem data, sem status, sem posição na
// fila, sem "desde quando". Cada um desses detalhes seria um dado pessoal
// entregue a quem só provou saber digitar um endereço de e-mail.
//
// São duas e não uma porque a promessa é diferente nos dois modos, pelo
// mesmo motivo de sempre: dizer "sua inscrição já está confirmada" a quem
// está na lista de espera prometeria uma vaga que não existe. O modo já é
// público de qualquer forma — a modal mostra "Inscrição" ou "Lista de
// espera" no topo antes de qualquer digitação —, então distinguir aqui
// não revela nada novo.
// ============================================================
const DUPLICATE_MESSAGE = 'Este e-mail já está inscrito nesta turma. Não é preciso preencher de novo.'
const DUPLICATE_MESSAGE_ESPERA =
  'Este e-mail já está na lista de espera. Não é preciso preencher de novo.'

const GENERIC_ERROR = 'Não conseguimos salvar seu cadastro agora. Tente novamente em instantes.'

// ============================================================
// AS MENSAGENS DE CUPOM — específicas, e a especificidade é decisão
//
// ⚠️ ELAS CONTRARIAM A REGRA DA MENSAGEM GENÉRICA DESTA ROTA, e de
// propósito. A regra existe porque erro de infra e erro de validação não
// podem virar um oráculo sobre o banco (`schemas.ts` documenta o
// raciocínio). Cupom é o caso em que o oposto vale: o código foi
// DIGITADO pela pessoa, ela sabe qual é, e "cupom inválido" seco a deixa
// sem ação — ela vai tentar o mesmo código de novo, ou desistir da compra
// achando que o site quebrou. "Expirado" e "esgotado" ela entende na hora.
//
// O que elas NÃO revelam: nada sobre cupom que ela não tenha digitado.
// Só se pergunta pelo código que se conhece, e a resposta fala só dele —
// não há listagem, não há "quase", não há sugestão.
// ============================================================
const MENSAGEM_CUPOM: Record<MotivoCupomInvalido, string> = {
  inexistente: 'Não encontramos esse cupom. Confira o código e tente de novo.',
  inativo: 'Esse cupom não está mais disponível.',
  expirado: 'Esse cupom expirou.',
  esgotado: 'Esse cupom já atingiu o limite de usos.',
  outra_safra: 'Esse cupom não vale para esta turma.',
  // ⚠️ Este é o único da lista que NÃO é culpa de quem digitou: o cupom é
  // válido e o espelho no Stripe não subiu. A mensagem não diz "inválido"
  // porque ele não é — e não diz "erro nosso" porque isso não ajuda
  // ninguém a decidir o que fazer agora.
  sem_espelho: 'Não conseguimos aplicar esse cupom agora. Tente novamente em instantes.',
}

export async function POST(req: Request) {
  const ip = clientIp(req)

  if (isRateLimited(ip)) {
    return json(
      { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' },
      429,
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, message: 'Requisição inválida.' }, 400)
  }

  const parsed = inscricaoSchema.safeParse(payload)
  if (!parsed.success) {
    // Genérica por padrão; específica só para consentimento e
    // disponibilidade, e só quando são o único erro. A regra inteira, com
    // o porquê de serem exatamente essas duas exceções, está em
    // `schemas.ts` — nada do payload recebido é ecoado de volta.
    return json({ ok: false, message: mensagemDeErro(parsed.error) }, 400)
  }

  // ------------------------------------------------------------
  // O CORTE DE FRONTEIRA DO PAYLOAD — o que entra, e o que morre aqui
  //
  // Só estes campos são desestruturados, e a lista é a fronteira: nada do
  // corpo do POST chega ao banco sem passar por um nome escrito aqui.
  //
  // ⚠️ `payment_choice` NÃO APARECE MAIS AQUI PORQUE NÃO EXISTE MAIS EM
  // LUGAR NENHUM DO FLUXO (D-11). O corte que o descartava saiu junto.
  //
  // Enquanto o Zod ainda exigia o campo, esta lista era o ponto exato onde
  // ele morria — chegava no corpo, era desestruturado por ninguém e não
  // seguia adiante. Agora ele não chega: o schema (`src/config/schemas.ts`)
  // deixou de aceitá-lo e a modal deixou de enviá-lo. Descartar aqui
  // sugeriria que ainda há algo a descartar.
  //
  // O porquê da remoção fica registrado no `schemas.ts`, no lugar de onde
  // a pergunta saiu — em resumo: a escolha era oferecida numa tela sem
  // checkout, os dois valores gravavam igual, e a intenção passa a ser
  // exercida no pagamento em vez de declarada num formulário (D-02).
  //
  // ⚠️ UM POST ANTIGO QUE AINDA MANDE O CAMPO NÃO É RECUSADO. Este
  // `z.object` não tem `.passthrough()`, então a chave desconhecida é
  // descartada no parse e nunca chega até aqui. A aba aberta há meia hora
  // com o bundle velho continua conseguindo se inscrever, que é o que o
  // "nenhum passo derruba o formulário" exige.
  //
  // ⚠️ `consent_at` e `consent_text` também não estão, e por um motivo
  // mais forte: eles NASCEM NO SERVIDOR. Se um POST forjado os mandar, o
  // Zod já os descarta (um `z.object` sem `.passthrough()` não deixa
  // chave desconhecida atravessar), e mesmo que deixasse eles não seriam
  // lidos daqui. É a mesma assimetria de sempre — ver o bloco do
  // consentimento mais abaixo.
  // ------------------------------------------------------------
  const {
    name,
    email,
    phone,
    website,
    nivel_ingles,
    curso,
    periodo,
    disponibilidade,
    cupom,
  } = parsed.data

  // Honeypot preenchido: responde sucesso e não grava nada. Devolver erro
  // ensinaria o bot que o campo é a armadilha.
  //
  // ⚠️ Ele responde a mensagem de SUCESSO e nunca a de duplicata — o
  // caminho nem chega ao banco, então não há o que duplicar. Um bot que
  // recebesse "este e-mail já está inscrito" daqui teria descoberto, de
  // graça e sem rate limit, exatamente o que a resposta genérica de
  // duplicata custou uma decisão consciente para conceder.
  if (website && website.length > 0) {
    console.warn('[inscricao] honeypot acionado')
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200)
  }

  // Carimba o consentimento AGORA, e não lá embaixo na chamada da RPC. A
  // diferença é de significado, não de milissegundos: o instante que
  // interessa é aquele em que a manifestação chegou e foi aceita como
  // válida — logo depois do `safeParse` que exigiu `consent: true` e do
  // honeypot que descartou o que não é gente. Gerar isto dentro da
  // chamada ao banco faria a coluna medir a latência do PostgREST.
  const consentAt = new Date().toISOString()

  // ------------------------------------------------------------
  // QUAL É A SAFRA, E SE ELA ESTÁ ABERTA — perguntado AO BANCO.
  //
  // A modal também consulta `/api/safra-ativa` para decidir o que
  // mostrar, mas aquilo é interface. Qualquer pessoa pode mandar um POST
  // direto afirmando o que quiser, e entre a resposta que a modal recebeu
  // e esta escrita a Giovana pode ter fechado a safra. A única leitura
  // que vale para gravar é esta, feita agora.
  //
  // ⚠️ "VEIO SAFRA" NÃO É O SINAL. Pela D-13, `buscarSafraAtiva` devolve
  // a safra mais recente SEM olhar `inscricoes_abertas` — o que serve
  // para a vitrine (quanto custa, quando começa) e não serve para gravar
  // (dá para comprar agora?). As duas perguntas foram separadas de
  // propósito, e é aqui que a segunda é feita. Sem a flag aplicada,
  // com as inscrições fechadas, toda inscrição seria gravada como
  // `pendente_pagamento` numa safra que ninguém abriu.
  //
  // ⚠️ FALHA AQUI DEGRADA PARA LISTA DE ESPERA, e este `catch` é o que
  // materializa o REPORT §9.3 nesta rota — a versão anterior deixava a
  // exceção subir e respondia 500, o que era degradar para tela de erro.
  // Banco de safras fora do ar, contagem que não veio, schema divergente:
  // em qualquer desses casos ainda dá para gravar o contato de alguém
  // interessada, e é isso que não pode ser perdido. O que NÃO se pode
  // fazer é o contrário — prometer uma vaga numa safra que não foi
  // possível confirmar.
  //
  // Note que a degradação é barata justamente porque o par
  // (`safra_id`, `status`) é montado pela função a partir do `null`: não
  // existe estado intermediário onde a rota grave "inscrição numa safra
  // que talvez exista".
  // ------------------------------------------------------------
  let safra: SafraAtiva | null = null
  try {
    safra = await buscarSafraAtiva()
  } catch (err) {
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[inscricao]', err.message)
    } else {
      console.error('[inscricao] falha ao consultar a safra — degradando para lista de espera', err)
    }
  }

  // As três variáveis saem da MESMA leitura, e é isso que garante que a
  // escrita, o e-mail e a resposta contem a mesma história. Derivar
  // qualquer uma delas de uma segunda consulta abriria a janela para a
  // Giovana fechar a safra no meio e o e-mail prometer o que o banco não
  // registrou.
  //
  // `=== true` e não coerção: `inscricoes_abertas` é o booleano do banco,
  // e nada além do verdadeiro literal pode abrir o caminho que promete
  // vaga.
  const safraAberta = safra?.inscricoes_abertas === true
  // ------------------------------------------------------------
  // A CONTAGEM DE VAGAS — D-08, e ela é limite MOLE (`c36`)
  //
  // `vagas_total` nulo significa SEM LIMITE, e é o caso normal: a
  // Giovanna respondeu, em 08/08/2026, que "não precisa ter número de
  // vagas fixas — podemos ter mais ou menos alunos dependendo da aderência
  // deles e da disponibilidade da professora". Ou seja, a coluna existe
  // para o dia em que ela quiser um teto, e fica nula até lá.
  //
  // ⚠️ NÃO HÁ TRAVA TRANSACIONAL, e isso é decisão, não pendência. Duas
  // pessoas fechando o checkout no mesmo segundo pela última vaga é
  // possível e aceito: na escala do produto (dezenas, não milhares) um
  // lock distribuído não se paga, e o painel mostra o estouro em vermelho
  // para a Giovanna resolver com uma conversa.
  //
  // ⚠️ ESTOURO NÃO É ERRO — É LISTA DE ESPERA. A D-08 diz que o sistema
  // "recusa se estourou", e recusar aqui significa não abrir o checkout,
  // nunca mostrar tela de erro (REPORT §9.3). A pessoa entra na lista de
  // espera, que é a promessa menor e verdadeira. Devolver 4xx faria alguém
  // que só queria estudar receber uma mensagem de falha por um problema de
  // agenda da escola.
  //
  // ⚠️ A contagem NÃO exclui `cancelada` nem `concluida`, e a omissão
  // continua sendo a de `buscarSafraAtiva` — ver o comentário lá. Com
  // `vagas_total` nulo ela não decide nada; no dia em que um teto for
  // posto, a pergunta "inscrição cancelada devolve a vaga?" volta a
  // importar, e o lugar de respondê-la é aquele comentário.
  const temVaga = safra?.vagas_total == null || safra.inscritas < safra.vagas_total

  // ⚠️ ESTE é o booleano que abre o pagamento — e ele é mais estreito que
  // `safraAberta`. Safra aberta sem vaga continua sendo safra aberta para
  // efeito de vitrine; o que ela não é mais é comprável.
  const abreCheckout = safraAberta && temVaga

  if (safraAberta && !temVaga) {
    console.warn('[inscricao] safra aberta sem vaga — degradando para lista de espera', safra?.id)
  }

  // `null` quando a safra não está ABERTA, e não quando ela não existe. É
  // o mesmo booleano que decide a escrita: um e-mail dizendo "sua turma
  // começa em setembro" para quem foi gravada em `lista_espera` seria a
  // promessa que o banco não registrou.
  const safraParaEmail = abreCheckout ? safra : null
  const safraId = safraParaEmail?.id ?? null

  // ------------------------------------------------------------
  // O CONTRATO TRAVADO — D-06, copiado da safra AGORA (`c37`)
  //
  // Os três valores viajam para dentro da mesma transação que cria a
  // inscrição (`016`), e não num `update` depois: uma inscrição em
  // `pendente_pagamento` sem contrato é um estado inválido que dependeria
  // de uma ação futura para deixar de existir.
  //
  // ⚠️ ELES SÃO CÓPIA, E A CÓPIA É O PONTO. Mexer na safra depois não
  // afeta quem já assinou — é a mesma lógica de `consent_text`: prova não
  // se normaliza. Lido por FK da safra, subir o preço faria o sistema
  // afirmar, sobre quem assinou em março, que ela concordou com o valor de
  // setembro.
  //
  // ⚠️ E O QUE VOLTA DA RPC PODE SER OUTRO. Na duplicata — alguém
  // retomando um checkout abandonado — a `016` devolve o contrato da
  // PRIMEIRA vez e ignora este. É de propósito, e é o que a sessão de
  // checkout tem que cobrar.
  // ------------------------------------------------------------
  const travados =
    abreCheckout && safra
      ? {
          valorMensal: safra.valor_mensal,
          duracaoMeses: safra.duracao_meses,
          dataPrimeiraCobranca: safra.data_primeira_cobranca,
        }
      : null

  // ============================================================
  // O CUPOM (`c49`) — validado ANTES de qualquer escrita
  // ============================================================
  //
  // ⚠️ A ORDEM É O COMPORTAMENTO. Validar depois do insert deixaria a
  // pessoa gravada em `pendente_pagamento` por causa de um código digitado
  // errado — e ela cairia na fila da D-15 sem ter feito nada de errado
  // além de trocar uma letra. Aqui, cupom inválido é 400, o formulário
  // continua preenchido na tela, ela corrige e reenvia.
  //
  // ⚠️ E CUPOM INVÁLIDO NÃO DEGRADA PARA LISTA DE ESPERA. Seria o oposto
  // do que a pessoa pediu: ela quer comprar, com desconto. Empurrá-la para
  // a fila de espera porque o código expirou é responder outra pergunta.
  //
  // ⚠️ SEM SAFRA ABERTA, O CUPOM É IGNORADO EM SILÊNCIO. Não há o que
  // descontar numa lista de espera, e recusar a inscrição por causa de um
  // cupom que não seria usado de qualquer jeito trocaria um cadastro por
  // uma mensagem de erro.
  // ------------------------------------------------------------
  let stripeCouponId: string | null = null
  let cupomId: string | null = null

  if (cupom && abreCheckout && safra) {
    try {
      let registro = await buscarCupom(cupom)
      let motivo = cupomInvalidoPorque(registro, safra.id, new Date())

      // ⚠️ O ESPELHO É TENTADO ANTES DE O `sem_espelho` VIRAR RECUSA, e
      // essa ordem é a D-07 funcionando. O cupom nasce no nosso banco; o
      // `coupon` do Stripe é consequência, e ele pode não existir ainda
      // porque a criação é uma chamada de rede que falha às vezes. Recusar
      // de cara faria a Giovanna criar um cupom no painel, ele parecer
      // pronto, e a primeira aluna a usá-lo ouvir que não dá.
      //
      // `cupomNoStripe` é idempotente (id determinístico), então tentar de
      // novo a cada checkout não acumula nada.
      if (motivo === 'sem_espelho' && registro) {
        const espelho = await cupomNoStripe(registro)

        // Falha ao gravar não derruba: o `coupon` existe no Stripe e a
        // sessão pode usá-lo. A coluna fica para trás e a próxima chamada
        // tenta de novo — mesma janela de `salvarStripePriceId`.
        try {
          await salvarStripeCouponId(registro.id, espelho)
        } catch (err) {
          console.error('[inscricao] coupon criado mas nao gravado', registro.id, err)
        }

        registro = { ...registro, stripe_coupon_id: espelho }
        motivo = cupomInvalidoPorque(registro, safra.id, new Date())
      }

      if (motivo) {
        console.warn('[inscricao] cupom recusado', motivo)
        return json({ ok: false, message: MENSAGEM_CUPOM[motivo] }, 400)
      }

      stripeCouponId = registro!.stripe_coupon_id
      cupomId = registro!.id
    } catch (err) {
      // ⚠️ FALHA DE INFRA AQUI NÃO PODE VIRAR "SEGUE SEM DESCONTO". A
      // pessoa digitou um cupom; abrir o checkout pelo valor cheio
      // cobraria mais do que ela aceitou pagar, e ela só descobriria no
      // extrato. As duas saídas honestas seriam recusar ou perguntar de
      // novo — e recusar sem gravar nada é a que não perde dado e não
      // mente: ela tenta outra vez, com o formulário como estava.
      console.error('[inscricao] falha ao validar o cupom', err)
      return json({ ok: false, message: GENERIC_ERROR }, 500)
    }
  }

  // ------------------------------------------------------------
  // A ESCRITA — e o `try` que a envolve NÃO é simetria com o de cima.
  //
  // O `catch` da consulta à safra DEGRADA (grava lista de espera). Este
  // aqui não tem para onde degradar: se a escrita não aconteceu, não
  // existe versão reduzida do resultado que ainda seja verdade. É "o
  // insert que falha de verdade" — a única exceção que o REPORT §9.3
  // abre à regra de nunca mostrar tela de erro.
  //
  // Ele existe porque `criarInscricao` PODE LANÇAR antes de falar com o
  // banco: sem `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no ambiente,
  // `supabase()` levanta `SupabaseNotConfiguredError`. Sem este `catch`,
  // a exceção subiria para o Next e a pessoa receberia uma página de erro
  // 500 em HTML no lugar do nosso JSON — a modal tentaria `res.json()`,
  // não conseguiria, e mostraria "falha de conexão" para um problema que
  // não é de conexão. Erro de infra vira a MESMA mensagem genérica de
  // sempre; o detalhe fica no log do servidor.
  // ------------------------------------------------------------
  let result
  try {
    result = await criarInscricao({
      nome: name,
      email,
      telefone: phone,
      nivel_ingles,
      curso,
      periodo,
      disponibilidade,
      // ------------------------------------------------------------
      // CONSENTIMENTO — o que a pessoa afirmou, quando, e a quê.
      //
      // `consent` não viaja: a função grava `true` fixo, porque inscrição
      // nova sempre grava consentimento completo (tudo-ou-nada, REPORT
      // §9.4) e não existe caminho para registrar uma recusa que entrou
      // assim mesmo. Quem exigiu o `true` foi o Zod, com `z.literal(true)`,
      // antes desta linha.
      //
      // `consent_at` e `consent_text` NÃO vêm do payload, e essa assimetria
      // é o ponto: o cliente é a única fonte possível para o ato de marcar
      // a caixa, mas é a pior fonte imaginável para a hora do relógio e
      // para a redação exibida. Um POST forjado poderia declarar que
      // aceitou um texto que nunca existiu, com data conveniente. O
      // servidor sabe as duas coisas por conta própria e é isso que grava.
      //
      // ⚠️ Em caso de duplicata, o consentimento da inscrição EXISTENTE não
      // é sobrescrito — a função não escreve uma linha sequer nesse caso. O
      // registro probatório é o da primeira vez, com a data da primeira
      // vez, e é isso que faz dele prova. Ver a seção 2.2 da `011b`.
      // ------------------------------------------------------------
      consent_at: consentAt,
      consent_text: CONSENT_TEXT,
      safra_id: safraId,
      travados,
    })
  } catch (err) {
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[inscricao]', err.message)
    } else {
      console.error('[inscricao] erro inesperado ao criar a inscrição', err)
    }
    return json({ ok: false, message: GENERIC_ERROR }, 500)
  }

  if (!result.ok) {
    console.error('[inscricao] criar_inscricao falhou', result.status, result.detail)
    return json({ ok: false, message: GENERIC_ERROR }, 500)
  }

  // ------------------------------------------------------------
  // E-MAILS — só para inscrição NOVA, e nunca bloqueando a resposta.
  //
  // `result.criada` sozinho: mandar confirmação de novo para quem já
  // tinha inscrição transformaria a rota num canhão de spam. Bastaria
  // reenviar o mesmo formulário dez vezes para a pessoa receber dez
  // e-mails, e a Giovana também.
  //
  // ⚠️ ESTA METADE DO REPORT §9.2 NÃO AFROUXOU, e é importante separar as
  // duas: a resposta HTTP de duplicata mudou (ver o bloco abaixo), o
  // e-mail de duplicata não. Eram duas coisas juntas na mesma decisão por
  // acidente. A primeira existia para não revelar quem está na lista; a
  // segunda existe para não mandar mensagem que ninguém pediu — e essa
  // razão continua inteira, independente do que a resposta diz. Um "mas o
  // e-mail já é consultável mesmo, então tanto faz mandar" seria trocar
  // um problema resolvido por outro sem ganho nenhum.
  //
  // `after` do next/server, e não uma promessa solta: em serverless a
  // função pode ser congelada assim que devolve a resposta, e uma
  // promessa não aguardada morre no meio do fetch para o Resend. O
  // `after` é o contrato que a Vercel respeita — a execução continua
  // depois da resposta ir embora, com a plataforma mantendo a lambda
  // viva até estas tasks terminarem. A pessoa vê a tela de sucesso sem
  // esperar o Resend.
  //
  // Os dois envios em paralelo, com `allSettled` e try/catch próprio
  // dentro de cada função: nenhum dos dois pode impedir o outro, e o
  // conjunto não pode virar rejeição não tratada aqui dentro. Nenhuma
  // função de `src/lib/email.ts` lança, por contrato escrito no topo
  // daquele arquivo — e-mail que falha não pode derrubar uma inscrição
  // que JÁ está gravada.
  // ------------------------------------------------------------
  if (result.criada) {
    const paraEmail = {
      name,
      email,
      phone,
      nivel_ingles,
      curso,
      periodo,
      disponibilidade,
      // ⚠️ AQUI HAVIA `payment_choice`, uma constante derivada de
      // `safraAberta` que existia só para satisfazer `InscricaoEmail` e
      // alimentar a linha "Pagamento" do e-mail da Giovana. As duas
      // saíram (D-11): o tipo não tem mais o campo e o e-mail não tem
      // mais a linha, em nenhum dos dois formatos.
      //
      // A linha não virou "—" nem "(não perguntado)". O e-mail é
      // operacional e a linha "Turma" já diz o que a Giovana precisa
      // saber — safra com vaga ou lista de espera. Ver o bloco no lugar
      // do antigo `ROTULO_PAGAMENTO`, em `src/lib/email.ts`.
    }

    // ------------------------------------------------------------
    // ⚠️ EM MODO CHECKOUT, A CONFIRMAÇÃO PARA A ALUNA NÃO SAI AQUI
    //
    // Ela diria "sua inscrição está confirmada" para alguém que ainda não
    // pagou — e pela D-02 é pagar que faz entrar. Mandar agora seria a
    // tensão 8.1 do REPORT pela porta do e-mail: o sistema afirmando a
    // quem está comprando uma coisa que não aconteceu.
    //
    // Quem manda é o webhook, depois de `checkout.session.completed`, que
    // é o instante em que a frase passa a ser verdade.
    //
    // ⚠️ O AVISO PARA A GIOVANNA SAI DOS DOIS JEITOS, e a assimetria é
    // deliberada: o e-mail dela é OPERACIONAL, não promessa. "Fulana está
    // se inscrevendo agora" é informação verdadeira mesmo que o cartão
    // nunca seja digitado — e é ela que precisa saber que existe gente
    // chegando, inclusive gente que abandona o checkout e vai virar fila
    // de pendência (D-15).
    // ------------------------------------------------------------
    after(async () => {
      await Promise.allSettled(
        abreCheckout
          ? [notificarAdmin(paraEmail, safraParaEmail)]
          : [
              notificarAdmin(paraEmail, safraParaEmail),
              confirmarInscricao(paraEmail, safraParaEmail),
            ],
      )
    })
  }

  // ============================================================
  // O CHECKOUT (`c35`) — a sessão nasce AQUI DENTRO, e não numa rota
  // própria
  // ============================================================
  //
  // ⚠️ POR QUE NÃO EXISTE `POST /api/checkout`. O `04-PLANO.md` previa uma
  // rota separada, e ela teria que receber do cliente QUAL inscrição pagar
  // — e "nenhuma decisão de negócio vem do cliente" é a regra que abre o
  // `02-FLUXOS.md`. Qualquer pessoa abriria o checkout de uma inscrição
  // alheia mandando outro id. Aqui o id vem da RPC que acabou de escrever
  // a linha, na mesma requisição, e não há como pedir outro.
  //
  // ⚠️ E É POR ISSO QUE A DUPLICATA TAMBÉM PASSA POR AQUI. Quem abandonou
  // o checkout ficou em `pendente_pagamento` e, ao preencher o formulário
  // de novo, recebia "você já está inscrita" — um beco sem saída (D-15). A
  // `016` devolve o id da inscrição que JÁ EXISTE, então a segunda
  // tentativa abre a sessão para ela. O estado órfão passa a ser
  // recuperável pela própria pessoa.
  // ============================================================
  if (abreCheckout && safra && result.inscricaoId && result.contrato) {
    try {
      // ⚠️ O `price` SAI DO CONTRATO DA LINHA, não do valor da safra. Nos
      // dois coincidem no caminho normal; divergem quando a Giovanna mudou
      // o preço entre a primeira tentativa e a retomada, e aí é o contrato
      // que vale (D-06). Ver `precoDoContrato`.
      const preco = await precoDoContrato(safra, result.contrato.valorMensal)

      // ⚠️ A GRAVAÇÃO DO `price` NÃO PODE DERRUBAR O CHECKOUT. Ela é
      // otimização de próxima chamada, não requisito desta: o `priceId`
      // devolvido pelo Stripe é válido agora, independentemente de a coluna
      // ter acompanhado. Quem decide isso é esta rota — o módulo de banco
      // se recusa a decidir por conta própria e lança. Ver
      // `salvarStripePriceId`.
      if (preco.criado) {
        try {
          await salvarStripePriceId(safra.id, preco.priceId)
        } catch (err) {
          console.error('[inscricao] price criado mas nao gravado na safra', safra.id, err)
        }
      }

      const { trialEnd } = ancorasDaAssinatura({
        data_primeira_cobranca: result.contrato.dataPrimeiraCobranca,
        duracao_meses: result.contrato.duracaoMeses,
      })

      // ⚠️ `cancelAt` NÃO É USADO AQUI, e a ausência é a nota da D-05: a
      // API de Checkout Session não aceita `cancel_at`, e a assinatura só
      // existe do lado do Stripe. Ele é declarado no webhook, uma vez, no
      // primeiro instante em que há um id de assinatura. Ver o bloco em
      // `src/lib/stripe.ts`.
      const agora = Math.floor(Date.now() / 1000)

      const url = await criarSessaoDeCheckout({
        inscricaoId: result.inscricaoId,
        priceId: preco.priceId,
        email,
        // `null` quando falta menos de 48h para a data de cobrança — o
        // Stripe recusa `trial_end` mais perto que isso, e a alternativa a
        // cobrar na hora seria não vender. Ver `trialEhAceitavel`.
        trialEnd: trialEhAceitavel(trialEnd, agora) ? trialEnd : null,
        // A mesma data, em string, para a frase da tela do Stripe. Sai do
        // CONTRATO e não da safra: quem retomou um checkout antigo lê a
        // data que combinou, não a de hoje (D-06).
        dataPrimeiraCobranca: result.contrato.dataPrimeiraCobranca,
        safraId: safra.id,
        stripeCouponId,
        // ⚠️ O id do NOSSO cupom viaja em metadata, e é assim que o webhook
        // grava `assinaturas.cupom_id`. Mapear de volta a partir do
        // `coupon` do Stripe exigiria fatiar o id `cupom_<uuid>` — decidir
        // identidade pelo formato de uma string, que quebra no dia em que
        // o formato mudar. Quem sabe qual cupom foi aplicado é quem o
        // aplicou.
        cupomId,
        sucessoUrl: paginaDeRetorno(req, '/inscricao/sucesso'),
        canceladoUrl: paginaDeRetorno(req, '/inscricao/cancelado'),
      })

      return json({ ok: true, modo: 'checkout', url, message: SUCCESS_MESSAGE_CHECKOUT }, 200)
    } catch (err) {
      // ------------------------------------------------------------
      // ⚠️ AQUI NÃO DÁ PARA DEGRADAR PARA LISTA DE ESPERA, E É POR ISSO
      //    QUE A RESPOSTA É `ok: true`
      //
      // A inscrição JÁ ESTÁ GRAVADA, em `pendente_pagamento`, numa safra.
      // Não existe como voltar atrás: o par (safra_id, status) está no
      // banco, e reescrevê-lo para `lista_espera` seria apagar o fato de
      // que a pessoa tentou comprar.
      //
      // Responder erro seria dizer "não conseguimos salvar seu cadastro"
      // sobre um cadastro que existe — a mesma mentira que a resposta de
      // duplicata evita, com o sinal trocado. O que é verdade é: recebemos,
      // e o pagamento vai chegar por e-mail.
      //
      // ⚠️ E ISSO NÃO É UMA PROMESSA VAZIA: é exatamente a fila da D-15. A
      // inscrição aparece no painel como pendente, a Giovanna dispara o
      // link, e a pessoa paga sem preencher nada de novo. O estado sem
      // saída que a D-15 descreve é o que este `catch` alimenta — de
      // propósito, porque já existe quem o trabalhe.
      // ------------------------------------------------------------
      if (err instanceof StripeNotConfiguredError) {
        console.error('[inscricao]', err.message)
      } else {
        console.error(
          '[inscricao] inscricao gravada mas checkout nao abriu — vai para a fila da D-15',
          result.inscricaoId,
          err,
        )
      }

      // ⚠️ `modo: 'fila'` NÃO É DECORAÇÃO — sem ele a modal cai na tela de
      // sucesso genérica, que promete "sua vaga está reservada" para
      // alguém que não pagou. Quem sabe que o checkout não abriu é o
      // servidor; a modal não tem como descobrir sozinha, e não deve
      // tentar.
      return json({ ok: true, modo: 'fila', message: SUCCESS_MESSAGE_FILA }, 200)
    }
  }

  // ============================================================
  // DUPLICATA — ⚠️ REVERSÃO PARCIAL E DELIBERADA DO REPORT §9.2
  // ============================================================
  //
  // O QUE O §9.2 DIZIA, E POR QUÊ. "A resposta de duplicata é idêntica à
  // de sucesso." Mesmo status, mesmo corpo, mesma tela. A razão era
  // impedir enumeração: sem isso, o formulário responde se um e-mail
  // qualquer está ou não cadastrado, e vira um oráculo — dá para
  // descobrir quem se inscreveu no curso testando endereços.
  //
  // POR QUE FOI REVERTIDO. Porque o que a tela de sucesso PROMETE mudou.
  // Enquanto a inscrição era só um contato guardado, "Pronto!" era um
  // agrado: quem preenchia duas vezes não perdia nada, e a resposta
  // idêntica não fazia mal a ninguém. Com pagamento no fluxo — cupom,
  // desconto de primeira semana, vaga limitada —, a mesma tela vira
  // PROMESSA. Quem se cadastra de novo achando que garantiu o desconto
  // recebeu informação falsa, e descobre na hora de comprar. É a tensão
  // 8.1 do REPORT, a única em que o sistema pode dizer algo falso a quem
  // está comprando, e é ela que este corte existe para fechar. Mentir
  // para proteger a lista seria trocar o problema de quem já está na
  // lista pelo problema de quem está comprando agora.
  //
  // O QUE FOI ACEITO. O e-mail vira consultável: quem digitar um endereço
  // aqui descobre se ele tem cadastro nesta turma. Aceito conscientemente,
  // com duas contenções — o rate limit lá em cima, que torna a varredura
  // cara, e a mensagem, que não diz mais nada além disso.
  //
  // O QUE **NÃO** MUDOU:
  //
  //   1. Duplicata NÃO dispara e-mail. Ver o bloco acima — é outra
  //      decisão, com outra razão, e ela fica inteira.
  //   2. Duplicata NÃO É ERRO. HTTP 200, `ok: true`, e não cai no ramo de
  //      falha. Ninguém preencheu nada errado: a pessoa está cadastrada,
  //      que é o desfecho que ela queria. Responder 4xx/5xx aqui faria a
  //      modal mostrar "não conseguimos salvar" sobre um cadastro que
  //      existe e está correto.
  //   3. Nada do banco atravessa. `criada` é um booleano; nome, data,
  //      status e posição na fila não saíram da função e não saem daqui.
  // ============================================================
  if (!result.criada) {
    return json(
      {
        ok: true,
        duplicada: true,
        // ⚠️ `abreCheckout` e não `safraAberta`: safra aberta SEM VAGA
        // grava lista de espera, e a mensagem tem que contar a mesma
        // história que o banco registrou.
        message: abreCheckout ? DUPLICATE_MESSAGE : DUPLICATE_MESSAGE_ESPERA,
      },
      200,
    )
  }

  return json(
    { ok: true, message: abreCheckout ? SUCCESS_MESSAGE : SUCCESS_MESSAGE_ESPERA },
    200,
  )
}
