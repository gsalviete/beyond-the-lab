// ============================================================
// E-MAILS TRANSACIONAIS — EXCLUSIVAMENTE server-side.
//
// `server-only` faz o build quebrar se alguém importar este módulo de um
// client component. É a mesma rede de segurança de `supabase.ts`: sem ela,
// a RESEND_API_KEY poderia acabar no bundle do navegador.
//
// Falamos com a API do Resend por `fetch`, sem o SDK — mesmo raciocínio que
// deixou o `@supabase/supabase-js` de fora: a operação é UMA requisição POST
// para um endpoint estável. O SDK traria retries, tipos de webhook e batch
// para o bundle do servidor sem nenhum uso. Se um dia houver templates,
// audiences ou webhooks, vale reconsiderar.
//
// ⚠️ REGRA CENTRAL DESTE ARQUIVO: nenhuma função exportada daqui lança
// exceção. Um e-mail que falha não pode derrubar uma inscrição que JÁ foi
// gravada no banco — o dado da pessoa está salvo, e é isso que importa.
// Erro vira log no servidor e morre aqui.
// ============================================================
import 'server-only'

// `src/config/curso.ts` é um módulo NEUTRO — sem `'use client'`, sem JSX,
// sem hook, sem nada de `window`: só `Intl` e aritmética sobre string. É o
// mesmo módulo que `InscricaoModal.jsx` importa no navegador e que este
// arquivo `server-only` importa aqui. Essa neutralidade é o que permite a
// tela de sucesso e o e-mail dizerem a MESMA frase a partir da MESMA
// função, em vez de duas cópias que divergem na primeira edição — é o
// padrão que `consentimento.ts` e `dominio.ts` já provaram no repositório.
import { INSTAGRAM_URL, formatarSemanaDeInicio } from '@/config/curso'
// Os rótulos vêm do domínio, não de uma cópia local. Ver o bloco RÓTULOS
// mais abaixo para o que isso desfaz.
import {
  ROTULO_NIVEL_INGLES,
  listarDias,
  type DiaDaSemana,
  type NivelIngles,
} from '@/config/dominio'
import type { Safra } from '@/lib/supabase'

/**
 * O que os dois e-mails de fato leem da safra: o nome e a data de início.
 *
 * ⚠️ ERA `Safra` INTEIRA, E ESTREITOU NO `c42`, por necessidade e não por
 * capricho. Quem passa este objeto deixou de ser só a rota de inscrição —
 * o webhook do Stripe também manda a confirmação, depois do pagamento, e
 * ele teria que carregar oito colunas de `safras` para preencher um tipo
 * que usa duas. `valor_mensal` e `duracao_meses` são o caso mais claro:
 * pela D-06 o que vale para quem pagou é o valor TRAVADO na inscrição, e
 * um campo com o preço atual da safra viajando até aqui é um número certo
 * para a pessoa errada esperando alguém imprimi-lo por engano.
 *
 * `Pick` sobre `Safra` e não um tipo solto: assim ele continua derivado do
 * schema, e renomear uma coluna quebra este arquivo em vez de o deixar
 * mentindo. É o corte de fronteira do REPORT §9.6 aplicado ao e-mail —
 * carregar o mínimo, com o corte explícito no ponto onde acontece.
 */
export type SafraDoEmail = Pick<Safra, 'nome' | 'data_inicio_aulas'>

// Nenhuma com prefixo NEXT_PUBLIC_, de propósito: o Next só expõe ao cliente
// as variáveis com esse prefixo. Sem ele, elas nunca saem do servidor.
const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE
const EMAIL_ADMIN = process.env.EMAIL_ADMIN

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Nome exibido antes do endereço quando `EMAIL_REMETENTE` é só o endereço cru. */
const REMETENTE_NOME = 'Beyond The Lab'

/**
 * Os dados da inscrição que os e-mails precisam ver.
 *
 * É de propósito um tipo próprio, e não o parâmetro de `criarInscricao`: o
 * e-mail não tem nada que fazer com `consent_text`, `consent_at` ou
 * `safra_id`. O que não é preciso para escrever a mensagem não entra aqui.
 */
export type InscricaoEmail = {
  name: string
  email: string
  /** E.164 — '+5511987654321'. Ver `src/lib/telefone.ts`. */
  phone: string
  nivel_ingles: NivelIngles
  curso: string
  periodo: string
  disponibilidade: DiaDaSemana[]
}

// ============================================================
// RÓTULOS
//
// Aqui havia duas cópias — `ROTULO_NIVEL` e `ROTULO_DIA` — com um
// comentário honesto explicando por que existiam: "espelham os `rotulo`
// de `NIVEIS` e `DIAS` em `InscricaoModal.jsx`. Não importo de lá porque
// aquele módulo é client (`'use client'`, hooks, JSX) e arrastá-lo para o
// servidor por causa de dois mapas seria pior do que a duplicação. Se um
// dia mudarem, mudam nos dois lugares."
//
// O diagnóstico estava certo e a conclusão estava errada — havia uma
// terceira saída, e o `src/config/consentimento.ts` já a tinha provado no
// mesmo repositório: um módulo NEUTRO, que não é client nem server, do
// qual os dois lados importam. É o que `src/config/dominio.ts` é.
//
// Agora este arquivo lê o mesmo `ROTULO_NIVEL_INGLES` que a modal usa
// para desenhar o <select>. Não uma cópia igual: o mesmo objeto. Se
// "Intermediário" virar outra coisa amanhã, muda num lugar e chega aos
// quatro — tela, e-mail, Zod e a lista que o CHECK do SQL espelha.
//
// ⚠️ O QUE **NÃO** VEM DO DOMÍNIO, E POR QUE NÃO
//
// As cores e a fonte deste arquivo (`COR`, `FONTE`) continuam literais, e
// isso não é dívida a pagar depois. Não existe forma de referenciar uma
// classe do Tailwind dentro de um e-mail: o Gmail remove `<style>` e o
// Outlook renderiza com o motor do Word, então tudo é atributo inline. Os
// valores foram copiados dos tokens à mão de propósito — ver o bloco
// CORES logo abaixo.
//
// A regra é essa: **rótulo vem do domínio; token visual continua
// literal.** Um é vocabulário de negócio, compartilhado com a tela e com
// o banco. O outro é uma restrição de cliente de e-mail que nenhuma
// abstração nossa remove.
// ============================================================

