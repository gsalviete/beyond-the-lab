# ESTADO — fonte única operativa

**Escrito em 08/08/2026.** Este arquivo diz o que é verdade *agora* e o que
falta fazer. Ele existe porque os documentos do pacote original descrevem
majoritariamente o corte 1 — que já está em produção — e porque dois deles se
contradizem em pontos que a implementação atravessa.

## Ordem de leitura para uma sessão nova

| Ler | Por quê |
|---|---|
| `CLAUDE.md` | as regras que não mudam: git, banco, comentários |
| **`docs/ESTADO.md`** (este) | estado real + o que falta |
| `docs/00-DECISOES.md` | **operativo e intacto.** D-01…D-16 |
| o código | onde o conhecimento realmente mora |

**Os demais (`01`…`05`, `CHECKLIST-LANCAMENTO.md`, `REPORT.md`) são
históricos.** Consulte para entender *por que* algo é como é; não os use como
especificação. Onde divergirem deste arquivo, **este vence**.

⚠️ **`00-DECISOES.md` não se renumera nem se apaga.** Há **107 referências a
`D-01`…`D-14`** espalhadas por mais de 20 arquivos de código, migração e teste
(`src/lib/supabase.ts` sozinho tem 13). Decisão nova entra por *append*: D-15,
D-16, D-17…

---

## 1. Estado real

### Em produção, funcionando

**O corte 1 está no ar e aceito.** Migrações `005`→`011b` rodadas em staging e
em produção, `019_contagens.sql` com `ACEITE: OK`, query de retardatários
vazia. Os quatro critérios de aceite passaram: inscrição de ponta a ponta, os
dois e-mails, preço alterado no Studio refletindo na landing sem deploy, e
`inscricoes_abertas = false` gravando `lista_espera` com `safra_id` vazio.

Nenhuma superfície do sistema afirma preço, duração ou data que não venha do
banco. A tensão 8.1 do `REPORT.md` está fechada.

### Migrações rodadas

`000`(só staging) · `001`–`004`(históricas) · `005`–`011b` · `012`–`015`
— **as `012`–`015` estão rodadas em staging E em produção.**

### Commitado (branch `staging`)

```
760d374  feat(db): 015 — colunas travadas em inscricoes + CHECK NOT VALID
fb60189  feat(db): 014 — cria eventos_stripe (PK = idempotência)
ef3ec82  feat(db): 013 — cria cupons
1e560a6  feat(db): 012 — cria assinaturas
697b899  chore(stripe): SDK, env vars, cliente server-only
bb19cfd  fix(vitrine): force-cache sem revalidate congelava o preco no valor do build
666a26d  fix(test): disponibilidade readonly quebrava o tsc e o next build
```

### No working tree, sem commit

| Arquivo | O que é |
|---|---|
| `src/lib/stripe.ts` | `c34` (price da safra) + a conta do prazo (`c47` antecipado) |
| `src/lib/supabase.ts` | `salvarStripePriceId` |
| `tests/stripe-prazo.test.ts` | 20 testes, com controle negativo rodado |
| `src/lib/database.types.ts` | regerado após as `012`–`015` — **commit próprio** |
| `package.json` | ⚠️ `supabase` (o CLI) entrou em `dependencies`; **mover para `devDependencies`** |
| `next-env.d.ts` | gerado pelo Next, alterna com `dev`/`build`. Ruído. |

Validação atual: `tsc --noEmit` limpo, **260 testes verdes**.

---

## 2. Contradições resolvidas — não reabrir

### 2.1 Quando os valores travados passam a existir

`01-MODELO-DADOS.md` diz "travados presentes ⟺ status ≥ `confirmada`".
`02-FLUXOS.md`, passo ⑨, copia os travados já em `pendente_pagamento`. As duas
não podem valer juntas.

**Resolvido para o lado conservador**, e está implementado assim na
`015_inscricoes_travadas.sql`: o CHECK afirma só o que é certo nas duas
leituras — tudo-ou-nada entre os três; lista de espera nunca tem travado;
`confirmada`/`ativa`/`inadimplente`/`concluida` têm que ter. **`pendente_pagamento`
e `cancelada` ficam de fora da exigência**: o primeiro é o estado em que as
colunas estão sendo escritas, o segundo pode ser alcançado por quem abandonou o
checkout e nunca pagou. Exigir travado ali seria afirmar contrato onde não
houve.

