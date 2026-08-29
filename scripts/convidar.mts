// ============================================================
// ENVIO EM LOTE DOS CONVITES — pontual, agosto de 2026
// ============================================================
//
// Manda, para um grupo inteiro de uma vez, o mesmo e-mail que os botões do
// painel mandam um por um, com cópia oculta para a Giovanna.
//
//   --grupo=pendentes  (padrão)  quem abriu o checkout e não terminou.
//                                Está num beco sem saída (D-15) e o link é
//                                o resgate.
//   --grupo=espera               quem nunca teve o que comprar. O link é o
//                                convite, e pela D-16 pode vir com
//                                desconto (`--cupom=CODIGO`).
//
// ⚠️ ISTO É UM ONE-OFF, E O LUGAR CERTO CONTINUA SENDO O PAINEL (D-07).
// Ele existe porque as duas filas tinham gente parada e ninguém quer
// clicar doze vezes conferindo se cada uma saiu. Para uma ou duas, o botão
// é melhor: ele mostra o resultado na tela.
//
// ⚠️ ELE NÃO REIMPLEMENTA NADA. Quem está em cada fila, qual token, qual
// texto, qual validade — tudo vem das MESMAS funções que
// `/api/admin/pendentes` e `/api/admin/espera` chamam. Um script que
// montasse o próprio e-mail viraria uma segunda verdade, e no dia em que o
// painel mudasse os dois passariam a mandar coisas diferentes.
//
// Isso mantém o REPORT §9.5 de pé: ele importa `src/lib/supabase.ts` em
// vez de abrir um segundo cliente, então continua existindo UM arquivo que
// conhece a `service_role`. Foi por não conseguir isso que o `c54` virou
// `.sql` (ESTADO 2.5) — aqui dá, por causa da flag do `package.json`.
//
// ------------------------------------------------------------
// COMO RODAR
// ------------------------------------------------------------
//
//   npm run convidar -- --grupo=espera
//   npm run convidar -- --grupo=espera --cupom=PRIMEIRASEMANA --enviar
//
// Sem `--enviar` é ensaio: lista quem receberia e não manda nem escreve
// nada.
//
// ⚠️ `--conditions=react-server` NÃO É TRUQUE GRATUITO, e o comentário
// existe para o próximo que ler. `src/lib/email.ts` e
// `src/lib/supabase.ts` começam com `import 'server-only'`, que é a rede
// do REPORT §7: em Node puro esse pacote LANÇA, de propósito, para que
// segredo nunca vá parar num bundle de navegador. A flag faz o Node
// resolver a variante vazia — a mesma que o React Server Components usa —,
// o que é dizer ao runtime "isto é servidor". É verdade: é um terminal com
// o `.env.local` na mão.
//
// A rede continua inteira para o que ela protege: nenhum bundle de cliente
// sai daqui, e `npx tsc --noEmit` e o build do Next seguem quebrando se
// alguém importar esses módulos de um componente de cliente.
// ------------------------------------------------------------

// As variáveis vêm de `--env-file=.env.local`, na linha de comando — o
// Node lê o arquivo antes de avaliar este módulo, então `process.env` já
// está pronto quando os imports abaixo forem avaliados. É o que dispensa
// `dotenv`: uma dependência a menos para um script que roda uma vez.
import { descreverCupom } from '@/config/cupom'
import { convidarParaInscricao } from '@/lib/email'
import {
  buscarCupom,
  buscarSafraAtiva,
  garantirConvite,
  listarAlunas,
  listarListaDeEspera,
  listarPendentes,
} from '@/lib/supabase'

// ⚠️ 30 DIAS — o mesmo valor das duas rotas do painel e do
// `gerar_convites.sql`. Repetido aqui, e a repetição incomoda; centralizar
// num quinto arquivo só para este one-off seria pior, porque o script
// morre depois deste envio e a constante ficaria.
const VALIDADE_DO_CONVITE_EM_DIAS = 30

// ⚠️ ESPERA ENTRE ENVIOS. O plano gratuito do Resend limita a 2 req/s, e
// estourar devolve 429 — que `enviar` registra no log e engole, produzindo
// um envio que não aconteceu e ninguém percebeu.
const ESPERA_ENTRE_ENVIOS_MS = 1000

