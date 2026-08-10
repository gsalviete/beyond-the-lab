import BotaoEnviarLink from '@/components/admin/BotaoEnviarLink.jsx'
import { listarPendentes } from '@/lib/supabase'

// ============================================================
// PAGAMENTOS QUE EXIGEM AÇÃO (`c75`) — a fila da D-15
//
// ⚠️ ESTA TELA EXISTE PORQUE `pendente_pagamento` É UM BECO SEM SAÍDA PARA
// QUEM ESTÁ DENTRO DELE. A pessoa não sabe que está pendente — ninguém
// contou —, e refazer o formulário devolve "você já está inscrita". Sem
// ela, a única saída seria a Giovanna abrir o Supabase Studio, o que a
// D-07 proíbe.
//
// ⚠️ E O TEMPO PARADO É OBRIGATÓRIO, não decoração: a D-15 manda mostrar
// "há quanto tempo cada uma está parada". É a diferença entre "abandonou o
// checkout agora e talvez volte sozinha" e "está esperando há três
// semanas" — duas situações que pedem ações diferentes.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function Page() {
  const pendentes = await listarPendentes()
  const agora = Date.now()

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Pagamentos pendentes
      </h1>

      <p className="mt-3 max-w-[640px] font-sans text-[15px] leading-[24px] text-[#345372]">
        Estas pessoas começaram o pagamento e não terminaram. Elas não conseguem resolver
        sozinhas — o formulário responde que já estão inscritas. Mandar o link é o que destrava.
      </p>

      {pendentes.length === 0 ? (
        <p className="mt-8 font-sans text-[15px] text-muted">
          Ninguém pendente agora.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {pendentes.map((p) => {
            const conviteVivo = p.token_expira_em !== null && new Date(p.token_expira_em) > new Date()

            return (
              <li
                key={p.inscricao_id}
                className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white px-5
                           py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-display text-[17px] font-semibold text-ink">{p.nome}</p>
                  <p className="mt-1 font-sans text-[14px] leading-[22px] text-[#345372]">
                    {p.email} · {p.telefone}
                  </p>
                  <p className="mt-1 font-sans text-[13px] leading-[20px] text-muted">
                    {/* A frase é sobre a INSCRIÇÃO, não sobre a pessoa: quem
                        esteve na lista de espera por meses e abriu o
                        checkout ontem está parada há um dia. */}
                    Parada há {tempoParado(p.criada_em, agora)}
                    {p.safra_nome ? ` · ${p.safra_nome}` : ''}
                    {conviteVivo ? ' · já recebeu um link' : ''}
                  </p>
                </div>

                <BotaoEnviarLink pessoaId={p.pessoa_id} nome={p.nome} jaTemConvite={conviteVivo} />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/**
 * "3 dias", "2 horas", "agora há pouco".
 *
 * ⚠️ ESCRITA À MÃO, sem lib e sem `Intl.RelativeTimeFormat`. O `Intl`
 * resolveria — e traria a decisão de qual unidade escolher junto, que é
 * justamente o que importa aqui: a Giovanna precisa distinguir HORAS de
 * DIAS, porque abaixo de um dia a pessoa provavelmente ainda está
 * decidindo, e acima de uma semana ela esqueceu. Três faixas explícitas
 * dizem isso melhor do que uma formatação genérica.
 *
 * ⚠️ `criada_em` é `timestamptz`, então o instante é absoluto e a conta
 * não depende de fuso. É o oposto de `data_inicio_aulas`, que é `date` e
 * precisa de `paraDataUTC` — ver o comentário lá.
 */
function tempoParado(iso, agora) {
  const minutos = Math.floor((agora - new Date(iso).getTime()) / 60000)

  if (minutos < 60) return 'menos de uma hora'
  if (minutos < 60 * 24) {
    const horas = Math.floor(minutos / 60)
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`
  }

  const dias = Math.floor(minutos / (60 * 24))
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`
}