### 2.2 Onde o checkout é criado

O plano diz `c35 feat(api): POST /api/checkout`. O `02-FLUXOS.md` desenha o
passo ⑩ **dentro** do POST de inscrição.

**Vence o fluxo: a sessão é criada dentro de `/api/inscricao`**, que responde
`{ modo: 'checkout', url }` numa viagem só. Rota separada teria que receber do
cliente qual inscrição pagar, e "nenhuma decisão de negócio vem do cliente" é a
regra que abre o `02-FLUXOS.md` — qualquer um abriria checkout para inscrição
alheia. O nome do commit fica como está; o desenho é este.

---

## 3. Fatos operacionais que não estão em documento nenhum

Descobertos na implementação. Perdê-los custa caro.

- **A `010` RECUSA rodar duas vezes.** Ela aborta se `pessoas` ou `inscricoes`
  tiver qualquer linha (seção 1.4). Isso fecha a opção "deployar primeiro,
  migrar depois" para sempre: o build novo gravaria as primeiras inscrições e a
  `010` passaria a recusar.
- **A `011` é a única migração que derruba o formulário** — ela renomeia
  `waitlist`, e o build antigo passa a receber `42P01`. Foi rodada **depois**
  do deploy, de propósito, e a query de retardatários confirmou que ninguém
  ficou para trás.
- **`cache: 'force-cache'` sem `next.revalidate` congela o dado para sempre.**
  `export const revalidate` governa a regeneração da PÁGINA, não o Data Cache.
  O sintoma engana: o preço não fica atrasado, fica preso no valor do build até
  alguém deployar. Corrigido em `bb19cfd`; `tests/vitrine-cache.test.ts` impede
  a volta.
- **`export const revalidate` precisa ser literal** (análise estática do Next),
  por isso `60` está escrito em dois lugares — `app/page.jsx` e
  `JANELA_VITRINE_SEGUNDOS` em `supabase.ts`. O teste amarra os dois.
- **Teste que lê arquivo como texto tira os comentários antes de comparar.** Os
  comentários deste repositório *citam* o código que saiu; uma busca no arquivo
  cru acusa defeito já corrigido. Vale para `.sql` e para `.ts`.
- **`tests/` está no `include` do `tsconfig.json`**, então erro de tipo em teste
  quebra o `next build`. O vitest não typechecka: verde no runner não é prova de
  que compila.
- **`supabase gen types` exige login de conta** (`npx supabase login`), não a
  chave do projeto. É rodado pelo dono.
- **Não existe chave publicável do Stripe neste projeto**, e a ausência é
  desenho: o Checkout é hospedado, nenhum campo de cartão é renderizado por nós.

---

## 4. O que falta — corte 2

### Feito, aguardando commit

```
c34   feat(stripe): cria/sincroniza price a partir da safra
c47   test(stripe): 6 ciclos, não 7 — cancel_at na data certa   [antecipado]
```

Sugestão de commits:

```bash
git add src/lib/database.types.ts
git commit -m "chore(db): tipos gerados — assinaturas, cupons, eventos_stripe"

git add src/lib/stripe.ts src/lib/supabase.ts tests/stripe-prazo.test.ts
git commit -m "feat(stripe): cria/sincroniza price a partir da safra"
```

### Próximo passo: a migração `016`

Nova versão de `criar_inscricao`, e ela resolve dois problemas de uma vez.

**Assinatura nova — 13 parâmetros.** Os dez atuais mais
`p_valor_mensal_travado`, `p_duracao_meses_travada`,
`p_data_primeira_cobranca_travada`. É o caminho (a) escolhido em vez de um
`UPDATE` depois do insert: os travados entram na MESMA transação que cria a
inscrição, pela mesma razão que o cabeçalho da `011b` argumenta — estado
inválido que depende de uma ação futura para deixar de existir é estado
inválido.

