import { z } from 'zod'
import { exigirAdmin } from '@/lib/admin'
import { descreverCupom } from '@/config/cupom'
import { convidarParaInscricao } from '@/lib/email'
import {
  buscarCupomPorId,
  buscarSafraAtiva,
  garantirConvite,
  listarListaDeEspera,
} from '@/lib/supabase'

// ============================================================
// O CONVITE DA LISTA DE ESPERA (`c55` ligado ao painel, D-10 e D-16)
//
// ⚠️ PRIMEIRA LINHA É O GUARD, sem exceção. Esta rota manda e-mail para
// gente real com um link que abre um checkout com desconto.
//
// ⚠️ ELA É A IRMÃ DE `/api/admin/pendentes`, e a diferença entre as duas é
// QUEM está do outro lado:
//
//   pendentes → já abriu o checkout e não terminou. Está presa num beco
//               sem saída (D-15) e o link é o resgate.
//   espera    → nunca teve o que comprar. O link é o convite, e pela D-16
//               ele pode vir com desconto.
//
// O mecanismo é o mesmo — token da `017`, e-mail do `c55` — porque é o
// mesmo problema: identificar a pessoa sem pôr id de banco em URL.
// ============================================================

export const dynamic = 'force-dynamic'

/** 30 dias, decidido em 08/08/2026. Mesma constante de `/api/admin/pendentes`. */
const VALIDADE_DO_CONVITE_EM_DIAS = 30

export async function POST(req: Request) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const bruto = Object.fromEntries(await req.formData())
  const parsed = z
    .object({
      pessoa_id: z.uuid(),
      // Vazio = convite sem desconto. É um caso legítimo: nem todo mundo
      // da lista de espera entra na D-16.
      cupom_id: z.union([z.uuid(), z.literal('')]).optional(),
    })
    .safeParse(bruto)

  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    // ⚠️ A PESSOA É RESOLVIDA A PARTIR DA LISTA, e não do que o formulário
    // mandou. O `pessoa_id` diz QUAL linha; nome e e-mail saem da
    // consulta. Senão o painel viraria uma ferramenta de disparo
    // arbitrário — "nenhuma decisão de negócio vem do cliente" vale igual
    // atrás da allowlist.
    const pessoa = (await listarListaDeEspera()).find((p) => p.pessoa_id === parsed.data.pessoa_id)

    if (!pessoa) {
      return Response.json(
        { ok: false, message: 'Essa pessoa não está mais na lista de espera. Recarregue.' },
        { status: 409 },
      )
    }

    // ------------------------------------------------------------
    // O CUPOM — resolvido no SERVIDOR, a partir do id
    //
    // ⚠️ O CÓDIGO NÃO VEM DO FORMULÁRIO. Se viesse, o corpo do POST
    // poderia declarar qualquer texto como "seu desconto" e o e-mail sairia
    // prometendo um cupom que não existe. O que atravessa é o id; o código
    // e a descrição saem da linha do banco.
    //
    // ⚠️ E ELE NÃO É VALIDADO AQUI CONTRA EXPIRAÇÃO OU LIMITE. De
    // propósito: quem julga é `cupomInvalidoPorque`, no ato do checkout,
    // com o relógio daquele momento. Validar agora responderia a pergunta
    // errada — o convite pode ficar dias na caixa de entrada, e o que vale
    // é o estado do cupom quando ela clicar.
    // ------------------------------------------------------------
    let cupom: { codigo: string; descricao: string } | null = null

    if (parsed.data.cupom_id) {
      const registro = await buscarCupomPorId(parsed.data.cupom_id)

      if (!registro) {
        return Response.json({ ok: false, message: 'Cupom não encontrado.' }, { status: 404 })
      }

      cupom = {
        codigo: registro.codigo,
        descricao: descreverCupom(registro.tipo, registro.valor),
      }
    }

    const convite = await garantirConvite(pessoa.pessoa_id, VALIDADE_DO_CONVITE_EM_DIAS)

    const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
    const url = new URL('/', base)
    url.searchParams.set('convite', convite.token)
    // ⚠️ O CUPOM VAI TAMBÉM NA URL, para o campo já chegar preenchido.
    // Isso torna o link mais valioso se for encaminhado — e o controle
    // disso é o LIMITE DE USOS do cupom, que a Giovanna define na tela.
    // Sem isso, ela teria que explicar no corpo do e-mail e a pessoa
    // copiar à mão, que é onde a conversão se perde. O código também vai
    // escrito no e-mail, para quem abrir sem HTML.
    if (cupom) url.searchParams.set('cupom', cupom.codigo)

    const safra = await buscarSafraAtiva().catch(() => null)

    await convidarParaInscricao(
      { nome: pessoa.nome, email: pessoa.email, link: url.toString(), cupom },
      safra ? { nome: safra.nome, data_inicio_aulas: safra.data_inicio_aulas } : null,
      'convite',
    )

    return Response.json(
      {
        ok: true,
        message: convite.reaproveitado
          ? `Convite reenviado para ${pessoa.nome} — mesmo link de antes.`
          : `Convite enviado para ${pessoa.nome}.`,
      },
      { status: 200 },
    )
  } catch (err) {
    console.error('[admin] falha ao convidar', err)
    return Response.json({ ok: false, message: 'Não conseguimos enviar agora.' }, { status: 500 })
  }
}