const argumento = (nome: string): string | null => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`))
  return achado ? achado.slice(nome.length + 3) : null
}

const PARA_VALER = process.argv.includes('--enviar')
const GRUPO = argumento('grupo') ?? 'pendentes'
const CODIGO_DO_CUPOM = argumento('cupom')

if (GRUPO !== 'pendentes' && GRUPO !== 'espera') {
  console.error(`Grupo desconhecido: "${GRUPO}". Use --grupo=pendentes ou --grupo=espera.`)
  process.exit(1)
}

if (CODIGO_DO_CUPOM && GRUPO !== 'espera') {
  // Cupom no resgate seria um desconto para quem já tinha combinado um
  // preço — e o preço dela está travado na inscrição (D-06). O e-mail
  // prometeria um abatimento que o checkout não vai dar.
  console.error('--cupom só vale com --grupo=espera. A fila de pendentes retoma o preço travado.')
  process.exit(1)
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://beyondthelab.com.br'
const COPIA_OCULTA = process.env.EMAIL_ADMIN ?? null

const espere = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------
// ⚠️ QUEM JÁ TEM INSCRIÇÃO MAIS ADIANTADA NÃO RECEBE, E ISTO É O CORAÇÃO
//    DO SCRIPT
// ------------------------------------------------------------
//
// Três pessoas têm DUAS inscrições: uma antiga de `lista_espera`, de antes
// da safra existir, e uma nova. `listarListaDeEspera` devolve a antiga,
// porque ela pergunta só pelo status — e as duas são linhas legítimas.
//
// Sem este corte, a Clarisse receberia um convite para se inscrever na
// turma que ela já paga, e a Tainá receberia dois e-mails no mesmo minuto:
// um pedindo que retome o checkout e outro convidando para começar.
//
// O critério é por PESSOA e não por inscrição: manda a inscrição mais
// adiantada. Quem tem uma `confirmada`, `ativa`, `inadimplente` ou
// `concluida` está dentro do funil de pagamento e não é público de convite
// nenhum — a cobrança recusada, quando existe, tem o alerta próprio do
// `c56`, e o Stripe já escreve para a aluna sobre o cartão.
//
// ⚠️ NÃO BASTA FILTRAR PELA FILA DE PENDENTES, e a primeira versão deste
// script errou exatamente aí. `listarListaDeEspera` pergunta por
// `status = 'lista_espera'`, e a Clarisse TEM uma linha assim — a antiga,
// de antes de a safra existir. A linha que diz que ela paga é outra. Um
// filtro que olhasse só a fila de pendentes deixaria passar um convite
// para se inscrever na turma que ela já paga, um dia depois de ela
// finalmente receber a confirmação.
//
// Por isso o conjunto de exclusão vem de TODAS as inscrições, não das duas
// filas. `listarAlunas({})` sem filtro é a consulta que o painel usa para
// a tela de alunas, então nenhuma consulta nova nasce aqui.
// ------------------------------------------------------------
const NO_FUNIL_DE_PAGAMENTO = new Set<string>([
  'confirmada',
  'ativa',
  'inadimplente',
  'concluida',
])

const pendentes = await listarPendentes()
const espera = await listarListaDeEspera()
const todas = await listarAlunas({})

const pessoasQuePagam = new Set(
  todas.filter((a) => NO_FUNIL_DE_PAGAMENTO.has(a.status)).map((a) => a.pessoa_id),
)

const pessoasNaFilaDePendentes = new Set(pendentes.map((p) => p.pessoa_id))

const destinatarios = (GRUPO === 'pendentes' ? pendentes : espera)
  .filter((p) => !pessoasQuePagam.has(p.pessoa_id))
  // Só para o grupo de espera: quem também está em `pendente_pagamento`
  // recebe pelo OUTRO grupo, com o e-mail de resgate — que é o certo para
  // quem já abriu o checkout. Sem isto ela receberia dois e-mails no mesmo
  // minuto, um pedindo para retomar e outro convidando para começar.
  .filter((p) => GRUPO === 'pendentes' || !pessoasNaFilaDePendentes.has(p.pessoa_id))

if (destinatarios.length === 0) {
  console.log(`Ninguém na fila de "${GRUPO}". Nada a fazer.`)
  process.exit(0)
}

// ------------------------------------------------------------
// O CUPOM — resolvido pelo CÓDIGO, e a descrição sai do banco
//
// ⚠️ O TEXTO DO DESCONTO NÃO É ESCRITO AQUI. `descreverCupom` monta a
// frase a partir de `tipo` e `valor` da linha, que é o mesmo caminho da
// rota do painel. Escrever "10% de desconto" à mão no script seria a
// promessa e o desconto vindo de lugares diferentes, e um dia eles
// divergiriam.
//
// ⚠️ E ELE NÃO É VALIDADO CONTRA EXPIRAÇÃO OU LIMITE, de propósito: quem
// julga é `cupomInvalidoPorque`, no ato do checkout, com o relógio
// daquele momento. O convite pode ficar dias na caixa de entrada.
// ------------------------------------------------------------
let cupom: { codigo: string; descricao: string } | null = null

if (CODIGO_DO_CUPOM) {
  const registro = await buscarCupom(CODIGO_DO_CUPOM)

  if (!registro) {
    console.error(`Cupom "${CODIGO_DO_CUPOM}" não existe. Nada foi enviado.`)
    process.exit(1)
  }

  cupom = { codigo: registro.codigo, descricao: descreverCupom(registro.tipo, registro.valor) }
}

// A safra é lida UMA vez, fora do laço, e a falha dela não interrompe nada
// — mesmo contrato das rotas: sem safra o e-mail perde a frase da data de
// início e o link continua valendo.
const safra = await buscarSafraAtiva().catch(() => null)

if (!safra) {
  console.warn('⚠️  Safra ativa não encontrada — os e-mails vão sem a data de início.\n')
}

console.log(
  PARA_VALER
    ? `Enviando para ${destinatarios.length} pessoa(s) do grupo "${GRUPO}".`
    : `ENSAIO — nada será enviado. ${destinatarios.length} pessoa(s) no grupo "${GRUPO}".`,
)
console.log(`Cópia oculta: ${COPIA_OCULTA ?? '(nenhuma — EMAIL_ADMIN ausente)'}`)
console.log(`Cupom: ${cupom ? `${cupom.codigo} — ${cupom.descricao}` : '(nenhum)'}`)
console.log(`Link base: ${BASE}\n`)

let enviados = 0

for (const p of destinatarios) {
  const parada = Math.floor((Date.now() - new Date(p.criada_em).getTime()) / 86_400_000)

  if (!PARA_VALER) {
    // No ensaio NÃO chamamos `garantirConvite`: ele ESCREVE
    // (`pessoas.token_acesso` e a validade). Um ensaio que gerasse token
    // já teria mudado o banco, e o token venceria contado de hoje mesmo
    // que o envio real só saísse semana que vem. Ensaio que escreve não é
    // ensaio.
    console.log(`  ${p.nome} <${p.email}>  ·  há ${parada}d`)
    continue
  }

  try {
    // Reaproveita o token vivo, se houver: reenviar tem que mandar o MESMO
    // link que já está na caixa de entrada da pessoa. Gerar um novo mataria
    // o primeiro, e quem clicasse no e-mail antigo cairia no formulário em
    // branco.
    const convite = await garantirConvite(p.pessoa_id, VALIDADE_DO_CONVITE_EM_DIAS)

    const url = new URL('/', BASE)
    url.searchParams.set('convite', convite.token)
    // O cupom vai também na URL para o campo chegar preenchido. Isso torna
    // o link mais valioso se for encaminhado, e o controle disso é o limite
    // de usos do cupom — não uma tentativa de esconder o código, que vai
    // escrito no corpo do e-mail de qualquer forma.
    if (cupom) url.searchParams.set('cupom', cupom.codigo)

    // ⚠️ NÃO LANÇA, POR CONTRATO (topo de `src/lib/email.ts`). Falha de
    // envio vira log lá dentro e o laço segue: uma pessoa com e-mail
    // inválido não pode impedir as outras de receber.
    await convidarParaInscricao(
      { nome: p.nome, email: p.email, link: url.toString(), ...(cupom ? { cupom } : {}) },
      safra ? { nome: safra.nome, data_inicio_aulas: safra.data_inicio_aulas } : null,
      GRUPO === 'pendentes' ? 'pendente' : 'convite',
      COPIA_OCULTA,
    )

    enviados += 1
    console.log(
      `  ✓ ${p.nome} <${p.email}>  ·  há ${parada}d  ·  ` +
        `${convite.reaproveitado ? 'link de antes' : 'link novo'}`,
    )
  } catch (err) {
    // Só chega aqui o que `convidarParaInscricao` não cobre: falha do
    // `garantirConvite`, que É uma escrita no banco e PODE lançar.
    console.error(`  ✗ ${p.nome} <${p.email}> — falhou:`, err instanceof Error ? err.message : err)
  }

  await espere(ESPERA_ENTRE_ENVIOS_MS)
}

console.log(
  PARA_VALER
    ? `\n${enviados} de ${destinatarios.length} enviado(s).` +
        (enviados < destinatarios.length ? ' ⚠️  Veja as linhas com ✗ acima.' : '')
    : `\nEnsaio. Para enviar de verdade, repita o comando com --enviar`,
)
