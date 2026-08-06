// ============================================================
// DOMÍNIO DA INSCRIÇÃO — fonte única
//
// Os valores que uma inscrição pode assumir: nível de inglês, dias da
// semana, cursos e períodos. Um lugar só, do qual saem QUATRO
// consumidores:
//
//   1. o schema Zod da rota    (`src/config/schemas.ts`, no c05)
//   2. as opções da modal      (client, o que a pessoa vê)
//   3. os rótulos do e-mail    (server, o que a Giovanna lê)
//   4. os CHECK do SQL         (banco, a palavra final)
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Porque hoje esses quatro são quatro cópias. O `REPORT.md` §8.2 nomeia
// a tensão: "os valores precisam bater nos quatro, e hoje isso é mantido
// por disciplina e comentário". Disciplina é o que funciona até a
// primeira sexta-feira à noite. O comentário mais honesto do repositório
// sobre isso estava em `src/lib/email.ts` e dizia, sobre os rótulos
// duplicados: *"se um dia mudarem, mudam nos dois lugares"*. Este arquivo
// é a resposta a essa frase.
//
// A regra que ela protege é a nº 4 do REPORT §5: **constraint no banco
// vence validação na aplicação.** Um valor que a modal oferece e o CHECK
// recusa não é um bug de formulário — é uma inscrição perdida na última
// tela, depois de a pessoa ter preenchido tudo.
//
// ⚠️ DERIVAR DO DOMÍNIO ≠ RESTRINGIR AO DOMÍNIO
//
// Leia esta parte antes de "consertar" a inconsistência aparente entre
// este arquivo e `schemas.ts`. Ela não é inconsistência, é a regra:
//
//   **O domínio é o que a UI OFERECE. O schema é o que o servidor
//   ACEITA. Onde há "Outro", os dois divergem de propósito.**
//
// `CURSOS` e `PERIODOS` terminam em "Outro", que na modal revela um campo
// de texto curto. Quando a pessoa escolhe "Outro", o que sai no corpo do
// POST é o que ela digitou — "Fonoaudiologia", "6º semestre" — e não um
// valor desta lista. Um `z.enum(CURSOS)` no schema recusaria exatamente
// as pessoas cujo curso não está na lista, que são a razão de o campo
// existir. É a forma mais silenciosa de quebrar uma inscrição real: o
// formulário fica lindo e a pessoa leva "confira os dados informados"
// sem nunca descobrir qual.
//
// `nivel_ingles` e `disponibilidade` não têm "Outro". Para esses dois,
// oferecer e aceitar são o mesmo conjunto, e aí a derivação é total —
// inclusive até o CHECK do banco.
//
// Vale para os três consumidores e volta a aparecer em todos: no schema
// (`c05`), na modal (`c06`) e no CHECK do SQL (`c16`).
//
// POR QUE ELE É NEUTRO, E O QUE ISSO PROÍBE
//
// Mesma restrição que `src/config/consentimento.ts` já resolveu, e ele é
// o padrão que este arquivo segue. A modal é client component
// (`'use client'`, hooks, JSX) e `email.ts` é `server-only`. Para os dois
// importarem daqui, este módulo não pode ser nenhum dos dois:
//
//   ⚠️ NÃO adicione `import 'server-only'`  — a modal para de compilar.
//   ⚠️ NÃO adicione JSX, React ou hook       — o servidor passa a arrastar
//                                              a árvore de componentes.
//   ⚠️ NÃO adicione acesso a banco, env var ou I/O.
//
// É um arquivo de constantes e tipos derivados. Só isso, de propósito.
//
// E não é `src/config/curso.ts`: aquilo é dado que varia por safra e por
// isso migrou para o banco. Isto é o vocabulário do formulário, que varia
// por decisão de produto — e que o SQL espelha.
// ============================================================

