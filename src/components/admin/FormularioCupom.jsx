'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// ============================================================
// CRIAR CUPOM (`c74`) — "em linguagem de gente", que é o que o plano pede
//
// ⚠️ O NOME TÉCNICO NÃO APARECE NA TELA. `primeiro_mes`, `todos_meses` e
// `meses_gratis` são valores de coluna; o que a Giovanna lê é o que o
// desconto FAZ. Pela D-07 o painel é a única ferramenta dela — se ela
// precisar aprender o vocabulário do schema para operar, a ferramenta
// falhou.
//
// ⚠️ E O RÓTULO DE `valor` MUDA COM O TIPO, porque a coluna significa
// coisas diferentes (`013`):
//   primeiro_mes → percentual · todos_meses → percentual ·
//   meses_gratis → CONTAGEM DE MESES.
// É a decisão mais fácil de errar do projeto inteiro, e a defesa aqui é a
// tela dizer "20 = 20%" ou "2 = 2 meses" na cara de quem digita.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. Todas as classes daqui já existiam:
// são as mesmas da modal de inscrição.
// ============================================================

const CAMPO =
  'h-[52px] w-full rounded-2xl border border-border-soft bg-white px-4 ' +
  'font-sans text-[15px] text-ink placeholder:text-muted shadow-soft ' +
  'focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-60'

const ROTULO = 'font-display text-[14px] font-semibold text-ink'

const TIPOS = [
  {
    valor: 'primeiro_mes',
    rotulo: 'Desconto só no primeiro mês',
    unidade: '%',
    ajuda: 'Digite a porcentagem. 20 = 20% de desconto na primeira mensalidade.',
  },
  {
    valor: 'todos_meses',
    rotulo: 'Desconto em todos os meses',
    unidade: '%',
    ajuda: 'Digite a porcentagem. 15 = 15% de desconto em todas as mensalidades do curso.',
  },
  {
    valor: 'meses_gratis',
    rotulo: 'Meses grátis',
    unidade: 'meses',
    ajuda: 'Digite quantos meses. 2 = os dois primeiros meses saem de graça.',
  },
]

export default function FormularioCupom({ safras }) {
  const router = useRouter()
  const [tipo, setTipo] = useState('primeiro_mes')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const escolhido = TIPOS.find((t) => t.valor === tipo)

  async function onSubmit(event) {
    event.preventDefault()
    if (enviando) return

    // ⚠️ O FORMULÁRIO É CAPTURADO ANTES DO PRIMEIRO `await`, e isto não é
    // estilo: o navegador zera `event.currentTarget` assim que o despacho
    // do evento termina. Depois de um `await`, ele é `null` — e o
    // `.reset()` lá embaixo estouraria com "Cannot read properties of
    // null" exatamente no caminho de SUCESSO, que é o menos testado à mão.
    const form = event.currentTarget

    setEnviando(true)
    setAviso(null)

    try {
      // FormData e não JSON: a rota lê `formData()`, e assim o formulário
      // continua sendo um formulário — os campos vão como estão na tela,
      // sem uma segunda montagem para divergir da primeira.
      const res = await fetch('/api/admin/cupons', {
        method: 'POST',
        body: new FormData(form),
      })
      const body = await res.json().catch(() => null)

      // ⚠️ `ok: true` COM AVISO É UM CASO REAL: o cupom foi criado e o
      // espelho no Stripe não subiu. Ele funciona — a primeira tentativa de
      // uso reespelha sozinha —, mas ela precisa saber que a linha está
      // "não publicada" em vez de descobrir por uma coluna vazia na tabela.
      setAviso({
        tom: body?.ok ? 'bom' : 'ruim',
        texto: body?.message ?? 'Não conseguimos falar com o servidor.',
      })

      if (body?.ok) {
        form.reset()
        setTipo('primeiro_mes')
        // Recarrega os dados do Server Component sem recarregar a página —
        // a lista abaixo passa a mostrar o cupom novo.
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
        <div className="flex flex-col gap-2">
          <label htmlFor="codigo" className={ROTULO}>
            Código
          </label>
          <input
            id="codigo"
            name="codigo"
            type="text"
            required
            maxLength={60}
            autoComplete="off"
            placeholder="PARCERIA20"
            disabled={enviando}
            className={CAMPO}
          />
          {/* A normalização de caixa é do BANCO — o índice funcional sobre
              `upper(codigo)` da `013`. A tela só avisa. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            Maiúscula ou minúscula dá no mesmo: quem digitar de qualquer jeito acha o cupom.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="tipo" className={ROTULO}>
            O que o cupom faz
          </label>
          <select
            id="tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            disabled={enviando}
            className={`${CAMPO} cursor-pointer`}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="valor" className={ROTULO}>
            Quanto ({escolhido.unidade})
          </label>
          <input
            id="valor"
            name="valor"
            type="number"
            min="1"
            step="1"
            required
            disabled={enviando}
            className={CAMPO}
          />
          <p className="font-sans text-[13px] leading-[20px] text-muted">{escolhido.ajuda}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="safra_id" className={ROTULO}>
            Vale para
          </label>
          <select id="safra_id" name="safra_id" disabled={enviando} className={`${CAMPO} cursor-pointer`}>
            {/* ⚠️ VAZIO É `null` NO BANCO, e `null` significa "qualquer
                safra" — não é ausência de dado, é o cupom de campanha que
                funciona na turma que estiver aberta (`013`). */}
            <option value="">Qualquer turma</option>
            {safras.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="usos_max" className={ROTULO}>
            Limite de usos
          </label>
          <input
            id="usos_max"
            name="usos_max"
            type="number"
            min="1"
            step="1"
            placeholder="sem limite"
            disabled={enviando}
            className={CAMPO}
          />
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            Em branco = pode ser usado quantas vezes for.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="expira_em" className={ROTULO}>
            Expira em
          </label>
          <input
            id="expira_em"
            name="expira_em"
            type="datetime-local"
            disabled={enviando}
            className={CAMPO}
          />
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            Em branco = não expira.
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
        {enviando ? 'Criando…' : 'Criar cupom'}
      </button>
    </form>
  )
}
