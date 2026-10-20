// ============================================================
// AS FORMAS DE PAGAMENTO (D-17)
//
// Módulo NEUTRO — não é client nem server, não toca `server-only` nem
// segredo —, pelo mesmo motivo de `dominio.ts` e `consentimento.ts`: a
// modal desenha as opções, a rota valida a escolha, o webhook monta a
// cobrança e o e-mail descreve o que foi combinado, e os quatro precisam
// falar das MESMAS quatro formas. Uma cópia por camada divergiria na
// primeira edição.
//
// ⚠️ OS VALORES NÃO MORAM AQUI. Quanto custa cada forma é coluna da safra
// (`020`), editada no painel (D-07, D-13). O que mora aqui é o que não
// varia por turma: quais formas existem, como cada uma vira um contrato,
// e a conta que divide um total em parcelas.
// ============================================================

/**
 * As quatro formas, na ordem em que a modal as oferece.
 *
 * ⚠️ ESPELHADAS NO CHECK `inscricoes_modalidade_check` DA `021`. Um quinto
 * valor aqui sem o CHECK seria recusado pelo banco no primeiro checkout; um
 * quinto valor lá sem código aqui seria uma inscrição que o checkout não
 * sabe cobrar. Mudam juntos.
 */
export const MODALIDADES = ['mensal', 'parcelado', 'a_vista_cartao', 'a_vista_pix'] as const

export type Modalidade = (typeof MODALIDADES)[number]

/**
 * A forma de quem não escolheu nenhuma.
 *
 * ⚠️ EXISTE PARA O BUNDLE ANTIGO, e não como sugestão de produto. Uma aba
 * aberta antes do deploy da D-17 manda o POST sem o campo — e "nenhum
 * passo derruba o formulário". A mensalidade era a única forma que aquela
 * tela conhecia, então é a única leitura honesta da ausência.
 */
export const MODALIDADE_PADRAO: Modalidade = 'mensal'

/**
 * A forma de um contrato que veio do banco.
 *
 * ⚠️ `null` COM CONTRATO TRAVADO = MENSAL, e este é o único lugar do
 * sistema que faz essa leitura. Toda inscrição com contrato anterior à
 * `021` passou por um checkout em que a mensalidade era a única forma
 * possível. Não houve backfill (ver o cabeçalho da `021`): o fato é
 * inferido aqui, nomeado, em vez de gravado no banco como se alguém o
 * tivesse escolhido.
 */
export function modalidadeDoContrato(modalidade: string | null): Modalidade {
  if (modalidade === null) return 'mensal'
  if ((MODALIDADES as readonly string[]).includes(modalidade)) return modalidade as Modalidade

  // ⚠️ Valor fora do domínio é impossível pelo CHECK da `021`. Chegar aqui
  // significa uma linha escrita por fora dele — e cobrar como mensal
  // seria adivinhar o contrato de alguém. Falha alto.
  throw new Error(`modalidade desconhecida no contrato: ${modalidade}`)
}

/** Só Pix cobra na inscrição. Toda forma de cartão segue a D-04. */
export function cobraNaInscricao(modalidade: Modalidade): boolean {
  return modalidade === 'a_vista_pix'
}

/**
 * Cupom só vale no mensal (D-17).
 *
 * Os três tipos da `013` — primeiro mês, todos os meses, meses grátis —
 * foram desenhados para mensalidade. "Primeiro mês grátis" num pagamento
 * único seria o curso de graça, e num parcelado de 12 seria desconto numa
 * parcela que ninguém chamou de "mês".
 */
export function aceitaCupom(modalidade: Modalidade): boolean {
  return modalidade === 'mensal'
}

// ============================================================
// DINHEIRO EM CENTAVOS
// ============================================================

/**
 * Reais (o que vem do banco) → centavos inteiros.
 *
 * ⚠️ `Math.round` NÃO É DEFENSIVO, É A CONVERSÃO. `numeric(10,2)` chega do
 * PostgREST como número JSON (medido: `299.99`), e `299.99 * 100` em ponto
 * flutuante é `29998.999999999996`. Ver `paraCentavos` em
 * `src/lib/stripe.ts`, que delega para cá desde a D-17.
 *
 * ⚠️ POR QUE A REGRA SE MUDOU PARA CÁ. Até a D-17 a conversão acontecia
 * num ponto só, na fronteira com o Stripe, e o comentário dela dizia
 * "aqui, e em nenhum outro lugar". O parcelado mudou isso: a modal precisa
 * mostrar a parcela (R$ 166,67) e o webhook precisa cobrá-la, e as duas
 * contas têm que ser a MESMA conta, em centavo inteiro, dos dois lados.
 * `stripe.ts` é `server-only` e a modal não pode importá-lo. A regra
 * continua morando num lugar só — este.
 */
