// ============================================================
// TERMOS DE USO
//
// Texto homologado por advogado. O aviso de rascunho que ficava no topo
// da página saiu junto com esta nota, porque deixou de ser verdade.
//
// Mudança de redação aqui volta a ser assunto jurídico, não de código:
// este é um contrato de consumo com assinatura mensal, e o erro não
// aparece em teste, aparece em reclamação. Ajuste de texto passa pela
// revisão antes de virar commit.
//
// Os marcadores `<PREENCHER>` foram preenchidos com os dados reais da
// prestadora. O componente segue existindo em `DocumentoLegal.jsx` para
// uma revisão futura que introduza dado novo — se voltar a usá-lo,
// `grep -rn "<PREENCHER>" src` lista o que ficou pendente.
//
// Por que JSX e não Markdown: ver o comentário no topo de
// `src/content/privacidade.jsx`.
// ============================================================

import Link from 'next/link'
import { DocSecao, DocP, DocLista, DocItem, DocForte, DocEmail } from '@/components/DocumentoLegal.jsx'

export const TERMOS_ATUALIZADO_EM = '1º de agosto de 2026'

export default function ConteudoTermos() {
  return (
    <>
      <DocSecao numero={1} titulo="Quem presta o serviço">
        <DocP>
          O curso Beyond The Lab é oferecido por{' '}
          <DocForte>Giovanna Melo Freire de Castro</DocForte>, inscrita no CPF sob o nº
          167.207.067-80, com endereço na Rua Venâncio Veloso, 380, Recreio dos
          Bandeirantes, Rio de Janeiro/RJ, CEP 22790-420.
        </DocP>
        <DocP>
          Contato oficial para qualquer assunto relativo a estes Termos:{' '}
          <DocEmail>beyondthelab.rha@gmail.com</DocEmail>.
        </DocP>
      </DocSecao>

      <DocSecao numero={2} titulo="O que é o curso">
        <DocP>
          O Beyond The Lab é um curso online de inglês voltado a profissionais e estudantes
          que atuam em laboratório de reprodução humana. O conteúdo é técnico e específico
          da área: vocabulário de bancada, comunicação com equipe e pacientes, e leitura e
          discussão de artigos científicos.
        </DocP>
        <DocP>
          As aulas são <DocForte>ao vivo, por videochamada</DocForte>, em turmas reduzidas e
          separadas por nível de inglês. Não é um curso gravado: a presença da professora e
          da turma no mesmo horário é parte do que se contrata.
        </DocP>
      </DocSecao>

      <DocSecao numero={3} titulo="Duração, formato e o que está incluído">
        <DocP>
          O programa dura <DocForte>6 meses</DocForte> e é dividido em{' '}
          <DocForte>12 módulos</DocForte>. O conteúdo de cada módulo está descrito na página{' '}
          <Link
            href="/conteudo-programatico"
            className="font-semibold text-brand underline underline-offset-2 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand-deep"
          >
            Conteúdo programático
          </Link>
          .
        </DocP>
        <DocP>Está incluído na contratação:</DocP>
        <DocLista>
          <DocItem>as aulas ao vivo por videochamada, na frequência combinada com a turma;</DocItem>
          <DocItem>o material de apoio de cada módulo;</DocItem>
          <DocItem>
            a participação no grupo da turma no WhatsApp, usado para avisos e para o convite
            das aulas.
          </DocItem>
        </DocLista>
        <DocP>
          A data de início das aulas e os horários são os informados no momento da inscrição
          e no grupo da turma. Se for necessário remarcar uma aula específica, a turma é
          avisada com antecedência e a aula é reposta.
        </DocP>
      </DocSecao>

      <DocSecao numero={4} titulo="Preço e forma de pagamento">
        <DocP>
          O valor da mensalidade é o exibido na página do curso no momento da inscrição. O
          preço contratado <DocForte>não muda durante os 6 meses</DocForte> do programa.
        </DocP>
        <DocP>
          A cobrança é <DocForte>mensal e recorrente</DocForte>, feita por cartão de crédito
          através da plataforma de pagamentos Stripe. A primeira cobrança acontece na data
          informada no momento da inscrição, e as seguintes no mesmo dia dos meses
          subsequentes.
        </DocP>
        <DocP>
          <DocForte>
            Preencher o formulário de inscrição não gera cobrança nem exige dados de cartão.
          </DocForte>{' '}
          A inscrição reserva a vaga; o link de pagamento é enviado por e-mail antes da data
          da primeira cobrança, e é ao concluir esse pagamento que a contratação se efetiva.
        </DocP>
        <DocP>
          A assinatura tem prazo determinado: ela{' '}
          <DocForte>encerra automaticamente ao fim do programa</DocForte>, após a última
          mensalidade prevista. Não há renovação automática nem cobrança depois disso — não é
          preciso pedir cancelamento ao final.
        </DocP>
      </DocSecao>

      <DocSecao numero={5} titulo="Direito de arrependimento — 7 dias">
        <DocP>
          Como a contratação é feita fora de estabelecimento comercial, pela internet, você
          tem <DocForte>7 (sete) dias corridos</DocForte> para desistir, contados da data da
          contratação. É o direito de arrependimento previsto no{' '}
          <DocForte>artigo 49 do Código de Defesa do Consumidor</DocForte>.
        </DocP>
        <DocP>
          Dentro desse prazo, a desistência{' '}
          <DocForte>não precisa de justificativa</DocForte> e dá direito à{' '}
          <DocForte>devolução integral</DocForte> do valor já pago, corrigido monetariamente.
          Ter assistido às aulas do período não retira esse direito.
        </DocP>
        <DocP>
          Para exercer, basta enviar uma mensagem para{' '}
          <DocEmail>beyondthelab.rha@gmail.com</DocEmail> dizendo que deseja desistir. Não há
          formulário nem procedimento especial. O estorno é solicitado em até 5 dias úteis a
          partir do pedido, e o prazo até o dinheiro aparecer na fatura depende do
          processamento do cartão e da operadora.
        </DocP>
      </DocSecao>

      <DocSecao numero={6} titulo="Cancelamento depois dos 7 dias">
        <DocP>
          Passado o prazo de arrependimento, você pode cancelar a assinatura{' '}
          <DocForte>a qualquer momento</DocForte>, sem multa, enviando uma mensagem para{' '}
          <DocEmail>beyondthelab.rha@gmail.com</DocEmail>.
        </DocP>
        <DocP>Ao cancelar:</DocP>
        <DocLista>
          <DocItem>
            as cobranças futuras são interrompidas, e nenhuma nova mensalidade é lançada;
          </DocItem>
          <DocItem>
            o acesso às aulas e ao grupo da turma continua até o fim do período mensal já
            pago — você não perde o mês que já quitou;
          </DocItem>
          <DocItem>
            as mensalidades já vencidas e pagas não são devolvidas, por corresponderem a
            aulas já disponibilizadas.
          </DocItem>
        </DocLista>
        <DocP>
          Se um pagamento falhar e não for regularizado, o acesso às aulas e ao grupo pode
          ser suspenso após aviso prévio por e-mail.
        </DocP>
      </DocSecao>

      <DocSecao numero={7} titulo="O que se espera de você">
        <DocP>Ao participar do curso, você concorda em:</DocP>
        <DocLista>
          <DocItem>
            <DocForte>não compartilhar seu acesso</DocForte> às aulas com outra pessoa — a
            vaga é individual e as turmas são limitadas justamente para caber a atenção da
            professora em cada aluna;
          </DocItem>
          <DocItem>
            <DocForte>não distribuir o material</DocForte> do curso, nem gravar, reproduzir
            ou publicar as aulas, no todo ou em parte;
          </DocItem>
          <DocItem>
            tratar colegas e professora com respeito, dentro e fora das aulas, inclusive no
            grupo da turma;
          </DocItem>
          <DocItem>manter seus dados de contato atualizados, para não perder avisos.</DocItem>
        </DocLista>
        <DocP>
          O descumprimento grave destes itens — em especial a distribuição do material ou o
          compartilhamento de acesso — pode levar ao encerramento da participação, com aviso
          prévio e sem devolução das mensalidades já vencidas.
        </DocP>
      </DocSecao>

      <DocSecao numero={8} titulo="Material e direitos autorais">
        <DocP>
          Todo o material do curso — apostilas, slides, exercícios, gravações, o nome
          &ldquo;Beyond The Lab&rdquo; e a identidade visual — pertence a{' '}
          <DocForte>Giovanna Melo Freire de Castro</DocForte> e é protegido pela Lei de
          Direitos Autorais (Lei nº 9.610/98).
        </DocP>
        <DocP>
          Você recebe uma licença <DocForte>pessoal e intransferível</DocForte> para usar
          esse material durante e depois do curso, para o seu próprio estudo e no seu
          trabalho. O que essa licença não permite é redistribuir, revender, publicar ou usar
          o material para ministrar aulas a terceiros.
        </DocP>
      </DocSecao>

      <DocSecao numero={9} titulo="Dados pessoais">
        <DocP>
          O tratamento dos seus dados está descrito na{' '}
          <Link
            href="/privacidade"
            className="font-semibold text-brand underline underline-offset-2 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand-deep"
          >
            Política de Privacidade
          </Link>
          , que faz parte destes Termos.
        </DocP>
      </DocSecao>

      <DocSecao numero={10} titulo="Mudanças nestes Termos">
        <DocP>
          Estes Termos podem ser atualizados. Se a mudança afetar preço, duração,
          cancelamento ou qualquer condição do que você já contratou, você é avisada por
          e-mail com antecedência — e a alteração{' '}
          <DocForte>não se aplica retroativamente</DocForte> a uma contratação em curso.
        </DocP>
        <DocP>A data da versão vigente está no topo desta página.</DocP>
      </DocSecao>

      <DocSecao numero={11} titulo="Legislação e foro">
        <DocP>
          Estes Termos são regidos pelas leis brasileiras, em especial pelo Código de Defesa
          do Consumidor (Lei nº 8.078/90), pelo Marco Civil da Internet (Lei nº 12.965/14) e
          pela Lei Geral de Proteção de Dados (Lei nº 13.709/18).
        </DocP>
        <DocP>
          Qualquer questão que não se resolva pelo contato direto pode ser levada ao foro do{' '}
          <DocForte>seu domicílio</DocForte>, como assegura o artigo 101, I, do Código de
          Defesa do Consumidor.
        </DocP>
        <DocP>
          Antes disso, porém, escreva para <DocEmail>beyondthelab.rha@gmail.com</DocEmail>. A maior
          parte dos problemas se resolve numa conversa.
        </DocP>
      </DocSecao>
    </>
  )
}
