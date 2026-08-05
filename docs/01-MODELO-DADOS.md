# 01 — Modelo de dados

## O problema do modelo atual

`waitlist` faz três trabalhos numa tabela só: **é a pessoa**, **é o
vínculo com a turma** e vai virar **o estado de pagamento**. Funciona
enquanto o único ato é gravar uma linha. Quebra em três lugares
previsíveis:

- `email` é unique **na inscrição**. Uma aluna de janeiro não consegue
  se inscrever em julho.
- Não há onde pendurar estado de assinatura sem misturar dado pessoal
  com estado financeiro na mesma linha.
- Não há como uma pessoa existir sem inscrição — que é exatamente o que
  a base atual virou.

## Vocabulário (usar em código, UI e conversa)

| Termo | No banco | O que é |
|---|---|---|
| **Safra** | `safras` | A leva. "Turma de janeiro". Tem calendário e preço. |
| **Grupo** | `grupos` | Um horário dentro da safra. "Segunda 19h". Sem calendário. |
| **Pessoa** | `pessoas` | O contato. Existe uma vez, para sempre. |
| **Inscrição** | `inscricoes` | Pessoa ↔ safra. Uma por safra por pessoa. |
| **Assinatura** | `assinaturas` | O espelho do Stripe. 1:1 com inscrição paga. |

> Na UI da Giovana, "safra" aparece como **Turma** e "grupo" como
> **Horário**. O vocabulário técnico não sobe para a tela dela.

---

## Tabelas

### `safras`
Evolução de `turmas`. Renomear com `ALTER TABLE ... RENAME`, preservando
dados e FK.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | nunca sai para o navegador |
| `nome`, `slug` | text | slug é a chave estável |
| `data_inicio_aulas` | date | **fonte de verdade** do calendário |
| `data_primeira_cobranca` | date | âncora do `trial_end` do Stripe |
| `valor_mensal` | numeric(10,2) | |
| `duracao_meses` | int | |
| `vagas_total` | int null | `null` = sem limite (D-08) |
| `inscricoes_abertas` | bool | a chave que a Giovana liga |
| `stripe_price_id` | text null | criado no Stripe quando a safra é publicada |
| `created_at` | timestamptz | |



### `grupos`
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `safra_id` | uuid fk → safras | `on delete restrict` |
| `dia_semana` | text | `seg`…`sex`, CHECK |
| `horario` | text | "19:00" |
| `capacidade` | int null | |
| `ativo` | bool | |

Sem data, sem valor, sem duração (D-01).

### `pessoas`
| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `nome`, `email` (**unique**), `telefone` | text | telefone em E.164 |
| `token_acesso` | uuid null | link de retorno (D-10) |
| `token_expira_em` | timestamptz null | |
| `created_at` | timestamptz | |

O unique de e-mail **sai da inscrição e vem para cá**. É a mudança que
destrava a pessoa se inscrever em safras diferentes.

### `inscricoes`
| Grupo | Colunas | Nota |
|---|---|---|
| Vínculo | `pessoa_id` fk, `safra_id` fk **null**, `grupo_id` fk **null** | `safra_id` null = lista de espera |
| Estado | `status` | máquina abaixo |
| Perfil | `nivel_ingles`, `curso`, `periodo`, `disponibilidade` text[] | insumo do kanban |
| **Travado** | `valor_mensal_travado`, `duracao_meses_travada`, `data_primeira_cobranca_travada` | copiados no checkout (D-06) |
| **Prova** | `consent`, `consent_at`, `consent_text` | inalterado do sistema atual |
| | `created_at` | |

**Duas uniques parciais, e as duas são necessárias:**

```sql
unique (pessoa_id, safra_id) where safra_id is not null  -- uma por safra
unique (pessoa_id)           where safra_id is null      -- uma na espera
```

A primeira sozinha deixa um buraco: `null` não é igual a `null` num
índice, então uma pessoa poderia acumular N linhas de lista de espera.
A segunda fecha isso.

> **Elas são o que produz a resposta de duplicata.** No modelo atual, a
> resposta idêntica à de sucesso (REPORT §9.2) nasce da unique violation
> de `waitlist.email`. Aqui `pessoas.email` é resolvido por **upsert** e
> não viola nada — quem passa a levantar `23505` é uma destas duas. Se
> elas não existissem, o caminho de duplicata sumiria sem ninguém
> perceber, porque o insert simplesmente daria certo duas vezes.
>
> **Nada sobre o upsert de `pessoas` pode vazar se o e-mail já existia** —
> nem status HTTP, nem mensagem, nem e-mail disparado, nem tempo de
> resposta perceptível. O formulário não é oráculo de "este e-mail está
> no banco?".

