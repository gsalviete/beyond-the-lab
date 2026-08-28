import Link from 'next/link'
import { notFound } from 'next/navigation'
import CancelarInscricao from '@/components/admin/CancelarInscricao.jsx'
import EtiquetaStatus from '@/components/admin/EtiquetaStatus.jsx'
import { SetaEsquerda } from '@/components/admin/Icones.jsx'
import { ROTULO_DIA_SEMANA, ROTULO_NIVEL_INGLES, listarDias } from '@/config/dominio'
import { formatarValorMensal } from '@/config/curso'
import { buscarFicha } from '@/lib/supabase'

// ============================================================
// A FICHA DA ALUNA (`c70`)
//
// ⚠️ É A ÚNICA TELA ONDE A PROVA DE CONSENTIMENTO É LEGÍVEL POR GENTE, e
// ela existe porque um dia alguém vai perguntar "quando ela aceitou, e o
// quê?". Sob LGPD, não conseguir responder é o mesmo que não ter a prova.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`.
// ============================================================

export const dynamic = 'force-dynamic'

/**
 * ⚠️ OS ESTADOS DO STRIPE, EM PORTUGUÊS.
 *
 * A ficha mostrava `status_stripe` cru, e a Giovanna leu **"trialing"** e
 * perguntou o que era. Ela tinha razão de perguntar: é vocabulário de API
 * numa tela que pela D-07 é a única ferramenta dela. Se ela precisa
 * aprender o idioma do Stripe para ler a própria ficha, a ferramenta
 * falhou.
 *
 * A tradução mora aqui, na borda. O banco continua guardando o valor cru
 * — ele é ESPELHO do Stripe (`012`), e espelho que traduz deixa de servir
 * para conciliar.
 *
 * ⚠️ O `?? valor` NO FIM NÃO É PREGUIÇA: o Stripe pode acrescentar um
 * estado novo, e imprimir o nome cru é melhor do que imprimir vazio ou
 * "desconhecido". Ela vê algo estranho, pergunta, e a gente traduz — que
 * é exatamente o que aconteceu com o `trialing`.
 */
const ROTULO_STRIPE = {
  trialing: 'Cartão salvo, aguardando a primeira cobrança',
  active: 'Cobrança em dia',
  past_due: 'Cobrança atrasada — o Stripe vai tentar de novo',
  unpaid: 'Cobranças falharam e o Stripe desistiu de tentar',
  canceled: 'Encerrada',
  incomplete: 'Pagamento começou e não foi concluído',
  incomplete_expired: 'Pagamento não concluído a tempo',
  paused: 'Pausada',
}

const ROTULO_STATUS = {
  lista_espera: 'Lista de espera',
  pendente_pagamento: 'Pagamento pendente',
  confirmada: 'Cartão salvo, aguardando a primeira cobrança',
  ativa: 'Pagando',
  inadimplente: 'Cobrança recusada',
  concluida: 'Concluiu o curso',
  cancelada: 'Cancelada',
}

