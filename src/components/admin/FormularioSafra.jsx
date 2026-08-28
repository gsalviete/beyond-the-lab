'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import CampoData from './CampoData.jsx'
import { ChevronBaixo } from './Icones.jsx'
import { MENSALIDADES_SUGERIDAS, VALOR_MENSAL_PADRAO, formatarReais } from '@/config/safra'

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

/**
 * O valor escolhido no menu de mensalidade.
 *
 * `''` = "deixar no padrão" (o campo não é enviado e a rota grava
 * `VALOR_MENSAL_PADRAO`), `'outro'` = revela o campo de digitar, e
 * qualquer outra string é um dos atalhos.
 */
const PADRAO = ''
const OUTRO = 'outro'

export default function FormularioSafra() {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [mensalidade, setMensalidade] = useState(PADRAO)
  // ⚠️ O LIMITE DE VAGAS NASCE DESLIGADO porque "sem limite" é o caso
  // normal (D-08) — a Giovanna respondeu em 08/08/2026 que não quer número
  // fixo de vagas. Um campo numérico vazio pedindo para ser preenchido
  // sugeria o contrário.
  const [comLimite, setComLimite] = useState(false)

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
        // `form.reset()` devolve os `<input>` ao valor inicial do HTML, e
        // não sabe nada do React: sem estas duas linhas, o menu voltaria a
        // "Outro valor" com o campo já limpo, e o interruptor de vagas
        // continuaria ligado sobre um campo zerado.
        setMensalidade(PADRAO)
        setComLimite(false)
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
          <CampoData id="data_inicio_aulas" name="data_inicio_aulas" required disabled={enviando} />
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
          <CampoData
            id="data_primeira_cobranca"
            name="data_primeira_cobranca"
            required
            disabled={enviando}
          />
          {/* Esta sai seca de propósito: cobrança tem dia exato — o cartão
              é debitado no dia 25, não "na última semana". É o oposto da
              data de início. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            O cartão é salvo na inscrição e só debitado nesta data.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="escolha_mensalidade" className={ROTULO}>
            Mensalidade (R$)
          </label>

          {/* ⚠️ MENU COM OS VALORES DE SEMPRE, E A PORTA PARA QUALQUER
              OUTRO. O campo era um `number` vazio, e um campo numérico
              vazio não diz quanto é o normal: quem cria a terceira turma do
              ano digita de memória, e memória erra um zero. Os atalhos
              respondem "é 299 como sempre" num toque, e "Outro valor"
              devolve o campo livre para o dia em que não for.

              ⚠️ O `<select>` NÃO TEM `name`. Quem carrega o valor para o
              POST é o `<input>` abaixo — um escondido nos atalhos, um
              visível em "Outro valor". Dois campos com o mesmo `name` no
              mesmo formulário mandariam os dois, e o servidor leria o
              primeiro. */}
          <div className="relative">
            <select
              id="escolha_mensalidade"
              value={mensalidade}
              onChange={(e) => setMensalidade(e.target.value)}
              disabled={enviando}
              className={`${CAMPO} cursor-pointer appearance-none pr-12`}
            >
              <option value={PADRAO}>Deixar no padrão — {formatarReais(VALOR_MENSAL_PADRAO)}</option>
              {MENSALIDADES_SUGERIDAS.map((v) => (
                <option key={v} value={String(v)}>
                  {formatarReais(v)}
                </option>
              ))}
              <option value={OUTRO}>Outro valor…</option>
            </select>
            <ChevronBaixo className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          </div>

          {mensalidade === OUTRO ? (
            <input
              id="valor_mensal"
              name="valor_mensal"
              type="number"
              min="1"
              step="0.01"
              required
              autoFocus
              placeholder="Quanto por mês, em reais"
              disabled={enviando}
              className={CAMPO}
            />
          ) : (
            mensalidade !== PADRAO && (
              <input type="hidden" name="valor_mensal" value={mensalidade} />
            )
          )}

          {/* ⚠️ EM BRANCO NÃO É ERRO, É UM VALOR — e a frase precisa dizer
              qual, porque quem deixa em branco está confiando nela. O
              número sai de `src/config/safra.ts`, o mesmo módulo que a rota
              lê ao gravar: a promessa da tela e o que o banco recebe não
              têm como divergir. */}
          <p className="font-sans text-[13px] leading-[20px] text-muted">
            Em branco = {formatarReais(VALOR_MENSAL_PADRAO)}. Vale só para quem se inscrever nesta
            turma — quem já assinou continua pagando o que combinou.
          </p>
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
          <span className={ROTULO}>Limite de vagas</span>

          {/* ⚠️ INTERRUPTOR, E NÃO UM CAMPO VAZIO. "Sem limite" era
              representado por ausência — um campo em branco —, e ausência
              não é resposta visível: a tela não distinguia "decidi que não
              tem limite" de "esqueci de preencher". O interruptor faz a
              decisão ser explícita nos dois sentidos, e o que vai para o
              banco continua sendo o mesmo `null`.

              ⚠️ `role="switch"` com `aria-checked` e não uma caixa
              desenhada: quem usa leitor de tela ouve "ligado/desligado",
              que é o que este controle é. */}
          <button
            type="button"
            role="switch"
            aria-checked={comLimite}
            aria-labelledby="rotulo-limite-vagas"
            disabled={enviando}
            onClick={() => setComLimite((v) => !v)}
            className="flex items-center gap-3 self-start rounded-full disabled:cursor-not-allowed
                       disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 shrink-0 rounded-full border
                          [transition:background-color_var(--motion-fast)_var(--ease-out),border-color_var(--motion-fast)_var(--ease-out)] ${
                            comLimite ? 'border-brand bg-brand' : 'border-border-soft bg-white'
                          }`}
            >
              <span
                className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white
                            shadow-soft [transition:left_var(--motion-fast)_var(--ease-out)] ${
                              comLimite ? 'left-[22px]' : 'left-[2px]'
                            } ${comLimite ? '' : 'border border-border-soft'}`}
              />
            </span>
            <span
              id="rotulo-limite-vagas"
              className="font-sans text-[14px] text-ink"
            >
              {comLimite ? 'Esta turma tem limite de vagas' : 'Sem limite de vagas'}
            </span>
          </button>

          {/* ⚠️ O CAMPO SÓ EXISTE COM O INTERRUPTOR LIGADO, e é isso que
              garante que desligá-lo grave `null` de verdade: um campo
              apenas `disabled` continuaria na tela sugerindo um número, e
              um campo escondido com `value` continuaria sendo enviado. Fora
              do DOM, não há o que enviar. */}
          {comLimite && (
            <>
              <label htmlFor="vagas_total" className="sr-only">
                Quantas vagas
              </label>
              <input
                id="vagas_total"
                name="vagas_total"
                type="number"
                min="1"
                step="1"
                required
                autoFocus
                placeholder="Quantas vagas"
                disabled={enviando}
                className={`${CAMPO} sm:max-w-[240px]`}
              />
            </>
          )}

          {/* ⚠️ Vazio = SEM LIMITE (D-08), e é o caso normal aqui: você
              respondeu que não precisa de número fixo de vagas. Com limite,
              quem chegar depois de esgotar entra na lista de espera — não
              vê tela de erro.

              A frase fica na tela nos DOIS estados do interruptor, de
              propósito: ela é a única coisa que explica o que acontece com
              quem chegar depois de esgotar, e essa é justamente a dúvida de
              quem está decidindo se liga o limite. */}
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
