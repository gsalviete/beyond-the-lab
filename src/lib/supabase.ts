// Acesso ao Supabase — EXCLUSIVAMENTE server-side.
//
// `server-only` faz o build quebrar se alguém importar este módulo de um
// client component. É a rede de segurança que impede a service_role key de
// acabar no bundle do navegador.
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/database.types'

// ============================================================
// POR QUE O SDK AGORA, SE ANTES ERA `fetch` CRU
//
// A decisão anterior — dois `fetch` para o PostgREST, tipados à mão — era
// a certa e vinha com a condição de revisão escrita no próprio código:
// "a única operação do projeto é um INSERT; o SDK traria auth, realtime e
// storage junto para o bundle do servidor sem nenhum uso. Se o escopo
// crescer (queries, admin, auth), vale trocar pelo SDK."
//
// O gatilho disparou. A refatoração "Safra + Pagamento" leva o projeto de
// uma operação para ~20 (safras, grupos, pessoas, inscrições, assinaturas,
// cupons, eventos), mais Auth de verdade no painel da Giovana. Manter
// `fetch` cru aqui passaria a significar reescrever à mão, uma por uma,
// as partes do PostgREST que o SDK já resolve: montagem de filtro,
// serialização de array, upsert com `on conflict`, e o mapeamento do
// código de erro do Postgres.
//
// O que a troca NÃO afrouxa (ver `REPORT.md` §7):
//
//   - `import 'server-only'` continua no topo, e é por isso que ele é a
//     primeira linha do arquivo e não uma linha qualquer no meio;
//   - nenhuma das duas variáveis tem prefixo `NEXT_PUBLIC_`, de
//     propósito: o Next só expõe ao cliente as variáveis com esse
//     prefixo, e sem ele elas nunca saem do servidor;
//   - **este arquivo é o único lugar do projeto que importa o SDK.** Ele
//     é a fachada: quem precisa falar com o banco importa uma função
//     daqui, nunca `createClient`. Um `createClient` em outro arquivo é
//     mais uma chance de a service_role atravessar a fronteira errada, e
//     a proteção só vale enquanto o número de lugares que conhecem a
//     chave é um.
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ============================================================
// O `23505` SAIU DAQUI, E O QUE ELE SIGNIFICAVA MIGROU PARA A RPC
// ============================================================
//
// Havia aqui uma constante `UNIQUE_VIOLATION = '23505'` — o código de
// erro do Postgres para violação de unique — com a nota de que ela era
// "o que produz o caminho de duplicata da rota de inscrição". Era
// verdade: o insert em `waitlist` esbarrava em `waitlist_email_lower_key`,
// o SDK devolvia `error.code = '23505'`, e a rota traduzia isso em
// "duplicata".
//
// ⚠️ ESSE CÓDIGO NÃO CHEGA MAIS AQUI, E A AUSÊNCIA DELE É DESENHO, NÃO
// PERDA. A `criar_inscricao` (migração `011b`) trata o conflito DENTRO da
// transação, com `on conflict do nothing`. O `23505` nem chega a ser
// levantado: o comando absorve o conflito e a função devolve `false`.
//
// A diferença que importa: antes, "duplicata" era um ERRO reconhecido
// pelo código; agora é um VALOR DE RETORNO. Um erro tinha que ser
// distinguido de todos os outros erros por um número mágico, e qualquer
// outra unique que aparecesse no futuro passaria a ser lida como
// duplicata sem ninguém decidir isso. Um booleano não tem essa ambiguidade.
//
// Se um `23505` voltar a aparecer nesta camada, ele NÃO é duplicata: é
// alguma outra constraint sendo violada, e o lugar de descobrir qual é o
// log — não um `if` que o transforme em sucesso.
// ============================================================

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente')
    this.name = 'SupabaseNotConfiguredError'
  }
}

/**
 * Domínio da inscrição — reexportado, não redeclarado.
 *
 * As duas uniões estavam escritas à mão aqui, com o comentário "espelha o
 * CHECK de `waitlist.nivel_ingles`". Espelhar era exatamente o problema:
 * eram a terceira cópia dos mesmos valores, ao lado das constantes da
 * modal, dos rótulos do `email.ts` e do SQL. Agora saem de
 * `src/config/dominio.ts`, que é neutro e por isso pode servir tanto este
 * módulo `server-only` quanto a modal client.
 *
 * O reexport existe para que os consumidores atuais (`email.ts`,
 * `route.ts`) não precisem mudar de import neste commit — o domínio
 * ganhou dono sem quebrar quem já dependia daqui.
 *
 * (`import` e `export` separados porque um `export ... from` reexporta sem
 * trazer os nomes ao escopo deste arquivo, e eles são usados aqui embaixo.)
 */
import type { NivelIngles, DiaDaSemana } from '@/config/dominio'
export type { NivelIngles, DiaDaSemana }

/**
 * Uma coorte, como vive no banco — agora **derivada** do schema, não
 * escrita à mão.
 *
 * O nome mudou junto com a tabela: a migração `005` renomeou `turmas`
 * para `safras`, e o tipo acompanha.
 *
 * É um `Pick`, e não `Tables<'safras'>` inteiro, de propósito: a lista
 * de colunas aqui é exatamente a do `select` lá embaixo. Tipar com a
 * `Row` completa afirmaria que `slug` chegou, quando não chegou — é o
 * mesmo princípio de toda travessia de fronteira deste projeto (REPORT
 * §7): carregar o mínimo, com o corte explícito no ponto onde acontece.
 *
 * ⚠️ `stripe_price_id` ESTAVA NESTA LISTA DE AUSENTES ATÉ O `c35`, e
 * entrou porque o mínimo mudou: quem monta a Checkout Session precisa
 * saber se já existe um `price` que represente esta safra, e a
 * alternativa era uma segunda consulta à mesma linha um instante depois.
 * Ele NÃO atravessa para o navegador — quem corta é
 * `app/api/safra-ativa/route.ts`, que monta a resposta sem o campo.
 *
 * Sobre o `valor_mensal`, que é `number`: **medido na resposta real do
 * PostgREST — vem `299.99`, número JSON, não string.** O tipo gerado
 * está certo, e o `Number()` que existia na montagem da resposta era
 * redundante e saiu.
 *
 * `number` é o tipo certo para **exibir** um preço, e é só para isso que
 * ele atravessa daqui até a landing. ⚠️ Aritmética de dinheiro NÃO
 * acontece em float: o Stripe cobra em centavo inteiro, e a conversão
 * para inteiro é do corte 2, no ponto que monta a Checkout Session. Se
 * um dia aparecer soma, desconto ou proporcional escrito sobre este
 * campo, o erro está em quem somou, não neste tipo.
 *
 * As datas são `date` no banco e chegam como 'YYYY-MM-DD' — dia de
 * calendário, sem fuso. Ver `paraDataUTC` em `src/config/curso.ts`.
 */
export type Safra = Pick<
  Tables<'safras'>,
  | 'id'
  | 'nome'
  | 'data_inicio_aulas'
  | 'data_primeira_cobranca'
  | 'valor_mensal'
  | 'duracao_meses'
  | 'inscricoes_abertas'
  | 'vagas_total'
  | 'stripe_price_id'
>

/**
 * A safra de vitrine mais a contagem de quem já está nela.
 *
 * `inscritas` é dado cru de operação e **não atravessa para o cliente**:
 * quem corta é `app/api/safra-ativa/route.ts`, que devolve só
 * `vagas_restantes`. Ele existe aqui porque o painel da Giovana (`c36`)
 * precisa da contagem server-side para exibir `inscritas / vagas_total`
 * — que é a forma dela, não a da visitante.
 *
 * O corte entre as duas camadas é deliberado (REPORT §9.6): esta função
 * devolve o dado rico, a rota devolve o mínimo. Fundir as duas faria a
 * rota pública virar a única leitura possível, e o painel teria que
 * pedir ao seu próprio site uma informação que ele tem no banco.
 */
export type SafraAtiva = Safra & {
  /** Inscrições com `safra_id` = esta safra. Ver `buscarSafraAtiva`. */
  inscritas: number
}

/**
 * Os clientes, criados uma vez por instância e reaproveitados.
 *
 * São DOIS e não um, e a única diferença entre eles é a política de
 * cache do `fetch` — ver `supabase()` e `supabaseVitrine()` logo abaixo.
 *
 * O parâmetro `Database` é o que dá sentido ao arquivo gerado.
 *
 * Sem ele, `src/lib/database.types.ts` seria documentação: o SDK trataria
 * toda tabela como `any` e `from('turmas')` — uma tabela que não existe
 * desde a `005` — compilaria em silêncio. É exatamente a forma de estar
 * errado que o `c18b` existe para acabar: o schema anda, a aplicação não,
 * e nada reclama. Ver a nota do `c18b` em `docs/04-PLANO.md`.
 */
let cliente: SupabaseClient<Database> | null = null
let clienteVitrine: SupabaseClient<Database> | null = null

/**
 * Opções comuns aos dois clientes. Só a política de cache os separa.
 *
 * Nenhum dos dois representa ninguém: são a service_role, que ignora RLS
 * e não tem sessão para persistir, renovar ou detectar na URL. Os três
 * defaults do SDK são para o navegador com usuário logado; deixá-los
 * ligados aqui, num módulo de escopo compartilhado entre requisições,
 * seria criar estado de autenticação que nada preenche e que nada
 * deveria poder preencher.
 */
const AUTH_SEM_SESSAO = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const

/**
 * O cliente de OPERAÇÃO — nunca cacheia.
 *
 * Preguiçoso, e não no topo do módulo: a ausência de env var precisa
 * virar `SupabaseNotConfiguredError` no ponto de uso, onde cada chamador
 * decide o que fazer — e não uma exceção na importação, que derrubaria o
 * build e o render de páginas que nem falam com o banco.
 */
function supabase(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  if (cliente) return cliente

  cliente = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: AUTH_SEM_SESSAO,
    global: {
      // `no-store` explícito, e não confiança no default do Next.
      //
      // É a mesma exigência de sempre, agora um andar abaixo: fechar a
      // turma no Studio precisa refletir na modal imediatamente, e é esse
      // imediatismo que torna o controle pelo banco melhor que o deploy
      // que ele substitui (REPORT D2). O SDK chama `fetch` por baixo, e
      // o Next envolve o `fetch` global com a própria camada de cache —
      // deixar a decisão para o default dela seria apostar o painel de
      // controle da professora numa configuração de framework que muda
      // entre versões maiores.
      //
      // Quem passa por aqui: `/api/safra-ativa` (a leitura da modal, que
      // já é `force-dynamic`) e a escrita de `/api/inscricao`. Os dois
      // decidem AGORA e não podem ler nada de cache.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  return cliente
}

/**
 * A janela de defasagem da vitrine, em segundos.
 *
 * ⚠️ ESTE NÚMERO EXISTE EM DOIS LUGARES, e a duplicação é forçada pelo
 * Next, não escolhida. `export const revalidate` em `app/page.jsx`
 * precisa ser um LITERAL — o Next lê esse valor por análise estática do
 * arquivo, antes de executar qualquer coisa, e um identificador
 * importado não é lido de forma confiável. Então lá está `60` escrito, e
 * aqui está a constante.
 *
 * Duas declarações do mesmo número é exatamente o que o comentário
 * anterior temia, e o medo era justo. O que ele não tinha era o
 * mecanismo: `tests/vitrine-cache.test.ts` lê os DOIS arquivos como
 * texto e falha se os números divergirem. Disciplina substituída por
 * mecanismo, que é a 8.3 do `REPORT.md` aplicada a um número.
 */
export const JANELA_VITRINE_SEGUNDOS = 60

/**
 * O cliente de VITRINE — cacheável, e é isso que mantém a landing estática.
 *
 * ============================================================
 * POR QUE DOIS CLIENTES, E NÃO UM COM UMA OPÇÃO A MAIS
 * ============================================================
 *
 * O `fetch` do SDK é fixado na CRIAÇÃO do cliente: não há como pedir
 * outra política de cache numa chamada específica. E as duas políticas
 * são inconciliáveis de propósito, porque respondem a perguntas
 * diferentes (D-13):
 *
 *   OPERAÇÃO ("dá para comprar agora?") — `no-store`. Uma resposta de
 *     um minuto atrás pode estar errada, e agir sobre ela é prometer
 *     vaga numa safra fechada.
 *
 *   VITRINE ("quanto custa e quanto dura?") — cacheável. Um minuto de
 *     defasagem no preço é aceito, e em troca a landing é servida
 *     estática, sem uma consulta ao banco por visita.
 *
 * ============================================================
 * ⚠️ AQUI HAVIA `cache: 'force-cache'` SEM `revalidate`, E ISSO CONGELAVA
 *    O PREÇO PARA SEMPRE. O comentário que justificava aquilo está
 *    preservado abaixo, porque entender por que ele CONVENCIA é o que
 *    impede a linha de voltar.
 * ============================================================
 *
 * O texto dizia: *"`cache: 'force-cache'` e NENHUM `revalidate` aqui, de
 * propósito. A janela é declarada UMA vez, no `export const revalidate`
 * de `app/page.jsx`, e o Data Cache do Next herda dela. Declarar 60 nos
 * dois lugares criaria dois números para a mesma decisão, e um dia eles
 * discordam — o menor vence em silêncio e ninguém entende por quê."*
 *
 * A PREOCUPAÇÃO estava certa e continua valendo — ver
 * `JANELA_VITRINE_SEGUNDOS` logo acima. **A HERANÇA não existe.**
 *
 * `export const revalidate = 60` governa de quanto em quanto tempo o Next
 * REGENERA a página. Não governa o Data Cache, que é outra camada. Um
 * `fetch` marcado `cache: 'force-cache'` **sem** `next.revalidate` entra
 * no Data Cache SEM PRAZO NENHUM: ele não expira sozinho, nunca. O
 * resultado é uma regeneração que acontece pontualmente a cada 60
 * segundos, relê o mesmo corpo cacheado e produz HTML byte a byte
 * idêntico. A página revalida direitinho — e o número na tela não muda.
 *
 * O sintoma é cruel justamente por parecer o oposto de um bug de cache:
 * o preço não fica "atrasado um minuto", ele fica **preso no valor do
 * build**. A Giovana muda `valor_mensal` no Studio, espera, recarrega,
 * limpa o cache do navegador, e o site continua no número velho até
 * alguém fazer um deploy — que é EXATAMENTE a dependência que o corte 1
 * inteiro existiu para acabar. Foi assim que a D-13 apareceu cumprida em
 * revisão de código e reprovou no aceite manual.
 *
 * A correção é dizer a janela ao `fetch` em vez de esperar que ele a
 * adivinhe. Sem `cache:` junto: `cache` e `next.revalidate` são duas
 * formas de declarar a mesma coisa, e o Next recusa as duas juntas.
 *
 * ⚠️ Isto NÃO desfaz a promessa de "sem deploy". A Giovana continua
 * mudando o preço no Studio; o que muda é que a página acompanha em até
 * um minuto em vez de instantaneamente. No `c36` o painel passa a
 * disparar `revalidatePath` ao salvar e a defasagem some (D-13).
 */
function supabaseVitrine(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  if (clienteVitrine) return clienteVitrine

  clienteVitrine = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: AUTH_SEM_SESSAO,
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, next: { revalidate: JANELA_VITRINE_SEGUNDOS } }),
    },
  })

  return clienteVitrine
}

