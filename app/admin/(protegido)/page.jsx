import Link from 'next/link'
import { contarPorStatus } from '@/lib/supabase'

// ============================================================
// A VISÃO DE HOJE (`c64`) — contadores e o que exige ação
//
// ⚠️ ELA EXISTE PARA UMA PERGUNTA SÓ: "tem alguma coisa esperando por
// mim?". Um painel que abre numa lista de tudo obriga a Giovanna a
// procurar o que mudou; este abre no que precisa dela.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. Nenhuma medida nova aqui: os
// tamanhos, as cores e os raios saem de classe já medida na landing.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function Page() {
  let contagens = null
  let erro = false

  try {
    contagens = await contarPorStatus()
  } catch (err) {
    // ⚠️ A TELA DIZ QUE NÃO SABE, em vez de mostrar zero. Um zero é
    // exatamente o que faz alguém não olhar de novo — e "nenhuma
    // pendência" é a mensagem mais cara que este painel pode dar errada.
    console.error('[admin] falha ao contar', err)
    erro = true
  }

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Hoje
      </h1>

      {erro ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-border-soft bg-white px-5 py-4 font-sans
                     text-[14px] leading-[22px] text-ink shadow-soft"
        >
          Não conseguimos ler os números agora. Recarregue em instantes — nada foi perdido.
        </p>
      ) : (
        <>
          {/* ⚠️ A FILA DA D-15 VEM PRIMEIRO E SOZINHA, e não é ordem
              estética. Quem está em `pendente_pagamento` NÃO TEM COMO SAIR
              SOZINHA: não sabe que está pendente, e refazer o formulário
              devolve "você já está inscrita". Misturada aos outros
              contadores, ela vira mais um número; aqui ela é a única coisa
              da tela que pede uma ação. */}
          {contagens.pendentes > 0 && (
            <div className="mt-6 rounded-2xl border border-border-soft bg-rose-100 px-5 py-4">
              <p className="font-display text-[18px] font-semibold text-ink">
                {contagens.pendentes}{' '}
                {contagens.pendentes === 1
                  ? 'pessoa começou o pagamento e não terminou'
                  : 'pessoas começaram o pagamento e não terminaram'}
              </p>
              <p className="mt-2 font-sans text-[14px] leading-[22px] text-[#345372]">
                Elas não conseguem resolver isso sozinhas — o formulário responde que já estão
                inscritas.{' '}
                <Link
                  href="/admin/pendentes"
                  className="font-semibold text-brand underline underline-offset-2"
                >
                  Mandar o link de pagamento
                </Link>
                .
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Contador rotulo="Lista de espera" valor={contagens.listaEspera} />
            <Contador rotulo="Cartão salvo" valor={contagens.confirmadas} />
            <Contador rotulo="Pagando" valor={contagens.ativas} />
            <Contador rotulo="Inadimplentes" valor={contagens.inadimplentes} />
          </div>
        </>
      )}

      <p className="mt-8 font-sans text-[15px] leading-[24px] text-[#345372]">
        <Link href="/admin/cupons" className="font-semibold text-brand underline underline-offset-2">
          Cupons
        </Link>{' '}
        — criar, desligar e acompanhar o uso.
      </p>
    </>
  )
}

/**
 * ⚠️ `Cartão salvo` e não `Confirmada`; `Pagando` e não `Ativa`.
 *
 * Os nomes do banco são precisos e não são os dela. `confirmada` significa
 * "cartão salvo, cobrança agendada, ninguém pagou ainda" — e a palavra
 * sozinha sugere o contrário. Pela D-07 o painel é a única ferramenta da
 * Giovanna; se ela precisar aprender o vocabulário do schema para lê-lo, a
 * ferramenta falhou. A tradução mora aqui, na borda, e o banco continua
 * falando o idioma dele.
 */
function Contador({ rotulo, valor }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white px-5 py-4 shadow-soft">
      <p className="font-sans text-[14px] text-muted">{rotulo}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-[1.2] text-[#022D57]">
        {valor}
      </p>
    </div>
  )
}
