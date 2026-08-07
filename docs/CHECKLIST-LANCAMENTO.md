# Checklist de lançamento

Para conferir **na URL de produção**, manualmente, antes de divulgar o link.

Nada aqui é automatizado de propósito: são justamente as coisas que passam no build e
quebram na vida real — a modal que não abre no Safari do iPhone, a prévia do WhatsApp que
sai cinza, a landing que continua anunciando o preço do commit porque ninguém ligou a
página ao banco.

Ordem sugerida: bloco 0 primeiro (sem ele o resto falha), depois o que quiser.

> **Este é o checklist do corte 1.** Ele parte de duas coisas que o corte 1 decidiu de
> propósito e que mudam o que é "certo" em quase todos os blocos abaixo:
>
> 1. **`inscricoes_abertas = false` em toda safra.** Sem checkout — que é o `c35`, no corte
>    2 —, safra aberta não significa nada: gravaria gente em `pendente_pagamento` sem
>    nenhuma sessão de pagamento criada e sem caminho para sair. Então **todo mundo cai em
>    `lista_espera`**, e é isso que se confere aqui. Um item que peça safra aberta está
>    errado. Ver a nota final do corte 1 em `04-PLANO.md` e o Fluxo 1 de `02-FLUXOS.md`.
> 2. **A landing continua mostrando preço, duração e mês** mesmo com as inscrições
>    fechadas (D-13). Vitrine e operação são duas perguntas diferentes.

---

## 0. Antes de qualquer coisa

### As migrações do corte 1

Rode **nesta ordem**, no SQL Editor. Cada arquivo termina com as próprias queries de
verificação — leia a saída de cada uma antes de passar para a próxima.

- [ ] `005_safras.sql` — renomeia `turmas` → `safras`, adiciona `vagas_total` e
      `stripe_price_id`
- [ ] `006_grupos.sql`
- [ ] `007_pessoas.sql`
- [ ] `008_inscricoes.sql`
- [ ] `009_integridade.sql` — os CHECKs `NOT VALID` e o trigger de grupo/safra coerentes
- [ ] `010_migra_waitlist.sql` — copia `waitlist` → `pessoas` + `inscricoes`, numa
      transação só
- [ ] `011_waitlist_legado.sql` — renomeia `waitlist` → `waitlist_legado`
- [ ] `011b_rpc_criar_inscricao.sql` — a função `public.criar_inscricao`, que é o que a
      rota de inscrição passa a chamar

> **`000_schema_inicial.sql` NÃO roda em produção.** Ele existe para levantar um banco de
> staging do zero e traz um seed que reproduz o passivo real. Rodá-lo aqui não é opção — e
> não depende de disciplina: a seção 0 dele aborta a transação se `waitlist` já tiver
> qualquer linha. As `003` e `004` já rodaram há muito; não se repetem.

- [ ] **A `010` e o aceite já rodaram num banco de STAGING antes**, com o dump de produção
      restaurado. É pré-requisito escrito do `c17` em `04-PLANO.md`, não recomendação: a
      `010` lê e reescreve dado pessoal de gente real, e branch no git ou deploy de Preview
      na Vercel isolam **código**, não banco.

### O aceite da migração — `019_contagens.sql`

- [ ] **`supabase/verificacao/019_contagens.sql` terminou com `ACEITE: OK`.**
      Ele não devolve linha para alguém interpretar: ou termina com esse aviso, ou estoura
      com a razão exata. É **ele** que reprova, não as queries do fim da `010`.
- [ ] No `NOTICE` final, as três contagens **são iguais E são maiores que zero**:
      `waitlist_legado` == `pessoas` == `inscricoes`, e nenhuma delas `0`.

      > A parte "> 0" não é zelo excessivo, é a asserção que sustenta as outras.
      > `count(pessoas) == count(inscricoes) == count(waitlist_legado)` bate perfeitamente
      > quando as três estão vazias — e uma migração que não migrou nada tem exatamente
      > essa cara. Um verde comparando vazio com vazio é indistinguível de um verde de
      > verdade, e já aconteceu neste projeto (o diferencial de e-mails do `c07`, que deu
      > "0 divergências" porque as duas versões abortavam antes de montar qualquer coisa).

- [ ] O `NOTICE` também diz `passivo preservado: N sem consent, M sem perfil` — e esses
      números **batem com a origem**. Se o destino tiver *menos* nulos que o legado, houve
      backfill, e backfill de `consent` é falsificação de prova (LGPD art. 5º, XII).
      `null` significa "não sabemos" e permanece `null`.
- [ ] `amostra conferida: <e-mail>` apareceu — é a asserção 9, a linha mais antiga do
      legado encontrada no destino com o mesmo `consent`.

### Uma linha conhecida, conferida com o olho