// ------------------------------------------------------------
// A FORMA: valores primeiro, rótulos depois
//
// Cada domínio nasce como uma tupla `as const` dos valores CRUS — os
// mesmos que vão para o banco — e ganha os rótulos num `Record` separado.
// Parece indireção desnecessária até se ver o que ela compra:
//
//   - a tupla é o que o `z.enum` do Zod aceita direto, sem cast;
//   - o `Record<Valor, string>` é **exaustivo por construção**: esquecer
//     um rótulo é erro de compilação, não um `undefined` que só aparece
//     no e-mail da Giovanna;
//   - a lista de opções da UI é derivada dos dois, na ordem da tupla.
//
// Ou seja: o TypeScript passa a ser a disciplina que antes era humana. É
// a diferença entre "os quatro lugares precisam bater" e "só existe um
// lugar".
// ------------------------------------------------------------

/** Uma opção como a UI precisa dela: o que vai para o banco e o que a pessoa lê. */
export type Opcao<T extends string = string> = {
  readonly valor: T
  readonly rotulo: string
}

/** Deriva a lista de opções de uma tupla de valores mais seus rótulos. */
function opcoes<T extends string>(
  valores: readonly T[],
  rotulos: Record<T, string>,
): readonly Opcao<T>[] {
  return valores.map((valor) => ({ valor, rotulo: rotulos[valor] }))
}

// ------------------------------------------------------------
// NÍVEL DE INGLÊS
// Autodeclarado. Espelha o CHECK de `nivel_ingles`.
// ------------------------------------------------------------

export const VALORES_NIVEL_INGLES = ['basico', 'intermediario', 'avancado'] as const

export type NivelIngles = (typeof VALORES_NIVEL_INGLES)[number]

export const ROTULO_NIVEL_INGLES: Record<NivelIngles, string> = {
  basico: 'Básico',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

export const OPCOES_NIVEL_INGLES = opcoes(VALORES_NIVEL_INGLES, ROTULO_NIVEL_INGLES)

// ------------------------------------------------------------
// DIAS DA SEMANA
//
// O `valor` é exatamente o que o CHECK da coluna `disponibilidade`
// aceita. Não traduza aqui sem mexer lá — e agora "lá" é um lugar só,
// verificável: ver `LISTA_SQL` no fim do arquivo.
//
// Só dias úteis. Sábado e domingo nunca estiveram no formulário nem no
// CHECK; as aulas são à noite, em dia de semana.
// ------------------------------------------------------------

export const VALORES_DIA_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex'] as const

export type DiaDaSemana = (typeof VALORES_DIA_SEMANA)[number]

export const ROTULO_DIA_SEMANA: Record<DiaDaSemana, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
}

export const OPCOES_DIA_SEMANA = opcoes(VALORES_DIA_SEMANA, ROTULO_DIA_SEMANA)

/** "Segunda, Quarta" — a forma como os dias aparecem no e-mail. */
export function listarDias(dias: readonly DiaDaSemana[]): string {
  return dias.map((d) => ROTULO_DIA_SEMANA[d]).join(', ')
}

// ------------------------------------------------------------
// CURSO
//
// Era texto livre. A lista fecha a grafia — "Biomed", "biomedicina",
// "Biomedicina " eram a mesma pessoa em três linhas diferentes do banco,
// e a segmentação por curso não fechava.
//
// ⚠️ Aqui o valor É o rótulo, e isso é deliberado: a coluna `curso` é
// texto livre no schema (min 2, max 100) e já tem linhas gravadas com o
// nome por extenso. Um slug obrigaria a traduzir na leitura e deixaria as
// linhas antigas num formato e as novas em outro — passivo criado de
// graça, para arrumar um dado que ninguém consulta por chave.
//
// É por isso que este domínio não tem `Record` de rótulo nem tipo
// derivado: não há dois lados para manter em fase. E é também por isso
// que ele **não vira `z.enum`** no schema da rota — ver o comentário lá.
// ------------------------------------------------------------

export const CURSOS = [
  'Biomedicina',
  'Biologia / Ciências Biológicas',
  'Farmácia',
  'Enfermagem',
  'Medicina Veterinária',
  'Medicina',
  'Outro',
] as const

