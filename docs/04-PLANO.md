# 04 — Plano e árvore de commits

## Por que corte, não dia

"Dia" é uma unidade que não significa nada para um agente — ele não sabe
quando você cansou. O corte é: **o que pode ir para produção sozinho e
onde parar se der ruim.**

| Corte | Entrega | Ponto de parada seguro |
|---|---|---|
| **1** | Modelo de dados + domínio + migração da base | Site igual por fora, lendo do modelo novo. Preço muda pelo banco. |
| **2** | Checkout, webhooks, link de retorno | Já dá para vender. Giovana opera pelo Studio ainda. |
| **3** | Painel | Autogerenciável. |

Cada corte termina com o site **em produção e funcionando**. Se o corte 2
atrasar, o corte 1 sozinho já conserta a tensão 8.1 do REPORT — que é a
única onde o sistema hoje pode dizer algo falso a quem está comprando.

**Regra de ouro:** há gente real na lista de espera. Nenhum corte pode
derrubar o formulário. Se um passo exigir downtime, ele está desenhado
errado.

---

# Corte 1 — Fundação

### Preparação
```
c01  chore(docs): adiciona docs/ com decisões e modelo da refatoração
c02  chore(supabase): substitui fetch cru pelo SDK oficial (server-only)
```
> `c02` implementa D-12. Manter `import 'server-only'` no topo e zero
> `NEXT_PUBLIC_`. É a rede que impede a `service_role` de ir para o bundle.

> **O `c03` — "tipos gerados do schema" — saiu daqui.** Ele geraria os
> tipos do schema atual, que o `c12`–`c18` substitui inteiro: `turmas`
> vira `safras`, e `pessoas`, `inscricoes` e `grupos` ainda não existem.
> Gerar duas vezes é desperdício, e a primeira versão nasceria condenada —
> pior, nasceria parecendo correta. A geração acontece uma vez só, no
> `c18b`. Até lá `type Turma` continua manual em `src/lib/supabase.ts`,
> com o `⚠️` apontando para lá.

### Domínio (fecha a tensão 8.2)
```
c04  feat(dominio): módulo neutro com níveis, dias, cursos e períodos
c05  feat(dominio): schemas Zod derivados do domínio
c06  refactor(modal): consome opções do domínio, remove constantes locais
c07  refactor(email): consome rótulos do domínio, remove duplicação
```
> Um módulo, quatro consumidores. Hoje os valores vivem em quatro lugares
> mantidos por disciplina.

### Testes (fecha a tensão 8.5)
```
c08  test: setup do runner (vitest)
c09  test(telefone): DDDs válidos, inválidos, normalização E.164
c10  test(dominio): schemas Zod aceitam e rejeitam o esperado
c11  test(consentimento): CONSENT_TEXT deriva dos segmentos
```
> Antes do schema mudar. Sem isso nenhuma refatoração adiante é segura.

### Schema novo
```
c12  feat(db): 005 — renomeia turmas → safras, adiciona
                     vagas_total, stripe_price_id
c13  feat(db): 006 — cria grupos
c14  feat(db): 007 — cria pessoas
c15  feat(db): 008 — cria inscricoes (sem dados)
c16  feat(db): 009 — CHECKs NOT VALID + trigger grupo/safra coerentes
c17  feat(db): 010 — migra waitlist → pessoas + inscricoes (transacional)
c18  feat(db): 011 — renomeia waitlist → waitlist_legado
c18b refactor(supabase): tipos gerados do schema, remove tipos manuais
c19  test(db): verifica contagem pessoas == inscricoes == legado
```
> `c17` é o commit mais perigoso do plano. Transação única, `consent`
> null permanece null, `payment_choice` não migra. Rodar em staging e
> conferir `c19` antes de tocar produção.

> `c18b` não estava no plano e precisa estar. É a **primeira e única**
> geração de tipos do corte: ela acontece aqui porque aqui é o primeiro
> momento em que o schema é o schema final — `safras`, `grupos`,
> `pessoas` e `inscricoes` todas de pé. Gerar antes produziria tipos que
> não descrevem as tabelas que o `c21` usa, e o TypeScript não teria como
> reclamar, que é a pior forma de estar errado.
>
> `supabase gen types` é rodado pelo dono do repositório; o agente recebe
> o arquivo pronto (ver `CLAUDE.md`).

### Consumo (fecha a tensão 8.1)
```
c20  refactor(api): turma-ativa → safra-ativa, devolve vagas
c21  refactor(api): waitlist → inscricao, escreve no modelo novo
c22  feat(pricing): valor e duração vêm da safra, remove literais
c23  feat(landing): data de início vem da safra, remove texto fixo
c24  feat(email): datas e valores vêm da safra
c25  refactor(modal): remove pergunta payment_choice (D-11)
c26  test(api): payload de insert, par safra_id/status, resposta de duplicata
```

### Fecho
```
c27  chore(shot): render de validação das seções afetadas
c28  docs: SPEC.md — tokens novos do corte 1
```

> **O corte 1 sobe com `inscricoes_abertas = false`.** Sem checkout (que
> é o `c35`), safra aberta não faz sentido: o ramo `pendente_pagamento`
> existe no código e fica inalcançável até lá. Todo mundo cai em
> `lista_espera` e a tela de sucesso não muda. Ver a nota no Fluxo 1 do
> `02-FLUXOS.md`.

