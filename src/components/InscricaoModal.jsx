'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, ChevronRight, Plus } from './Icons.jsx'
import { INSTAGRAM_URL, formatarDataPorExtenso, paraDataUTC } from '@/config/curso'
// A frase do consentimento saiu daqui para um módulo próprio. Não foi
// arrumação: `/api/waitlist` grava esta mesma constante em
// `waitlist.consent_text`, e duas cópias divergiriam sem ninguém notar —
// a partir dali o banco guardaria a prova de um texto que a tela não
// mostra mais. Ver o cabeçalho de `src/config/consentimento.ts`.
import { CONSENT_SEGMENTS } from '@/config/consentimento'
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

// ⚠️ derivado: o projeto não tinha nenhum <select>. É o FIELD inteiro com
// duas mudanças obrigatórias — `appearance-none` para a seta nativa (que
// varia entre navegadores e ignora nosso tema) sair, e `pr-12` para abrir
// espaço para a nossa. O 12 é o mesmo passo de espaçamento do px-5 do
// FIELD dobrado, não é número novo. `text-muted` quando vazio faz a opção
// "Selecione" ler como placeholder, igual aos outros campos.
const SELECT = `${FIELD} appearance-none cursor-pointer pr-12`

const LABEL = 'pl-5 font-display text-[14px] font-semibold leading-[19.2px] text-ink'

// ⚠️ derivado: nenhum <fieldset> existia no projeto. O <legend> herda o
// token do LABEL sem alteração — é o mesmo papel visual. O reset
// `m-0 border-0 p-0` é obrigatório: o preflight do Tailwind não zera a
// borda e o padding que o navegador dá a fieldset por conta própria.
const FIELDSET = 'm-0 flex flex-col gap-2 border-0 p-0 text-left'

// ⚠️ derivado: herdado do checkbox de consentimento, que era o único do
// projeto. Idêntico, menos o `mt-[3px]` — aquele alinha com um texto de
// duas linhas, e aqui o rótulo é uma palavra só, centrada no eixo.
const CHECKBOX =
  'h-5 w-5 shrink-0 cursor-pointer rounded-md border border-border-soft accent-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

const NIVEIS = [
  { valor: 'basico', rotulo: 'Básico' },
  { valor: 'intermediario', rotulo: 'Intermediário' },
  { valor: 'avancado', rotulo: 'Avançado' },
]

