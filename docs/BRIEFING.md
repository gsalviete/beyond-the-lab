# Briefing — sessão de aceite e publicação

> Substitui a versão do corte 3, que já foi implementado.
> Cole o bloco abaixo como primeira mensagem de uma sessão na raiz do projeto.

## Onde estamos

| Corte | Estado |
|---|---|
| 1 — fundação | **em produção e aceito** |
| 2 — pagamento | **implementado, com teste; nunca exercitado de verdade** |
| 3 — painel | **implementado, com teste; nunca exercitado de verdade** |

**Não sobrou código de produto para escrever.** `c34`–`c79` estão no
repositório, `tsc` limpo, 423 testes verdes. O que falta é de outra natureza:
**usar, conferir e publicar** — e quase tudo isso é seu, não do agente.

⚠️ **Nenhum teste deste repositório abre conexão.** Eles provam que o código
concorda consigo mesmo. A lista do que só o uso real prova está no
`ESTADO.md` §4, e a primeira linha dela é a que mais importa: a resolução da
sobrecarga de `criar_inscricao`, cuja falha grava a linha *e* responde erro.

---

## A ordem, e ela importa

1. **Ambiente de teste**: `.env.local` apontando para **staging**, com
   `sk_test_` e o `whsec_` do `stripe listen`. `EMAIL_ADMIN` é a allowlist do
   painel — o usuário já existe no Supabase de staging.
2. **Painel**: entrar em `/admin`, criar turma, criar horários, criar cupom.
3. **Site**: inscrição de ponta a ponta com o cupom, em modo teste.
   ⛔ **Confirmar: cartão salvo, ZERO débito imediato, `trial_end` na data,
   `cancel_at` = primeira cobrança + duração (seis faturas, não sete).**
4. **Webhook**: reentregar o mesmo evento pelo Dashboard e confirmar que nada
   é contado duas vezes.
5. **Painel de novo**: a pessoa aparece com o status certo, dá para alocar num
   horário, e a fila de pendentes funciona.
6. **Deploy.**
7. **`018`** — só depois do deploy. Antes dele, a função antiga é o que mantém
   o formulário no ar.
8. **Chave live do Stripe**, merge para `main`, e a landing apontando para
   produção.
9. **`019`** — apagar `waitlist_legado`. ⛔ Só com backup, e não há pressa
   nenhuma.

---

```
Você vai ajudar no ACEITE e na PUBLICAÇÃO do Beyond The Lab. Os cortes 1,
2 e 3 já estão implementados — não os reescreva.

LEIA ANTES DE QUALQUER COISA, NESTA ORDEM E SÓ ISTO:
  CLAUDE.md              as regras que não mudam
  docs/ESTADO.md         fonte única operativa — estado real e o que falta
  docs/00-DECISOES.md    D-01 a D-16, todas operativas

NÃO LEIA docs/01 a docs/05, CHECKLIST-LANCAMENTO.md nem REPORT.md. São
históricos. Onde divergirem do ESTADO.md, o ESTADO.md vence.

O conhecimento real deste projeto está em COMENTÁRIO DE CÓDIGO. Antes de
mexer num arquivo, leia os comentários dele.

ESCOPO DESTA SESSÃO: FAZER FUNCIONAR, NÃO ACRESCENTAR
A ordem do aceite está no ESTADO.md §4. Seu papel é diagnosticar o que
falhar e consertar — não escrever funcionalidade nova. Se aparecer uma
ideia de melhoria, ANOTE e me diga; não implemente.

⛔ NÃO RODE A 018 NEM A 019, e não me diga para rodar até a condição
delas estar satisfeita. As duas estão escritas com o motivo no cabeçalho:
a 018 mata a sobrecarga que mantém o formulário no ar antes do deploy, e
a 019 destrói a única prova de quem estava na base antiga.

COMO EU TRAGO PROBLEMA PARA VOCÊ
Log do `stripe listen`, resposta do POST, e o que a tela mostrou. Os três
juntos — a divergência quase sempre está entre dois deles.

RITMO
Encadeie. Pare e me chame apenas quando:
  a) uma decisão de negócio faltar;
  b) você precisar que eu rode um .sql, regenere tipos, ou mexa no
     Stripe/Vercel/Supabase;
  c) o conserto contradisser uma decisão D-01..D-16.

O QUE NÃO SE REDISCUTE (ESTADO.md §2)
  - `cancel_at` é posto no webhook. A API do Stripe não aceita em
    subscription_data. Não viola a D-05: o que ela proíbe é job agendado.
  - O e-mail de confirmação sai do webhook, depois do pagamento.
  - Vagas não são fixas; `vagas_total` fica null.
  - Retomada de checkout mantém o preço travado da primeira vez.
  - Login por senha é desvio TEMPORÁRIO e datado da D-09 (§2.8). A
    allowlist no servidor continua inteira. Voltar ao Google é trocar o
    corpo de /api/admin/entrar.
  - /admin tem exceção declarada de design: tokens existentes, nenhuma
    medida nova inventada.

REGRAS QUE NÃO AFROUXAM
  1. NÃO COMMITE. Nunca git commit/add/push.
  2. Você NÃO executa nada contra o banco — nem select.
  3. `import 'server-only'` no topo de todo módulo com segredo.
  4. Todo CHECK novo entra NOT VALID. Nenhum backfill de consent.
  5. Comentário que explica POR QUE NÃO migra junto com o código.
  6. Teste que afirma AUSÊNCIA precisa de CONTROLE NEGATIVO.
  7. `npx tsc --noEmit` além do `npm test`. ⚠️ O tsc NÃO verifica .jsx
     (allowJs sem checkJs): identificador fora de escopo é ReferenceError
     em runtime e nenhum teste pega. Depois de mexer num .jsx, me peça
     para abrir a página.
  8. Nunca rode `npm run build` — ele lê a safra no banco de produção.
  9. Você não roda o shot.mjs: ele sobe um dev server que lê o banco.

DUAS COISAS QUE FICARAM EM ABERTO E SÃO MINHAS
  - c77 (render das telas do painel): o shot.mjs fotografaria a tela de
    login, porque o headless não tem sessão. Precisa de um passo de
    autenticação que ainda não existe. E `design/` está no .gitignore.
  - Cancelar inscrição usa `cancel_at_period_end`. Se eu quiser cortar o
    acesso na hora, me lembre de que a troca é de uma linha.

Antes de começar, me devolva em até 6 linhas: o que você entendeu do
escopo, e qual o primeiro passo do ESTADO.md §4 que depende de mim.
```

---

## Nota para o dono, fora do bloco

**O checkpoint do passo 3 é o único que não se delega em hipótese nenhuma.**
Cartão salvo, zero débito imediato, `trial_end` na data certa. Se qualquer um
dos três estiver errado, o problema é do corte 2 inteiro e não vale seguir.

**A `019` não tem prazo.** Ela é o último commit do projeto e não resolve
nada hoje — `waitlist_legado` é uma tabela parada que não incomoda ninguém.
O dia certo de apagá-la é quando ela virar ruído, com backup na mão. Não há
motivo para pressa, e há um motivo forte para esperar: enquanto ela existir,
uma divergência entre a base antiga e `pessoas`/`inscricoes` ainda tem com o
que ser comparada.
