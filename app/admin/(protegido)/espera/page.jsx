import Link from 'next/link'
import BotaoConvidar from '@/components/admin/BotaoConvidar.jsx'
import { listarCupons, listarListaDeEspera } from '@/lib/supabase'

// ============================================================
// LISTA DE ESPERA — convidar quem esperou (D-10, D-16)
//
// ⚠️ ESTAS SÃO AS PESSOAS QUE SE CADASTRARAM QUANDO NÃO HAVIA NADA PARA
// COMPRAR. Algumas esperando há meses. Pela D-16 elas são "a base mais
// interessada que o produto tem, e foram as únicas a quem o sistema não
// pôde oferecer nada".
//
// ⚠️ "HÁ QUANTO TEMPO" É DERIVADO de `inscricoes.created_at`, nunca uma
// flag — a D-16 exige, porque "uma coluna `primeira_semana boolean`
// depende de alguém lembrar de ligá-la no insert certo, e um dia não
// lembra".
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [espera, todosCupons] = await Promise.all([listarListaDeEspera(), listarCupons()])

  // Só cupom ligado aparece na escolha. Convidar alguém com um cupom
  // desligado mandaria um e-mail prometendo um desconto que o checkout vai
  // recusar — e a pessoa descobriria na hora de pagar.
  const cupons = todosCupons.filter((c) => c.ativo)

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Lista de espera
      </h1>

      <p className="mt-3 max-w-[640px] font-sans text-[15px] leading-[24px] text-[#345372]">
        Quem se cadastrou antes de existir turma aberta. O convite manda um link que abre o
        formulário já preenchido — e, se você escolher um cupom, com o desconto junto.
      </p>

      {cupons.length === 0 && (
        <p className="mt-4 max-w-[640px] font-sans text-[14px] leading-[22px] text-ink">
          Nenhum cupom ligado no momento. Você pode convidar sem desconto, ou criar um em{' '}
          <Link href="/admin/cupons" className="font-semibold text-brand underline underline-offset-2">
            Cupons
          </Link>{' '}
          antes de mandar.
        </p>
      )}

      <p className="mt-6 font-sans text-[14px] text-muted">
        {espera.length} {espera.length === 1 ? 'pessoa' : 'pessoas'}, da mais antiga para a mais
        recente
      </p>

      {espera.length === 0 ? (
        <p className="mt-3 font-sans text-[15px] text-muted">Ninguém na lista de espera.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {espera.map((p) => {
            const conviteVivo = p.token_expira_em !== null && new Date(p.token_expira_em) > new Date()

            return (
              <li
                key={p.inscricao_id}
                className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white px-5
                           py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-display text-[17px] font-semibold text-ink">{p.nome}</p>
                  <p className="mt-1 font-sans text-[14px] leading-[22px] text-[#345372]">
                    {p.email}
                  </p>
                  <p className="mt-1 font-sans text-[13px] leading-[20px] text-muted">
                    {/* A data crua, e não "há X dias": quem decide o corte da
                        "primeira semana" precisa ver O DIA, não uma
                        aproximação arredondada por mim. */}
                    Esperando desde {formatarData(p.criada_em)}
                    {conviteVivo ? ' · já recebeu convite' : ''}
                  </p>
                </div>

                <BotaoConvidar
                  pessoaId={p.pessoa_id}
                  nome={p.nome}
                  jaConvidada={conviteVivo}
                  cupons={cupons}
                />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** `timestamptz`: instante absoluto, e o fuso do Brasil é o que ela lê. */
function formatarData(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}
