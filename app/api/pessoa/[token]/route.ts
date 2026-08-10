import {
  buscarPerfilPendente,
  buscarPessoaPorToken,
  buscarSafraAtiva,
  SupabaseNotConfiguredError,
  tokenVenceu,
} from '@/lib/supabase'

// ============================================================
// O LINK DO CONVITE — identifica, e NÃO autoriza (D-10)
// ============================================================
//
// Dois caminhos de entrada, não um:
//
//   LINK LIMPO   (Instagram, tráfego normal) → formulário do zero.
//   LINK COM TOKEN (e-mail para a base atual) → a modal já vem
//                   preenchida com o contato de quem foi convidada.
//
// A Giovanna vai postar o link no Instagram. Se o fluxo dependesse de
// token, o Instagram quebraria; se não houvesse token, a base atual
// preencheria tudo de novo e a conversão cairia. Por isso os dois.
//
// ⚠️ ESTA ROTA NÃO AUTORIZA NADA, e a frase é literal. Ela não abre
// sessão, não muda status, não cria checkout e não devolve id de
// inscrição nenhum. Tudo que ela faz é dizer "este token pertence a
// fulana, e o contato dela é este" — o resto do fluxo é o de sempre,
// pelo POST de `/api/inscricao`, que decide tudo relendo o banco.
//
// ⚠️ E É ASSIM QUE A D-15 É CUMPRIDA SEM UM SEGUNDO MECANISMO. Quem está
// presa em `pendente_pagamento` recebe este mesmo link; a modal abre
// preenchida, ela confirma, e o POST cai no caminho de duplicata — que
// desde a `016` devolve o id da inscrição QUE JÁ EXISTE e abre o checkout
// dela. Não há rota de pagamento por token, não há `inscricao_id` na URL,
// e não há credencial eterna em e-mail. Um mecanismo, dois usos.
//
// ⚠️ POR QUE NÃO EXISTE "abrir o checkout direto pelo link": porque isto
// é um GET, e um GET é disparado por prefetch de navegador, por
// antivírus corporativo que abre todo link de e-mail, e pelo próprio
// cliente de e-mail gerando preview. Criar sessão de pagamento aí seria
// efeito colateral de alguém não ter clicado em nada. O clique de
// confirmação na modal é o que separa "abri o e-mail" de "quero pagar".
// ============================================================

// Nunca cachear: a validade do token muda com o relógio, e a resposta
// carrega dado pessoal. Uma resposta cacheada na borda seria o contato de
// uma pessoa servido para a próxima requisição que passasse pela mesma
// chave.
export const dynamic = 'force-dynamic'

/**
 * O que a modal recebe. Contato, e nada além disso.
 *
 * ⚠️ O PERFIL NÃO ESTÁ AQUI, e a ausência é decisão — ver
 * `buscarPessoaPorToken`. `nivel_ingles`, `curso`, `periodo` e
 * `disponibilidade` descrevem a pessoa NAQUELA safra (`008`), e
 * pré-preenchê-los a partir de uma inscrição antiga apresentaria uma
 * resposta desatualizada já marcada — que é a forma mais eficiente de
 * gravar dado errado, porque ela confirma sem ler.
 */
type PessoaPublica = {
  nome: string
  email: string
  telefone: string
  /**
   * O perfil, SÓ quando existe inscrição pendente na safra aberta.
   *
   * ⚠️ A CONDIÇÃO É O QUE TORNA ISTO SEGURO. Perfil descreve a pessoa
   * NAQUELA safra (`008`) — quem estava no 3º período em janeiro está no
   * 5º em julho —, então devolvê-lo a partir de uma inscrição velha
   * apresentaria uma resposta desatualizada JÁ MARCADA, e ela confirmaria
   * sem ler. Quando a inscrição pendente é da safra que está aberta, não
   * há nada de velho: ela preencheu isso dias atrás, para esta turma.
   *
   * `null` no convite da lista de espera (D-10), que é quem não tem
   * inscrição pendente nenhuma.
   */
  perfil: {
    nivel_ingles: string
    curso: string
    periodo: string
    disponibilidade: string[]
  } | null
}

/**
 * A resposta é sempre 200, e a forma é sempre a mesma.
 *
 * ⚠️ TOKEN VENCIDO, TOKEN INEXISTENTE E TOKEN VÁLIDO RESPONDEM COM O
 * MESMO ENVELOPE — muda só o `pessoa`, que vem `null` nos dois primeiros
 * casos. Duas razões, e a segunda é a que importa:
 *
 *   1. "Expirado cai no FLUXO LIMPO" (o `c52` do plano). O fluxo limpo é
 *      o formulário do zero, e ele é uma tela perfeitamente boa — não uma
 *      degradação que mereça 404 e uma página de erro. Quem clicou num
 *      convite de três meses atrás deve conseguir se inscrever, não ler
 *      "não encontrado".
 *
 *   2. Um 404 distinguiria "este token não existe" de "este token existe
 *      e venceu", e isso é um oráculo. Com 200 uniforme, quem tem o token
 *      certo entra e todo o resto vê a mesma coisa.
 */