// O `valor` é exatamente o que o CHECK da coluna `disponibilidade` aceita
// no banco — não traduza aqui sem mexer lá.
const DIAS = [
  { valor: 'seg', rotulo: 'Segunda' },
  { valor: 'ter', rotulo: 'Terça' },
  { valor: 'qua', rotulo: 'Quarta' },
  { valor: 'qui', rotulo: 'Quinta' },
  { valor: 'sex', rotulo: 'Sexta' },
]

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
  const nivelId = `${id}-nivel`
  const cursoId = `${id}-curso`
  const periodoId = `${id}-periodo`
  const consentId = `${id}-consentimento`
  // Alvo do `aria-labelledby` da caixa de consentimento — ver o bloco do
  // consentimento no formulário para o porquê de o nome acessível não
  // vir mais de um <label> que envolve tudo.
  const consentTextoId = `${id}-consentimento-texto`
  const honeypotId = `${id}-website`
  const erroId = `${id}-erro`

  const painelRef = useRef(null)
  const primeiroCampoRef = useRef(null)
  const tituloSucessoRef = useRef(null)

  // carregando | idle | submitting | success
  //
  // 'carregando' é o estado INICIAL: a modal não sabe o que mostrar antes
  // de perguntar ao servidor se há turma aberta. Só depois da resposta ela
  // vira 'idle' e o formulário aparece.
  const [status, setStatus] = useState('carregando')
  const [erro, setErro] = useState('')

  // A turma aberta, ou null para lista de espera. É o que decide o MODO da
  // modal, e é ortogonal ao `status` acima — continua valendo durante o
  // envio e na tela de sucesso, que precisa da data de início das aulas.
  const [turma, setTurma] = useState(null)

  const [telefone, setTelefone] = useState('')
  const [nivel, setNivel] = useState('')
  const [dias, setDias] = useState([])
  const [consentimento, setConsentimento] = useState(false)

  // Qual botão disparou o submit. Ref e não state: é lido uma vez dentro do
  // handler, e um re-render entre o clique e o submit não ajudaria em nada.
  const escolhaRef = useRef('agora')

  const carregando = status === 'carregando'
  const submitting = status === 'submitting'
  const sucesso = status === 'success'
  const inscricaoAberta = turma !== null

  // `onFechar` numa ref para o efeito de teclado poder rodar uma única vez
  // (array de dependências vazio) sem capturar uma versão velha da função.
  // Quem cuida da entrada de histórico é o provider — ver o comentário lá
  // sobre por que essa lógica não pode viver num efeito daqui.
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar

  const pedirFechamento = useCallback(() => onFecharRef.current(), [])

  // ------------------------------------------------------------
  // QUAL TURMA ESTÁ ABERTA
  //
  // A modal só é montada quando abre (ver InscricaoProvider), então este
  // efeito de montagem É o "ao abrir" — não precisa de gatilho próprio.
  //
  // Qualquer falha cai em lista de espera, silenciosamente. Um erro na
  // tela aqui só teria o efeito de impedir alguém interessada de deixar o
  // contato, que é a única coisa que não podemos perder. O problema fica
  // no log do servidor, que é onde ele se conserta.
  //
  // O `cancelado` protege do desmonte durante o fetch: a pessoa pode
  // fechar a modal antes da resposta chegar, e um setState depois disso
  // seria trabalho jogado fora (e, no StrictMode do dev, ruído).
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelado = false

    fetch('/api/turma-ativa', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelado) return
        setTurma(body?.turma ?? null)
        setStatus('idle')
      })
      .catch(() => {
        if (cancelado) return
        setTurma(null)
        setStatus('idle')
      })

    return () => {
      cancelado = true
    }
  }, [])

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

  // Foco conforme a tela. Durante o carregamento o primeiro campo ainda
  // não existe, e sem este ramo a modal abriria sem foco em lugar nenhum —
  // o leitor de tela não anunciaria nada e o primeiro Tab sairia do
  // contexto. O painel tem tabIndex -1 justamente para poder recebê-lo.
  useEffect(() => {
    if (carregando) painelRef.current?.focus()
    else if (sucesso) tituloSucessoRef.current?.focus()
    else primeiroCampoRef.current?.focus()
  }, [carregando, sucesso])

  function alternarDia(valor) {
    setDias((atuais) =>
      atuais.includes(valor) ? atuais.filter((d) => d !== valor) : [...atuais, valor],
    )
  }

  // ------------------------------------------------------------
  // ENVIO
  // ------------------------------------------------------------
  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    const dados = new FormData(event.currentTarget)
    const name = String(dados.get('name') ?? '').trim()
    const email = String(dados.get('email') ?? '').trim()
    const curso = String(dados.get('curso') ?? '').trim()
    const periodo = String(dados.get('periodo') ?? '').trim()
    const website = String(dados.get('website') ?? '')

    // Sem turma aberta não há escolha de pagamento para fazer — não existe
    // cobrança a adiantar. O servidor descarta este campo nesse caso de
    // qualquer jeito; mandamos 'depois' para o corpo dizer a verdade.
    const escolha = inscricaoAberta ? escolhaRef.current : 'depois'

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
    if (!nivel) {
      setErro('Selecione o seu nível de inglês.')
      return
    }
    if (curso.length < 2 || curso.length > 100) {
      setErro('Digite o nome do seu curso.')
      return
    }
    if (periodo.length < 1 || periodo.length > 40) {
      setErro('Digite o seu período — por exemplo, 3º semestre.')
      return
    }
    // Mesmo espírito da mensagem de consentimento: é erro que se corrige
    // com um clique, e um "confira seus dados" genérico mandaria a pessoa
    // revisar campos que estão certos.
    if (dias.length === 0) {
      setErro('Marque pelo menos um dia da semana em que você pode assistir às aulas.')
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
          nivel_ingles: nivel,
          curso,
          periodo,
          disponibilidade: dias,
          consent: consentimento,
          website,
        }),
      })
      const body = await res.json().catch(() => null)

      if (res.ok && body?.ok) {
        // TODO: Prompt B2 — 'agora' redireciona para o Stripe Checkout.
        // A ramificação é exatamente aqui: com `escolha === 'agora'` E
        // turma aberta, em vez de mostrar a tela de sucesso, o servidor
        // devolve a URL da sessão de Checkout e este ponto faz
        // `window.location.assign(body.url)`. 'depois' e lista de espera
        // continuam caindo na tela de sucesso como agora.
        setStatus('success')
        return
      }

      setStatus('idle')
      setErro(body?.message ?? 'Não conseguimos salvar seu cadastro agora. Tente novamente.')
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
        aria-busy={carregando}
        /* tabIndex -1: alvo do foco enquanto o formulário não existe, sem
           entrar na ordem de tabulação. */
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        /* Mobile: ocupa a tela quase inteira e rola por dentro. `100dvh` e
           não `100vh` — no Safari do iOS o `vh` conta a barra de endereço
           recolhida, então os botões do fim do formulário ficariam embaixo
           dela. Acima de sm vira card centrado com teto de altura.

           ⚠️ derivado: o `sm:min-h-[...]` é novo e existe por um motivo
           só — sem ele o painel nasceria do tamanho do "Carregando…" e
           daria um salto quando os oito campos chegassem. O valor não é
           inventado: é o mesmo `calc(100dvh-3rem)` do teto logo abaixo,
           limitado a 640px, então o painel abre já na altura em que vai
           ficar. No mobile não faz falta — lá a altura é fixa em 100dvh. */
        className="relative flex h-[100dvh] w-full flex-col overflow-y-auto overscroll-contain
                   border border-[rgba(17,17,17,0.09)]
                   bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                   px-6 py-8
                   shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                   sm:h-auto sm:min-h-[min(640px,calc(100dvh-3rem))]
                   sm:max-h-[calc(100dvh-3rem)] sm:w-[560px] sm:max-w-full
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

        {carregando ? (
          <TelaDeCarregamento tituloId={tituloId} />
        ) : sucesso ? (
          <TelaDeSucesso
            tituloId={tituloId}
            tituloRef={tituloSucessoRef}
            turma={turma}
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
                  {inscricaoAberta ? 'Inscrição' : 'Lista de espera'}
                </span>
              </span>

              <h2
                id={tituloId}
                className="mt-5 font-display text-[26px] font-semibold leading-[1.2]
                           text-[#022D57] sm:text-[32px]"
              >
                {inscricaoAberta ? (
                  <>
                    Garanta sua vaga na <span className="text-grad">próxima turma.</span>
                  </>
                ) : (
                  <>
                    As inscrições estão <span className="text-grad">fechadas no momento.</span>
                  </>
                )}
              </h2>

              <p className="mt-3 font-display text-[16px] font-normal leading-[25.6px] text-[#345372]">
                {inscricaoAberta
                  ? 'As turmas são reduzidas. Preencha seus dados para reservar seu lugar.'
                  : 'Deixe seus dados e avisamos você em primeira mão assim que a próxima turma abrir.'}
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

              {/* NÍVEL DE INGLÊS — autodeclarado, não é avaliação. */}
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={nivelId} className={LABEL}>
                  Nível de inglês
                </label>
                <div className="relative">
                  <select
                    id={nivelId}
                    name="nivel_ingles"
                    required
                    disabled={submitting}
                    value={nivel}
                    onChange={(e) => setNivel(e.target.value)}
                    className={`${SELECT} ${nivel ? 'text-ink' : 'text-muted'}`}
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    {NIVEIS.map((n) => (
                      <option key={n.valor} value={n.valor} className="text-ink">
                        {n.rotulo}
                      </option>
                    ))}
                  </select>
                  {/* ChevronRight a 90° é a seta para baixo — mesmo
                      princípio do Plus a 45° virando X ali em cima:
                      asset existente, rotacionado, em vez de SVG novo.
                      `pointer-events-none` para o clique atravessar e
                      abrir o select, e aria-hidden porque é decoração. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-ink"
                  >
                    <ChevronRight className="h-4 w-4 rotate-90" />
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={cursoId} className={LABEL}>
                  Curso
                </label>
                <input
                  id={cursoId}
                  name="curso"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Biomedicina"
                  disabled={submitting}
                  className={FIELD}
                />
              </div>

              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={periodoId} className={LABEL}>
                  Período
                </label>
                <input
                  id={periodoId}
                  name="periodo"
                  type="text"
                  required
                  maxLength={40}
                  /* Texto livre de propósito — "formada" e "trancado" são
                     respostas reais, e um campo numérico as perderia. */
                  placeholder="3º semestre"
                  disabled={submitting}
                  className={FIELD}
                />
              </div>

              {/* DISPONIBILIDADE — fieldset e não uma <div> com label:
                  cinco checkboxes soltos são anunciados um a um pelo
                  leitor de tela, sem nada que diga a que pergunta eles
                  respondem. A legend é essa pergunta. */}
              <fieldset className={FIELDSET} disabled={submitting}>
                <legend className={LABEL}>Disponibilidade</legend>
                <span className="pl-5 font-sans text-[13px] leading-[20px] text-[#345372]">
                  Marque todos os dias em que você poderia assistir às aulas.
                </span>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-3 pl-5">
                  {DIAS.map((dia) => {
                    const diaId = `${id}-dia-${dia.valor}`
                    return (
                      <label
                        key={dia.valor}
                        htmlFor={diaId}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          id={diaId}
                          type="checkbox"
                          name="disponibilidade"
                          value={dia.valor}
                          checked={dias.includes(dia.valor)}
                          onChange={() => alternarDia(dia.valor)}
                          className={CHECKBOX}
                        />
                        <span className="font-sans text-[14px] leading-[22px] text-[#345372]">
                          {dia.rotulo}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {/* CONSENTIMENTO — desmarcado por padrão, e é assim que fica.
                  Consentimento pré-marcado não é consentimento (LGPD).

                  A frase deixou de ser um <label> único envolvendo tudo, e
                  a razão é o par de links que ela agora contém: dentro de
                  um <label>, clicar em qualquer lugar aciona o controle
                  associado — quem tocasse em "Termos de Uso" marcaria a
                  caixa junto, consentindo no mesmo gesto em que pediu para
                  ler o que está consentindo. É o oposto de manifestação
                  inequívoca.

                  A montagem abaixo resolve por estrutura, e não por
                  interceptação de evento: os trechos SEM href viram
                  <label htmlFor>, e continuam alternando a caixa ao serem
                  clicados; os trechos COM href viram <a>, fora de qualquer
                  label, e só navegam.

                  (`stopPropagation` no link seria teatro: o React delega
                  eventos na raiz, e o comportamento de ativação do <label>
                  é ação padrão do navegador decidida pelo alvo do clique,
                  não algo que borbulha e possa ser barrado a tempo.)

                  O nome acessível vem do `aria-labelledby` apontando para
                  o container: assim o leitor de tela anuncia a sentença
                  inteira, links inclusive, e não só os pedaços rotuláveis. */}
              <div className="mt-1 flex items-start gap-3 text-left">
                <input
                  id={consentId}
                  name="consent"
                  type="checkbox"
                  required
                  disabled={submitting}
                  checked={consentimento}
                  onChange={(e) => setConsentimento(e.target.checked)}
                  aria-labelledby={consentTextoId}
                  className={`${CHECKBOX} mt-[3px]`}
                />
                <span
                  id={consentTextoId}
                  className="font-sans text-[13px] leading-[20px] text-[#345372]"
                >
                  {CONSENT_SEGMENTS.map((seg, i) =>
                    seg.href ? (
                      <a
                        key={i}
                        href={seg.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded font-semibold text-brand underline underline-offset-2
                                   [transition:color_var(--motion-fast)_var(--ease-out)]
                                   hover:text-brand-deep"
                      >
                        {seg.texto}
                      </a>
                    ) : (
                      /* <label> e não <span>: preserva o alvo de clique
                         generoso do texto, que em mobile é o que de fato
                         se acerta — a caixa tem 20px de lado. */
                      <label key={i} htmlFor={consentId} className="cursor-pointer">
                        {seg.texto}
                      </label>
                    ),
                  )}
                </span>
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

              {inscricaoAberta ? (
                <>
                  {/* Hierarquia: o primário é o .btn-brand cheio; o
                      secundário é o .btn-outline, mesma altura e mesmo
                      raio, peso visual menor. Os dois gravam igual neste
                      prompt — o Stripe ramifica no B2. */}
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

                  {/* "Prefiro pagar depois" descrevia uma escolha que não
                      existe: nenhum dos dois botões cobra nada, os dois
                      gravam a mesma linha, e a única diferença real entre
                      eles é a intenção declarada. O rótulo antigo prometia
                      ao clicante do primário que ELE estaria pagando agora
                      — e não está.

                      O VALOR gravado continua 'depois', de propósito. O
                      rótulo mudou porque descrevia mal a interface; o dado
                      não mudou porque descreve bem a fila: o B2 lê
                      `payment_choice` para saber a quem mandar o link de
                      cobrança primeiro, e quem clicou aqui segue sendo
                      quem não pediu pressa. Rótulo e valor respondem a
                      perguntas diferentes. */}
                  <button
                    type="submit"
                    disabled={submitting}
                    onClick={() => {
                      escolhaRef.current = 'depois'
                    }}
                    className="btn-outline w-full text-[16px] disabled:cursor-not-allowed
                               disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    Quero saber mais antes
                  </button>

                  {/* A frase que sustenta o "Garantir minha vaga" logo
                      acima. Sem ela o botão promete uma transação que a
                      página não faz — dizer o que de fato acontece (nada
                      é cobrado, o link chega por e-mail, e até quando) é
                      o que torna o rótulo forte defensável. */}
                  <p className="text-center font-sans text-[13px] leading-[20px] text-[#345372]">
                    Nada é cobrado agora. Sua vaga fica reservada e o link de pagamento chega
                    no seu e-mail antes de{' '}
                    <strong className="font-semibold text-ink">
                      {formatarDataPorExtenso(paraDataUTC(turma.data_primeira_cobranca))}
                    </strong>
                    , data da primeira cobrança.
                  </p>
                </>
              ) : (
                /* Um botão só. Não há escolha de pagamento a oferecer quando
                   não há cobrança — e nenhuma menção a valor ou data, que
                   seriam promessa sobre uma turma que ainda não existe. */
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-brand mt-2 w-full text-[17px] disabled:cursor-not-allowed
                             disabled:opacity-60 disabled:hover:translate-y-0
                             disabled:hover:shadow-none"
                >
                  {submitting ? 'Enviando…' : 'Quero ser avisada'}
                  {!submitting && (
                    <span className="arrow-badge">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              )}

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
// CARREGAMENTO — entre abrir e saber se há turma
//
// Mantém o <h2 id={tituloId}> porque o `aria-labelledby` do dialog aponta
// para ele: sem um elemento com esse id, a modal abriria sem nome
// acessível. O texto neutro ("Um instante…") é proposital — qualquer
// promessa aqui poderia ser desmentida pela resposta que está a caminho.
// ============================================================
function TelaDeCarregamento({ tituloId }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      {/* `motion-reduce:animate-none` porque o site inteiro respeita
          prefers-reduced-motion — ver o bloco no globals.css. */}
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-rose-200
                   border-t-brand motion-reduce:animate-none"
      />
      <h2
        id={tituloId}
        className="font-display text-[18px] font-semibold leading-[1.2] text-[#022D57]"
      >
        Um instante…
      </h2>
    </div>
  )
}

// ============================================================
// TELA DE SUCESSO — substitui o conteúdo, sem fechar a modal
//
// `turma` é null quando o cadastro foi para a lista de espera. Não é
// detalhe de estilo: com turma há vaga reservada e data de início para
// prometer; sem turma há só o compromisso de avisar. Prometer errado
// aqui é a pior coisa que esta tela pode fazer.
// ============================================================
function TelaDeSucesso({ tituloId, tituloRef, turma, onFechar }) {
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
        {turma ? 'Inscrição confirmada!' : 'Recebemos seus dados!'}
      </h2>

      <p className="mt-4 font-display text-[16px] leading-[25.6px] text-[#345372]">
        {turma ? (
          /* Três frases, três acontecimentos, nesta ordem: o que já é
             verdade, o que chega por e-mail e quando, e o que chega
             depois. O texto anterior dizia "enviamos os próximos passos"
             — vago o bastante para a pessoa imaginar qualquer coisa,
             inclusive uma cobrança que não vem hoje. Cada promessa aqui
             tem alguém do outro lado obrigado a cumpri-la, e nenhuma
             delas foi acrescentada por soar bem. */
          <>
            Sua vaga está reservada. O link de pagamento chega no seu e-mail antes de{' '}
            <strong className="font-semibold text-ink">
              {formatarDataPorExtenso(paraDataUTC(turma.data_primeira_cobranca))}
            </strong>
            , data da primeira cobrança. Mais perto do início das aulas, em{' '}
            <strong className="font-semibold text-ink">
              {formatarDataPorExtenso(paraDataUTC(turma.data_inicio_aulas))}
            </strong>
            , você recebe o convite do grupo da turma no WhatsApp.
          </>
        ) : (
          <>
            Você está na lista de espera. Assim que a próxima turma abrir, avisamos você em
            primeira mão por e-mail e WhatsApp — antes de qualquer divulgação.
          </>
        )}
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