export default async function Page({ params }) {
  const { id } = await params
  const ficha = await buscarFicha(id)

  if (!ficha) notFound()

  const { inscricao, pessoa, safra, grupo, assinatura } = ficha

  return (
    <>
      {/* ⚠️ A SETA É UM SVG, E NÃO O CARACTERE `←`. O caractere herda o
          tamanho da fonte do texto ao lado — crescê-lo cresceria a palavra
          "Alunas" junto — e sai desenhado diferente em cada sistema. Como
          ícone, ela tem tamanho próprio e alvo de toque próprio: voltar é o
          gesto mais repetido desta tela, e estava com a área de um til. */}
      <Link
        href="/admin/alunas"
        className="-ml-2 inline-flex items-center gap-2 rounded-full px-2 py-1.5 font-sans
                   text-[15px] font-medium text-muted
                   [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
      >
        <SetaEsquerda className="h-6 w-6" />
        Alunas
      </Link>

      <h1 className="mt-3 font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        {pessoa.nome}
      </h1>

      {/* A mesma etiqueta da lista, com o texto longo desta tela. A cor é
          compartilhada; o rótulo não — ver `EtiquetaStatus.jsx`. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <EtiquetaStatus status={inscricao.status}>
          {ROTULO_STATUS[inscricao.status] ?? inscricao.status}
        </EtiquetaStatus>
        {safra && <span className="font-sans text-[15px] text-[#345372]">{safra.nome}</span>}
      </div>

      <Bloco titulo="Contato">
        <Linha rotulo="E-mail" valor={pessoa.email} />
        <Linha rotulo="WhatsApp" valor={pessoa.telefone} />
      </Bloco>

      <Bloco titulo="O que ela contou">
        {/* ⚠️ O perfil é DA INSCRIÇÃO, não da pessoa (`008`): quem estava no
            3º período em janeiro está no 5º em julho. Por isso ele vive
            aqui e não em `pessoas`, e por isso a ficha de uma safra antiga
            mostra o que era verdade naquela safra. */}
        <Linha rotulo="Nível de inglês" valor={ROTULO_NIVEL_INGLES[inscricao.nivel_ingles] ?? '—'} />
        <Linha rotulo="Curso" valor={inscricao.curso ?? '—'} />
        <Linha rotulo="Período" valor={inscricao.periodo ?? '—'} />
        <Linha
          rotulo="Dias disponíveis"
          valor={inscricao.disponibilidade ? listarDias(inscricao.disponibilidade) : '—'}
        />
        <Linha
          rotulo="Horário alocado"
          valor={
            grupo
              ? `${ROTULO_DIA_SEMANA[grupo.dia_semana] ?? grupo.dia_semana} · ${grupo.horario}`
              : 'Sem horário ainda'
          }
        />
      </Bloco>

      {/* ⚠️ O CONTRATO É O DA LINHA, e não o preço atual da turma (D-06).
          Mexer na safra depois não afeta quem já assinou — e é este bloco
          que prova isso na tela: se ele mostrasse o valor da safra, o
          painel diria um número e o cartão seria debitado com outro. */}
      {inscricao.valor_mensal_travado !== null && (
        <Bloco titulo="Contrato">
          <Linha
            rotulo="Mensalidade combinada"
            valor={formatarValorMensal(inscricao.valor_mensal_travado)}
          />
          <Linha rotulo="Duração" valor={`${inscricao.duracao_meses_travada} meses`} />
          <Linha
            rotulo="Primeira cobrança"
            valor={formatarData(inscricao.data_primeira_cobranca_travada)}
          />
          {assinatura && (
            <>
              <Linha rotulo="Meses pagos" valor={String(assinatura.ciclos_pagos)} />
              <Linha
                rotulo="Situação da cobrança"
                valor={ROTULO_STRIPE[assinatura.status_stripe] ?? assinatura.status_stripe}
              />
              <Linha
                rotulo="Cobrança encerra em"
                valor={assinatura.cancel_at ? formatarData(assinatura.cancel_at) : '—'}
              />
            </>
          )}
        </Bloco>
      )}

      {/* ============================================================
          ⚠️ O CONSENTIMENTO, E `null` NÃO É "NÃO ACEITOU"

          `null` significa "não sabemos": são as linhas herdadas da `010`,
          onde nunca houve backfill DE PROPÓSITO. Preencher aquilo teria
          sido falsificar a própria prova que a coluna existe para guardar.
          A tela precisa dizer isso com todas as letras — "não aceitou"
          seria uma afirmação que ninguém pode fazer.
          ============================================================ */}
      <Bloco titulo="Consentimento">
        <Linha
          rotulo="Aceitou"
          valor={
            inscricao.consent === null
              ? 'Não sabemos — cadastro anterior ao registro de consentimento'
              : inscricao.consent
                ? 'Sim'
                : 'Não'
          }
        />
        <Linha
          rotulo="Quando"
          valor={inscricao.consent_at ? formatarDataHora(inscricao.consent_at) : '—'}
        />
        {inscricao.consent_text && (
          <div className="mt-2">
            <p className="font-sans text-[13px] text-muted">Texto aceito, palavra por palavra</p>
            <p className="mt-1 rounded-xl border border-border-soft px-4 py-3 font-sans
                          text-[13px] leading-[20px] text-ink">
              {inscricao.consent_text}
            </p>
          </div>
        )}
      </Bloco>

      {inscricao.status !== 'cancelada' && (
        <div className="mt-8">
          <CancelarInscricao
            inscricaoId={inscricao.id}
            nome={pessoa.nome}
            temAssinatura={Boolean(assinatura?.stripe_subscription_id)}
          />
        </div>
      )}
    </>
  )
}

function Bloco({ titulo, children }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[18px] font-semibold text-ink">{titulo}</h2>
      <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-border-soft bg-white
                      px-5 py-4 shadow-soft">
        {children}
      </div>
    </section>
  )
}

function Linha({ rotulo, valor }) {
  return (
    <p className="font-sans text-[14px] leading-[24px] text-[#345372]">
      {rotulo}: <strong className="font-semibold text-ink">{valor}</strong>
    </p>
  )
}

/** `date` do Postgres: dia de calendário, sem fuso — nada de `new Date()`. */
function formatarData(iso) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/** `timestamptz`: instante absoluto, e aqui o fuso do Brasil é o certo. */
function formatarDataHora(iso) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}
