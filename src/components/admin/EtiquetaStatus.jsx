// ============================================================
// A ETIQUETA DE SITUAÇÃO — cor com significado, não decoração
//
// ⚠️ A COR É UM ATALHO PARA VARRER UMA LISTA, e por isso ela é uma só por
// significado: rosa = está esperando alguma coisa nossa, amarelo = está
// parada esperando a PESSOA, vermelho = o dinheiro falhou, verde = está em
// dia. Quem lê a lista não decora a legenda; lê o texto uma vez e depois
// enxerga o padrão.
//
// ⚠️ A COR NUNCA É A ÚNICA INFORMAÇÃO. Toda etiqueta tem o texto escrito
// dentro. Uma lista onde "amarelo" significa alguma coisa e o texto não
// diz o quê é ilegível para quem não distingue as cores — e é ilegível em
// impressão, que é como uma lista dessas termina numa reunião.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`, e uma ampliação dela registrada
// aqui: o rosa e o raio saem dos tokens do `tailwind.config.js`
// (`rose-100`, `rose-200`, `brand`), mas o AMARELO, o VERMELHO e o VERDE
// não existem na paleta do produto — a landing nunca precisou deles.
// Foram pedidos em 27/08/2026 para esta tela. Em vez de inventar um hex,
// usam os degraus 50/200/800 da paleta padrão do Tailwind, que é fonte
// externa declarada e não número estimado por mim. Se um dia existir um
// Figma do painel, ESTES são os três valores a conferir primeiro.
// ============================================================

const TONS = {
  lista_espera: 'border-rose-200 bg-rose-100 text-brand',
  pendente_pagamento: 'border-amber-200 bg-amber-50 text-amber-800',
  confirmada: 'border-border-soft bg-white text-ink',
  ativa: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  inadimplente: 'border-red-200 bg-red-50 text-red-700',
  concluida: 'border-border-soft bg-white text-muted',
  cancelada: 'border-border-soft bg-white text-muted',
}

const NEUTRO = 'border-border-soft bg-white text-ink'

/**
 * ⚠️ O TEXTO VEM DE FORA, e isso é de propósito.
 *
 * A lista e a ficha chamam a mesma situação por nomes diferentes —
 * "Cartão salvo" na lista, "Cartão salvo, aguardando a primeira cobrança"
 * na ficha — porque numa cabe uma linha e na outra cabe a frase inteira.
 * Centralizar os rótulos aqui obrigaria as duas a dizerem a mesma coisa, e
 * a mais curta venceria. O que este arquivo centraliza é a COR.
 */
export default function EtiquetaStatus({ status, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-sans text-[13px]
                  font-medium ${TONS[status] ?? NEUTRO}`}
    >
      {children}
    </span>
  )
}
