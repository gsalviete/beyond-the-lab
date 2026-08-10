'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// ============================================================
// CRIAR TURMA (`c65`)
//
// ⚠️ "TURMA" NA TELA, "SAFRA" NO BANCO. Não é inconsistência: o schema
// chama de safra porque uma safra tem calendário e preço, e o grupo é só
// um horário dentro dela (D-01). A Giovanna chama de turma, e pela D-07 o
// painel é a única ferramenta dela — se ela precisar aprender o
// vocabulário do schema para operar, a ferramenta falhou. A tradução mora
// na borda.
//
// ⚠️ A TURMA NASCE FECHADA, e por isso não há checkbox de "abrir
// inscrições" aqui. Criar e publicar são decisões diferentes: um checkbox
// faria uma turma recém-cadastrada, com o preço ainda errado, sair vendendo
// no mesmo clique.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

const CAMPO =
  'h-[52px] w-full rounded-2xl border border-border-soft bg-white px-4 ' +
  'font-sans text-[15px] text-ink placeholder:text-muted shadow-soft ' +
  'focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60'

const ROTULO = 'font-display text-[14px] font-semibold text-ink'

export default function FormularioSafra() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    if (enviando) return

    // O formulário é capturado antes do primeiro `await`: o navegador zera
    // `event.currentTarget` quando o despacho do evento termina, e o
    // `.reset()` estouraria no caminho de SUCESSO.
    const form = event.currentTarget

    setEnviando(true)
    setAviso(null)

    try {
      const res = await fetch('/api/admin/safras', { method: 'POST', body: new FormData(form) })
      const body = await res.json().catch(() => null)

      setAviso({
        tom: body?.ok ? 'bom' : 'ruim',
        texto: body?.message ?? 'Não conseguimos falar com o servidor.',
      })

      if (body?.ok) {
        form.reset()
        router.refresh()
      }
    } catch {
      setAviso({ tom: 'ruim', texto: 'Falha de conexão. Tente de novo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border-soft bg-white p-5 shadow-soft"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="nome" className={ROTULO}>
            Nome da turma
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            minLength={2}
            maxLength={80}
            placeholder="Setembro 2026"
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="data_inicio_aulas" className={ROTULO}>
            Começo das aulas
          </label>
          <input
            id="data_inicio_aulas"
            name="data_inicio_aulas"
            type="date"
            required
            disabled={enviando}
            className={CAMPO}
          />
          {/* ⚠️ O site NUNCA imprime esta data seca (D-14): ele diz "na
              primeira semana de setembro", derivado daqui. Cada grupo
              começa num dia diferente da mesma semana (D-01), e a data
              exata seria uma promessa que o produto não faz. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            O site mostra só a semana — “na primeira semana de setembro”, nunca o dia exato.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="data_primeira_cobranca" className={ROTULO}>
            Primeira cobrança
          </label>
          <input
            id="data_primeira_cobranca"
            name="data_primeira_cobranca"
            type="date"
            required
            disabled={enviando}
            className={CAMPO}
          />
          {/* Esta sai seca de propósito: cobrança tem dia exato — o cartão
              é debitado no dia 25, não "na última semana". É o oposto da
              data de início. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            O cartão é salvo na inscrição e só debitado nesta data.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="valor_mensal" className={ROTULO}>
            Mensalidade (R$)
          </label>
          <input
            id="valor_mensal"
            name="valor_mensal"
            type="number"
            min="1"
            step="0.01"
            required
            placeholder="299.99"
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="duracao_meses" className={ROTULO}>
            Duração (meses)
          </label>
          <input
            id="duracao_meses"
            name="duracao_meses"
            type="number"
            min="1"
            step="1"
            required
            placeholder="6"
            disabled={enviando}
            className={CAMPO}
          />
          {/* A assinatura morre sozinha no último mês (D-05): o `cancel_at`
              é declarado na criação e o Stripe cumpre. Não há job nosso
              encerrando nada. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            A cobrança para sozinha depois deste número de meses.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="vagas_total" className={ROTULO}>
            Limite de vagas
          </label>
          <input
            id="vagas_total"
            name="vagas_total"
            type="number"
            min="1"
            step="1"
            placeholder="sem limite"
            disabled={enviando}
            className={CAMPO}
          />
          {/* ⚠️ Vazio = SEM LIMITE (D-08), e é o caso normal aqui: você
              respondeu que não precisa de número fixo de vagas. Com limite,
              quem chegar depois de esgotar entra na lista de espera — não
              vê tela de erro. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            Em branco = sem limite. Com limite, quem chegar depois entra na lista de espera.
          </p>
        </div>
      </div>

      {aviso && (
        <p
          role="alert"
          className={`mt-4 rounded-2xl px-4 py-3 font-sans text-[14px] leading-[22px] ${
            aviso.tom === 'bom' ? 'bg-rose-100 text-ink' : 'border border-border-soft text-ink'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="btn-brand mt-5 w-full text-[16px] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {enviando ? 'Criando…' : 'Criar turma'}
      </button>

      <p className="mt-3 font-sans text-[13px] leading-[20px] text-muted">
        A turma nasce com as inscrições fechadas. Você abre quando quiser, na lista abaixo.
      </p>
    </form>
  )
}
