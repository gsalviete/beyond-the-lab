# Manual do painel — Beyond The Lab

Este arquivo é para a Giovanna, não para quem programa. Se você abrir o
painel com ele do lado e não conseguir fazer o que precisa, o painel falhou —
e o conserto é no painel, não neste texto.

O endereço é **`/admin`**. Você entra com o e-mail e a senha que foram
criados para você. Nenhum outro e-mail entra, mesmo com a senha certa.

---

## O que cada tela faz

| Tela | Para quê |
|---|---|
| **Hoje** | Abre aqui. Mostra quantas pessoas estão em cada situação e avisa se alguém precisa de você |
| **Turmas** | Criar turma, mudar preço e data, abrir e fechar inscrições |
| **Alunas** | A lista inteira, com filtros. Clique num nome para ver a ficha |
| **Horários** | Criar os horários da semana e distribuir as alunas entre eles |
| **Pendentes** | Quem começou o pagamento e não terminou. **É a única tela que exige ação sua** |
| **Cupons** | Criar desconto, e desligar um que vazou |

---

## O caminho normal, do começo ao fim

### 1. Criar a turma

**Turmas → preencher → Criar turma.**

- **Nome** — "Setembro 2026". É o que aparece nos seus relatórios, não no site.
- **Começo das aulas** — o site nunca mostra este dia. Ele diz *"na primeira
  semana de setembro"*, porque cada aluna começa num dia diferente da mesma
  semana, dependendo do horário dela.
- **Primeira cobrança** — este sai exato. É o dia em que o cartão é debitado.
- **Mensalidade** e **duração** — a cobrança para sozinha depois do número de
  meses que você puser aqui. Você não precisa fazer nada em junho para a
  cobrança acabar em junho.
- **Limite de vagas** — deixe em branco. Sem limite é o normal aqui.

⚠️ **A turma nasce fechada.** Ninguém consegue se inscrever até você abrir.
Isso é de propósito: dá tempo de conferir o preço antes de o site começar a
vender.

### 2. Criar os horários

**Horários → escolher dia, digitar horário → Criar horário.**

O horário é texto livre: escreva do jeito que você quer que a aluna leia —
"19h", "19h às 20h30", tanto faz.

**Capacidade** em branco significa sem limite. Se você puser um número, o
painel avisa quando passar — mas não impede. Ele mostra, você decide.

### 3. Abrir as inscrições

**Turmas → Abrir inscrições.**

A partir daí o site vende. O preço e a data que aparecem lá são os que você
digitou — se mudar aqui, o site muda em segundos.

⚠️ **Só uma turma fica aberta por vez.** Se tentar abrir a segunda, o painel
avisa e pede que você feche a outra primeiro. Ele não fecha sozinho de
propósito: pode ter alguém no meio de um pagamento naquela turma.

### 4. Acompanhar quem chega

**Hoje** mostra os números. **Alunas** mostra a lista.

As situações, em português:

| No painel | O que aconteceu |
|---|---|
| Lista de espera | Se cadastrou quando não havia turma aberta |
| **Pagamento pendente** | Abriu o pagamento e **não terminou** |
| Cartão salvo | Cartão guardado, primeira cobrança ainda não chegou |
| Pagando | Já pagou pelo menos uma vez |
| Inadimplente | O cartão foi recusado |
| Concluiu | Terminou os meses da turma |
| Cancelada | Você cancelou |

### 5. ⚠️ Cuidar de quem ficou pendente

**Esta é a única coisa que só você pode fazer.**

Quem está em **Pagamento pendente** abriu a tela de pagamento e não terminou.
**Ela não consegue resolver sozinha**: se tentar se inscrever de novo, o site
responde que ela já está inscrita. Ela fica parada esperando, sem saber.

**Pendentes → Enviar link de pagamento.** Pronto. Ela recebe um e-mail com um
link que abre o pagamento direto, sem preencher nada de novo.

Se você mandar duas vezes, o segundo e-mail leva o **mesmo link** — os dois
funcionam. Isso é de propósito: gerar um link novo mataria o que já está na
caixa de entrada dela.

A tela mostra **há quanto tempo cada uma está parada**. Alguém parada há duas
horas talvez volte sozinha; alguém parada há três semanas não vai.

### 6. Distribuir os horários

**Horários → arraste os nomes entre as colunas.**

No computador dá para arrastar. No celular, use a caixinha de horário embaixo
de cada nome — faz exatamente a mesma coisa.

⚠️ **Mudar alguém de horário não mexe em pagamento nenhum.** Nada é cobrado,
cancelado ou alterado. Pode reorganizar a semana inteira à vontade.

Só aparecem aqui quem já tem contrato. Quem está na lista de espera ou com
pagamento pendente não entra na distribuição — não faz sentido dar horário a
quem talvez não venha.

---

## Cupons

**Cupons → preencher → Criar cupom.**

