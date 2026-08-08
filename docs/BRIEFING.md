# Briefing — sessão de implementação

> Substitui o `05-BRIEFING-CLAUDE-CODE.md`, que descrevia o corte 1.
> Cole o bloco abaixo como primeira mensagem de uma sessão na raiz do projeto.

## O plano de sessões

| Sessão | Escopo | Termina quando |
|---|---|---|
| **agora** | **corte 2 inteiro** — pagamento, do `016` ao `c57` | inscrição completa em modo teste, do formulário ao webhook |
| depois de um `/clear` | corte 3 — painel da Giovanna (`c58`–`c79`) | painel autogerenciável |

Uma sessão por corte, e **o corte 3 não começa nesta**. O motivo é o mesmo que
justificou o `ESTADO.md`: contexto acumulado custa caro, e o painel não depende
de nada do checkout estar fresco na cabeça — depende só do banco e das decisões,
que estão escritos.

---

```
Você vai continuar a refatoração "Safra + Pagamento" do Beyond The Lab.
O corte 1 JÁ ESTÁ EM PRODUÇÃO e aceito. Não o refaça.

LEIA ANTES DE ESCREVER CÓDIGO, NESTA ORDEM E SÓ ISTO:
  CLAUDE.md              as regras que não mudam
  docs/ESTADO.md         fonte única operativa — estado real e o que falta
  docs/00-DECISOES.md    D-01 a D-16, todas operativas

NÃO LEIA docs/01 a docs/05, CHECKLIST-LANCAMENTO.md nem REPORT.md.
São históricos. Onde divergirem do ESTADO.md, o ESTADO.md vence. Se
precisar de um deles para entender POR QUE algo é como é, abra o trecho
específico — nunca o arquivo inteiro.

O conhecimento real deste projeto está em COMENTÁRIO DE CÓDIGO. Ao mexer
num arquivo, leia os comentários dele antes. Eles explicam POR QUE NÃO, e
são o ativo mais valioso do repositório.

ESCOPO DESTA SESSÃO: O CORTE 2 INTEIRO, E SÓ ELE
Do 016 ao c57 — pagamento funcionando de ponta a ponta. A ordem está na
seção 4 do ESTADO.md.

⛔ NÃO COMECE O CORTE 3 (painel /admin, c58 em diante). Ele tem sessão
própria, depois de um /clear. Se sobrar tempo, use para teste e para o
fecho descrito lá embaixo — não para adiantar o painel.

RITMO — ISTO SUBSTITUI A REGRA DE "UM PASSO POR VEZ" DO CLAUDE.md
Encadeie os passos sem parar para reportar cada um. Pare e me chame
apenas quando:
  a) uma decisão de negócio faltar (pergunte do jeito mais simples
     possível, e continue o que não depende dela);
  b) você precisar que eu rode um .sql, regenere tipos, ou mexa no
     Stripe/Vercel;
  c) o passo seguinte contradisser uma decisão D-01..D-16.
Fora isso, siga.

O QUE NÃO SE REDISCUTE (já decidido, está no ESTADO.md §2)
  - A sessão de checkout é criada DENTRO de /api/inscricao, e não numa
    rota POST /api/checkout. O cliente nunca diz qual inscrição pagar.
  - A migração 016 muda a RPC criar_inscricao: 13 parâmetros (os 10
    atuais + os 3 travados) e retorno COMPOSTO (id da inscrição +
    booleano `criada`), não mais só o booleano. O id é o que permite uma
    segunda tentativa retomar uma inscrição presa em pendente_pagamento.
  - Os CHECKs dos valores travados já estão na 015 e estão certos.
    Não os altere.

PERGUNTA ABERTA — NÃO BLOQUEIE POR ELA
D-16 não tem data de corte da "primeira semana". Até eu decidir, use o
critério provisório escrito na própria D-16: toda inscrição lista_espera
migrada pela 010. Deixe o valor numa constante única, com o raciocínio
ao lado. Isso afeta o cupom de desconto (c48-c50); o resto da D-16 é do
corte 3 e não é seu problema nesta sessão.

REGRAS QUE NÃO AFROUXAM
  1. NÃO COMMITE. Nunca git commit/add/push. Deixe no working tree.
  2. Você NÃO executa nada contra o banco — nem select. Migração é
     arquivo .sql em supabase/migrations/. Você escreve, eu rodo.
  3. `import 'server-only'` no topo de todo módulo que toca service_role
     ou STRIPE_SECRET_KEY. Zero NEXT_PUBLIC_ para segredo.
  4. Todo CHECK novo entra NOT VALID. Nenhum backfill de consent.
  5. Comentário que explica POR QUE NÃO migra junto com o código que ele
     descreve, reescrito para o contexto novo. Não encurte.
  6. Todo teste que compara duas listas precisa de CONTROLE NEGATIVO:
     quebre a implementação de propósito e confirme que fica vermelho.
     Verde comparando vazio com vazio já aconteceu duas vezes aqui.
  7. `tests/` está no include do tsconfig: rode `npx tsc --noEmit` além
     do `npm test`. O vitest não typechecka, e erro de tipo em teste
     quebra o next build.
  8. Nunca rode `npm run build` — ele lê a safra no banco de produção.

COMECE POR
A migração 016 (ESTADO.md §4). Depois c35→c39, c40→c47, c48→c50,
c51→c55, c56→c57.

⚠️ ANTES DE TERMINAR A SESSÃO, FAÇA AS DUAS COISAS ABAIXO
Elas não são burocracia: sem elas a próxima sessão recomeça cega, e o
ESTADO.md perde a razão de existir.

  1. ATUALIZE docs/ESTADO.md — o que rodou, o que ficou commitado, o que
     ficou no working tree, e qualquer fato operacional novo que só você
     saiba (a seção 3 existe para isso). Se uma contradição nova
     aparecer, resolva e registre na seção 2.
  2. REESCREVA docs/BRIEFING.md para a sessão do PAINEL (corte 3,
     c58-c79), no mesmo formato deste. Inclua nele a decisão pendente do
     Figma: /admin não tem design, e design/SPEC.md cobre só a landing —
     ou o dono fornece uma fonte, ou concede exceção explícita para
     construir com os tokens existentes. Deixe a pergunta escrita; não
     decida por ele.

Antes de começar, me devolva em até 8 linhas: o que você entendeu do
escopo e qual a primeira coisa que vai escrever. Não espere minha
resposta para seguir — se estiver claro, siga.
```

---

## Nota para o dono, fora do bloco

**Corte 2 são ~25 commits.** Cabe numa sessão longa, mas não é garantido. A
ordem no briefing é de prioridade: se acabar no meio, o que ficou pronto é o
que mais importa — o dinheiro antes do resto.

**O checkpoint do `c35` é seu e não se delega:** em modo teste, confirmar que o
cartão foi salvo, que **não houve débito imediato**, e que `trial_end` está na
data certa.
