'use client'

import { useEffect } from 'react'
import clarity from '@microsoft/clarity'

// Microsoft Clarity — heatmap e gravação de sessão.
//
// O pacote é client-only: `init` mexe em `document` e injeta o script do
// Clarity no <head>. Por isso o componente é `'use client'` e a chamada
// mora num `useEffect`, que só roda depois da hidratação — nunca no SSR.
//
// Não renderiza nada. Existe apenas para carregar o script a partir do
// layout, sem transformar o layout inteiro em client component.
const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'xxadeo3q5r'

export default function Clarity() {
  useEffect(() => {
    // Em `next dev` o efeito roda duas vezes (StrictMode) e as sessões
    // locais poluiriam o painel. Fora de produção não inicializa.
    if (process.env.NODE_ENV !== 'production') return
    if (!PROJECT_ID) return

    clarity.init(PROJECT_ID)
  }, [])

  return null
}
