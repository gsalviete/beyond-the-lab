# Briefing — sessão do painel (corte 3)

> Substitui a versão do corte 2, que já foi implementado.
> Cole o bloco abaixo como primeira mensagem de uma sessão na raiz do projeto.

## Onde estamos

| Corte | Estado |
|---|---|
| 1 — fundação | **em produção e aceito** |
| 2 — pagamento | **implementado, com teste; falta aceite manual e deploy** |
| 3 — painel | **esta sessão** (`c58`–`c79`) |

⛔ **O corte 2 não está no ar.** O código existe e compila, mas a inscrição de
ponta a ponta em modo teste do Stripe **ainda não foi feita**, e a `018` (que
dropa a sobrecarga antiga de `criar_inscricao`) ainda não foi escrita nem
rodada. A seção 4 do `ESTADO.md` tem a ordem exata.

Isso **não bloqueia** o corte 3: o painel lê e escreve as mesmas tabelas, que
já estão todas de pé em produção. Mas significa que ninguém deve deployar o
painel achando que o pagamento já está validado.

---

## ⚠️ A decisão que precisa ser tomada ANTES de escrever `/admin`

**Não existe Figma do painel.** O `design/SPEC.md` cobre só a landing, e a
regra do repositório é que **nenhum número visual é estimado — valor de layout
vem do Figma Dev Mode**. Nos termos atuais, `/admin` é inimplementável.

Três saídas, e a escolha é do dono:

1. **Aparece uma fonte de design** (Figma do painel, ainda que rascunho).
2. **Exceção declarada:** `/admin` é construído com os tokens que já existem —
   as classes de `globals.css`, `tailwind.config.js` e os componentes da
   landing —, sem inventar medida nova. Fica registrado que a regra foi
   suspensa ali e por quê.
3. **Uma biblioteca de componentes** entra só para `/admin`, e a regra passa a
   valer sobre os defaults dela.

⚠️ **A opção 2 é a que o corte 2 já usou duas vezes** (as telas de retorno do
Stripe e o campo de cupom), e funcionou: nenhuma medida nova foi inventada,
tudo saiu de classe já medida. Mas ali eram três telas simples; um painel
inteiro é outra escala.

**Não decida por ele.** Pergunte na primeira mensagem, e enquanto não houver
resposta trabalhe no que não é visual: as rotas de API, a allowlist, o guard e
os testes.

---