// ⚠️ AQUI HAVIA `ROTULO_PAGAMENTO` — 'Quer pagar agora' / 'Prefere pagar
// depois' —, o único mapa de rótulos que este arquivo ainda mantinha
// local. Ele saiu com a pergunta (D-11), e não volta.
//
// Nunca foi levado para o `dominio.ts` de propósito: trazer os rótulos de
// um campo condenado para a fonte única seria dar sobrevida a um domínio
// que a refatoração existe para remover. O campo perguntava "quer pagar
// agora?" numa tela sem checkout, e os dois valores gravavam igual —
// preferência coletada e descartada.
//
// A LINHA "PAGAMENTO" DO E-MAIL DA GIOVANA SUMIU JUNTO, nos dois formatos,
// e isso é decisão de negócio, não limpeza de código. Ela não virou "—",
// não virou "(não perguntado)" e não vira nenhuma outra coisa: este e-mail
// é OPERACIONAL, existe para a Giovana saber com quem falar e o que fazer
// em seguida. A linha "Turma" já diz o que importa sobre dinheiro — quem
// tem vaga numa safra e quem está em lista de espera. Um campo que não
// muda nenhuma ação dela é ruído numa mensagem que ela lê no celular.

// ============================================================
// CORES — derivadas de `tailwind.config.js`, não de design/SPEC.md.
//
// Valores literais porque cliente de e-mail não resolve variável CSS nem
// classe utilitária: tudo tem que chegar inline no atributo `style`.
// ============================================================
const COR = {
  ink: '#022D57',
  body: '#345372',
  muted: '#6B7C93',
  brand: '#F75883',
  borda: '#E8E3E3',
  rose50: '#FFF5F8',
  rose100: '#FFE8EF',
  branco: '#FFFFFF',
} as const

// ============================================================
// HELPERS
// ============================================================

/**
 * Escapa texto para interpolação segura em HTML.
 *
 * Não é decorativo: `name`, `curso` e `periodo` são texto livre digitado
 * por quem se inscreveu. Sem isto, um nome com `<` quebraria a mensagem —
 * e, no e-mail que a Giovanna abre, seria markup escolhido por terceiro
 * renderizando no cliente dela.
 */
