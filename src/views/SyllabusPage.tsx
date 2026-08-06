'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import PageHeader from '@/components/PageHeader.jsx'
import LinkListaEspera from '@/components/LinkListaEspera.jsx'
import Footer from '@/components/Footer.jsx'
import { ArrowUpRight } from '@/components/Icons.jsx'
import useScrollReveal from '@/hooks/useScrollReveal.js'
import modules, { type Idioma, type Module } from '@/data/modules'

/* O seletor só governa o CONTEÚDO DOS MÓDULOS. O resto da página — kicker,
   H1, apoio, linha das turmas, botão — continua em português em qualquer
   posição do seletor, porque é a voz do site falando com a aluna, e não o
   material do curso. Se um dia a página inteira precisar traduzir, o lugar
   da decisão é uma rota por idioma, não este estado local. */

/**
 * Rótulo de cada posição do seletor, no próprio idioma que ela oferece.
 *
 * A bandeira do `en` é a dos EUA porque é a que a marca já usa: o chip
 * flutuante do Hero (`public/assets/flag.svg`, SPEC §272) é a bandeira
 * americana. Trocar por 🇬🇧 aqui criaria duas bandeiras diferentes para a
 * mesma língua na mesma sessão.
 *
 * ⚠️ Emoji de bandeira é sequência de indicadores regionais, e o Windows não
 * tem os glifos: no Chrome de Windows estes dois renderizam como as letras
 * "US" e "BR", não como bandeira. É degradação aceitável — o rótulo ao lado
 * já diz o idioma, e a bandeira é reforço, não a informação. Se um dia
 * precisar da bandeira garantida em toda plataforma, o caminho é SVG inline
 * em `Icons.jsx`, como o resto dos ícones (SPEC §232).
 */
const IDIOMAS: { valor: Idioma; bandeira: string; rotulo: string; sigla: string; lang: string }[] = [
  { valor: 'pt', bandeira: '🇧🇷', rotulo: 'Português', sigla: 'PT', lang: 'pt-BR' },
  { valor: 'en', bandeira: '🇺🇸', rotulo: 'English', sigla: 'EN', lang: 'en' },
]

/** O prefixo do título de cada card acompanha o idioma escolhido. */
const PREFIXO_MODULO: Record<Idioma, string> = {
  en: 'Module',
  pt: 'Módulo',
}

/* O padrão é `pt` — decisão editorial do dono do produto, tomada depois de a
   página nascer em inglês.

   O raciocínio antigo (o índice em inglês É o produto, e abrir em inglês já
   é uma amostra do curso) perdia para o custo do outro lado: quem chega pela
   landing lê tudo em português até este ponto, e uma lista de doze títulos em
   inglês na primeira dobra filtra exatamente quem o curso quer atender — a
   aluna que ainda NÃO lê esse índice com conforto. O inglês continua a um
   clique, e o `en` é a fonte de verdade do conteúdo; ele deixou de ser a
   primeira impressão, só isso.

   ⚠️ `app/conteudo-programatico/page.jsx` declara `locale: 'pt_BR'` e a
   `description` do OG está em português: com `pt` de padrão, metadata e
   primeira dobra finalmente concordam. Se este valor voltar para 'en', aquilo
   passa a mentir para o compartilhamento. */
const IDIOMA_PADRAO: Idioma = 'pt'

