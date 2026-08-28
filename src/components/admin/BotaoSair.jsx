'use client'

import { useRef, useState } from 'react'
import ModalConfirmacao from './ModalConfirmacao.jsx'

// ============================================================
// SAIR DO PAINEL — com pergunta antes
//
// ⚠️ SAIR É BARATO DE DESFAZER E CARO NA HORA ERRADA. Não se perde dado:
// perde-se a sessão no meio de uma alocação, de um cupom pela metade, de
// uma lista aberta — e voltar custa o login inteiro de novo. O botão fica
// a um pixel do e-mail no canto, que é o canto onde o mouse passa sem
// querer. A pergunta é barata; o clique acidental não é.
//
// ⚠️ VERMELHO NO HOVER, e é o único lugar do casco do painel com essa cor.
// Vermelho aqui significa "esta ação te tira daqui" — o mesmo vocabulário
// do "Cancelar inscrição" na ficha. Se um dia um terceiro botão ficar
// vermelho sem ser destrutivo, a cor deixa de querer dizer alguma coisa.
//
// ⚠️ E O `<form>` CONTINUA SENDO POST HTML DE VERDADE. A modal intercepta
// o clique; sem JavaScript, o botão é o submit que sempre foi e o logout
// acontece direto — pelo mesmo motivo que a rota é POST e não link: um
// link de logout é disparado por prefetch e por antivírus corporativo.
// ============================================================

export default function BotaoSair() {
  const formRef = useRef(null)
  const [perguntando, setPerguntando] = useState(false)

  return (
    <form ref={formRef} action="/api/admin/sair" method="post">
      <button
        type="submit"
        onClick={(e) => {
          e.preventDefault()
          setPerguntando(true)
        }}
        className="rounded-full px-3 py-2 font-sans text-[14px] font-medium text-ink/80
                   [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-red-600"
      >
        Sair
      </button>

      {perguntando && (
        <ModalConfirmacao titulo="Sair do painel?" aoFechar={() => setPerguntando(false)}>
          <p className="mt-2 font-sans text-[14px] leading-[22px] text-[#345372]">
            Você vai precisar entrar de novo com e-mail e senha. Nada do que já foi salvo se perde.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {/* ⚠️ `type="button"` e `form.requestSubmit()`: a modal é
                renderizada por um portal, então este botão está FORA do
                `<form>` no DOM e um `type="submit"` não enviaria nada.
                `requestSubmit` e não `submit` porque o primeiro respeita a
                validação e o `onsubmit` do formulário — aqui não há nenhum
                dos dois, e é assim que continua se um dia houver. */}
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              className="rounded-full bg-red-600 px-4 py-2 font-sans text-[14px] font-semibold
                         text-white [transition:background-color_var(--motion-fast)_var(--ease-out)]
                         hover:bg-red-700"
            >
              Sim, sair
            </button>

            <button
              type="button"
              onClick={() => setPerguntando(false)}
              className="rounded-full border border-border-soft px-4 py-2 font-sans text-[14px]
                         font-medium text-ink"
            >
              Ficar no painel
            </button>
          </div>
        </ModalConfirmacao>
      )}
    </form>
  )
}
