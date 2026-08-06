# 00 — Decisões

Cada uma tem: a decisão, o motivo, e o que ela proíbe. Decisão travada
não se renegocia dentro da implementação — se ela estiver errada, o
lugar de descobrir isso é numa conversa, não num commit.

---

## D-01 · Safra tem calendário; grupo não

Uma **safra** (janeiro, julho…) tem: data de início das aulas, valor
mensal, duração, âncora de cobrança. Um **grupo** é só um horário dentro
dela (segunda 19h, quarta 19h…) e **não tem calendário nem preço
próprios**.

*Por quê:* o pool de aulas começa no mesmo dia para todo mundo; a
divisão por dia da semana é logística de agenda, não de contrato. Modelar
grupo com calendário próprio triplicaria o modelo, o painel e o suporte,
para representar uma diferença que não existe.

**Proíbe:** qualquer coluna de data, valor ou duração em `grupos`.

---

## D-02 · Pagar é o que faz alguém entrar. Não existe aprovação.

Não há entrevista, análise ou triagem. Quem conclui o checkout está
dentro. A Giovana organiza horário; ela não é porteira.

*Por quê:* é a operação real hoje, e inventar um estado de "aprovada"
criaria e-mail de recusa, tela de recusa e uma decisão que ninguém toma.

**Proíbe:** estado `aprovada`/`rejeitada`; qualquer gate humano entre o
formulário e o checkout.

---

## D-03 · Alocação em grupo não move dinheiro

Arrastar uma aluna de segunda para quarta no painel não dispara,
cancela ou altera nada no Stripe.

*Por quê:* ela já pagou antes de ser alocada. Separar as duas coisas é o
que torna o kanban seguro de usar — a Giovana pode reorganizar a semana
inteira sem medo.

**Proíbe:** qualquer chamada ao Stripe nos handlers de alocação.

---

## D-04 · Cartão salvo agora, primeira cobrança na semana de início

Checkout em modo `subscription` com `subscription_data.trial_end`
apontando para a data da primeira cobrança da safra. A aluna confirma o
cartão hoje e não é debitada até lá.

*Por quê:* é o que foi pedido, é mais honesto com quem se inscreve dois
meses antes, e reduz reembolso — que com assinatura é o pior fluxo de
suporte que existe.

**Nota de implementação:** o trial do Stripe tem teto de ~730 dias.
Irrelevante na prática (safra semestral), mas a validação existe no
painel.

---

## D-05 · A assinatura morre sozinha no 6º mês

`cancel_at` na assinatura = `data_primeira_cobranca + duracao_meses`,
definido no momento da criação.

*Por quê:* assinatura no Stripe não para sozinha. Se o encerramento
depender de um job nosso rodando em julho, uma hora ele não roda e uma
aluna é cobrada no 7º mês. `cancel_at` é declarado uma vez e o Stripe
cumpre.

**Proíbe:** cron/job de encerramento. Se `cancel_at` não der conta de
algum caso, o fallback é *subscription schedule* com
`end_behavior: 'cancel'` — nunca código nosso agendado.

---

## D-06 · Preço e prazo travam na assinatura

No momento do checkout, a inscrição copia `valor_mensal`,
`duracao_meses` e `data_primeira_cobranca` da safra para colunas
próprias. Mexer na safra depois **não afeta quem já assinou**.

*Por quê:* é a mesma lógica de `consent_text` no sistema atual — prova
não se normaliza. Preço de contrato firmado não se reescreve
retroativamente, e o Stripe já travou o valor de qualquer forma.

**Obriga:** o painel avisa na cara da Giovana, ao editar uma safra que já
tem inscrição paga, que a mudança só vale para quem vier depois.

---

## D-07 · O painel é a única ferramenta da Giovana

Cupom, safra, grupo, alocação, cancelamento: tudo em código, no nosso
painel. Ela não abre o Dashboard do Stripe nem o Supabase Studio para
operar.

*Por quê:* ela é engessada com tecnologia. Duas ferramentas é uma a
mais. Custa mais código e é o custo certo a pagar.

**Consequência:** cupom nasce no nosso banco e é espelhado no Stripe via
API. Nunca o contrário.

---

## D-08 · Vaga é limite mole

`vagas_total` é opcional (`null` = sem limite). O sistema conta antes de
abrir o checkout e recusa se estourou. **Não há trava transacional.**

*Por quê:* duas pessoas fechando o checkout no mesmo segundo pela última
vaga é possível e aceito. Na escala do produto (dezenas, não milhares), o
custo de um lock distribuído não se paga. O painel mostra o estouro em
vermelho e a Giovana resolve com uma conversa.

