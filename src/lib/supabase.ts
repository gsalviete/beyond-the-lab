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
 * `Row` completa afirmaria que `slug` e `stripe_price_id` chegaram,
 * quando não chegaram — é o mesmo princípio de toda travessia de
 * fronteira deste projeto (REPORT §7): carregar o mínimo, com o corte
 * explícito no ponto onde acontece.
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
 * O cliente, criado uma vez por instância e reaproveitado.
 *
 * Preguiçoso, e não no topo do módulo: a ausência de env var precisa
 * virar `SupabaseNotConfiguredError` no ponto de uso, onde cada chamador
 * decide o que fazer — e não uma exceção na importação, que derrubaria o
 * build e o render de páginas que nem falam com o banco.
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

function supabase(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new SupabaseNotConfiguredError()
  }

  if (cliente) return cliente

  cliente = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // Este cliente não representa ninguém. Ele é a service_role, que
    // ignora RLS e não tem sessão para persistir, renovar ou detectar na
    // URL. Os três defaults do SDK são para o navegador com usuário
    // logado; deixá-los ligados aqui, num módulo de escopo compartilhado
    // entre requisições, seria criar estado de autenticação que nada
    // preenche e que nada deveria poder preencher.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // `no-store` explícito, e não confiança no default do Next.
      //
      // É a mesma exigência de sempre, agora um andar abaixo: fechar a
      // turma no Studio precisa refletir no site imediatamente, e é esse
      // imediatismo que torna o controle pelo banco melhor que o deploy
      // que ele substitui (REPORT D2). O SDK chama `fetch` por baixo, e
      // o Next envolve o `fetch` global com a própria camada de cache —
      // deixar a decisão para o default dela seria apostar o painel de
      // controle da professora numa configuração de framework que muda
      // entre versões maiores.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  return cliente
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
      'id,nome,data_inicio_aulas,data_primeira_cobranca,valor_mensal,duracao_meses,inscricoes_abertas,vagas_total',
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
 * O que a escrita da inscrição devolve.
 *
 * `criada` é o booleano da RPC: `true` = inscrição nova, `false` = essa
 * pessoa já tem inscrição nesta safra.
 *
 * ⚠️ `criada: false` NÃO É FALHA, e é por isso que ele mora dentro do
 * ramo `ok: true`. A união anterior tinha `{ ok: false; duplicate: true }`
 * — duplicata como uma espécie de erro —, e aquilo era herança de o
 * mecanismo ser uma unique violation. Com a RPC, "já existia" é uma
 * resposta que a função dá de propósito, e colapsá-la de novo em erro
 * faria a rota degradar (e responder 500) para alguém cujo cadastro está
 * perfeitamente gravado no banco.
 */
export type ResultadoInscricao =
  | { ok: true; criada: boolean }
  | { ok: false; status: number; detail: string }

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
 * Os dez nomes abaixo são a assinatura da função no banco, não uma
 * convenção nossa. Errar um deles é erro em tempo de execução — o
 * PostgREST responde "function not found" porque a assinatura não bate —,
 * e é o tipo de erro que só aparece quando alguém real se inscreve.
 * Renomear um parâmetro no SQL é mudar este objeto junto, no mesmo commit.
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
 * O QUE ELA DEVOLVE: UM BOOLEANO. SÓ.
 * ============================================================
 *
 * Nenhum dado pessoal atravessa de volta — nem id de pessoa, nem id de
 * inscrição, nem nome, nem status, nem contagem. É o mesmo corte de
 * fronteira do resto do projeto (REPORT §9.6), aplicado à RPC.
 *
 * É também o que o `Prefer: return=minimal` fazia no insert que existia
 * aqui antes, e vale registrar como o mecanismo mudou: aquele efeito não
 * vinha de um cabeçalho nosso, vinha do **default do PostgREST** para um
 * POST sem `Prefer` — bastava encadear `.select()` para a linha inteira
 * voltar. Encadear por reflexo, "porque é assim que se faz", desfazia o
 * corte em silêncio. Agora o corte está do lado de lá, escrito no
 * `returns boolean` da função, e nem um `.select()` distraído o desfaz.
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
  })

  if (error) {
    // `detail` só existe para o log do servidor. Ele não é ecoado ao
    // cliente em nenhum caminho — a rota responde mensagem genérica.
    const detail = [error.code, error.message, error.details, error.hint]
      .filter(Boolean)
      .join(' · ')

    return { ok: false, status, detail }
  }

  // ⚠️ `data` não-booleano é FALHA, e não "provavelmente deu certo".
  //
  // A função declara `returns boolean` e sempre devolve um. Um `null`
  // aqui significa que a resposta não tem a forma que a assinatura
  // promete — schema divergente, função substituída, PostgREST devolvendo
  // outra coisa — e é exatamente a classe de incidente da migração `004`:
  // o banco andou, a aplicação não, e nada reclamou.
  //
  // Assumir `true` faria a rota mandar e-mail de confirmação por uma
  // inscrição que talvez não exista. Assumir `false` diria "você já está
  // cadastrada" para quem não está. As duas mentem; só o erro não mente.
  //
  // Se a linha TIVER sido gravada, o custo é a pessoa ver "tente de novo"
  // e tentar — e a segunda tentativa cai no caminho de duplicata, que
  // responde a verdade. É o desfecho menos ruim dos três.
  if (typeof data !== 'boolean') {
    return {
      ok: false,
      status,
      detail: `criar_inscricao devolveu ${data === null ? 'null' : typeof data}, esperado boolean`,
    }
  }

  return { ok: true, criada: data }
}
