-- ============================================================
-- CONFERÊNCIA DO REPARO — webhook perdido de 17 a 24/08/2026
-- ============================================================
--
-- SÓ LÊ. Nenhum comando aqui escreve. Rode antes de decidir se o
-- `supabase/operacao/reparo_webhook_ago2026.sql` ainda é necessário, e
-- rode de novo depois de qualquer ação para ver o que mudou.
--
-- O contexto está no cabeçalho do arquivo de reparo. Em uma linha: o
-- endpoint do webhook ficou com o domínio errado entre 17 e 24/08, três
-- alunas concluíram o checkout nessa janela, e o sistema não soube.
--
-- ⚠️ A ORDEM DAS CONSULTAS É A ORDEM DA DECISÃO. A 1 diz se o reenvio
-- funcionou; a 2 diz se ainda falta algo; a 3 é o alarme que não pode
-- ficar aceso.
-- ============================================================


-- ------------------------------------------------------------
-- 1. AS QUATRO QUE PAGARAM — o quadro que decide tudo
--
-- Leia a coluna `veredito`:
--
--   OK                      → nada a fazer nesta linha.
--   FALTA ESPELHAR          → o `checkout.session.completed` ainda não
--                             passou. Reenvie no Dashboard; se a janela
--                             de 30 dias tiver fechado, rode o reparo.
--   FALTA A FATURA          → o checkout entrou, mas o evento da fatura
--                             de 28/08 ainda não. Se for antes de 31/08,
--                             espere: a reentrega resolve sozinha.
--   ⚠️ SEM DATA DE FIM      → a assinatura cobra para sempre. Ver a 3.
--
-- ⚠️ A PRIMEIRA VERSÃO DESTE CASE ESTAVA ERRADA, e o erro merece ficar
-- escrito porque ele é fácil de repetir. Ela detectava "falta a fatura"
-- por `status = 'pendente_pagamento'` — e depois do reenvio do
-- `checkout.session.completed` o status vira `confirmada`, não continua
-- pendente. Resultado: as três alunas apareceram como `OK` faltando
-- metade do conserto.
--
-- O discriminador certo é `ciclos_pagos`, porque é ele que só `faturaPaga`
-- move. `confirmada` significa cartão salvo e cobrança agendada;
-- `ativa` significa que uma fatura do contrato foi paga. Entre um e outro
-- pode passar mês, e é exatamente essa distinção que a D-04 obriga.
--
-- ⚠️ `inadimplente` com zero ciclos é ESTADO CORRETO, não pendência: é
-- quem teve o cartão recusado na primeira fatura. Por isso ele sai antes
-- da conferência de ciclo.
-- ------------------------------------------------------------
select
  p.nome,
  i.status                                   as status_inscricao,
  a.status_stripe,
  a.ciclos_pagos,
  a.cancel_at,
  case
    when a.id is null                         then 'FALTA ESPELHAR'
    when a.cancel_at is null                  then '⚠️ SEM DATA DE FIM'
    when i.status = 'inadimplente'            then 'OK'
    when i.status = 'pendente_pagamento'      then 'FALTA ESPELHAR'
    when a.ciclos_pagos = 0                   then 'FALTA A FATURA'
    when i.status <> 'ativa'                  then 'FALTA A FATURA'
    else 'OK'
  end                                        as veredito
  from public.inscricoes i
  join public.pessoas p      on p.id = i.pessoa_id
  left join public.assinaturas a on a.inscricao_id = i.id
 where i.id in (
         '5662e098-17d8-4200-8244-51014890bef5',  -- Sofia de Oliveira Costa
         'b4035457-fff7-4c45-aa2f-ee7eb361db2d',  -- Clarisse Mello
         '4506094e-1da0-4309-aa0b-d58281fcce6a',  -- Júlia Coelho Masiero
         '748426e2-632c-40a7-8f94-9a200dead1ca'   -- Letícia Muza (a que deu certo)
       )
 order by i.created_at;

