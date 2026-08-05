# 03 — Painel

## Princípio de desenho

A Giovana é engessada com tecnologia. Isso não é limitação a contornar —
é o requisito. Cada tela responde **uma pergunta que ela realmente faz**,
e nenhuma expõe vocabulário do sistema.

Regras:

- **Zero jargão.** "Turma", "Horário", "Aluna", "Pagamento". Nunca
  "safra", "inscrição", "assinatura", "webhook", "status_stripe".
- **Toda ação destrutiva pede confirmação com nome próprio.** "Cancelar a
  inscrição de Marina Costa?" — não "Confirmar?".
- **Nada de estado vazio mudo.** Toda tela sem dados diz o que fazer para
  ter dados.
- **Ela nunca abre Stripe nem Supabase.** Exceção única e deliberada:
  link direto para uma assinatura no Dashboard, na tela de cancelamento,
  para o caso de reembolso manual.

---

## Autenticação (D-09)

Supabase Auth, provider Google, **allowlist por e-mail em env var**
(`ADMIN_EMAILS`, separado por vírgula).

A verificação acontece em três camadas, e as três são necessárias:

1. `middleware.ts` — barra `/admin/*` sem sessão. É UX, não segurança.
2. Cada page server-side de `/admin` — revalida a sessão e a allowlist.
3. **Cada rota `/api/admin/*`** — revalida. Esta é a que importa: o
   middleware pode ser contornado, a rota não.

"Logou com Google" não é autorização. Qualquer pessoa tem conta Google.
A allowlist é o que autoriza.

---

## Telas

### `/admin` — Hoje

A resposta a "como estão as coisas?" em cinco segundos.

- Turma aberta: nome, início, valor, **`inscritas / vagas`**
- Contadores: pagas · aguardando pagamento · lista de espera · **em
  atraso**
- Alerta vermelho se houver cobrança falhada
- Alerta vermelho se `inscritas > vagas_total`
- Botão grande: **abrir / fechar inscrições**

### `/admin/turmas` — Turmas

Lista de safras. Criar e editar.

**Comportamento obrigatório (D-06):** ao editar uma turma que já tem
inscrição paga, o formulário avisa antes de salvar:

> *"3 alunas já pagaram nesta turma. Mudar o valor não altera o que elas
> pagam — vale só para quem se inscrever a partir de agora."*

Publicar a turma cria o `price` no Stripe. Isso acontece invisivelmente.

### `/admin/horarios` — Horários

CRUD de grupos: dia da semana, hora, capacidade. Não pede data nem valor,
porque grupo não tem (D-01).

### `/admin/alunas` — Alunas

O kanban. Colunas = horários da turma aberta, mais uma coluna
**"Sem horário"** onde toda aluna paga cai por padrão.

Cada card: nome · nível · **disponibilidade declarada** · status de
pagamento (bolinha colorida).

A disponibilidade no card é o que torna o kanban usável — é o dado que
ela precisa para decidir o arrasto, e sem ele a tela é decorativa.

Arrastar salva na hora e **não move dinheiro** (D-03).

Filtros: por status, por nível, por disponibilidade.

### `/admin/alunas/:id` — Ficha

Tudo de uma aluna: contato, perfil, histórico de turmas, pagamentos
feitos (`ciclos_pagos / duracao`), consentimento registrado (com data e
texto exato aceito), horário atual.

Ações: mudar horário · **cancelar inscrição** (com confirmação por nome)
· copiar e-mail/WhatsApp.

### `/admin/cupons` — Cupons

Criar cupom em linguagem de gente:

- "20% no primeiro mês"
- "15% em todas as mensalidades"
- "1 mês grátis"

Campos: código · tipo · valor · validade · limite de usos · vale em qual
turma.

Criar aqui cria no Stripe (D-07). Ela nunca abre o Dashboard.

Mostrar quantas usaram cada cupom — é o único número de marketing que o
sistema tem, e é o que faz ela querer voltar nesta tela.

### `/admin/pagamentos` — Pagamentos

Só o que exige ação:

- Cobranças falhadas, com botão de reenviar
- Aguardando pagamento há mais de N dias
- Próximas cobranças agendadas

Não é relatório financeiro. Isso é o Stripe, e ela não precisa.

---

## O que o painel NÃO faz

Escopo é a única defesa contra o painel virar o produto:

- Não emite nota fiscal
- Não faz reembolso (link para o Stripe, e só)
- Não manda e-mail em massa
- Não tem relatório, gráfico ou dashboard analítico
- Não gerencia conteúdo de aula (não existe conteúdo — é Meet)
- Não tem segundo usuário, papel ou permissão

Cada um desses só entra quando ela pedir, e depois de a base estar em
produção funcionando.
