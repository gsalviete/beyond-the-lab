import { after } from 'next/server'
import {
  buscarSafraAtiva,
  criarInscricao,
  SupabaseNotConfiguredError,
  type SafraAtiva,
} from '@/lib/supabase'
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
function json(body: { ok: boolean; message: string; duplicada?: boolean }, status: number) {
  return Response.json(body, { status })
}

const SUCCESS_MESSAGE = 'Pronto! Sua inscrição está confirmada.'
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
  // ⚠️ `payment_choice` NÃO ESTÁ NA LISTA (D-11), e não é esquecimento.
  // O schema ainda o aceita e a modal ainda o envia — os dois só saem no
  // `c25`, junto com a pergunta na tela —, mas a coluna não existe mais e
  // `criar_inscricao` não tem parâmetro para ele. Ele morre exatamente
  // aqui: é lido do corpo por ninguém e não chega ao banco por caminho
  // nenhum. O campo perguntava "quer pagar agora?" numa tela onde pagar
  // era logicamente impossível, e os dois valores gravavam igual — não
  // era bug de implementação, era o modelo avisando que a etapa não
  // existia. A partir do `c35` a ramificação passa a ser
  // `safra aberta ? checkout : lista de espera`, decidida no servidor.
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
  // `null` quando a safra não está ABERTA, e não quando ela não existe. É
  // o mesmo booleano que decide a escrita: um e-mail dizendo "sua turma
  // começa em setembro" para quem foi gravada em `lista_espera` seria a
  // promessa que o banco não registrou.
  const safraParaEmail = safraAberta ? safra : null
  const safraId = safraParaEmail?.id ?? null

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
      // ⚠️ `payment_choice` ainda é exigido por `InscricaoEmail` e some
      // no `c25`, junto com a pergunta na modal e o rótulo em
      // `email.ts`. Aqui ele é uma CONSTANTE derivada do estado da
      // safra, não o que o cliente mandou: o valor do payload foi
      // descartado no corte de fronteira lá em cima, e o e-mail da
      // Giovana continua imprimindo a linha "Pagamento" enquanto o campo
      // existir. Nada disto chega ao banco por caminho nenhum (D-11).
      payment_choice: (safraAberta ? 'agora' : 'depois') as 'agora' | 'depois',
    }

    after(async () => {
      await Promise.allSettled([
        notificarAdmin(paraEmail, safraParaEmail),
        confirmarInscricao(paraEmail, safraParaEmail),
      ])
    })
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
        message: safraAberta ? DUPLICATE_MESSAGE : DUPLICATE_MESSAGE_ESPERA,
      },
      200,
    )
  }

  return json(
    { ok: true, message: safraAberta ? SUCCESS_MESSAGE : SUCCESS_MESSAGE_ESPERA },
    200,
  )
}
