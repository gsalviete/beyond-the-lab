-- ============================================================
-- Beyond The Lab — DIAGNÓSTICO: "cadastrei o cartão e não recebi nada"
--
-- ⚠️ SOMENTE LEITURA. Nenhum `insert`, `update`, `delete` ou `alter`.
-- Cole no SQL Editor do Supabase e leia os resultados em ordem.
--
-- ------------------------------------------------------------
-- O QUE ESTE ARQUIVO ESTÁ TENTANDO DECIDIR
-- ------------------------------------------------------------
--
-- O relato é: alunas dizem ter cadastrado o cartão, não receberam
-- confirmação, e no Dashboard do Stripe elas aparecem como Customer —
-- **e só isso**, sem payment method e sem subscription.
--
-- Esse quadro tem DOIS culpados possíveis, e eles pedem consertos
-- opostos. Todo o resto deste arquivo existe para separar um do outro:
--
--   (A) A SESSÃO NUNCA FOI CONCLUÍDA.
--       Em `mode: 'subscription'` o Stripe materializa o Customer no
--       momento em que a Checkout Session é CRIADA — ou seja, ainda
--       dentro do nosso `POST /api/inscricao`, antes de a pessoa ver a
--       tela do cartão. Um Customer existir prova que NÓS criamos a
--       sessão; não prova que alguém digitou cartão nenhum.
--       Se a sessão não foi concluída, não há PM, não há subscription,
--       não há `checkout.session.completed`, e a inscrição fica parada
--       em `pendente_pagamento`. É o estado que a D-15 endereça.
--
--   (B) A SESSÃO FOI CONCLUÍDA E O WEBHOOK NÃO CHEGOU (ou falhou).
--       Aí existiria subscription e PM no Stripe — o que o relato do
--       Dashboard contradiz —, mas o nosso banco ficaria igualzinho ao
--       caso (A): `pendente_pagamento`, sem `assinaturas`. Os dois se
--       parecem DO LADO DE CÁ, e é por isso que a consulta 3 (o que a
--       `eventos_stripe` recebeu) é a que decide.
--
-- ⚠️ A CONSULTA 3 É A CHAVE. `eventos_stripe` guarda TODO evento que o
-- endpoint recebeu e verificou, inclusive os sem handler (o `default`
-- do `processar` registra e segue). Portanto:
--
--   - tabela VAZIA ou sem nada recente  → o endpoint não está recebendo
--     nada: URL do webhook errada no Dashboard, `STRIPE_WEBHOOK_SECRET`
--     divergente (assinatura inválida vira 400 e NÃO chega a gravar), ou
--     endpoint apontando para outro ambiente. Caso (B).
--   - eventos chegando, mas ZERO `checkout.session.completed` → o
--     webhook está saudável e ninguém concluiu o checkout. Caso (A).
--   - `checkout.session.completed` presente sem linha em `assinaturas`
--     para a mesma inscrição → o handler falhou depois de reservar o
--     evento e a liberação também falhou. É o cenário que o comentário
--     "reprocessar a mão" do webhook prevê. Caso (B), e a consulta 6
--     lista exatamente essas.
-- ============================================================


-- ------------------------------------------------------------
-- 1. O RETRATO GERAL — quantas inscrições em cada estado, por safra
--
-- `pendente_pagamento` = checkout criado e não concluído (comentário do
-- CHECK da `009`). Se esse número for grande perto de `confirmada`, o
-- funil está morrendo na tela do Stripe, e o problema não é o webhook.
-- ------------------------------------------------------------
select
  s.nome                          as safra,
  i.status,
  count(*)                        as inscricoes,
  min(i.created_at)               as primeira,
  max(i.created_at)               as ultima
from public.inscricoes i
left join public.safras s on s.id = i.safra_id
group by s.nome, i.status
order by s.nome nulls first, i.status;


-- ------------------------------------------------------------
-- 2. AS PESSOAS PRESAS EM `pendente_pagamento`
--
-- Esta é a lista para casar, nome a nome, com quem reclamou. `tem_
-- assinatura` responde a pergunta que interessa: existe linha em
-- `assinaturas` para essa inscrição? Se sim com status `pendente_
-- pagamento`, o webhook rodou pela metade — o `registrarAssinatura`
-- passou e o `mudarStatusInscricao` não.
--
-- ⚠️ As colunas `*_travada` vêm junto de propósito: elas são o contrato
-- que a `016` gravou no ato do insert. Uma linha em `pendente_pagamento`
-- SEM elas nasceu por um caminho que não passa pela RPC — outra
-- história, e mais grave.
-- ------------------------------------------------------------
select
  p.nome,
  p.email,
  p.telefone,
  s.nome                                    as safra,
  i.status,
  i.created_at,
  i.valor_mensal_travado,
  i.duracao_meses_travada,
  i.data_primeira_cobranca_travada,
  (a.id is not null)                        as tem_assinatura,
  a.status_stripe,
  a.stripe_customer_id,
  a.stripe_subscription_id