-- Esperado no fim de tudo:
--   Sofia    → ativa          · active   · 1 ciclo · 2027-02-28 · OK
--   Clarisse → ativa          · active   · 1 ciclo · 2027-02-28 · OK
--   Júlia    → inadimplente   · past_due · 0 ciclo · 2027-02-28 · OK
--   Letícia  → ativa          · active   · 1 ciclo · 2027-02-28 · OK
--
-- ⚠️ `inadimplente` na Júlia é o resultado CERTO, não uma falha do
-- reparo: o cartão dela foi recusado em 28/08 e o Stripe segue tentando.


-- ------------------------------------------------------------
-- 2. OS EVENTOS QUE O SISTEMA PROCESSOU
--
-- ⚠️ ESTA TABELA SÓ GUARDA O QUE DEU CERTO, e é isso que a torna útil
-- aqui. Quando um handler falha, `liberarEventoStripe` apaga a reserva
-- para que a reentrega possa tentar de novo — então evento que falhou
-- NÃO aparece. Linha nova aqui é prova de que o reenvio passou.
--
-- Antes do reparo havia exatamente 2 linhas, as duas da Letícia.
-- ------------------------------------------------------------
select stripe_event_id, tipo, recebido_em
  from public.eventos_stripe
 order by recebido_em desc;


-- ------------------------------------------------------------
-- 3. ⚠️ O ALARME — assinatura sem data de encerramento
--
-- Enquanto uma linha aparecer aqui, aquela assinatura NÃO para no 6º mês
-- e cobra indefinidamente. É a D-05 em aberto.
--
-- O `cancel_at` é escrito no Stripe pelo webhook, não por SQL: ou pelo
-- reenvio do `checkout.session.completed`, ou pela rede de `faturaPaga`,
-- que redeclara o fim sozinha na fatura de 28/09.
--
-- ESPERADO: zero linhas. Qualquer linha aqui é pendência aberta.
-- ------------------------------------------------------------
select
  p.nome,
  a.stripe_subscription_id,
  i.data_primeira_cobranca_travada,
  i.duracao_meses_travada,
  (i.data_primeira_cobranca_travada + (i.duracao_meses_travada || ' months')::interval)::date
    as cancel_at_esperado
  from public.assinaturas a
  join public.inscricoes i on i.id = a.inscricao_id
  join public.pessoas p    on p.id = i.pessoa_id
 where a.cancel_at is null;


-- ------------------------------------------------------------
-- 4. A FILA QUE A GIOVANNA VAI VER
--
-- O mesmo critério do `listarPendentes` depois do conserto:
-- `pendente_pagamento` E sem assinatura espelhada. São estas que PODEM
-- receber o link de cobrança — e só estas.
--
-- ESPERADO: 5 linhas — Hillary, Gabrielle, Bruna, Tainá e Laura.
-- Se aparecer Sofia, Clarisse ou Júlia, o reparo não terminou: NÃO
-- dispare link para elas, porque abriria uma segunda assinatura.
-- ------------------------------------------------------------
select
  p.nome,
  p.email,
  i.created_at::date                                    as abriu_o_checkout,
  (current_date - i.created_at::date)                    as dias_parada
  from public.inscricoes i
  join public.pessoas p          on p.id = i.pessoa_id
  left join public.assinaturas a on a.inscricao_id = i.id
 where i.status = 'pendente_pagamento'
   and a.id is null
 order by i.created_at;


-- ------------------------------------------------------------
-- 5. O CUPOM PRIMEIRASEMANA
--
-- Clarisse e Júlia concluíram o checkout com ele, e o uso é contado em
-- `sessaoConcluida` — no checkout concluído, não na fatura paga. Então a
-- Júlia conta mesmo com a cobrança recusada.
--
-- ESPERADO: usos_atuais = 2 no fim. Antes do reparo estava em 0.
-- ------------------------------------------------------------
select codigo, tipo, valor, usos_atuais, usos_max, expira_em, ativo
  from public.cupons
 where id = 'fd3cf333-57f5-4a43-a331-b9cac3281928';
