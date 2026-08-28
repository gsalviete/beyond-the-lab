import Link from 'next/link'
import ControlesDaLista from '@/components/admin/ControlesDaLista.jsx'
import EtiquetaStatus from '@/components/admin/EtiquetaStatus.jsx'
import { hrefAlunas } from '@/components/admin/hrefAlunas.js'
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

/**
 * Quantas linhas a lista mostra quando ninguém escolheu.
 *
 * ⚠️ NÃO É "TODAS", e a diferença importa quando a lista crescer: uma
 * página que desenha centenas de cartões demora a pintar no celular e
 * enterra o que se procurava. O total continua na tela ao lado do
 * seletor, então o corte nunca é silencioso — "Mostrando 25 de 137" é a
 * frase que impede alguém de concluir que só existem 25.
 */
const POR_PAGINA_PADRAO = 25

/**
 * Lê o `?por=` da URL.
 *
 * ⚠️ QUALQUER LIXO CAI NO PADRÃO. O parâmetro é digitável na barra de
 * endereço, e `?por=-1` ou `?por=abc` não podem virar uma lista vazia que
 * lê como "não tem ninguém". Só 'todas' e um inteiro positivo mudam o
 * corte; o resto é tratado como se ninguém tivesse escolhido.
 */
function lerPorPagina(por) {
  if (por === 'todas') return null
  const n = Number(por)
  return Number.isInteger(n) && n > 0 ? n : POR_PAGINA_PADRAO
}

export default async function Page({ searchParams }) {
  const { turma, status, por } = await searchParams

  const [safras, alunas] = await Promise.all([
    listarSafrasCompletas(),
    listarAlunas({ safraId: turma ?? null, status: status ?? null }),
  ])

  // ⚠️ O CORTE É AQUI, DEPOIS DA CONSULTA, e é uma escolha consciente. Um
  // `range()` no Supabase economizaria transporte, mas a tela precisa do
  // TOTAL para dizer "de quantas" — e um `count` separado é uma segunda
  // ida ao banco para responder o que a primeira já sabe. São dezenas de
  // linhas na vida inteira do produto (a mesma ordem de grandeza que fez
  // `contarComContrato` ser uma consulta por turma). Se um dia forem
  // milhares, o lugar de paginar de verdade é dentro de `listarAlunas`.
  const porPagina = lerPorPagina(por)
  const visiveis = porPagina === null ? alunas : alunas.slice(0, porPagina)
  const filtrosAtuais = { turma: turma ?? null, status: status ?? null, por: por ?? null }

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Alunas
      </h1>

      {/* ⚠️ Filtros por LINK, e não por formulário com JavaScript: cada
          combinação vira uma URL, que entra no histórico e pode ser
          compartilhada — "me manda a lista das inadimplentes" deixa de
          exigir explicação. Vale para as pills daqui E para os controles
          abaixo, que também só empurram uma URL. */}
      <div className="mt-5 flex flex-col gap-4">
        <Filtro
          titulo="Turma"
          atual={turma}
          opcoes={[
            { valor: null, rotulo: 'Todas' },
            ...safras.map((s) => ({ valor: s.id, rotulo: s.nome })),
          ]}
          montarHref={(v) => hrefAlunas(filtrosAtuais, { turma: v })}
        />

        {/* ⚠️ A SITUAÇÃO SAIU DAS PILLS, e as turmas ficaram. Não é
            inconsistência: turma são três ou quatro opções que a Giovanna
            reconhece pelo nome e troca o tempo todo — pill é o controle
            certo para isso, um toque e pronto. Situação são sete rótulos
            longos que enchiam duas linhas e empurravam a lista para fora
            da tela. O porquê da caixa de digitar está em
            `src/components/admin/ControlesDaLista.jsx`. */}
        <ControlesDaLista
          rotulosDeStatus={ROTULO_STATUS}
          filtrosAtuais={filtrosAtuais}
          porPagina={porPagina}
          total={alunas.length}
          mostrando={visiveis.length}
        />
      </div>

      {alunas.length === 0 ? (
        <p className="mt-6 font-sans text-[15px] text-muted">Ninguém com esses filtros.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {visiveis.map((a) => (
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

                <span className="flex flex-wrap items-center gap-2">
                  <EtiquetaStatus status={a.status}>
                    {ROTULO_STATUS[a.status] ?? a.status}
                  </EtiquetaStatus>
                  {a.safra_nome && (
                    <span className="font-sans text-[13px] text-[#345372]">{a.safra_nome}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Filtro({ titulo, atual, opcoes, montarHref }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[13px] font-semibold text-muted">{titulo}:</span>
      {opcoes.map((o) => (
        <Link
          key={o.valor ?? 'todas'}
          href={montarHref(o.valor)}
          aria-current={(atual ?? null) === o.valor ? 'true' : undefined}
          /* ⚠️ A PILL ESCOLHIDA É PREENCHIDA, não só contornada de rosa. A
             borda sozinha some numa fila de pills — quem passa o olho vê
             cinco caixas iguais e tem que procurar qual está diferente. O
             preenchimento responde "qual está valendo" antes da leitura. */
          className={`rounded-full border px-3 py-1.5 font-sans text-[13px]
                      [transition:background-color_var(--motion-fast)_var(--ease-out),border-color_var(--motion-fast)_var(--ease-out)] ${
                        (atual ?? null) === o.valor
                          ? 'border-brand bg-brand font-semibold text-white shadow-pill'
                          : 'border-border-soft text-ink/80 hover:border-brand hover:text-brand'
                      }`}
        >
          {o.rotulo}
        </Link>
      ))}
    </div>
  )
}