function esc(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** '+5511987654321' → '+55 (11) 98765-4321'. Devolve o original se não casar. */
function telefoneLegivel(e164: string): string {
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : e164
}

/** '+5511987654321' → 'https://wa.me/5511987654321'. */
function linkWhatsApp(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}`
}

/**
 * Em que semana as aulas começam — "na primeira semana de setembro" —, ou
 * `null` quando não há safra.
 *
 * ⚠️ AQUI HAVIA `inicioPorExtenso()`, que devolvia "1 de setembro de 2026"
 * a partir de `formatarDataPorExtenso(paraDataUTC(...))`. Ela saiu por dois
 * motivos, e o segundo é o que importa:
 *
 *   1. O valor que ela produzia NÃO ERA IMPRESSO em lugar nenhum. Desde que
 *      a frase virou literal, ela era usada só como booleano "existe safra?"
 *      — uma data formatada com todo o cuidado de fuso para ser jogada fora.
 *
 *   2. A data por extenso é justamente o que a D-14 proíbe no e-mail. Pela
 *      D-01 a safra tem calendário e o grupo é só um horário dentro dela:
 *      quem cai no grupo de quarta não começa na segunda. "1 de setembro de
 *      2026" seria uma promessa que o produto não faz para a maior parte
 *      das inscritas — e é exatamente o diagnóstico que pôs o literal no
 *      código. `formatarSemanaDeInicio` mantém o diagnóstico e desfaz o
 *      congelamento: a frase volta a sair de `data_inicio_aulas` sem nunca
 *      imprimir o dia.
 *
 * `null` continua sendo o sinal de "não há safra", e continua decidindo
 * assunto, título e abertura do e-mail da inscrita. Ver `montarInscrita`.
 *
 * ⚠️ SOBRE A REGRA "NENHUMA FUNÇÃO DAQUI LANÇA" (topo do arquivo). Esta
 * chamada é a primeira formatação de data do arquivo que pode levantar:
 * `formatarSemanaDeInicio` parte a string em componentes e a entrega ao
 * `Intl`, e um `data_inicio_aulas` corrompido produziria `Invalid Date`,
 * que o `Intl` recusa com `RangeError`. O tipo `Safra` diz `string` e a
 * coluna é `date not null`, então o caso é improvável — mas "improvável"
 * não é "impossível", e a rede já existe: `confirmarInscricao` envolve a
 * MONTAGEM inteira num try/catch, exatamente para isto. O comportamento
 * externo continua idêntico ao de antes deste commit — log no servidor,
 * `Promise<void>` resolvida, inscrição gravada intacta.
 *
 * Não há guarda a mais aqui de propósito. Trocar a falha por um fallback
 * silencioso faria o e-mail cair no texto de LISTA DE ESPERA para quem
 * acabou de se inscrever numa safra aberta — dizer "não há turma" a quem
 * tem vaga é pior que não mandar e-mail nenhum e ver o erro no log.
 */
function semanaDeInicioDaSafra(safra: SafraDoEmail | null): string | null {
  if (!safra) return null
  return formatarSemanaDeInicio(safra.data_inicio_aulas)
}

/**
 * Envia uma mensagem pelo Resend. **Nunca lança.**
 *
 * Devolve `true`/`false` só para o log de quem chamou — nenhum chamador
 * muda de comportamento em função disso, e é essa a intenção.
 *
 * Sobre o que é logado: status HTTP e o identificador da inscrição (o
 * e-mail, que é a chave única da `waitlist`). Nunca o corpo da mensagem,
 * nunca a API key, nunca o payload inteiro.
 */
async function enviar(opts: {
  para: string
  assunto: string
  html: string
  texto: string
  /** Identificador da inscrição, só para o log. */
  ref: string
  /**
   * Qual e-mail é este, só para o log.
   *
   * ⚠️ ERAM DOIS ('admin' e 'confirmacao') E HOJE SÃO QUATRO — o `c55`
   * acrescentou 'convite' e 'pendente'. O tipo continua `string` e não uma
   * união fechada de propósito: ele não decide nada, não é lido por
   * ninguém além do `console`, e fechá-lo criaria uma lista para manter em
   * dia sem nenhum comportamento amarrado a ela.
   */
  tipo: string
}): Promise<boolean> {
  const { para, assunto, html, texto, ref, tipo } = opts

  if (!RESEND_API_KEY || !EMAIL_REMETENTE || !EMAIL_ADMIN) {
    console.error(
      `[email] ${tipo} não enviado (${ref}): RESEND_API_KEY, EMAIL_REMETENTE ou EMAIL_ADMIN ausente no ambiente`,
    )
    return false
  }

  // Aceita tanto 'contato@dominio.com' quanto 'Nome <contato@dominio.com>'.
  // O Resend exige a segunda forma para exibir nome; deixar a escolha na
  // env evita ter que redeployar para mudar o rótulo do remetente.
  const from = EMAIL_REMETENTE.includes('<')
    ? EMAIL_REMETENTE
    : `${REMETENTE_NOME} <${EMAIL_REMETENTE}>`

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [para],
        // Responder cai no Gmail da Giovanna, e não num endereço que
        // ninguém lê. É o "jeito de tirar dúvidas" do rodapé.
        reply_to: EMAIL_ADMIN,
        subject: assunto,
        html,
        text: texto,
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      // O corpo do erro do Resend descreve a falha (domínio não
      // verificado, endereço inválido) sem conter a mensagem enviada.
      console.error(`[email] ${tipo} falhou (${ref}): HTTP ${res.status} — ${await res.text()}`)
      return false
    }

    console.info(`[email] ${tipo} enviado (${ref})`)
    return true
  } catch (err) {
    // Rede fora, DNS, timeout. Morre aqui: a inscrição já está gravada.
    console.error(`[email] ${tipo} erro de rede (${ref})`, err)
    return false
  }
}

// ============================================================
// TEMPLATES
//
// HTML de e-mail é HTML de 2003, e não por preguiça: Gmail remove <style>,
// Outlook renderiza com o motor do Word. Nada de flexbox, grid, variável
// CSS ou classe — só tabela e estilo inline.
//
// Nenhuma imagem, em nenhum dos dois. Cliente de e-mail bloqueia imagem
// por padrão, então logo remoto viraria retângulo vazio ou alt text solto.
// A identidade vem de cor de fundo e tipografia, que sempre chegam.
// ============================================================

const FONTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * Casca comum: fundo, cartão centrado, largura fixa de 600px.
 *
 * O `<meta charset>` não é ornamento — o texto é todo em português, e sem
 * ele um cliente que não herde o charset do cabeçalho MIME renderiza
 * "inscrição" como "inscriÃ§Ã£o". O `viewport` faz o cartão respeitar a
 * largura da tela nos apps de celular.
 */
function moldura(conteudo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beyond The Lab</title>
</head>
<body style="margin:0;padding:0;background-color:${COR.rose50};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.rose50};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${COR.branco};border:1px solid ${COR.borda};border-radius:12px;">
${conteudo}
</table>
</td></tr>
</table>
</body>
</html>`
}

/** Uma linha "Rótulo: valor" da tabela de dados. Já escapa o valor. */
function linhaDado(rotulo: string, valorHtml: string): string {
  return `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${COR.borda};font-family:${FONTE};font-size:14px;color:${COR.muted};width:38%;vertical-align:top;">${esc(rotulo)}</td>
<td style="padding:8px 0;border-bottom:1px solid ${COR.borda};font-family:${FONTE};font-size:14px;color:${COR.ink};font-weight:600;vertical-align:top;">${valorHtml}</td>
</tr>`
}

