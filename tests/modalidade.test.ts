// ============================================================
// As formas de pagamento (D-17) — `c85`
//
// O que dá para provar sem rede: que a safra vira o contrato certo, e que
// o total do parcelado é dividido em centavos sem criar nem perder
// dinheiro. É a conta que decide quanto alguém paga por mês durante um
// ano, e o erro dela não aparece na tela — aparece no extrato.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO PROVA:
//
//   ✓ 2.000,00 em 12 vira 11 × 166,67 + 1 × 166,63
//   ✗ o Stripe cobra essas 12 faturas nessas datas
//
// A segunda linha só fecha com um schedule real em modo teste — é o aceite
// do corte 4.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  MODALIDADES,
  aceitaCupom,
  cobraNaInscricao,
  contratoDaModalidade,
  dividirEmParcelas,
  emCentavos,
  modalidadeDoContrato,
  modalidadesOferecidas,
  rotuloDaModalidade,
  type SafraComFormas,
} from '@/config/modalidade'

/** A turma de novembro/2026 como o negócio a descreveu em 20/10/2026. */
const NOVEMBRO: SafraComFormas = {
  valor_mensal: 299.99,
  duracao_meses: 6,
  data_primeira_cobranca: '2026-11-02',
  valor_a_vista: 1500,
  valor_parcelado_total: 2000,
  parcelas_parcelado: 12,
}

/** Uma safra de antes da D-17: só mensalidade. */
const SO_MENSAL: SafraComFormas = {
  ...NOVEMBRO,
  valor_a_vista: null,
  valor_parcelado_total: null,
  parcelas_parcelado: null,
}

// ============================================================
// 1. A divisão em parcelas
// ============================================================
describe('dividirEmParcelas fecha o total no centavo', () => {
  it('R$ 2.000,00 em 12 → 11 × 166,67 + 1 × 166,63 (decisão de 20/10/2026)', () => {
    expect(dividirEmParcelas(200000, 12)).toEqual({ regular: 16667, ultima: 16663 })
  })

  it('a soma das parcelas é o total, sem sobra', () => {
    const { regular, ultima } = dividirEmParcelas(200000, 12)
    expect(regular * 11 + ultima).toBe(200000)
  })

  it('total que divide exato → todas as parcelas iguais', () => {
    expect(dividirEmParcelas(180000, 12)).toEqual({ regular: 15000, ultima: 15000 })
  })

  // ⚠️ A ÚLTIMA NUNCA É A MAIS CARA. Arredondar a regular para baixo daria
  // 11 × 166,66 + 1 × 166,74 — e o mês que vem diferente para cima é o que
  // gera reclamação.
  it('a última parcela nunca é maior que as outras', () => {
    for (const total of [100000, 199999, 200000, 200001, 123457]) {
      for (const n of [2, 3, 7, 12]) {
        const { regular, ultima } = dividirEmParcelas(total, n)
        expect(ultima).toBeLessThanOrEqual(regular)
        expect(regular * (n - 1) + ultima).toBe(total)
      }
    }
  })

  it('recusa total que não cobre um centavo por parcela', () => {
    expect(() => dividirEmParcelas(5, 12)).toThrow()
  })

  it('recusa valor que não é centavo inteiro', () => {
    expect(() => dividirEmParcelas(2000.5, 12)).toThrow()
  })
})

describe('emCentavos não perde centavo em float', () => {
  it('299,99 vira 29999, e não 29998', () => {
    expect(emCentavos(299.99)).toBe(29999)
  })
})

// ============================================================
// 2. A safra oferece o que tem coluna
// ============================================================
describe('modalidadesOferecidas', () => {
  it('safra de antes da D-17 oferece só o mensal', () => {
    expect(modalidadesOferecidas(SO_MENSAL)).toEqual(['mensal'])
  })

  it('a turma de novembro oferece as quatro, na ordem da modal', () => {
    expect(modalidadesOferecidas(NOVEMBRO)).toEqual([...MODALIDADES])
  })

  it('cartão e Pix à vista andam juntos — os dois leem `valor_a_vista`', () => {
    const formas = modalidadesOferecidas({ ...SO_MENSAL, valor_a_vista: 1500 })
    expect(formas).toEqual(['mensal', 'a_vista_cartao', 'a_vista_pix'])
  })
})

