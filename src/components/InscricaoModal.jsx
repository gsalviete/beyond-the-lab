'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, Plus } from './Icons.jsx'
import {
  DATA_PRIMEIRA_COBRANCA,
  INICIO_DAS_AULAS,
  INSTAGRAM_URL,
  formatarDataPorExtenso,
} from '@/config/curso'
import { mascararTelefone, paraE164, telefoneEhValido } from '@/lib/telefone'

// Campo em repouso e no foco — herdado tal e qual do Waitlist.jsx que esta
// modal substitui. Altura 60px é a mesma do .btn-brand, e o radius de pill é
// o das pills do Pricing. O anel de foco vem da regra `input:focus-visible`
// do globals.css, com o mesmo --focus-color do resto do site; aqui só
// acrescentamos a borda rosa, que é o reforço visual do estado.
const FIELD =
  'h-[60px] w-full rounded-full border border-border-soft bg-white px-5 ' +
  'font-sans text-[16px] leading-[25.6px] text-ink placeholder:text-muted ' +
  'shadow-soft focus-visible:border-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  '[transition:border-color_var(--motion-short)_var(--ease-out),box-shadow_var(--motion-short)_var(--ease-out)]'

const LABEL = 'pl-5 font-display text-[14px] font-semibold leading-[19.2px] text-ink'

const CONSENT_TEXT =
  'Concordo em receber e-mails e mensagens sobre as turmas do Beyond The Lab. ' +
  'Posso sair a qualquer momento.'

