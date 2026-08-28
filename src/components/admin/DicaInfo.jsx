'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from './Icones.jsx'

// ============================================================
// O "IZINHO" — a explicação que só aparece quando é pedida
//
// ⚠️ ELE NÃO É UM `title=""`. O atributo nativo não abre no toque (metade
// dos acessos ao painel são no celular), demora um segundo para aparecer
// no mouse, e não é alcançável por teclado. Um texto que só existe para
// quem tem mouse e paciência é um texto que não existe.
//
// ⚠️ E ELE ABRE NO CLIQUE, NÃO NO HOVER. Hover é gesto que não existe em
// tela de toque; abrir no clique dá o mesmo comportamento nos dois lugares
// em vez de um atalho no desktop e um beco no celular.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. O balão é o mesmo cartão das caixas
// do painel: `rounded-2xl`, `border-border-soft`, `shadow-card`.
// ============================================================

export default function DicaInfo({ rotulo, children }) {
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef(null)
  const id = useId()

  // Clicar fora fecha. Sem isso, o balão de um contador fica aberto
  // enquanto a pessoa abre o do outro, e a tela acumula explicação.
  useEffect(() => {
    if (!aberto) return

    function aoClicar(e) {
      if (!caixaRef.current?.contains(e.target)) setAberto(false)
    }
    function aoTeclar(e) {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', aoClicar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  return (
    <span ref={caixaRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        className="grid h-6 w-6 place-items-center rounded-full text-muted
                   [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
      >
        <Info />
      </button>

      {aberto && (
        <span
          id={id}
          role="note"
          className="absolute right-0 top-8 z-20 w-[260px] rounded-2xl border border-border-soft
                     bg-white px-4 py-3 text-left font-sans text-[13px] leading-[20px]
                     text-[#345372] shadow-card"
        >
          {children}
        </span>
      )}
    </span>
  )
}
