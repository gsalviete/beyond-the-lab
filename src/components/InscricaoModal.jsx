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
// As opções dos quatro campos de escolha saíram daqui para `dominio.ts`,
// pelo mesmo motivo que a frase do consentimento saiu: eram uma das
// quatro cópias dos mesmos valores (aqui, no Zod, no `email.ts` e no
// CHECK do SQL), mantidas em fase por disciplina — que é o que funciona
// até não funcionar.
//
// ⚠️ Importamos as OPÇÕES, não o schema. `src/config/schemas.ts` puxaria
// o Zod inteiro para o bundle do navegador, onde hoje ele não está. A
// validação daqui é um punhado de `if` de propósito: ela existe para dar
// retorno imediato, não para decidir — quem decide é o servidor, e é lá
// que o rigor mora. Ver o cabeçalho de `schemas.ts`.
import {
  CURSOS,
  OPCOES_DIA_SEMANA,
  OPCOES_NIVEL_INGLES,
  OUTRO,
  PERIODOS,
} from '@/config/dominio'
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

  // A safra mais recente, ou null se não houver nenhuma. É ortogonal ao
  // `status` acima — continua valendo durante o envio e na tela de
  // sucesso, que precisa da data de início das aulas.
  //
  // ⚠️ NÃO é mais "a turma aberta". A rota passou a devolver a safra de
  // vitrine sempre, aberta ou não (D-13), porque fechar as inscrições não
  // pode apagar preço e data do site. Quem decide o MODO da modal agora é
  // o campo `inscricoes_abertas`, logo abaixo — trocar `safra !== null`
  // por ele foi obrigatório no c20: sem a troca, com as inscrições
  // fechadas a modal prometeria "sua vaga está reservada" para todo
  // mundo, que é a pior mentira que esta tela pode contar.
  const [safra, setSafra] = useState(null)

  const [telefone, setTelefone] = useState('')
  const [nivel, setNivel] = useState('')
  const [curso, setCurso] = useState('')
  const [cursoOutro, setCursoOutro] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [periodoOutro, setPeriodoOutro] = useState('')
  const [dias, setDias] = useState([])
  const [consentimento, setConsentimento] = useState(false)

  // O que de fato vai para a coluna: o rótulo escolhido, ou o texto digitado
  // quando a escolha foi "Outro". Resolver aqui mantém o handleSubmit lendo
  // uma variável só e o corpo do POST com o mesmo formato de sempre.
  //
  // ⚠️ ESTAS DUAS LINHAS SÃO O MOTIVO DE `curso` E `periodo` NÃO SEREM
  // `z.enum` NO SERVIDOR, e é aqui que a derivação do domínio parece
  // errada sem ser.
  //
  // `CURSOS` e `PERIODOS` vêm de `dominio.ts`, mas o que sai no POST não é
  // necessariamente um deles: escolhendo "Outro", sai o que a pessoa
  // digitou — "Fonoaudiologia", "6º semestre". A lista é o que a UI
  // OFERECE; o schema é o que o servidor ACEITA, e onde há "Outro" os dois
  // divergem de propósito. Fechar `curso` num enum "para ficar coerente"
  // recusaria exatamente as pessoas cujo curso não está na lista — que são
  // a razão de o campo de texto existir. Ver o topo de `dominio.ts`.
  const cursoFinal = curso === OUTRO ? cursoOutro.trim() : curso
  const periodoFinal = periodo === OUTRO ? periodoOutro.trim() : periodo

  const carregando = status === 'carregando'
  const submitting = status === 'submitting'
  const sucesso = status === 'success'
  // `=== true` e não coerção: `safra` pode ser null, e um corpo de
  // resposta inesperado (ou uma versão antiga da rota em cache) não deve
  // conseguir abrir o formulário de inscrição por acidente. Só o booleano
  // verdadeiro, vindo do servidor, abre.
  const inscricaoAberta = safra?.inscricoes_abertas === true

  // `onFechar` numa ref para o efeito de teclado poder rodar uma única vez
  // (array de dependências vazio) sem capturar uma versão velha da função.
  // Quem cuida da entrada de histórico é o provider — ver o comentário lá
  // sobre por que essa lógica não pode viver num efeito daqui.
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar

  const pedirFechamento = useCallback(() => onFecharRef.current(), [])

  // ------------------------------------------------------------
  // QUAL É A SAFRA, E SE ELA ESTÁ ABERTA
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

    fetch('/api/safra-ativa', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelado) return
        setSafra(body?.safra ?? null)
        setStatus('idle')
      })
      .catch(() => {
        if (cancelado) return
        setSafra(null)
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
    const website = String(dados.get('website') ?? '')

    // Sem turma aberta não há escolha de pagamento para fazer — não existe
    // cobrança a adiantar. O servidor descarta este campo nesse caso de
    // qualquer jeito; mandamos 'depois' para o corpo dizer a verdade.
    //
    // Com turma aberta sobrou um botão só, então é sempre 'agora'. O campo
    // continua no corpo porque a coluna `payment_choice` existe, o schema da
    // rota a exige, e é ela que o B2 lê para ordenar a fila de cobrança.
    const escolha = inscricaoAberta ? 'agora' : 'depois'

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
    if (!curso) {
      setErro('Selecione o seu curso.')
      return
    }
    // Só cobrado quando a escolha foi "Outro" — nas demais o rótulo da lista
    // já satisfaz o min(2) do schema por construção.
    if (cursoFinal.length < 2 || cursoFinal.length > 100) {
      setErro('Digite o nome do seu curso.')
      return
    }
    if (!periodo) {
      setErro('Selecione o seu período.')
      return
    }
    if (periodoFinal.length < 1 || periodoFinal.length > 40) {
      setErro('Digite o seu período.')
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
          curso: cursoFinal,
          periodo: periodoFinal,
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
            inscricaoAberta={inscricaoAberta}
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
                <CampoSelect
                  id={nivelId}
                  name="nivel_ingles"
                  valor={nivel}
                  aoMudar={setNivel}
                  opcoes={OPCOES_NIVEL_INGLES}
                  disabled={submitting}
                />
              </div>

              {/* CURSO — era texto livre. A lista fecha a grafia; ver `dominio.ts`. */}
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={cursoId} className={LABEL}>
                  Curso
                </label>
                <CampoSelect
                  id={cursoId}
                  name="curso"
                  valor={curso}
                  aoMudar={setCurso}
                  opcoes={CURSOS}
                  disabled={submitting}
                />
                {curso === OUTRO && (
                  <input
                    id={`${cursoId}-outro`}
                    name="curso_outro"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    autoFocus
                    aria-label="Qual curso?"
                    placeholder="Qual curso?"
                    disabled={submitting}
                    value={cursoOutro}
                    onChange={(e) => setCursoOutro(e.target.value)}
                    className={FIELD}
                  />
                )}
              </div>

              {/* PERÍODO — 'Já formada(o)' é uma das opções, e o campo NÃO
                  some quando ela é escolhida: ele é a única pergunta que faz
                  essa distinção, então escondê-lo apagaria a própria resposta
                  que acabou de ser dada e o envio cairia no `!periodo`. */}
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={periodoId} className={LABEL}>
                  Período
                </label>
                <CampoSelect
                  id={periodoId}
                  name="periodo"
                  valor={periodo}
                  aoMudar={setPeriodo}
                  opcoes={PERIODOS}
                  disabled={submitting}
                />
                {periodo === OUTRO && (
                  <input
                    id={`${periodoId}-outro`}
                    name="periodo_outro"
                    type="text"
                    required
                    maxLength={40}
                    autoFocus
                    aria-label="Qual período?"
                    placeholder="Qual período?"
                    disabled={submitting}
                    value={periodoOutro}
                    onChange={(e) => setPeriodoOutro(e.target.value)}
                    className={FIELD}
                  />
                )}
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
                {/* Eram cinco itens em `flex-wrap`: com larguras diferentes
                    ("Segunda" x "Terça") caíam 3 na primeira linha e 2 na
                    segunda, cada caixa começando num x diferente. Em grid de
                    duas colunas as caixas se alinham em coluna, porque cada
                    item ocupa a largura inteira da sua célula.
                    `lg:` volta ao flex-wrap, que é o que está validado no
                    desktop. O gap é o mesmo dos dois eixos que já havia. */}
                <div className="mt-1 grid grid-cols-2 gap-x-5 gap-y-3 pl-5 lg:flex lg:flex-wrap">
                  {OPCOES_DIA_SEMANA.map((dia) => {
                    const diaId = `${id}-dia-${dia.valor}`
                    return (
                      <label
                        key={dia.valor}
                        htmlFor={diaId}
                        className="flex w-full cursor-pointer items-center gap-2 lg:w-auto"
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
                  <button
                    type="submit"
                    disabled={submitting}
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

                  {/* A frase que sustenta o "Garantir minha vaga" logo
                      acima. Sem ela o botão promete uma transação que a
                      página não faz — dizer o que de fato acontece é o que
                      torna o rótulo forte defensável.

                      Não cita mais `data_primeira_cobranca`: a data virava
                      compromisso com dia marcado, e o envio do link passou a
                      acompanhar o início da turma. Os outros dois canais
                      entram aqui porque é por eles que o aviso realmente
                      sai. */}
                  <p className="text-center font-sans text-[13px] leading-[20px] text-[#345372]">
                    Nada é cobrado agora. O link de pagamento é enviado por e-mail mais perto
                    do início da turma, e também avisamos pelo WhatsApp e nas redes sociais.
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
// SELECT — a marcação que era só do "Nível de inglês", agora compartilhada
//
// Extraída, e não copiada, quando Curso e Período viraram select: três
// cópias do mesmo par <select> + chevron divergiriam no primeiro ajuste de
// padding. É o estilo único de select do projeto — SELECT, o ChevronRight
// rotacionado e a cor de placeholder saem todos daqui.
//
// `opcoes` aceita string simples (o rótulo é o próprio valor gravado) ou
// { valor, rotulo } para quando os dois diferem, que é o caso do nível de
// inglês: a coluna guarda 'basico', a tela mostra 'Básico'.
// ============================================================
function CampoSelect({ id, name, valor, aoMudar, opcoes, disabled }) {
  const itens = opcoes.map((o) => (typeof o === 'string' ? { valor: o, rotulo: o } : o))

  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        required
        disabled={disabled}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        /* text-muted enquanto vazio faz a opção "Selecione" ler como
           placeholder, igual aos campos de texto ao lado. */
        className={`${SELECT} ${valor ? 'text-ink' : 'text-muted'}`}
      >
        <option value="" disabled>
          Selecione
        </option>
        {itens.map((o) => (
          <option key={o.valor} value={o.valor} className="text-ink">
            {o.rotulo}
          </option>
        ))}
      </select>
      {/* ChevronRight a 90° é a seta para baixo — mesmo princípio do Plus a
          45° virando X: asset existente, rotacionado, em vez de SVG novo.
          `pointer-events-none` para o clique atravessar e abrir o select, e
          aria-hidden porque é decoração. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-ink"
      >
        <ChevronRight className="h-4 w-4 rotate-90" />
      </span>
    </div>
  )
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
// `inscricaoAberta` é false quando o cadastro foi para a lista de espera.
// Não é detalhe de estilo: com inscrição aberta há vaga reservada e data
// de início para prometer; sem ela há só o compromisso de avisar.
// Prometer errado aqui é a pior coisa que esta tela pode fazer.
//
// Antes esta tela recebia o objeto da turma e ramificava na existência
// dele. Não dá mais: depois do c20 a safra existe mesmo com as inscrições
// fechadas (D-13), e ramificar na existência colocaria "sua vaga está
// reservada" na frente de quem entrou na lista de espera. A pergunta que
// esta tela faz sempre foi booleana; agora ela recebe o booleano.
// ============================================================
function TelaDeSucesso({ tituloId, tituloRef, inscricaoAberta, onFechar }) {
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
        {inscricaoAberta ? 'Inscrição confirmada!' : 'Recebemos seus dados!'}
      </h2>

      <p className="mt-4 font-display text-[16px] leading-[25.6px] text-[#345372]">
        {inscricaoAberta ? (
          /* Três frases, três acontecimentos, nesta ordem: o que já é
             verdade, o que chega por e-mail e quando, e o que chega
             depois. O texto anterior dizia "enviamos os próximos passos"
             — vago o bastante para a pessoa imaginar qualquer coisa,
             inclusive uma cobrança que não vem hoje. Cada promessa aqui
             tem alguém do outro lado obrigado a cumpri-la, e nenhuma
             delas foi acrescentada por soar bem.

             A promessa de pagamento passou a ser a MESMA do rodapé do
             formulário, palavra por palavra. Antes esta tela prometia o
             link "antes de {data_primeira_cobranca}" e o formulário
             prometia outra coisa — duas promessas diferentes sobre o
             mesmo evento, para a mesma pessoa, com dois minutos de
             diferença. A data de início das aulas fica, que é fato de
             calendário e não promessa de cobrança. */
          <>
            Sua vaga está reservada. O link de pagamento é enviado por e-mail mais perto do
            início da turma, e também avisamos pelo WhatsApp e nas redes sociais. As aulas
            começam na{' '}
            {/* ⚠️ Texto literal, não mais `turma.data_inicio_aulas`: a turma
                começa na primeira semana de setembro, com o dia escolhido pela
                aluna, e uma coluna `date` não representa isso. Mesma troca em
                `email.ts`, para as duas superfícies dizerem a mesma coisa.
                O import de `formatarDataPorExtenso`/`paraDataUTC` fica: volta a
                ser usado quando a migração do campo por extenso for feita. */}
            <strong className="font-semibold text-ink">
              primeira semana de setembro de 2026
            </strong>
            , e é perto do início que você recebe o convite do grupo da turma no WhatsApp.
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