// ------------------------------------------------------------
// E-MAIL 1 — para a Giovanna. Operacional: densidade acima de enfeite.
// ------------------------------------------------------------
function montarAdmin(inscricao: InscricaoEmail, turma: SafraDoEmail | null) {
  const {
    name, email, phone, nivel_ingles, curso, periodo, disponibilidade,
  } = inscricao

  const wa = linkWhatsApp(phone)
  const telefone = telefoneLegivel(phone)
  const dias = listarDias(disponibilidade)
  const nivel = ROTULO_NIVEL_INGLES[nivel_ingles]
  const turmaTexto = turma ? turma.nome : 'Lista de espera (nenhuma turma aberta)'
  // Hora do servidor, em São Paulo. `dateStyle`/`timeStyle` curtos porque
  // isto é um carimbo de chegada, não uma data por extenso.
  const quando = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())

  const assunto = `Nova inscrição: ${name}`

  const html = moldura(`
<tr><td style="padding:24px 24px 8px 24px;font-family:${FONTE};">
<p style="margin:0;font-size:13px;color:${COR.muted};text-transform:uppercase;letter-spacing:1px;">Nova inscrição</p>
<h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.3;color:${COR.ink};font-weight:700;">${esc(name)}</h1>
<p style="margin:4px 0 0 0;font-size:13px;color:${COR.muted};">${esc(turmaTexto)} &middot; ${esc(quando)}</p>
</td></tr>
<tr><td style="padding:8px 24px 24px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${linhaDado('Nome', esc(name))}
${linhaDado('E-mail', `<a href="mailto:${esc(email)}" style="color:${COR.brand};text-decoration:underline;">${esc(email)}</a>`)}
${linhaDado('WhatsApp', `<a href="${esc(wa)}" style="color:${COR.brand};text-decoration:underline;">${esc(telefone)}</a>`)}
${linhaDado('Nível de inglês', esc(nivel))}
${linhaDado('Curso', esc(curso))}
${linhaDado('Período', esc(periodo))}
${linhaDado('Disponibilidade', esc(dias))}
${linhaDado('Turma', esc(turmaTexto))}
${linhaDado('Data e hora', esc(quando))}
</table>
<p style="margin:18px 0 0 0;font-family:${FONTE};font-size:13px;color:${COR.muted};line-height:1.5;">
Clique no WhatsApp para abrir a conversa direto com ela.
</p>
</td></tr>`)

  const texto = `NOVA INSCRIÇÃO — ${name}
${turmaTexto} · ${quando}

Nome: ${name}
E-mail: ${email}
WhatsApp: ${telefone} — ${wa}
Nível de inglês: ${nivel}
Curso: ${curso}
Período: ${periodo}
Disponibilidade: ${dias}
Turma: ${turmaTexto}
Data e hora: ${quando}
`

  return { assunto, html, texto }
}