/**
 * A safra mais recente por `data_inicio_aulas`, com a contagem de
 * inscritas. `null` só quando não existe safra nenhuma no banco.
 *
 * ============================================================
 * ELA NÃO FILTRA POR `inscricoes_abertas` — E ISSO É A D-13
 * ============================================================
 *
 * A versão anterior perguntava "qual turma está com inscrições
 * abertas?", e devolvia `null` quando nenhuma estava. As duas perguntas
 * que essa query juntava são diferentes:
 *
 *   - **"Quanto custa e quando começa?"** é informação de vitrine. Não
 *     pode sumir da página nunca.
 *   - **"Dá para comprar agora?"** é estado de operação, e muda no dia
 *     em que a Giovana decide.
 *
 * Amarradas na mesma flag, fechar as inscrições apagava o preço e a data
 * do site junto. Era o efeito colateral que ninguém pediu e que a
 * refatoração existe para fechar. Agora a flag vai **na resposta, como
 * campo**, e governa só o CTA — botão de inscrição quando `true`, lista
 * de espera quando `false`.
 *
 * Por isso o `order(...).limit(1)` no lugar do filtro. O `limit(1)` aqui
 * é o que de fato resolve a escolha, e não mais um cinto de segurança
 * sobre uma constraint: o índice parcial que garante **no máximo uma
 * safra aberta** continua no banco e continua valendo, mas esta query
 * deixou de depender dele — ela ordena e pega a primeira.
 *
 * Continua sem `.single()`/`.maybeSingle()`, pelo mesmo motivo de
 * sempre, agora aplicado a outro caso: eles transformam "veio um número
 * de linhas diferente do esperado" num erro do SDK, escondendo atrás de
 * uma exceção de transporte um fato sobre os dados. Aqui o caso é "não
 * há safra nenhuma", que é um estado legítimo do banco vazio e tem que
 * chegar como `null`, não como exceção.
 *
 * `id` VEM na seleção porque a rota de inscrição precisa dele para
 * gravar a FK, e a contagem de vagas logo abaixo precisa dele para
 * filtrar. Ele não pode chegar ao navegador — quem faz esse corte é
 * `app/api/safra-ativa/route.ts`, que monta a resposta sem o campo. A
 * lista de colunas continua escrita à mão, e não `select('*')`: é o
 * mesmo princípio de toda travessia de fronteira deste projeto (REPORT
 * §7) — carregar o mínimo, com o corte explícito no ponto onde acontece.
 *
 * Erro aqui é lançado, não engolido: cada chamador decide o que fazer.
 * Hoje os dois decidem a mesma coisa — tratar como "nenhuma safra" e
 * cair para lista de espera —, mas quem toma essa decisão é a rota, não
 * esta função. O SDK devolve `{ data, error }` em vez de lançar, então o
 * `throw` passa a ser explícito aqui.
 */
