import RetornoDoCheckout, { VoltarParaOSite } from '@/components/RetornoDoCheckout.jsx'

const TITLE = 'Pagamento não concluído — Beyond The Lab'

// `noindex` pelo mesmo motivo da página de sucesso — ver lá.
export const metadata = {
  title: TITLE,
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <RetornoDoCheckout tom="neutro" titulo="Você ainda não terminou o pagamento">
      {/* ⚠️ NENHUMA CULPA E NENHUMA URGÊNCIA FABRICADA. Quem chega aqui
          clicou em "voltar" na tela do cartão, ou fechou a aba. Não errou
          nada, e o tom de "sua vaga está escapando" seria pressão sobre
          alguém que talvez só tenha ido buscar o cartão na outra sala.

          ⚠️ E A SEGUNDA FRASE É A D-15 DITA PARA A PESSOA. A inscrição
          FICOU gravada, em `pendente_pagamento` — o checkout não é o que
          cria a linha, é o que a paga. Dizer "seus dados continuam
          guardados" é o que impede a pessoa de preencher o formulário
          inteiro de novo achando que perdeu tudo (e receber, na segunda
          vez, a mensagem de duplicata — que era o beco sem saída que a
          D-15 existe para fechar).

          A promessa do link por e-mail é a fila que a Giovanna trabalha à
          mão. Ela tem alguém obrigado a cumpri-la, que é o requisito de
          toda frase deste projeto. */}
      <p>
        Sem problema — seus dados continuam guardados e você não precisa preencher nada de
        novo.
      </p>
      <p className="mt-3">
        Quando quiser concluir, é só nos avisar: enviamos o link de pagamento direto para o
        seu e-mail.
      </p>

      <VoltarParaOSite variante="brand" />
    </RetornoDoCheckout>
  )
}