**Aceite do corte 1:** mudar `valor_mensal` no Studio muda a landing em
até 60s, sem deploy. Formulário nunca parou. Base migrada e conferida.

---

# Corte 2 — Dinheiro

### Base
```
c29  chore(stripe): SDK, env vars, cliente server-only
c30  feat(db): 012 — cria assinaturas
c31  feat(db): 013 — cria cupons
c32  feat(db): 014 — cria eventos_stripe (PK = idempotência)
c33  feat(db): 015 — colunas travadas em inscricoes + CHECK NOT VALID
```

### Preço e checkout
```
c34  feat(stripe): cria/sincroniza price a partir da safra
c35  feat(api): POST /api/checkout — sessão com trial_end e cancel_at
c36  feat(api): validação de vagas antes de abrir o checkout (D-08)
c37  feat(api): copia valores travados na inscrição (D-06)
c38  feat(modal): ramifica em checkout ou lista de espera
c39  feat(landing): /inscricao/sucesso e /inscricao/cancelado
```
> `c35` é o coração. `trial_end` = `data_primeira_cobranca`,
> `cancel_at` = `+ duracao_meses`. Sem job agendado nosso (D-05).

### Webhooks
```
c40  feat(api): webhook com verificação de assinatura
c41  feat(webhook): idempotência via eventos_stripe
c42  feat(webhook): checkout.session.completed → confirmada
c43  feat(webhook): invoice.paid → ativa, ciclos_pagos++
c44  feat(webhook): invoice.payment_failed → inadimplente
c45  feat(webhook): subscription.deleted → concluida ou cancelada
c46  test(webhook): reentrega do mesmo evento não conta duas vezes
c47  test(stripe): 6 ciclos, não 7 — cancel_at na data certa
```
> `c47` é o teste que evita a reclamação de julho.

### Cupom
```
c48  feat(stripe): cria coupon a partir do nosso registro
c49  feat(api): valida e aplica cupom na sessão de checkout
c50  test(cupom): expirado, esgotado, de outra safra são rejeitados
```

### Link de retorno
```
c51  feat(db): 016 — token_acesso e token_expira_em em pessoas
c52  feat(api): GET /api/pessoa/:token — expirado cai no fluxo limpo
c53  feat(modal): pré-preenche a partir do token
c54  script(ops): gera tokens e exporta CSV da base atual
c55  feat(email): template de convite para a base atual
```
> `c54` gera o CSV; o disparo é manual e revisado. Um script que manda
> e-mail sozinho para a base inteira é a coisa mais fácil de errar aqui.

### Observabilidade (fecha 8.8)
```
c56  feat(alerta): cobrança falhada notifica a Giovana por e-mail
c57  feat(log): erros de webhook e insert com contexto rastreável
```

**Aceite do corte 2:** inscrição completa em modo teste do Stripe, do
formulário ao webhook, com cartão salvo e sem débito imediato. Cupom
aplica. Reentrega de webhook não duplica.

---

# Corte 3 — Painel

### Acesso
```
c58  feat(auth): Supabase Auth com Google
c59  feat(auth): allowlist por e-mail validada no servidor (D-09)
c60  feat(auth): middleware em /admin
c61  feat(auth): guard em toda rota /api/admin/*
c62  test(auth): e-mail fora da allowlist recebe 403 na API
```
> `c61` e `c62` são o que realmente protege. `c60` é UX.

### Layout
```
c63  feat(admin): layout, navegação, tela de login
c64  feat(admin): /admin — visão de hoje com contadores e alertas
```

### Operação
```
c65  feat(admin): CRUD de turmas
c66  feat(admin): aviso de preço travado ao editar turma vendida (D-06)
c67  feat(admin): abrir/fechar inscrições
c68  feat(admin): CRUD de horários
c69  feat(admin): lista de alunas com filtros
c70  feat(admin): ficha da aluna
c71  feat(admin): kanban de alocação com drag and drop
c72  feat(api): PATCH de grupo — valida safra, não toca no Stripe (D-03)
c73  feat(admin): cancelar inscrição com confirmação por nome
c74  feat(admin): CRUD de cupons em linguagem de gente
c75  feat(admin): tela de pagamentos que exigem ação
```

### Fecho
```
c76  test(admin): alocação não dispara chamada ao Stripe
c77  chore(shot): render das telas do painel
c78  docs: manual de operação da Giovana, com print de cada tela
c79  chore(db): remove waitlist_legado — só depois de tudo verificado
```
> `c78` é entregável de produto, não documentação técnica. Se ela não
> conseguir operar sozinha com esse arquivo aberto, o painel falhou.
> `c79` é o último commit do projeto inteiro, e só com backup feito.

---

## Fora de escopo (deliberado)

Da agenda do REPORT, ficam de fora e continuam registrados:

- **8.4 rate limit distribuído** — o `Map` em memória segura bot ingênuo
  e duplo-clique. Com pagamento no fluxo, o Stripe vira a barreira real.
- **8.6 unificação TypeScript** — oportunista, junto de quem tocar no
  arquivo.
- **8.9 quebrar `InscricaoModal.jsx`** — vai encolher naturalmente em
  `c25` e `c38`. Se depois disso ainda passar de 600 linhas, vira corte 4.
- **Nota fiscal, reembolso automático, relatório** — só quando pedido.
