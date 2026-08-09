import Link from 'next/link'
import PageHeader from '@/components/PageHeader.jsx'
import Footer from '@/components/Footer.jsx'
import { INSTAGRAM_URL } from '@/config/curso'

// ============================================================
// AS DUAS PÁGINAS DE RETORNO DO STRIPE (`c39`)
//
// O Checkout é HOSPEDADO: a pessoa sai do nosso site, digita o cartão no
// domínio do Stripe e volta para uma destas duas URLs. Elas não são
// decoração — são `success_url` e `cancel_url`, e o Stripe EXIGE as duas
// na criação da sessão. Sem elas não há checkout.
//
// ⚠️ NENHUMA DAS DUAS DECIDE NADA, E ISSO É A DECISÃO.
//
// Chegar em `/inscricao/sucesso` NÃO confirma pagamento. A URL é só um
// redirecionamento do navegador: dá para digitá-la à mão, dá para
// encaminhá-la, e ela chega igual se a pessoa fechar a aba do Stripe no
// meio e voltar pelo histórico. Quem move o estado da inscrição é o
// WEBHOOK, com assinatura verificada — e é por isso que estas páginas não
// escrevem no banco, não recebem `inscricao_id`, e não afirmam nada que
// dependa de o dinheiro ter saído.
//
// O que elas fazem é o que uma tela pode fazer honestamente: dizer o que
// acabou de acontecer do lado do navegador, e para onde ir agora.
//
// ⚠️ ZERO NÚMERO NOVO NESTE ARQUIVO. Cada classe aqui já existe — as do
// bloco de sucesso da modal (`InscricaoModal.jsx`), as do `PageHeader` e
// as utilitárias do `globals.css`. Não há Figma destas duas telas, e a
// regra do repositório é que valor de layout vem do Dev Mode; a saída
// honesta é não inventar valor nenhum e montar a página com o que já foi
// medido em outro lugar.
//
// ⚠️ E NENHUMA DAS DUAS IMPRIME PREÇO, DATA OU DURAÇÃO. Não é esquecimento:
// esta página não sabe qual foi o contrato daquela pessoa (D-06 — o valor
// travado é da inscrição, não da safra), e ler a safra aqui mostraria o
// preço de hoje para quem comprou por outro. O que carrega esses números é
// o e-mail, que é disparado pelo webhook e sabe de quem está falando.
// ============================================================

/**
 * O casco compartilhado pelas duas telas.
 *
 * Um componente e não dois arquivos parecidos: as telas diferem no texto e
 * no ícone, e mais nada. Duas cópias divergiriam na primeira vez que
 * alguém ajustasse o espaçamento de uma delas.
 */
export default function RetornoDoCheckout({ tom, titulo, children, acoes }) {
  return (
    <>
      <PageHeader />

      <main className="container-page flex flex-col items-center py-16 text-center md:py-24">
        {/* Mesma marca circular da tela de sucesso da modal. `bg-rose-100`
            para o desfecho bom, `bg-border-soft` para o neutro — cancelar
            um checkout não é erro e não merece vermelho de alerta. */}
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${
            tom === 'bom' ? 'bg-rose-100 text-brand' : 'bg-border-soft text-ink/70'
          }`}
        >
          {tom === 'bom' ? <Check /> : <Relogio />}
        </span>

        <h1 className="mt-5 font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
          {titulo}
        </h1>

        {/* A mesma medida de prosa do `DocumentoLegal`: o `.container-page`
            vai até 1200px, largura péssima para duas frases centralizadas. */}
        <div className="mt-4 max-w-[720px] font-display text-[16px] leading-[25.6px] text-[#345372]">
          {children}
        </div>

        <div className="mt-8 flex w-full max-w-[420px] flex-col">{acoes}</div>
      </main>

      <Footer />
    </>
  )
}

/** Volta para a landing. Presente nas duas telas, e sempre por último. */
export function VoltarParaOSite({ variante = 'outline' }) {
  return (
    <Link
      href="/"
      className={`${variante === 'brand' ? 'btn-brand' : 'btn-outline'} mt-3 w-full text-[16px] first:mt-0`}
    >
      Voltar para o site
    </Link>
  )
}

/** O mesmo CTA da tela de sucesso da modal. */
export function AcompanharNoInstagram() {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-brand w-full text-[17px]"
    >
      Acompanhar no Instagram
    </a>
  )
}

// ------------------------------------------------------------
// Os dois ícones, inline.
//
// Não importados de `Icons.jsx` porque aquele módulo é usado pela landing
// inteira e nenhum dos dois desenhos está lá. `stroke-width` e `viewBox`
// são os mesmos dos ícones da modal — o traço tem que parecer o mesmo
// traço.
// ------------------------------------------------------------
function Check() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function Relogio() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
