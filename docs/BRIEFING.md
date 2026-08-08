# Briefing — sessão de implementação (cortes 2 e 3)

> Substitui o `05-BRIEFING-CLAUDE-CODE.md`, que descrevia o corte 1.
> Cole o bloco abaixo como primeira mensagem de uma sessão na raiz do projeto.

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

ESCOPO DESTA SESSÃO
Corte 2 inteiro e, se sobrar sessão, corte 3. Vá o mais longe que
conseguir. A ordem está na seção 4 do ESTADO.md.

RITMO — ISTO SUBSTITUI A REGRA DE "UM PASSO POR VEZ" DO CLAUDE.md
Encadeie os passos sem parar para reportar cada um. Pare e me chame
apenas quando:
  a) uma decisão de negócio faltar (pergunte do jeito mais simples
     possível, e continue o que não depende dela);
  b) você precisar que eu rode um .sql, regenere tipos, ou mexa no
     Stripe/Vercel;
  c) o passo seguinte contradisser uma decisão D-01..D-16.
Fora isso, siga. Ao fim, reporte em bloco: o que entrou, como validou, e
os comandos de commit na ordem.

O QUE NÃO SE REDISCUTE (já decidido, está no ESTADO.md §2)
  - A sessão de checkout é criada DENTRO de /api/inscricao, e não numa
    rota POST /api/checkout. O cliente nunca diz qual inscrição pagar.
  - A migração 016 muda a RPC criar_inscricao: 13 parâmetros (os 10
    atuais + os 3 travados) e retorno COMPOSTO (id da inscrição +
    booleano `criada`), não mais só o booleano. O id é o que permite uma
    segunda tentativa retomar uma inscrição presa em pendente_pagamento.
  - Os CHECKs dos valores travados já estão na 015 e estão certos.
    Não os altere.

DUAS PERGUNTAS ABERTAS — NÃO BLOQUEIE POR ELAS
  1. D-16 não tem data de corte da "primeira semana". Até eu decidir, use
     o critério provisório escrito na própria D-16: toda inscrição
     lista_espera migrada pela 010. Deixe o valor numa constante única,
     com o raciocínio ao lado.
  2. /admin não tem Figma, e design/SPEC.md cobre só a landing. FICA
     CONCEDIDA A EXCEÇÃO: construa /admin com os tokens que já existem no
     SPEC.md e no tailwind.config.js, priorizando função sobre acabamento.
     Todo valor visual que você inventar leva `// ⚠️ derivado` inline.
     A regra "nenhum número visual estimado" continua valendo na landing.

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
c51→c55, c56→c57. Só então o corte 3.

Antes de começar, me devolva em até 8 linhas: o que você entendeu do
escopo e qual a primeira coisa que vai escrever. Não espere minha
resposta para seguir — se estiver claro, siga.
```

---

## Nota para o dono, fora do bloco

Duas coisas antes de colar:

1. **A exceção do `/admin` está concedida no texto acima.** Se você
   preferir esperar por um Figma, apague esse parágrafo — mas aí o corte 3
   não sai nesta sessão.
2. **Corte 2 + corte 3 são ~45 commits.** Terminar os dois numa sessão é
   improvável. A ordem no briefing é de prioridade: se a sessão acabar no
   meio, o que ficou pronto é o que mais importa, e o `ESTADO.md` precisa
   ser atualizado antes do próximo `/clear`.