export function emCentavos(reais: number): number {
  return Math.round(reais * 100)
}

/**
 * Divide um total em N parcelas mensais, em centavos, sem perder nem
 * criar dinheiro.
 *
 * ============================================================
 * ⚠️ A ÚLTIMA PARCELA ABSORVE A DIFERENÇA — e é decisão registrada
 * ============================================================
 *
 * R$ 2.000,00 em 12 vezes não fecha em centavos (166,666…). As duas saídas
 * oferecidas ao dono do repositório em 20/10/2026 foram:
 *
 *   (a) 12 × 166,67 = 2.000,04 — simples, quatro centavos a mais;
 *   (b) 11 × 166,67 + 1 × 166,63 = 2.000,00 exatos.
 *
 * Ele escolheu (b). A parcela regular é ARREDONDADA PARA CIMA, e a última
 * é o que sobra — então ela é sempre menor ou igual às outras, nunca
 * maior. Arredondar para baixo daria 11 × 166,66 + 1 × 166,74: a última
 * mais cara, que é a que gera "por que esse mês veio diferente?".
 *
 * O total é recebido em CENTAVOS, e não em reais, de propósito: a divisão
 * é aritmética de dinheiro, e ela só acontece em inteiro.
 *
 * ⚠️ LANÇA quando o total não cobre um centavo por parcela — a última
 * sairia zero ou negativa, e o Stripe recusa `price` de valor zero na
 * frente de alguém pagando. O CHECK
 * `safras_parcelado_centavo_por_parcela_check` da `020` recusa o mesmo
 * caso do lado do banco.
 */
export function dividirEmParcelas(
  totalCentavos: number,
  parcelas: number,
): { regular: number; ultima: number } {
  if (!Number.isInteger(totalCentavos) || !Number.isInteger(parcelas) || parcelas < 1) {
    throw new Error(`divisao invalida: ${totalCentavos} em ${parcelas}`)
  }

  const regular = Math.ceil(totalCentavos / parcelas)
  const ultima = totalCentavos - regular * (parcelas - 1)

  if (ultima <= 0) {
    throw new Error(`total ${totalCentavos} nao cobre ${parcelas} parcelas`)
  }

  return { regular, ultima }
}

// ============================================================
// DA SAFRA AO CONTRATO
// ============================================================

/**
 * O que uma safra precisa ter para oferecer formas de pagamento.
 *
 * Recorte deliberado, e não `Tables<'safras'>`: este módulo é neutro e
 * não importa o tipo gerado do banco — quem chama passa o que tem, e o
 * TypeScript confere que tem o suficiente.
 */
export type SafraComFormas = {
  valor_mensal: number
  duracao_meses: number
  data_primeira_cobranca: string
  valor_a_vista: number | null
  valor_parcelado_total: number | null
  parcelas_parcelado: number | null
}

/**
 * O contrato de uma inscrição, inteiro — o que trava na linha (D-06, D-17).
 *
 * ⚠️ `valorPorCobranca` É O VALOR DE CADA COBRANÇA REGULAR, e é o que vai
 * para `valor_mensal_travado`. No mensal é a mensalidade (o significado de
 * sempre); no parcelado é a parcela regular — a última pode ser menor, e
 * sai de `valorTotal` por `dividirEmParcelas`; no à vista é o valor
 * inteiro, cobrado uma vez.
 *
 * ⚠️ `duracaoMeses` É A DURAÇÃO DO CURSO, NÃO O NÚMERO DE COBRANÇAS. As
 * duas coincidiam no mensal e se separam aqui: o 12x cobra 12 vezes um
 * curso de 6 meses. O número de cobranças é `parcelas`.
 */
export type Contrato = {
  modalidade: Modalidade
  valorPorCobranca: number
  duracaoMeses: number
  /** `'YYYY-MM-DD'`. No Pix é só referência — o Pix cobra na inscrição. */
  dataPrimeiraCobranca: string
  parcelas: number
  valorTotal: number
}

