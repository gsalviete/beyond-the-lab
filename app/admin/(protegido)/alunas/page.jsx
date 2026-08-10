import Link from 'next/link'
import { listarAlunas, listarSafrasCompletas } from '@/lib/supabase'

// ============================================================
// A LISTA DE ALUNAS (`c69`)
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * ⚠️ OS RÓTULOS NÃO SÃO OS NOMES DO BANCO, e a tradução é deliberada.
 *
 * `confirmada` significa "cartão salvo, cobrança agendada, ninguém pagou
 * ainda" — e a palavra sozinha sugere o contrário. Pela D-07 o painel é a
 * única ferramenta da Giovanna; se ela precisar aprender o vocabulário do
 * schema para lê-lo, a ferramenta falhou. A tradução mora aqui, na borda,
 * e o banco continua falando o idioma dele.
 */
const ROTULO_STATUS = {
  lista_espera: 'Lista de espera',
  pendente_pagamento: 'Pagamento pendente',
  confirmada: 'Cartão salvo',
  ativa: 'Pagando',
  inadimplente: 'Inadimplente',
  concluida: 'Concluiu',
  cancelada: 'Cancelada',
}

export default async function Page({ searchParams }) {
  const { turma, status } = await searchParams

  const [safras, alunas] = await Promise.all([
    listarSafrasCompletas(),
    listarAlunas({ safraId: turma ?? null, status: status ?? null }),
  ])

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Alunas
      </h1>

      {/* ⚠️ Filtros por LINK, e não por formulário com JavaScript: cada
          combinação vira uma URL, que entra no histórico e pode ser
          compartilhada — "me manda a lista das inadimplentes" deixa de
          exigir explicação. */}
      <div className="mt-5 flex flex-col gap-3">
        <Filtro
          titulo="Turma"
          atual={turma}
          opcoes={[
            { valor: null, rotulo: 'Todas' },
            ...safras.map((s) => ({ valor: s.id, rotulo: s.nome })),
          ]}
          montarHref={(v) => hrefCom({ turma: v, status })}
        />

        <Filtro
          titulo="Situação"
          atual={status}
          opcoes={[
            { valor: null, rotulo: 'Todas' },
            ...Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => ({ valor, rotulo })),
          ]}
          montarHref={(v) => hrefCom({ turma, status: v })}
        />
      </div>

      <p className="mt-6 font-sans text-[14px] text-muted">
        {alunas.length} {alunas.length === 1 ? 'pessoa' : 'pessoas'}
      </p>

      {alunas.length === 0 ? (
        <p className="mt-3 font-sans text-[15px] text-muted">Ninguém com esses filtros.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {alunas.map((a) => (
            <li key={a.inscricao_id}>
              <Link
                href={`/admin/alunas/${a.inscricao_id}`}
                className="flex flex-col gap-1 rounded-2xl border border-border-soft bg-white px-5
                           py-4 shadow-soft [transition:border-color_var(--motion-fast)_var(--ease-out)]
                           hover:border-brand sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="block font-display text-[16px] font-semibold text-ink">
                    {a.nome}
                  </span>
                  <span className="block font-sans text-[13px] text-muted">{a.email}</span>
                </span>

                <span className="font-sans text-[13px] text-[#345372]">
                  {ROTULO_STATUS[a.status] ?? a.status}
                  {a.safra_nome ? ` · ${a.safra_nome}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function hrefCom({ turma, status }) {
  const p = new URLSearchParams()
  if (turma) p.set('turma', turma)
  if (status) p.set('status', status)
  const q = p.toString()
  return q ? `/admin/alunas?${q}` : '/admin/alunas'
}

function Filtro({ titulo, atual, opcoes, montarHref }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[13px] font-semibold text-muted">{titulo}:</span>
      {opcoes.map((o) => (
        <Link
          key={o.valor ?? 'todas'}
          href={montarHref(o.valor)}
          className={`rounded-full border px-3 py-1.5 font-sans text-[13px] ${
            (atual ?? null) === o.valor
              ? 'border-brand font-semibold text-brand'
              : 'border-border-soft text-ink/80'
          }`}
        >
          {o.rotulo}
        </Link>
      ))}
    </div>
  )
}
