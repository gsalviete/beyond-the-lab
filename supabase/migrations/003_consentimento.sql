-- ============================================================
-- Beyond The Lab — registro probatório do consentimento
--
-- Até aqui o consentimento era EXIGIDO mas não era GRAVADO: o Zod da
-- rota `/api/waitlist` reprovava `consent: false`, e em seguida o
-- payload do insert simplesmente não levava o campo. Ou seja, o banco
-- não tinha como distinguir quem consentiu de quem foi cadastrado por
-- outro caminho — e a LGPD (art. 8º, §1º) põe no controlador o ônus de
-- provar que o consentimento foi obtido.
--
-- Três colunas fecham isso. Nenhuma delas é "o checkbox": juntas elas
-- são SE, QUANDO e A QUÊ a pessoa consentiu. Faltando qualquer uma, o
-- conjunto perde valor de prova — sem o texto, não se sabe o que foi
-- aceito; sem a data, não se sabe qual redação estava no ar.
--
-- A `waitlist` JÁ TEM DADOS: nada aqui apaga, recria ou reescreve linha
-- existente. Todo ALTER é aditivo, toda coluna nova é nullable, e não
-- há um único UPDATE neste arquivo — de propósito. Ver a seção 1.
--
-- A tabela continua com RLS ligada e ZERO policies, de propósito: todo
-- acesso é server-side com a service_role, que ignora RLS. Não crie
-- policy — isso abriria a tabela para a chave anon.
--
-- Rode no SQL Editor do Supabase. É idempotente: pode rodar de novo.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. consent — SE consentiu
--
-- Nullable, e é o ponto mais importante deste arquivo.
--
-- As linhas anteriores a esta migração não têm o dado. A tentação é
-- dar `not null default true` e "resolver" o backfill numa linha — e
-- seria falsificação de prova. Aquelas pessoas provavelmente marcaram
-- alguma caixa, mas o banco não registrou, e inventar `true` agora
-- produziria um registro que afirma algo que ninguém verificou.
-- Consentimento presumido não é consentimento (LGPD art. 5º, XII: a
-- manifestação tem que ser livre, informada e INEQUÍVOCA).
--
-- `null` aqui lê como "não sabemos", que é a verdade. É um estado
-- desconfortável — e deve ser: ele torna visível, em qualquer consulta,
-- exatamente quais contatos não têm base documentada. Se um dia for
-- preciso limpar isso, o caminho é reobter o consentimento dessas
-- pessoas, não escrever `true` por decreto.
--
-- ⚠️ QUANDO VIRAR OBRIGATÓRIO: depois que as linhas antigas forem
-- reconsentidas ou removidas, promova a coluna com
--     alter table public.waitlist alter column consent set not null;
-- Até lá, quem garante que toda escrita nova traz o campo é a rota
-- `/api/waitlist`, onde o Zod exige `z.literal(true)`.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists consent boolean;

comment on column public.waitlist.consent is
  'Se a pessoa marcou a caixa de consentimento no ato do cadastro. '
  'NULL = cadastro anterior ao registro probatório; não presuma true. '
  'Prova exigida pela LGPD art. 8º, §1º, junto com consent_at e consent_text.';

-- ------------------------------------------------------------
-- 2. consent_at — QUANDO consentiu
--
-- `timestamptz` e não `date`: aqui é instante, não dia de calendário —
-- o oposto exato da escolha feita nas colunas `data_*` de `turmas`, e
-- pela mesma razão de fundo. Um consentimento acontece num momento
-- específico, e é esse momento que amarra a linha à redação que estava
-- publicada naquela hora.
--
-- Sem `default now()`, de propósito. Um default faria a coluna se
-- preencher sozinha em qualquer insert — inclusive num que não tivesse
-- passado por caixa nenhuma —, e o valor deixaria de significar "quando
-- consentiu" para significar "quando a linha nasceu". Quem preenche é a
-- rota, explicitamente, no mesmo lugar em que valida o consentimento.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists consent_at timestamptz;

comment on column public.waitlist.consent_at is
  'Instante em que o consentimento foi manifestado, gerado no servidor. '
  'Sem default: só é preenchido por quem de fato validou a caixa marcada. '
  'É o que amarra a linha à redação de consent_text vigente naquele momento.';

-- ------------------------------------------------------------
-- 3. consent_text — A QUÊ consentiu
--
-- A coluna que faz as outras duas valerem alguma coisa.
--
-- `consent = true` sozinho prova que alguém clicou, não o que foi
-- aceito. A redação vai mudar — revisão de advogado, inclusão dos links
-- de Termos e Privacidade, mudança no que se promete enviar — e a
-- pessoa que se cadastrou em agosto consentiu com o texto de agosto,
-- não com o que estiver no ar quando alguém for auditar.
--
-- Guardar a string inteira em cada linha é redundância deliberada. A
-- alternativa normalizada (uma tabela de versões de texto e uma FK
-- aqui) economizaria bytes e criaria o risco que este arquivo existe
-- para eliminar: um UPDATE na tabela de versões reescreveria
-- retroativamente o que milhares de pessoas teriam "aceitado". Prova
-- não se normaliza.
--
-- O valor vem da constante `CONSENT_TEXT` de `src/config/consentimento.ts`,
-- lida no SERVIDOR — nunca do corpo do POST. O cliente pode afirmar
-- qualquer coisa; o que vale é o texto que o servidor sabe ter exibido.
-- ------------------------------------------------------------
alter table public.waitlist
  add column if not exists consent_text text;

comment on column public.waitlist.consent_text is
  'Cópia literal do texto que a pessoa aceitou, gravada por linha de propósito. '
  'Vem da constante CONSENT_TEXT do servidor, nunca do payload do cliente. '
  'Redundante por design: normalizar permitiria reescrever consentimento passado.';

-- ------------------------------------------------------------
-- 4. Conferência
--
-- Não altera nada. Devolve uma linha por coluna nova para confirmar
-- que as três existem, são nullable e não têm default — e a contagem
-- de linhas sem registro de consentimento, que é o passivo a resolver.
-- ------------------------------------------------------------
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'waitlist'
  and column_name in ('consent', 'consent_at', 'consent_text')
order by column_name;

select
  count(*) filter (where consent is null)     as sem_registro_de_consentimento,
  count(*) filter (where consent is not null) as com_registro_de_consentimento,
  count(*)                                    as total
from public.waitlist;

commit;