**Obriga:** o painel exibe `inscritas / vagas_total` sempre, e destaca
quando `inscritas > vagas_total`.

---

## D-09 · Existe um cliente autenticado agora — exatamente um

O painel introduz a primeira sessão do sistema. Google OAuth via
Supabase Auth, com **allowlist de e-mails validada no servidor**, não
confiança no token.

*Por quê:* "logou com Google" não é autorização — qualquer pessoa tem
conta Google. A allowlist é o que autoriza.

**Proíbe:** decidir acesso a partir de qualquer coisa que venha do
cliente. A verificação acontece no servidor, em todo request de `/admin`
e em toda rota `/api/admin/*` — não só no middleware.

---

## D-10 · Dois caminhos de entrada, não um

- **Link com token** (e-mail para a base atual): identifica a pessoa,
  pré-preenche a modal, expira.
- **Link limpo** (redes sociais, tráfego normal): formulário do zero.

*Por quê:* a Giovana vai postar o link no Instagram. Se o fluxo depender
de token, o Instagram quebra. Se não houver token, a base atual preenche
tudo de novo e a conversão cai.

**Proíbe:** token em URL postada publicamente; token sem expiração.

---

## D-11 · `payment_choice` morre

O campo perguntava "quer pagar agora?" numa tela onde pagar era
logicamente impossível. Não é bug de implementação — é o modelo
avisando que a etapa não existia.

**Consequência:** some a pergunta do formulário. A ramificação passa a
ser `safra aberta ? checkout : lista de espera`, decidida no servidor.

---

## D-12 · Troca o `fetch` cru pelo SDK do Supabase

