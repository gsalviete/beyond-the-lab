'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// ============================================================
// A MODAL DE CONFIRMAÇÃO DO PAINEL
//
// ⚠️ ELA EXISTE PARA AS AÇÕES QUE NÃO TÊM VOLTA BARATA — sair da sessão,
// cancelar a inscrição de alguém, desabilitar um cupom que está circulando.
// O padrão do painel para tudo o mais continua sendo o botão que age no
// clique: uma confirmação em cima de ação reversível vira ruído, e ruído é
// o que faz a confirmação da ação IRREVERSÍVEL ser dispensada no reflexo.
//
// ⚠️ E ELA NÃO É `window.confirm()`. O `confirm` nativo bloqueia a aba
// inteira, não aceita o texto que explica a consequência, e sai em inglês
// em navegador com locale inglês — que é justamente o problema que o
// painel acabou de corrigir na tela de login.
//
// ⚠️ NADA AQUI É CAMINHO ÚNICO PARA UMA AÇÃO CRÍTICA. Quem chama mantém o
// `<form>` HTML de verdade por baixo; a modal só intercepta o clique. Se o
// bundle não hidratar, o botão continua sendo um submit — o mesmo
// raciocínio que mantém o login e o abrir/fechar inscrições sem `fetch`.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. As medidas daqui são as da
// `InscricaoModal`: `bg-ink/50`, `backdrop-blur-[2px]`, raio 2xl, `p-6`.
// ============================================================

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ModalConfirmacao({ titulo, children, aoFechar }) {
  const painelRef = useRef(null)
  const tituloId = useId()

  // O foco entra na modal ao abrir. Sem isso, quem navega por teclado
  // continua no botão que ficou atrás do fundo escuro — e o Tab passeia
  // pela página inteira por baixo da modal.
  useEffect(() => {
    const painel = painelRef.current
    if (!painel) return
    const primeiro = painel.querySelector(FOCAVEIS)
    ;(primeiro ?? painel).focus()
  }, [])

  // Escape fecha, e o Tab fica preso dentro do painel. É a mesma prisão de
  // foco da `InscricaoModal`, reduzida ao que esta modal precisa.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        aoFechar()
        return
      }
      if (e.key !== 'Tab') return

      const painel = painelRef.current
      if (!painel) return

      const foco = Array.from(painel.querySelectorAll(FOCAVEIS))
      if (foco.length === 0) {
        e.preventDefault()
        return
      }

      const primeiro = foco[0]
      const ultimo = foco[foco.length - 1]
      const dentro = painel.contains(document.activeElement)

      if (e.shiftKey && (!dentro || document.activeElement === primeiro)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [aoFechar])

  // Fecha só quando o gesto COMEÇOU no fundo. Sem isso, selecionar o nome
  // dentro da modal e soltar o mouse fora fecharia a confirmação no meio.
  const inicioNoFundoRef = useRef(false)

  const conteudo = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto
                 overscroll-contain bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        inicioNoFundoRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (inicioNoFundoRef.current && e.target === e.currentTarget) aoFechar()
        inicioNoFundoRef.current = false
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-2xl border border-border-soft bg-white px-6 py-6
                   shadow-card sm:rounded-2xl"
      >
        <h2 id={tituloId} className="font-display text-[18px] font-semibold leading-[1.3] text-ink">
          {titulo}
        </h2>

        {children}
      </div>
    </div>
  )

  // `document` não existe no servidor, e este componente é renderizado
  // dentro de páginas que são Server Components — o portal só pode ser
  // montado depois que o navegador assumiu.
  if (typeof document === 'undefined') return null

  return createPortal(conteudo, document.body)
}
