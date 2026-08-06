import { buscarSafraDeVitrine } from '@/lib/supabase'
import ScrollReveal from '@/components/ScrollReveal.jsx'
import Navbar from '@/components/Navbar.jsx'
import Hero from '@/components/Hero.jsx'
import PainPoints from '@/components/PainPoints.jsx'
import Personas from '@/components/Personas.jsx'
import Skills from '@/components/Skills.jsx'
import Timeline from '@/components/Timeline.jsx'
import Teacher from '@/components/Teacher.jsx'
import Pricing from '@/components/Pricing.jsx'
import Faq from '@/components/Faq.jsx'
import FinalCta from '@/components/FinalCta.jsx'
import Footer from '@/components/Footer.jsx'

// ============================================================
// A LANDING PASSA A LER O BANCO — e continua ESTÁTICA (D-13)
//
// `revalidate = 60` e NÃO `force-dynamic`, e a diferença é a decisão
// inteira: "sem deploy" nunca exigiu "sem cache", exigiu que a Giovana
// não dependa de um commit para mudar o preço. Ela muda `valor_mensal`
// no Studio e a página acompanha em até um minuto, servida do cache o
// tempo todo. `force-dynamic` renderizaria a landing a cada visita, uma
// consulta ao banco por pessoa, para ganhar 60 segundos que ninguém pediu.
//
// ⚠️ A CONSULTA IGNORA `inscricoes_abertas`, e isso é a D-13.
//
// `buscarSafraDeVitrine` devolve a safra de `data_inicio_aulas` mais
// recente, aberta ou não. São duas perguntas diferentes e elas foram
// separadas de propósito: "quanto custa e quanto dura" é informação de
// VITRINE e não pode sumir da página nunca; "dá para comprar agora" é
// estado de operação e governa só o CTA — quem responde àquela é
// `/api/safra-ativa`, com outro cliente e sem cache nenhum. Amarradas na
// mesma flag, fechar as inscrições apagava o preço do site junto: o
// efeito colateral que ninguém pediu.
//
// A página mostra o que o curso CUSTA HOJE. Não é o que alguém paga:
// quem já assinou tem valor e duração travados na própria assinatura
// (D-06), e mexer na safra depois não afeta quem já entrou. As duas
// coisas nunca se encontram nesta tela.
// ============================================================
export const revalidate = 60

/**
 * O que a landing precisa saber da safra, e só isso.
 *
 * ⚠️ O corte acontece DUAS vezes, e não é redundância. A consulta já
 * seleciona só duas colunas (`buscarSafraDeVitrine`), e aqui elas são
 * nomeadas uma a uma em vez de `<Pricing {...safra} />`. O primeiro
 * corte é o que impede `id`, `inscricoes_abertas` e `vagas_total` de
 * saírem do banco; o segundo é o que impede que uma coluna acrescentada
 * à consulta no futuro — pelo `c23`, por exemplo — vá parar no HTML de
 * uma página pública sem ninguém decidir. É o princípio de toda
 * travessia de fronteira do projeto (REPORT §9.6), aplicado à fronteira
 * servidor → componente.
 *
 * As datas NÃO estão aqui de propósito: `data_inicio_aulas` continua
 * sendo texto literal na tela até o `c23`, que tem regra própria (D-14 —
 * "na semana de dd/mm/yyyy", nunca a data seca).
 *
 * ============================================================
 * ⚠️ SE NÃO HÁ SAFRA, O BUILD FALHA. É DE PROPÓSITO.
 * ============================================================
 *
 * As três alternativas foram consideradas e todas mentem:
 *
 *   - esconder o preço → a página perde a informação que a pessoa veio
 *     buscar, e "sumiu o preço" é indistinguível de "o curso acabou";
 *   - desenhar placeholder ("—", "consulte") → promete que existe um
 *     valor que ninguém sabe dizer, no lugar da página onde se compra;
 *   - cair para um literal → é exatamente o que este commit remove, e a
 *     D-13 proíbe literal de preço ou duração INCLUSIVE COMO FALLBACK.
 *
 * Sobra falhar alto. Uma landing que não consegue afirmar quanto custa
 * o curso não deve ser publicada, e o momento certo de descobrir isso é
 * o deploy — não o primeiro visitante.
 *
 * ⚠️ ISTO NÃO DERRUBA O SITE NO AR. Build que falha é deploy que não
 * acontece: a versão anterior continua servindo, com o último preço bom.
 * O mesmo vale para a revalidação — se a consulta falhar aos 60
 * segundos, o Next mantém a página gerada por último e tenta de novo
 * depois. É o comportamento default da ISR e é por isso que não há
 * try/catch aqui: não existe nada melhor a fazer do que deixar o erro
 * subir.
 *
 * ⚠️ A TENSÃO, DECLARADA: servir preço desatualizado por até 60 segundos
 * é aceito conscientemente. O que torna isso aceitável é a janela ser
 * curta e o valor exibido ter sido VERDADEIRO em algum momento recente.
 * Um literal no código é pior na mesma dimensão e sem defesa nenhuma —
 * ele não tem janela: mente desde a hora em que a Giovana mudou o preço
 * até alguém lembrar de fazer um commit. Era a tensão 8.1 do `REPORT.md`,
 * a única em que o sistema podia dizer algo falso a quem está comprando,
 * e é ela que este passo fecha.
 */
async function precoDaSafra() {
  const safra = await buscarSafraDeVitrine()

  if (!safra) {
    throw new Error(
      'Nenhuma safra no banco: a landing não tem valor nem duração para exibir, ' +
        'e não existe fallback honesto (D-13 proíbe literal, inclusive como fallback). ' +
        'Crie a safra em public.safras antes de buildar.',
    )
  }

  return {
    valorMensal: safra.valor_mensal,
    duracaoMeses: safra.duracao_meses,
  }
}

export default async function Page() {
  const { valorMensal, duracaoMeses } = await precoDaSafra()

  return (
    <div className="relative">
      <ScrollReveal />
      <Navbar />
      <main>
        {/* As três seções que falavam de duração ou preço agora recebem os
            números por prop. Elas não consultam o banco por conta própria,
            e é assim que a página inteira sai de UMA leitura: três
            consumidores lendo cada um a sua produziriam três respostas
            possivelmente diferentes no mesmo HTML. */}
        <Hero duracaoMeses={duracaoMeses} />
        <PainPoints />
        <Personas />
        <Skills />
        <Timeline />
        <Teacher />
        <Pricing valorMensal={valorMensal} duracaoMeses={duracaoMeses} />
        <Faq duracaoMeses={duracaoMeses} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
