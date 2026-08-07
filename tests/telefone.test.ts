// ============================================================
// TELEFONE — a regra que roda dos dois lados
//
// Este é o teste de maior retorno do corte, e o motivo está na D7 do
// `REPORT.md`: `src/lib/telefone.ts` é o único módulo do projeto que roda
// no navegador E no servidor, a partir do mesmo arquivo. A modal mascara
// com ele; `/api/inscricao` valida com ele.
//
// O que a D7 protege é concreto: **se a máscara aceitar o que o servidor
// recusa, a pessoa preenche o formulário inteiro e só descobre no fim.**
// É a inscrição perdida na última tela, que é o desfecho que o produto
// não pode ter.
//
// Por isso o bloco central daqui não testa as duas pontas separadamente —
// testa que elas CONCORDAM, com a mesma entrada, para todas as entradas
// que importam. Ver "AS DUAS PONTAS" no fim.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  DDDS_VALIDOS,
  E164_BR_REGEX,
  e164EhValido,
  mascararTelefone,
  paraE164,
  somenteDigitos,
  telefoneEhValido,
} from '@/lib/telefone'

/** Um celular plausível para um DDD: nono dígito 9 + 8 dígitos. */
const celular = (ddd: number | string, resto = '98765432') =>
  `${String(ddd).padStart(2, '0')}9${resto}`

// ------------------------------------------------------------
// DDD — a lista é fechada de propósito, e os buracos são o teste
// ------------------------------------------------------------
describe('DDD', () => {
  it('aceita os 67 DDDs em uso', () => {
    expect(DDDS_VALIDOS.size).toBe(67)
    for (const ddd of DDDS_VALIDOS) {
      expect(telefoneEhValido(celular(ddd)), `DDD ${ddd} deveria valer`).toBe(true)
    }
  })

  // Estes são os buracos do plano de numeração da Anatel. Eles existem
  // porque a lista NÃO é `\d{2}`: um regex "quase certo" aceitaria todos
  // os 100 pares e ninguém notaria até uma aluna não receber o convite do
  // grupo — que é o único uso do campo.
  //
  // A tentação de "simplificar para \d{2}" é real e reaparece a cada
  // leitura do arquivo. Este teste é o que a torna cara.
  const BURACOS = [
    // não existe DDD começando em 0 ou 1 (fora 11–19)
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    20, 23, 25, 26, 29, // RJ/ES pulam estes
    30, 36, 39, // MG
    40, // PR
    50, 52, 56, 57, 58, 59, // RS
    60, // DF/GO
    70, 72, 76, 78, // BA/SE
    80, // PE
    90, // PA
  ]

  it.each(BURACOS)('rejeita o DDD inexistente %i', (ddd) => {
    expect(telefoneEhValido(celular(ddd))).toBe(false)
  })

  // O varrimento completo é o que garante que a lista de buracos acima
  // não esqueceu nenhum: 00 a 99, sem exceção, decidido pela própria
  // fonte. Se alguém acrescentar um DDD ao módulo, este teste acompanha;
  // se alguém trocar a lista por `\d{2}`, ele reprova em 33 casos.
  it('varre 00–99: aceita exatamente os que estão na lista', () => {
    const aceitos: number[] = []
    for (let ddd = 0; ddd <= 99; ddd++) {
      if (telefoneEhValido(celular(ddd))) aceitos.push(ddd)
    }
    expect(aceitos).toEqual([...DDDS_VALIDOS].sort((a, b) => a - b))
    expect(aceitos.length + BURACOS.length).toBe(100)
  })
})

// ------------------------------------------------------------
// NONO DÍGITO — celular, não fixo
// ------------------------------------------------------------
describe('nono dígito', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('rejeita número começando em %i', (d) => {
    expect(telefoneEhValido(`21${d}8765432`.padEnd(11, '0'))).toBe(false)
  })

  it('aceita começando em 9', () => {
    expect(telefoneEhValido('21987654321')).toBe(true)
  })

  // WhatsApp em fixo não existe, e o campo serve para montar o grupo da
  // turma. Um fixo de 10 dígitos é recusado por comprimento, antes mesmo
  // da regra do 9.
  it('rejeita fixo de 10 dígitos', () => {
    expect(telefoneEhValido('2138765432')).toBe(false)
  })
})

