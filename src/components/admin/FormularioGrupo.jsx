'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { OPCOES_DIA_SEMANA } from '@/config/dominio'

// ============================================================
// CRIAR HORÁRIO (`c68`)
//
// ⚠️ NENHUM CAMPO DE DATA, VALOR OU DURAÇÃO, e não é omissão: a D-01
// PROÍBE. Grupo é logística de agenda — quem tem calendário e preço é a
// turma. Um campo de preço por horário triplicaria o modelo para
// representar uma diferença que não existe.
//
// ⚠️ Os dias vêm de `dominio.ts`, o MESMO módulo que a modal usa para
// desenhar as caixinhas de disponibilidade. Uma lista à mão aqui seria
// mais uma cópia dos mesmos cinco valores.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

const CAMPO =
  'h-[52px] w-full rounded-2xl border border-border-soft bg-white px-4 ' +
  'font-sans text-[15px] text-ink placeholder:text-muted shadow-soft ' +
  'focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60'

export default function FormularioGrupo({ safraId }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    if (enviando) return

    // Capturado antes do primeiro `await`: o navegador zera
    // `event.currentTarget` quando o despacho termina.
    const form = event.currentTarget
    setEnviando(true)
    setAviso(null)

    try {
      const res = await fetch('/api/admin/grupos', { method: 'POST', body: new FormData(form) })
      const body = await res.json().catch(() => null)

      setAviso({ tom: body?.ok ? 'bom' : 'ruim', texto: body?.message ?? 'Falha ao salvar.' })
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
      <input type="hidden" name="safra_id" value={safraId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="dia_semana" className="font-display text-[14px] font-semibold text-ink">
            Dia
          </label>
          <select id="dia_semana" name="dia_semana" required disabled={enviando} className={`${CAMPO} cursor-pointer`}>
            {OPCOES_DIA_SEMANA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="horario" className="font-display text-[14px] font-semibold text-ink">
            Horário
          </label>
          {/* Texto livre de propósito: "19h", "19:00", "19h às 20h30". A
              forma como você escreve é a forma como a aluna lê. */}
          <input
            id="horario"
            name="horario"
            type="text"
            required
            maxLength={40}
            placeholder="19h"
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="capacidade" className="font-display text-[14px] font-semibold text-ink">
            Capacidade
          </label>
          {/* ⚠️ Vaga é limite MOLE (D-08): o estouro é mostrado no kanban,
              e não impedido. Em branco = sem limite. */}
          <input
            id="capacidade"
            name="capacidade"
            type="number"
            min="1"
            step="1"
            placeholder="sem limite"
            disabled={enviando}
            className={CAMPO}
          />
        </div>
      </div>

      {aviso && (
        <p
          role="alert"
          className={`mt-4 rounded-2xl px-4 py-3 font-sans text-[14px] ${
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
        {enviando ? 'Criando…' : 'Criar horário'}
      </button>
    </form>
  )
}