O `019` já confere uma; esta é a segunda tranca, e é manual de propósito — contagem que
bate com conteúdo errado é o pior dos dois mundos.

- [ ] Escolha **uma pessoa real** do `waitlist_legado` (`Table editor` → `waitlist_legado`,
      ordene por `created_at` crescente e pegue a primeira). Anote `email`, `name`,
      `phone`, `created_at` e `consent`.
- [ ] Em `pessoas`, existe **uma** linha com esse e-mail, e `nome`, `telefone` e
      `created_at` são os mesmos. **`created_at` é o do legado, não o dia da migração** —
      ele diz há quanto tempo aquele contato espera, e é por ele que a Giovanna decide a
      quem escrever primeiro.
- [ ] Em `inscricoes`, existe **uma** linha apontando para o `id` daquela pessoa, com:
  - [ ] `safra_id` **vazio** e `status` = `lista_espera`
  - [ ] `grupo_id` vazio
  - [ ] `consent` **idêntico ao do legado**, inclusive se for vazio
  - [ ] `created_at` igual ao do legado

- [ ] **`waitlist_legado` NÃO se apaga agora.** Ela é a prova de que a migração fez o que
      diz, e sai só no `c79` — último commit do corte 3, depois de tudo verificado e com
      backup feito.

### Deploy e ambiente

- [ ] **O deploy em produção é o commit que contém essas migrações ou posterior.**
      Confira na Vercel qual commit está em `Production` — não basta ter dado `git push`,
      e não basta a migração ter rodado no banco.

      > Já aconteceu de a migração chegar ao banco e o deploy não: o build antigo continuou
      > no ar gravando só nome, e-mail, telefone e a resposta da pergunta de pagamento que
      > a D-11 desde então removeu — respondendo **"Inscrição confirmada!"** com 200, e
      > deixando o perfil e os três campos de consentimento **nulos**. Do lado de fora nada
      > parecia errado.
      >
      > Agora esse erro tem duas travas, e a segunda é nova. A primeira é a `011`: a tabela
      > `waitlist` **deixou de existir com esse nome**, então um build antigo recebe `42P01`
      > e falha alto em vez de gravar torto — o rename é deliberado justamente por isso. A
      > segunda são os dois CHECKs que a `010` acrescenta depois dos dados
      > (`inscricoes_consentimento_obrigatorio_check` e
      > `inscricoes_perfil_obrigatorio_check`): daqui em diante, inscrição sem perfil ou sem
      > consentimento é recusada pelo banco. A pessoa vê erro — que é ruim, mas é
      > infinitamente melhor do que um cadastro sem base legal que ninguém percebeu.

