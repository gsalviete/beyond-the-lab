import PageHeader from '@/components/PageHeader.jsx'
import Footer from '@/components/Footer.jsx'

// ============================================================
// TIPOGRAFIA DE DOCUMENTO LEGAL
//
// Termos e Privacidade são o oposto do resto do site: texto longo,
// hierárquico, lido em busca de uma cláusula específica — não uma peça
// de conversão. Por isso nada aqui é novo, mas nada é copiado tal e
// qual das seções de marketing:
//
//   - Nenhum `.reveal`. Animar a entrada de um contrato atrasa a
//     leitura de quem veio procurar uma cláusula, e obrigaria a página
//     a virar client component por causa do `useScrollReveal`.
//   - Medida de linha travada em 720px. O `.container-page` vai até
//     1200px, largura confortável para cards lado a lado e péssima para
//     prosa: passa de 110 caracteres por linha e o olho perde a volta.
//   - `leading` mais alto que o do site (26px contra os 25.6px do corpo
//     de seção). Texto corrido dá mais trabalho que um parágrafo de
//     apoio de três linhas.
//
// Todos os valores de cor e família vêm do `tailwind.config.js` e do
// `globals.css`. Nenhum hex solto.
// ============================================================

/** Título do documento. Mesmo papel do <h1> de /conteudo-programatico. */
export function DocTitulo({ children }) {
  return (
    <h1 className="h2-section font-display font-semibold leading-[normal] text-ink">{children}</h1>
  )
}

/**
 * Seção numerada.
 *
 * O número entra no texto do <h2> em vez de virar `list-style` de um
 * <ol> — quem cita um contrato diz "cláusula 4", e o número precisa
 * estar no conteúdo para ser copiável e para o leitor de tela anunciar.
 */
export function DocSecao({ numero, titulo, children }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="font-display text-[20px] font-semibold leading-[1.3] text-ink md:text-[24px]">
        {numero}. {titulo}
      </h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** Parágrafo de corpo. */
export function DocP({ children }) {
  return <p className="font-sans text-[16px] leading-[26px] text-body">{children}</p>
}

/**
 * Lista de itens.
 *
 * `list-disc` com `pl-5`: o mesmo passo de indentação do `px-5` dos
 * campos da modal, para o documento não inventar uma métrica própria.
 */
export function DocLista({ children }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 font-sans text-[16px] leading-[26px] text-body marker:text-brand">
      {children}
    </ul>
  )
}

export function DocItem({ children }) {
  return <li>{children}</li>
}

/** Ênfase dentro do corpo — sobe o texto para o `ink`, como no resto do site. */
export function DocForte({ children }) {
  return <strong className="font-semibold text-ink">{children}</strong>
}

/**
 * E-mail de contato, como link `mailto:`.
 *
 * Componente e não um <a> solto no conteúdo porque este endereço é o
 * canal do direito de arrependimento e dos pedidos da LGPD: ele aparece
 * seis vezes entre os dois documentos, e um dia vai mudar. Centralizar a
 * marcação garante que mude em todas — e mantém `src/content/` sem
 * nenhuma classe de CSS, que é a regra da pasta.
 */
export function DocEmail({ children }) {
  return (
    <a
      href={`mailto:${children}`}
      className="rounded font-semibold text-brand underline underline-offset-2
                 [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand-deep"
    >
      {children}
    </a>
  )
}

/**
 * Marcador de dado que ainda não temos.
 *
 * Renderiza VISÍVEL e destacado, de propósito. A alternativa seria um
 * comentário no código, que ninguém vê ao abrir a página em produção —
 * e o modo de falha aqui é publicar um contrato com o nome do
 * prestador em branco. Um chip rosa no meio do parágrafo é impossível
 * de não notar, e é exatamente por isso que ele serve como trava.
 *
 * ⚠️ Estes marcadores TÊM que sair antes de operar com cobrança. O
 * checklist de lançamento (`docs/CHECKLIST-LANCAMENTO.md`) tem um item
 * só para isso, e `grep -rn "PREENCHER" src` lista todos.
 */
export function PREENCHER({ children }) {
  return (
    <mark className="rounded bg-rose-100 px-1.5 py-0.5 font-sans text-[15px] font-semibold text-brand-deep">
      [[PREENCHER: {children}]]
    </mark>
  )
}

/**
 * Aviso de rascunho, no topo de cada documento.
 *
 * Fica na página, e não só no comentário do arquivo-fonte, porque quem
 * precisa saber que o texto não passou por advogado é a cliente ao
 * revisar — e ela lê o site, não o repositório.
 */
export function DocAvisoRascunho() {
  return (
    <aside className="mt-6 rounded-2xl bg-rose-50 p-5 ring-1 ring-brand/15">
      <p className="font-sans text-[15px] leading-[24px] text-body">
        <DocForte>Rascunho não revisado por advogado.</DocForte> Este texto foi redigido como
        ponto de partida e precisa de revisão profissional antes de qualquer operação com
        cobrança recorrente.
      </p>
    </aside>
  )
}

/**
 * Casca da página: header, medida de leitura, data de atualização, footer.
 *
 * A data de atualização é passada como string literal por quem chama, e
 * não gerada com `new Date()`. Um documento legal precisa dizer desde
 * quando aquela redação vale; uma data automática mudaria a cada build
 * e afirmaria que o contrato foi atualizado num dia em que ninguém
 * escreveu uma linha — e ainda quebraria o prerender.
 */
export default function DocumentoLegal({ titulo, atualizadoEm, children }) {
  return (
    <div className="relative min-h-screen">
      <PageHeader />

      <main className="py-14 lg:py-20">
        <div className="container-page">
          <article className="mx-auto max-w-[720px]">
            <DocTitulo>{titulo}</DocTitulo>

            <p className="mt-3 font-sans text-[14px] leading-[22px] text-muted">
              Última atualização: {atualizadoEm}
            </p>

            <DocAvisoRascunho />

            <div className="mt-10">{children}</div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  )
}