// ------------------------------------------------------------
// E-MAIL 2 — para quem se inscreveu. Acolhedor, na voz do site.
//
// O texto muda conforme haja turma ou não, e a diferença não é cosmética:
// na lista de espera não existe data de início nem vaga garantida, e
// prometer qualquer uma das duas seria mentira.
// ------------------------------------------------------------
function montarInscrita(inscricao: InscricaoEmail, turma: SafraDoEmail | null) {
  const { name, email, phone, nivel_ingles, curso, periodo, disponibilidade } = inscricao

  // Uma coisa só, e continua sendo duas: o TEXTO da semana de início e o
  // sinal de "existe safra?". Voltar a imprimir o valor que já governava a
  // condicional é o que impede as duas de discordarem — um e-mail com o
  // título "deu certo!" e nenhuma data, ou com data e o texto de lista de
  // espera, precisariam de duas fontes divergindo, e agora não há duas.
  const semanaDeInicio = semanaDeInicioDaSafra(turma)
  const primeiroNome = name.trim().split(/\s+/)[0]
  const dias = listarDias(disponibilidade)
  const nivel = ROTULO_NIVEL_INGLES[nivel_ingles]
  const telefone = telefoneLegivel(phone)

  const assunto = semanaDeInicio
    ? 'Inscrição recebida — Beyond The Lab'
    : 'Você está na lista de espera — Beyond The Lab'

  // As frases que mudam entre os dois modos. Ficam juntas aqui, e não
  // espalhadas por ternários no meio do HTML, para dar para ler o que cada
  // modo promete sem montar a mensagem de cabeça.
  //
  // O título muda junto com o resto de propósito: "deu certo!" sobre uma
  // entrada em lista de espera soaria como vaga confirmada, que é
  // exatamente o que este modo não pode prometer.
  const titulo = semanaDeInicio
    ? `${primeiroNome}, deu certo!`
    : `${primeiroNome}, recebemos seu cadastro`

  const abertura = semanaDeInicio
    ? `Recebemos sua inscrição no Beyond The Lab. Deu tudo certo — agora é com a gente.`
    : `Recebemos seu cadastro no Beyond The Lab. No momento não há turma com inscrições abertas, então você entrou na lista de espera.`

  // ⚠️ A DATA DE INÍCIO VOLTOU A SAIR DO BANCO, e esta é a última das
  // quatro superfícies da tensão 8.1 do `REPORT.md` a fechar.
  //
  // O texto era o literal "primeira semana de setembro de 2026", e o
  // comentário que ocupava este lugar explicava por quê: a turma começa num
  // dia escolhido pela aluna, e uma coluna `date` exibida seca não
  // representa isso. O diagnóstico estava certo — a solução é que congelou a
  // informação fora do banco. Enquanto `data_inicio_aulas` avançasse para
  // janeiro, a caixa de entrada de quem acabou de se inscrever continuaria
  // dizendo setembro de 2026, para sempre e sem ninguém perceber. Era a
  // única forma da 8.1 que chega à pessoa DEPOIS que ela já decidiu.
  //
  // `formatarSemanaDeInicio` (D-14) mantém o diagnóstico e desfaz o
  // congelamento: devolve "na primeira semana de setembro" a partir da
  // própria data, sem nunca imprimir o dia. O que era um literal por falta
  // de formatação virou uma formatação — e é a MESMA função que a tela de
  // sucesso da modal chama, então as duas superfícies não têm como divergir.
  //
  // ⚠️ E QUANDO NÃO HÁ SAFRA, O E-MAIL NÃO FALA EM DATA. Nenhuma.
  //
  // Este era o pior efeito do literal, e ele era silencioso: a frase estava
  // no ramo verdadeiro de uma condicional que a `route.ts` só toma quando a
  // safra existe E está aberta — mas a landing e o e-mail antigos afirmavam
  // setembro de 2026 sem consultar nada, então bastava a safra do banco ter
  // outra data para o e-mail mentir. Agora não há literal para mentir: sem
  // safra, o ramo de lista de espera diz o que sempre disse ("assim que a
  // próxima turma abrir, você recebe um e-mail nosso") e nada mais. Sem
  // fallback, sem data inventada, sem `undefined` impresso. É a mesma regra
  // da landing — nunca afirmar o que não se sabe.
  //
  // ⚠️ VALOR E DURAÇÃO NÃO ENTRAM AQUI, e a ausência é deliberada: não
  // havia literal de preço nem de prazo neste arquivo para substituir, e
  // acrescentar "R$ X/mês por N meses" ao e-mail seria escrever promessa
  // nova de dinheiro, não desfazer um congelamento. A frase que este e-mail
  // faz sobre pagamento continua sendo a mesma do rodapé do formulário e da
  // tela de sucesso, palavra por palavra — uma promessa por evento.
  const proximos = semanaDeInicio
    ? `As aulas começam <strong style="color:${COR.ink};">${esc(semanaDeInicio)}</strong>. Os próximos passos chegam por e-mail, aqui mesmo. As informações de pagamento também vêm por e-mail, antes do início das aulas. O convite para o grupo no WhatsApp é enviado mais perto da primeira aula.`
    : `Assim que a próxima turma abrir, você recebe um e-mail nosso — antes do anúncio público. Não é preciso fazer mais nada agora.`

  const proximosTexto = semanaDeInicio
    ? `As aulas começam ${semanaDeInicio}. Os próximos passos chegam por e-mail, aqui mesmo. As informações de pagamento também vêm por e-mail, antes do início das aulas. O convite para o grupo no WhatsApp é enviado mais perto da primeira aula.`
    : `Assim que a próxima turma abrir, você recebe um e-mail nosso — antes do anúncio público. Não é preciso fazer mais nada agora.`

  const html = moldura(`
<tr><td style="padding:28px 24px 0 24px;font-family:${FONTE};">
<p style="margin:0;font-size:13px;color:${COR.brand};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Beyond The Lab</p>
<h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:${COR.ink};font-weight:700;">${esc(titulo)}</h1>
<p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:${COR.body};">${abertura}</p>
</td></tr>

<tr><td style="padding:22px 24px 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.rose100};border-radius:10px;">
<tr><td style="padding:16px 18px;font-family:${FONTE};">
<p style="margin:0 0 10px 0;font-size:13px;color:${COR.ink};font-weight:700;">O que você nos contou</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">Nome: <strong style="color:${COR.ink};">${esc(name)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">E-mail: <strong style="color:${COR.ink};">${esc(email)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">WhatsApp: <strong style="color:${COR.ink};">${esc(telefone)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">Nível de inglês: <strong style="color:${COR.ink};">${esc(nivel)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">Curso: <strong style="color:${COR.ink};">${esc(curso)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">Período: <strong style="color:${COR.ink};">${esc(periodo)}</strong></td></tr>
<tr><td style="padding:3px 0;font-family:${FONTE};font-size:14px;color:${COR.body};">Dias disponíveis: <strong style="color:${COR.ink};">${esc(dias)}</strong></td></tr>
</table>
<p style="margin:12px 0 0 0;font-size:13px;color:${COR.muted};line-height:1.5;">Viu algo errado? É só responder este e-mail que a gente corrige.</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:22px 24px 0 24px;font-family:${FONTE};">
<p style="margin:0 0 6px 0;font-size:15px;color:${COR.ink};font-weight:700;">O que acontece agora</p>
<p style="margin:0;font-size:15px;line-height:1.6;color:${COR.body};">${proximos}</p>
</td></tr>

<tr><td style="padding:22px 24px 28px 24px;font-family:${FONTE};border-top:1px solid ${COR.borda};">
<p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:${COR.body};">
Enquanto isso, acompanhe o dia a dia no Instagram:
<a href="${INSTAGRAM_URL}" style="color:${COR.brand};text-decoration:underline;font-weight:600;">@giovanna.embrio</a>
</p>
<p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:${COR.body};">
Até logo,<br>
<strong style="color:${COR.ink};">Giovanna</strong><br>
<span style="color:${COR.muted};">Beyond The Lab</span>
</p>
<p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:${COR.muted};">
Dúvida? Responda este e-mail — ele chega direto para a Giovanna.
</p>
</td></tr>`)

  const texto = `${titulo}

${abertura}

O QUE VOCÊ NOS CONTOU
Nome: ${name}
E-mail: ${email}
WhatsApp: ${telefone}
Nível de inglês: ${nivel}
Curso: ${curso}
Período: ${periodo}
Dias disponíveis: ${dias}

Viu algo errado? É só responder este e-mail que a gente corrige.

O QUE ACONTECE AGORA
${proximosTexto}

Enquanto isso, acompanhe o dia a dia no Instagram: ${INSTAGRAM_URL}

Até logo,
Giovanna
Beyond The Lab

Dúvida? Responda este e-mail — ele chega direto para a Giovanna.
`

  return { assunto, html, texto }
}

