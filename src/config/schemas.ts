// ============================================================
// VALIDAÇÃO DA INSCRIÇÃO — o schema que vale
//
// Esta é a validação que decide se uma inscrição entra no banco. A do
// formulário existe só para dar retorno imediato: o cliente pode desligar
// o JS, editar o payload ou mandar um POST direto, e aí sobra só isto.
//
// POR QUE UM ARQUIVO SEPARADO DA ROTA
//
// Porque metade dele agora é derivada de `dominio.ts` e a outra metade
// NÃO é — e essa fronteira precisa ser visível. Enquanto o schema morava
// dentro de `route.ts`, `z.enum(['basico', 'intermediario', 'avancado'])`
// parecia uma linha qualquer de validação. Era a quarta cópia do domínio.
//
// ⚠️ ESTE MÓDULO É NEUTRO, mas por enquanto só o servidor o usa.
//
// Não tem `import 'server-only'`, e isso é deliberado: um dia a validação
// do cliente pode querer o mesmo schema, e marcá-lo server-only fecharia
// essa porta sem necessidade — o schema não é segredo.
//
// Mas antes de importar isto de um client component, saiba o que custa:
// o Zod inteiro vai junto para o bundle do navegador. Hoje ele não está
// lá. A modal valida com um punhado de `if` justamente porque um `if` não
// pesa nada e o retorno imediato não precisa ser rigoroso — o rigor está
// aqui, do lado que decide. Se essa troca um dia valer a pena, que seja
// por medição, não por elegância.
// ============================================================
import { z } from 'zod'
import { VALORES_NIVEL_INGLES, VALORES_DIA_SEMANA } from '@/config/dominio'
import { E164_BR_REGEX, e164EhValido } from '@/lib/telefone'

export const inscricaoSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  // O cliente já manda em E.164; aqui conferimos a forma e, além dela, o
  // DDD e o nono dígito — a mesma função que a máscara usa, para os dois
  // lados não discordarem sobre o que é um celular válido.
  phone: z.string().trim().regex(E164_BR_REGEX).refine(e164EhValido),

  // ------------------------------------------------------------
  // ⚠️ AQUI HAVIA `payment_choice: z.enum(['agora', 'depois'])`, E ELE NÃO
  // VOLTA (D-11).
  //
  // A pergunta era "quer pagar agora ou depois?", feita numa tela onde
  // pagar era logicamente impossível: não havia checkout, e os dois
  // valores gravavam exatamente a mesma linha. Quem respondia "quero pagar
  // agora" não pagava nada. Era uma preferência coletada e descartada —
  // dado pessoal guardado sem finalidade, que é precisamente o que a LGPD
  // (art. 6º, I e III) manda não fazer. Não era bug de implementação: era
  // o modelo avisando que a etapa de pagamento não existia.
  //
  // A partir do `c35` quem paga é quem passa pelo checkout, e a intenção
  // deixa de ser DECLARADA para ser EXERCIDA — pagar é o que faz alguém
  // entrar (D-02). A ramificação vira `safra aberta ? checkout : lista de
  // espera`, decidida no servidor lendo o banco, e não uma resposta de
  // formulário que o cliente escolhe (REPORT §9.1).
  //
  // ⚠️ REINTRODUZIR ISTO COMO "MELHORIA DE UX" É O ERRO PREVISTO. Uma
  // pergunta de intenção de pagamento só se justifica quando o sistema
  // HONRA as duas respostas. Enquanto a resposta não mudar nada a jusante,
  // perguntar é coletar dado que não se usa — e a versão que existia
  // custou uma coluna, um domínio, um rótulo de e-mail e um enum aqui.
  //
  // Sem `.passthrough()` — que este `z.object` não tem —, um POST antigo
  // que ainda mande o campo não é recusado: a chave é simplesmente
  // descartada na saída do parse e nunca chega à rota. É o que mantém a
  // remoção compatível com uma aba aberta há meia hora com o bundle velho.
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // PERFIL — obrigatórios AQUI, nullable no banco.
  //
  // A divisão é proposital: as linhas anteriores à migração `002` não têm
  // nenhum destes campos, e um `not null` na coluna faria o ALTER falhar.
  // Quem exige o preenchimento é este schema, por onde passa toda escrita
  // nova. O banco cuida do domínio dos valores (os CHECK de
  // `nivel_ingles` e `disponibilidade`), a aplicação cuida da
  // obrigatoriedade.
  //
  // A migração `004` acrescentou a segunda metade dessa história: o CHECK
  // `not valid` que exige o perfil também no banco, depois de um build
  // antigo ter gravado uma linha inteira de nulos. Hoje as duas camadas
  // exigem, e é assim que fica.
  // ------------------------------------------------------------

  // Derivado. Era `z.enum(['basico', 'intermediario', 'avancado'])`
  // escrito à mão, com o mesmo conteúdo em outros três arquivos.
  nivel_ingles: z.enum(VALORES_NIVEL_INGLES),

  // ⚠️ NÃO derivar de `CURSOS` e `PERIODOS`. Estes dois continuam texto
  // livre, e a tentação de "fechar o domínio aqui também" quebraria
  // inscrição de verdade.
  //
  // As listas do `dominio.ts` são as opções que o SELECT mostra — e as
  // duas terminam em "Outro", que revela um campo de texto curto. Quando
  // a pessoa escolhe "Outro", o que sai no corpo do POST é o que ela
  // digitou: "Fonoaudiologia", "Nutrição", "6º semestre". Um
  // `z.enum(CURSOS)` recusaria exatamente essas — as pessoas cujo curso
  // não estava na lista, que são a razão de o campo existir.
  //
  // O limite de tamanho é o que o banco aceita (`min 2, max 100` e
  // `min 1, max 40`), e é ele que vale aqui. O domínio fecha a grafia das
  // opções comuns; não fecha o conjunto de respostas possíveis.
  curso: z.string().trim().min(2).max(100),
  periodo: z.string().trim().min(1).max(40),

  // `min(1)` é o que barra `[]`. Array vazio não é undefined e passaria
  // por qualquer checagem de presença, virando uma inscrita sem nenhum
  // dia — exatamente o que o formulário proíbe e o CHECK do banco também
  // barra, em segunda instância.
  //
  // O `max` é derivado do próprio domínio: são cinco dias porque a tupla
  // tem cinco. Antes era `5` literal, que é a mesma coisa até o dia em
  // que não for.
  disponibilidade: z
    .array(z.enum(VALORES_DIA_SEMANA))
    .min(1)
    .max(VALORES_DIA_SEMANA.length),

  // Consentimento: `z.literal(true)` e não `z.boolean()` — `false` tem que
  // reprovar. É a base legal da coleta (LGPD art. 7º, I); sem ela não há
  // por que gravar dado nenhum.
  consent: z.literal(true),

  // Honeypot: campo escondido por CSS que só bot preenche. Opcional de
  // propósito — humano nunca manda, e a ausência não pode ser erro.
  website: z.string().optional(),
})

