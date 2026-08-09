import RetornoDoCheckout, {
  AcompanharNoInstagram,
  VoltarParaOSite,
} from '@/components/RetornoDoCheckout.jsx'

const TITLE = 'Inscrição concluída — Beyond The Lab'

// ⚠️ `noindex`, e não é zelo: esta URL é um destino de redirecionamento do
// Stripe, não uma página do site. Indexada, ela apareceria numa busca por
// "Beyond The Lab inscrição" e levaria alguém a uma tela dizendo
// "recebemos seu pagamento" sem que nada tivesse acontecido. Sem
// `openGraph` e sem `twitter` pelo mesmo motivo: não há o que compartilhar
// aqui.
export const metadata = {
  title: TITLE,
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <RetornoDoCheckout tom="bom" titulo="Tudo certo!">
      {/* ⚠️ CADA FRASE AQUI TEM QUE SER VERDADE MESMO QUE O WEBHOOK AINDA
          NÃO TENHA CHEGADO — e ele pode demorar segundos, ou minutos se o
          Stripe estiver reentregando. Por isso a página fala do que o
          navegador acabou de ver acontecer (o checkout foi concluído), e
          não do estado da inscrição no nosso banco, que ela não consultou.

          "Cartão salvo" e "sem cobrança agora" são a D-04 dita para quem
          acabou de digitar um cartão — é exatamente neste instante que a
          pessoa quer saber se saiu dinheiro da conta. Sem a frase, ela vai
          conferir o extrato; com ela, não precisa.

          ⚠️ E A DATA NÃO ENTRA NESTA TELA. Ela é da INSCRIÇÃO (D-06), não
          da safra, e esta página não sabe de quem está falando. Quem tem o
          número certo é o e-mail, disparado pelo webhook. */}
      <p>
        Recebemos sua inscrição e seu cartão foi salvo — <strong>sem nenhuma cobrança
        agora</strong>. A primeira cobrança acontece só na semana em que as aulas começam.
      </p>
      <p className="mt-3">
        Você vai receber um e-mail com a confirmação e os próximos passos. Se ele não chegar
        em alguns minutos, confira a caixa de spam.
      </p>

      <AcompanharNoInstagram />
      <VoltarParaOSite />
    </RetornoDoCheckout>
  )
}
