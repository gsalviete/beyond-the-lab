import FormularioCupom from '@/components/admin/FormularioCupom.jsx'
import { listarCupons, listarSafras } from '@/lib/supabase'

// ============================================================
// CUPONS (`c74`) — criar, desabilitar, e ver o uso
//
// ⚠️ A DIREÇÃO É UMA SÓ (D-07): o cupom nasce aqui e é espelhado no
// Stripe. Cupom criado pelo Dashboard não existe para o sistema — não
// aparece nesta lista, não tem contagem de uso, e a Giovanna não teria
// como saber que ele existe.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

const ROTULO_TIPO = {
  primeiro_mes: 'no primeiro mês',
  todos_meses: 'em todos os meses',
  meses_gratis: 'de mês grátis',
}

export default async function Page() {
  const [cupons, safras] = await Promise.all([listarCupons(), listarSafras()])

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        Cupons
      </h1>

      <div className="mt-6">
        <FormularioCupom safras={safras} />
      </div>

      <h2 className="mt-10 font-display text-[20px] font-semibold text-ink">Criados</h2>

      {cupons.length === 0 ? (
        <p className="mt-3 font-sans text-[15px] text-muted">Nenhum cupom ainda.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {cupons.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white px-5 py-4
                         shadow-soft sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-display text-[17px] font-semibold text-ink">
                  {c.codigo}{' '}
                  <span className="font-sans text-[14px] font-normal text-muted">
                    {/* A frase é montada em português e a unidade muda com
                        o tipo: percentual nos dois primeiros, contagem de
                        meses no terceiro. Ver `013`. */}
                    {c.tipo === 'meses_gratis'
                      ? `${c.valor} ${c.valor === 1 ? 'mês' : 'meses'} grátis`
                      : `${c.valor}% ${ROTULO_TIPO[c.tipo]}`}
                  </span>
                </p>

                <p className="mt-1 font-sans text-[13px] leading-[20px] text-muted">
                  {c.safra_id ? 'Uma turma específica' : 'Qualquer turma'}
                  {' · '}
                  {c.usos_max === null
                    ? `${c.usos_atuais} usos`
                    : `${c.usos_atuais} de ${c.usos_max} usos`}
                  {c.expira_em ? ` · expira em ${formatarData(c.expira_em)}` : ' · sem validade'}
                </p>

                {/* ⚠️ "NÃO PUBLICADO" É UM ESTADO REAL, e a tela o mostra em
                    vez de fingir que está pronto: o cupom existe aqui e o
                    espelho no Stripe não subiu (a criação lá é uma chamada
                    de rede que pode falhar depois da linha gravada). Ele
                    ainda não desconta nada — e reespelha sozinho na
                    primeira tentativa de uso. */}
                {!c.stripe_coupon_id && (
                  <p className="mt-1 font-sans text-[13px] font-semibold text-brand">
                    Não publicado no Stripe — publica sozinho no primeiro uso.
                  </p>
                )}
              </div>

              {/* ⚠️ Desabilitar NÃO apaga: `delete` levaria junto o histórico
                  de quem já usou, que é informação financeira, e quebraria a
                  FK de `assinaturas.cupom_id`. É um interruptor, não uma
                  lixeira — e é por isso que o botão diz "desabilitar" e não
                  "excluir". */}
              <BotaoAtivo cupom={c} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function BotaoAtivo({ cupom }) {
  return (
    <form action="/api/admin/cupons" method="post" className="shrink-0">
      {/* `_method` porque formulário HTML só fala GET e POST. A rota expõe
          PATCH para quem chama por `fetch`; aqui o POST carrega a intenção.
          É feio e é honesto — o alternativa seria um botão que só funciona
          com JavaScript ligado. */}
      <input type="hidden" name="id" value={cupom.id} />
      <input type="hidden" name="ativo" value={cupom.ativo ? 'false' : 'true'} />
      <input type="hidden" name="_method" value="PATCH" />
      {/* ⚠️ "DESABILITAR CUPOM" E NÃO "DESLIGAR". O verbo sozinho não dizia
          o que era desligado — numa linha que também tem turma, validade e
          contagem de usos, "Desligar" podia ser qualquer um dos quatro. E
          ele é vermelho porque é o único dos dois estados que TIRA alguma
          coisa do ar: um cupom desabilitado é um desconto que o checkout
          passa a recusar, possivelmente já prometido num e-mail. Habilitar
          de volta não quebra nada, e por isso não é vermelho. */}
      <button
        type="submit"
        className={`rounded-full border px-4 py-2 font-sans text-[14px] font-medium
                    [transition:background-color_var(--motion-fast)_var(--ease-out),border-color_var(--motion-fast)_var(--ease-out),color_var(--motion-fast)_var(--ease-out)] ${
                      cupom.ativo
                        ? 'border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50'
                        : 'border-border-soft text-ink hover:border-brand hover:text-brand'
                    }`}
      >
        {cupom.ativo ? 'Desabilitar cupom' : 'Habilitar cupom'}
      </button>
    </form>
  )
}

/** `2026-09-01T12:00:00Z` → `01/09/2026`. */
function formatarData(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}
