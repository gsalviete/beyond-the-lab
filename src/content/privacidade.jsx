// ============================================================
// POLÍTICA DE PRIVACIDADE
//
// Texto homologado por advogado. O aviso de rascunho que ficava no topo
// da página saiu junto com esta nota, porque deixou de ser verdade.
//
// A entrada do Stripe ainda é o gatilho de uma revisão nova: ela
// acrescenta um operador que trata dado financeiro, e isso muda o que
// esta política precisa declarar. Mudança de redação passa pela revisão
// antes de virar commit.
//
// Os marcadores `<PREENCHER>` foram preenchidos com os dados reais da
// controladora. O componente segue existindo em `DocumentoLegal.jsx`
// para uma revisão futura que introduza dado novo — se voltar a usá-lo,
// `grep -rn "<PREENCHER>" src` lista o que ficou pendente.
//
// ------------------------------------------------------------
// POR QUE JSX E NÃO MARKDOWN
//
// O pedido original era `.md` renderizado por componentes próprios,
// sem instalar biblioteca de markdown. Essas duas exigências juntas não
// se encontram: sem biblioteca, alguém tem que escrever o parser. E o
// que estes dois documentos usam — negrito no meio da frase, listas,
// links internos, e o marcador `[[PREENCHER]]` — é justamente a parte
// do markdown que dá trabalho para analisar. Seria um parser artesanal,
// com bugs próprios, mantido para servir dois arquivos estáticos.
//
// Em JSX o mesmo conteúdo é direto, e três coisas saem de graça:
// o build quebra se um componente for escrito errado, `<Link>` do Next
// faz a navegação client-side entre os dois documentos, e o
// `<PREENCHER>` vira um componente de verdade — visível na página,
// rastreável por grep, impossível de esquecer.
//
// O conteúdo continua separado da apresentação, que era o objetivo real
// do `src/content/`: este arquivo tem texto e estrutura, nenhuma classe
// de CSS. Toda decisão visual mora em `src/components/DocumentoLegal.jsx`.
// A única exceção são os dois links internos, que precisam de estilo
// inline por serem `<Link>` do Next dentro do corpo do texto.
// ------------------------------------------------------------
// ============================================================

import Link from 'next/link'
import { DocSecao, DocP, DocLista, DocItem, DocForte, DocEmail } from '@/components/DocumentoLegal.jsx'

export const PRIVACIDADE_ATUALIZADO_EM = '1º de agosto de 2026'

