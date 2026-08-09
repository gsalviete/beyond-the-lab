'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// ============================================================
// O DISPARO DO LINK DE PAGAMENTO (`c75`, D-15)
//
// ⚠️ ELE MANDA E-MAIL PARA GENTE REAL, e por isso mostra o resultado em
// vez de sumir. Um botão que não responde faz a pessoa clicar de novo — e
// aqui o segundo clique é um segundo e-mail na caixa de entrada de alguém.
//
// ⚠️ E ELE É `useState` E NÃO UM FORM HTML PURO, ao contrário do botão de
// ligar/desligar cupom. A diferença é o que cada um custa se falhar sem
// avisar: um cupom que não desligou é visível na própria lista; um e-mail
// que não saiu é invisível, e a Giovanna ficaria esperando uma pessoa que
// nunca recebeu nada.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export default function BotaoEnviarLink({ pessoaId, nome, jaTemConvite }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function enviar() {
    if (enviando) return
    setEnviando(true)
    setAviso(null)

    try {
      const corpo = new FormData()
      corpo.set('pessoa_id', pessoaId)

      const res = await fetch('/api/admin/pendentes', { method: 'POST', body: corpo })
      const body = await res.json().catch(() => null)

      setAviso({
        tom: body?.ok ? 'bom' : 'ruim',
        texto: body?.message ?? 'Não conseguimos falar com o servidor.',
      })

      // Recarrega os dados do Server Component: a linha passa a mostrar
      // que existe convite vivo.
      if (body?.ok) router.refresh()
    } catch {
      setAviso({ tom: 'ruim', texto: 'Falha de conexão. Tente de novo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="shrink-0 sm:text-right">
      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="rounded-full border border-border-soft px-4 py-2 font-sans text-[14px]
                   font-medium text-ink [transition:color_var(--motion-fast)_var(--ease-out)]
                   hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : jaTemConvite ? 'Reenviar link' : 'Enviar link de pagamento'}
      </button>

      {aviso && (
        <p
          role="status"
          className={`mt-2 max-w-[280px] font-sans text-[13px] leading-[20px] ${
            aviso.tom === 'bom' ? 'text-brand' : 'text-ink'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {/* O nome fica no `aria-label` do botão para o leitor de tela não
          anunciar cinco "Enviar link de pagamento" idênticos numa lista. */}
      <span className="sr-only">{nome}</span>
    </div>
  )
}