O comentário em `src/lib/supabase.ts` ("se o escopo crescer — queries,
admin, auth — vale trocar pelo SDK") era um gatilho armado. Ele
disparou: são ~20 operações onde havia uma, mais Auth.

**Obriga:** `server-only` continua no topo. A ausência de `NEXT_PUBLIC_`
para a `service_role` continua. O SDK entra, a disciplina não sai.

---

## D-13 · A landing lê a safra mais recente, não a safra aberta

A query que alimenta preço, duração e data de início **ignora
`inscricoes_abertas`**: pega a safra de `data_inicio_aulas` mais recente,
sempre. `inscricoes_abertas` governa **só o CTA** — botão de inscrição
quando aberta, lista de espera quando fechada.

*Por quê:* separar as duas perguntas. "Quanto custa e quando começa" é
informação de vitrine e não pode sumir da página; "dá para comprar
agora" é estado de operação. Amarrar as duas na mesma flag faria a
Giovana fechar as inscrições e apagar o preço do site junto.

**Consequência — o cache é o fallback.** A página é estática com
`export const revalidate = 60`. Não é `force-dynamic`: "sem deploy"
nunca exigiu "sem cache", exigiu que a Giovana não dependa de um commit.
Um minuto de defasagem é o preço, e no corte 3 o painel dispara
`revalidatePath` ao salvar e a defasagem some.

Banco fora do ar deixa de ser caso a tratar: o ISR continua servindo o
último build bom. É melhor do que qualquer literal de fallback que se
pudesse escrever à mão — e é de graça.

**Proíbe:** `force-dynamic` na landing; literal de preço, duração ou
data em componente, inclusive como fallback.

---

## D-14 · A data de início é `na <ordinal> semana de <mês>`

Nunca a data seca. A frase é *"As aulas começam na primeira semana de
setembro."* — ordinal da semana, nome do mês, **sem ano**.

*Por quê:* pela D-01 o pool de aulas começa junto, mas cada grupo tem
seu dia. Quem cai no grupo de quarta não começa na segunda. Dizer
"as aulas começam em 01/09/2026" seria uma promessa que o produto não
cumpre — e é exatamente a razão pela qual o texto literal ("primeira
semana de setembro de 2026") foi parar no código no sistema atual. O
diagnóstico daquele comentário estava certo; o que estava errado era a
solução, que congelou a informação fora do banco.

O ordinal de semana mantém a informação **derivada** de
`data_inicio_aulas`, e não promete o dia.

**A forma anterior era "na semana de dd/mm/yyyy"** — *"As aulas começam
na semana de 01/09/2026"* —, trocada em **06/08/2026** por decisão do
dono do repositório. Ela saiu porque, para quem lê rápido, um
`dd/mm/yyyy` na frase continua parecendo data seca: o olho pega o
número e ignora o "na semana de", e a pessoa marca 01/09 na agenda.
Ou seja, a forma antiga carregava de volta exatamente o problema que a
decisão existe para evitar — e a única defesa contra isso eram três
palavras que o leitor apressado pula. Sem número de dia na frase, não
há o que pular. **O motivo da decisão não mudou; mudou só a forma que
o cumpre.**

Fica registrado aqui, e não só no histórico do git, porque decisão que
muda sem deixar rastro obriga a próxima pessoa a redescobrir o mesmo
debate — e a redescobrir tarde, quando a forma antiga já voltou a algum
componente por parecer mais precisa.

**O ano fica de fora, e isso é decisão, não esquecimento.** A frase da
landing é deliberadamente imprecisa quanto ao dia; acrescentar "de
2026" acrescentaria ruído a uma frase que já não promete data. A safra
de vitrine é sempre a de `data_inicio_aulas` mais recente (D-13), então
na leitura normal o ano é o próximo por construção. ⚠️ **O custo,
escrito:** em dezembro, vendendo a safra de setembro seguinte, "na
primeira semana de setembro" fica ambígua — pode ser lida como o
setembro que acabou de passar. Aceito hoje, porque a janela em que isso
acontece é curta e a página inteira fala da turma que vem. Se voltar a
doer, **o lugar de mudar é aqui**, nesta decisão, e não numa string de
componente.

**Limitação conhecida — o ordinal é contagem de semanas do mês, não
semana civil.** O dia sai da própria `data_inicio_aulas`: 1–7 é
"primeira", 8–14 "segunda", 15–21 "terceira", e **22–31 é "última"**,
numa faixa final aberta de propósito. Um `Math.ceil(dia / 7)` produziria
"quinta semana de setembro" para o dia 29, que é frase que ninguém fala;
e dividir em "quarta" (dia 22) e "quinta" (dia 29) separaria em duas
coisas que, para quem lê, são a mesma: o fim do mês. O preço dessa
escolha é que dia 22 e dia 29 leem igual — uma semana inteira de
diferença que a frase não distingue. Nenhuma safra atual começa no fim
do mês. Está registrado para quando cair.

Pela mesma razão, o mês vem da própria data e não da segunda-feira da
semana: aula que começa na quarta 02/09 é "primeira semana de setembro"
ainda que a semana civil comece em 31/08. Retroceder até a segunda para
nomear o mês faria a página dizer "agosto" sobre uma turma que não tem
uma única aula em agosto.

**Proíbe:**

- `dd/mm/yyyy` sozinho como data de início, na UI ou no e-mail;
- data de início por extenso ("1 de setembro de 2026") em qualquer
  superfície voltada para a inscrita;
- **literal de mês, semana ou data de início escrito à mão** em
  componente, e-mail ou config — inclusive como fallback.

⚠️ **Nome de mês DERIVADO não é literal, e a distinção é a decisão
inteira.** O que esta decisão proíbe é o valor escrito à mão, congelado
fora do banco: era `"primeira semana de setembro de 2026"` no meio de um
componente, e continuava dizendo setembro depois que a safra virou
janeiro. Produzir "setembro" **a partir de `safra.data_inicio_aulas`** é
o mecanismo que cumpre a decisão, não uma violação dela — é o que fazem
`formatarSemanaDeInicio` e `nomeDoMes` em `src/config/curso.ts`, e é por
isso que a formatação mora num lugar só: duas strings para o mesmo dado
são duas chances de divergir.

O teste é a origem do valor, não a aparência dele. Se a frase muda
sozinha quando a Giovana muda `data_inicio_aulas` no Studio, está certa.
Se ela sobrevive à mudança, é literal — não importa quão bem escrita
esteja.

---

## O que NÃO muda

Direto do `REPORT.md` §9, e continua valendo:

1. Nenhuma decisão de negócio vem do cliente.
2. Duplicata responde igual a sucesso, e não dispara e-mail.
3. Falha de infra degrada para lista de espera, nunca para tela de erro.
4. Consentimento é tudo-ou-nada, `null` = "não sabemos".
5. `server-only` + zero `NEXT_PUBLIC_` protegem a `service_role`.
6. Toda travessia de fronteira carrega o mínimo, com corte explícito.
7. Consentimento tem fonte única; a versão exibida é derivada dela.
8. Telefone roda dos dois lados a partir do mesmo módulo.
9. Constraint no banco vence validação na aplicação.
10. O comentário que explica **por que não** é o ativo mais valioso do
    repositório. Ele migra para o código novo ou o conhecimento some.