Três tipos, e o campo "Quanto" muda de significado conforme o que você
escolher — a tela avisa embaixo do campo:

| Tipo | "Quanto" significa |
|---|---|
| Desconto só no primeiro mês | porcentagem (20 = 20%) |
| Desconto em todos os meses | porcentagem (15 = 15%) |
| Meses grátis | quantidade de meses (2 = dois meses de graça) |

- **Vale para** — "Qualquer turma" é o normal. Escolha uma turma só se o
  desconto for exclusivo dela.
- **Limite de usos** em branco = ilimitado.
- **Expira em** em branco = não expira.

A aluna digita o código no formulário do site. Maiúscula ou minúscula dá no
mesmo.

⚠️ **"Não publicado no Stripe"** embaixo de um cupom não é erro. Significa que
ele ainda não foi registrado lá — e ele se registra sozinho na primeira vez
que alguém usar. Não precisa fazer nada.

**Desligar** um cupom para de aceitá-lo na hora, e não apaga o histórico de
quem já usou. É o botão para quando um código vazar num grupo de WhatsApp.

---

## Cancelar uma inscrição

**Alunas → clique no nome → Cancelar inscrição.**

Você precisa **digitar o nome da pessoa** para confirmar. É chato de
propósito: cancelar a pessoa errada numa lista de nomes parecidos é o erro
mais fácil de cometer, e o mais caro de desfazer.

⚠️ **As cobranças param no fim do mês que ela já pagou.** Ela não perde o que
comprou, e não há novo débito. O sistema não faz reembolso.

---

## A ficha da aluna

**Alunas → clique no nome.**

Além do contato e do que ela respondeu no formulário, a ficha mostra:

- **Contrato** — quanto ela combinou pagar, por quantos meses, e quantos meses
  já pagou. ⚠️ Este valor é o que **ela** combinou, e não o preço atual da
  turma. Se você mudou o preço depois, o dela continua o mesmo — está certo.
- **Consentimento** — quando ela aceitou os termos, e o texto exato que estava
  na tela naquele dia. É a prova, e é por isso que ela aparece por escrito.

Em cadastros antigos o consentimento aparece como **"Não sabemos"**. Isso não
quer dizer que ela recusou: quer dizer que o cadastro é anterior ao registro
de consentimento, e ninguém inventou a resposta depois.

---

## Coisas que o painel **não** faz, e por quê

- **Não reembolsa.** Reembolso de assinatura é feito no Stripe, à mão, e é
  raro o bastante para não valer uma tela.
- **Não manda e-mail em massa.** O convite para a lista antiga é gerado em
  lote e disparado por fora, com você revisando a lista antes. Um botão que
  manda e-mail para todo mundo é a coisa mais fácil de apertar por engano.
- **Não deixa apagar turma, horário ou aluna.** Desligar sim, apagar não —
  apagar levaria junto o histórico de quem pagou.
- **Não avisa por e-mail que alguém se inscreveu... exceto uma coisa.** Você
  recebe e-mail de **inscrição nova** e de **cobrança recusada**. O resto você
  vê no painel.

---

## Se algo der errado

| O que você vê | O que fazer |
|---|---|
| "E-mail ou senha incorretos" | Confira a senha. Se persistir, fale com o Gabriel — pode ser o cadastro |
| "Esta conta não tem acesso ao painel" | O e-mail está certo mas não é o autorizado |
| "Já existe uma turma com inscrições abertas" | Feche a outra turma primeiro, em Turmas |
| "Esse horário é de outra turma" | Você está tentando pôr alguém num horário que não é da turma dela |
| "Não conseguimos ler os números agora" | Recarregue. Nada foi perdido — é leitura, não escrita |

**Nada do que você faz no painel apaga dado de ninguém.** Se ficar em dúvida,
a ação mais segura é não fazer nada e perguntar.

---

<!--
⚠️ NOTA PARA QUEM PROGRAMA, e ela fica dentro do arquivo de propósito.

O `04-PLANO.md` pede "com print de cada tela" (`c78`). Os prints NÃO estão
aqui, e a ausência é declarada em vez de disfarçada:

  1. O `shot.mjs` sobe um dev server cuja checagem de saúde renderiza `/`,
     que lê `public.safras` — e o agente é proibido de abrir conexão com o
     banco, inclusive para `select` (`CLAUDE.md`).
  2. Mesmo rodado à mão, ele fotografaria a TELA DE LOGIN: as telas do
     painel exigem sessão, e o browser headless não tem uma.

Fotografar o painel exige um passo que ainda não existe — autenticar o
headless antes de navegar. Está registrado no `ESTADO.md` como pendência do
`c77`.

⚠️ E `design/` está no `.gitignore` (a mesma razão pela qual o `c28` não foi
commitável), então os prints precisariam de outro lugar para morar. Decidir
qual é decisão do dono.
-->