from public.inscricoes i
join public.pessoas p on p.id = i.pessoa_id
left join public.safras s     on s.id = i.safra_id
left join public.assinaturas a on a.inscricao_id = i.id
where i.status = 'pendente_pagamento'
order by i.created_at desc;


-- ------------------------------------------------------------
-- 3. ⚠️ A CONSULTA QUE DECIDE — o que o webhook recebeu de verdade
--
-- Leia com a régua do cabeçalho. Zero linhas aqui, com inscrições
-- recentes na consulta 1, significa que o endpoint não está sendo
-- alcançado: nesse caso o próximo passo NÃO é no banco, é em
-- Developers → Webhooks no Dashboard do Stripe, conferindo a URL
-- (`/api/stripe/webhook`), o ambiente (test x live) e o signing secret
-- contra a env var do deploy.
-- ------------------------------------------------------------
select
  tipo,
  count(*)           as eventos,
  min(recebido_em)   as primeiro,
  max(recebido_em)   as ultimo
from public.eventos_stripe
group by tipo
order by ultimo desc;


-- ------------------------------------------------------------
-- 4. OS ÚLTIMOS EVENTOS, UM A UM
--
-- Serve para ver se o fluxo parou num dia específico — um deploy, uma
-- troca de chave. `customer_email` sai do payload cru porque é o único
-- campo que casa o evento com a aluna sem depender de nada nosso.
--
-- ⚠️ O payload é dado pessoal (LGPD) — ver o bloco da `014`. Esta
-- consulta expõe e-mail na tela: rode, leia, não exporte.
-- ------------------------------------------------------------
select
  recebido_em,
  tipo,
  stripe_event_id,
  payload #>> '{data,object,client_reference_id}' as inscricao_id,
  payload #>> '{data,object,customer_email}'      as customer_email,
  payload #>> '{data,object,customer}'            as customer,
  payload #>> '{data,object,subscription}'        as subscription,
  payload #>> '{data,object,status}'              as status_do_objeto,
  payload #>> '{data,object,payment_status}'      as payment_status
from public.eventos_stripe
order by recebido_em desc
limit 50;


-- ------------------------------------------------------------
-- 5. AS ASSINATURAS QUE EXISTEM — o lado que funcionou
--
-- Se vier vazia e a consulta 3 mostrar eventos de outros tipos
-- chegando, está confirmado: nenhuma sessão foi concluída até hoje.
-- ------------------------------------------------------------
select
  p.email,
  s.nome                as safra,
  i.status              as status_inscricao,
  a.status_stripe,
  a.ciclos_pagos,
  a.trial_end,
  a.cancel_at,
  a.stripe_customer_id,
  a.stripe_subscription_id,
  a.criado_em
from public.assinaturas a
join public.inscricoes i on i.id = a.inscricao_id
join public.pessoas p    on p.id = i.pessoa_id
left join public.safras s on s.id = i.safra_id
order by a.criado_em desc;


-- ------------------------------------------------------------
-- 6. O CASO FEIO: evento de conclusão recebido e nenhuma assinatura
--
-- Cada linha aqui é dinheiro que o Stripe confirmou e que o nosso banco
-- não registrou — a reserva ficou de pé sem efeito, e a reentrega vai
-- pular o evento. O `payload` da `014` é o que permite reprocessar à
-- mão; o `stripe_event_id` abaixo é o que se procura no log do deploy
-- (`[webhook] handler falhou`) para descobrir POR QUÊ antes de refazer.
--
-- Espera-se ZERO linhas.
-- ------------------------------------------------------------
select
  e.stripe_event_id,
  e.recebido_em,
  e.payload #>> '{data,object,client_reference_id}' as inscricao_id,
  e.payload #>> '{data,object,customer_email}'      as customer_email,
  i.status                                          as status_inscricao
from public.eventos_stripe e
left join public.inscricoes i
  on i.id = (e.payload #>> '{data,object,client_reference_id}')::uuid
left join public.assinaturas a
  on a.inscricao_id = i.id
where e.tipo = 'checkout.session.completed'
  and a.id is null
order by e.recebido_em desc;


-- ------------------------------------------------------------
-- 7. UMA ALUNA ESPECÍFICA — troque o e-mail e rode
--
-- A história inteira de uma pessoa em uma tela: inscrição, contrato
-- travado, assinatura, e todo evento do Stripe que menciona o e-mail
-- dela. É a consulta para responder "e a fulana, o que aconteceu?".
-- ------------------------------------------------------------
select
  p.nome,
  p.email,
  i.id            as inscricao_id,
  i.status,
  i.created_at,
  i.data_primeira_cobranca_travada,
  a.status_stripe,
  a.stripe_customer_id,
  a.stripe_subscription_id
from public.pessoas p
join public.inscricoes i on i.pessoa_id = p.id
left join public.assinaturas a on a.inscricao_id = i.id
where lower(p.email) = lower('TROQUE@EXEMPLO.COM')
order by i.created_at desc;

select
  recebido_em,
  tipo,
  stripe_event_id,
  payload #>> '{data,object,client_reference_id}' as inscricao_id
from public.eventos_stripe
where payload::text ilike '%' || lower('TROQUE@EXEMPLO.COM') || '%'
order by recebido_em desc;