// ============================================================
// O CONVITE — um mecanismo, dois usos (D-10 e D-15)
// ============================================================
//
// O MESMO e-mail serve a duas situações, e a única coisa que muda entre
// elas é o texto:
//
//   'convite'  → D-10. A base atual, que se cadastrou quando não havia
//                nada para comprar. O link poupa a pessoa de digitar
//                nome, e-mail e telefone de novo.
//   'pendente' → D-15. Quem abriu o checkout e não concluiu, e está presa
//                em `pendente_pagamento` sem saber. Ela não tem como sair
//                sozinha: refazer o formulário devolveria "você já está
//                inscrita". O link é a saída.
//
// ⚠️ O LINK É O MESMO NOS DOIS CASOS, e é o token da `017` — nunca um
// `inscricao_id` cru. Uma URL é copiada, encaminhada, indexada e fica em
// histórico de navegador para sempre; um id que abre checkout é, na
// prática, uma credencial sem expiração, exatamente o que a D-10 proíbe.
// O token expira, identifica a pessoa e NÃO autoriza: chegando por ele, o
// servidor procura a inscrição pendente daquela pessoa.
//
// ⚠️ ESTA FUNÇÃO MANDA PARA UMA PESSOA, E NUNCA PARA UMA LISTA. Não há
// laço aqui, e a ausência é decisão: o disparo para a base inteira sai do
// CSV de `supabase/operacao/gerar_convites.sql`, revisado à mão. Um
// mecanismo que manda e-mail sozinho para todo mundo é a coisa mais fácil
// de errar neste projeto, e o erro não tem desfazer.

/** O que o convite precisa saber. Contato, link e — se houver — o cupom. */
export type ConviteEmail = {
  nome: string
  email: string
  /** A URL completa, com `?convite=<token>`. Montada por quem chama. */
  link: string
  /**
   * O desconto que acompanha este convite, já descrito em português.
   *
   * ⚠️ `codigo` VAI JUNTO MESMO COM O LINK PRÉ-PREENCHENDO O CAMPO. Não é
   * redundância: cliente de e-mail que bloqueia HTML, link copiado sem os
   * parâmetros, ou a pessoa entrando pelo site direto num outro dia — nos
   * três casos o código escrito é o que salva. Um desconto que só existe
   * dentro de uma URL é um desconto que some quando a URL some.
   */
  cupom?: { codigo: string; descricao: string } | null
}

export type MotivoDoConvite = 'convite' | 'pendente'

