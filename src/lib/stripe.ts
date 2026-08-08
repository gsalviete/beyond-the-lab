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