function Chevron() {
  return (
    <svg
      className="syl-icon h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function SeletorIdioma({
  idioma,
  onChange,
}: {
  idioma: Idioma
  onChange: (proximo: Idioma) => void
}) {
  return (
    /* `role="group"` + `aria-pressed` em vez de radiogroup: são dois botões
       que agem na hora, sem confirmação, e o leitor de tela anuncia
       "pressionado" — que é exatamente o estado.

       ⚠️ derivado — o seletor não existe no Figma. A pílula reusa o que já
       está medido nos cards (bg-white, shadow-card, ring-ink/5) e o gradiente
       do selo do FAQ (bg-badge-grad) no segmento ativo; o padding, o 13px e o
       mt-10/mt-4 lá embaixo foram escolhidos aqui. Ao medir no Dev Mode,
       substituir. */
    <div
      role="group"
      aria-label="Idioma do conteúdo dos módulos"
      className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-card ring-1 ring-ink/5"
    >
      {IDIOMAS.map((op) => {
        const ativo = op.valor === idioma
        return (
          <button
            key={op.valor}
            type="button"
            lang={op.lang}
            aria-pressed={ativo}
            onClick={() => onChange(op.valor)}
            className={[
              'flex items-center gap-2 rounded-full px-4 py-2 font-sans text-[13px] font-semibold transition-colors',
              ativo ? 'bg-badge-grad text-white' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {/* `aria-hidden` porque o rótulo ao lado já nomeia o idioma: sem
                isso o leitor de tela anuncia "Bandeira do Brasil, Português".
                O emoji fica um pouco maior que o texto para a bandeira ser
                legível no tamanho do botão. */}
            <span aria-hidden="true" className="text-[15px] leading-none">
              {op.bandeira}
            </span>
            {/* a sigla é o que cabe no mobile; o nome inteiro entra a partir
                do sm, onde a linha tem folga */}
            <span className="sm:hidden">{op.sigla}</span>
            <span className="hidden sm:inline">{op.rotulo}</span>
          </button>
        )
      })}
    </div>
  )
}

function AccordionItem({
  module,
  idioma,
  defaultOpen = false,
  delay = 0,
}: {
  module: Module
  idioma: Idioma
  defaultOpen?: boolean
  delay?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const panelId = `${id}-panel`
  const triggerId = `${id}-trigger`
  const lang = idioma === 'pt' ? 'pt-BR' : 'en'

  return (
    <div
      className="reveal-card rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/5"
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      <h3>
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="syl-trigger flex w-full items-center justify-between gap-4 text-left"
        >
          {/* `lang` no texto do módulo, não no card inteiro: é o que faz o
              leitor de tela trocar de voz quando o seletor troca de idioma,
              sem contaminar o resto da página, que é sempre pt-BR */}
          <span lang={lang} className="font-display text-base font-semibold text-ink md:text-[18px]">
            <span className="text-muted">
              {PREFIXO_MODULO[idioma]} {module.id}
            </span>
            {' — '}
            {module.title[idioma]}
          </span>
          {/* mesmo selo do FAQ: 32px, radius 12, gradiente do badge */}
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-badge-grad text-white">
            <Chevron />
          </span>
        </button>
      </h3>

      {/* .syl-panel anima grid-template-rows (0fr→1fr) — não precisa medir
          altura — e some para leitores de tela quando fechado, sem tirar o
          conteúdo do DOM */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="syl-panel"
        data-open={open}
      >
        {/* a div intermediária é a caixa de overflow do grid; o respiro de
            12px virou padding dela para sair do caminho da animação */}
        <div>
        {/* pt-4 = os 12px do antigo margin-top do painel + os 4px do pt-1 */}
        <ul lang={lang} className="syl-panel-inner flex flex-col gap-2 pt-4">
          {module.topics.map((topic) => (
            <li
              key={topic.en}
              className="flex items-start gap-3 text-sm leading-relaxed text-body"
            >
              <span
                aria-hidden="true"
                className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-brand"
              />
              <span>{topic[idioma]}</span>
            </li>
          ))}
        </ul>
        </div>
      </div>
    </div>
  )
}

/* O stagger da primeira dobra, em ms: quando o primeiro card entra e quanto
   cada card seguinte espera a mais. Valores do render original. */
const STAGGER_INICIO = 320
const STAGGER_PASSO = 70

/**
 * Quais cards levam stagger de entrada — medido, não chutado.
 *
 * A versão anterior fatiava por índice (`i < 4 ? 320 + i * 70 : 0`), partindo
 * de que a primeira dobra comporta quatro cards. Numa janela mais alta ela
 * comporta mais, e aí o bug aparecia: o módulo 5 já nascia dentro da
 * viewport, era revelado pelo observer junto com os outros mas com delay 0, e
 * portanto aparecia ANTES do módulo 4, que ainda esperava 530ms. A ordem
 * visual da entrada invertia no meio da lista.
 *
 * Quem decide o tamanho da fatia é a altura da janela, então é ela que
 * responde. Os cards abaixo da dobra continuam com 0: eles entram um a um por
 * scroll, e qualquer delay ali seria só atraso depois do gesto.
 *
 * O `- 40` espelha o `rootMargin: '0px 0px -40px 0px'` do useScrollReveal —
 * um card que encosta no fim da tela não é "in view" para o observer, e não
 * pode ser "na dobra" aqui.
 */
function medirStagger(cards: Element[]): number[] {
  const limite = window.innerHeight - 40
  let ordem = 0
  return cards.map((card) =>
    card.getBoundingClientRect().top < limite ? STAGGER_INICIO + ordem++ * STAGGER_PASSO : 0
  )
}

export default function SyllabusPage() {
  useScrollReveal()

  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_PADRAO)

  const listaRef = useRef<HTMLDivElement>(null)
  const [delays, setDelays] = useState<number[]>(() => modules.map(() => 0))

  /* Roda uma vez, no mount. O efeito é disparado antes de o
     IntersectionObserver entregar as primeiras entradas — que só chegam
     depois do layout do frame seguinte —, então o delay já está no elemento
     quando a classe `.in-view` cai nele e a transição começa.

     Não depende de `idioma`: trocar o seletor re-renderiza os cards, mas a
     entrada deles já aconteceu; remedir ali só produziria delay em elemento
     que não vai mais animar. */
  useEffect(() => {
    const cards = Array.from(listaRef.current?.children ?? [])
    if (cards.length) setDelays(medirStagger(cards))
  }, [])

  return (
    <div className="relative min-h-screen">
      <PageHeader />

      <main className="py-14 lg:py-20">
        <div className="container-page">
          {/* mesma cadência da primeira dobra da landing: kicker → título →
              apoio, com o título no curso longo do .reveal-hero */}
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-4 text-center">
            <p
              className="reveal font-sans text-[12px] font-semibold uppercase leading-[16px] tracking-[2.16px] text-[#F15D89]"
              style={{ '--reveal-delay': '40ms' } as CSSProperties}
            >
              6 meses · 12 módulos
            </p>
            <h1
              className="reveal-hero h2-section font-display font-semibold leading-[normal] text-ink"
              style={{ '--reveal-delay': '130ms' } as CSSProperties}
            >
              Conteúdo <span className="text-grad">programático</span>
            </h1>
            <p
              className="reveal p-section font-display font-normal leading-[normal] text-body"
              style={{ '--reveal-delay': '240ms' } as CSSProperties}
            >
              Do vocabulário da rotina de bancada até a discussão de artigos científicos com
              profissionais internacionais.
            </p>
          </div>

          {/* o seletor entra logo antes do primeiro card: 280ms cai entre o
              apoio (240ms) e o início do stagger da lista (320ms) */}
          <div
            className="reveal mx-auto mt-10 flex max-w-4xl justify-center md:justify-end"
            style={{ '--reveal-delay': '280ms' } as CSSProperties}
          >
            <SeletorIdioma idioma={idioma} onChange={setIdioma} />
          </div>

          {/* ⚠️ os filhos diretos desta div são os cards, e `medirStagger` conta
              com isso — nada de wrapper entre ela e o AccordionItem */}
          <div ref={listaRef} className="mx-auto mt-4 flex max-w-4xl flex-col gap-4">
            {modules.map((m, i) => (
              <AccordionItem
                key={m.id}
                module={m}
                idioma={idioma}
                defaultOpen={i === 0}
                delay={delays[i] ?? 0}
              />
            ))}
          </div>

          <div className="mx-auto mt-14 flex max-w-4xl flex-col items-center gap-4 text-center">
            <p className="reveal p-section font-display text-body">
              As turmas são reduzidas e separadas por nível de inglês.
            </p>
            {/* Único "Lista de espera" fora da landing: o card de compra não
                existe neste documento, então a âncora precisa do caminho
                absoluto. O foco no card fica por conta do navegador ao
                resolver o fragmento no carregamento da landing. */}
            <LinkListaEspera
              href="/#planos"
              className="btn-brand reveal w-[300px] max-w-full"
              style={{ '--reveal-delay': '90ms' } as CSSProperties}
            >
              Lista de espera
              <span className="arrow-badge">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </LinkListaEspera>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