type Resposta = { ok: true; pessoa: PessoaPublica | null }

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // ============================================================
  // ⚠️ SEM RATE LIMIT AQUI, E A AUSÊNCIA É RACIOCINADA — não copiada da
  //    rota de inscrição por esquecimento
  // ============================================================
  //
  // O rate limit de `/api/inscricao` existe porque aquela rota responde se
  // um E-MAIL tem cadastro, e e-mail é adivinhável: dá para varrer uma
  // lista de endereços plausíveis. Ele torna a varredura cara.
  //
  // Aqui não há nada de adivinhável. O token é gerado com 32 bytes
  // aleatórios (ver o script do `c54`), o que dá um espaço de 2^256 — não
  // existe número de tentativas por minuto que torne isso viável, e não
  // existe rate limit que o torne mais inviável do que já é. A defesa é a
  // ENTROPIA, e um `Map` em memória por instância serverless daria a
  // impressão de uma segunda defesa sem acrescentar nenhuma.
  //
  // ⚠️ O DIA EM QUE ISSO MUDA: se o token algum dia encolher, virar
  // sequencial, ou passar a derivar de algo previsível (e-mail, id, data),
  // esta análise morre junto e o rate limit passa a ser obrigatório. A
  // frase acima é a condição, não a conclusão.
  // ============================================================

  // Token de tamanho absurdo nem chega ao banco. Não é validação de
  // formato — é recusa de payload, e o valor é generoso de propósito:
  // 43 caracteres é o base64url de 32 bytes, e o teto existe só para que
  // ninguém mande um megabyte de string por diversão.
  if (!token || token.length > 200) {
    return Response.json({ ok: true, pessoa: null } satisfies Resposta, { status: 200 })
  }

  try {
    const pessoa = await buscarPessoaPorToken(token)

    if (!pessoa) {
      // Nem existe. Fluxo limpo, sem contar isso a quem perguntou.
      return Response.json({ ok: true, pessoa: null } satisfies Resposta, { status: 200 })
    }

    if (tokenVenceu(pessoa, new Date())) {
      // ⚠️ VENCIDO NÃO PRÉ-PREENCHE, e o log é do lado de cá. A pessoa vê
      // o formulário do zero — o que é uma experiência pior e uma verdade
      // melhor do que um link de validade infinita, que é o que a D-10
      // proíbe. Se isto virar reclamação recorrente, o conserto é a
      // Giovanna reenviar o convite (o `c54` regenera), e não afrouxar a
      // expiração.
      console.info('[pessoa] token vencido — caindo no fluxo limpo')
      return Response.json({ ok: true, pessoa: null } satisfies Resposta, { status: 200 })
    }

    // ------------------------------------------------------------
    // O PERFIL — só se houver pendência NA SAFRA ABERTA (D-15)
    //
    // ⚠️ AS DUAS CONDIÇÕES SÃO NECESSÁRIAS. "Tem inscrição pendente" não
    // basta: a pendência pode ser de uma safra que já passou, e aí o
    // perfil é velho. "A safra está aberta" também não basta sozinho —
    // sem pendência, quem vem pelo convite é da lista de espera e nunca
    // preencheu perfil para esta turma.
    //
    // ⚠️ FALHA AQUI NÃO DERRUBA O PRÉ-PREENCHIMENTO DO CONTATO. O perfil é
    // conforto; o contato é o que a D-10 promete. Um `catch` que
    // devolvesse `pessoa: null` por causa do perfil trocaria o essencial
    // pelo acessório.
    // ------------------------------------------------------------
    let perfil: PessoaPublica['perfil'] = null

    try {
      const safra = await buscarSafraAtiva()

      if (safra?.inscricoes_abertas === true) {
        perfil = await buscarPerfilPendente(pessoa.id, safra.id)
      }
    } catch (err) {
      console.error('[pessoa] falha ao buscar o perfil pendente — segue sem ele', err)
    }

    return Response.json(
      {
        ok: true,
        // O corte é aqui, e é explícito: `token_expira_em` e o `id` vieram
        // do banco para as decisões acima e NÃO atravessam. Um spread do
        // objeto inteiro devolveria a validade do convite e um id de banco
        // ao navegador sem ninguém decidir isso.
        pessoa: {
          nome: pessoa.nome,
          email: pessoa.email,
          telefone: pessoa.telefone,
          perfil,
        },
      } satisfies Resposta,
      { status: 200 },
    )
  } catch (err) {
    // ⚠️ FALHA DE INFRA TAMBÉM CAI NO FLUXO LIMPO, e não em tela de erro
    // (REPORT §9.3). O pior desfecho aqui é a pessoa digitar o próprio
    // nome — o que ela faria de qualquer forma sem o convite. Responder
    // 500 transformaria um banco lento numa inscrição perdida.
    if (err instanceof SupabaseNotConfiguredError) {
      console.error('[pessoa]', err.message)
    } else {
      console.error('[pessoa] falha ao resolver o token — caindo no fluxo limpo', err)
    }

    return Response.json({ ok: true, pessoa: null } satisfies Resposta, { status: 200 })
  }
}
