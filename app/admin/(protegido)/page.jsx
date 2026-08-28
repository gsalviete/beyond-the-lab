import Link from 'next/link'
import DicaInfo from '@/components/admin/DicaInfo.jsx'
import { ChevronRight } from '@/components/Icons.jsx'
import { contarPorStatus } from '@/lib/supabase'

// ============================================================
// A PÁGINA INICIAL DO PAINEL (`c64`) — contadores e o que exige ação
//
// ⚠️ ELA SE CHAMAVA "HOJE". O nome descrevia a intenção — "o que mudou
// desde ontem" — e não o destino: no menu, "Hoje" não dizia para onde
// levava. O arquivo continua sendo o `c64`; o que mudou foi a palavra na
// tela e no menu, nas duas ao mesmo tempo.
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
      {/* ⚠️ "PÁGINA INICIAL" E NÃO "HOJE". O nome antigo descrevia a
          intenção da tela para quem a desenhou; para quem a usa, ele era um
          rótulo que não dizia para onde levava. "Página inicial" é onde a
          pessoa sabe que volta quando se perde — e o menu diz a mesma
          palavra, que é o que faz os dois serem o mesmo lugar. */}
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Página inicial
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
                  className="group inline-flex items-center gap-1 font-semibold text-brand
                             underline underline-offset-2
                             [transition:color_var(--motion-fast)_var(--ease-out)]
                             hover:text-brand-deep"
                >
                  Mandar o link de pagamento
                  {/* ⚠️ A SETA ANDA UM PASSO NO HOVER, e o passo é curto de
                      propósito. Esta frase é a única ação da tela inteira —
                      o movimento existe para ela ser reconhecida como
                      clicável antes de ser lida, não para chamar atenção.
                      `group-hover` porque o alvo é o link inteiro; uma seta
                      que só reage quando o cursor está exatamente em cima
                      dela reage quase nunca. */}
                  <ChevronRight
                    className="h-4 w-4 [transition:transform_var(--motion-fast)_var(--ease-out)]
                               group-hover:translate-x-0.5 motion-reduce:transition-none
                               motion-reduce:group-hover:translate-x-0"
                  />
                </Link>
                .
              </p>
            </div>
          )}

          {/* ⚠️ OS QUATRO CONTAM PESSOAS, e a unidade está escrita ao lado
              do número. Um "10" solto numa caixa chamada "Lista de espera"
              pode ser dez pessoas, dez dias de espera ou dez vagas — e as
              três leituras levam a decisões diferentes. */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Contador rotulo="Lista de espera" valor={contagens.listaEspera} />
            <Contador rotulo="Cartões salvos" valor={contagens.confirmadas} />
            <Contador rotulo="Pessoas pagando" valor={contagens.ativas} />
            <Contador
              rotulo="Inadimplentes"
              valor={contagens.inadimplentes}
              dica="O que conta como inadimplente"
            >
              {/* ⚠️ A EXPLICAÇÃO DIZ O QUE O STRIPE FAZ, e não o que a
                  palavra sugere. "Inadimplente" soa como dívida a cobrar;
                  aqui é uma cobrança que o cartão recusou e que o Stripe
                  ainda está retentando sozinho. Na maioria das vezes
                  resolve sem ninguém fazer nada — e é por isso que esta
                  caixa NÃO é a fila de ação da tela. */}
              A cobrança do mês foi recusada pelo cartão. O Stripe tenta de novo sozinho por alguns
              dias; se todas as tentativas falharem, a assinatura para. Vale falar com a pessoa
              quando o número não cair depois de uma semana.
            </Contador>
          </div>
        </>
      )}

      {/* ⚠️ BOTÃO, E NÃO UM LINK NO MEIO DE UMA FRASE. Criar cupom é a
          única coisa que se faz a partir daqui sem ser em resposta a um
          número da tela — e um link sublinhado dentro de um parágrafo lê
          como nota de rodapé, não como a ação que é. */}
      <div className="mt-8">
        <Link
          href="/admin/cupons"
          className="inline-flex items-center rounded-full bg-brand px-5 py-2.5 font-sans
                     text-[15px] font-semibold text-white shadow-pill
                     [transition:background-color_var(--motion-fast)_var(--ease-out)]
                     hover:bg-brand-deep"
        >
          Criar cupons
        </Link>
        <p className="mt-2 font-sans text-[14px] leading-[22px] text-muted">
          Criar, desabilitar e acompanhar o uso.
        </p>
      </div>
    </>
  )
}

/**
 * ⚠️ `Cartões salvos` e não `Confirmadas`; `Pessoas pagando` e não `Ativas`.
 *
 * Os nomes do banco são precisos e não são os dela. `confirmada` significa
 * "cartão salvo, cobrança agendada, ninguém pagou ainda" — e a palavra
 * sozinha sugere o contrário. Pela D-07 o painel é a única ferramenta da
 * Giovanna; se ela precisar aprender o vocabulário do schema para lê-lo, a
 * ferramenta falhou. A tradução mora aqui, na borda, e o banco continua
 * falando o idioma dele.
 */
function Contador({ rotulo, valor, dica, children }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white px-5 py-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-[14px] text-muted">{rotulo}</p>
        {/* O "izinho" só aparece onde o rótulo sozinho engana. Um em cada
            caixa seria quatro convites a não ler nenhum. */}
        {dica && <DicaInfo rotulo={dica}>{children}</DicaInfo>}
      </div>
      <p className="mt-1 font-display text-[28px] font-semibold leading-[1.2] text-[#022D57]">
        {valor}{' '}
        <span className="font-sans text-[14px] font-normal text-muted">
          {valor === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </p>
    </div>
  )
}