**Retorno novo — o id, não só o booleano.** Hoje devolve `boolean` (`criada`).
Passa a devolver o **id da inscrição** junto do booleano.

⚠️ **Por que o retorno muda:** a sessão de checkout precisa do id da inscrição
em `client_reference_id`, então a inscrição tem que existir antes da sessão. Se
o Stripe falhar nesse instante, sobra alguém em `pendente_pagamento` sem sessão
— estado sem saída chegando por acidente. Com o id na mão, **uma segunda
tentativa da mesma pessoa encontra a inscrição existente e cria a sessão para
ela**, em vez de responder "você já está inscrita" e deixá-la presa. O estado
órfão passa a ser recuperável pela própria pessoa.

⚠️ `tests/inscricao-rpc.test.ts` trava os dez nomes e o retorno booleano contra
o `.sql`, de propósito. **Ele muda junto**, e é bom que mude — é ele que garante
que os dois lados concordam.

### Depois da `016`

```
c35  sessão de checkout com trial_end e cancel_at, DENTRO de /api/inscricao
c36  validação de vagas antes de abrir o checkout (D-08)
c37  copia valores travados na inscrição (D-06)   ← absorvido pela 016
c38  feat(modal): ramifica em checkout ou lista de espera
c39  feat(landing): /inscricao/sucesso e /inscricao/cancelado
c40  webhook com verificação de assinatura
c41  idempotência via eventos_stripe   ← o insert vem ANTES de qualquer efeito
c42  checkout.session.completed → confirmada
c43  invoice.paid → ativa, ciclos_pagos++
c44  invoice.payment_failed → inadimplente
c45  subscription.deleted → concluida ou cancelada
c46  test(webhook): reentrega do mesmo evento não conta duas vezes
c48  feat(stripe): cria coupon a partir do nosso registro
c49  feat(api): valida e aplica cupom na sessão de checkout
c50  test(cupom): expirado, esgotado, de outra safra são rejeitados
c51  feat(db): 017 — token_acesso e token_expira_em em pessoas
c52  GET /api/pessoa/:token — expirado cai no fluxo limpo
c53  feat(modal): pré-preenche a partir do token
c54  script(ops): gera tokens e exporta CSV
c55  feat(email): template de convite para a base atual
c56  feat(alerta): cobrança falhada notifica a Giovanna por e-mail
c57  feat(log): erros de webhook e insert com contexto rastreável
```

**Aceite do corte 2:** inscrição completa em modo teste do Stripe, do formulário
ao webhook, com cartão salvo e **zero débito imediato**. Cupom aplica.
Reentrega de webhook não duplica.

⚠️ **Checkpoint não delegável:** depois do `c35`, conferir em modo teste que o
cartão foi salvo, que **não houve débito imediato**, e que `trial_end` está na
data certa.

### Numeração de migrações

`016` é a nova RPC. A partir daí: `017` token de acesso (`c51`). O `c79` do
corte 3 apaga `waitlist_legado` — **último commit do projeto, e só com backup**.

---

## 5. O que falta — corte 3 (painel)

Inalterado em relação ao `04-PLANO.md` (`c58`–`c79`), **mais D-15 e D-16**, que
são novas e mudam o escopo do painel.

⚠️ **Bloqueio conhecido, não resolvido:** não existe Figma do painel, e
`design/SPEC.md` cobre só a landing. A regra "nenhum número visual estimado,
valor de layout vem do Figma Dev Mode" torna `/admin` inimplementável nos termos
do resto do repositório. **Ou aparece uma fonte de design, ou `/admin` recebe
uma exceção declarada.** É decisão do dono, e não foi tomada.

---

## 6. Pendências pequenas, registradas

- `supabase` (CLI) está em `dependencies` do `package.json` — mover para
  `devDependencies` ou remover e usar `npx`.
- `c28` (`docs: SPEC.md — tokens novos do corte 1`) **não é commitável**:
  `design/` está no `.gitignore` (linha 21). O `SPEC.md` foi atualizado no
  working tree e fica só local. Se esse conhecimento precisar de versionamento,
  é decisão a tomar.
- `design/SPEC.md` diz "Stack: Vite + React + Tailwind". É Next.js. Nunca
  corrigido.
