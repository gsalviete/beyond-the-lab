// ============================================================
// A TELA DE LOGIN DO PAINEL (`c63`)
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO"
//
// A regra do repositório é que valor de layout vem do Figma Dev Mode, e
// NÃO existe Figma de `/admin` — o `design/SPEC.md` cobre só a landing.
// O dono do repositório concedeu a exceção em 09/08/2026, com a condição
// que este comentário registra:
//
//   NENHUMA MEDIDA NOVA É INVENTADA. Tudo aqui sai de classe que já foi
//   medida em outro lugar — `container-page`, `btn-brand`, `font-display`,
//   os tokens de cor do `tailwind.config.js`, e os tamanhos que a modal e
//   o `DocumentoLegal` já usam.
//
// A exceção vale para `/admin` e só para ele. Se algum dia aparecer um
// Figma do painel, este comentário é o que diz o que foi assumido.
// ============================================================

const TITLE = 'Painel — Beyond The Lab'

// ⚠️ `noindex`, e não é zelo: uma tela de login indexada é um convite
// aberto na busca. `follow: false` junto para que os links daqui não
// levem robô nenhum para dentro.
export const metadata = {
  title: TITLE,
  robots: { index: false, follow: false },
}

// As quatro mensagens de erro que o fluxo produz.
//
// ⚠️ NENHUMA DELAS DIZ SE O E-MAIL EXISTE, se ele está na allowlist, ou
// quantas pessoas têm acesso. 'sem-permissao' é a única específica, e ela
// só confirma o que quem chegou até aqui já sabe: o login funcionou e o
// acesso não é dela.
const ERROS = {
  'sem-permissao': 'Esta conta não tem acesso ao painel.',
  cancelado: 'O login não foi concluído.',
  invalido: 'Não conseguimos validar o login. Tente de novo.',
  oauth: 'Não conseguimos falar com o Google agora. Tente de novo em instantes.',
  config: 'O login não está configurado neste ambiente.',
}

export default async function Page({ searchParams }) {
  const { erro } = await searchParams
  const mensagem = ERROS[erro]

  return (
    <main className="container-page flex min-h-screen flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-xl font-bold tracking-tight text-brand">Beyond The Lab</p>

      <h1 className="mt-5 font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Painel
      </h1>

      <p className="mt-4 max-w-[420px] font-display text-[16px] leading-[25.6px] text-[#345372]">
        Entre com a conta Google autorizada.
      </p>

      {mensagem && (
        /* `role="alert"` e não um parágrafo qualquer: quem usa leitor de
           tela precisa ouvir o motivo de o login ter falhado sem ter que
           varrer a página atrás dele. Mesmo papel do `aria-live` da modal. */
        <p
          role="alert"
          className="mt-5 max-w-[420px] rounded-2xl border border-border-soft bg-white px-5 py-4
                     font-sans text-[14px] leading-[22px] text-ink shadow-soft"
        >
          {mensagem}
        </p>
      )}

      {/* ⚠️ FORM POST, e não um <Link>. Um link seria PREFETCHADO pelo Next
          assim que aparecesse na tela, e o prefetch dispararia a criação do
          code verifier do PKCE — gravando cookie de uma tentativa de login
          que ninguém pediu. Ver o comentário em /api/admin/entrar. */}
      <form action="/api/admin/entrar" method="post" className="mt-8 w-full max-w-[420px]">
        <button type="submit" className="btn-brand w-full text-[17px]">
          Entrar com Google
        </button>
      </form>
    </main>
  )
}
