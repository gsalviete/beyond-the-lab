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

/**
 * Código de erro do Postgres para violação de constraint unique.
 *
 * Antes era lido do corpo JSON que o PostgREST devolvia; agora vem em
 * `error.code`. É o mesmo código do banco pelos dois caminhos — e é ele
 * que produz o caminho de duplicata da rota de inscrição.
 */
export const UNIQUE_VIOLATION = '23505'

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente')
    this.name = 'SupabaseNotConfiguredError'
  }
}

export type InsertResult =
  | { ok: true }
  | { ok: false; duplicate: true }
  | { ok: false; duplicate: false; status: number; detail: string }

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
 * Insere uma linha na `waitlist`.
 *
 * A service_role key ignora RLS — é justamente por isso que a tabela pode
 * ficar sem nenhuma policy. Ver o comentário no SQL do schema.
 */
export async function insertWaitlistEntry(entry: {
  name: string
  email: string
  /** E.164, já normalizado pela rota — ver `src/lib/telefone.ts`. */
  phone: string
  payment_choice: 'agora' | 'depois'
  /**
   * Turma da inscrição, ou `null` para lista de espera. Anda sempre em
   * par com o `status` abaixo — quem monta o par é a rota, olhando o
   * banco e não o que o cliente afirmou.
   */
  turma_id: string | null
  /**
   * `pendente` = inscrita numa turma aberta.
   * `lista_espera` = cadastro feito sem turma aberta.
   * Os outros estados do CHECK são do Stripe, no corte 2.
   */
  status: 'pendente' | 'lista_espera'
  nivel_ingles: NivelIngles
  curso: string
  periodo: string
  disponibilidade: DiaDaSemana[]
  /**
   * Registro probatório do consentimento — os três andam juntos e não
   * fazem sentido separados. Ver `supabase/migrations/003_consentimento.sql`.
   *
   * `consent_text` é a constante do servidor, não o que o cliente
   * enviou: quem monta este objeto é `/api/waitlist`, que importa
   * `CONSENT_TEXT` de `src/config/consentimento.ts`. O corpo do POST
   * não tem voz sobre este campo.
   */
  consent: boolean
  /** ISO 8601 gerado no servidor no momento em que o consentimento foi validado. */
  consent_at: string
  consent_text: string
}): Promise<InsertResult> {
  // `.insert(...)` SEM `.select()` encadeado ocupa o lugar do
  // `Prefer: return=minimal` que estava escrito à mão aqui antes.
  //
  // Mecanismo diferente, efeito idêntico, e a diferença vale registrar:
  // o SDK não manda `Prefer` nenhum nesse caso — quem não devolve a linha
  // é o **default do PostgREST** para um POST sem esse cabeçalho.
  // Verificado com um `fetch` espião: a requisição sai sem `Prefer`, e
  // basta encadear `.select()` para ela virar `Prefer: return=representation`
  // e o corpo voltar com a linha inteira.
  //
  // Continua sendo o que queremos: não precisamos da linha gravada e não
  // há motivo para trafegar dado pessoal de volta. Encadear `.select()`
  // por reflexo — porque "é assim que se faz" — desfaria isso em silêncio.
  //
  // ⚠️ waitlist → pessoas + inscricoes: a tabela foi migrada pelas
  // migrações 010/011 (o que sobrou virou `waitlist_legado`, que é
  // arquivo morto e não recebe linha nova) e esta rota inteira é
  // reescrita no c21. Silenciado aqui de propósito para o c18b poder
  // compilar. REMOVER no c21.
  //
  // O `@ts-expect-error` cobre só a ausência da tabela. O corpo `entry`
  // continua com a forma antiga — `name`/`phone`/`turma_id`/
  // `payment_choice` —, e nenhum desses campos sobrevive ao modelo novo
  // (`payment_choice` morre pela D-11, o resto se divide entre `pessoas`
  // e `inscricoes`). Traduzir o payload aqui seria fazer o c21 pela
  // metade e sem os testes do c26.
  // @ts-expect-error a tabela `waitlist` não existe mais no schema gerado
  const { error, status } = await supabase().from('waitlist').insert(entry)

  if (!error) return { ok: true }

  if (error.code === UNIQUE_VIOLATION) return { ok: false, duplicate: true }

  // `detail` só existe para o log do servidor. Ele não é ecoado ao
  // cliente em nenhum caminho — a rota responde mensagem genérica.
  const detail = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' · ')

  return { ok: false, duplicate: false, status, detail }
}