// ------------------------------------------------------------
// COMPRIMENTO
// ------------------------------------------------------------
describe('comprimento', () => {
  it.each([
    ['vazio', ''],
    ['só DDD', '21'],
    ['10 dígitos', '2198765432'],
  ])('rejeita %s', (_nome, valor) => {
    expect(telefoneEhValido(valor)).toBe(false)
  })

  // ⚠️ 12 dígitos NÃO são rejeitados — são truncados em 11, e isso é
  // deliberado. Escrevi este teste esperando `false` e ele reprovou; o
  // código estava certo e a expectativa, errada.
  //
  // `somenteDigitos` corta em 11 antes de qualquer checagem, então um
  // 12º dígito nunca chega à validação. Rejeitar seria pior: a máscara
  // já mostra na tela apenas os 11 primeiros, e o campo tem
  // `maxLength={15}` no formato mascarado. Recusar o que a tela exibe
  // como completo é a divergência que a D7 existe para impedir — só que
  // invertida, com o servidor recusando o que a máscara mostrou.
  //
  // O corte é o mesmo dos dois lados porque a função é a mesma.
  it('trunca o 12º dígito em vez de recusar — a tela também o descarta', () => {
    expect(telefoneEhValido('219876543210')).toBe(true)
    expect(mascararTelefone('219876543210')).toBe('(21) 98765-4321')
    expect(paraE164('219876543210')).toBe('+5521987654321')
  })

  it('somenteDigitos corta em 11 — é o que impede um 12º dígito colado', () => {
    expect(somenteDigitos('219876543210')).toBe('21987654321')
    expect(somenteDigitos('(21) 98765-4321')).toBe('21987654321')
    expect(somenteDigitos('+55 21 98765-4321')).toBe('55219876543')
  })
})

// ------------------------------------------------------------
// MÁSCARA — progressiva, e tolerante ao que o input entrega
// ------------------------------------------------------------
describe('máscara', () => {
  it.each([
    ['', ''],
    ['2', '(2'],
    ['21', '(21'],
    ['219', '(21) 9'],
    ['219876', '(21) 9876'],
    ['2198765', '(21) 9876-5'],
    ['2198765432', '(21) 9876-5432'],
    ['21987654321', '(21) 98765-4321'],
  ])('%s → %s', (entrada, esperado) => {
    expect(mascararTelefone(entrada)).toBe(esperado)
  })

  // O valor que chega do input pode já vir mascarado, colado de outro
  // lugar, ou meio apagado. A máscara extrai os dígitos e remonta — é o
  // que impede um parêntese órfão quando se apaga no meio do número.
  it('é idempotente sobre a própria saída', () => {
    const uma = mascararTelefone('21987654321')
    expect(mascararTelefone(uma)).toBe(uma)
  })

  it('remonta a partir de valor colado com formatação alheia', () => {
    expect(mascararTelefone('+55 (21) 98765-4321')).toBe('(55) 21987-6543')
    expect(mascararTelefone('21.98765.4321')).toBe('(21) 98765-4321')
  })

  it('descarta o 12º dígito em vez de deixar a máscara crescer', () => {
    expect(mascararTelefone('219876543219')).toBe('(21) 98765-4321')
  })

  // ⚠️ A MÁSCARA É PERMISSIVA DE PROPÓSITO. Ela formata qualquer coisa,
  // inclusive DDD inexistente e número sem o 9. Ela não é a validação —
  // quem valida é `telefoneEhValido`, e é ele que a modal chama antes de
  // enviar. Uma máscara que recusasse teclas deixaria a pessoa sem
  // entender por que o campo não aceita o que ela está digitando.
  it('formata mesmo o que é inválido — não é ela que barra', () => {
    expect(mascararTelefone('20987654321')).toBe('(20) 98765-4321')
    expect(telefoneEhValido('20987654321')).toBe(false)
  })
})

