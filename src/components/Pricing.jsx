import Image from 'next/image'
import { ArrowUpRight, ChevronRight, Shield, Trophy, Lock } from './Icons.jsx'
import CtaInscricao from './CtaInscricao.jsx'
import { ID_CARD_COMPRA } from './LinkListaEspera.jsx'
import { formatarValorMensal, formatarDuracao } from '@/config/curso'
const ghostCard = '/assets/ghost-card.png'
const microscope = '/assets/microscope-pink.svg'
const dna = '/assets/dna.svg'

// A lista virou função porque o último item deixou de ser constante: ele
// dizia "Duração de 6 meses" escrito à mão, ao lado de um `R$ 299,99`
// também escrito à mão, num card cujo botão leva a uma compra. Eram as
// duas afirmações mais caras da página e as duas únicas que o banco já
// sabia responder — a tensão 8.1 do `REPORT.md` inteira, em quinze
// linhas de distância uma da outra.
//
// Os outros seis continuam literais e devem continuar: "Certificado de
// conclusão" não varia por safra e não tem coluna. O critério é o mesmo
// do topo de `src/config/curso.ts` — o que muda de safra para safra
// pertence ao banco; o que não muda, não.
const montarFeatures = (duracaoMeses) => [
  'Turmas reduzidas, com aulas ao vivo',
  'Material complementar e glossário técnico',
  'Avaliação mensal',
  'Comunidade exclusiva de alunos',
  'Avaliação de nível incluída',
  'Certificado de conclusão',
  `Duração de ${formatarDuracao(duracaoMeses)}`,
]

const guarantees = [
  { icon: Shield, label: 'Compra segura' },
  { icon: Trophy, label: 'Satisfação Garantida' },
  { icon: Lock, label: 'Privacidade Garantida' },
]

/**
 * ⚠️ `valorMensal` e `duracaoMeses` são OBRIGATÓRIOS e não têm default.
 *
 * Um default aqui — `valorMensal = 299.99` — seria o literal voltando
 * pela porta dos fundos, e pior do que o que saiu: invisível na tela,
 * ativado só quando o dado de verdade não chegasse, e sem ninguém para
 * notar que a página passou a exibir um número inventado. Se a prop não
 * vier, o certo é quebrar. Quem garante que ela vem é `app/page.jsx`,
 * que falha antes de renderizar quando não há safra.
 *
 * Os dois chegam do banco, de UMA leitura feita na página (D-13), e
 * descrevem o que o curso custa HOJE. Não é o que uma aluna paga: quem
 * já assinou tem valor e duração travados na assinatura (D-06).
 */
