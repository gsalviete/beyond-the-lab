-- ============================================================
-- Beyond The Lab — acrescenta à vista e parcelado à turma de novembro/2026
-- (D-17)
--
-- ⛔ Rode depois da `020`. Depende de `valor_a_vista`,
--    `valor_parcelado_total` e `parcelas_parcelado`.
--
-- ⚠️ ESTE ARQUIVO NÃO É MIGRAÇÃO: ele ESCREVE DADO numa linha só. Mora em
--    `operacao/` pelo mesmo motivo de `gerar_convites.sql`.
--
-- POR QUE ELE EXISTE
--
-- A turma de novembro foi criada no painel ANTES do deploy do corte 4, e o
-- formulário daquela versão não tinha os campos de à vista e parcelado.
-- Ela nasceu só com a mensalidade — que é o que a `020` diz que coluna
-- nula significa ("forma não oferecida"). Não existe tela de edição de
-- turma (o `PUT` de `/api/admin/safras` não tem chamador), então o
-- caminho é este.
--
-- ⚠️ NÃO MEXE EM QUEM JÁ SE INSCREVEU (D-06). O contrato de cada inscrição
-- está travado na linha dela; isto muda só o que a turma OFERECE a quem
-- chegar depois. Quem já está pendente no mensal continua no mensal.
--
-- Os valores são os combinados em 20/10/2026: à vista R$ 1.500,00 (cartão
-- ou Pix) e parcelado de R$ 2.000,00 em 12 vezes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANTES — rode SOZINHO e confira.
--
-- Esperado: UMA linha, a turma de novembro, com `valor_mensal = 299.99`,
-- `duracao_meses = 6` e as três colunas novas nulas. Copie o `id`.
--
-- ⚠️ Se `valor_mensal` não for 299.99 ou `duracao_meses` não for 6, PARE:
-- o 6x combinado é "6x de R$ 299,99", e isso se corrige antes, não junto.
-- ------------------------------------------------------------
select id, nome, slug, data_inicio_aulas, data_primeira_cobranca,
       valor_mensal, duracao_meses, inscricoes_abertas,
       valor_a_vista, valor_parcelado_total, parcelas_parcelado
from public.safras
order by data_inicio_aulas desc
limit 3;

-- ------------------------------------------------------------
-- 2. A ESCRITA — troque <ID_DA_TURMA> pelo `id` do passo 1.
--
-- Pelo `id`, e não pelo nome: o nome é texto livre digitado no painel, e
-- um `where nome = ...` com um espaço a mais não atualizaria nada sem
-- reclamar.
--
-- ⚠️ `begin` sem `commit` automático: rode, confira que a saída diz
-- `UPDATE 1`, e só então rode o `commit;`. Se disser `UPDATE 0`, o id
-- está errado — rode `rollback;`.
--
-- Os CHECKs da `020` valem aqui (o `NOT VALID` só dispensa as linhas que
-- já estavam lá, não um UPDATE novo): parcelado pela metade ou à vista
-- zerado são recusados.
-- ------------------------------------------------------------
begin;

update public.safras
set valor_a_vista         = 1500.00,
    valor_parcelado_total = 2000.00,
    parcelas_parcelado    = 12
where id = '<ID_DA_TURMA>'
  and valor_a_vista is null
  and valor_parcelado_total is null;

-- commit;
-- rollback;

-- ------------------------------------------------------------
-- 3. DEPOIS — confira.
--
-- Esperado: a turma com 1500.00, 2000.00 e 12. O formulário de inscrição
-- passa a mostrar o menu de forma de pagamento na próxima abertura — a
-- leitura da modal não tem cache (`/api/safra-ativa` é `no-store`).
-- ------------------------------------------------------------
select id, nome, valor_mensal, duracao_meses,
       valor_a_vista, valor_parcelado_total, parcelas_parcelado
from public.safras
where id = '<ID_DA_TURMA>';
