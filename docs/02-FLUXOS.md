# 02 — Fluxos

## A regra que governa todos eles

Nenhuma decisão de negócio vem do cliente. Safra, status, valores
travados e carimbo de consentimento são **lidos ou gerados no
servidor**, sempre — mesmo quando o cliente "já sabe" a resposta.

Corolário prático: entre a resposta que a modal recebeu e o POST que ela
envia, a Giovana pode ter fechado a safra. A pergunta é sempre refeita
ao banco no ato da escrita.

---

## Fluxo 1 · Inscrição com safra aberta

```
  modal abre
      │
      ▼
  GET /api/safra-ativa ──► desenha preço, data e vagas
      │                    (sem `id`, cortado na montagem)
      ▼
  pessoa preenche  →  POST /api/inscricao
                            │
      ① rate limit ─────────┼──► 429
      ② parse JSON ─────────┼──► 400
      ③ Zod ────────────────┼──► 400
      ④ honeypot ───────────┼──► 200 "sucesso", não grava
      ⑤ consentAt = agora()
      ⑥ buscarSafraAtiva()  ← AO BANCO, não ao payload
      │
      ├── sem safra ────► upsert pessoa + inscrição `lista_espera`
      │                   → 200 { modo: 'lista_espera' }
      │
      └── com safra ────► ⑦ conta vagas (D-08)
                          ⑧ upsert pessoa
                          ⑨ inscrição `pendente_pagamento`
                             + copia valores travados (D-06)
                          ⑩ cria Checkout Session
                          → 200 { modo: 'checkout', url }
                                    │
                          window.location.assign(url)
```

> **No corte 1 o ramo de baixo é inalcançável, de propósito.** O código
> dele é escrito (⑦ a ⑨), mas o Checkout (⑩) só existe no `c35`. Sem
> checkout, "safra aberta" não significa nada — então o corte 1 vai para
> produção com `inscricoes_abertas = false` em toda safra, todo mundo cai
> em `lista_espera`, e o comportamento externo é idêntico ao de hoje.
> A alternativa — deixar gente parada em `pendente_pagamento` sem
> nenhuma sessão de pagamento criada e sem caminho para sair — seria
> inventar um estado sem saída para não mexer numa flag.

A ordem de ⑤ e ⑥ é a do sistema atual e continua certa: o carimbo de
consentimento nasce logo depois da validação que o exigiu, não dentro da
chamada ao banco — ali mediria a latência do PostgREST, não o instante da
manifestação.

**Duplicata continua respondendo igual a sucesso.** Se a pessoa já tem
inscrição naquela safra, a resposta é a mesma de uma nova. Responder
diferente transformaria o formulário num oráculo de "este e-mail existe
no banco?".

---

## Fluxo 2 · O Checkout

Sessão em modo `subscription`:

| Parâmetro | Valor | Por quê |
|---|---|---|
| `mode` | `subscription` | salva o cartão automaticamente |
| `line_items[0].price` | `safra.stripe_price_id` | |
| `subscription_data.trial_end` | `data_primeira_cobranca` (unix) | **cartão hoje, débito na semana de início** (D-04) |
| `subscription_data.cancel_at`¹ | `data_primeira_cobranca + duracao_meses` | morre sozinha no 6º mês (D-05) |
| `discounts[0].coupon` | `cupom.stripe_coupon_id` | se houver |
| `client_reference_id` | `inscricao.id` | a costura de volta |
| `metadata` | `inscricao_id`, `safra_slug` | redundância barata |
| `customer_email` | e-mail da pessoa | evita cliente duplicado |

¹ Se `cancel_at` não puder ser definido na criação via Checkout, o
webhook `checkout.session.completed` faz um `subscriptions.update` com
`cancel_at`. **Nunca** um job agendado nosso.

**Conta do prazo:** trial termina em `T` → fatura 1 em `T`, fatura 6 em
`T + 5 meses` (cobrindo até `T + 6`). Logo `cancel_at = T + 6 meses`.
São 6 débitos, não 7. Escrever teste para isso.

Cancelou o checkout / fechou a aba: a inscrição fica em
`pendente_pagamento`. O painel mostra essas separadas — é a fila de
"quase converteu" da Giovana.

---

## Fluxo 3 · Webhooks

`POST /api/stripe/webhook` — assinatura verificada com
`STRIPE_WEBHOOK_SECRET`. Requisição sem assinatura válida é 400 e nunca
toca o banco.

