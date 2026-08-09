import Link from 'next/link'
import { notFound } from 'next/navigation'
import CancelarInscricao from '@/components/admin/CancelarInscricao.jsx'
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
      <Link href="/admin/alunas" className="font-sans text-[14px] text-muted hover:text-brand">
        ← Alunas
      </Link>

      <h1 className="mt-3 font-display text-[26px] font-semibold leading-[1.2] text-[#022D57] sm:text-[32px]">
        {pessoa.nome}
      </h1>

      <p className="mt-2 font-sans text-[15px] text-[#345372]">
        {ROTULO_STATUS[inscricao.status] ?? inscricao.status}
        {safra ? ` · ${safra.nome}` : ''}
      </p>

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
              <Linha rotulo="Situação no Stripe" valor={assinatura.status_stripe} />
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
