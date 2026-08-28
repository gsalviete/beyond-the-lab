'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import ModalConfirmacao from './ModalConfirmacao.jsx'

// ============================================================
// CANCELAR INSCRIÇÃO (`c73`, Fluxo 6)
//
// ⚠️ ESTA É A ÚNICA AÇÃO DO PAINEL QUE MOVE DINHEIRO. Ela encerra a
// assinatura no Stripe — o oposto exato da alocação, que pela D-03 não
// dispara, cancela ou altera nada lá.
//
// ⚠️ A CONFIRMAÇÃO POR NOME É O FREIO, e ela não é teatro: um `confirm()`
// do navegador é dispensado no reflexo, e um botão vermelho é clicado por
// engano. Digitar o nome de alguém exige ler de quem se está falando —
// que é exatamente o erro que precisa ser impedido (cancelar a pessoa
// errada numa lista de nomes parecidos).
//
// ⚠️ A MODAL NÃO SUBSTITUI O FREIO — ELA O ISOLA. A confirmação era um
// painel que abria dentro da ficha, cercado do resto do conteúdo; agora
// abre sobre a tela escurecida, com o foco preso dentro dela. É a mesma
// pergunta, num lugar onde não há mais nada para clicar por engano.
//
// ⚠️ E O BOTÃO É VERMELHO, o que ele não era. Vermelho no painel significa
// uma coisa só — "esta ação desfaz alguma coisa" —, e são exatamente dois
// lugares: este e o Sair do casco. O botão que ABRE a pergunta é vermelho
// de contorno; o que CONFIRMA é vermelho cheio. A escala de peso segue a
// escala de consequência.
//
// ⚠️ E ELA É CONFERIDA NO SERVIDOR TAMBÉM. Uma confirmação só aqui é um
// `if` que qualquer requisição direta pula.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export default function CancelarInscricao({ inscricaoId, nome, temAssinatura }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(null)

  async function cancelar(event) {
    event.preventDefault()
    if (enviando) return

    setEnviando(true)
    setErro(null)

    try {
      const corpo = new FormData()
      corpo.set('_acao', 'cancelar')
      corpo.set('inscricao_id', inscricaoId)
      corpo.set('confirmacao', confirmacao)

      const res = await fetch('/api/admin/inscricoes', { method: 'POST', body: corpo })
      const body = await res.json().catch(() => null)

      if (body?.ok) {
        setAberto(false)
        setConfirmacao('')
        router.refresh()
      } else {
        setErro(body?.message ?? 'Não conseguimos cancelar.')
      }
    } catch {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  // `useCallback` porque a modal recebe esta função como `aoFechar` e a
  // usa dentro de um `useEffect` com dependência: uma função nova a cada
  // render remontaria o listener de Escape a cada tecla digitada.
  const fechar = useCallback(() => {
    setAberto(false)
    setConfirmacao('')
    setErro(null)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-red-200 px-4 py-2 font-sans text-[14px]
                   font-medium text-red-600
                   [transition:background-color_var(--motion-fast)_var(--ease-out),border-color_var(--motion-fast)_var(--ease-out)]
                   hover:border-red-300 hover:bg-red-50"
      >
        Cancelar inscrição
      </button>

      {aberto && (
        <ModalConfirmacao titulo={`Cancelar a inscrição de ${nome}?`} aoFechar={fechar}>
          <form onSubmit={cancelar}>
            <p className="mt-2 font-sans text-[14px] leading-[22px] text-[#345372]">
              {/* ⚠️ A frase diz o que ACONTECE, e não o que a gente gostaria
                  que acontecesse. `cancel_at_period_end`: as cobranças
                  param, e ela não perde o mês que já pagou. Cancelar não
                  pode significar "tomar de volta" — e o sistema não faz
                  reembolso. */}
              {temAssinatura
                ? 'As cobranças param no fim do mês já pago. Ela não perde o que já pagou, e não há novo débito.'
                : 'Esta inscrição não tem pagamento ativo — nada será cobrado nem estornado.'}
            </p>

            <label
              htmlFor="confirmacao"
              className="mt-4 block font-display text-[14px] font-semibold text-ink"
            >
              Digite <span className="text-brand">{nome}</span> para confirmar
            </label>
            <input
              id="confirmacao"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
              disabled={enviando}
              className="mt-2 h-[52px] w-full rounded-2xl border border-border-soft bg-white px-4
                         font-sans text-[15px] text-ink shadow-soft focus-visible:border-brand"
            />

            {erro && (
              <p role="alert" className="mt-3 font-sans text-[14px] text-ink">
                {erro}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={enviando || confirmacao.trim() === ''}
                className="rounded-full bg-red-600 px-4 py-2 font-sans text-[14px] font-semibold
                           text-white
                           [transition:background-color_var(--motion-fast)_var(--ease-out)]
                           hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando ? 'Cancelando…' : 'Sim, cancelar a inscrição'}
              </button>

              <button
                type="button"
                onClick={fechar}
                disabled={enviando}
                className="rounded-full border border-border-soft px-4 py-2 font-sans text-[14px]
                           font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                Voltar
              </button>
            </div>
          </form>
        </ModalConfirmacao>
      )}
    </>
  )
}