function montarConvite(
  convite: ConviteEmail,
  turma: SafraDoEmail | null,
  motivo: MotivoDoConvite,
) {
  const primeiroNome = convite.nome.trim().split(/\s+/)[0]
  const semanaDeInicio = semanaDeInicioDaSafra(turma)
  const pendente = motivo === 'pendente'

  // As frases que mudam entre os dois modos ficam juntas aqui, e não
  // espalhadas por ternários no meio do HTML — dá para ler o que cada modo
  // promete sem montar a mensagem de cabeça. É a mesma forma de
  // `montarInscrita`.
  const assunto = pendente
    ? 'Sua inscrição está esperando o pagamento — Beyond The Lab'
    : 'As inscrições abriram — Beyond The Lab'

  const titulo = pendente
    ? `${primeiroNome}, faltou só o pagamento`
    : `${primeiroNome}, chegou a sua vez`

  // ⚠️ NENHUM DOS DOIS TEXTOS PROMETE VAGA, PREÇO OU DESCONTO.
  //
  // O modo 'convite' vai para quem está na lista de espera há meses, e a
  // tentação de escrever "sua vaga está garantida" é grande — seria
  // mentira: vaga é limite mole (D-08) e quem entra é quem paga (D-02).
  // O modo 'pendente' vai para quem já viu um preço na tela do Stripe, e
  // repetir o número aqui abriria a chance de os dois divergirem depois de
  // uma edição da safra. Quem mostra o valor é o checkout, que lê o
  // contrato travado da própria inscrição (D-06).
  const abertura = pendente
    ? `Você começou sua inscrição no Beyond The Lab e o pagamento não chegou a ser concluído. Sua inscrição continua guardada — é só terminar pelo link abaixo, sem preencher nada de novo.`
    : `As inscrições da próxima turma do Beyond The Lab estão abertas, e você está na nossa lista desde antes de existir turma. O link abaixo já abre o formulário com os seus dados preenchidos.`

  const rotuloBotao = pendente ? 'Concluir meu pagamento' : 'Quero minha vaga'

  // ⚠️ O BLOCO DO CUPOM SÓ EXISTE QUANDO HÁ CUPOM. Uma seção "seu
  // desconto" vazia, ou com um traço, seria pior que ausência: ela
  // promete e não entrega, e quem lê rápido só registra a promessa.
  const cupom = convite.cupom ?? null

  // A data de início entra quando existe safra, pela mesma regra de
  // sempre: derivada de `data_inicio_aulas` e nunca seca (D-14).
  const quando = semanaDeInicio
    ? `As aulas começam <strong style="color:${COR.ink};">${esc(semanaDeInicio)}</strong>.`
    : ''

  const quandoTexto = semanaDeInicio ? `As aulas começam ${semanaDeInicio}.` : ''

  // ⚠️ O LINK APARECE DUAS VEZES: como botão e como URL escrita por
  // extenso logo abaixo. Não é redundância — cliente de e-mail que bloqueia
  // HTML mostra só a segunda, e é ela que a pessoa copia e cola. Um convite
  // que só funciona com imagens habilitadas é um convite que não chega para
  // parte da lista.
  const html = moldura(`
<tr><td style="padding:28px 24px 0 24px;font-family:${FONTE};">
<p style="margin:0;font-size:13px;color:${COR.brand};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Beyond The Lab</p>
<h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:${COR.ink};font-weight:700;">${esc(titulo)}</h1>
<p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:${COR.body};">${abertura}</p>
${quando ? `<p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${COR.body};">${quando}</p>` : ''}
</td></tr>

${
  cupom
    ? `<tr><td style="padding:20px 24px 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.rose100};border-radius:10px;">
<tr><td style="padding:16px 18px;font-family:${FONTE};text-align:center;">
<p style="margin:0;font-size:14px;line-height:1.5;color:${COR.body};">Você tem <strong style="color:${COR.ink};">${esc(cupom.descricao)}</strong></p>
<p style="margin:10px 0 0 0;font-size:20px;line-height:1.2;color:${COR.ink};font-weight:700;letter-spacing:1px;">${esc(cupom.codigo)}</p>
<p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:${COR.muted};">O código já vem preenchido pelo botão abaixo. Se precisar, digite no formulário.</p>
</td></tr>
</table>
</td></tr>`
    : ''
}

<tr><td style="padding:24px 24px 0 24px;font-family:${FONTE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background-color:${COR.brand};border-radius:999px;">
<a href="${esc(convite.link)}" style="display:inline-block;padding:14px 28px;font-family:${FONTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(rotuloBotao)}</a>
</td></tr></table>
<p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:${COR.muted};word-break:break-all;">
Se o botão não funcionar, copie e cole este endereço no navegador:<br>${esc(convite.link)}
</p>
</td></tr>

<tr><td style="padding:22px 24px 28px 24px;font-family:${FONTE};border-top:1px solid ${COR.borda};">
<p style="margin:18px 0 0 0;font-size:13px;line-height:1.5;color:${COR.muted};">
Este link é pessoal e tem prazo de validade. Se ele expirar, é só se inscrever normalmente pelo site — nada se perde.
</p>
<p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:${COR.body};">
Até logo,<br>
<strong style="color:${COR.ink};">Giovanna</strong><br>
<span style="color:${COR.muted};">Beyond The Lab</span>
</p>
<p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:${COR.muted};">
Dúvida? Responda este e-mail — ele chega direto para a Giovanna.
</p>
</td></tr>`)

  const texto = `${titulo}

${abertura}
${quandoTexto ? `\n${quandoTexto}\n` : ''}${
    cupom ? `\nSEU DESCONTO: ${cupom.descricao}\nCódigo: ${cupom.codigo}\n` : ''
  }
${rotuloBotao}: ${convite.link}

Este link é pessoal e tem prazo de validade. Se ele expirar, é só se
inscrever normalmente pelo site — nada se perde.

Até logo,
Giovanna
Beyond The Lab

Dúvida? Responda este e-mail — ele chega direto para a Giovanna.`

  return { assunto, html, texto }
}

// ============================================================
// API PÚBLICA
//
// As duas seguem o mesmo contrato: recebem a inscrição e a turma (ou
// null), montam, mandam, e NUNCA lançam.
// ============================================================

/** Avisa a Giovanna de uma inscrição nova. Não lança. */
export async function notificarAdmin(
  inscricao: InscricaoEmail,
  turma: SafraDoEmail | null,
): Promise<void> {
  try {
    if (!EMAIL_ADMIN) {
      console.error(`[email] admin não enviado (${inscricao.email}): EMAIL_ADMIN ausente no ambiente`)
      return
    }
    const { assunto, html, texto } = montarAdmin(inscricao, turma)
    await enviar({ para: EMAIL_ADMIN, assunto, html, texto, ref: inscricao.email, tipo: 'admin' })
  } catch (err) {
    // Rede a função `enviar` já cobre. Este catch pega o improvável:
    // erro na MONTAGEM da mensagem. Sem ele, um dado inesperado viraria
    // uma rejeição não tratada dentro do `after`.
    console.error(`[email] admin erro ao montar (${inscricao.email})`, err)
  }
}

/** Confirma para quem se inscreveu. Não lança. */
export async function confirmarInscricao(
  inscricao: InscricaoEmail,
  turma: SafraDoEmail | null,
): Promise<void> {
  try {
    const { assunto, html, texto } = montarInscrita(inscricao, turma)
    await enviar({
      para: inscricao.email,
      assunto,
      html,
      texto,
      ref: inscricao.email,
      tipo: 'confirmacao',
    })
  } catch (err) {
    console.error(`[email] confirmacao erro ao montar (${inscricao.email})`, err)
  }
}

/**
 * Convida UMA pessoa. Não lança — mesmo contrato das outras duas.
 *
 * ⚠️ Quem monta o `link` é o chamador, e não esta função. O token vem do
 * banco (`pessoas.token_acesso`) e a base da URL depende do ambiente —
 * juntar os dois aqui dentro exigiria que este módulo conhecesse
 * `NEXT_PUBLIC_SITE_URL`, e ele não conhece nem precisa.
 */
export async function convidarParaInscricao(
  convite: ConviteEmail,
  turma: SafraDoEmail | null,
  motivo: MotivoDoConvite,
): Promise<void> {
  try {
    const { assunto, html, texto } = montarConvite(convite, turma, motivo)
    await enviar({
      para: convite.email,
      assunto,
      html,
      texto,
      ref: convite.email,
      tipo: motivo === 'pendente' ? 'pendente' : 'convite',
    })
  } catch (err) {
    // Rede a função `enviar` já cobre. Este catch pega o improvável: erro
    // na MONTAGEM da mensagem. Sem ele, um dado inesperado viraria uma
    // rejeição não tratada em quem chamar.
    console.error(`[email] convite erro ao montar (${convite.email})`, err)
  }
}

/**
 * Avisa a Giovanna de uma cobrança recusada (`c56`). Não lança.
 *
 * ============================================================
 * ⚠️ É O ÚNICO EVENTO DESTE SISTEMA QUE GRITA, E POR ISSO ELE EXISTE
 * ============================================================
 *
 * Cobrança recusada é a única coisa do fluxo de pagamento que EXIGE uma
 * pessoa fazer alguma coisa — e a Giovanna não tem como descobrir
 * sozinha: o Stripe avisa por e-mail a ALUNA, não a professora. Sem este
 * alerta, uma inadimplência só aparece quando alguém abre o painel por
 * outro motivo, ou quando a aluna some da aula.
 *
 * ⚠️ ELE NÃO VAI PARA A ALUNA. O Stripe já manda o aviso de cobrança
 * recusada para ela, com o link para atualizar o cartão — um segundo
 * e-mail nosso sobre o mesmo assunto, com outra redação, faria duas
 * fontes falarem do mesmo problema e a pessoa não saber qual seguir.
 *
 * ⚠️ E ELE NÃO DIZ O QUE FAZER. "Cobre pelo WhatsApp", "cancele a
 * inscrição", "espere a retentativa" — nenhuma dessas decisões é do
 * código. O e-mail informa; quem decide é ela, e é para isso que o painel
 * existe (D-07).
 */
export async function alertarCobrancaFalhada(
  inscricao: Pick<InscricaoEmail, 'name' | 'email' | 'phone'>,
  turma: SafraDoEmail | null,
): Promise<void> {
  try {
    if (!EMAIL_ADMIN) {
      console.error(
        `[email] alerta não enviado (${inscricao.email}): EMAIL_ADMIN ausente no ambiente`,
      )
      return
    }

    const telefone = telefoneLegivel(inscricao.phone)
    const turmaTexto = turma ? turma.nome : 'sem turma registrada'
    const assunto = `⚠️ Cobrança recusada — ${inscricao.name}`

    const html = moldura(`
<tr><td style="padding:28px 24px 0 24px;font-family:${FONTE};">
<p style="margin:0;font-size:13px;color:${COR.brand};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Beyond The Lab</p>
<h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:${COR.ink};font-weight:700;">Uma cobrança foi recusada</h1>
<p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:${COR.body};">
O cartão de <strong style="color:${COR.ink};">${esc(inscricao.name)}</strong> foi recusado, e a inscrição dela está marcada como inadimplente no painel.
</p>
</td></tr>

<tr><td style="padding:22px 24px 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COR.rose100};border-radius:10px;">
<tr><td style="padding:16px 18px;font-family:${FONTE};">
${linhaDado('Aluna', `<strong style="color:${COR.ink};">${esc(inscricao.name)}</strong>`)}
${linhaDado('E-mail', `<strong style="color:${COR.ink};">${esc(inscricao.email)}</strong>`)}
${linhaDado('WhatsApp', `<a href="${linkWhatsApp(inscricao.phone)}" style="color:${COR.brand};text-decoration:underline;font-weight:600;">${esc(telefone)}</a>`)}
${linhaDado('Turma', `<strong style="color:${COR.ink};">${esc(turmaTexto)}</strong>`)}
</td></tr>
</table>
</td></tr>

<tr><td style="padding:22px 24px 28px 24px;font-family:${FONTE};border-top:1px solid ${COR.borda};">
<p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:${COR.body};">
O Stripe já avisou a aluna e vai tentar cobrar de novo automaticamente nos próximos dias. Este aviso é só para você saber que aconteceu.
</p>
</td></tr>`)

    const texto = `COBRANÇA RECUSADA

O cartão de ${inscricao.name} foi recusado, e a inscrição dela está
marcada como inadimplente no painel.

Aluna: ${inscricao.name}
E-mail: ${inscricao.email}
WhatsApp: ${telefone}
Turma: ${turmaTexto}

O Stripe já avisou a aluna e vai tentar cobrar de novo automaticamente
nos próximos dias. Este aviso é só para você saber que aconteceu.`

    await enviar({
      para: EMAIL_ADMIN,
      assunto,
      html,
      texto,
      ref: inscricao.email,
      tipo: 'alerta',
    })
  } catch (err) {
    console.error(`[email] alerta erro ao montar (${inscricao.email})`, err)
  }
}