// ============================================================
// 3. O contrato de cada forma
// ============================================================
describe('contratoDaModalidade', () => {
  it('mensal: 6 × 299,99, total calculado em centavos', () => {
    expect(contratoDaModalidade(NOVEMBRO, 'mensal')).toEqual({
      modalidade: 'mensal',
      valorPorCobranca: 299.99,
      duracaoMeses: 6,
      dataPrimeiraCobranca: '2026-11-02',
      parcelas: 6,
      // `299.99 * 6` em float é 1799.9399999999998.
      valorTotal: 1799.94,
    })
  })

  // ⚠️ A DURAÇÃO DO CURSO E O NÚMERO DE COBRANÇAS SE SEPARAM AQUI.
  it('parcelado: 12 cobranças de um curso de 6 meses, parcela regular 166,67', () => {
    expect(contratoDaModalidade(NOVEMBRO, 'parcelado')).toEqual({
      modalidade: 'parcelado',
      valorPorCobranca: 166.67,
      duracaoMeses: 6,
      dataPrimeiraCobranca: '2026-11-02',
      parcelas: 12,
      valorTotal: 2000,
    })
  })

  it('à vista no cartão e no Pix: uma cobrança do valor inteiro', () => {
    for (const forma of ['a_vista_cartao', 'a_vista_pix'] as const) {
      expect(contratoDaModalidade(NOVEMBRO, forma)).toMatchObject({
        modalidade: forma,
        valorPorCobranca: 1500,
        parcelas: 1,
        valorTotal: 1500,
      })
    }
  })

  // ⚠️ `null` NÃO É "USE O MENSAL": quem pediu à vista não pediu
  // mensalidade.
  it('forma não oferecida pela safra devolve null', () => {
    expect(contratoDaModalidade(SO_MENSAL, 'a_vista_pix')).toBeNull()
    expect(contratoDaModalidade(SO_MENSAL, 'parcelado')).toBeNull()
  })
})

// ============================================================
// 4. As regras da D-17 que cabem numa linha
// ============================================================
describe('as regras da D-17', () => {
  it('só o Pix cobra na inscrição', () => {
    expect(MODALIDADES.filter(cobraNaInscricao)).toEqual(['a_vista_pix'])
  })

  it('cupom só vale no mensal', () => {
    expect(MODALIDADES.filter(aceitaCupom)).toEqual(['mensal'])
  })
})

describe('modalidadeDoContrato', () => {
  // ⚠️ Sem backfill (`021`): contrato anterior à D-17 só podia ser mensal.
  it('null num contrato antigo é mensal', () => {
    expect(modalidadeDoContrato(null)).toBe('mensal')
  })

  it('valor conhecido passa como veio', () => {
    expect(modalidadeDoContrato('a_vista_pix')).toBe('a_vista_pix')
  })

  it('valor fora do domínio falha alto, em vez de virar mensal', () => {
    expect(() => modalidadeDoContrato('boleto')).toThrow()
  })
})

describe('rotuloDaModalidade', () => {
  // ⚠️ "12x de R$ 166,67" somaria 2.000,04 na cabeça de quem lê.
  it('o parcelado mostra o total, não a parcela', () => {
    const rotulo = rotuloDaModalidade(contratoDaModalidade(NOVEMBRO, 'parcelado')!)
    expect(rotulo).toMatch(/^12x, total de R\$\s2\.000,00$/)
  })

  it('o mensal mostra a mensalidade', () => {
    const rotulo = rotuloDaModalidade(contratoDaModalidade(NOVEMBRO, 'mensal')!)
    expect(rotulo).toMatch(/^6x de R\$\s299,99 \(mensalidade\)$/)
  })
})