### `assinaturas`
| Coluna | Tipo |
|---|---|
| `id` uuid pk · `inscricao_id` fk **unique** | 1:1 |
| `stripe_customer_id`, `stripe_subscription_id` (unique), `stripe_checkout_session_id` | text |
| `status_stripe` | text — espelho cru do Stripe |
| `trial_end`, `cancel_at` | timestamptz |
| `ciclos_pagos` | int default 0 |
| `cupom_id` | uuid fk null |
| `atualizado_em` | timestamptz |

### `cupons`
| Coluna | Tipo | Nota |
|---|---|---|
| `id` uuid pk · `codigo` text unique | maiúsculo, sem espaço |
| `tipo` | `primeiro_mes` \| `todos_meses` \| `meses_gratis` |
| `valor` | numeric — % ou nº de meses conforme o tipo |
| `stripe_coupon_id` | text — espelho, criado pela nossa API |
| `safra_id` | uuid fk null — `null` = vale em qualquer safra |
| `usos_max`, `usos_atuais`, `expira_em`, `ativo` | |

Nasce aqui, é espelhado no Stripe (D-07). Nunca criar cupom pelo
Dashboard.

### `eventos_stripe`
| Coluna | Tipo |
|---|---|
| `stripe_event_id` text **pk** · `tipo` text · `recebido_em` timestamptz · `payload` jsonb |

A PK **é** a idempotência. Webhook do Stripe reentrega; sem isso,
`ciclos_pagos` conta errado.

---

## Máquina de estados de `inscricoes.status`

```
              ┌──────────────┐
              │ lista_espera │  sem safra aberta
              └──────┬───────┘
                     │ safra abre + pessoa volta pelo link
                     ▼
            ┌────────────────────┐
            │ pendente_pagamento │  checkout criado, não concluído
            └─────────┬──────────┘
       checkout.session.completed
                      ▼
              ┌──────────────┐
              │  confirmada  │  cartão salvo, cobrança agendada
              └──────┬───────┘
              invoice.paid (1ª)
                     ▼
              ┌──────────────┐      invoice.payment_failed
              │    ativa     │◄──────────────┐
              └──────┬───────┘               │
                     │                 ┌─────┴────────┐
      cancel_at atingido               │ inadimplente │
                     │                 └─────┬────────┘
                     ▼                       │ Giovana cancela
              ┌──────────────┐               ▼
              │  concluida   │        ┌─────────────┐
              └──────────────┘        │  cancelada  │
                                      └─────────────┘
```

`grupo_id` é **ortogonal ao status**. Alocação não move estado (D-03).

Cancelamento é **sempre manual**, com aprovação da Giovana. Não há
material online a revogar — são aulas no Meet — então o sistema não
precisa fazer nada além de marcar o estado e cancelar no Stripe.

---

## Invariantes no banco

Mantendo o princípio do REPORT §5: constraint no banco vence validação na
aplicação.

| Invariante | Mecanismo |
|---|---|
| No máximo uma safra aberta | índice único parcial (já existe, migrar) |
| Cobrança nunca depois do início das aulas | CHECK em `safras` |
| `safra_id` null ⟺ `status = 'lista_espera'` | CHECK em `inscricoes` |
| Uma inscrição por pessoa por safra | unique parcial (`safra_id not null`) |
| Uma linha de lista de espera por pessoa | unique parcial (`safra_id is null`) |
| Valores travados presentes ⟺ status ≥ `confirmada` | CHECK, `NOT VALID` |
| Consentimento tudo-ou-nada | CHECK, herdado |
| Grupo pertence à mesma safra da inscrição | **trigger** — FK não expressa isso |
| Domínio de `status`, `nivel_ingles`, `dia_semana` | CHECKs |

> **Todo CHECK novo entra `NOT VALID`.** É a lição da migração `004`:
> obrigar em toda linha nova sem reescrever nem falsificar o passado.

---

## Migração da base atual

A base de hoje é de um tipo que o sistema novo **não produz mais**: gente
que se cadastrou sem que houvesse compra possível. Se não ganhar um
estado próprio, vira fantasma.

```
waitlist (hoje)
   │
   ├──► pessoas          nome, email, telefone
   │                     + token_acesso gerado
   │
   └──► inscricoes       perfil + trio de consentimento
                         safra_id = NULL
                         status   = 'lista_espera'
                         valores travados = NULL
```

Regras não negociáveis:

- **`consent` null continua null.** Zero backfill. `null` significa "não
  sabemos" e é o que torna visível, em qualquer query, quem não tem base
  documentada. Backfill aqui é falsificação de prova.
- `payment_choice` **não migra**. Some com a coluna (D-11).
- A tabela `waitlist` é **renomeada** para `waitlist_legado`, não
  apagada, até o corte 1 estar em produção e verificado.
- A migração é uma transação. Se falhar no meio, não deixa base pela
  metade.

**Verificação obrigatória antes de seguir para o corte 2:**
`count(pessoas) == count(waitlist_legado)` e
`count(inscricoes) == count(waitlist_legado)`. Se não bater, para.