/**
 * As formas que esta safra oferece, na ordem da modal.
 *
 * ⚠️ COLUNA NULA = FORMA NÃO OFERECIDA (`020`). A mensalidade é sempre
 * oferecida: `valor_mensal` é `not null` desde a `002`. O à vista no
 * cartão e no Pix andam juntos — os dois leem `valor_a_vista`, e a D-17
 * não prevê um sem o outro.
 */
export function modalidadesOferecidas(safra: SafraComFormas): Modalidade[] {
  const formas: Modalidade[] = ['mensal']

  if (safra.valor_parcelado_total !== null && safra.parcelas_parcelado !== null) {
    formas.push('parcelado')
  }

  if (safra.valor_a_vista !== null) {
    formas.push('a_vista_cartao', 'a_vista_pix')
  }

  return formas
}

/**
 * O contrato que esta forma de pagamento produz NESTA safra, ou `null`
 * quando a safra não oferece a forma.
 *
 * ⚠️ `null` NÃO É "USE O MENSAL". Quem pediu o à vista numa safra sem à
 * vista não pediu a mensalidade — e cobrar outra coisa do que a pessoa
 * escolheu é a definição de cobrar errado. Quem chama decide o que dizer.
 *
 * ⚠️ O TOTAL DO MENSAL E DO À VISTA É CALCULADO EM CENTAVOS e só volta
 * para reais no fim, porque é o que vai para `valor_total_travado`
 * (`numeric(10,2)`). `299.99 * 6` em float é `1799.9399999999998`.
 */
export function contratoDaModalidade(
  safra: SafraComFormas,
  modalidade: Modalidade,
): Contrato | null {
  if (!modalidadesOferecidas(safra).includes(modalidade)) return null

  const base = {
    modalidade,
    duracaoMeses: safra.duracao_meses,
    dataPrimeiraCobranca: safra.data_primeira_cobranca,
  }

  switch (modalidade) {
    case 'mensal':
      return {
        ...base,
        valorPorCobranca: safra.valor_mensal,
        parcelas: safra.duracao_meses,
        valorTotal: (emCentavos(safra.valor_mensal) * safra.duracao_meses) / 100,
      }

    case 'parcelado': {
      // As duas não-nulas foram garantidas por `modalidadesOferecidas`.
      const total = safra.valor_parcelado_total!
      const parcelas = safra.parcelas_parcelado!
      const { regular } = dividirEmParcelas(emCentavos(total), parcelas)

      return {
        ...base,
        valorPorCobranca: regular / 100,
        parcelas,
        valorTotal: total,
      }
    }

    case 'a_vista_cartao':
    case 'a_vista_pix':
      return {
        ...base,
        valorPorCobranca: safra.valor_a_vista!,
        parcelas: 1,
        valorTotal: safra.valor_a_vista!,
      }
  }
}

// ============================================================
// O QUE A TELA DIZ
// ============================================================

/**
 * O nome curto de cada forma, sem valor — para onde o valor não cabe ou
 * não se sabe: a coluna de uma lista do painel, ou a forma travada de uma
 * pendência cuja safra deixou de oferecê-la.
 */
export const NOME_DA_MODALIDADE: Record<Modalidade, string> = {
  mensal: 'Mensal',
  parcelado: 'Parcelado',
  a_vista_cartao: 'À vista no cartão',
  a_vista_pix: 'À vista no Pix',
}

/** `299.99` → `R$ 299,99`. Mesma formatação de `formatarValorMensal`. */
function reais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/**
 * Como cada forma aparece no menu da modal, no painel e no e-mail.
 *
 * ⚠️ O PARCELADO DIZ O TOTAL, e não "12x de R$ 166,67". A parcela regular
 * não é a última (ver `dividirEmParcelas`), e "12x de 166,67" somaria
 * 2.000,04 na cabeça de quem lê — um número que ninguém vai cobrar.
 * "12x, total de R$ 2.000,00" é o que foi combinado, e é verdade.
 */
export function rotuloDaModalidade(contrato: Contrato): string {
  switch (contrato.modalidade) {
    case 'mensal':
      return `${contrato.parcelas}x de ${reais(contrato.valorPorCobranca)} (mensalidade)`
    case 'parcelado':
      return `${contrato.parcelas}x, total de ${reais(contrato.valorTotal)}`
    case 'a_vista_cartao':
      return `À vista no cartão — ${reais(contrato.valorTotal)}`
    case 'a_vista_pix':
      return `À vista no Pix — ${reais(contrato.valorTotal)}`
  }
}