// Tudo que pode receber foco pelo teclado. `:not([disabled])` importa: os
// campos ficam disabled durante o envio, e um ciclo de Tab que pousa em
// controle desabilitado trava o usuário.
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function InscricaoModal({ onFechar }) {
  const id = useId()
  const tituloId = `${id}-titulo`
  const nomeId = `${id}-nome`
  const emailId = `${id}-email`
  const telefoneId = `${id}-telefone`
  const consentId = `${id}-consentimento`
  const honeypotId = `${id}-website`
  const erroId = `${id}-erro`

  const painelRef = useRef(null)
  const primeiroCampoRef = useRef(null)
  const tituloSucessoRef = useRef(null)

  // idle | submitting | success
  const [status, setStatus] = useState('idle')
  const [erro, setErro] = useState('')
  const [telefone, setTelefone] = useState('')
  const [consentimento, setConsentimento] = useState(false)

  // Qual botão disparou o submit. Ref e não state: é lido uma vez dentro do
  // handler, e um re-render entre o clique e o submit não ajudaria em nada.
  const escolhaRef = useRef('agora')

  const submitting = status === 'submitting'
  const sucesso = status === 'success'

  // `onFechar` numa ref para o efeito de teclado poder rodar uma única vez
  // (array de dependências vazio) sem capturar uma versão velha da função.
  // Quem cuida da entrada de histórico é o provider — ver o comentário lá
  // sobre por que essa lógica não pode viver num efeito daqui.
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar

  const pedirFechamento = useCallback(() => onFecharRef.current(), [])

  // ------------------------------------------------------------
  // TRAVA DE SCROLL
  // `overflow: hidden` no body some com a barra de rolagem, e a página
  // inteira dá um salto para a direita pela largura dela. Medimos a
  // diferença e devolvemos como padding — no body e na navbar fixa, que
  // por estar fora do fluxo não herda o padding do body.
  // ------------------------------------------------------------
  useEffect(() => {
    const doc = document.documentElement
    const largura = window.innerWidth - doc.clientWidth
    doc.style.setProperty('--scrollbar-compensation', `${largura}px`)
    document.body.setAttribute('data-modal-aberta', '')
    return () => {
      document.body.removeAttribute('data-modal-aberta')
      doc.style.removeProperty('--scrollbar-compensation')
    }
  }, [])

  // ------------------------------------------------------------
  // TECLADO — Escape e prisão de foco
  // Na fase de captura para chegar antes do listener de Escape da Navbar;
  // com a modal aberta, Escape é dela.
  // ------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        pedirFechamento()
        return
      }
      if (e.key !== 'Tab') return

      const painel = painelRef.current
      if (!painel) return
      const foco = Array.from(painel.querySelectorAll(FOCAVEIS)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (foco.length === 0) {
        e.preventDefault()
        return
      }

      const primeiro = foco[0]
      const ultimo = foco[foco.length - 1]
      const ativo = document.activeElement
      const dentro = painel.contains(ativo)

      if (e.shiftKey && (!dentro || ativo === primeiro)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (!dentro || ativo === ultimo)) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [pedirFechamento])

  // Foco inicial no primeiro campo; ao concluir, no título da confirmação —
  // que é a informação nova da tela e o começo natural da leitura.
  useEffect(() => {
    if (sucesso) tituloSucessoRef.current?.focus()
    else primeiroCampoRef.current?.focus()
  }, [sucesso])

  // ------------------------------------------------------------
  // ENVIO
  // ------------------------------------------------------------
  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    const dados = new FormData(event.currentTarget)
    const name = String(dados.get('name') ?? '').trim()
    const email = String(dados.get('email') ?? '').trim()
    const website = String(dados.get('website') ?? '')
    const escolha = escolhaRef.current

    // Validação client-side: só para retorno imediato. A que vale é a do
    // servidor, que roda mesmo com o JS desligado ou adulterado.
    if (name.length < 2 || name.length > 100) {
      setErro('Digite seu nome completo.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErro('Digite um e-mail válido.')
      return
    }
    if (!telefoneEhValido(telefone)) {
      setErro('Digite um celular válido com DDD, no formato (21) 99999-9999.')
      return
    }
    if (!consentimento) {
      setErro('Marque o consentimento para concluir a inscrição.')
      return
    }

    setStatus('submitting')
    setErro('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: paraE164(telefone),
          payment_choice: escolha,
          consent: consentimento,
          website,
        }),
      })
      const body = await res.json().catch(() => null)

      if (res.ok && body?.ok) {
        // TODO: Prompt B — 'agora' redireciona para o Stripe Checkout.
        // A ramificação é exatamente aqui: com `escolha === 'agora'`, em vez
        // de mostrar a tela de sucesso, o servidor devolve a URL da sessão
        // de Checkout e este ponto faz `window.location.assign(body.url)`.
        // 'depois' continua caindo na tela de sucesso como agora.
        setStatus('success')
        return
      }

      setStatus('idle')
      setErro(body?.message ?? 'Não conseguimos salvar sua inscrição agora. Tente novamente.')
    } catch {
      setStatus('idle')
      setErro('Falha de conexão. Verifique sua internet e tente de novo.')
    }
  }

  // Fecha só quando o gesto COMEÇOU no backdrop. Sem isso, selecionar texto
  // dentro da modal e soltar o mouse fora fecharia o formulário preenchido.
  const inicioNoBackdropRef = useRef(false)

  const conteudo = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto
                 overscroll-contain bg-ink/50 p-0 backdrop-blur-[2px]
                 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        inicioNoBackdropRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (inicioNoBackdropRef.current && e.target === e.currentTarget) pedirFechamento()
        inicioNoBackdropRef.current = false
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onMouseDown={(e) => e.stopPropagation()}
        /* Mobile: ocupa a tela quase inteira e rola por dentro. `100dvh` e
           não `100vh` — no Safari do iOS o `vh` conta a barra de endereço
           recolhida, então os botões do fim do formulário ficariam embaixo
           dela. Acima de sm vira card centrado com teto de altura. */
        className="relative flex h-[100dvh] w-full flex-col overflow-y-auto overscroll-contain
                   border border-[rgba(17,17,17,0.09)]
                   bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                   px-6 py-8
                   shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                   sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[560px] sm:max-w-full
                   sm:rounded-[36px] sm:px-10 sm:py-10"
      >
        {/* FECHAR — sem ícone de X no Icons.jsx, o Plus a 45° É um X, e é
            asset existente. Preferi rotacionar a inventar um SVG novo. */}
        <button
          type="button"
          onClick={pedirFechamento}
          aria-label="Fechar"
          className="absolute right-4 top-4 grid h-11 w-11 shrink-0 place-items-center
                     rounded-full border border-[rgba(17,17,17,0.09)] bg-white text-ink
                     [transition:transform_var(--motion-short)_var(--ease-out),color_var(--motion-short)_var(--ease-out)]
                     hover:scale-105 hover:text-brand sm:right-6 sm:top-6"
        >
          <Plus className="h-5 w-5 rotate-45" />
        </button>

        {sucesso ? (
          <TelaDeSucesso
            tituloId={tituloId}
            tituloRef={tituloSucessoRef}
            onFechar={pedirFechamento}
          />
        ) : (
          <>
            <div className="flex flex-col items-center pr-12 text-center sm:pr-14">
              {/* badge — mesma pill do Pricing e do antigo Waitlist */}
              <span
                className="inline-flex items-center gap-2 rounded-full border
                           border-[rgba(247,88,131,0.25)] bg-white px-4 py-[11px]"
              >
                <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#F75883]" />
                <span className="text-grad font-display text-[18px] font-semibold leading-none">
                  Inscrição
                </span>
              </span>

              <h2
                id={tituloId}
                className="mt-5 font-display text-[26px] font-semibold leading-[1.2]
                           text-[#022D57] sm:text-[32px]"
              >
                Garanta sua vaga na <span className="text-grad">próxima turma.</span>
              </h2>

              <p className="mt-3 font-display text-[16px] font-normal leading-[25.6px] text-[#345372]">
                As turmas são reduzidas. Preencha seus dados para reservar seu lugar.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={nomeId} className={LABEL}>
                  Nome
                </label>
                <input
                  ref={primeiroCampoRef}
                  id={nomeId}
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
                <label htmlFor={emailId} className={LABEL}>
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

              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={telefoneId} className={LABEL}>
                  WhatsApp
                </label>
                <input
                  id={telefoneId}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel-national"
                  placeholder="(21) 99999-9999"
                  disabled={submitting}
                  value={telefone}
                  /* Controlado com a máscara aplicada a cada tecla. O que
                     vai para o banco é o E.164 derivado daqui, não isto. */
                  onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                  maxLength={15}
                  className={FIELD}
                />
                <span className="pl-5 font-sans text-[13px] leading-[20px] text-[#345372]">
                  É por aqui que enviamos o convite do grupo da turma.
                </span>
              </div>

              {/* CONSENTIMENTO — desmarcado por padrão, e é assim que fica.
                  Consentimento pré-marcado não é consentimento (LGPD). */}
              <label
                htmlFor={consentId}
                className="mt-1 flex cursor-pointer items-start gap-3 text-left"
              >
                <input
                  id={consentId}
                  name="consent"
                  type="checkbox"
                  required
                  disabled={submitting}
                  checked={consentimento}
                  onChange={(e) => setConsentimento(e.target.checked)}
                  className="mt-[3px] h-5 w-5 shrink-0 cursor-pointer rounded-md
                             border border-border-soft accent-brand
                             disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="font-sans text-[13px] leading-[20px] text-[#345372]">
                  {CONSENT_TEXT}
                </span>
              </label>

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

              {/* Hierarquia: o primário é o .btn-brand cheio; o secundário é
                  o .btn-outline, mesma altura e mesmo raio, peso visual
                  menor. Os dois gravam igual neste prompt. */}
              <button
                type="submit"
                disabled={submitting}
                onClick={() => {
                  escolhaRef.current = 'agora'
                }}
                className="btn-brand mt-2 w-full text-[17px] disabled:cursor-not-allowed
                           disabled:opacity-60 disabled:hover:translate-y-0
                           disabled:hover:shadow-none"
              >
                {submitting ? 'Enviando…' : 'Garantir minha vaga'}
                {!submitting && (
                  <span className="arrow-badge">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>

              <button
                type="submit"
                disabled={submitting}
                onClick={() => {
                  escolhaRef.current = 'depois'
                }}
                className="btn-outline w-full text-[16px] disabled:cursor-not-allowed
                           disabled:opacity-60 disabled:hover:translate-y-0"
              >
                Prefiro pagar depois
              </button>

              <p className="text-center font-sans text-[13px] leading-[20px] text-[#345372]">
                Sua vaga fica garantida agora. A primeira cobrança acontece em{' '}
                <strong className="font-semibold text-ink">
                  {formatarDataPorExtenso(DATA_PRIMEIRA_COBRANCA)}
                </strong>
                , antes do início das aulas.
              </p>

              {/* Container sempre no DOM: um aria-live que só nasce junto com
                  a mensagem costuma não ser anunciado. */}
              <div id={erroId} role="status" aria-live="polite">
                {erro && (
                  <p className="text-left font-sans text-[14px] leading-[22px] text-brand-deep">
                    {erro}
                  </p>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(conteudo, document.body)
}

// ============================================================
// TELA DE SUCESSO — substitui o conteúdo, sem fechar a modal
// ============================================================
function TelaDeSucesso({ tituloId, tituloRef, onFechar }) {
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-rose-100 text-brand">
        <Check className="h-7 w-7" />
      </span>

      <h2
        id={tituloId}
        ref={tituloRef}
        /* tabIndex -1 para receber o foco programático sem entrar na ordem
           de tabulação — o leitor de tela anuncia a confirmação primeiro. */
        tabIndex={-1}
        className="mt-5 font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]"
      >
        Inscrição confirmada!
      </h2>

      <p className="mt-4 font-display text-[16px] leading-[25.6px] text-[#345372]">
        Sua vaga está reservada. Enviamos os próximos passos para o seu e-mail e, mais perto
        das aulas, o convite do grupo no WhatsApp. As aulas começam em{' '}
        <strong className="font-semibold text-ink">
          {formatarDataPorExtenso(INICIO_DAS_AULAS)}
        </strong>
        .
      </p>

      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-brand mt-8 w-full text-[17px]"
      >
        Acompanhar no Instagram
        <span className="arrow-badge">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </a>

      <button type="button" onClick={onFechar} className="btn-outline mt-3 w-full text-[16px]">
        Fechar
      </button>
    </div>
  )
}