export type InscricaoValidada = z.infer<typeof inscricaoSchema>

// ============================================================
// A MENSAGEM DE ERRO — genérica por segurança, específica por exceção
//
// Ela vem junto do schema de propósito. Enquanto morava na rota, a regra
// que a governa ficava a uma distração de ser "melhorada" por alguém
// tentando ajudar o usuário — e a melhoria óbvia é justamente a errada.
//
// ⚠️ NÃO devolva ao cliente qual campo falhou nem por quê, fora das duas
// exceções abaixo. Uma mensagem detalhada — "phone: formato inválido",
// "disponibilidade: máximo 5 itens" — devolve de graça o formato exato
// que o servidor espera. O formulário viraria a documentação de como
// forjar um POST que ele aceita, e nada mais no sistema compensa isso:
// não há sessão, não há usuário autenticado, e este é o único caminho de
// escrita que existe (REPORT §4.2).
//
// AS DUAS EXCEÇÕES, e por que são exatamente estas duas:
//
// Consentimento e disponibilidade são os dois erros que a pessoa corrige
// com UM CLIQUE, e são os dois que "confira os dados informados" manda
// revisar no lugar errado — ela releria nome, e-mail e telefone, que
// estão certos, sem nunca olhar para a caixa que não marcou.
//
// O que essas duas mensagens revelam ao atacante é nada que a tela já não
// mostre: que existe um consentimento obrigatório e um seletor de dias.
// Ambos estão visíveis no HTML. As outras revelariam formato — e formato
// é o que não está na tela.
//
// `campos.size === 1` é o que mantém isso apertado: a mensagem específica
// só sai quando o ÚNICO erro é aquele. Um payload forjado que erra cinco
// campos de uma vez recebe a genérica, e não um relatório campo a campo.
// ============================================================

export const ERRO_GENERICO = 'Confira os dados informados e tente de novo.'

export const ERRO_CONSENTIMENTO =
  'É preciso concordar em receber as comunicações para concluir a inscrição.'

export const ERRO_DISPONIBILIDADE =
  'Marque pelo menos um dia da semana em que você pode assistir às aulas.'

export function mensagemDeErro(error: z.ZodError): string {
  const campos = new Set(error.issues.map((i) => i.path[0]))
  const so = (campo: string) => campos.size === 1 && campos.has(campo)

  if (so('consent')) return ERRO_CONSENTIMENTO
  if (so('disponibilidade')) return ERRO_DISPONIBILIDADE
  return ERRO_GENERICO
}
