# 05 — Briefing para o Claude Code

Cole o bloco abaixo como primeira mensagem numa sessão na raiz do
projeto. Uma sessão por corte, não uma para os três.

---

```
Você vai implementar a refatoração "Safra + Pagamento" do Beyond The Lab.

LEIA ANTES DE ESCREVER QUALQUER CÓDIGO, NESTA ORDEM:
  docs/00-DECISOES.md
  docs/01-MODELO-DADOS.md
  docs/02-FLUXOS.md
  docs/03-PAINEL.md
  docs/04-PLANO.md
  REPORT.md          (arquitetura atual — §9 continua valendo)
  design/SPEC.md     (tokens visuais)

CONTEXTO CRÍTICO
Este sistema está EM PRODUÇÃO com pessoas reais já inscritas na lista
de espera. Nenhuma mudança pode derrubar o formulário. Se um passo
exigir downtime, ele está desenhado errado — pare e diga.

ESCOPO DESTA SESSÃO
Apenas o Corte <N> do docs/04-PLANO.md. Não avance para o próximo.

REGRAS
1. NÃO COMMITE NADA. Nunca rode git commit, git push ou git add.
   Deixe as mudanças no working tree. Eu reviso e commito.
2. Um commit do plano = um passo. Ao terminar cada um, pare e me diga
   qual mensagem de commit usar, exatamente como está no plano.
3. As decisões D-01 a D-12 estão TRAVADAS. Se alguma parecer errada,
   pare e me diga — não contorne, não adapte.
4. Nenhum número visual estimado. Todo valor de layout vem do Figma Dev
   Mode. O que for derivado leva `// ⚠️ derivado` inline.
5. Validação visual é o shot.mjs (1440×1024, deviceScaleFactor 1,
   reducedMotion reduce). Nunca screenshot de tela.
6. Todo CHECK novo entra NOT VALID. Nenhum backfill de `consent`.
   `null` significa "não sabemos" e permanece null.
7. `import 'server-only'` no topo de todo módulo que toca a
   service_role. Zero variáveis NEXT_PUBLIC_ para segredo.
8. Migração roda no SQL Editor por mim, na ordem numérica. Você escreve
   o .sql e me diz quando rodar. Você não executa nada contra o banco.
9. Preserve os comentários que explicam POR QUE NÃO. São o ativo mais
   valioso do repositório. Se um bloco de código sair, o comentário
   dele migra para o lugar novo — não some.
10. Se faltar informação, PERGUNTE. Não invente regra de negócio.

ORDEM DE TRABALHO
Antes de começar, me devolva:
  a) o que você entendeu do corte, em até 10 linhas;
  b) os arquivos que vai criar, alterar e deletar;
  c) qualquer contradição que achou entre os docs e o código real.

Só comece depois que eu responder.
```

---

## Riscos conhecidos com o agente

Anotados de sessões anteriores deste projeto:

- **Ele reverte mudanças aplicadas à mão**, por default para o padrão
  existente no arquivo. Rode `git diff` antes de aceitar qualquer coisa
  que ele tocou depois de você ter editado manualmente.
- **Ele conclui cortes inteiros de uma vez** se você não travar o escopo.
  Uma sessão por corte, e o escopo declarado na primeira mensagem.
- **Ele preenche lacuna com invenção plausível.** A regra 10 existe por
  isso, e vale reforçar a cada corte.
- **Ele tende a "melhorar" comentários longos**, encurtando-os. No
  repositório onde a maior parte do conhecimento arquitetural está em
  comentário, isso é perda de informação. Regra 9.

## Checkpoints — não delegue

Três pontos em que você para, olha, e só depois deixa seguir:

| Depois de | Confira |
|---|---|
| `c17` (migra a base) | Contagens batem. `consent` null continua null. Rode em staging primeiro. |
| `c35` (checkout) | Em modo teste: cartão salvo, **zero débito imediato**, `trial_end` na data certa. |
| `c61` (guard da API) | Faça login com um e-mail fora da allowlist e confirme 403 na API, não só na tela. |