export default function Pricing({ valorMensal, duracaoMeses }) {
  const features = montarFeatures(duracaoMeses)
  return (
    // `#preco` segue na seção para não quebrar link já compartilhado, mas o
    // destino dos CTAs é o card lá dentro (`#planos`) — parar na seção
    // deixaria o card, que é o objeto do clique, fora da tela.
    <section id="preco" className="px-6 py-16 md:px-10 lg:px-0">
      <div className="mx-auto w-[1212px] max-w-full">
        {/* ═══════════ FRAME DA SEÇÃO — 1212×835 ═══════════ */}
        {/* Em 1440 isso é um frame de altura fixa com os filhos posicionados
            por left/top. Abaixo de lg nada disso sobrevive: o card de preço
            fica em left 659 e seria inteiramente cortado pelo overflow-hidden.
            Base vira stack vertical fluido; lg: reconstrói o frame original. */}
        {/* Em 1440 este é o painel de 1212×835 do Figma, e raio, borda e p-6
            fazem parte dele. Abaixo de lg os três só produziam uma moldura
            dentro da moldura: a section já dá o gutter de 24px com `px-6`, e o
            `p-6` daqui somava outros 24, encolhendo o card de preço para 292px
            num viewport de 390. Nenhuma outra seção da página tem raio ou
            borda no wrapper em base — o padrão do projeto é seção sem moldura,
            e é esse padrão que a base passa a seguir. Tudo volta em `lg:`. */}
        <div
          className="relative flex flex-col gap-10 overflow-hidden rounded-none
                     border-0 border-[rgba(17,17,17,0.09)]
                     bg-[linear-gradient(153deg,#FDEEF2_0%,#FCFCFC_58%)]
                     shadow-[0_40px_80px_-36px_rgba(247,88,131,0.28)]
                     p-0 md:p-14 lg:block lg:h-[835px]
                     lg:rounded-[36px] lg:border"
        >
          {/* ───── DECORATIVOS ───── */}
          {/* ⚠️ derivado: posições estimadas no render, sem X/Y do Inspect */}
          {/* Os três são decorativos e dimensionados para o frame de 1212:
              560px e 480px dentro de uma caixa de ~327 só viram ruído atrás
              do texto. Somem abaixo de lg. */}
          <img
            src={microscope}
            alt=""
            aria-hidden="true"
            width={560}
            height={560}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute -left-61 -top-24 hidden h-[560px] w-[560px]
           max-w-none select-none opacity-[0.4] lg:block"
          />
          <img
            src={dna}
            alt=""
            aria-hidden="true"
            width={150}
            height={240}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute bottom-8 left-2 hidden h-[240px] w-[150px]
                       max-w-none select-none lg:block"
          />

          {/* ───── GHOST — left 671 / top 70 (confirmado) ───── */}
          {/* era md:block, mas em 768 o left-[671px] já joga o ghost pra fora
              do frame — o breakpoint real dele é o layout absoluto, ou seja lg */}
          {/* só existe em lg: — o `sizes` fixo em 480px evita que o otimizador
              gere variantes mobile que nunca serão pedidas */}
          <Image
            src={ghostCard}
            alt=""
            aria-hidden="true"
            width={960}
            height={1312}
            loading="lazy"
            decoding="async"
            sizes="480px"
            className="pointer-events-none absolute left-[671px] top-[70px] hidden
                       h-[656px] w-[480px] max-w-none select-none lg:block"
          />

          {/* ═══════════ CARD DE PREÇO — left 659 / top 164 ═══════════ */}
          {/* order-2: no DOM o card vem antes da coluna de texto (o absoluto
              não liga pra ordem), mas no stack mobile ele fecha a seção,
              depois da lista que justifica o preço */}
          {/* Alvo do fluxo em duas etapas: todo "Lista de espera" da página
              aponta para cá, e só o "Garantir minha vaga" daqui de dentro abre
              a modal. `tabIndex={-1}` existe só para o foco poder pousar no
              card depois do salto — não entra na ordem de Tab.
              Sem `scroll-margin-top`: o recuo do header sticky já vem do
              `html { scroll-padding-top: 96px }` do globals.css. Os dois se
              somam, e declarar aqui também pararia 192px abaixo do card. */}
          <div
            id={ID_CARD_COMPRA}
            tabIndex={-1}
            className="reveal-soft relative order-2 z-10 flex w-full flex-col
                       items-center justify-center gap-8 overflow-hidden
                       rounded-2xl border border-transparent
                       lg:absolute lg:left-[659px] lg:top-[164px] lg:h-[492px] lg:w-[427px]
                       [background-image:linear-gradient(173deg,rgba(255,255,255,0.66)_-1.6%,rgba(255,255,255,0.66)_34.77%,rgba(255,96,139,0.66)_97.92%),linear-gradient(180deg,#FFDDE6_0%,#FF7EA1_50%,#FF8FAE_100%)]
                       [background-origin:padding-box,border-box]
                       [background-clip:padding-box,border-box]
                       bg-price-grad px-5 py-6 lg:px-9"
            style={{ '--reveal-delay': '150ms' }}
          >
            {/* PREÇO */}
            {/* ⚠️ derivado: -mb-3 encurta só a transição preço → CTA (32 − 12 = 20px).
                O gap-8 do card segue intacto para as outras três. */}
            {/* ⚠️ derivado: abaixo de lg o `por mês` deixa de ser absoluto e
                passa a ser irmão do preço na mesma linha de base. A ancoragem
                absoluta foi calibrada para o wrapper de 339px do Figma; num
                wrapper de 230–324px ela sobrepunha 40,7px do preço e ainda
                saía 4px pela direita. O `gap-0` não é número novo: é a medida
                do próprio desktop, onde a borda do preço cai em ~326,0 e o
                `por mês` começa em ~326,3 — os dois já são encostados lá.
                Em `lg:` tudo volta (`lg:block` + `lg:absolute`), então o
                render de 1440 não se mexe. O corpo do preço segue 44px: medido,
                cabe em 320/360/390/414 com folga de 7,3 / 27,3 / 42,3 / 54,3px
                até a borda do card. */}
            <div className="relative -mb-3 flex w-[339px] max-w-full items-baseline
                            justify-center gap-0 lg:mb-0 lg:block">
              <span
                className="text-grad block whitespace-nowrap text-center font-display
                           text-[44px] font-medium leading-[58px]
                           md:text-[52px] md:leading-[70px]
                           lg:text-[64.776px] lg:leading-[87.448px]"
              >
                {/* Era `R$ 299,99` escrito à mão — o literal mais caro do
                    repositório, e a prova viva da tensão 8.1: a coluna
                    `valor_mensal` existia, a rota devolvia, e a página
                    ignorava. Mudar o preço no Studio não mudava isto.
                    `formatarValorMensal` já existia em `config/curso.ts`
                    e não tinha um único chamador; agora tem. A moeda é
                    formatada lá, uma vez, e não com `toFixed` mais
                    `'R$ '` concatenado aqui. */}
                {formatarValorMensal(valorMensal)}
              </span>
              {/* ⚠️ derivado: ancoragem absoluta — pai sem auto-layout confirmado */}
              <span
                className="whitespace-nowrap text-center font-display
                           text-[11.803px] font-medium leading-[18.619px]
                           text-[#26020B] lg:absolute lg:-right-8 lg:bottom-5"
              >
                por mês
              </span>
            </div>

            {/* CTA — 373×60 (confirmado) */}
            {/* O rótulo anterior falava em aquisição: aparecia colado ao
                preço, no gesto onde se espera um checkout, e abria um
                formulário que não cobra nada — a promessa mais quebrada
                da página. Agora diz o mesmo que o primário da modal que
                ele abre, e os dois deixam de se contradizer. */}
            {/* ⚠️ background / box-shadow vêm de .btn-brand, nunca confirmados */}
            {/* ⚠️ ring-4 ring-white/40 não veio do Dev Mode — provável invenção */}
            <CtaInscricao
              /* ⚠️ derivado: 373px fixos e 22px não cabem em 375 — o botão
                 vira fluido e o corpo cai o suficiente pra caber numa linha */
              className="btn-brand flex h-[60px] w-full shrink-0 items-center justify-center
                         gap-2 px-4 text-center font-display text-[17px] font-semibold
                         leading-[19.2px] tracking-[-0.8px] text-white ring-4 ring-white/40
                         lg:w-[373px] lg:px-6 lg:text-[22px]"
            >
              Garantir minha vaga
              <span className="arrow-badge">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </CtaInscricao>

            {/* CHIPS — row 248.69 / gap 12 (confirmado) */}
            {/* ⚠️ derivado: a fileira de 248.69 é mais larga que o card no
                mobile — as pills passam a poder encolher abaixo de lg */}
            <div className="flex w-full max-w-[248.69px] items-center gap-3 lg:w-[248.69px]">
              {/* 84px = 248.69 − 152.69 − 12 (derivado por subtração) */}
              {/* `capitalize` no lugar de uma segunda string: a fonte é a
                  mesma `formatarDuracao` da lista de features, que devolve
                  minúscula ("6 meses"), e a caixa alta do chip é
                  apresentação. Duas strings para o mesmo número seriam
                  duas chances de divergir. O CSS não toca no "6" — não há
                  letra — e transforma só o "m". */}
              <span
                className="flex h-[33.19px] w-[84px] shrink items-center justify-center
                           rounded-full bg-[#FDEEF2] font-display text-[12px] font-semibold
                           capitalize leading-[19.2px] text-[#FF487A] lg:shrink-0"
              >
                {formatarDuracao(duracaoMeses)}
              </span>
              <span
                className="flex h-[33.19px] w-[152.69px] shrink items-center justify-center
                           rounded-full bg-[#FDEEF2] font-display text-[12px] font-semibold
                           leading-[19.2px] text-[#FF487A] lg:shrink-0"
              >
                Passo a passo prático
              </span>
            </div>

            {/* TRUST ROW — item: inline-flex, gap 12 (confirmado) */}
            {/* ⚠️ derivado: os 3 selos em linha pedem 382px — no mobile
                empilham, que é a única forma de manter os 16px do rótulo */}
            {/* Empilhados, `items-center` centrava cada linha pela própria
                largura e os três ícones começavam em x diferentes (120 / 98,7
                / 94,7 medidos em 390). Agora o bloco encolhe para o conteúdo
                (`w-fit`), é centralizado como um todo (`mx-auto`) e as linhas
                se alinham à esquerda dentro dele — um único eixo de ícones.
                Em lg nada disso vale: `lg:mx-0` devolve a centralização ao
                `items-center` do card, que é o que produz o transbordo
                simétrico dos 382px dentro dos 355px de área útil. Trocar por
                margem automática ancoraria o bloco na borda e o moveria
                13,5px — por isso `mx-0` e não `mx-auto` no desktop. */}
            <div className="mx-auto flex w-fit shrink-0 flex-col items-start justify-center gap-2
                            lg:mx-0 lg:inline-flex lg:h-[44px] lg:w-[382px] lg:flex-row
                            lg:items-center lg:gap-3">
              {guarantees.map((g) => {
                const Icon = g.icon
                return (
                  <div key={g.label} className="inline-flex items-center justify-center gap-3">
                    {/* ⚠️ Branco por decisão de design. Medido sobre o
                        gradiente do card: 1,90–2,26:1 no mobile e 1,95–2,16:1
                        em 1440 — abaixo dos 4,5:1 que AA pede para texto
                        normal. Nenhum ponto do gradiente atual sustenta branco
                        em AA (o mais escuro dá 2,38:1), então isto só passa a
                        conformar se o gradiente escurecer ou o texto mudar de
                        cor. Registrado aqui para não ser "corrigido" por
                        engano numa próxima passagem. */}
                    <Icon className="h-6 w-6 shrink-0 text-white" />
                    <span className="font-display text-[16px] font-medium leading-[21.6px] text-white">
                      {g.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ═══════════ COLUNA ESQUERDA ═══════════ */}
          <div className="relative order-1 w-[492px] max-w-full">
            {/* BADGE */}
            <span
              className="reveal inline-flex items-center gap-2 rounded-full border
                         border-[rgba(247,88,131,0.25)] bg-white
                         py-[11px] pl-[16.34px] pr-[91.996px]"
            >
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#F75883]" />
              <span className="text-grad font-display text-[18px] font-semibold leading-none">
                Beyond The Lab
              </span>
            </span>

            {/* HEADLINE */}
            <h2
              className="reveal h2-section mt-5 w-[492px] max-w-full font-display
                         font-semibold leading-[normal] text-[#022D57]"
              style={{ '--reveal-delay': '90ms' }}
            >
              O curso completo pra <span className="text-grad">transformar seu inglês.</span>
            </h2>

            {/* PARÁGRAFO */}
            {/* nota: font-size aumentado manualmente — Figma diz 16px / 25.6px */}
            <p
              className="reveal mt-4 w-[487.5px] max-w-full font-display text-[16px]
                         font-normal leading-[25.6px] text-[#345372]"
              style={{ '--reveal-delay': '170ms' }}
            >
              Turmas, aulas ao vivo e materiais práticos pra estudar, praticar e evoluir do início
              ao fim.
            </p>

            {/* LISTA — 468.0918 × 663.19537 */}
            {/* ⚠️ internos (gap, círculo, pill, conectora) ainda sem Dev Mode */}
            <ul className="relative mt-7 w-[468.0918px] max-w-full space-y-3">
              {features.map((f, i) => (
                <li
                  key={f}
                  /* stagger curto e limitado — 7 itens em 280ms no total */
                  className="reveal group flex items-center gap-3 [transition:transform_var(--motion-short)_var(--ease-out)] hover:translate-x-1"
                  style={{ '--reveal-delay': `${Math.min(i, 4) * 70}ms` }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-brand ring-1 ring-rose-300 [transition:transform_var(--motion-short)_var(--ease-out)] group-hover:scale-[1.08]">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                  <span className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-soft [transition:box-shadow_var(--motion-short)_var(--ease-out)] group-hover:shadow-card">
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}