# Checklist de lançamento

Para conferir **na URL de produção**, manualmente, antes de divulgar o link.

Nada aqui é automatizado de propósito: são justamente as coisas que passam no build e
quebram na vida real — a modal que não abre no Safari do iPhone, a prévia do WhatsApp que
sai cinza, a turma que ninguém lembrou de abrir no banco.

Ordem sugerida: bloco 0 primeiro (sem ele o resto falha), depois o que quiser.

---

## 0. Antes de qualquer coisa

- [ ] **A migração `003_consentimento.sql` já rodou no Supabase.**
      Sem ela o insert falha com erro de coluna inexistente e **toda inscrição quebra**.
      Rode o arquivo no SQL Editor e confira as duas queries do fim: as três colunas
      (`consent`, `consent_at`, `consent_text`) devem aparecer como `YES` em `is_nullable`
      e sem `column_default`.
- [ ] **A migração `004_integridade_da_inscricao.sql` já rodou no Supabase.**
      É ela que faz o banco recusar inscrição sem perfil e sem consentimento, em vez de
      confiar só na validação da aplicação. Confira a primeira query do fim: as três
      constraints devem aparecer, com `ja_validou_o_passado` = `false` (é o esperado —
      significa "vale para toda linha nova, não mexe nas antigas").
- [ ] **O deploy em produção é o commit que contém essas migrações ou posterior.**
      Confira na Vercel qual commit está em `Production` — não basta ter dado `git push`,
      e não basta a migração ter rodado no banco.

      > Já aconteceu de a migração chegar ao banco e o deploy não: o build antigo continuou
      > no ar gravando só `name`, `email`, `phone` e `payment_choice`, respondendo
      > **"Inscrição confirmada!"** com 200, e deixando `curso`, `periodo`, `nivel_ingles`,
      > `disponibilidade` e os três campos de consentimento **nulos**. Do lado de fora nada
      > parecia errado. Com a `004` no lugar, esse insert passa a falhar e a pessoa vê erro
      > — que é ruim, mas é infinitamente melhor do que um cadastro sem base legal que
      > ninguém percebeu.
- [ ] `NEXT_PUBLIC_SITE_URL` está setada na Vercel com o domínio final.
      É ela que monta as URLs absolutas do OG — errada, a prévia do link não carrega imagem.

---

## 1. Uma inscrição real, de ponta a ponta

Faça você mesma, com dados seus, na URL de produção. Não vale localhost.

- [ ] Abriu a modal, preencheu **todos** os campos e enviou pelo **"Garantir minha vaga"**
- [ ] A tela de sucesso apareceu com **"Inscrição confirmada!"**
- [ ] As duas datas na tela de sucesso são as datas certas da turma — a de cobrança e a de
      início das aulas, nessa ordem, e não a mesma repetida
- [ ] **Confira a linha no Supabase Studio** (`Table editor` → `waitlist`, ordene por
      `consent_at` decrescente). Na sua linha:
  - [ ] `name`, `email` e `phone` conferem com o que você digitou
  - [ ] `phone` está em E.164 — começa com `+55`, sem parênteses nem traços
  - [ ] `nivel_ingles`, `curso`, `periodo` e `disponibilidade` conferem
  - [ ] `disponibilidade` é um array com os dias que você marcou (`{seg,qua}`, por exemplo)
  - [ ] `turma_id` **não está vazio** e aponta para a turma aberta
  - [ ] `status` é `pendente`
  - [ ] `payment_choice` é `agora`
  - [ ] `consent` é `true`
  - [ ] `consent_at` tem a data e a hora de agora
  - [ ] `consent_text` tem a frase inteira, **incluindo** "Li e aceito os Termos de Uso e a
        Política de Privacidade"
- [ ] Repita com o botão **"Quero saber mais antes"**, com outro e-mail. Deve gravar tudo
      igual, com `payment_choice` = `depois`
- [ ] **Apague as duas linhas de teste** antes de divulgar

## 2. E-mail duplicado

- [ ] Envie de novo com um e-mail **já cadastrado**
- [ ] A pessoa vê a **tela de sucesso normal**, não uma mensagem de erro
- [ ] Nenhuma linha nova apareceu no Studio

> É de propósito. Responder "este e-mail já está cadastrado" transformaria o formulário
> num verificador de quem se inscreveu no curso.

## 3. Modal em celular de verdade

Emulador do navegador não substitui isto — o teclado virtual e a barra de endereço do
Safari mudam a altura da tela e são a causa mais comum de modal quebrada.