```
Você vai implementar o PAINEL (corte 3) da refatoração "Safra + Pagamento"
do Beyond The Lab. Os cortes 1 e 2 já estão implementados. Não os refaça.

LEIA ANTES DE ESCREVER CÓDIGO, NESTA ORDEM E SÓ ISTO:
  CLAUDE.md              as regras que não mudam
  docs/ESTADO.md         fonte única operativa — estado real e o que falta
  docs/00-DECISOES.md    D-01 a D-16, todas operativas

NÃO LEIA docs/01 a docs/05, CHECKLIST-LANCAMENTO.md nem REPORT.md. São
históricos. Onde divergirem do ESTADO.md, o ESTADO.md vence. Se precisar
de um deles para entender POR QUE algo é como é, abra o trecho
específico — nunca o arquivo inteiro.

O conhecimento real deste projeto está em COMENTÁRIO DE CÓDIGO. Ao mexer
num arquivo, leia os comentários dele antes. Eles explicam POR QUE NÃO, e
são o ativo mais valioso do repositório.

ESCOPO DESTA SESSÃO: O PAINEL, E SÓ ELE
c58 a c79 do docs/04-PLANO.md, mais o que a D-15 e a D-16 acrescentam:
a fila de pagamento pendente e o cupom de desconto da base atual.

⛔ NÃO DEPLOYE E NÃO TOQUE NO CORTE 2. Ele está implementado e aguarda
aceite manual (ESTADO.md §4). Se você achar um bug lá, PARE e me diga —
não conserte de passagem, porque cada mudança lá invalida o aceite que
ainda não foi feito.

PERGUNTE ANTES DE COMEÇAR
Não existe Figma de /admin e o design/SPEC.md cobre só a landing. A regra
"nenhum número visual estimado" torna o painel inimplementável como está.
Me pergunte qual das três saídas eu quero (fonte de design, exceção
declarada, ou biblioteca de componentes) — e não decida sozinho. Enquanto
eu não responder, trabalhe no que não é visual: c58-c62 (auth, allowlist,
guard, testes) e as rotas de API.

RITMO
Encadeie os passos sem parar para reportar cada um. Pare e me chame
apenas quando:
  a) uma decisão de negócio faltar (pergunte do jeito mais simples
     possível, e continue o que não depende dela);
  b) você precisar que eu rode um .sql, regenere tipos, ou mexa no
     Stripe/Vercel/Supabase Auth;
  c) o passo seguinte contradisser uma decisão D-01..D-16.
Fora isso, siga.

O QUE NÃO SE REDISCUTE (já decidido, está no ESTADO.md §2)
  - `cancel_at` é posto no webhook, e não na criação da sessão. A API do
    Stripe não aceita `cancel_at` em subscription_data. Não é violação da
    D-05: o que ela proíbe é job agendado nosso.
  - O e-mail de confirmação da aluna sai do webhook, depois do pagamento.
    O da Giovanna sai no insert, nos dois modos.
  - Vagas NÃO são fixas. `vagas_total` fica null (sem limite, D-08). A
    checagem existe e só morde se alguém preencher a coluna.
  - Retomada de checkout mantém o preço travado da PRIMEIRA vez.
  - Cupom tem três tipos e "20% por 3 meses" não é representável. Foi
    levantado e o dono decidiu manter assim.

O QUE O CORTE 2 JÁ DEIXOU PRONTO PARA VOCÊ
  - `convidarParaInscricao(convite, safra, motivo)` em src/lib/email.ts
    manda o link de pagamento para UMA pessoa — é o que a fila da D-15
    precisa (c75). O `motivo` 'pendente' já tem o texto escrito.
  - `cupomInvalidoPorque` e `cupomNoStripe` já existem; o c74 (CRUD de
    cupons) precisa só da tela e das rotas.
  - `supabase/operacao/gerar_convites.sql` gera tokens e o CSV da base
    atual, sem painel nenhum.
  - `mudarStatusInscricao`, `buscarAssinaturaPorSubscription`,
    `buscarInscricaoParaEmail` e `contarUsoDeCupom` já estão em
    src/lib/supabase.ts.

REGRAS QUE NÃO AFROUXAM
  1. NÃO COMMITE. Nunca git commit/add/push. Deixe no working tree.
  2. Você NÃO executa nada contra o banco — nem select. Migração é
     arquivo .sql em supabase/migrations/. Você escreve, eu rodo.
  3. `import 'server-only'` no topo de todo módulo que toca service_role
     ou STRIPE_SECRET_KEY. Zero NEXT_PUBLIC_ para segredo.
  4. Todo CHECK novo entra NOT VALID. Nenhum backfill de consent.
  5. Comentário que explica POR QUE NÃO migra junto com o código que ele
     descreve, reescrito para o contexto novo. Não encurte.
  6. Todo teste que compara duas listas ou afirma AUSÊNCIA precisa de
     CONTROLE NEGATIVO: quebre a implementação de propósito e confirme
     que fica vermelho. Verde comparando vazio com vazio já aconteceu
     duas vezes aqui.
  7. `tests/` está no include do tsconfig: rode `npx tsc --noEmit` além
     do `npm test`. ⚠️ E o tsc NÃO verifica .jsx (allowJs sem checkJs):
     identificador fora de escopo num componente é ReferenceError em
     runtime e nenhum teste pega. Depois de mexer num .jsx, me peça para
     abrir a página.
  8. Nunca rode `npm run build` — ele lê a safra no banco de produção.
  9. Você não roda o shot.mjs: ele sobe um dev server que lê o banco.

COMECE POR
c58-c62 (auth com Google, allowlist no servidor, middleware, guard nas
rotas /api/admin/*, e o teste de 403). É o que protege de verdade, é o
que não depende de design nenhum, e é o checkpoint que eu não delego.

⚠️ CHECKPOINT NÃO DELEGÁVEL, DEPOIS DO c61
Faço login com um e-mail FORA da allowlist e confirmo 403 na API — não
só a tela sumindo. "Logou com Google" não é autorização: qualquer pessoa
tem conta Google (D-09).

⚠️ ANTES DE TERMINAR A SESSÃO, FAÇA AS DUAS COISAS ABAIXO
Sem elas a próxima sessão recomeça cega, e o ESTADO.md perde a razão de
existir.

  1. ATUALIZE docs/ESTADO.md — o que rodou, o que ficou commitado, o que
     ficou no working tree, e qualquer fato operacional novo que só você
     saiba (a seção 3 existe para isso). Se uma contradição nova
     aparecer, resolva e registre na seção 2.
  2. REESCREVA docs/BRIEFING.md para a sessão seguinte, no mesmo formato
     deste. Se o corte 3 terminar, a sessão seguinte é o fecho do
     projeto: o c79 (remover waitlist_legado, só com backup) e o manual
     de operação da Giovanna.

Antes de começar, me devolva em até 8 linhas: o que você entendeu do
escopo, a pergunta sobre o design de /admin, e qual a primeira coisa que
vai escrever. Não espere minha resposta para seguir no que não depende
dela.
```

---

## Nota para o dono, fora do bloco

**Corte 3 são ~22 commits, e é o mais visual dos três.** Se a decisão de design
não for tomada, a sessão vai render `c58`–`c62` (que é o que realmente protege)
e travar no `c63`.

**O checkpoint do `c61` é seu e não se delega:** login com e-mail fora da
allowlist tem que receber **403 na API**, e não só uma tela que não aparece.
Middleware é UX; o guard na rota é a tranca.

**O `c79` é o último commit do projeto inteiro** — apagar `waitlist_legado` —,
e só com backup feito.
