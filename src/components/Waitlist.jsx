'use client'

import { useId, useState } from 'react'
import { ArrowUpRight, Check } from './Icons.jsx'

const CONSENT_TEXT =
  'Ao entrar na lista, você concorda em receber e-mails sobre as próximas turmas do Beyond The Lab. Você pode sair a qualquer momento.'

// Campo em repouso e no foco. Altura 60px é a mesma do .btn-brand, e o radius
// de pill é o das pills da lista de features do Pricing — nenhum dos dois é
// valor novo. O anel de foco vem da regra `input:focus-visible` do
// globals.css, que usa o mesmo --focus-color de todo o resto do site; aqui só
// acrescentamos a borda rosa, que é o reforço visual do estado.
const FIELD =
  'h-[60px] w-full rounded-full border border-border-soft bg-white px-5 ' +
  'font-sans text-[16px] leading-[25.6px] text-ink placeholder:text-muted ' +
  'shadow-soft focus-visible:border-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  '[transition:border-color_var(--motion-short)_var(--ease-out),box-shadow_var(--motion-short)_var(--ease-out)]'

export default function Waitlist() {
  const id = useId()
  const nameId = `${id}-nome`
  const emailId = `${id}-email`
  const honeypotId = `${id}-website`

  // idle | submitting | success | error
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'submitting') return

    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const website = String(data.get('website') ?? '')

    // Validação client-side: só para retorno imediato. A que vale é a do
    // servidor, que roda mesmo com o JS desligado.
    if (name.length < 2) {
      setStatus('error')
      setMessage('Digite seu nome completo.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error')
      setMessage('Digite um e-mail válido.')
      return
    }

    setStatus('submitting')
    setMessage('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, website }),
      })
      const body = await res.json().catch(() => null)

      if (res.ok && body?.ok) {
        setStatus('success')
        setMessage(body.message)
        return
      }

      setStatus('error')
      setMessage(body?.message ?? 'Não conseguimos salvar seu cadastro agora. Tente novamente.')
    } catch {
      setStatus('error')
      setMessage('Falha de conexão. Verifique sua internet e tente de novo.')
    }
  }

  const submitting = status === 'submitting'

  return (
    <section id="lista" className="px-6 py-16 md:px-10 lg:px-0">
      <div className="mx-auto w-[720px] max-w-full">
        {/* Mesmo frame do Pricing: radius 36, borda 9% e o gradiente
            153deg #FDEEF2 → #FCFCFC. A seção nova não introduz superfície
            nova, só reusa a que a seção vizinha já estabeleceu. */}
        <div
          className="reveal-soft relative overflow-hidden rounded-[36px]
                     border border-[rgba(17,17,17,0.09)]
                     bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                     shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                     p-6 md:p-14"
        >
          <div className="flex flex-col items-center text-center">
            {/* badge — mesma pill do Pricing, sem o padding-right assimétrico
                do frame de 1440, que ali existe por causa do autolayout */}
            <span
              className="reveal inline-flex items-center gap-2 rounded-full border
                         border-[rgba(247,88,131,0.25)] bg-white px-4 py-[11px]"
            >
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#F75883]" />
              <span className="text-grad font-display text-[18px] font-semibold leading-none">
                Lista de espera
              </span>
            </span>

            <h2
              className="reveal h2-section mt-5 w-[492px] max-w-full font-display
                         font-semibold leading-[normal] text-[#022D57]"
              style={{ '--reveal-delay': '90ms' }}
            >
              Seja avisada quando <span className="text-grad">abrir a próxima turma.</span>
            </h2>

            <p
              className="reveal mt-4 w-[487.5px] max-w-full font-display text-[16px]
                         font-normal leading-[25.6px] text-[#345372]"
              style={{ '--reveal-delay': '170ms' }}
            >
              As turmas são reduzidas. Deixe seu nome e e-mail para receber o aviso de abertura
              em primeira mão.
            </p>
          </div>

          {/* ───── FORMULÁRIO ───── */}
          {status !== 'success' && (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="reveal mx-auto mt-8 flex w-[440px] max-w-full flex-col gap-4"
              style={{ '--reveal-delay': '250ms' }}
            >
              <div className="flex flex-col gap-2 text-left">
                <label
                  htmlFor={nameId}
                  className="pl-5 font-display text-[14px] font-semibold leading-[19.2px] text-ink"
                >
                  Nome
                </label>
                <input
                  id={nameId}
                  name="name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  disabled={submitting}
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label
                  htmlFor={emailId}
                  className="pl-5 font-display text-[14px] font-semibold leading-[19.2px] text-ink"
                >
                  E-mail
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  inputMode="email"
                  required
                  maxLength={255}
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  disabled={submitting}
                  className={FIELD}
                />
              </div>

              {/* HONEYPOT — escondido por CSS, não por type="hidden": bot que
                  varre o DOM ignora hidden, mas preenche um input de texto
                  normal. Fora da ordem de tabulação e invisível para leitor
                  de tela, então nenhum humano chega nele. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute h-px w-px -translate-x-[9999px] overflow-hidden opacity-0"
              >
                <label htmlFor={honeypotId}>Não preencha este campo</label>
                <input
                  id={honeypotId}
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  defaultValue=""
                />
              </div>

              <p className="text-left font-sans text-[13px] leading-[20px] text-[#345372]">
                {CONSENT_TEXT}
              </p>

              <button
                type="submit"
                disabled={submitting}
                className="btn-brand w-full text-[17px] disabled:cursor-not-allowed
                           disabled:opacity-60 disabled:hover:translate-y-0
                           disabled:hover:shadow-none"
              >
                {submitting ? 'Enviando…' : 'Entrar na lista'}
                {!submitting && (
                  <span className="arrow-badge">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            </form>
          )}

          {/* ───── STATUS ─────
              Container sempre no DOM: um aria-live que só nasce junto com a
              mensagem costuma não ser anunciado. */}
          <div
            role="status"
            aria-live="polite"
            className={status === 'success' ? 'mt-8' : 'mx-auto mt-4 w-[440px] max-w-full'}
          >
            {status === 'error' && message && (
              <p className="text-left font-sans text-[14px] leading-[22px] text-brand-deep">
                {message}
              </p>
            )}

            {status === 'success' && (
              <div
                className="mx-auto flex w-[440px] max-w-full flex-col items-center gap-3
                           rounded-2xl border border-[rgba(247,88,131,0.25)] bg-white
                           px-6 py-8 text-center shadow-card"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-rose-100 text-brand">
                  <Check className="h-6 w-6" />
                </span>
                <p className="font-display text-[20px] font-semibold leading-[27px] text-ink">
                  {message}
                </p>
                <p className="font-sans text-[15px] leading-[24px] text-[#345372]">
                  Assim que a próxima turma abrir, você recebe o aviso por e-mail.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
