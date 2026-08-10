# Teste de ponta a ponta

Roteiro para provar que o fluxo inteiro funciona: painel → site → Stripe →
webhook → painel de volta.

Faça **local primeiro**. É um comando de setup contra três de deploy, e o erro
mais provável aparece no passo 7 sem precisar de nada da Vercel.

---

## ⚠️ Antes: staging e produção NÃO é só replicar

A pergunta é justa, e a resposta é não. Duas coisas mudam de verdade:

**1. Modo teste e modo live do Stripe são dois universos separados.** Produto,
preço, cliente, assinatura, cupom e webhook de um **não existem** no outro. Um
cupom que você criar testando não existe em produção — e vice-versa.

**2. Nunca cruze os dois.** A regra é:

| Ambiente | Banco | Stripe |
|---|---|---|
| local / staging | Supabase **staging** | `sk_test_` |
| produção | Supabase **produção** | `sk_live_` |

⚠️ **O cruzamento perigoso é rodar chave de TESTE contra o banco de
PRODUÇÃO.** As colunas `safras.stripe_price_id` e `cupons.stripe_coupon_id`
guardam ids do Stripe. Preenchidas com ids de teste, elas ficam apontando para
objetos que não existem no modo live.

- O **preço** se cura sozinho: o código não acha, cria outro e regrava.
- O **cupom não**. Ele parece publicado (a coluna tem valor), o Stripe recusa
  na hora de criar a sessão, e a pessoa cai na fila de pendentes sem entender.
  Conserto: zerar `stripe_coupon_id` daquele cupom e deixar republicar.

Fora isso, o resto é replicação mesmo: mesmo código, mesmas variáveis com
valores diferentes.

---

## Parte 0 — Ligar as coisas (local)

Dois terminais.

**Terminal 1:**
```bash
npm run dev
```

**Terminal 2:**
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Ele cospe um `whsec_...`. **Cole no `.env.local` e reinicie o terminal 1** — a
variável é lida quando o módulo carrega, trocar sem reiniciar não faz nada.

Confira no `.env.local`:

- `SUPABASE_URL` e `SUPABASE_ANON_KEY` do **mesmo projeto** (staging)
- `STRIPE_SECRET_KEY` começando com `sk_test_`
- `EMAIL_ADMIN` com o e-mail que você criou no Supabase → **é a allowlist do
  painel**, é ele que entra em `/admin`

---

## Parte 1 — Painel

**1. Entrar.** `localhost:3000/admin/login`, e-mail e senha.

> Deu **"Esta conta não tem acesso ao painel"**? A senha funcionou. O
> `EMAIL_ADMIN` do `.env.local` não bate com o usuário do Supabase.
>
> Deu **"E-mail ou senha incorretos"**? Pode ser senha errada, usuário
> inexistente **ou usuário não confirmado**. Os três dizem a mesma frase de
> propósito — para o login não virar um oráculo de e-mails. No Supabase,
> confira se o usuário está com *Auto Confirm* ligado.

**2. Criar a turma.** `/admin/safras`.

⚠️ **A primeira cobrança tem que ser daqui a 3 dias ou mais.** O Stripe recusa
`trial_end` a menos de 48h, e nesse caso o sistema cobra na hora — você
perderia justo o "zero débito imediato" que veio testar.

**3. Criar horários.** `/admin/alocacao`. Dois já bastam: segunda 19h e quarta
19h.

**4. Criar um cupom.** `/admin/cupons`. Para o teste: *Desconto só no primeiro
mês*, **50**, qualquer turma, sem limite.

> "Não publicado no Stripe" **não é erro**. Ele publica sozinho no primeiro
> uso.

**5. Abrir as inscrições.** `/admin/safras` → **Abrir inscrições**.

✅ Aparece "· inscrições abertas".

---

## Parte 2 — O site, como aluna

**6. Abrir a modal.** `localhost:3000`, clicar no CTA.

✅ O título diz **"Garanta sua vaga"** e existe o campo **Cupom de desconto**.

> Diz "As inscrições estão fechadas"? O passo 5 não pegou.

**7. Preencher e enviar.** Use um e-mail **seu de verdade** — os e-mails saem
mesmo, pelo Resend. Ponha o cupom.

✅ O navegador vai para `checkout.stripe.com`.

> **Este é o passo que mais importa.** Se der erro aqui, é provavelmente a
> resolução da sobrecarga de `criar_inscricao` — existem duas funções com o
> mesmo nome no banco (a antiga de 10 argumentos e a nova de 13), e o
> PostgREST escolhe pelo conjunto de chaves do corpo. Me traga o log do
> terminal 1.

**8. Conferir a tela do Stripe ANTES de pagar.**

✅ O desconto aparece.
✅ Diz **R$ 0,00 hoje** / "após o período de teste".

⚠️ **Se disser que vai cobrar agora, pare.** A data de cobrança está perto
demais — volte ao passo 2.

**9. Pagar.** Cartão `4242 4242 4242 4242`, validade futura, CVC qualquer.

✅ Volta para `/inscricao/sucesso`.

**10. Terminal 2.**

✅ `checkout.session.completed [200]`

⚠️ **Você VAI ver um `[500]` no `invoice.paid`, e ele é esperado.** O Stripe
manda os eventos fora de ordem: a fatura chega antes da sessão, o handler não
acha a assinatura espelhada ainda e devolve 500 de propósito, para o evento ser
reentregue.

⚠️ **Mas o `stripe listen` NÃO REENTREGA.** A CLI encaminha uma vez e pronto —
quem reentrega é o Stripe de verdade, em produção. Para fechar o teste local,
reenvie à mão:

```bash
stripe events resend evt_XXXXX
```

(o id está no log, na linha do 500). Aí ele processa e a inscrição completa o
ciclo.

> Veio `[500]` em `checkout.session.completed`? Aí sim é problema. Cole o log
> dos dois terminais.

**11. Seu e-mail.**

✅ Dois: a notificação da inscrição (sai na hora do cadastro) e a confirmação
da aluna (sai **depois do pagamento**, não antes — quem não pagou não recebe
"inscrição confirmada").

**12. ⚠️ A fatura de R$ 0,00 do trial.**

Você viu `invoice.paid` no momento do cadastro, com valor zero — é o Stripe
abrindo a fatura do período de teste. **Ela não conta como mês pago**, e é isso
que o painel tem que mostrar:

✅ Em `/admin`, a pessoa aparece em **"Cartão salvo"**, e **não** em "Pagando".
✅ Na ficha dela, **"Meses pagos: 0"**.

Se aparecer "Pagando" ou "Meses pagos: 1" antes de qualquer débito, me chame —
é o defeito que fecharia a conta em sete meses num curso de seis.

---

## Parte 3 — Stripe

**13. Dashboard → Customers → a assinatura.**

✅ `trial_end` = a data que você pôs em "primeira cobrança"
✅ **`cancel_at` = primeira cobrança + duração.** Com 6 meses: seis faturas,
não sete.
✅ O cupom aplicado.

---

## Parte 4 — De volta ao painel

**14.** `/admin` → os contadores mexeram.

**15.** `/admin/alunas` → clicar no nome.
✅ O contrato mostra o valor certo, e o consentimento tem data e o texto
inteiro.

**16.** `/admin/alocacao` → arraste o nome (ou use a caixinha de horário).
✅ Muda de coluna, **e o terminal 2 não registra nada**. Alocação não mexe em
pagamento — é a regra que torna o kanban seguro de usar.

---

## Parte 5 — Os caminhos que dão errado

**17. Reentrega.** Dashboard → Webhooks → o evento → **Resend**.
✅ `[200]`, e `ciclos_pagos` **não** muda.

**18. Fila de pendentes.** Inscreva outro e-mail e **feche a aba do Stripe sem
pagar**.
✅ Aparece em `/admin/pendentes` com "Parada há menos de uma hora".
→ **Enviar link** → chega e-mail → o link abre a modal já preenchida.
→ Mande de novo: a mensagem diz "mesmo link de antes". É de propósito — gerar
outro mataria o que já está na caixa de entrada dela.

**19. Cupom inválido.** Desligue o cupom em `/admin/cupons` e tente usar.
✅ "Esse cupom não está mais disponível", e **nada é gravado**. Corrige e
reenvia sem perder o formulário.

**20. O guard.**
```bash
curl -i localhost:3000/api/admin/cupons -X POST
```
✅ `403`. É a API negando, não só a tela sumindo — que é o que de fato
protege.

---

## Parte 6 — Repetir em staging deployado

Mesmo roteiro, com três configurações a mais.

**A. Webhook no Dashboard**, com o **toggle "Test mode" LIGADO**.

⚠️ Endpoint criado em modo live **não recebe evento de teste nenhum**, e você
perde meia hora achando que o código quebrou.

- URL: `https://<staging>/api/stripe/webhook`
- Eventos: `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.deleted`
- Copie o `whsec_` → `STRIPE_WEBHOOK_SECRET` na Vercel

**B. Use a URL de BRANCH, não a do deployment.** A Vercel dá as duas: a de
deployment muda a cada push (`...-abc123.vercel.app`), a de branch é estável
(`...-git-staging-....vercel.app`). Webhook apontando para a primeira quebra
no próximo push.

**C. Duas armadilhas de variável:**

⚠️ **As variáveis de Preview podem estar apontando para o banco de
PRODUÇÃO.** O `README.md` manda marcar `SUPABASE_URL` para *Production,
Preview e Development* — o mesmo banco nos três. **Confira que o Preview
aponta para o staging**, senão seus cadastros de teste caem na tabela onde
estão as pessoas reais.

⚠️ **`NEXT_PUBLIC_SITE_URL` com o domínio de produção faz o staging redirecionar
para produção** depois do pagamento. O código usa ela e cai na origem da
requisição se não existir — então **deixe vazia no escopo Preview**.

Toda mudança de variável exige redeploy.

---

## Parte 7 — Ir para produção

Nesta ordem, e a ordem importa.

**1.** Deploy do código em produção.

**2. `018`** — no SQL Editor, **só depois do deploy**. Ela remove a função
antiga de `criar_inscricao`. Antes do deploy, é ela que mantém o formulário no
ar.

**3.** Uma inscrição de verdade no site, para provar que banco e aplicação
concordam. Não existe consulta que responda isso.

**4. Chaves live:** `sk_live_` na Vercel + webhook novo no Dashboard com o
**Test mode desligado**, apontando para o domínio de produção. `whsec_` novo.

**5.** Criar a turma e os cupons **de novo**, em produção. Nada do modo teste
existe lá.

**6. `019`** — apaga `waitlist_legado`. ⚠️ **Só com backup, e não tem
pressa.** Ela não resolve nada hoje: é uma tabela parada que não incomoda
ninguém. Enquanto existir, uma divergência entre a base antiga e
`pessoas`/`inscricoes` ainda tem com o que ser comparada.

---

## Quando algo divergir

Traga os três juntos:

1. a linha do `stripe listen` (ou do log de Webhooks no Dashboard)
2. o log do `npm run dev` (ou os Runtime Logs da Vercel)
3. o que a tela mostrou

A divergência quase sempre está entre dois deles.