export async function buscarSafraAtiva(): Promise<SafraAtiva | null> {
  const { data, error } = await supabase()
    .from('safras')
    .select(
      'id,nome,data_inicio_aulas,data_primeira_cobranca,valor_mensal,duracao_meses,inscricoes_abertas,vagas_total,stripe_price_id',
    )
    .order('data_inicio_aulas', { ascending: false })
    .limit(1)

  if (error) {
    // A mensagem do PostgREST pode conter detalhe de schema; ela vai para
    // o log do servidor e para lugar nenhum além disso.
    throw new Error(`safras: ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const safra = data?.[0]
  if (!safra) return null

  // ============================================================
  // A CONTAGEM DE VAGAS — D-08, e ela é limite MOLE
  // ============================================================
  //
  // Não há trava transacional, não há lock, e isso é decisão, não
  // pendência. Duas pessoas fechando o checkout no mesmo segundo pela
  // última vaga é possível e aceito: na escala do produto (dezenas, não
  // milhares) um lock distribuído não se paga, e o painel mostra o
  // estouro em vermelho para a Giovana resolver com uma conversa.
  //
  // `head: true` com `count: 'exact'`: o PostgREST responde só o
  // cabeçalho `Content-Range` e **nenhuma linha**. É o que evita
  // arrastar a lista inteira de inscritas — com dado pessoal dentro —
  // por um número. `data` volta `null` de propósito nesse modo; quem
  // interessa é `count`.
  //
  // O filtro é `safra_id` e mais nada. Ele já exclui a lista de espera
  // sozinho: o CHECK da `009` garante `safra_id is null ⟺ status =
  // 'lista_espera'`, então nenhuma linha de lista de espera casa com uma
  // safra.
  //
  // ⚠️ O que ele NÃO exclui é `cancelada`/`concluida`. Hoje isso não faz
  // diferença observável: os dois estados só nascem do webhook do Stripe
  // e do painel, que são do corte 2 e do 3 — no corte 1 nenhuma linha
  // pode chegar neles. **A pergunta "inscrição cancelada devolve a
  // vaga?" é de negócio e não foi decidida**; ela precisa de resposta
  // antes do `c36`, que é quando a contagem passa a alimentar o painel e
  // a primeira `cancelada` vira possível. Escolher aqui, por conta
  // própria, seria inventar a regra no lugar de perguntá-la.
  const { count, error: erroContagem } = await supabase()
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('safra_id', safra.id)

  if (erroContagem) {
    throw new Error(
      `inscricoes(count): ${erroContagem.code ?? 'sem código'} — ${erroContagem.message}`,
    )
  }

  // `count` é `number | null` na tipagem do SDK. `null` aqui significaria
  // que o `Content-Range` não veio, e tratar isso como 0 seria afirmar
  // "não há ninguém inscrita" a partir de uma resposta que não disse
  // nada — o mesmo erro de sempre, com sinal trocado. Sem contagem, não
  // há resposta: quem chamou trata como falha e degrada.
  if (count === null) {
    throw new Error('inscricoes(count): PostgREST não devolveu contagem')
  }

  return { ...safra, inscritas: count }
}

/**
 * Só o que a VITRINE precisa: quanto custa e quanto dura.
 *
 * `null` quando não existe safra nenhuma no banco. Quem decide o que
 * fazer com isso é a landing — e ela falha o build, porque não existe
 * fallback honesto para "quanto custa" (ver `app/page.jsx`).
 *
 * ============================================================
 * POR QUE NÃO É `buscarSafraAtiva` COM MENOS COLUNAS
 * ============================================================
 *
 * Três diferenças, e cada uma sozinha já justificaria a separação:
 *
 *   1. CACHE. Esta usa o cliente de vitrine (`force-cache`), e é isso
 *      que permite a landing ser prerenderizada. A outra usa `no-store`,
 *      e uma página estática NÃO PODE conter um `fetch` `no-store` — o
 *      Next recusa o prerender com `DYNAMIC_SERVER_USAGE` e a landing
 *      viraria dinâmica, o que a D-13 proíbe.
 *
 *   2. A CONTAGEM DE INSCRITAS. `buscarSafraAtiva` faz uma segunda
 *      consulta para contar vagas ocupadas. A landing não desenha
 *      contador nenhum — pagar essa consulta a cada revalidação seria
 *      trabalho para jogar fora, e cachear a contagem de vagas por 60
 *      segundos é justamente o tipo de dado que não pode envelhecer.
 *
 *   3. AS COLUNAS. Aqui vêm três. Nem `id`, nem `inscricoes_abertas`,
 *      nem `vagas_total` — nada que a vitrine não imprima. É o corte de
 *      fronteira do REPORT §9.6 feito na origem: o que não é selecionado
 *      não vaza mais adiante por um spread distraído.
 *
 * ⚠️ O QUE AS DUAS COMPARTILHAM, E TEM QUE CONTINUAR IGUAL: a regra de
 * QUAL safra é a safra — `order('data_inicio_aulas', desc).limit(1)`,
 * sem filtrar por `inscricoes_abertas` (D-13). Se essa regra mudar, muda
 * nas duas ou a modal e a landing passam a falar de safras diferentes na
 * mesma tela. Está escrita duas vezes porque as consultas divergem em
 * tudo o mais; este comentário é a amarra.
 *
 * ⚠️ `data_inicio_aulas` ENTROU NO `c23`, e ela NÃO é exibida seca.
 *
 * O comentário que ocupava este lugar dizia que a data continuava sendo
 * texto literal na tela até o `c23`, e que trazer a coluna antes disso
 * seria transportar um dado que ninguém podia exibir. O `c23` chegou: o
 * badge do hero, que dizia `Setembro` escrito à mão, passa a derivar o
 * mês daqui.
 *
 * O que a condição daquele comentário exigia continua valendo e agora é
 * cumprido por `formatarSemanaDeInicio` e `nomeDoMes`, em
 * `src/config/curso.ts`: pela D-14 a data NUNCA vira `dd/mm/yyyy` na
 * tela, porque cada grupo começa num dia diferente da mesma semana (D-01)
 * e a data seca seria uma promessa que o produto não faz. Esta função
 * transporta o dia de calendário; quem decide a frase é aquele módulo, e
 * é o único que decide.
 *
 * ⚠️ É uma coluna `date` e chega como 'YYYY-MM-DD' — dia de calendário,
 * sem fuso, sem instante. Quem a consumir com `new Date(str)` seguido de
 * `getDate()` lê o dia anterior no Brasil. Ver `paraDataUTC`.
 */
export type SafraVitrine = Pick<
  Tables<'safras'>,
  'valor_mensal' | 'duracao_meses' | 'data_inicio_aulas'
>

export async function buscarSafraDeVitrine(): Promise<SafraVitrine | null> {
  const { data, error } = await supabaseVitrine()
    .from('safras')
    .select('valor_mensal,duracao_meses,data_inicio_aulas')
    .order('data_inicio_aulas', { ascending: false })
    .limit(1)

  if (error) {
    // A mensagem do PostgREST pode conter detalhe de schema; ela vai para
    // o log do servidor e para lugar nenhum além disso.
    //
    // Lançar é o certo mesmo aqui: numa REVALIDAÇÃO, o Next mantém a
    // página gerada por último e tenta de novo depois — o erro não chega
    // a ninguém e a visitante continua vendo o último preço bom. Num
    // BUILD, ele derruba o deploy, que é o desfecho desejado: uma landing
    // que não sabe o preço não deve ser publicada, e a versão anterior
    // segue no ar.
    throw new Error(`safras(vitrine): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/**
 * O contrato travado de uma inscrição (D-06), do lado do TypeScript.
 *
 * Os três andam SEMPRE juntos — tudo-ou-nada, e quem obriga é o
 * `inscricoes_travados_tudo_ou_nada_check` da `015`. Modelá-los como um
 * objeto só, em vez de três campos opcionais lado a lado, é o que torna
 * "valor sem duração" impossível de escrever aqui em cima: um contrato
 * pela metade deixa de ser um estado representável antes de chegar ao
 * banco.
 */
export type ContratoTravado = {
  valorMensal: number
  duracaoMeses: number
  /** `'YYYY-MM-DD'` — dia de calendário, sem fuso. Ver `paraDataUTC`. */
  dataPrimeiraCobranca: string
}

/**
 * O que a escrita da inscrição devolve.
 *
 * `criada`: `true` = inscrição nova, `false` = essa pessoa já tem
 * inscrição nesta safra.
 *
 * ⚠️ `criada: false` NÃO É FALHA, e é por isso que ele mora dentro do
 * ramo `ok: true`. A união original tinha `{ ok: false; duplicate: true }`
 * — duplicata como uma espécie de erro —, e aquilo era herança de o
 * mecanismo ser uma unique violation. Com a RPC, "já existia" é uma
 * resposta que a função dá de propósito, e colapsá-la de novo em erro
 * faria a rota degradar (e responder 500) para alguém cujo cadastro está
 * perfeitamente gravado no banco.
 *
 * ⚠️ `inscricaoId` PODE SER `null` COM `ok: true`, e o caso é real: com
 * `on conflict do nothing`, o conflito com uma transação AINDA NÃO
 * COMMITADA não insere e também não deixa a outra linha visível para a
 * releitura da `016`. Exige duas submissões da mesma pessoa no mesmo
 * instante, e é recuperável — a tentativa seguinte enxerga a linha. Quem
 * chama trata: sem id não há sessão de checkout, e a resposta é a de
 * duplicata. O que não se pode fazer é fingir que o id existe.
 *
 * ⚠️ `contrato` é o da LINHA QUE EXISTE, não o que foi enviado. Na
 * duplicata ele é o da PRIMEIRA vez (D-06), e é ele que a sessão de
 * checkout tem que cobrar — ver `precoDoContrato` em `src/lib/stripe.ts`.
 */
export type ResultadoInscricao =
  | {
      ok: true
      criada: boolean
      inscricaoId: string | null
      contrato: ContratoTravado | null
    }
  | { ok: false; status: number; detail: string }

/**
 * ⚠️ O ESCAPE DE NULIDADE DE ARGUMENTO — um lugar só, e é este.
 *
 * `supabase gen types` não expressa nulidade de ARGUMENTO de função (só
 * de coluna): os três parâmetros travados chegam tipados como
 * `p_valor_mensal_travado: number`, sem `| null`, apesar de a coluna ser
 * nullable e de a lista de espera PRECISAR mandar null nos três.
 *
 * ⚠️ E MANDAR `undefined` NÃO É ALTERNATIVA, é um defeito. Omitir os três
 * produz um corpo com exatamente as dez chaves da sobrecarga ANTIGA
 * (`011b`), e o PostgREST resolveria a chamada para ela — que devolve um
 * booleano onde este módulo espera uma linha. A inscrição seria gravada e
 * a rota responderia falha. É a razão pela qual os três não têm `default`
 * no SQL, e está escrita no cabeçalho da `016`.
 *
 * Então o `null` viaja explícito, e esta função é o único ponto onde o
 * tipo é dobrado — nomeada, comentada e grep-ável, em vez de um `as
 * number` solto em três linhas que ninguém liga uma à outra.
 */
function nulavel<T>(valor: T | null): T {
  return valor as T
}

/**
 * Cria a inscrição: pessoa + inscrição, numa transação só.
 *
 * ============================================================
 * POR QUE UMA RPC E NÃO DOIS `.insert()`
 * ============================================================
 *
 * O consentimento mora em `inscricoes`; `pessoas` guarda só contato. Um
 * insert de `pessoas` que passa seguido de um insert de `inscricoes` que
 * falha deixaria nome, e-mail e telefone de gente real gravados COM ZERO
 * REGISTRO DE CONSENTIMENTO — sob LGPD não é linha órfã, é o requisito
 * probatório quebrado.
 *
 * E não há como costurar isso daqui: o PostgREST expõe uma requisição
 * HTTP por comando, duas requisições são duas transações, e não existe
 * `begin` do lado do SDK. A transação só pode existir dentro do banco. O
 * raciocínio inteiro, com os contraexemplos, está no cabeçalho de
 * `supabase/migrations/011b_rpc_criar_inscricao.sql` — este comentário é
 * o ponteiro, aquele arquivo é a fonte.
 *
 * ============================================================
 * ⚠️ `.rpc()` CASA PARÂMETRO POR NOME
 * ============================================================
 *
 * Os treze nomes abaixo são a assinatura da função no banco, não uma
 * convenção nossa. Errar um deles é erro em tempo de execução — o
 * PostgREST responde "function not found" porque a assinatura não bate —,
 * e é o tipo de erro que só aparece quando alguém real se inscreve.
 * Renomear um parâmetro no SQL é mudar este objeto junto, no mesmo commit.
 *
 * ⚠️ E AQUI O CONJUNTO DE NOMES FAZ MAIS DO QUE CASAR: ELE ESCOLHE A
 * FUNÇÃO. Existem DUAS `criar_inscricao` no banco enquanto a `018` não
 * roda — a de dez argumentos da `011b`, que o build em produção chama
 * entre a migração e o deploy, e a de treze da `016`. O PostgREST resolve
 * sobrecarga pelo CONJUNTO DE CHAVES do corpo JSON. Mandar os treze é o
 * que faz esta chamada cair na função certa; mandar dez cairia na antiga,
 * que devolve um booleano onde este módulo espera uma linha. Ver
 * `nulavel` acima.
 *
 * ============================================================
 * O QUE **NÃO** É PARÂMETRO, E NÃO É ESQUECIMENTO
 * ============================================================
 *
 *   `status`  — DERIVADO de `p_safra_id` dentro da função. O CHECK da
 *     `009` amarra `safra_id is null` ⟺ `status = 'lista_espera'`, e um
 *     par incoerente é recusado pelo banco de qualquer jeito. Mandar
 *     `status` daqui só criaria uma forma de a chamada estar errada. Não
 *     existe `aprovada` nem `rejeitada` (D-02).
 *
 *   `consent` — a função grava `true` fixo. Ela não aceita um parâmetro
 *     capaz de pedir `false`, que seria "a pessoa recusou e entrou assim
 *     mesmo". `consent_at` e `consent_text` SÃO parâmetros porque nascem
 *     no servidor um passo antes — ver o comentário deles abaixo.
 *
 *   `grupo_id` — alocação é ato da Giovana no painel, ortogonal ao status
 *     (D-03). Uma inscrição nasce sem horário, sempre.
 *
 *   `payment_choice` — morreu (D-11). Não é parâmetro, não tem coluna, e
 *     não chega aqui: quem o corta é a rota, na fronteira.
 *
 * ============================================================
 * O QUE ELA DEVOLVE, E O QUE CONTINUA NÃO ATRAVESSANDO
 * ============================================================
 *
 * ⚠️ ATÉ O CORTE 1 ERA UM BOOLEANO E SÓ, e o comentário que ocupava este
 * lugar dizia, com razão, que "nenhum dado pessoal atravessa de volta —
 * nem id de pessoa, nem id de inscrição, nem nome, nem status, nem
 * contagem". O corte de fronteira do REPORT §9.6 é "carregar o mínimo,
 * com o corte explícito" — não "carregar um booleano para sempre". O
 * mínimo mudou porque o chamador mudou: quem monta a Checkout Session
 * precisa saber QUAL inscrição pagar (`client_reference_id`) e QUANTO ela
 * deve pagar (D-06).
 *
 * O que continua fora é o que importa: nome, e-mail, telefone, status,
 * consentimento, contagem. Nada de dado pessoal atravessa de volta, e o
 * que não sai não vaza depois por um spread distraído três camadas acima.
 *
 * Vale registrar como o mecanismo do corte mudou ao longo do projeto,
 * porque o caminho explica a forma atual: no `fetch` cru original o corte
 * vinha do **default do PostgREST** para um POST sem `Prefer` — bastava
 * encadear `.select()` para a linha inteira voltar, e encadear por
 * reflexo desfazia o corte em silêncio. Depois ele passou a estar escrito
 * do lado de lá, no `returns` da função, onde nenhum descuido daqui o
 * desfaz. Continua assim: o que a `016` não projeta, esta camada não tem
 * como pedir.
 *
 * A service_role key ignora RLS — é por isso que `pessoas` e `inscricoes`
 * podem ficar com RLS ligada e ZERO policies, e é por isso que a função
 * é `security invoker` com `execute` revogado de `anon`: as duas trancas
 * estão documentadas na seção 4 da `011b`.
 */
export async function criarInscricao(dados: {
  nome: string
  email: string
  /** E.164, já normalizado pela rota — ver `src/lib/telefone.ts`. */
  telefone: string
  nivel_ingles: NivelIngles
  curso: string
  periodo: string
  disponibilidade: DiaDaSemana[]
  /**
   * Registro probatório do consentimento. Os dois andam juntos com o
   * `consent = true` que a função grava, e não fazem sentido separados —
   * o CHECK `inscricoes_consentimento_obrigatorio_check` (migração `010`)
   * recusa a linha se algum faltar.
   *
   * ⚠️ NENHUM DOS DOIS VEM DO CLIENTE, e a assimetria é o ponto: o
   * navegador é a única fonte possível para o ATO de marcar a caixa, e é
   * a pior fonte imaginável para a hora do relógio e para a redação
   * exibida. Um POST forjado poderia declarar que aceitou um texto que
   * nunca existiu, com data conveniente. Quem monta este objeto é
   * `/api/inscricao`, que carimba a hora e importa `CONSENT_TEXT` de
   * `src/config/consentimento.ts` — o mesmo módulo que a modal usa para
   * exibir a frase (REPORT §9.7). O corpo do POST não tem voz aqui.
   */
  consent_at: string
  consent_text: string
  /**
   * Safra da inscrição, ou `null` para lista de espera.
   *
   * Quem decide é a rota, olhando o banco e não o que o cliente afirmou —
   * e a decisão é `inscricoes_abertas`, não "veio safra". Pela D-13
   * `buscarSafraAtiva` devolve a safra de vitrine SEMPRE, aberta ou não,
   * então "veio safra" deixou de significar "dá para comprar".
   *
   * `null` aqui é o que faz a função escrever `lista_espera`. Os dois
   * andam juntos ou o insert é recusado pelo CHECK da `009`.
   */
  safra_id: string | null
  /**
   * O contrato a travar na inscrição (D-06), ou `null` para lista de
   * espera.
   *
   * ⚠️ ELE ANDA COLADO EM `safra_id`, e o banco obriga: contrato com
   * `safra_id` nulo é recusado pelo `inscricoes_espera_sem_travado_check`
   * da `015` — seria um preço acordado numa safra que não existe. O
   * inverso (safra sem contrato) é permitido de propósito, porque
   * `pendente_pagamento` ficou de fora da exigência do CHECK.
   *
   * ⚠️ E ELE NÃO É O QUE VAI SER COBRADO NA DUPLICATA. Quem já tem
   * inscrição mantém o contrato da primeira vez — a `016` não sobrescreve
   * —, e é o `contrato` DE VOLTA, no resultado, que a sessão de checkout
   * tem que usar. Mandar um e cobrar o outro é o desalinhamento que a
   * `015` existe para impedir.
   */
  travados: ContratoTravado | null
}): Promise<ResultadoInscricao> {
  const { data, error, status } = await supabase().rpc('criar_inscricao', {
    p_nome: dados.nome,
    p_email: dados.email,
    p_telefone: dados.telefone,
    p_nivel_ingles: dados.nivel_ingles,
    p_curso: dados.curso,
    p_periodo: dados.periodo,
    p_disponibilidade: dados.disponibilidade,
    p_consent_at: dados.consent_at,
    p_consent_text: dados.consent_text,
    // ⚠️ `?? undefined`, e NÃO `null`. As três coisas que essa linha é:
    //
    //   1. Os tipos gerados trazem `p_safra_id?: string` — OPCIONAL, não
    //      anulável. `supabase gen types` não expressa nulidade de
    //      ARGUMENTO de função (só de coluna), então `null` nunca vai
    //      tipar aqui, e não existe tipo manual que conserte isso sem
    //      desfazer o `c18b`. A ausência é como o PostgREST transporta
    //      "sem safra": omitido o argumento, ele aplica o DEFAULT do
    //      parâmetro, e dentro da função `p_safra_id` chega null igual.
    //
    //   2. A omissão só é segura porque o default é `default null`
    //      (migração `011b`, linha da assinatura). ⚠️ ESSE DEFAULT NUNCA
    //      PODE VIRAR UM UUID REAL. Se virar, toda chamada que omite o
    //      argumento — ou seja, toda lista de espera — passa a gravar
    //      inscrição NAQUELA safra, e nada reclama: o `status` é derivado
    //      do próprio parâmetro dentro da função, então o par
    //      (safra_id, status) sai coerente e o CHECK da `009` aprova. A
    //      diferença entre lista de espera e inscrição paga ficaria
    //      decidida por um valor invisível no call site.
    //
    //   3. `undefined` aqui NÃO significa "não sabemos" nem "faltou
    //      dado". É a expressão de `safra_id is null`, que pelo CHECK da
    //      `009` significa `lista_espera` — um estado afirmado, decidido
    //      pela rota depois de ler `inscricoes_abertas` no banco.
    p_safra_id: dados.safra_id ?? undefined,

    // ⚠️ `null` EXPLÍCITO, e nunca `undefined` — o oposto exato da linha
    // acima, e a assimetria tem motivo. `p_safra_id` TEM `default null`
    // no SQL, então omiti-lo é a forma de dizer "sem safra". Estes três
    // NÃO têm default, de propósito: é a ausência de default que impede a
    // chamada de dez argumentos da `011b` de cair na função de treze. Se
    // eles fossem omitidos aqui, o corpo teria exatamente as dez chaves da
    // sobrecarga antiga e o PostgREST resolveria para ela. Ver `nulavel`.
    p_valor_mensal_travado: nulavel(dados.travados?.valorMensal ?? null),
    p_duracao_meses_travada: nulavel(dados.travados?.duracaoMeses ?? null),
    p_data_primeira_cobranca_travada: nulavel(
      dados.travados?.dataPrimeiraCobranca ?? null,
    ),
  })

  if (error) {
    // `detail` só existe para o log do servidor. Ele não é ecoado ao
    // cliente em nenhum caminho — a rota responde mensagem genérica.
    const detail = [error.code, error.message, error.details, error.hint]
      .filter(Boolean)
      .join(' · ')

    return { ok: false, status, detail }
  }

  // ============================================================
  // ⚠️ RESPOSTA COM FORMA INESPERADA É FALHA, E NÃO "PROVAVELMENTE DEU
  //    CERTO"
  // ============================================================
  //
  // A função declara `returns table (...)` e devolve SEMPRE exatamente uma
  // linha — inclusive na duplicata. Um array vazio, um booleano ou um
  // `null` aqui significam que a resposta não tem a forma que a assinatura
  // promete: schema divergente, função substituída, ou — o caso concreto e
  // provável — a chamada tendo caído na SOBRECARGA DE DEZ ARGUMENTOS da
  // `011b`, que devolve `boolean`. É exatamente a classe de incidente da
  // migração `004`: o banco andou, a aplicação não, e nada reclamou.
  //
  // Assumir `criada: true` faria a rota mandar e-mail de confirmação por
  // uma inscrição que talvez não exista. Assumir `false` diria "você já
  // está cadastrada" para quem não está. As duas mentem; só o erro não
  // mente.
  //
  // Se a linha TIVER sido gravada, o custo é a pessoa ver "tente de novo"
  // e tentar — e a segunda tentativa cai no caminho de duplicata, que
  // agora devolve o id e abre o checkout dela. É o desfecho menos ruim
  // dos três, e ficou melhor do que era no corte 1.
  const linha = Array.isArray(data) ? data[0] : undefined

  if (!linha || typeof linha.criada !== 'boolean') {
    return {
      ok: false,
      status,
      detail:
        `criar_inscricao devolveu ${data === null ? 'null' : typeof data}` +
        `${Array.isArray(data) ? ` (array de ${data.length})` : ''}, ` +
        'esperado uma linha com `criada` booleano — a chamada pode ter caído ' +
        'na sobrecarga de dez argumentos da 011b',
    }
  }

  // ⚠️ O CONTRATO SÓ EXISTE SE OS TRÊS EXISTIREM, e a checagem não é
  // paranoia: é o `inscricoes_travados_tudo_ou_nada_check` da `015`
  // reafirmado do lado de cá, na fronteira onde o dado deixa de ser linha
  // de banco e vira objeto. Meio contrato aqui viraria um `cancel_at`
  // calculado sobre `undefined` lá na frente — e a conta de prazo é a
  // única deste projeto cujo erro só aparece seis meses depois.
  const contrato: ContratoTravado | null =
    linha.valor_mensal_travado !== null &&
    linha.duracao_meses_travada !== null &&
    linha.data_primeira_cobranca_travada !== null
      ? {
          valorMensal: linha.valor_mensal_travado,
          duracaoMeses: linha.duracao_meses_travada,
          dataPrimeiraCobranca: linha.data_primeira_cobranca_travada,
        }
      : null

  return {
    ok: true,
    criada: linha.criada,
    // `null` no caso raro de conflito com transação não commitada — ver o
    // bloco de `ResultadoInscricao` e a seção 2.3 da `016`.
    inscricaoId: linha.inscricao_id ?? null,
    contrato,
  }
}

/**
 * Grava em `safras.stripe_price_id` o `price` recém-criado no Stripe.
 *
 * ============================================================
 * ⚠️ ESTA ESCRITA PODE FALHAR DEPOIS DE O `price` JÁ EXISTIR LÁ,
 *    E ISSO É ACEITO — porque a alternativa é pior.
 * ============================================================
 *
 * Não há transação entre o Stripe e o Postgres, e não existe forma de
 * haver: são dois sistemas, duas requisições, dois destinos. A janela é
 * real — criar o `price` pode dar certo e este `update` falhar logo em
 * seguida.
 *
 * O estado resultante é um `price` órfão no Stripe: um objeto que existe
 * lá e que a nossa coluna não conhece. Ele **não cobra ninguém** —
 * `price` sozinho não é assinatura, não tem cliente e não move um
 * centavo. É lixo, e lixo silencioso é o pior desfecho que este caminho
 * produz.
 *
 * A próxima chamada de `precoDaSafra` cria outro `price` idêntico e
 * tenta gravar de novo. Repetir isso muitas vezes acumularia `price`
 * inertes no Dashboard — feio, e barato perto das alternativas:
 *
 *   - reverter no Stripe (`price` não se apaga; só se arquiva) exigiria
 *     tratar a falha do arquivamento, que tem a mesma janela;
 *   - guardar a intenção antes de chamar o Stripe transformaria toda
 *     inscrição em duas escritas no banco para cobrir um caso que não
 *     cobra ninguém quando acontece.
 *
 * ⚠️ NÃO ENGOLIR O ERRO. Quem chama precisa saber que a coluna não
 * acompanhou, para decidir — no fluxo de checkout, o `priceId` devolvido
 * pelo Stripe continua válido e a sessão PODE ser aberta com ele mesmo
 * sem a coluna atualizada. Quem decide isso é a rota, não este módulo.
 */
export async function salvarStripePriceId(safraId: string, priceId: string): Promise<void> {
  const { error } = await supabase()
    .from('safras')
    .update({ stripe_price_id: priceId })
    .eq('id', safraId)

  if (error) {
    throw new Error(`safras(stripe_price_id): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

// ============================================================
// O PAINEL — leituras e escritas que SÓ a Giovanna faz
// ============================================================
//
// ⚠️ TUDO DAQUI PARA BAIXO É ALCANÇÁVEL SÓ POR `/api/admin/*`, e cada uma
// dessas rotas começa com `exigirAdmin`. Nenhuma destas funções tem
// verificação de acesso própria, de propósito: autorização é decisão de
// ROTA, feita uma vez, num lugar que dá para auditar lendo a primeira
// linha do handler. Espalhá-la aqui dentro criaria a ilusão de defesa em
// profundidade e, na prática, dois lugares para alguém esquecer.

/** Uma safra como o painel a lista. */
export type SafraDoPainel = Pick<
  Tables<'safras'>,
  'id' | 'nome' | 'data_inicio_aulas' | 'inscricoes_abertas'
>

/**
 * Todas as safras, da mais recente para a mais antiga.
 *
 * ⚠️ SEM PAGINAÇÃO, e é uma escolha com prazo de validade escrito: safra é
 * semestral. Vinte anos de produto são quarenta linhas. No dia em que isso
 * deixar de ser verdade, este comentário é o aviso de que ninguém pensou
 * no assunto — e não de que alguém decidiu que não precisava.
 */
export async function listarSafras(): Promise<SafraDoPainel[]> {
  const { data, error } = await supabase()
    .from('safras')
    .select('id,nome,data_inicio_aulas,inscricoes_abertas')
    .order('data_inicio_aulas', { ascending: false })

  if (error) {
    throw new Error(`safras(painel): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data ?? []
}

/**
 * Os contadores da tela de hoje (`c64`).
 *
 * ⚠️ CINCO CONSULTAS `head: true` E NENHUMA LINHA TRAFEGANDO. O PostgREST
 * responde só o cabeçalho `Content-Range` quando `head` é verdadeiro — é o
 * que evita arrastar a lista inteira de inscritas, com dado pessoal
 * dentro, para exibir um número. A tela de contagem não tem por que
 * carregar quem está sendo contado.
 *
 * ⚠️ `pendentes` É A FILA DA D-15, e é o contador que existe para ser
 * OLHADO: quem está em `pendente_pagamento` não tem como sair sozinha — não
 * sabe que está pendente, e refazer o formulário devolve "você já está
 * inscrita". Sem este número na cara dela, o estado é invisível.
 */
export type ContagensDoPainel = {
  listaEspera: number
  pendentes: number
  confirmadas: number
  ativas: number
  inadimplentes: number
}

export async function contarPorStatus(): Promise<ContagensDoPainel> {
  const conta = async (status: StatusInscricao) => {
    const { count, error } = await supabase()
      .from('inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)

    if (error) {
      throw new Error(`inscricoes(count ${status}): ${error.code ?? 'sem código'} — ${error.message}`)
    }

    // ⚠️ `null` NÃO VIRA ZERO. Significaria que o `Content-Range` não veio,
    // e exibir 0 afirmaria "não há ninguém" a partir de uma resposta que
    // não disse nada. É o mesmo erro de sempre, com sinal trocado — e num
    // painel ele é pior, porque um zero é exatamente o que faz a Giovanna
    // não olhar de novo.
    if (count === null) throw new Error(`inscricoes(count ${status}): sem contagem`)

    return count
  }

  const [listaEspera, pendentes, confirmadas, ativas, inadimplentes] = await Promise.all([
    conta('lista_espera'),
    conta('pendente_pagamento'),
    conta('confirmada'),
    conta('ativa'),
    conta('inadimplente'),
  ])

  return { listaEspera, pendentes, confirmadas, ativas, inadimplentes }
}

/**
 * Uma safra inteira, como o painel a edita (`c65`).
 *
 * ⚠️ `Row` COMPLETA aqui, e não um `Pick`, e a diferença em relação a
 * `Safra`/`SafraVitrine` é o propósito: aquelas atravessam uma fronteira
 * (para a landing, para a modal) e carregam o mínimo. Esta NÃO atravessa —
 * ela alimenta um formulário que edita a linha, e um `Pick` aqui
 * significaria uma coluna que a Giovanna não consegue ver nem corrigir
 * pelo painel, que é exatamente o que a D-07 existe para impedir.
 */
export type SafraCompleta = Tables<'safras'>

export async function listarSafrasCompletas(): Promise<SafraCompleta[]> {
  const { data, error } = await supabase()
    .from('safras')
    .select('*')
    .order('data_inicio_aulas', { ascending: false })

  if (error) {
    throw new Error(`safras(completas): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data ?? []
}

/**
 * Quantas inscrições desta safra JÁ TÊM CONTRATO (`c66`, D-06).
 *
 * ⚠️ É O NÚMERO QUE O AVISO DE PREÇO TRAVADO PRECISA. A D-06 obriga: "o
 * painel avisa na cara da Giovanna, ao editar uma safra que já tem
 * inscrição paga, que a mudança só vale para quem vier depois". Sem este
 * número o aviso teria que ser genérico — e um aviso que aparece sempre é
 * um aviso que ninguém lê.
 *
 * ⚠️ OS QUATRO STATUS SÃO OS DO CHECK `inscricoes_paga_tem_travado_check`
 * da `015`, e a coincidência não é acidente: são exatamente os estados em
 * que existe contrato travado. `pendente_pagamento` fica de fora porque
 * quem abandonou o checkout não acordou preço nenhum — e incluí-la faria o
 * aviso disparar por gente que nunca vai pagar.
 */
export async function contarComContrato(safraId: string): Promise<number> {
  const { count, error } = await supabase()
    .from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('safra_id', safraId)
    .in('status', ['confirmada', 'ativa', 'inadimplente', 'concluida'])

  if (error) {
    throw new Error(`inscricoes(contrato): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  // `null` não vira zero: exibir 0 afirmaria "ninguém pagou ainda" a partir
  // de uma resposta que não disse nada — e é justamente esse zero que faria
  // o aviso da D-06 não aparecer.
  if (count === null) throw new Error('inscricoes(contrato): sem contagem')

  return count
}

/**
 * `Setembro 2026` → `setembro-2026`.
 *
 * ============================================================
 * ⚠️ ELE É DERIVADO DO NOME, E SÓ NA CRIAÇÃO
 * ============================================================
 *
 * `slug` é "identificador estável e legível" (`002`), usado como
 * referência humana em log e suporte. Duas consequências, e as duas são
 * decisão:
 *
 *   NÃO É CAMPO DO FORMULÁRIO. Pedir à Giovanna que digite um
 *     identificador técnico ao lado do nome é pedir que ela invente uma
 *     regra que o sistema já sabe aplicar — e um dia ela digitaria
 *     `Setembro 2026`, com espaço e maiúscula, num campo que o resto do
 *     sistema trata como chave.
 *
 *   ⚠️ NÃO MUDA NUM RENAME. `atualizarSafra` não toca no slug, de
 *     propósito: "estável" é a metade do contrato dele. Corrigir um erro
 *     de digitação no nome não pode invalidar a referência que está num
 *     log de três meses atrás ou numa conversa de suporte.
 *
 * ⚠️ COLISÃO É POSSÍVEL e é tratada pelo banco: duas safras com o mesmo
 * nome geram o mesmo slug, e o unique levanta `23505`. A mensagem do
 * painel diz "já existe uma turma com esse nome", que é verdade e é
 * acionável — melhor do que um sufixo numérico automático, que produziria
 * `setembro-2026-2` sem ninguém entender de onde veio.
 *
 * `normalize('NFD')` + remoção de diacríticos: `Março` vira `marco`, e
 * não `mar-o`. Sem isso, todo nome com acento perderia uma letra.
 */
export function paraSlug(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // Um nome só de símbolos produziria slug vazio, e o `not null` do banco
  // recusaria com uma mensagem que não ajuda ninguém. Falhar aqui deixa a
  // rota dizer o que fazer.
  if (!slug) throw new Error('O nome da turma precisa ter pelo menos uma letra ou número.')

  return slug
}

/** Os campos que a Giovanna edita. Nenhum deles é derivado. */
export type SafraParaSalvar = {
  nome: string
  data_inicio_aulas: string
  data_primeira_cobranca: string
  valor_mensal: number
  duracao_meses: number
  vagas_total: number | null
}

/**
 * Cria uma safra.
 *
 * ⚠️ ELA NASCE COM `inscricoes_abertas = false`, SEMPRE, e isso não é
 * parâmetro. Abrir inscrições é um ato separado e visível (`c67`) — se
 * fosse um checkbox no formulário de criação, uma safra recém-cadastrada
 * com o preço ainda errado poderia sair vendendo no mesmo clique. Criar e
 * publicar são decisões diferentes e o painel as separa.
 *
 * ⚠️ `stripe_price_id` também não entra: ele é consequência, não escolha.
 * Nasce nulo e é preenchido pelo primeiro checkout, que espelha o valor no
 * Stripe (D-07). Deixar a Giovanna digitar um `price_...` seria abrir a
 * porta para a safra apontar para um preço que não é o dela.
 */
export async function criarSafra(dados: SafraParaSalvar): Promise<SafraCompleta> {
  const { data, error } = await supabase()
    .from('safras')
    // ⚠️ O `slug` É DERIVADO DO NOME, E SÓ NA CRIAÇÃO — ver `paraSlug`.
    .insert({ ...dados, slug: paraSlug(dados.nome) })
    .select('*')
    .limit(1)

  if (error) {
    throw new Error(`safras(insert): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const linha = data?.[0]
  if (!linha) throw new Error('safras(insert): nenhuma linha devolvida')

  return linha
}

/**
 * Salva a edição.
 *
 * ⚠️ MUDAR O PREÇO AQUI NÃO MEXE EM QUEM JÁ ASSINOU, e é a D-06
 * funcionando de graça: o valor que vale para cada inscrição está copiado
 * em `valor_mensal_travado`, na própria linha dela, desde o checkout. Do
 * lado do Stripe é igual — `price` é imutável e a assinatura cobra o que
 * foi acordado na criação.
 *
 * O que este `update` muda é o preço de QUEM VIER DEPOIS. Quem avisa isso
 * na tela é o `c66`, com a contagem de `contarComContrato`.
 *
 * ⚠️ E ELE NÃO TOCA `inscricoes_abertas`. Abrir e fechar é outro ato, com
 * outra função — misturar os dois faria salvar uma correção de digitação
 * no nome abrir as inscrições por efeito colateral.
 */
export async function atualizarSafra(safraId: string, dados: SafraParaSalvar): Promise<void> {
  const { error } = await supabase().from('safras').update(dados).eq('id', safraId)

  if (error) {
    throw new Error(`safras(update): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

/**
 * Abre ou fecha as inscrições de uma safra (`c67`).
 *
 * ============================================================
 * ⚠️ O BANCO SÓ DEIXA UMA SAFRA ABERTA POR VEZ
 * ============================================================
 *
 * `safras_uma_aberta_idx` é um índice único PARCIAL sobre
 * `inscricoes_abertas` (migração `005`): abrir a segunda levanta `23505`.
 *
 * ⚠️ E ESTA FUNÇÃO NÃO FECHA A OUTRA POR CONTA PRÓPRIA. A tentação é
 * óbvia — "fecha a anterior e abre esta, numa transação" — e ela está
 * errada por duas razões:
 *
 *   1. NÃO EXISTE TRANSAÇÃO AQUI. O PostgREST expõe uma requisição HTTP
 *      por comando; fechar e abrir seriam duas, e entre elas existe um
 *      instante com ZERO safras abertas. Quem carregasse a landing nesse
 *      instante veria "inscrições fechadas".
 *   2. FECHAR UMA TURMA É DECISÃO DELA, não efeito colateral de abrir
 *      outra. Uma safra aberta pode ter gente no meio do checkout.
 *
 * Então o erro sobe, e o painel diz "já existe uma turma aberta — feche a
 * outra primeiro". Duas ações explícitas, na ordem que ela escolher.
 */
export async function alternarInscricoes(safraId: string, abertas: boolean): Promise<void> {
  const { error } = await supabase()
    .from('safras')
    .update({ inscricoes_abertas: abertas })
    .eq('id', safraId)

  if (error) {
    // ⚠️ O código é preservado para o chamador poder distinguir "já existe
    // uma aberta" de "o banco caiu". Sem ele, as duas viram a mesma
    // mensagem genérica e a Giovanna não sabe se tenta de novo ou se fecha
    // a outra.
    const e = new Error(`safras(abertas): ${error.code ?? 'sem código'} — ${error.message}`)
    ;(e as Error & { codigoPg?: string }).codigoPg = error.code
    throw e
  }
}

// ------------------------------------------------------------
// GRUPOS — horário dentro da safra (`c68`)
//
// ⚠️ GRUPO NÃO TEM CALENDÁRIO NEM PREÇO (D-01). Ele é só um horário
// (segunda 19h, quarta 19h) dentro de uma safra, e a decisão PROÍBE
// qualquer coluna de data, valor ou duração aqui. O pool de aulas começa
// no mesmo dia para todo mundo; a divisão por dia da semana é logística de
// agenda, não de contrato.
// ------------------------------------------------------------

export type GrupoDoPainel = Tables<'grupos'>

export async function listarGrupos(safraId: string): Promise<GrupoDoPainel[]> {
  const { data, error } = await supabase()
    .from('grupos')
    .select('*')
    .eq('safra_id', safraId)
    .order('dia_semana')
    .order('horario')

  if (error) {
    throw new Error(`grupos(lista): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data ?? []
}

export async function criarGrupo(dados: {
  safraId: string
  diaSemana: string
  horario: string
  capacidade: number | null
}): Promise<void> {
  const { error } = await supabase().from('grupos').insert({
    safra_id: dados.safraId,
    dia_semana: dados.diaSemana,
    horario: dados.horario,
    capacidade: dados.capacidade,
  })

  if (error) {
    throw new Error(`grupos(insert): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

/**
 * Liga e desliga um horário.
 *
 * ⚠️ NÃO É `delete`, e a razão é a FK: `inscricoes.grupo_id` aponta para
 * cá, e apagar um grupo com aluna alocada esbarraria no `on delete
 * restrict` — ou, pior, num `cascade` que alguém acrescentasse "para
 * resolver", apagando a alocação de gente real. Desligar tira o horário
 * das opções novas e mantém o histórico de quem está nele.
 */
export async function alternarGrupo(grupoId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase().from('grupos').update({ ativo }).eq('id', grupoId)

  if (error) {
    throw new Error(`grupos(ativo): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

// ------------------------------------------------------------
// ALUNAS — a lista (`c69`), a ficha (`c70`) e a alocação (`c71`, `c72`)
// ------------------------------------------------------------

/** Uma linha da lista de alunas. */
export type AlunaDaLista = {
  inscricao_id: string
  pessoa_id: string
  nome: string
  email: string
  telefone: string
  status: StatusInscricao
  criada_em: string
  safra_id: string | null
  safra_nome: string | null
  grupo_id: string | null
}

/**
 * A lista, com filtros (`c69`).
 *
 * ⚠️ OS FILTROS SÃO OPCIONAIS E SE COMBINAM. Sem nenhum, ela devolve tudo
 * — o que na escala deste produto (dezenas por safra) é uma tela que
 * carrega. Se um dia isso deixar de ser verdade, este comentário é o aviso
 * de que ninguém pensou em paginação, e não de que alguém decidiu que não
 * precisava.
 *
 * ⚠️ O `select` É UMA STRING LITERAL. O SDK infere o tipo do resultado a
 * partir do TEXTO — quebrar em pedaços com `+` produz `string`, a
 * inferência desiste, e o erro é críptico. Ver `buscarInscricaoParaEmail`.
 */
export async function listarAlunas(filtros: {
  safraId?: string | null
  status?: StatusInscricao | null
}): Promise<AlunaDaLista[]> {
  let query = supabase()
    .from('inscricoes')
    .select('id,status,created_at,safra_id,grupo_id,pessoas(id,nome,email,telefone),safras(nome)')
    .order('created_at', { ascending: false })

  if (filtros.safraId) query = query.eq('safra_id', filtros.safraId)
  if (filtros.status) query = query.eq('status', filtros.status)

  const { data, error } = await query

  if (error) {
    throw new Error(`inscricoes(alunas): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return (data ?? [])
    .filter((l) => l.pessoas)
    .map((l) => ({
      inscricao_id: l.id,
      pessoa_id: l.pessoas!.id,
      nome: l.pessoas!.nome,
      email: l.pessoas!.email,
      telefone: l.pessoas!.telefone,
      status: l.status as StatusInscricao,
      criada_em: l.created_at,
      safra_id: l.safra_id,
      safra_nome: l.safras?.nome ?? null,
      grupo_id: l.grupo_id,
    }))
}

/** A ficha (`c70`) — tudo que se sabe sobre uma inscrição. */
export type FichaDaAluna = {
  inscricao: Tables<'inscricoes'>
  pessoa: Tables<'pessoas'>
  safra: Pick<Tables<'safras'>, 'id' | 'nome' | 'data_inicio_aulas'> | null
  grupo: Pick<Tables<'grupos'>, 'id' | 'dia_semana' | 'horario'> | null
  assinatura: Pick<
    Tables<'assinaturas'>,
    'status_stripe' | 'ciclos_pagos' | 'trial_end' | 'cancel_at' | 'stripe_subscription_id'
  > | null
}

/**
 * A ficha inteira, numa consulta.
 *
 * ⚠️ ELA CARREGA O CONSENTIMENTO — `consent`, `consent_at`, `consent_text`
 * — e isso é o ponto, não um descuido. É a única tela do sistema onde a
 * prova de consentimento é legível por gente, e ela existe porque um dia
 * alguém vai perguntar "quando ela aceitou, e o quê?". Sob LGPD, não
 * conseguir responder é o mesmo que não ter a prova.
 *
 * ⚠️ `consent` NULO É UM VALOR, e a ficha tem que mostrá-lo como "não
 * sabemos" — nunca como "não aceitou". São as linhas herdadas da `010`,
 * onde nunca houve backfill de propósito: `null` significa que o registro
 * é anterior ao sistema de consentimento, e falsificá-lo seria destruir a
 * própria prova que a coluna existe para guardar.
 */
export async function buscarFicha(inscricaoId: string): Promise<FichaDaAluna | null> {
  const { data, error } = await supabase()
    .from('inscricoes')
    .select('*,pessoas(*),safras(id,nome,data_inicio_aulas),grupos(id,dia_semana,horario),assinaturas(status_stripe,ciclos_pagos,trial_end,cancel_at,stripe_subscription_id)')
    .eq('id', inscricaoId)
    .limit(1)

  if (error) {
    throw new Error(`inscricoes(ficha): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const l = data?.[0]
  if (!l || !l.pessoas) return null

  const { pessoas, safras, grupos, assinaturas, ...inscricao } = l

  return {
    inscricao: inscricao as Tables<'inscricoes'>,
    pessoa: pessoas,
    safra: safras ?? null,
    grupo: grupos ?? null,
    // `assinaturas` é 1:1 pelo unique de `inscricao_id` (`012`), mas o
    // PostgREST devolve o embed conforme a cardinalidade que ele infere.
    // O `Array.isArray` cobre as duas formas sem apostar em uma.
    assinatura: Array.isArray(assinaturas) ? (assinaturas[0] ?? null) : (assinaturas ?? null),
  }
}

/**
 * Move uma aluna de horário (`c72`).
 *
 * ============================================================
 * ⚠️ ELA NÃO TOCA NO STRIPE — D-03, e é a decisão inteira
 * ============================================================
 *
 * "Arrastar uma aluna de segunda para quarta no painel não dispara,
 * cancela ou altera nada no Stripe." A razão: ela já pagou antes de ser
 * alocada. Separar as duas coisas é o que torna o kanban seguro de usar —
 * a Giovanna pode reorganizar a semana inteira sem medo.
 *
 * A D-03 PROÍBE "qualquer chamada ao Stripe nos handlers de alocação", e
 * `tests/admin-alocacao.test.ts` verifica isso lendo este módulo e a rota
 * como texto.
 *
 * ⚠️ QUEM GARANTE QUE O GRUPO É DA MESMA SAFRA É O BANCO, não esta
 * função. O trigger `inscricao_grupo_da_mesma_safra` da `009` recusa a
 * escrita — a FK sozinha só sabe dizer "este grupo existe", e não que ele
 * pertence à safra da inscrição. Repetir a regra aqui criaria uma segunda
 * cópia dela, e um dia as duas discordam (REPORT §9.9).
 *
 * ⚠️ `null` É UM DESTINO VÁLIDO: tirar de todos os horários. Uma inscrição
 * nasce sem grupo e pode voltar a ficar sem — "ainda não alocada" é um
 * estado legítimo, não um erro.
 */
export async function moverParaGrupo(inscricaoId: string, grupoId: string | null): Promise<void> {
  const { error } = await supabase()
    .from('inscricoes')
    .update({ grupo_id: grupoId })
    .eq('id', inscricaoId)

  if (error) {
    const e = new Error(`inscricoes(grupo): ${error.code ?? 'sem código'} — ${error.message}`)
    ;(e as Error & { codigoPg?: string }).codigoPg = error.code
    throw e
  }
}

/**
 * A fila de pagamento pendente (D-15, `c75`).
 *
 * ============================================================
 * ⚠️ POR QUE ESTA CONSULTA EXISTE, E POR QUE ELA VEM SEPARADA
 * ============================================================
 *
 * Inscrição em `pendente_pagamento` é um BECO SEM SAÍDA para quem está
 * dentro dele. A pessoa não sabe que está pendente — ninguém contou —, e
 * refazer o formulário devolve "você já está inscrita". Sem esta tela, a
 * única saída seria a Giovanna abrir o Supabase Studio, o que a D-07
 * proíbe.
 *
 * ⚠️ E ELA MOSTRA HÁ QUANTO TEMPO CADA UMA ESTÁ PARADA, porque a D-15
 * obriga. Não é enfeite: é a diferença entre "alguém abandonou o checkout
 * agora e talvez volte sozinha" e "alguém está esperando há três semanas".
 * As duas pedem ações diferentes.
 *
 * ⚠️ O `created_at` É O DA INSCRIÇÃO, e não o da pessoa: quem esteve na
 * lista de espera por meses e abriu o checkout ontem está parada há um
 * dia, não há meses.
 *
 * `token_expira_em` vem junto para a tela poder dizer se já existe convite
 * vivo — reenviar tem que mandar o MESMO link que está na caixa de entrada
 * dela, e não um novo que invalide o primeiro.
 */
export type PendenteDoPainel = {
  inscricao_id: string
  pessoa_id: string
  nome: string
  email: string
  telefone: string
  criada_em: string
  safra_nome: string | null
  token_expira_em: string | null
}

export async function listarPendentes(): Promise<PendenteDoPainel[]> {
  const { data, error } = await supabase()
    .from('inscricoes')
    .select('id,created_at,pessoas(id,nome,email,telefone,token_expira_em),safras(nome)')
    .eq('status', 'pendente_pagamento')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`inscricoes(pendentes): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  // ⚠️ Linha sem pessoa é IGNORADA em silêncio, e o silêncio é justificado:
  // a FK de `inscricoes.pessoa_id` é `not null` (`008`), então o caso é
  // impossível — e o `filter` existe só porque o tipo gerado não sabe
  // disso. Transformá-lo em erro derrubaria a tela inteira por causa de
  // uma linha que não pode existir.
  return (data ?? [])
    .filter((linha) => linha.pessoas)
    .map((linha) => ({
      inscricao_id: linha.id,
      pessoa_id: linha.pessoas!.id,
      nome: linha.pessoas!.nome,
      email: linha.pessoas!.email,
      telefone: linha.pessoas!.telefone,
      criada_em: linha.created_at,
      safra_nome: linha.safras?.nome ?? null,
      token_expira_em: linha.pessoas!.token_expira_em,
    }))
}

/**
 * Garante um convite vivo para esta pessoa e devolve o token.
 *
 * ============================================================
 * ⚠️⚠️ TOKEN AINDA VÁLIDO NÃO É SOBRESCRITO — e esta é a linha que mais
 *      importa desta função
 * ============================================================
 *
 * Regenerar o token de quem já recebeu o convite INVALIDA o link que está
 * na caixa de entrada dela. Ela clica, cai no fluxo limpo, e preenche o
 * formulário inteiro de novo — exatamente o que o convite existe para
 * evitar. E como o e-mail já foi disparado, não há como avisar: o link
 * morto continua lá.
 *
 * É a mesma regra do `supabase/operacao/gerar_convites.sql`, e ela vale
 * aqui com mais força: o botão do painel é feito para ser apertado duas
 * vezes por engano.
 *
 * ⚠️ LER E DEPOIS ESCREVER É UMA CORRIDA, e ela é aceita: o único
 * chamador é uma pessoa clicando num botão. Dois cliques simultâneos da
 * mesma Giovanna produziriam dois tokens, o segundo vencendo — e o
 * desfecho é um e-mail com link morto, que ela reenvia. Um lock aqui
 * custaria mais do que o problema que resolve (D-08 aplicada a outro
 * objeto).
 *
 * ⚠️ 32 BYTES, e é a ENTROPIA que defende a URL — não um rate limit. É a
 * premissa do parágrafo de `GET /api/pessoa/:token` que explica por que
 * não há rate limit lá. Se este número encolher, aquela análise morre
 * junto.
 */
export async function garantirConvite(
  pessoaId: string,
  validadeEmDias: number,
): Promise<{ token: string; expiraEm: string; reaproveitado: boolean }> {
  const { data, error } = await supabase()
    .from('pessoas')
    .select('token_acesso,token_expira_em')
    .eq('id', pessoaId)
    .limit(1)

  if (error) {
    throw new Error(`pessoas(convite): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const atual = data?.[0]

  if (atual?.token_acesso && atual.token_expira_em && new Date(atual.token_expira_em) > new Date()) {
    return { token: atual.token_acesso, expiraEm: atual.token_expira_em, reaproveitado: true }
  }

  // `randomBytes` do Node e não `Math.random`: este valor é um segredo, e
  // `Math.random` não é criptográfico — é previsível a partir de saídas
  // anteriores. base64url porque `+`, `/` e `=` mudam de forma ao passar
  // por uma URL, e um token que muda de forma não casa com nada quando
  // volta.
  const { randomBytes } = await import('node:crypto')
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(Date.now() + validadeEmDias * 24 * 60 * 60 * 1000).toISOString()

  const { error: erroUpdate } = await supabase()
    .from('pessoas')
    .update({ token_acesso: token, token_expira_em: expiraEm })
    .eq('id', pessoaId)

  if (erroUpdate) {
    throw new Error(`pessoas(token): ${erroUpdate.code ?? 'sem código'} — ${erroUpdate.message}`)
  }

  return { token, expiraEm, reaproveitado: false }
}

/** Cupom na listagem do painel — a linha inteira, que é dela mesmo. */
export type CupomDoPainel = Tables<'cupons'>

export async function listarCupons(): Promise<CupomDoPainel[]> {
  const { data, error } = await supabase()
    .from('cupons')
    .select('*')
    .order('criado_em', { ascending: false })

  if (error) {
    throw new Error(`cupons(painel): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data ?? []
}

/**
 * Cria o cupom no NOSSO banco. O espelho no Stripe é do chamador.
 *
 * ⚠️ A DIREÇÃO É UMA SÓ (D-07): nasce aqui, é espelhado lá. Cupom criado
 * pelo Dashboard do Stripe não existe para o sistema — não aparece no
 * painel, não tem contagem de uso, e a Giovanna não teria como saber que
 * ele existe.
 *
 * ⚠️ ESTA FUNÇÃO NÃO CHAMA O STRIPE, e a separação é o que torna o estado
 * intermediário honesto. A criação lá é uma chamada de rede que pode
 * falhar depois de a linha estar gravada; `stripe_coupon_id` nulo
 * significa exatamente isso — "existe aqui, ainda não existe lá" — e o
 * painel mostra "não publicado" em vez de fingir que está pronto. Fundir
 * as duas obrigaria a inventar uma transação que atravessa a fronteira do
 * banco, que é o que não existe.
 *
 * ⚠️ NENHUMA VALIDAÇÃO DE DOMÍNIO AQUI. Percentual acima de 100, valor
 * negativo, tipo inventado e `usos_atuais > usos_max` são recusados pelos
 * CHECKs da `013`. Repetir as regras nesta camada criaria uma segunda
 * cópia delas, e um dia as duas discordam — constraint no banco vence
 * validação na aplicação (REPORT §9.9).
 */
export async function criarCupom(dados: {
  codigo: string
  tipo: string
  valor: number
  safraId: string | null
  usosMax: number | null
  expiraEm: string | null
}): Promise<CupomDoPainel> {
  const { data, error } = await supabase()
    .from('cupons')
    .insert({
      codigo: dados.codigo,
      tipo: dados.tipo,
      valor: dados.valor,
      safra_id: dados.safraId,
      usos_max: dados.usosMax,
      expira_em: dados.expiraEm,
    })
    .select('*')
    .limit(1)

  if (error) {
    throw new Error(`cupons(insert): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const linha = data?.[0]
  if (!linha) throw new Error('cupons(insert): nenhuma linha devolvida')

  return linha
}

/**
 * Liga e desliga um cupom.
 *
 * ⚠️ É O BOTÃO DE PÂNICO DA GIOVANNA, e por isso ele é um `update` de uma
 * coluna e não um `delete`. O cupom vazou num grupo de WhatsApp e ela
 * precisa parar AGORA — sem apagar o histórico de quem já usou, que é
 * informação financeira, e sem quebrar a FK de `assinaturas.cupom_id`.
 *
 * ⚠️ E DESLIGAR NÃO MEXE NO STRIPE. O `coupon` de lá continua existindo,
 * inerte: quem decide se um desconto se aplica é `cupomInvalidoPorque`,
 * do nosso lado, ANTES de a sessão ser criada. Apagar no Stripe não
 * cancelaria desconto de assinatura nenhuma que já o tenha — só tiraria a
 * nossa capacidade de reativar.
 */
export async function alternarCupom(cupomId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase().from('cupons').update({ ativo }).eq('id', cupomId)

  if (error) {
    throw new Error(`cupons(ativo): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

// ============================================================
// O TOKEN DE ACESSO — identifica, e NÃO autoriza (D-10, D-15)
// ============================================================

/**
 * O contato de quem chegou pelo link do convite. `null` quando o token
 * não existe.
 *
 * ⚠️ ELA NÃO OLHA A VALIDADE, e a separação é a mesma de `buscarCupom` e
 * `cupomInvalidoPorque`: a leitura tem uma resposta (existe ou não), o
 * julgamento tem outra (venceu ou não), e o `token_expira_em` volta junto
 * para quem chamou decidir. Fundir as duas produziria um `null` que
 * significa duas coisas e um log que não sabe dizer qual delas aconteceu
 * — "ninguém achou o token" e "o convite venceu" pedem respostas
 * diferentes de quem opera.
 *
 * ⚠️ E ELA DEVOLVE DADO PESSOAL PARA QUEM TEM O TOKEN. É exatamente o que
 * a D-10 pede — o link do convite pré-preenche a modal para que quem já
 * se cadastrou não digite tudo de novo —, e é por isso que o token é um
 * segredo de 32 bytes e não um id de banco: o que destranca este retorno
 * precisa ser impossível de adivinhar.
 *
 * ⚠️ O QUE NÃO VOLTA: o perfil (`nivel_ingles`, `curso`, `periodo`,
 * `disponibilidade`). Não é esquecimento — é a `008` sendo respeitada. O
 * perfil descreve a pessoa NAQUELA safra, e por isso mora em `inscricoes`
 * e não em `pessoas`: quem estava no 3º período em janeiro está no 5º em
 * julho. Pré-preencher o perfil a partir de uma inscrição antiga
 * apresentaria à pessoa uma resposta desatualizada JÁ MARCADA, que é a
 * forma mais eficiente de gravar um dado errado — ela confirma sem ler,
 * porque o campo já estava preenchido.
 */
export type PessoaDoToken = {
  nome: string
  email: string
  telefone: string
  token_expira_em: string | null
}

export async function buscarPessoaPorToken(token: string): Promise<PessoaDoToken | null> {
  const { data, error } = await supabase()
    .from('pessoas')
    .select('nome,email,telefone,token_expira_em')
    .eq('token_acesso', token)
    .limit(1)

  if (error) {
    throw new Error(`pessoas(token): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/**
 * O token venceu? `true` também quando não há data — ver abaixo.
 *
 * ⚠️ FUNÇÃO PURA, com `agora` POR PARÂMETRO, pelo mesmo motivo de
 * `cupomInvalidoPorque`: uma função que lê o relógio por dentro só pode
 * ser testada esperando o tempo passar.
 *
 * ⚠️ `token_expira_em` NULO CONTA COMO VENCIDO, e a escolha é deliberada.
 * O CHECK `pessoas_token_tudo_ou_nada_check` da `017` torna esse par
 * impossível de escrever — token sem validade é exatamente o link eterno
 * que a D-10 proíbe —, então chegar aqui com nulo significa que alguém
 * contornou o CHECK. Tratar como válido seria conceder acesso perpétuo
 * justamente no caso em que o mecanismo falhou; tratar como vencido faz o
 * link cair no fluxo limpo, que é o pior desfecho aceitável: a pessoa
 * preenche o formulário do zero.
 */
export function tokenVenceu(pessoa: PessoaDoToken, agora: Date): boolean {
  if (!pessoa.token_expira_em) return true
  return new Date(pessoa.token_expira_em) <= agora
}

// ============================================================
// CUPOM — nasce no nosso banco, é espelhado no Stripe (D-07)
// ============================================================
//
// A direção é uma só, e nunca a inversa. Cupom criado pelo Dashboard do
// Stripe não existe para o sistema: não aparece no painel, não tem
// contagem de uso, e a Giovanna não teria como saber que ele existe.
// Ver o cabeçalho da `013`.

/** O recorte de `cupons` que a validação e o espelho precisam. */
export type Cupom = Pick<
  Tables<'cupons'>,
  'id' | 'codigo' | 'tipo' | 'valor' | 'stripe_coupon_id' | 'safra_id' | 'usos_max' | 'usos_atuais' | 'expira_em' | 'ativo'
>

/**
 * Acha o cupom pelo código digitado. `null` quando não existe.
 *
 * ⚠️ A BUSCA É POR `upper(codigo)`, e a normalização não é aqui — é o
 * índice `cupons_codigo_upper_idx` da `013` que a torna propriedade do
 * banco. A aluna digita `bemvinda`, `BemVinda` ou `BEMVINDA` e as três são
 * o mesmo cupom. O `.toUpperCase()` desta função é o que faz a consulta
 * casar com o índice funcional; a UNICIDADE continua sendo do banco, e não
 * desta linha (REPORT §9.9).
 *
 * ⚠️ ESTA FUNÇÃO NÃO DECIDE SE O CUPOM VALE. Ela devolve a linha como
 * está — inclusive expirada, esgotada ou inativa. Quem julga é
 * `cupomAplicavel`, e a separação é deliberada: a leitura tem uma resposta
 * (existe ou não), o julgamento tem várias (expirado, esgotado, de outra
 * safra), e misturá-los produziria um `null` que significa cinco coisas
 * diferentes e uma mensagem de erro que não sabe qual delas dizer.
 */
export async function buscarCupom(codigo: string): Promise<Cupom | null> {
  const { data, error } = await supabase()
    .from('cupons')
    .select('id,codigo,tipo,valor,stripe_coupon_id,safra_id,usos_max,usos_atuais,expira_em,ativo')
    .ilike('codigo', codigo.trim())
    .limit(1)

  if (error) {
    throw new Error(`cupons: ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/**
 * O mesmo cupom, pelo id. É o que o webhook tem em mãos.
 *
 * ⚠️ DUAS FUNÇÕES E NÃO UMA COM DOIS FILTROS, e a razão é o SDK: o tipo do
 * resultado é inferido do TEXTO do `select`, que precisa ser um literal —
 * uma constante compartilhada viraria `string` e a inferência desistiria
 * (ver a nota em `buscarInscricaoParaEmail`). As duas listas de colunas
 * são idênticas de propósito, e é o `Cupom` acima que as amarra: mudar uma
 * sem a outra quebra o tipo.
 */
export async function buscarCupomPorId(id: string): Promise<Cupom | null> {
  const { data, error } = await supabase()
    .from('cupons')
    .select('id,codigo,tipo,valor,stripe_coupon_id,safra_id,usos_max,usos_atuais,expira_em,ativo')
    .eq('id', id)
    .limit(1)

  if (error) {
    throw new Error(`cupons(id): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/** Grava o espelho do Stripe. Mesma janela de `salvarStripePriceId`. */
export async function salvarStripeCouponId(cupomId: string, stripeCouponId: string): Promise<void> {
  const { error } = await supabase()
    .from('cupons')
    .update({ stripe_coupon_id: stripeCouponId })
    .eq('id', cupomId)

  if (error) {
    throw new Error(`cupons(stripe_coupon_id): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

/**
 * Soma um uso. Devolve `false` quando alguém somou antes.
 *
 * Mesmo compare-and-swap de `contarCicloPago`, pela mesma razão: o
 * PostgREST não sabe expressar `usos_atuais = usos_atuais + 1`, e ler para
 * depois escrever abre a corrida clássica.
 *
 * ⚠️ O USO É CONTADO NO PAGAMENTO, E NÃO NA ABERTURA DO CHECKOUT. Contar
 * ao criar a sessão gastaria o cupom de quem abriu a tela e desistiu — um
 * cupom de 10 usos se esgotaria com 10 pessoas curiosas e zero vendas.
 * Quem conta é o webhook, depois de `checkout.session.completed`.
 *
 * ⚠️ E ISSO ACEITA UM ESTOURO CONHECIDO: entre a validação (que só lê) e o
 * pagamento não há trava, então onze pessoas podem concluir um cupom de
 * dez. É a mesma escolha da D-08 para vagas — na escala do produto, um
 * lock distribuído não se paga —, com uma diferença a favor: o CHECK
 * `cupons_usos_check` da `013` recusa `usos_atuais > usos_max`, então o
 * décimo primeiro uso falha no banco e vira log em vez de contagem
 * mentirosa. O desconto já foi dado; o que não acontece é o número ficar
 * errado.
 */
export async function contarUsoDeCupom(cupomId: string, usosLidos: number): Promise<boolean> {
  const { count, error } = await supabase()
    .from('cupons')
    .update({ usos_atuais: usosLidos + 1 }, { count: 'exact' })
    .eq('id', cupomId)
    .eq('usos_atuais', usosLidos)

  if (error) {
    throw new Error(`cupons(usos_atuais): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return count === 1
}

/**
 * Por que um cupom não vale — ou `null` quando ele vale.
 *
 * ⚠️ FUNÇÃO PURA, E É DE PROPÓSITO: ela não lê banco, não chama Stripe e
 * não depende de relógio que não lhe seja passado. É a única parte da
 * regra de cupom que dá para testar sem dublê nenhum, e é onde estão as
 * quatro formas de um desconto não valer. O resto do caminho é
 * encanamento.
 *
 * As quatro, e cada uma com o motivo de existir:
 *
 *   INATIVO      → a Giovanna desligou. É o botão de pânico dela: o cupom
 *                  vazou num grupo de WhatsApp e ela precisa parar agora,
 *                  sem apagar o histórico de quem já usou.
 *   EXPIRADO     → `expira_em` passou. Campanha tem fim.
 *   ESGOTADO     → `usos_max` atingido.
 *   OUTRA SAFRA  → `safra_id` preenchido e diferente. ⚠️ `safra_id` NULO
 *                  significa "vale em qualquer safra" — não é ausência de
 *                  dado, é um valor de negócio (o cupom de campanha que
 *                  funciona na turma que estiver aberta, `013`).
 *
 * ⚠️ NÃO ESPELHADO NO STRIPE **TAMBÉM** É MOTIVO. `stripe_coupon_id` nulo
 * significa que o cupom existe aqui e ainda não existe lá — estado real e
 * transitório, porque a criação no Stripe é uma chamada de rede que pode
 * falhar depois de a linha estar gravada. O checkout tenta espelhar antes
 * de aplicar; se ainda assim não houver espelho, o desconto não pode ser
 * aplicado, e fingir que pode cobraria o valor cheio de quem viu "cupom
 * aplicado" na tela.
 *
 * ⚠️ `agora` É PARÂMETRO, e não `new Date()` aqui dentro. Uma função que
 * lê o relógio por conta própria só pode ser testada esperando o tempo
 * passar — e o teste de expiração viraria um teste que passa hoje e falha
 * em 2027.
 */
export type MotivoCupomInvalido =
  | 'inexistente'
  | 'inativo'
  | 'expirado'
  | 'esgotado'
  | 'outra_safra'
  | 'sem_espelho'

export function cupomInvalidoPorque(
  cupom: Cupom | null,
  safraId: string,
  agora: Date,
): MotivoCupomInvalido | null {
  if (!cupom) return 'inexistente'
  if (!cupom.ativo) return 'inativo'
  if (cupom.expira_em !== null && new Date(cupom.expira_em) <= agora) return 'expirado'
  if (cupom.usos_max !== null && cupom.usos_atuais >= cupom.usos_max) return 'esgotado'
  if (cupom.safra_id !== null && cupom.safra_id !== safraId) return 'outra_safra'
  if (!cupom.stripe_coupon_id) return 'sem_espelho'
  return null
}

// ============================================================
// O LADO DO BANCO DO WEBHOOK
// ============================================================
//
// Tudo daqui para baixo é escrito por `app/api/stripe/webhook/route.ts` e
// por mais ninguém. Nenhuma destas funções é alcançável pelo formulário
// público.

/**
 * Os sete estados de uma inscrição, direto do CHECK da `009`.
 *
 * Escrito à mão e não derivado dos tipos gerados de propósito: o
 * `supabase gen types` traz `status: string`, porque um CHECK de coluna
 * não vira enum de TypeScript. Sem esta união, `mudarStatusInscricao(id,
 * 'aprovda')` compilaria e falharia no banco, em produção, no meio de um
 * webhook — que é o pior lugar para descobrir um erro de digitação.
 *
 * ⚠️ NÃO EXISTE 'aprovada' NEM 'rejeitada' (D-02). Não há entrevista,
 * análise ou triagem: quem conclui o checkout está dentro.
 */
export type StatusInscricao =
  | 'lista_espera'
  | 'pendente_pagamento'
  | 'confirmada'
  | 'ativa'
  | 'inadimplente'
  | 'concluida'
  | 'cancelada'

/** O código do Postgres para violação de unique. Ver o uso abaixo. */
const UNIQUE_VIOLATION = '23505'

/**
 * Reserva o evento. `true` = é nosso, processe. `false` = já processado.
 *
 * ============================================================
 * ⚠️ O INSERT **É** O TESTE — não há `select` antes
 * ============================================================
 *
 * O Stripe reentrega: se o endpoint demorar, cair, devolver 500, ou se a
 * resposta se perder no caminho de volta, o mesmo evento chega de novo — e
 * pode chegar várias vezes, em qualquer ordem, dias depois. Duas entregas
 * do mesmo evento podem chegar SIMULTANEAMENTE, em duas instâncias
 * serverless diferentes.
 *
 * Um `select` seguido de `insert` tem uma janela entre os dois comandos, e
 * nessa janela as duas leem "não existe" e as duas processam. A janela é
 * de milissegundos e é exatamente onde a reentrega cai, porque reentrega
 * em rajada é o caso normal quando o endpoint fica lento. Com a PK, a
 * segunda requisição recebe `23505`, que aqui significa, sem ambiguidade
 * nenhuma, "outra instância já pegou este evento". Ver o cabeçalho da
 * `014`.
 *
 * ⚠️ QUALQUER OUTRO CÓDIGO DE ERRO É FALHA, e não "provavelmente
 * duplicata". `23505` só pode vir da PK — é a única unique da tabela.
 */
export async function reservarEventoStripe(evento: {
  id: string
  tipo: string
  payload: unknown
}): Promise<boolean> {
  const { error } = await supabase().from('eventos_stripe').insert({
    stripe_event_id: evento.id,
    tipo: evento.tipo,
    // ⚠️ O payload guarda o evento inteiro, cru, e ele CONTÉM DADO
    // PESSOAL — e-mail, nome, últimos quatro dígitos do cartão. É dado
    // pessoal sob LGPD como qualquer outro (ver a `014`). Ele existe para
    // permitir reprocessar um evento à mão quando um handler tiver bug,
    // sem depender de o Stripe ainda ter aquele evento na fila de
    // reentrega — a janela dele é de dias.
    payload: evento.payload as never,
  })

  if (!error) return true
  if (error.code === UNIQUE_VIOLATION) return false

  throw new Error(`eventos_stripe: ${error.code ?? 'sem código'} — ${error.message}`)
}

/**
 * Devolve o evento para a fila, apagando a reserva.
 *
 * ============================================================
 * ⚠️ ESTA FUNÇÃO EXISTE POR CAUSA DE UMA ARMADILHA REAL, E ELA É A
 *    CONSEQUÊNCIA DIRETA DE "O INSERT VEM PRIMEIRO"
 * ============================================================
 *
 * A `014` manda gravar o evento ANTES de qualquer efeito, e a razão é a
 * corrida descrita acima. Só que as duas regras — "grava antes" e
 * "reentrega não conta duas vezes" — juntas produzem um terceiro
 * comportamento que ninguém pediu:
 *
 *   evento gravado → efeito falha → devolvemos 500 → o Stripe reentrega
 *   → a reserva encontra o evento JÁ GRAVADO → nós pulamos o
 *   processamento → **o efeito nunca acontece.**
 *
 * Uma cobrança confirmada que não vira `ativa`, para sempre, sem erro
 * nenhum aparecendo em lugar nenhum depois da primeira tentativa. É o pior
 * tipo de falha que este projeto pode ter: silenciosa, financeira, e
 * indistinguível de sucesso.
 *
 * A saída é a reserva ser CANCELÁVEL. Quem processa apaga a linha antes de
 * devolver 500, e a reentrega volta a ser um evento novo. O intervalo em
 * que a linha existe sem efeito correspondente é o intervalo de uma
 * requisição — e ele é exatamente o que impede a outra instância de
 * processar em paralelo, que é para o que ele foi criado.
 *
 * ⚠️ NÃO ENGOLIR O ERRO DAQUI seria pior do que engoli-lo: se o delete
 * falhar, o 500 já vai ser devolvido de qualquer forma, e trocar a causa
 * real (o handler quebrou) por uma consequência (o delete quebrou) faz o
 * log apontar para o lugar errado. Quem chama registra as duas coisas.
 */
export async function liberarEventoStripe(eventoId: string): Promise<void> {
  const { error } = await supabase()
    .from('eventos_stripe')
    .delete()
    .eq('stripe_event_id', eventoId)

  if (error) {
    throw new Error(`eventos_stripe(delete): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

/**
 * Cria ou atualiza a assinatura espelhada. Idempotente pelo
 * `stripe_subscription_id`.
 *
 * ⚠️ `upsert` COM `onConflict` NO ID DO STRIPE, e não `insert`. O mesmo
 * evento pode ser processado depois de uma liberação (ver acima), e o
 * `c43` chama isto de novo a cada fatura paga para manter `status_stripe`
 * fresco. Um `insert` puro falharia com `23505` na segunda vez e
 * transformaria uma reentrega normal num 500 eterno.
 *
 * ⚠️ `ciclos_pagos` NÃO ESTÁ AQUI, e a ausência é a decisão. Ele "só anda
 * por `invoice.paid`" (`012`), e um upsert que o incluísse o
 * SOBRESCREVERIA com o valor que o chamador supõe — zerando a contagem de
 * quem já pagou três meses toda vez que o status da assinatura mudasse.
 * Quem o move é `contarCicloPago`, e só ele.
 */
export async function registrarAssinatura(dados: {
  inscricaoId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripeCheckoutSessionId: string | null
  statusStripe: string
  trialEnd: string | null
  cancelAt: string | null
  cupomId: string | null
}): Promise<void> {
  const { error } = await supabase()
    .from('assinaturas')
    .upsert(
      {
        inscricao_id: dados.inscricaoId,
        stripe_customer_id: dados.stripeCustomerId,
        stripe_subscription_id: dados.stripeSubscriptionId,
        stripe_checkout_session_id: dados.stripeCheckoutSessionId,
        status_stripe: dados.statusStripe,
        trial_end: dados.trialEnd,
        cancel_at: dados.cancelAt,
        cupom_id: dados.cupomId,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'stripe_subscription_id' },
    )

  if (error) {
    throw new Error(`assinaturas(upsert): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}

/** O recorte de `assinaturas` que os handlers do webhook precisam. */
export type AssinaturaEspelhada = Pick<
  Tables<'assinaturas'>,
  'id' | 'inscricao_id' | 'ciclos_pagos' | 'cancel_at'
>

/**
 * A assinatura, pelo id do Stripe. `null` quando não conhecemos.
 *
 * ⚠️ `null` É UM CASO REAL E NÃO É ERRO: `invoice.paid` pode chegar ANTES
 * de `checkout.session.completed` — o Stripe não garante ordem de
 * entrega, e as duas coisas acontecem no mesmo segundo do lado de lá.
 * Quem trata é o handler, devolvendo 500 para o evento ser reentregue
 * depois, quando a linha já existir. Tratar como erro fatal ou como "não
 * faz nada" resolveria a mesma coisa de duas formas erradas: a primeira
 * enche o log de falha que se resolve sozinha, a segunda perde a fatura.
 */
export async function buscarAssinaturaPorSubscription(
  stripeSubscriptionId: string,
): Promise<AssinaturaEspelhada | null> {
  const { data, error } = await supabase()
    .from('assinaturas')
    .select('id,inscricao_id,ciclos_pagos,cancel_at')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .limit(1)

  if (error) {
    throw new Error(`assinaturas(select): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/**
 * Soma um ciclo pago. Devolve `false` quando alguém somou antes.
 *
 * ============================================================
 * ⚠️ COMPARE-AND-SWAP, E NÃO `ciclos_pagos = ciclos_pagos + 1`
 * ============================================================
 *
 * O PostgREST não sabe expressar um `update` relativo a uma coluna: tudo
 * que atravessa é um valor literal. Ler e escrever em seguida abre a
 * corrida clássica — duas instâncias leem 3, as duas escrevem 4, e um mês
 * de curso desaparece da contagem.
 *
 * O `.eq('ciclos_pagos', cicloLido)` no `update` é o que fecha a janela: o
 * Postgres avalia a condição no momento da escrita, então só UMA das duas
 * encontra a linha com o valor que leu. A outra atualiza zero linhas e
 * descobre isso pelo `count`, sem erro nenhum. É a mesma ideia da unique
 * do evento — a barreira é o próprio comando, não uma verificação antes
 * dele.
 *
 * ⚠️ E O `false` NÃO É FALHA. Quem chama já sabe que o efeito foi
 * aplicado por outra tentativa; refazer seria contar duas vezes o mesmo
 * mês, que é exatamente o que a `014` existe para impedir. Devolver erro
 * aqui faria o webhook responder 500 e o Stripe reentregar um evento que
 * já produziu todo o efeito que tinha para produzir.
 *
 * A idempotência da `014` já torna isto raro; ele é a segunda tranca, para
 * o caso de uma reserva liberada e reprocessada em paralelo.
 */
export async function contarCicloPago(
  assinaturaId: string,
  ciclosLidos: number,
): Promise<boolean> {
  const { count, error } = await supabase()
    .from('assinaturas')
    .update(
      { ciclos_pagos: ciclosLidos + 1, atualizado_em: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', assinaturaId)
    .eq('ciclos_pagos', ciclosLidos)

  if (error) {
    throw new Error(`assinaturas(ciclos_pagos): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return count === 1
}

/** O contrato travado de uma inscrição, do jeito que o banco o guarda. */
export type TravadosDaInscricao = Pick<
  Tables<'inscricoes'>,
  'valor_mensal_travado' | 'duracao_meses_travada' | 'data_primeira_cobranca_travada'
>

/**
 * Os três travados de uma inscrição. `null` quando a inscrição não existe.
 *
 * ⚠️ QUEM PRECISA DISTO É O WEBHOOK, e a razão é a D-05 no lugar onde ela
 * de fato acontece. `cancel_at` = `data_primeira_cobranca + duracao_meses`,
 * e as duas parcelas dessa conta têm que sair da INSCRIÇÃO, nunca da
 * safra: entre o checkout e o webhook a Giovanna pode ter mudado o preço
 * ou a duração da safra, e a assinatura que está sendo criada é a do
 * contrato que a pessoa aceitou (D-06). Ler da safra aqui faria uma
 * assinatura terminar num mês que ninguém combinou com ninguém.
 *
 * Os três podem vir nulos numa linha legítima — lista de espera nunca tem
 * travado (CHECK da `015`) —, e por isso quem chama precisa tratar o caso.
 * No caminho do webhook, travado nulo significa que a inscrição chegou a
 * `confirmada` sem contrato, que é estado impossível pelo próprio CHECK: é
 * falha, não ausência.
 */
export async function buscarTravadosDaInscricao(
  inscricaoId: string,
): Promise<TravadosDaInscricao | null> {
  const { data, error } = await supabase()
    .from('inscricoes')
    .select('valor_mensal_travado,duracao_meses_travada,data_primeira_cobranca_travada')
    .eq('id', inscricaoId)
    .limit(1)

  if (error) {
    throw new Error(`inscricoes(travados): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  return data?.[0] ?? null
}

/**
 * Tudo que o e-mail de confirmação precisa saber, numa consulta só.
 *
 * ⚠️ ESTE É O RECORTE MAIS LARGO DE DADO PESSOAL DO PROJETO, e ele existe
 * por uma razão específica: o e-mail de confirmação da aluna deixou de ser
 * disparado no insert (ele diria "confirmada" para quem não pagou, e pela
 * D-02 é pagar que faz entrar) e passou a sair do webhook. Só que o
 * webhook recebe um evento do Stripe — ele não sabe o nome de ninguém.
 *
 * O corte continua explícito e continua sendo o mínimo: nome, e-mail,
 * telefone e o perfil, que é literalmente o que o corpo da mensagem
 * imprime. Fora ficam `consent_text`, `consent_at`, `status`, os travados
 * e os ids — nada disso é lido para escrever o e-mail.
 *
 * ⚠️ E ELE NÃO ATRAVESSA PARA NAVEGADOR NENHUM. O único chamador é
 * `app/api/stripe/webhook/route.ts`, que usa o resultado para chamar
 * `confirmarInscricao` e joga fora. Se um dia isto for parar numa rota que
 * responde a um cliente, a pergunta certa antes de aceitar é por que uma
 * tela precisa do telefone de alguém.
 */
export type InscricaoParaEmail = {
  nome: string
  email: string
  telefone: string
  nivel_ingles: NivelIngles
  curso: string
  periodo: string
  disponibilidade: DiaDaSemana[]
  safra: { nome: string; data_inicio_aulas: string } | null
}

/**
 * A inscrição com a pessoa e a safra embutidas. `null` quando não dá para
 * escrever o e-mail.
 *
 * ⚠️ `null` AQUI NÃO É ERRO, E TAMBÉM NÃO É ROTINA. Ele acontece quando o
 * perfil está incompleto — o que é possível nas linhas HERDADAS da `010`,
 * onde `consent` e perfil podem ser nulos porque `null` significa "não
 * sabemos" e não houve backfill. Uma dessas linhas não pode virar e-mail:
 * faltaria o nível de inglês, o curso, o período. Quem chama registra e
 * segue — um e-mail que não sai não pode derrubar um pagamento que
 * aconteceu.
 *
 * ⚠️ O `join` é feito pelo PostgREST (`pessoas(...)`, `safras(...)`), e não
 * por duas consultas seguidas. Duas consultas seriam duas leituras
 * separadas no tempo, e entre elas a Giovanna pode ter editado a safra —
 * o e-mail sairia com o nome de uma safra e a data de outra. Uma consulta
 * é um instante só.
 */
export async function buscarInscricaoParaEmail(
  inscricaoId: string,
): Promise<InscricaoParaEmail | null> {
  const { data, error } = await supabase()
    .from('inscricoes')
    // ⚠️ UMA STRING LITERAL, e não uma concatenação por mais legível que
    // ela pareça. O SDK do Supabase INFERE O TIPO DO RESULTADO a partir do
    // texto deste `select` — é um parser de tipos sobre o literal. Quebrar
    // a string em pedaços com `+` produz `string` em vez de um literal, a
    // inferência desiste, e o retorno vira um tipo de erro onde nenhuma
    // coluna existe. O erro que aparece é críptico (`Property 'pessoas'
    // does not exist on type '{ error: true } & String'`) e não menciona a
    // causa.
    .select('nivel_ingles,curso,periodo,disponibilidade,pessoas(nome,email,telefone),safras(nome,data_inicio_aulas)')
    .eq('id', inscricaoId)
    .limit(1)

  if (error) {
    throw new Error(`inscricoes(email): ${error.code ?? 'sem código'} — ${error.message}`)
  }

  const linha = data?.[0]
  if (!linha) return null

  const { pessoas, safras, nivel_ingles, curso, periodo, disponibilidade } = linha

  // O perfil é tudo-ou-nada para efeito de e-mail: sem qualquer um destes
  // a mensagem sairia com um buraco no meio. Ver o ⚠️ acima sobre as
  // linhas herdadas da `010`.
  if (!pessoas || !nivel_ingles || !curso || !periodo || !disponibilidade) return null

  return {
    nome: pessoas.nome,
    email: pessoas.email,
    telefone: pessoas.telefone,
    // ⚠️ Os dois `as` são a mesma limitação de sempre: `supabase gen types`
    // traz `text` como `string`, porque um CHECK de coluna não vira união
    // de TypeScript. Quem garante o domínio é o CHECK da `002`/`009`, e a
    // conversão aqui é a fronteira onde o dado do banco vira dado do
    // domínio — o mesmo lugar onde ela sempre esteve, e não um `any`
    // espalhado adiante.
    nivel_ingles: nivel_ingles as NivelIngles,
    curso,
    periodo,
    disponibilidade: disponibilidade as DiaDaSemana[],
    safra: safras ?? null,
  }
}

/**
 * Move o estado da inscrição. É a única escrita de `status` do sistema
 * fora da criação.
 *
 * ⚠️ NENHUMA VALIDAÇÃO DE TRANSIÇÃO AQUI, e a ausência é decisão. Uma
 * máquina de estados escrita nesta camada seria a segunda cópia de uma
 * regra que o banco já tem em parte (o CHECK da `009` amarra o par
 * safra/status) e que a ordem de entrega do Stripe não respeita: uma
 * `invoice.paid` pode chegar antes de `checkout.session.completed`, e um
 * guarda que recusasse `pendente_pagamento → ativa` bloquearia um
 * pagamento verdadeiro por causa da ordem em que dois pacotes chegaram
 * pela rede.
 *
 * O que protege contra escrita torta é o par (evento verificado,
 * idempotência) — não uma tabela de transições permitidas que teria que
 * prever toda ordem possível de entrega.
 */
export async function mudarStatusInscricao(
  inscricaoId: string,
  status: StatusInscricao,
): Promise<void> {
  const { error } = await supabase()
    .from('inscricoes')
    .update({ status })
    .eq('id', inscricaoId)

  if (error) {
    throw new Error(`inscricoes(status): ${error.code ?? 'sem código'} — ${error.message}`)
  }
}