- [ ] `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão setadas na Vercel.
      Sem elas a rota responde a mensagem genérica de erro e o motivo real só aparece no
      log — e **nenhuma das duas tem prefixo `NEXT_PUBLIC_`**. Se alguém tiver acrescentado
      esse prefixo para "resolver" um erro, a chave de serviço foi para o bundle do
      navegador e precisa ser rotacionada.
- [ ] `NEXT_PUBLIC_SITE_URL` está setada na Vercel com o domínio final.
      É ela que monta as URLs absolutas do OG — errada, a prévia do link não carrega imagem.
- [ ] `RESEND_API_KEY`, `EMAIL_REMETENTE` e `EMAIL_ADMIN` estão setadas na Vercel.
      Sem elas a inscrição grava normalmente e **ninguém é avisado** — o silêncio é o
      sintoma, e ele é fácil de confundir com "não teve inscrição".
- [ ] O domínio de `EMAIL_REMETENTE` aparece como **Verified** no painel do Resend.
      Domínio não verificado faz a API responder 403 e os dois e-mails somem no log.

---

## 1. Uma inscrição real, de ponta a ponta

Faça você mesma, com dados seus, na URL de produção. Não vale localhost.

Com as inscrições fechadas — que é como o corte 1 sobe —, o caminho é o de **lista de
espera** do começo ao fim. Se em algum ponto a tela falar em vaga reservada, link de
pagamento ou data de início, alguma safra está com `inscricoes_abertas = true` no banco:
pare e vá ao bloco 6.

- [ ] Chegou até a modal pelo card de preço — o **"Garantir minha vaga"** de dentro do
      card é o único botão da página que abre o formulário. Os "Lista de espera"
      espalhados pela landing rolam até o card, não abrem nada (ver o bloco 7)
- [ ] A pílula no topo da modal diz **"Lista de espera"**, não "Inscrição", e o título
      abaixo dela é **"As inscrições estão fechadas no momento."**
- [ ] Preencheu **todos** os campos e enviou pelo botão de envio **da modal**, que com as
      inscrições fechadas diz **"Quero ser avisada"**

      > ⚠️ Não confunda com o "Garantir minha vaga" da landing. São dois botões
      > diferentes, e só um deles muda: o da landing é texto fixo em `Pricing.jsx` e diz
      > sempre a mesma coisa; o de dentro da modal é o que acompanha `inscricoes_abertas`
      > — "Garantir minha vaga" com a safra aberta, "Quero ser avisada" com ela fechada.
      > **Depois do corte 2**, com uma safra aberta, este item passa a ser "Garantir minha
      > vaga" nos dois lugares, e isso não é regressão.

- [ ] O formulário **não pergunta nada sobre pagamento**. A pergunta "quer pagar agora ou
      depois?" foi removida (D-11): ela existia numa tela onde pagar era logicamente
      impossível, e os dois valores gravavam igual
- [ ] A tela de sucesso apareceu com **"Recebemos seus dados!"**, e o texto diz que você
      está na lista de espera e será avisada quando a próxima turma abrir
- [ ] A tela de sucesso **não cita data nenhuma** — nem de cobrança, nem de início. Não há
      turma para prometer

### As duas linhas, nas duas tabelas

Uma inscrição escreve em **`pessoas`** e em **`inscricoes`**, numa transação só. Confira as
duas — uma pessoa sem inscrição é contato pessoal guardado sem nenhum registro de
consentimento, que é exatamente o estado que a função `criar_inscricao` existe para tornar
impossível.

- [ ] **No Supabase Studio, `Table editor` → `pessoas`**, ordene por `created_at`
      decrescente. Na sua linha:
  - [ ] `nome`, `email` e `telefone` conferem com o que você digitou
  - [ ] `telefone` está em E.164 — começa com `+55`, sem parênteses nem traços
- [ ] **`Table editor` → `inscricoes`**, ordene por `consent_at` decrescente. Na sua linha:
  - [ ] `pessoa_id` é o `id` da linha que você acabou de conferir em `pessoas`
  - [ ] `safra_id` está **vazio** — é o esperado, e é o que significa lista de espera
  - [ ] `status` é `lista_espera`
  - [ ] `grupo_id` está vazio
  - [ ] `nivel_ingles`, `curso` e `periodo` conferem
  - [ ] `disponibilidade` é um array com os dias que você marcou (`{seg,qua}`, por exemplo)
  - [ ] `consent` é `true`
  - [ ] `consent_at` tem a data e a hora de agora
  - [ ] `consent_text` tem a frase inteira, **incluindo** "Li e aceito os Termos de Uso e a
        Política de Privacidade"
- [ ] **Apague a linha de teste — a de `inscricoes` PRIMEIRO, depois a de `pessoas`.**
      A ordem não é preferência: `inscricoes.pessoa_id` é `on delete restrict`, então
      apagar a pessoa antes é recusado pelo banco. Se você apagar só a de `inscricoes` e
      esquecer a outra, sobra em `pessoas` um contato sem inscrição — o exato estado que
      esta seção existe para não deixar acontecer.

### Os dois e-mails

Chegam alguns segundos depois do envio, não instantaneamente — eles saem **depois** da
resposta ao navegador, de propósito, para a tela de sucesso não esperar o Resend.

- [ ] **Na sua caixa (`EMAIL_ADMIN`)**: chegou o `Nova inscrição: [seu nome]`
  - [ ] Todos os campos conferem: nome, e-mail, WhatsApp, nível de inglês, curso, período,
        disponibilidade, turma e data/hora
  - [ ] O campo **Turma** diz `Lista de espera (nenhuma turma aberta)` — é o texto certo
        com as inscrições fechadas
  - [ ] **Clicar no WhatsApp abre a conversa** com o número certo
  - [ ] **Responder o e-mail** endereça para `EMAIL_ADMIN`, não para o remetente
- [ ] **Na caixa do e-mail que você usou na inscrição**: chegou o
      `Você está na lista de espera — Beyond The Lab`
  - [ ] A recapitulação dos dados está correta
  - [ ] O texto diz que **não há turma com inscrições abertas** e que você entrou na lista
        de espera — e **não promete data de início nem link de pagamento**
  - [ ] O link do Instagram abre o perfil certo
  - [ ] **Responder cai na caixa da Giovanna**
- [ ] **Abra os dois com as imagens bloqueadas** (Gmail: "Perguntar antes de exibir
      imagens externas"). Os dois têm que continuar legíveis e fazer sentido — eles não
      usam imagem nenhuma, então nada pode sumir
- [ ] Nenhum dos dois caiu no **spam**. Se caiu, o problema é DKIM/SPF/DMARC no Resend,
      não o código

## 2. E-mail duplicado

- [ ] Envie de novo com um e-mail **já cadastrado**
- [ ] A pessoa vê a **tela de sucesso normal**, não uma mensagem de erro
- [ ] **Nenhuma linha nova apareceu em `pessoas` nem em `inscricoes`**
- [ ] **Nenhum e-mail chegou** — nem para você, nem para o endereço duplicado
- [ ] Na linha que já existia, `consent_at` e `consent_text` **continuam os da primeira
      vez**. A segunda tentativa não escreve uma linha sequer, e é isso que faz do registro
      uma prova: a data é a do ato, não a da última vez que alguém apertou o botão

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

## 6. A safra no banco, e a landing lendo dela

No Studio, tabela `safras`:

- [ ] **Nenhuma linha tem `inscricoes_abertas = true`.** Esperado: `false` em todas.

      > Não é esquecimento, é o desenho do corte 1. Sem checkout (`c35`), safra aberta
      > gravaria gente em `pendente_pagamento` sem nenhuma sessão de pagamento criada e sem
      > caminho para sair — um estado sem saída inventado para não mexer numa flag. Com
      > tudo fechado, todo mundo cai em `lista_espera` e o comportamento externo é o mesmo
      > de sempre.

- [ ] Existe **pelo menos uma** linha — a de `data_inicio_aulas` mais recente é a que a
      landing exibe, aberta ou não (D-13). Sem nenhuma safra, a vitrine não tem o que
      mostrar
- [ ] Nessa linha, `data_inicio_aulas` está correta
- [ ] `data_primeira_cobranca` está correta e é **anterior ou igual** ao início das aulas
- [ ] `valor_mensal` está correto
- [ ] `duracao_meses` está certo

### A landing lê tudo isso do banco — nenhum literal

- [ ] O preço exibido na seção de preço é o `valor_mensal` da safra
- [ ] A duração exibida é a `duracao_meses` da safra, com a concordância certa
      ("6 meses", "1 mês")
- [ ] O mês no badge do hero e a frase "as aulas começam **na \<ordinal\> semana de
      \<mês\>**" saem da `data_inicio_aulas` (D-14) — semana e mês, **nunca a data seca**
- [ ] Abra a modal e confira que ela conta a mesma história da página

### ✅ O aceite do corte 1

Este é o critério que fecha o corte. Se ele falhar, o corte falhou — o resto passar não
compensa.

- [ ] **Mude `valor_mensal` no Studio, espere até 60 segundos, recarregue a landing: o
      preço novo aparece, SEM nenhum deploy.**
      A página é estática com `revalidate = 60`; um minuto de defasagem é o preço combinado.
      Se for preciso um deploy para o número mudar, a Giovanna continua dependendo de um
      commit para mexer no próprio preço, e é isso que o corte inteiro existia para acabar.
- [ ] **Devolva o valor original** e confira que a landing volta em até 60s

## 7. Os oito CTAs

São **oito**, e eles **não fazem a mesma coisa**. Sete dizem **"Lista de espera"** e rolam
até o card de preço; **só o do card**, que diz **"Garantir minha vaga"**, abre a modal.

> O fluxo é de duas etapas de propósito: quem clica no CTA do topo ainda não viu o preço, e
> mandar a modal direto pularia justamente a informação de que a decisão precisa.

Clique nos oito:

**Na landing (`/`) — rolam até o card de preço, texto "Lista de espera":**
- [ ] Navbar, botão do topo (desktop)
- [ ] Navbar, botão dentro do menu hambúrguer (mobile) — e o menu **fecha** ao clicar
- [ ] Hero
- [ ] PainPoints
- [ ] Teacher
- [ ] FinalCta

**Em `/conteudo-programatico` — mesma coisa, texto "Lista de espera":**
- [ ] Botão do fim da página. Ele sai da rota: leva para `/#planos` e a landing abre já no
      card

**No card de preço — o único que abre a modal:**
- [ ] Pricing — e confira que o botão diz **"Garantir minha vaga"**, não "Adquirir"

      > Este texto é fixo em `Pricing.jsx` e **não** acompanha `inscricoes_abertas`: ele é
      > o convite para abrir o formulário, e quem decide o que o formulário promete é a
      > modal, do lado de dentro. O botão que muda com a flag é o de **envio**, lá dentro —
      > ver o bloco 1.

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
real está no log: **Vercel → o projeto → Logs**, filtrando por `[inscricao]`.

A leitura da safra tem prefixo próprio, `[safra-ativa]`, e ela **falha em silêncio de
propósito**: banco fora do ar, variável faltando ou schema divergente respondem "não há
safra" e a modal cai em lista de espera, em vez de mostrar tela quebrada para quem estava
interessada. O sintoma é a modal em modo lista de espera com a safra certa no banco — e o
motivo está nesse log, não na tela.
