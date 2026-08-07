// ============================================================
// CONFIGURAÇÃO DO CURSO
// Links institucionais e formatação. Só isto.
//
// As datas, o valor e a duração NÃO moram mais aqui: são colunas da
// tabela `public.safras` e chegam pela rota `/api/safra-ativa`. Foi uma
// troca deliberada — enquanto eram constantes, mudar a data de cobrança
// ou abrir a turma seguinte exigia commit e deploy. Agora é um UPDATE no
// Supabase Studio.
//
// O que sobrou aqui é o que não varia por turma. Se um dado do curso
// mudar de safra para safra, ele pertence ao banco, não a este arquivo.
// ============================================================

/** Perfil oficial no Instagram — destino do CTA da tela de sucesso. */
export const INSTAGRAM_URL = 'https://www.instagram.com/giovanna.embrio/'

/**
 * Registro profissional da professora.
 *
 * Estava escrito à mão em dois lugares (`Footer.jsx` e `Teacher.jsx`), com
 * o risco óbvio de os dois divergirem numa edição futura. O valor abaixo foi
 * copiado VERBATIM de lá: hífen entre `CRBM` e `7`, espaço simples antes do
 * número, sem `nº`, sem barra, sem região por extenso.
 *
 * ⚠️ Não reformatar, não normalizar, não completar. É dado de credencial —
 * se precisar mudar, confirme na fonte antes.
 */
export const CRBM = 'CRBM-7 11567'

/**
 * Converte a `date` do Postgres ('YYYY-MM-DD') num `Date` em UTC.
 *
 * É a ponte entre o banco e `formatarDataPorExtenso`, e ela precisa
 * existir: `new Date('2026-08-28')` é interpretado como meia-noite UTC
 * e, formatado no fuso de São Paulo (UTC-3), volta como 27 de agosto.
 * Um dia inteiro de diferença numa data de cobrança.
 *
 * `Date.UTC` explícito a partir das partes, somado ao `timeZone: 'UTC'`
 * da formatação, mantém o dia 28 sendo 28 em qualquer fuso — e faz
 * servidor e cliente produzirem a mesma string, o que também evita
 * divergência de hidratação.
 *
 * Nota: o mês em `Date.UTC` é 0-indexado, daí o `- 1`.
 */
export function paraDataUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

/**
 * Formata uma data por extenso em pt-BR — "28 de agosto de 2026".
 *
 * `timeZone: 'UTC'` é obrigatório: as datas vêm de `paraDataUTC`, que as
 * constrói como instantes UTC. Ver o comentário lá.
 *
 * ============================================================
 * ⚠️ SEM CHAMADOR HOJE, E NÃO É CÓDIGO MORTO — ELA ESPERA O CORTE 2
 * ============================================================
 *
 * Ela existe para `data_primeira_cobranca`, e essa é a única data do
 * modelo que PODE e DEVE sair seca. Cobrança tem dia exato: o cartão é
 * debitado no dia 25, não "na última semana de fevereiro". Dizer a
 * semana ali seria vago exatamente onde a pessoa precisa de precisão —
 * é o oposto da `data_inicio_aulas`, que a D-14 manda dizer por semana
 * justamente porque cada grupo começa num dia diferente da mesma semana
 * (D-01) e o dia exato seria uma promessa que o produto não faz.
 *
 * As duas datas parecem a mesma coisa e não são. Confundi-las nas duas
 * direções dá errado: data seca no início das aulas mente; semana na
 * cobrança deixa a pessoa sem saber quando o dinheiro sai da conta.
 *
 * O último chamador saiu do `src/lib/email.ts` — era um
 * `inicioPorExtenso()` aplicado à data ERRADA (o início das aulas), e
 * saiu por isso, não por a função ser inútil. O chamador certo chega com
 * o checkout, no corte 2, que é quando existe uma cobrança para anunciar.
 *
 * ⚠️ NÃO APAGAR num passe de limpeza por "parecer órfã". Apagá-la agora
 * significa reescrevê-la depois — e reescrever significa refazer, na
 * pressa do checkout, a decisão de fuso que `paraDataUTC` documenta logo
 * acima: sem o `timeZone: 'UTC'` dos dois lados, a data de cobrança
 * aparece um dia antes no Brasil.
 */
export function formatarDataPorExtenso(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data)
}

/**
 * Mensalidade formatada como moeda — "R$ 299,99".
 *
 * ⚠️ Esta função passou meses SEM NENHUM CHAMADOR, e isso era o sintoma
 * da tensão 8.1 do `REPORT.md`: o banco era fonte de verdade, o
 * transporte existia, e a página exibia `R$ 299,99` escrito à mão. A
 * professora podia mudar o valor no Studio e o site continuava dizendo o
 * número velho. O `c22` ligou o consumo — quem chama é `app/page.jsx`,
 * pela `Pricing`.
 *
 * O parâmetro é `number` porque é o que o PostgREST devolve (medido:
 * `299.99`, número JSON). ⚠️ Isto é FORMATAÇÃO PARA EXIBIR e nada mais.
 * Aritmética de dinheiro não acontece em float: o Stripe cobra em
 * centavo inteiro, e a conversão para inteiro é do corte 2, no ponto que
 * monta a Checkout Session. Se um dia aparecer soma, desconto ou
 * proporcional escrito sobre este valor, o erro está em quem somou.
 */
