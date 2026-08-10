// ============================================================
// A conta do prazo — 6 débitos, não 7
//
// É o `c47` do `04-PLANO.md`, e o plano o descreve como "o teste que
// evita a reclamação de julho". Ele cobre a única parte da integração
// com o Stripe que move dinheiro e que dá para exercitar sem rede:
// quando o trial termina e quando a assinatura morre.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO PROVA — e é importante, porque um verde aqui
// é fácil de confundir com "o checkout está certo":
//
//   ✓ a conta de datas está certa
//   ✗ a sessão de checkout manda essas datas ao Stripe
//   ✗ o Stripe cobra o que a gente acha que ele vai cobrar
//
// A segunda linha fecha quando a montagem da sessão existir; a terceira
// só fecha com uma assinatura real em modo teste, e é por isso que o
// `05-BRIEFING-CLAUDE-CODE.md` marca o `c35` como checkpoint NÃO
// delegável.
// ============================================================
import { describe, expect, it } from 'vitest'

// `@/lib/stripe` é `server-only`. Mesmo dublê de `inscricao-rpc.test.ts`:
// a proteção continua no arquivo de produção, que é onde ela protege
// alguma coisa.
import { vi } from 'vitest'
vi.mock('server-only', () => ({}))

const { somarMeses, ancorasDaAssinatura, paraCentavos, paraEpoch } = await import('@/lib/stripe')

// ============================================================
// 1. `somarMeses` — aritmética de calendário
// ============================================================
describe('somarMeses soma meses sem estourar o dia', () => {
  it('o caso comum: 6 meses a partir do dia 1', () => {
    expect(somarMeses('2026-09-01', 6)).toBe('2027-03-01')
  })

  it('atravessa a virada do ano', () => {
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('somar zero devolve a própria data', () => {
    expect(somarMeses('2026-09-01', 0)).toBe('2026-09-01')
  })

  // ⚠️ O BUG QUE ESTE BLOCO EXISTE PARA IMPEDIR.
  //
  // `new Date('2026-01-31').setMonth(1)` produz 31/02, que o JavaScript
  // "corrige" para 03/03 — um mês inteiro a mais. Numa
  // `data_primeira_cobranca`, é a sétima cobrança entrando pela porta
  // dos fundos.
  it('31/01 + 1 mês é 28/02, e NÃO 03/03', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('respeita ano bissexto: 31/01/2028 + 1 mês é 29/02', () => {
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('31/03 + 1 mês é 30/04', () => {
    expect(somarMeses('2026-03-31', 1)).toBe('2026-04-30')
  })

  // O grampeamento não "gruda": partir do dia 31 e somar 2 meses tem que
  // dar 31, não 28. Se a implementação normalizasse a data a cada passo,
  // o dia iria se perdendo mês a mês.
  it('grampear em fevereiro não estraga o mês seguinte', () => {
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('12 meses é o mesmo dia do ano seguinte', () => {
    expect(somarMeses('2026-09-01', 12)).toBe('2027-09-01')
  })
})

// ============================================================
// 2. As âncoras — D-04 e D-05
// ============================================================
describe('trial_end e cancel_at', () => {
  const SAFRA = { data_primeira_cobranca: '2026-09-01', duracao_meses: 6 }

  it('trial_end é a data da primeira cobrança (D-04)', () => {
    const { trialEnd } = ancorasDaAssinatura(SAFRA)
    expect(trialEnd).toBe(paraEpoch('2026-09-01'))
  })

  // ⚠️ ESTE É O TESTE. `+ duracao_meses`, não `+ duracao - 1` nem
  // `+ duracao + 1`.
  //
  //   fatura 1 em 01/09  ...  fatura 6 em 01/02 (cobre até 01/03)
  //   logo cancel_at = 01/03 = T + 6 meses
  it('cancel_at é T + duracao_meses — seis débitos, não sete (D-05)', () => {
    const { cancelAt } = ancorasDaAssinatura(SAFRA)
    expect(cancelAt).toBe(paraEpoch('2027-03-01'))
  })

  it('cancel_at é sempre depois de trial_end', () => {
    const { trialEnd, cancelAt } = ancorasDaAssinatura(SAFRA)
    expect(cancelAt).toBeGreaterThan(trialEnd)
  })

  // A distância entre as duas âncoras é a duração, e nada mais. Escrito
  // como asserção para que uma safra de outra duração não precise de um
  // teste novo.
  it.each([1, 3, 6, 12])('uma safra de %i meses termina %i meses depois', (meses) => {
    const { cancelAt } = ancorasDaAssinatura({
      data_primeira_cobranca: '2026-09-01',
      duracao_meses: meses,
    })
    expect(cancelAt).toBe(paraEpoch(somarMeses('2026-09-01', meses)))
  })
})

// ============================================================
// 3. As duas conversões de fronteira
// ============================================================
describe('paraCentavos', () => {
  // ⚠️ O CASO QUE JUSTIFICA A FUNÇÃO EXISTIR. `299.99 * 100` em ponto
  // flutuante é 29998.999999999996, e o Stripe recusa não-inteiro.
  it('299.99 vira 29999, e não 29998.999999999996', () => {
    expect(paraCentavos(299.99)).toBe(29999)
    expect(Number.isInteger(paraCentavos(299.99))).toBe(true)
  })

  it('valor redondo continua redondo', () => {
    expect(paraCentavos(300)).toBe(30000)
  })

  it('centavos ímpares sobrevivem', () => {
    expect(paraCentavos(0.01)).toBe(1)
    expect(paraCentavos(1.05)).toBe(105)
  })
})

describe('paraEpoch', () => {
  // ⚠️ SEGUNDOS, NÃO MILISSEGUNDOS. Um `Date.now()` cru num trial_end
  // agenda a primeira cobrança para o ano 57000 — e o Stripe ACEITA,
  // porque é um inteiro válido. A falha não aparece na criação: aparece
  // quando a cobrança não acontece, meses depois.
  it('devolve segundos, não milissegundos', () => {
    const epoch = paraEpoch('2026-09-01')
    expect(epoch).toBe(Date.UTC(2026, 8, 1) / 1000)
    expect(String(epoch)).toHaveLength(10)
  })

  // ⚠️ `new Date('2026-09-01')` formatado no fuso do Brasil volta como
  // 31/08. Um dia a menos numa data de cobrança é uma fatura adiantada.
  it('a data não anda para trás por causa de fuso', () => {
    const d = new Date(paraEpoch('2026-09-01') * 1000)
    expect(d.getUTCDate()).toBe(1)
    expect(d.getUTCMonth()).toBe(8)
  })
})
