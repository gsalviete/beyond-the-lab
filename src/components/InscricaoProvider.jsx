'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import InscricaoModal from './InscricaoModal.jsx'

// ============================================================
// Estado único da modal de inscrição.
//
// Por que contexto e não `useState` local como o Faq faz: existem oito
// CTAs espalhados por seis componentes, e todos abrem o MESMO formulário.
// Montar oito instâncias do form (uma por CTA, cada uma com o próprio
// `useId`) seria desperdício e deixaria oito cópias de campo no DOM. Uma
// instância só, no topo, resolve — e é ela que o portal renderiza.
// ============================================================
const InscricaoContext = createContext(null)

export function useInscricao() {
  const ctx = useContext(InscricaoContext)
  if (!ctx) {
    throw new Error('useInscricao precisa estar dentro de <InscricaoProvider>')
  }
  return ctx
}

export default function InscricaoProvider({ children }) {
  const [aberta, setAberta] = useState(false)

  // Elemento que abriu a modal. Guardado para devolver o foco no
  // fechamento — sem isso o teclado volta pro começo do documento e a
  // pessoa perde o lugar onde estava lendo.
  const gatilhoRef = useRef(null)

  // ------------------------------------------------------------
  // HISTÓRICO
  // Sem isto, o botão voltar do Android sai do site inteiro em vez de
  // fechar a modal — que é o que a pessoa espera com um overlay na tela.
  //
  // A manipulação vive AQUI, nos handlers, e não num efeito da modal. Num
  // efeito, o StrictMode do dev monta → limpa → monta de novo: o
  // `history.back()` da limpeza disparava um popstate que fechava a modal
  // no mesmo instante em que ela abria. Handler de evento não é
  // duplo-invocado, então o par push/back fica sempre casado.
  // ------------------------------------------------------------
  const empurrouRef = useRef(false)

  const abrir = useCallback(() => {
    gatilhoRef.current = document.activeElement
    window.history.pushState({ btlInscricao: true }, '')
    empurrouRef.current = true
    setAberta(true)
  }, [])

  // Fechamento pedido pela interface (Escape, backdrop, botão X, sucesso).
  // Não mexe no estado direto: desfaz a entrada de histórico e deixa o
  // popstate resultante fechar. Assim há um caminho de fechamento só, e a
  // pilha nunca acumula entrada órfã.
  const fechar = useCallback(() => {
    if (empurrouRef.current) window.history.back()
    else setAberta(false)
  }, [])

  useEffect(() => {
    const onPop = () => {
      // O navegador já removeu nossa entrada; não há mais o que desfazer.
      empurrouRef.current = false
      setAberta(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (aberta) return
    const alvo = gatilhoRef.current
    gatilhoRef.current = null
    // `document.contains` porque o CTA pode ter saído do DOM enquanto a
    // modal estava aberta — o CTA da navbar mobile some ao trocar de
    // breakpoint, e focar um nó órfão é no-op silencioso no melhor caso.
    if (alvo && typeof alvo.focus === 'function' && document.contains(alvo)) {
      alvo.focus()
    }
  }, [aberta])

  return (
    <InscricaoContext.Provider value={{ aberta, abrir, fechar }}>
      {children}
      {aberta && <InscricaoModal onFechar={fechar} />}
    </InscricaoContext.Provider>
  )
}