// ------------------------------------------------------------
// E.164 — o formato que vai para o banco
// ------------------------------------------------------------
describe('E.164', () => {
  it('normaliza a partir do mascarado', () => {
    expect(paraE164('(21) 98765-4321')).toBe('+5521987654321')
  })

  it('devolve null para inválido, em vez de string quebrada', () => {
    expect(paraE164('(20) 98765-4321')).toBeNull()
    expect(paraE164('(21) 88765-4321')).toBeNull()
    expect(paraE164('')).toBeNull()
  })

  it.each([
    ['sem +55', '5521987654321'],
    ['com espaço', '+55 21987654321'],
    ['dígitos a menos', '+552198765432'],
    ['dígitos a mais', '+55219876543210'],
    ['outro país', '+13212345678'],
    ['DDD inexistente', '+5520987654321'],
    ['sem o 9', '+5521887654321'],
  ])('e164EhValido rejeita %s', (_nome, valor) => {
    expect(e164EhValido(valor)).toBe(false)
  })

  it('E164_BR_REGEX sozinha NÃO basta — por isso há a segunda checagem', () => {
    // O regex passa: +55 e 11 dígitos. O DDD 20 não existe.
    expect(E164_BR_REGEX.test('+5520987654321')).toBe(true)
    expect(e164EhValido('+5520987654321')).toBe(false)
  })
})

// ============================================================
// AS DUAS PONTAS — o teste que a D7 pede
//
// A pergunta que importa não é "a máscara funciona?" nem "o servidor
// valida?". É: **existe alguma entrada que a modal deixa passar e o
// servidor recusa?** Se existir, é uma pessoa que preenche oito campos e
// leva "confira os dados informados" sem saber qual.
//
// O caminho real, ponta a ponta:
//
//   modal:    telefoneEhValido(telefone)   ← bloqueia aqui
//             paraE164(telefone)           ← só roda se passou
//   rede:     phone: '+55...'
//   servidor: E164_BR_REGEX + e164EhValido ← revalida do zero
//
// O varrimento abaixo é exaustivo sobre o que distingue um número
// válido de um inválido: os 100 DDDs possíveis × os 10 primeiros dígitos
// possíveis do celular. 1000 entradas, cada uma passando pelas duas
// pontas.
// ============================================================
describe('as duas pontas concordam (D7)', () => {
  it('1000 entradas: o que a modal envia, o servidor aceita — e vice-versa', () => {
    const discordancias: string[] = []

    for (let ddd = 0; ddd <= 99; ddd++) {
      for (let nono = 0; nono <= 9; nono++) {
        const digitado = `${String(ddd).padStart(2, '0')}${nono}8765432`

        // PONTA 1 — o que a modal faz, na ordem em que faz.
        const mascarado = mascararTelefone(digitado)
        const modalDeixaPassar = telefoneEhValido(mascarado)
        const enviado = paraE164(mascarado)

        // PONTA 2 — o que o servidor faz com o que chegou.
        const servidorAceita = enviado !== null && e164EhValido(enviado)

        if (modalDeixaPassar !== servidorAceita) {
          discordancias.push(
            `${mascarado}: modal=${modalDeixaPassar} servidor=${servidorAceita}`,
          )
        }

        // E o corolário que torna a lacuna impossível: quando a modal
        // deixa passar, ela nunca envia `null`. `paraE164` devolvendo
        // null viraria `phone: null` no corpo do POST, que o Zod recusa
        // com a mensagem genérica — exatamente o desfecho que a D7
        // existe para evitar.
        if (modalDeixaPassar && enviado === null) {
          discordancias.push(`${mascarado}: modal aprovou mas paraE164 devolveu null`)
        }
      }
    }

    expect(discordancias).toEqual([])
  })

  it('o número aprovado sobrevive à ida e à volta sem mudar', () => {
    for (const ddd of DDDS_VALIDOS) {
      const mascarado = mascararTelefone(celular(ddd))
      const e164 = paraE164(mascarado)
      expect(e164).toBe(`+55${somenteDigitos(mascarado)}`)
      expect(e164EhValido(e164!)).toBe(true)
      // O que o banco guarda volta a ser o que a tela mostrava.
      expect(mascararTelefone(e164!.slice(3))).toBe(mascarado)
    }
  })
})
