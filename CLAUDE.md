# CLAUDE.md

Instruções para agentes trabalhando neste repositório.

## Git é do dono do repositório

**Não execute nenhum comando git que altere histórico, stage ou working tree.**

Proibido, sem exceção e sem pedir permissão para abrir exceção:

- `git commit`, `git add`, `git rm`, `git mv`
- `git push`, `git reset`, `git revert`, `git rebase`, `git merge`
- `git checkout` / `git switch` / `git restore` que troquem de ref ou descartem
  mudança
- `git stash` (inclusive `pop` e `apply`)
- `git branch`, `git tag`, `git worktree add/remove`
- `git filter-repo`, `git gc --prune`, qualquer reescrita

Permitido, porque só lê: `git status`, `git log`, `git diff`, `git show`,
`git blame`, `git rev-list`, `git ls-files`.

### O fluxo é este

1. **Implementar** — editar arquivos direto, com as ferramentas de arquivo.
2. **Validar** — build, teste, render, medição. O que for cabível.
3. **Reportar** — o que mudou, quais arquivos foram tocados e como a validação
   foi feita.

Deixe tudo no working tree. Os commits são do dono do repositório.

### Se um agrupamento de commits fizer sentido, sugira em texto

Entregue um bloco de código colável, na ordem de execução, com `git add` de
arquivos **explícitos** e a mensagem já escrita. Nunca `git add .` nem
`git add -A`.

Se um arquivo pertencer a mais de um agrupamento lógico, **diga qual e por quê**
em vez de escolher sozinho — `git add <arquivo>` estagia o arquivo inteiro, e
uma divisão que ignore isso produz commits que misturam assuntos sem avisar.

### Por quê

Este repositório já sofreu um `push --force` acidental que sobrescreveu o
remoto, e tem um `git filter-repo` pendente por causa de binário grande no
histórico. Commit criado por engano é barato de desfazer; histórico reescrito
por engano, não.

## Você não executa nada contra o banco

Migração e verificação são **arquivos `.sql`** em `supabase/migrations/` e
`supabase/verificacao/`. Você escreve, valida por leitura, e avisa que está
pronto para rodar. Quem cola no SQL Editor do Supabase é o dono do
repositório.

Vale para `psql`, para o CLI do Supabase e para qualquer script que abra
conexão — inclusive `select`. Este banco tem dado pessoal de gente real sob
LGPD, e a produção não tem staging na frente.

A única exceção é `supabase gen types`, que também é rodada pelo dono: o
arquivo de tipos chega a você pronto.

## A refatoração "Safra + Pagamento"

O pacote em `docs/` é a fonte de verdade. Ordem de leitura em
`docs/README.md`. O `REPORT.md` é a linha de base que aqueles documentos
descrevem — a seção 9 dele continua valendo inteira.

**As decisões D-01 a D-14 de `docs/00-DECISOES.md` estão travadas.** Se uma
delas parecer errada, **pare e diga** — não contorne, não adapte, não
resolva por baixo. O lugar de descobrir que uma decisão está errada é numa
conversa, não num commit.

### Um commit do plano = um passo

`docs/04-PLANO.md` tem a árvore de commits. Faça **um** por vez. Ao
terminar, pare, reporte, e devolva a mensagem de commit exatamente como
está no plano. Não emende o passo seguinte porque "é pequeno".

Não avance de corte sem que o anterior tenha sido aprovado.

### Regras que atravessam todos os passos

- **`import 'server-only'` no topo de todo módulo que toca a
  `service_role`.** Zero `NEXT_PUBLIC_` para segredo. É a rede do
  `REPORT.md` §7 e ela não afrouxa.
- **Todo CHECK novo entra `NOT VALID`.** É a lição da migração `004`:
  obrigar em toda linha nova sem reescrever nem falsificar o passado.
- **Nenhum backfill de `consent`.** `null` significa "não sabemos" e
  permanece `null`. Backfill aqui é falsificação de prova.
- **Nenhum número visual estimado.** Valor de layout vem do Figma Dev Mode;
  o que for derivado leva `// ⚠️ derivado` inline. Ver `design/SPEC.md`.
- **Há gente real na lista de espera.** Nenhum passo pode derrubar o
  formulário. Se um passo exigir downtime, ele está desenhado errado —
  pare e diga.

### Os comentários são o ativo

A maior parte do conhecimento arquitetural deste projeto está em comentário
que explica **por que não**, não em documento. Se um bloco de código sair, o
comentário dele **migra junto, reescrito para o contexto novo** — não
encurta, não some. Um refactor que perde esses comentários destruiu mais
valor do que criou.

### Se faltar informação, pergunte

Regra de negócio não se infere do código. Não invente.

## Binário grande

`public/assets/teacher.mp4` vai **sempre em commit próprio**, sem nenhum arquivo
de código junto. Mesma regra para qualquer asset acima de ~1 MB.

Os `render_*.png` do `shot.mjs` são artefato descartável e estão no
`.gitignore`. Não os versione.
