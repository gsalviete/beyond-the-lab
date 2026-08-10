import FormularioSafra from '@/components/admin/FormularioSafra.jsx'
import { formatarSemanaDeInicio, formatarValorMensal } from '@/config/curso'
import { contarComContrato, listarSafrasCompletas } from '@/lib/supabase'

// ============================================================
// TURMAS (`c65`, `c66`, `c67`)
//
// ⚠️ "TURMA" NA TELA, "SAFRA" NO BANCO — ver o bloco em
// `src/components/admin/FormularioSafra.jsx`.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  const { erro } = await searchParams
  const safras = await listarSafrasCompletas()

  // ⚠️ A CONTAGEM DE CONTRATOS É O QUE A D-06 OBRIGA (`c66`): "o painel
  // avisa na cara da Giovanna, ao editar uma safra que já tem inscrição
  // paga, que a mudança só vale para quem vier depois". Uma consulta por
  // turma — são dezenas de linhas na vida inteira do produto, e o `head:
  // true` não traz nenhuma delas.
  const contratos = Object.fromEntries(
    await Promise.all(safras.map(async (s) => [s.id, await contarComContrato(s.id)])),
  )

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Turmas
      </h1>

      {/* ⚠️ O banco só deixa UMA turma aberta por vez —
          `safras_uma_aberta_idx`, índice único parcial da `005`. O sistema
          NÃO fecha a outra sozinho: fechar pode ter gente no meio do
          checkout, e é decisão dela. */}
      {erro === 'ja-aberta' && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-border-soft bg-white px-5 py-4 font-sans
                     text-[14px] leading-[22px] text-ink shadow-soft"
        >
          Já existe uma turma com inscrições abertas. Feche a outra primeiro — assim ninguém fica
          no meio de um pagamento sem turma.
        </p>
      )}

      <div className="mt-6">
        <FormularioSafra />
      </div>

      <h2 className="mt-10 font-display text-[20px] font-semibold text-ink">Criadas</h2>

      {safras.length === 0 ? (
        <p className="mt-3 font-sans text-[15px] text-muted">Nenhuma turma ainda.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {safras.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border border-border-soft bg-white px-5 py-4 shadow-soft"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-display text-[17px] font-semibold text-ink">
                    {s.nome}{' '}
                    {s.inscricoes_abertas && (
                      <span className="font-sans text-[13px] font-semibold text-brand">
                        · inscrições abertas
                      </span>
                    )}
                  </p>

                  <p className="mt-1 font-sans text-[14px] leading-[22px] text-[#345372]">
                    {formatarValorMensal(s.valor_mensal)}/mês por {s.duracao_meses}{' '}
                    {s.duracao_meses === 1 ? 'mês' : 'meses'}
                  </p>

                  <p className="mt-1 font-sans text-[13px] leading-[20px] text-muted">
                    {/* A mesma função que a landing e o e-mail usam — as três
                        superfícies não têm como divergir (D-14). */}
                    Aulas {formatarSemanaDeInicio(s.data_inicio_aulas)} · primeira cobrança em{' '}
                    {formatarData(s.data_primeira_cobranca)}
                    {s.vagas_total === null ? ' · sem limite de vagas' : ` · ${s.vagas_total} vagas`}
                  </p>

                  {/* ⚠️ O AVISO DA D-06, e ele só aparece quando há contrato
                      de verdade. Um aviso que aparece sempre é um aviso que
                      ninguém lê. */}
                  {contratos[s.id] > 0 && (
                    <p className="mt-2 max-w-[520px] font-sans text-[13px] leading-[20px] text-ink">
                      ⚠️ {contratos[s.id]}{' '}
                      {contratos[s.id] === 1 ? 'pessoa já tem' : 'pessoas já têm'} contrato nesta
                      turma. Mudar preço ou duração agora vale só para quem se inscrever depois —
                      quem já assinou continua pagando o que combinou.
                    </p>
                  )}
                </div>

                <BotaoInscricoes safra={s} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * ⚠️ Form HTML de verdade, sem `fetch`, pelo mesmo motivo do botão de
 * cupom: abrir e fechar inscrições é o controle mais urgente desta tela, e
 * ele não pode depender de um bundle ter hidratado.
 */
function BotaoInscricoes({ safra }) {
  return (
    <form action="/api/admin/safras" method="post" className="shrink-0">
      <input type="hidden" name="id" value={safra.id} />
      <input type="hidden" name="abertas" value={safra.inscricoes_abertas ? 'false' : 'true'} />
      <input type="hidden" name="_method" value="PATCH" />
      <button
        type="submit"
        className="rounded-full border border-border-soft px-4 py-2 font-sans text-[14px]
                   font-medium text-ink [transition:color_var(--motion-fast)_var(--ease-out)]
                   hover:text-brand"
      >
        {safra.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
      </button>
    </form>
  )
}

/** `2026-09-01` → `01/09/2026`. Coluna `date`: dia de calendário, sem fuso. */
function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
