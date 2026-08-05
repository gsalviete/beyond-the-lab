# docs/ — Refatoração "Safra + Pagamento"

Fonte de verdade da refatoração de agosto/2026. Versionado no git, de
propósito: documento de arquitetura fora do repositório deriva do código
que descreve — é a mesma classe de problema que produziu o incidente da
migração `004` (banco andou, aplicação não, ninguém tinha como saber).

## Ordem de leitura

| # | Arquivo | O que responde |
|---|---|---|
| 0 | `00-DECISOES.md` | O que foi decidido e o que está **travado** |
| 1 | `01-MODELO-DADOS.md` | Tabelas, invariantes, migração da base atual |
| 2 | `02-FLUXOS.md` | Inscrição, checkout, webhooks, link de retorno |
| 3 | `03-PAINEL.md` | O painel da Giovana, tela a tela |
| 4 | `04-PLANO.md` | Os três cortes e a árvore de commits |
| 5 | `05-BRIEFING-CLAUDE-CODE.md` | O prompt de entrada para o agente |

## Regra que não muda

O `REPORT.md` (seção 9) lista dez decisões que custaram caro. Elas
continuam valendo, **exceto** onde este pacote as contradiz
explicitamente e diz por quê. Se o Claude Code precisar quebrar uma
delas e não achar a justificativa aqui, ele está errado — pare e
pergunte.