**iPhone (Safari):**
- [ ] A modal abre e cabe na tela
- [ ] Ao tocar num campo, o teclado sobe e **o campo em foco continua visível**
- [ ] Dá para rolar dentro da modal até o botão de envio
- [ ] A página de trás **não rola** junto
- [ ] O X fecha

**Android (Chrome):**
- [ ] Os mesmos cinco itens acima
- [ ] O `<select>` de nível abre o seletor nativo e a opção escolhida aparece no campo

**Nos dois:**
- [ ] A caixa de consentimento é acertável com o dedo
- [ ] Tocar no **texto** do consentimento marca a caixa
- [ ] Tocar em **"Termos de Uso"** abre a página em aba nova e **não marca a caixa**
- [ ] Tocar em **"Política de Privacidade"**: mesma coisa

## 4. Prévia do link no WhatsApp

- [ ] Cole a URL de produção numa conversa (pode ser a sua própria) e **espere** a prévia
- [ ] A imagem aparece — não é um retângulo cinza nem espaço vazio
- [ ] **O nome do curso é legível** no tamanho em que a prévia aparece no celular
- [ ] Título e descrição estão corretos e sem corte estranho
- [ ] Repita com `/termos` e `/privacidade` — as duas também têm prévia própria

> Se a imagem antiga insistir em aparecer, é cache do WhatsApp. Teste com `?v=2` no fim da
> URL. Especificação da imagem definitiva: seção *Imagem de compartilhamento* do README.

## 5. Documentos legais

- [ ] `/termos` carrega
- [ ] `/privacidade` carrega
- [ ] **Nenhum `[[PREENCHER: ...]]` sobrou em nenhuma das duas.**
      Eles aparecem destacados em rosa, impossíveis de não ver. Role as duas páginas
      inteiras. São quatro dados: nome civil completo, CPF, endereço e e-mail de contato.
- [ ] O e-mail de contato que ficou nos documentos **existe e alguém lê** — ele é o canal
      do direito de arrependimento e dos pedidos de dados
- [ ] As duas páginas são legíveis no celular, sem rolagem horizontal
- [ ] O link "Conteúdo programático" dentro dos Termos funciona
- [ ] O link cruzado entre os dois documentos funciona nos dois sentidos
- [ ] A data de "Última atualização" faz sentido

## 6. A turma no banco

No Studio, tabela `turmas`:

- [ ] Existe **exatamente uma** linha com `inscricoes_abertas = true`
- [ ] `data_inicio_aulas` está correta
- [ ] `data_primeira_cobranca` está correta e é **anterior ou igual** ao início das aulas
- [ ] `valor_mensal` bate com o preço exibido na landing
- [ ] `duracao_meses` está certo
- [ ] Abra a modal no site e confira que as datas exibidas são essas mesmas

## 7. Todos os CTAs abrem a modal

São **oito**. Clique nos oito:

**Na landing (`/`):**
- [ ] Navbar, botão do topo (desktop)
- [ ] Navbar, botão dentro do menu hambúrguer (mobile)
- [ ] Hero
- [ ] PainPoints
- [ ] Teacher
- [ ] Pricing — e confira que o botão diz **"Garantir minha vaga"**, não "Adquirir"
- [ ] FinalCta

**Em `/conteudo-programatico`:**
- [ ] Botão do fim da página

## 8. Navegação e teclado

- [ ] O **botão voltar do navegador fecha a modal** em vez de sair do site
- [ ] `Esc` fecha a modal
- [ ] Clicar fora da modal fecha
- [ ] Com a modal aberta, `Tab` circula **dentro** dela e não escapa para a página de trás
- [ ] O foco fica visível (contorno rosa) em todos os campos e botões
- [ ] No rodapé, "Termos de Uso" e "Política de Privacidade" são alcançáveis por `Tab` e
      abrem com `Enter`
- [ ] Os links do rodapé aparecem nas quatro rotas

## 9. Última olhada

- [ ] Nenhuma menção a pagamento que não vá acontecer — o formulário não cobra nada, e
      nenhum texto deve sugerir o contrário
- [ ] Landing a 375px de largura, sem rolagem horizontal
- [ ] Console do navegador sem erro em vermelho na landing e nas duas rotas novas

---

## Quando algo falhar

Erro de inscrição não aparece para a pessoa com detalhe nenhum, de propósito. O motivo
real está no log: **Vercel → o projeto → Logs**, filtrando por `[waitlist]`.
