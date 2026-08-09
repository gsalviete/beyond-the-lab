import Link from 'next/link'
import FormularioGrupo from '@/components/admin/FormularioGrupo.jsx'
import Kanban from '@/components/admin/Kanban.jsx'
import { ROTULO_DIA_SEMANA } from '@/config/dominio'
import { listarAlunas, listarGrupos, listarSafrasCompletas } from '@/lib/supabase'

// ============================================================
// HORÁRIOS E ALOCAÇÃO (`c68`, `c71`)
//
// ⚠️⚠️ NADA NESTA TELA MOVE DINHEIRO — D-03. "Arrastar uma aluna de
// segunda para quarta não dispara, cancela ou altera nada no Stripe." Ela
// já pagou antes de ser alocada, e separar as duas coisas é o que torna
// esta tela segura de usar.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * ⚠️ Só quem TEM contrato aparece no kanban.
 *
 * Alocar quem está em `pendente_pagamento` seria dar horário a quem talvez
 * nunca pague — e o trigger da `009` recusa grupo em inscrição de lista de
 * espera de qualquer forma. `cancelada` e `concluida` também ficam de
 * fora: não há semana para organizar com quem saiu.
 */
const ALOCAVEIS = ['confirmada', 'ativa', 'inadimplente']

export default async function Page({ searchParams }) {
  const { turma } = await searchParams
  const safras = await listarSafrasCompletas()

  // A turma padrão é a aberta; sem nenhuma aberta, a mais recente. É a
  // pergunta que ela quase sempre quer responder ao abrir esta tela.
  const safraAtual =
    safras.find((s) => s.id === turma) ?? safras.find((s) => s.inscricoes_abertas) ?? safras[0]

  if (!safraAtual) {
    return (
      <>
        <h1 className="font-display text-[26px] font-semibold text-[#022D57]">Horários</h1>
        <p className="mt-4 font-sans text-[15px] text-muted">
          Crie uma turma primeiro, em{' '}
          <Link href="/admin/safras" className="font-semibold text-brand underline underline-offset-2">
            Turmas
          </Link>
          .
        </p>
      </>
    )
  }

  const [grupos, todas] = await Promise.all([
    listarGrupos(safraAtual.id),
    listarAlunas({ safraId: safraAtual.id }),
  ])

  const alunas = todas.filter((a) => ALOCAVEIS.includes(a.status))

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Horários
      </h1>

      {/* Trocar de turma é um link e não um `<select>` com JavaScript: a
          navegação fica no histórico, e ela pode voltar. */}
      <nav className="mt-4 flex flex-wrap gap-3">
        {safras.map((s) => (
          <Link
            key={s.id}
            href={`/admin/alocacao?turma=${s.id}`}
            className={`rounded-full border px-4 py-2 font-sans text-[14px] ${
              s.id === safraAtual.id
                ? 'border-brand font-semibold text-brand'
                : 'border-border-soft text-ink/80'
            }`}
          >
            {s.nome}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        <FormularioGrupo safraId={safraAtual.id} />
      </div>

      {grupos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {grupos.map((g) => (
            <li key={g.id}>
              {/* Form HTML puro: ligar/desligar horário não pode depender
                  de bundle hidratado. */}
              <form action="/api/admin/grupos" method="post">
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="ativo" value={g.ativo ? 'false' : 'true'} />
                <input type="hidden" name="_method" value="PATCH" />
                <button
                  type="submit"
                  className="rounded-full border border-border-soft px-3 py-1.5 font-sans
                             text-[13px] text-ink hover:text-brand"
                >
                  {ROTULO_DIA_SEMANA[g.dia_semana] ?? g.dia_semana} · {g.horario} ·{' '}
                  {g.ativo ? 'desligar' : 'ligar'}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-display text-[20px] font-semibold text-ink">Quem vai em qual dia</h2>

      <p className="mt-2 max-w-[640px] font-sans text-[14px] leading-[22px] text-[#345372]">
        Arraste no computador, ou use a caixinha de horário — as duas fazem a mesma coisa.
        Mudar de horário não mexe em pagamento nenhum.
      </p>

      <div className="mt-4">
        <Kanban grupos={grupos} alunas={alunas} />
      </div>
    </>
  )
}