```
  evento chega
      │
      ▼
  já existe em eventos_stripe? ──sim──► 200, ignora
      │ não
      ▼
  grava evento (a PK É a idempotência)
      │
      ▼
  ┌─ checkout.session.completed ─► cria assinatura, inscrição → confirmada
  ├─ invoice.paid ───────────────► ciclos_pagos++, inscrição → ativa
  ├─ invoice.payment_failed ─────► inscrição → inadimplente + ALERTA
  ├─ customer.subscription.deleted
  │     ├─ ciclos_pagos >= duracao ──► concluida
  │     └─ senão ────────────────────► cancelada
  └─ (outros) ───────────────────► só registra
```

Sempre 200 para evento reconhecido e processado. Erro interno devolve
500 **de propósito** — o Stripe reentrega, e a idempotência garante que
reentrega é segura.

**`invoice.payment_failed` é o único evento que grita.** Todo o resto do
sistema degrada em silêncio por desenho (REPORT D5) — e é justamente por
isso que o silêncio é indistinguível de "não teve inscrição". Cobrança
falhada notifica a Giovana por e-mail, além de aparecer no painel.

---

## Fluxo 4 · Link de retorno (D-10)

**Dois caminhos, não um.**

```
E-MAIL para a base atual          REDES SOCIAIS / tráfego normal
beyondthelab.com/?t=<uuid>        beyondthelab.com/
        │                                  │
  GET /api/pessoa/:token                   │
        │                                  │
  válido? ──não──► link limpo ─────────────┤
        │ sim                              │
        ▼                                  ▼
  modal pré-preenchida            modal em branco
  (nome, e-mail, telefone)
        │                                  │
        └──────────► mesmo POST ◄──────────┘
```

- Token expira (sugestão: 60 dias, configurável).
- Token expirado **não mostra erro** — cai no fluxo limpo. Falha segura,
  como todo o resto.
- O token identifica, **não autoriza**. Não é sessão, não dá acesso a
  nada, não escreve nada sozinho.
- Nunca em URL postada publicamente.

---

## Fluxo 5 · Alocação em grupo

```
Giovana arrasta aluna → PATCH /api/admin/inscricoes/:id { grupo_id }
                              │
                        valida: grupo pertence à mesma safra
                              │
                        UPDATE grupo_id
                              │
                        FIM. Nada de Stripe. (D-03)
```

---

## Fluxo 6 · Cancelamento

Sempre iniciado pela Giovana, depois de ela falar com a aluna.

```
painel → confirmação explícita → DELETE /api/admin/inscricoes/:id
                                       │
                          stripe.subscriptions.cancel()
                                       │
                          status → cancelada, grupo_id → null
```

Não há material a revogar (as aulas são no Meet). Reembolso, se houver, a
Giovana faz manualmente — e o painel mostra o link direto para a
assinatura no Dashboard, para esse caso e só para ele.

---

## O que a landing passa a ler do banco

Fecha a tensão 8.1 do REPORT. **Nenhum destes pode ser literal em
código:**

| Onde | Hoje | Depois |
|---|---|---|
| `Pricing.jsx` | `R$ 299,99` na mão | `safra.valor_mensal` |
| `Pricing.jsx` | "Duração de 6 meses" | `safra.duracao_meses` |
| Hero / seções | — | `semanaDe(safra.data_inicio_aulas)` |
| E-mail de confirmação | "primeira semana de setembro de 2026" | idem |
| Modal de sucesso | idem | idem |

`formatarValorMensal()` volta a ter chamador. Se depois disso ainda
sobrar uma função sem uso em `src/config/curso.ts`, ela sai.

### São duas perguntas, não uma (D-13)

```
  safra de EXIBIÇÃO                    safra de INSCRIÇÃO
  ignora inscricoes_abertas            exige inscricoes_abertas = true
  order by data_inicio_aulas desc      no máximo uma (índice parcial)
  limit 1                                      │
        │                                      │
        ▼                                      ▼
  preço · duração · "na semana de"      CTA: inscrição ou lista de espera
  (a página SEMPRE mostra)              (o que o botão faz)
```

A vitrine nunca fica vazia porque a Giovana fechou as inscrições.

### Cache: ISR, não `force-dynamic`

`export const revalidate = 60` em `app/page.jsx`. A página continua
estática, a defasagem é de um minuto, e nenhum deploy é necessário para
mudar preço ou data — que é o que a D2 do REPORT sempre quis dizer. No
corte 3 o painel chama `revalidatePath` ao salvar e a defasagem some.

`force-dynamic` fica **só** nas rotas de API, onde já está e onde é a
coisa certa: `/api/safra-ativa` responde no ato da abertura da modal, e
`/api/inscricao` escreve.

Banco fora do ar não tem tratamento especial aqui: o ISR serve o último
build bom. É o fallback de graça, e é melhor que qualquer literal.

**Critério de aceite do corte 1:** mudar `valor_mensal` no Studio muda o
que a landing mostra em até 60s, sem deploy. Se exigir deploy, a D2 do
REPORT continua executada pela metade.