export default function ConteudoPrivacidade() {
  return (
    <>
      <DocSecao numero={1} titulo="Quem trata seus dados">
        <DocP>
          O controlador dos dados coletados neste site é{' '}
          <DocForte>Giovanna Melo Freire de Castro</DocForte>, inscrita no CPF sob o nº
          167.207.067-80, com endereço na Rua Venâncio Veloso, 380, Recreio dos
          Bandeirantes, Rio de Janeiro/RJ, CEP 22790-420.
        </DocP>
        <DocP>
          Para qualquer assunto sobre seus dados — dúvida, pedido de acesso, correção ou
          exclusão — o canal é <DocEmail>beyondthelab.rha@gmail.com</DocEmail>. É o mesmo
          endereço para exercer os direitos descritos no item 6.
        </DocP>
      </DocSecao>

      <DocSecao numero={2} titulo="Quais dados coletamos">
        <DocP>
          Só existe um lugar neste site onde você digita dados: o formulário de inscrição.
          Não há login, não há área do aluno e não usamos cookies de rastreamento ou
          publicidade. Fora do que você preenche ali, nada é coletado.
        </DocP>

        <DocP>
          <DocForte>O que você informa no formulário:</DocForte>
        </DocP>
        <DocLista>
          <DocItem>
            <DocForte>Nome</DocForte> — para saber com quem falamos e para a chamada da
            turma.
          </DocItem>
          <DocItem>
            <DocForte>E-mail</DocForte> — canal principal: confirmação da inscrição, link de
            pagamento e avisos sobre as aulas.
          </DocItem>
          <DocItem>
            <DocForte>WhatsApp</DocForte> — usado para enviar o convite do grupo da sua turma
            e para avisos urgentes, como uma aula remarcada em cima da hora.
          </DocItem>
          <DocItem>
            <DocForte>Nível de inglês</DocForte> (básico, intermediário ou avançado) —
            autodeclarado, não é avaliação. Serve para montar turmas de nível parecido, que é
            o que permite a aula andar no ritmo de todo mundo.
          </DocItem>
          <DocItem>
            <DocForte>Curso ou formação</DocForte> — para calibrar os exemplos e o vocabulário
            ao repertório da turma.
          </DocItem>
          <DocItem>
            <DocForte>Período</DocForte> — em que ponto da formação ou da carreira você está,
            pela mesma razão do item anterior.
          </DocItem>
          <DocItem>
            <DocForte>Disponibilidade</DocForte> (dias da semana) — existe para uma coisa só:
            encontrar horários em que a turma inteira consegue estar presente.
          </DocItem>
          <DocItem>
            <DocForte>Sua escolha entre as duas opções de inscrição</DocForte> — registra se
            você quis seguir direto ou saber mais antes, e define a ordem em que os links de
            pagamento são enviados.
          </DocItem>
        </DocLista>

        <DocP>
          <DocForte>O que o sistema registra sozinho, junto com o cadastro:</DocForte>
        </DocP>
        <DocLista>
          <DocItem>
            <DocForte>A turma</DocForte> a que sua inscrição se refere, e o{' '}
            <DocForte>status</DocForte> dela (inscrita, em lista de espera, e depois os
            estados do pagamento).
          </DocItem>
          <DocItem>
            <DocForte>O registro do seu consentimento</DocForte>: se você marcou a caixa, a
            data e hora em que marcou, e o texto exato que estava escrito ao lado dela. Esse
            último item existe porque a redação muda com o tempo, e sem guardá-la não haveria
            como saber depois com o que exatamente você concordou.
          </DocItem>
        </DocLista>

        <DocP>
          Não coletamos CPF, endereço, data de nascimento nem qualquer dado sensível. Também
          não pedimos dados de cartão: eles são digitados diretamente na página do Stripe, e
          não passam por este site nem chegam ao nosso banco de dados.
        </DocP>
      </DocSecao>

      <DocSecao numero={3} titulo="Por que podemos tratar esses dados">
        <DocP>
          A Lei Geral de Proteção de Dados exige uma base legal para cada tratamento. Aqui
          são duas:
        </DocP>
        <DocLista>
          <DocItem>
            <DocForte>Consentimento</DocForte> (art. 7º, I) — para enviar e-mails e mensagens
            sobre as turmas. É a caixa que você marca no formulário, desmarcada por padrão, e
            você pode retirar esse consentimento quando quiser, sem que isso afete o curso já
            contratado.
          </DocItem>
          <DocItem>
            <DocForte>Execução de contrato</DocForte> (art. 7º, V) — para todo o resto:
            organizar as turmas, definir horários, enviar o link de pagamento, dar acesso às
            aulas e ao grupo. São dados sem os quais o curso não acontece.
          </DocItem>
        </DocLista>
        <DocP>
          Retirar o consentimento das comunicações de divulgação não cancela a inscrição — os
          avisos operacionais da sua turma, como mudança de horário, continuam sendo enviados
          com base na execução do contrato.
        </DocP>
      </DocSecao>

      <DocSecao numero={4} titulo="Com quem seus dados são compartilhados">
        <DocP>
          Não vendemos seus dados. Não cedemos, alugamos nem trocamos sua lista de contatos
          com ninguém, em nenhuma circunstância.
        </DocP>
        <DocP>
          Usamos três serviços que, ao processar dados por nossa conta e sob nossas
          instruções, são <DocForte>operadores</DocForte> na definição da LGPD:
        </DocP>
        <DocLista>
          <DocItem>
            <DocForte>Supabase</DocForte> — onde fica o banco de dados com as inscrições. Os
            dados do formulário são gravados e lidos ali.
          </DocItem>
          <DocItem>
            <DocForte>Vercel</DocForte> — hospedagem do site. Processa as requisições que
            chegam até o formulário.
          </DocItem>
          <DocItem>
            <DocForte>Stripe</DocForte> — processamento dos pagamentos.{' '}
            <DocForte>Ainda não está em operação:</DocForte> nenhuma cobrança foi feita por
            este site até hoje. Quando entrar, os dados de cartão serão fornecidos
            diretamente ao Stripe e não passarão pelos nossos servidores; receberemos de volta
            apenas a confirmação de que o pagamento ocorreu.
          </DocItem>
        </DocLista>
        <DocP>
          Esses serviços mantêm servidores fora do Brasil, o que caracteriza transferência
          internacional de dados. Todos operam sob cláusulas contratuais de proteção
          compatíveis com a LGPD.
        </DocP>
        <DocP>
          Fora esses operadores, seus dados só seriam compartilhados por ordem judicial ou
          requisição legal — e, se isso acontecer, avisamos você, salvo se a própria ordem
          proibir.
        </DocP>
      </DocSecao>

      <DocSecao numero={5} titulo="Por quanto tempo guardamos">
        <DocP>
          Enquanto você for aluna, os dados ficam guardados. Depois do fim do curso, eles são
          mantidos por <DocForte>5 anos</DocForte>, prazo em que ainda podem ser necessários
          para questões fiscais e para eventual discussão sobre o contrato — é o prazo de
          prescrição do artigo 27 do Código de Defesa do Consumidor.
        </DocP>
        <DocP>
          Se você entrou apenas na <DocForte>lista de espera</DocForte> e nunca se
          matriculou, guardamos seu contato por <DocForte>2 anos</DocForte> a partir do
          cadastro, ou até você pedir a exclusão — o que vier primeiro.
        </DocP>
        <DocP>
          Passados esses prazos, os dados são apagados definitivamente do banco. Pedidos de
          exclusão feitos antes disso são atendidos conforme o item 6, com a ressalva dos
          registros que a lei obriga a manter.
        </DocP>
      </DocSecao>

      <DocSecao numero={6} titulo="Seus direitos">
        <DocP>
          O artigo 18 da LGPD garante a você, a qualquer momento e sem custo, o direito de:
        </DocP>
        <DocLista>
          <DocItem>saber se tratamos dados seus e acessar tudo o que temos;</DocItem>
          <DocItem>corrigir dado incompleto, desatualizado ou errado;</DocItem>
          <DocItem>
            pedir a exclusão dos dados tratados com base no consentimento, ou o bloqueio e a
            anonimização de dado desnecessário ou tratado em desacordo com a lei;
          </DocItem>
          <DocItem>
            receber seus dados num formato legível, para levá-los a outro fornecedor
            (portabilidade);
          </DocItem>
          <DocItem>
            saber com quem compartilhamos seus dados — a lista completa está no item 4;
          </DocItem>
          <DocItem>
            retirar o consentimento das comunicações, e saber o que acontece se não consentir;
          </DocItem>
          <DocItem>opor-se a um tratamento que você considere irregular.</DocItem>
        </DocLista>
        <DocP>
          Para exercer qualquer um deles, escreva para{' '}
          <DocEmail>beyondthelab.rha@gmail.com</DocEmail>. Respondemos em até{' '}
          <DocForte>15 dias</DocForte>. Podemos pedir uma confirmação de identidade antes de
          entregar ou apagar dados — é uma proteção sua, para que ninguém peça isso no seu
          lugar.
        </DocP>
        <DocP>
          Se a resposta não resolver, você pode reclamar à Autoridade Nacional de Proteção de
          Dados (ANPD).
        </DocP>
      </DocSecao>

      <DocSecao numero={7} titulo="Segurança">
        <DocP>
          O site trafega inteiramente por conexão criptografada (HTTPS). O acesso ao banco de
          dados é feito apenas pelo servidor, com credencial que não é exposta ao navegador, e
          a tabela de inscrições não é acessível publicamente.
        </DocP>
        <DocP>
          Nenhum sistema é infalível. Se acontecer um incidente de segurança que possa trazer
          risco relevante a você, avisamos você e a ANPD, como manda o artigo 48 da LGPD.
        </DocP>
      </DocSecao>

      <DocSecao numero={8} titulo="Mudanças nesta Política">
        <DocP>
          Esta Política pode ser atualizada — a entrada do Stripe em operação, por exemplo,
          vai exigir revisão do item 4. Mudança relevante é comunicada por e-mail a quem está
          cadastrado. A data da versão vigente está no topo desta página.
        </DocP>
        <DocP>
          As condições da contratação estão nos{' '}
          <Link
            href="/termos"
            className="font-semibold text-brand underline underline-offset-2 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand-deep"
          >
            Termos de Uso
          </Link>
          .
        </DocP>
      </DocSecao>
    </>
  )
}
