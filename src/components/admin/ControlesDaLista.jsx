'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { ChevronBaixo } from './Icones.jsx'
import { hrefAlunas } from './hrefAlunas.js'

// ============================================================
// OS CONTROLES DA LISTA DE ALUNAS — situação e quantas aparecem
//
// ⚠️ ELES CONTINUAM SENDO URL. Cada escolha aqui vira `?turma=&status=&por=`
// e é isso que preserva a decisão original do `c69`: "cada combinação vira
// uma URL, que entra no histórico e pode ser compartilhada — 'me manda a
// lista das inadimplentes' deixa de exigir explicação". O que este arquivo
// troca é o CONTROLE (de fila de links para caixa de escolha), não o
// mecanismo. Voltar continua desfazendo o filtro.
//
// ⚠️ POR QUE A SITUAÇÃO É COMBOBOX E NÃO UM `<select>` PURO
//
// O pedido foi "dropdown + opção de digitar". Digitar aqui NÃO pode
// significar filtrar por um valor livre: `status` é uma coluna com CHECK,
// e um texto qualquer devolveria uma lista vazia sem explicar por quê — o
// pior resultado possível numa tela cuja pergunta é "quem está nesta
// situação?". O `<datalist>` resolve os dois: a seta abre a lista fechada,
// e digitar FILTRA essa lista em vez de inventar valor. O que não casa com
// nenhuma situação conhecida não vira consulta; vira um aviso na tela.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. O campo é o mesmo `CAMPO` dos
// formulários do painel, com a altura reduzida ao passo que os filtros já
// usavam.
// ============================================================

const CAMPO =
  'h-[44px] w-full rounded-2xl border border-border-soft bg-white px-4 ' +
  'font-sans text-[14px] text-ink placeholder:text-muted shadow-soft ' +
  'focus-visible:border-brand'

/** O texto digitado é exatamente o rótulo de alguma situação? */
function casaComAlguma(rotulos, texto) {
  const limpo = texto.trim().toLowerCase()
  return Object.values(rotulos).some((rotulo) => rotulo.toLowerCase() === limpo)
}

/** As opções de quantas linhas mostrar. `null` = todas. */
const TAMANHOS = [10, 25, 50, 100]

export default function ControlesDaLista({
  rotulosDeStatus,
  filtrosAtuais,
  porPagina,
  total,
  mostrando,
}) {
  const statusAtual = filtrosAtuais.status ?? null
  const router = useRouter()
  const idSituacao = useId()
  const idLista = useId()
  const idTamanho = useId()

  // O texto que está na caixa. Começa com o rótulo do filtro em vigor —
  // quem chega por um link compartilhado vê a situação escrita, não a
  // caixa vazia.
  const [texto, setTexto] = useState(statusAtual ? (rotulosDeStatus[statusAtual] ?? '') : '')
  const [naoEncontrado, setNaoEncontrado] = useState(false)

  function aplicarSituacao(valorDigitado) {
    const limpo = valorDigitado.trim()

    if (limpo === '' || limpo.toLowerCase() === 'todas') {
      setNaoEncontrado(false)
      router.push(hrefAlunas(filtrosAtuais, { status: null }))
      return
    }

    const achado = Object.entries(rotulosDeStatus).find(
      ([, rotulo]) => rotulo.toLowerCase() === limpo.toLowerCase(),
    )

    if (!achado) {
      // ⚠️ NÃO NAVEGA. Uma consulta por texto que não é situação nenhuma
      // devolveria zero linhas, e zero linhas aqui lê como "não tem
      // ninguém nessa situação" — uma resposta errada a uma pergunta que
      // não foi feita.
      setNaoEncontrado(true)
      return
    }

    setNaoEncontrado(false)
    router.push(hrefAlunas(filtrosAtuais, { status: achado[0] }))
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex w-full flex-col gap-2 sm:max-w-[320px]">
        <label htmlFor={idSituacao} className="font-display text-[13px] font-semibold text-muted">
          Situação
        </label>

        <div className="relative">
          <input
            id={idSituacao}
            list={idLista}
            value={texto}
            placeholder="Todas"
            autoComplete="off"
            onChange={(e) => {
              const valor = e.target.value
              setTexto(valor)
              setNaoEncontrado(false)
              // ⚠️ Escolher da lista com o mouse não dispara Enter nem
              // blur, então o filtro precisa valer assim que o texto CASA
              // com uma situação conhecida — é o mesmo instante em que a
              // escolha do mouse chega aqui. Casar por igualdade e não pelo
              // tipo do evento: o `inputType` de uma escolha de `<datalist>`
              // muda de navegador para navegador, e o texto não.
              //
              // Apagar tudo NÃO limpa o filtro na hora: quem está no meio
              // de trocar de situação apaga antes de digitar, e recarregar
              // a lista inteira no meio da palavra é um piscar por letra.
              // O campo vazio vale no Enter ou ao sair dele.
              if (valor.trim() !== '' && casaComAlguma(rotulosDeStatus, valor)) {
                aplicarSituacao(valor)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                aplicarSituacao(e.currentTarget.value)
              }
            }}
            onBlur={(e) => aplicarSituacao(e.currentTarget.value)}
            className={`${CAMPO} pr-11`}
          />
          <ChevronBaixo className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

          <datalist id={idLista}>
            <option value="Todas" />
            {Object.entries(rotulosDeStatus).map(([valor, rotulo]) => (
              <option key={valor} value={rotulo} />
            ))}
          </datalist>
        </div>

        {naoEncontrado && (
          <p role="alert" className="font-sans text-[13px] leading-[20px] text-brand">
            Não existe uma situação com esse nome. Abra a lista e escolha uma, ou apague para ver
            todas.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={idTamanho} className="font-display text-[13px] font-semibold text-muted">
          Quantas mostrar
        </label>

        <div className="relative">
          <select
            id={idTamanho}
            value={porPagina === null ? 'todas' : String(porPagina)}
            onChange={(e) =>
              router.push(
                hrefAlunas(filtrosAtuais, { por: e.target.value === 'todas' ? null : e.target.value }),
              )
            }
            className={`${CAMPO} cursor-pointer appearance-none pr-11`}
          >
            {TAMANHOS.map((n) => (
              <option key={n} value={n}>
                {n} pessoas
              </option>
            ))}
            <option value="todas">Todas ({total})</option>
          </select>
          <ChevronBaixo className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>

        <p className="font-sans text-[13px] leading-[20px] text-muted">
          Mostrando {mostrando} de {total} {total === 1 ? 'pessoa' : 'pessoas'}
        </p>
      </div>
    </div>
  )
}