// ------------------------------------------------------------
// PERÍODO
//
// 'Já formada(o)' está aqui porque é resposta real e frequente — o campo
// pergunta em que ponto do curso a pessoa está, e "já terminei" é um
// desses pontos. Ver o comentário no campo da modal sobre por que ele
// NÃO some da tela quando essa opção é escolhida.
//
// Mesma natureza de `CURSOS`: valor é rótulo, coluna é texto livre.
// ------------------------------------------------------------

export const PERIODOS = ['1º ao 3º', '4º ao 6º', '7º ao 10º', 'Já formada(o)', 'Outro'] as const

/**
 * A opção que revela o campo de texto curto logo abaixo do select.
 *
 * Vale para `CURSOS` e `PERIODOS`, e é a mesma string nos dois — por isso
 * uma constante, e não o literal repetido em dois `===` na modal.
 */
export const OUTRO = 'Outro'

// ------------------------------------------------------------
// O QUARTO CONSUMIDOR: o SQL
//
// Os três primeiros (Zod, modal, e-mail) importam deste arquivo e
// acompanham por construção. O SQL não importa nada — ele é texto que
// roda no SQL Editor do Supabase, e essa distância é real: o banco e a
// aplicação evoluem em cadências diferentes, e foi exatamente isso que
// produziu o incidente da migração `004`.
//
// O que dá para fazer é fechar a distância pelo único lado disponível:
// derivar daqui a lista exata que o CHECK precisa conter, e deixar um
// teste comparar essa string com o arquivo `.sql` de verdade. Não impede
// que o banco em produção divirja do repositório — nada em TypeScript
// impede isso —, mas transforma "alguém esqueceu de atualizar o SQL" de
// descoberta em produção em falha de suíte.
//
// ⚠️ O que isto NÃO é: um gerador de migração. A migração continua
// escrita e revisada à mão, porque `NOT VALID`, ordem de operações e
// idempotência são decisões que não se derivam de uma lista de strings.
// ------------------------------------------------------------

/**
 * Formata valores como a lista de um `check (coluna in (...))`.
 *
 * `LISTA_SQL.nivelIngles` → `'basico', 'intermediario', 'avancado'`
 *
 * ⚠️ O separador é `', '` porque é assim que o `in (...)` está escrito nas
 * migrações. O CHECK de `disponibilidade` usa a outra forma — `array['seg',
 * 'ter',...]`, **sem** espaço depois da vírgula. Não são dois estilos por
 * descuido: são duas construções diferentes do Postgres, escritas em
 * momentos diferentes.
 *
 * Quem comparar isto com o `.sql` precisa normalizar o espaço em branco em
 * vez de exigir a string exata. Um teste que compara byte a byte quebra na
 * primeira vez que alguém formatar a migração — e a coisa que interessa
 * verificar é o conjunto de valores, não a tipografia do SQL.
 */
function listaSql(valores: readonly string[]): string {
  return valores.map((v) => `'${v}'`).join(', ')
}

export const LISTA_SQL = {
  nivelIngles: listaSql(VALORES_NIVEL_INGLES),
  diaSemana: listaSql(VALORES_DIA_SEMANA),
} as const

// ------------------------------------------------------------
// O QUE NÃO ESTÁ AQUI, E POR QUÊ
//
// `payment_choice` ('agora' / 'depois') era o quinto domínio deste
// formulário e nunca migrou para cá — a pergunta morreu no `c25` (D-11).
// O campo perguntava "quer pagar agora?" numa tela onde pagar era
// logicamente impossível, e os dois valores gravavam igual. Trazer os
// rótulos dele para a fonte única teria dado sobrevida a um domínio que a
// refatoração existe para remover, e a espera provou o ponto: o Zod, a
// modal e os dois formatos do e-mail perderam o campo sem que nada aqui
// precisasse mudar.
//
// `status` da inscrição também não está aqui. Ele não é vocabulário de
// formulário: é máquina de estados, o cliente nunca o escolhe, e quem o
// determina é o servidor lendo o banco (REPORT §9.1). O lugar dele é
// junto do modelo de dados, no corte 2, quando os estados de pagamento
// passarem a existir de verdade.
// ------------------------------------------------------------
