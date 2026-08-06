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
 * para `safras`, e o tipo acompanha. A função abaixo ainda se chama
 * `buscarTurmaAtiva` porque quem a reescreve é o `c20`; renomear os dois
 * no mesmo commit misturaria a troca de tipos com a reescrita da rota.
 *
 * É um `Pick`, e não `Tables<'safras'>` inteiro, de propósito: a lista
 * de colunas aqui é exatamente a do `select` lá embaixo. Tipar com a
 * `Row` completa afirmaria que `slug`, `vagas_total` e
 * `stripe_price_id` chegaram, quando não chegaram — é o mesmo princípio
 * de toda travessia de fronteira deste projeto (REPORT §7): carregar o
 * mínimo, com o corte explícito no ponto onde acontece.
 *
 * ⚠️ Atenção ao `valor_mensal`. A coluna é `numeric(10,2)`, e o tipo
 * gerado a chama de `number` — é o mapeamento fixo do `supabase gen
 * types`. O tipo manual que estava aqui afirmava o contrário, `string`,
 * com o motivo escrito: `numeric(10,2)` tem precisão que o double do
 * JSON não garante, e converter no meio do caminho é como se perde
 * centavo. Os dois não podem estar certos, e **quem decide é o wire, não
 * o tipo** — nenhum dos dois foi medido contra o banco neste commit.
 *
 * O que segura a diferença é a regra que não mudou: quem converte é quem
 * vai exibir, no último momento possível. O `Number(...)` em
 * `app/api/turma-ativa/route.ts` é correto vindo string ou number, e é
 * por isso que ele fica. **Medir o valor real na resposta do PostgREST é
 * pré-requisito do `c22`**, que é onde o preço passa a vir da safra — se
 * for string mesmo, é lá que o tipo gerado precisa de um envelope, e não
 * um `Number()` a mais espalhado pelo caminho.
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
>

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
 * A turma com `inscricoes_abertas = true`, ou `null` se não houver.
 *
 * O banco garante que existe no máximo uma (índice parcial
 * `turmas_uma_aberta_idx`), então o `limit(1)` é só cinto de segurança —
 * não é ele que resolve a ambiguidade, é a constraint. E é por isso que
 * aqui não entra `.single()`: ele transformaria "duas linhas abertas" num
 * erro do SDK, escondendo atrás de uma exceção de transporte uma
 * violação de invariante que o índice não deveria ter deixado acontecer.
 *
 * `.is(..., true)` e não `.eq(..., true)`: é a tradução exata do
 * `inscricoes_abertas=is.true` que estava aqui antes.
 *
 * `id` VEM na seleção porque a rota de inscrição precisa dele para
 * gravar a FK. Ele não pode chegar ao navegador — quem faz esse corte é
 * `app/api/turma-ativa/route.ts`, que monta a resposta sem o campo. A
 * lista de colunas continua escrita à mão, e não `select('*')`: é o
 * mesmo princípio de toda travessia de fronteira deste projeto (REPORT
 * §7) — carregar o mínimo, com o corte explícito no ponto onde acontece.
 *
 * Erro aqui é lançado, não engolido: cada chamador decide o que fazer.
 * Hoje os dois decidem a mesma coisa — tratar como "nenhuma turma
 * aberta" e cair para lista de espera —, mas quem toma essa decisão é a
 * rota, não esta função. O SDK devolve `{ data, error }` em vez de
 * lançar, então o `throw` passa a ser explícito aqui.
 */
export async function buscarTurmaAtiva(): Promise<Safra | null> {
  const { data, error } = await supabase()
    // ⚠️ turmas → safras: a tabela foi renomeada pela migração 005 e a
    // rota inteira é reescrita no c20. Silenciado aqui de propósito para
    // o c18b poder compilar. REMOVER no c20.
    // @ts-expect-error a tabela `turmas` não existe mais no schema gerado
    .from('turmas')
    .select('id,nome,data_inicio_aulas,data_primeira_cobranca,valor_mensal,duracao_meses')
    .is('inscricoes_abertas', true)
    .limit(1)

  if (error) {
    // A mensagem do PostgREST pode conter detalhe de schema; ela vai para
    // o log do servidor e para lugar nenhum além disso.
    throw new Error(`turmas: ${error.code ?? 'sem código'} — ${error.message}`)
  }

  // O `as unknown` é a segunda metade do silenciamento acima, e some com
  // ele no c20. O `@ts-expect-error` cala o `from('turmas')`, mas não
  // conserta o que vem depois: sem tabela conhecida, o SDK resolve o
  // encadeamento contra a união de todas as tabelas e `data` vira uma
  // união de `SelectQueryError<...>`. Um `as Safra[]` direto é recusado
  // por não haver sobreposição entre os dois tipos, e o `as unknown` no
  // meio é o que o compilador pede.
  //
  // Ele é largo, e é largo de propósito: estreitar um cast sobre uma
  // query que consulta tabela inexistente seria dar aparência de tipo a
  // uma resposta que em runtime é erro do PostgREST, não linha.
  return ((data as unknown as Safra[] | null)?.[0]) ?? null
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
