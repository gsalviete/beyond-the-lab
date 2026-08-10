'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { descreverCupom } from '@/config/cupom'

// ============================================================
// CONVIDAR ALGUÉM DA LISTA DE ESPERA (D-10, D-16)
//
// ⚠️ O CUPOM É ESCOLHIDO NA HORA DO ENVIO, e não amarrado à pessoa.
//
// A D-16 diz que o desconto de "primeira semana" é um CUPOM, não um preço
// especial: "um segundo caminho de preço criaria uma inscrição cujo valor
// não vem nem da safra nem de um cupom, e nada no painel saberia explicar
// de onde saiu". Escolher aqui mantém isso — o desconto sempre passa por
// `cupons`, com contagem de uso e validade.
//
// ⚠️ E A ESCOLHA É DELA, PORQUE A DATA DE CORTE DA D-16 NUNCA FOI
// DEFINIDA. A decisão registra a pendência com todas as letras: "falta
// responder: primeira semana A PARTIR DE QUANDO?". Enquanto isso não for
// respondido, a tela mostra desde quando cada pessoa espera — derivado de
// `created_at`, nunca uma flag — e ela decide. No dia em que a data
// existir, ela vira uma constante única e o cupom passa a ser sugerido
// sozinho.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export default function BotaoConvidar({ pessoaId, nome, jaConvidada, cupons }) {
  const router = useRouter()
  const [cupomId, setCupomId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    setAviso(null)

    try {
      const corpo = new FormData()
      corpo.set('pessoa_id', pessoaId)
      corpo.set('cupom_id', cupomId)

      const res = await fetch('/api/admin/espera', { method: 'POST', body: corpo })
      const body = await res.json().catch(() => null)

      setAviso({
        tom: body?.ok ? 'bom' : 'ruim',
        texto: body?.message ?? 'Não conseguimos falar com o servidor.',
      })

      if (body?.ok) router.refresh()
    } catch {
      setAviso({ tom: 'ruim', texto: 'Falha de conexão. Tente de novo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`c-${pessoaId}`}>
          Cupom para {nome}
        </label>
        <select
          id={`c-${pessoaId}`}
          value={cupomId}
          disabled={enviando}
          onChange={(e) => setCupomId(e.target.value)}
          className="cursor-pointer rounded-full border border-border-soft bg-white px-3 py-2
                     font-sans text-[13px] text-ink"
        >
          <option value="">Sem desconto</option>
          {cupons.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} — {descreverCupom(c.tipo, c.valor)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="rounded-full border border-border-soft px-4 py-2 font-sans text-[14px]
                     font-medium text-ink [transition:color_var(--motion-fast)_var(--ease-out)]
                     hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : jaConvidada ? 'Reenviar convite' : 'Convidar'}
        </button>
      </div>

      {aviso && (
        <p
          role="status"
          className={`max-w-[280px] font-sans text-[13px] leading-[20px] ${
            aviso.tom === 'bom' ? 'text-brand' : 'text-ink'
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  )
}
