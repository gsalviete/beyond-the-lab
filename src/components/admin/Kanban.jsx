'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ROTULO_DIA_SEMANA } from '@/config/dominio'

// ============================================================
// O KANBAN DE ALOCAÇÃO (`c71`)
//
// ⚠️⚠️ ARRASTAR AQUI NÃO MOVE DINHEIRO — D-03, e é a decisão que torna
// esta tela segura de usar. A aluna já pagou antes de ser alocada; a
// alocação é logística de agenda. A Giovanna pode reorganizar a semana
// inteira sem medo, e nenhuma chamada ao Stripe sai daqui.
//
// ⚠️ O ARRASTAR NÃO É O ÚNICO JEITO, E ISSO NÃO É REDUNDÂNCIA.
//
// A API de drag and drop do HTML5 **não funciona em toque** — nenhum
// evento de `drag` dispara num celular ou tablet. Uma tela só de arrastar
// seria uma tela que não funciona no aparelho em que a Giovanna mais
// provavelmente vai abri-la, e a falha seria silenciosa: ela arrasta, nada
// acontece, e não há mensagem nenhuma explicando.
//
// Por isso cada aluna tem um `<select>` de horário ao lado. Ele não é
// fallback — é o caminho principal no toque e o acessível por teclado. O
// arrastar é o atalho de quem está no computador.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export default function Kanban({ grupos, alunas }) {
  const router = useRouter()
  const [movendo, setMovendo] = useState(null)
  const [erro, setErro] = useState(null)
  const [sobre, setSobre] = useState(null)

  async function mover(inscricaoId, grupoId) {
    setMovendo(inscricaoId)
    setErro(null)

    try {
      const corpo = new FormData()
      corpo.set('inscricao_id', inscricaoId)
      corpo.set('grupo_id', grupoId ?? '')

      const res = await fetch('/api/admin/inscricoes', { method: 'POST', body: corpo })
      const body = await res.json().catch(() => null)

      if (body?.ok) router.refresh()
      else setErro(body?.message ?? 'Não conseguimos mover.')
    } catch {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setMovendo(null)
    }
  }

  // A coluna `null` vem primeiro: quem ainda não tem horário é o trabalho
  // pendente da tela, e trabalho pendente não fica no fim da lista.
  const colunas = [{ id: null, titulo: 'Sem horário' }, ...grupos.map((g) => ({
    id: g.id,
    titulo: `${ROTULO_DIA_SEMANA[g.dia_semana] ?? g.dia_semana} · ${g.horario}`,
    capacidade: g.capacidade,
    ativo: g.ativo,
  }))]

  return (
    <>
      {erro && (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-border-soft bg-white px-5 py-4 font-sans
                     text-[14px] leading-[22px] text-ink shadow-soft"
        >
          {erro}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {colunas.map((coluna) => {
          const naColuna = alunas.filter((a) => (a.grupo_id ?? null) === coluna.id)
          const estourou = coluna.capacidade != null && naColuna.length > coluna.capacidade

          return (
            <section
              key={coluna.id ?? 'sem-horario'}
              onDragOver={(e) => {
                // `preventDefault` é o que TORNA a coluna um destino
                // válido: sem ele o navegador recusa o drop e o arrastar
                // não faz nada, sem erro nenhum.
                e.preventDefault()
                setSobre(coluna.id ?? 'sem-horario')
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => {
                e.preventDefault()
                setSobre(null)
                const id = e.dataTransfer.getData('text/plain')
                if (id) mover(id, coluna.id)
              }}
              className={`rounded-2xl border bg-white p-4 shadow-soft ${
                sobre === (coluna.id ?? 'sem-horario') ? 'border-brand' : 'border-border-soft'
              }`}
            >
              <h3 className="font-display text-[15px] font-semibold text-ink">{coluna.titulo}</h3>

              <p className="mt-1 font-sans text-[13px] text-muted">
                {naColuna.length}
                {coluna.capacidade != null ? ` de ${coluna.capacidade}` : ''}
                {coluna.ativo === false ? ' · desligado' : ''}
              </p>

              {/* ⚠️ VAGA É LIMITE MOLE (D-08): o estouro é MOSTRADO, e não
                  impedido. "O painel mostra o estouro em vermelho e a
                  Giovanna resolve com uma conversa" — bloquear aqui seria
                  inventar uma trava que a decisão recusou. */}
              {estourou && (
                <p className="mt-1 font-sans text-[13px] font-semibold text-brand">
                  Acima da capacidade
                </p>
              )}

              <ul className="mt-3 flex flex-col gap-2">
                {naColuna.map((a) => (
                  <li
                    key={a.inscricao_id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', a.inscricao_id)}
                    className={`rounded-xl border border-border-soft px-3 py-2 ${
                      movendo === a.inscricao_id ? 'opacity-50' : ''
                    }`}
                  >
                    <p className="font-sans text-[14px] font-medium text-ink">{a.nome}</p>

                    {/* O caminho que funciona no toque e no teclado. */}
                    <label className="sr-only" htmlFor={`h-${a.inscricao_id}`}>
                      Horário de {a.nome}
                    </label>
                    <select
                      id={`h-${a.inscricao_id}`}
                      value={a.grupo_id ?? ''}
                      disabled={movendo === a.inscricao_id}
                      onChange={(e) => mover(a.inscricao_id, e.target.value || null)}
                      className="mt-1 w-full cursor-pointer rounded-lg border border-border-soft
                                 bg-white px-2 py-1 font-sans text-[13px] text-ink"
                    >
                      <option value="">Sem horário</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={g.id}>
                          {ROTULO_DIA_SEMANA[g.dia_semana] ?? g.dia_semana} · {g.horario}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}

                {naColuna.length === 0 && (
                  <li className="font-sans text-[13px] text-muted">Ninguém aqui.</li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