export function formatarValorMensal(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

/**
 * Duração em meses, com a concordância certa — "6 meses", "1 mês".
 *
 * Existe porque o literal que ela substitui era sempre "6 meses", e o
 * plural estava embutido na frase. `duracao_meses` é uma coluna de
 * `safras` (D-01: o calendário é da safra) e a Giovana pode publicar uma
 * safra de um mês sem falar com ninguém — aí a página diria "1 meses".
 *
 * Devolve minúscula sempre. Onde a tela pede caixa alta (o chip do card
 * de preço, "6 Meses"), quem resolve é `capitalize` no CSS: a variação é
 * de apresentação e não merece uma segunda string para divergir da
 * primeira.
 */
export function formatarDuracao(meses: number): string {
  return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

/**
 * O mês de `data_inicio_aulas`, por extenso e em minúscula — "setembro".
 *
 * Existe para o badge do hero, que dizia `Setembro` escrito à mão ao lado
 * de "Primeira turma". Era a mesma classe de literal que o `R$ 299,99` do
 * `c22`: a Giovana publica a safra de janeiro no Studio, o preço da
 * página acompanha em 60s, e o badge continua anunciando setembro.
 *
 * Devolve minúscula sempre, como `formatarDuracao`. Onde a tela pede
 * caixa alta (o badge do hero), quem resolve é `capitalize` no CSS: a
 * variação é de apresentação e não merece uma segunda string para
 * divergir da primeira.
 *
 * ⚠️ O `paraDataUTC` no caminho NÃO é decoração — ver o comentário dele
 * acima. `new Date('2026-09-01')` seguido de `toLocaleString` no fuso do
 * Brasil devolveria **agosto**, e um badge que anuncia o mês errado é
 * pior que o literal que ele substitui.
 */
export function nomeDoMes(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  })
    .format(paraDataUTC(iso))
    .toLocaleLowerCase('pt-BR')
}

/**
 * Em que semana as aulas começam — "na primeira semana de setembro".
 *
 * ============================================================
 * POR QUE NUNCA A DATA SECA (D-14)
 * ============================================================
 *
 * Pela D-01 a safra tem calendário e o grupo é só um horário dentro
 * dela: quem cai no grupo de quarta não começa na segunda. "As aulas
 * começam em 02/09/2026" seria uma promessa que o produto não faz para a
 * maior parte das inscritas — e é exatamente por isso que o texto
 * literal ("primeira semana de setembro de 2026") foi parar no código no
 * sistema atual. O diagnóstico daquele comentário estava certo; o que
 * estava errado era a solução, que congelou a informação fora do banco.
 * Esta função mantém o diagnóstico e devolve a informação para a
 * `data_inicio_aulas`.
 *
 * ============================================================
 * O MÊS SAI DA PRÓPRIA DATA, NÃO DA SEGUNDA-FEIRA DA SEMANA
 * ============================================================
 *
 * Aula que começa na quarta 02/09 é "primeira semana de setembro", ainda
 * que a semana civil comece em 31/08. É decisão de produto, não
 * descuido: quem lê está se preparando para a semana em que as aulas
 * acontecem, e essa semana é de setembro para quem vai assistir.
 * Retroceder até a segunda-feira para nomear o mês faria a página dizer
 * "agosto" sobre uma turma que não tem uma única aula em agosto.
 *
 * ============================================================
 * A FAIXA FINAL É ABERTA DE PROPÓSITO
 * ============================================================
 *
 * As três primeiras faixas são de sete dias; a última absorve 22–31.
 * `Math.ceil(29 / 7)` daria "quinta semana", que ninguém fala — e
 * "quarta semana" para o dia 22 e "quinta" para o dia 29 dividiria em
 * duas uma coisa que, para quem lê, é a mesma: o fim do mês.
 *
 * ⚠️ SEM ANO, seguindo o tom do resto da landing. A safra de vitrine é
 * sempre a de `data_inicio_aulas` mais recente (D-13), então o ano é o
 * próximo por construção; escrevê-lo só acrescentaria ruído a uma frase
 * que já é deliberadamente imprecisa quanto ao dia.
 *
 * ⚠️ O DIA VEM DA STRING, NÃO DE UM `Date`. `data_inicio_aulas` é uma
 * coluna `date` — dia de calendário, não instante —, e
 * `new Date('2026-09-01').getDate()` no fuso do Brasil devolve **31**,
 * de agosto. Um dia para trás basta para trocar a faixa inteira ("última
 * semana de agosto" no lugar de "primeira semana de setembro"). A string
 * é tratada pelo que ela é: três componentes separados por hífen.
 */
export function formatarSemanaDeInicio(iso: string): string {
  const dia = Number(iso.split('-')[2])

  const ordinal =
    dia <= 7 ? 'primeira' : dia <= 14 ? 'segunda' : dia <= 21 ? 'terceira' : 'última'

  return `na ${ordinal} semana de ${nomeDoMes(iso)}`
}
