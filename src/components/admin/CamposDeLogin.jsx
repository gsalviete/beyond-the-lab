'use client'

import { useRef, useState } from 'react'
import { Olho, OlhoRiscado } from './Icones.jsx'

// ============================================================
// OS CAMPOS DA TELA DE LOGIN — o olhinho e os avisos em português
//
// ⚠️ O `<form>` CONTINUA SENDO HTML DE VERDADE, no Server Component. Este
// componente é só o miolo dele: os dois `<input>` mantêm `name`, `required`
// e `autoComplete`, e o POST para `/api/admin/entrar` acontece igual se
// este bundle nunca hidratar. A regra que o cabeçalho da página fixa — "o
// login precisa funcionar antes de qualquer bundle hidratar" — não
// afrouxa; o que este arquivo acrescenta é enfeite em cima dela.
//
// ⚠️ POR QUE OS AVISOS SÃO NOSSOS E NÃO OS DO NAVEGADOR
//
// O balão nativo do `required` sai no idioma do NAVEGADOR, não no da
// página: quem usa o Chrome em inglês lê "Please fill out this field" numa
// tela inteiramente em português. O `onInvalid` abaixo cancela o balão
// (`preventDefault`) e escreve a frase em português no lugar dele.
//
// Sem JavaScript, o balão nativo volta — em inglês, se for esse o caso,
// mas volta. Degradar para uma mensagem no idioma errado é melhor do que
// degradar para nenhuma validação.
//
// ⚠️ E AS FRASES NÃO DIZEM NADA SOBRE A CONTA. "Digite o seu e-mail" fala
// do campo vazio, não de o e-mail existir ou não — o oráculo de e-mails
// que o `ERROS` da página evita com tanto cuidado não pode entrar por
// aqui.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. As classes daqui são as de lá.
// ============================================================

const CAMPO =
  'h-[52px] w-full rounded-2xl border border-border-soft bg-white px-4 ' +
  'font-sans text-[15px] text-ink placeholder:text-muted shadow-soft ' +
  'focus-visible:border-brand'

/** A frase certa para cada motivo de recusa, em português. */
function mensagemDe(input) {
  const v = input.validity
  if (v.valueMissing) {
    return input.type === 'email' || input.name === 'email'
      ? 'Digite o seu e-mail.'
      : 'Digite a sua senha.'
  }
  if (v.typeMismatch) return 'Este e-mail está incompleto — confira o @ e o que vem depois dele.'
  return 'Confira este campo.'
}

export default function CamposDeLogin() {
  const [erros, setErros] = useState({})
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  // O primeiro campo recusado é o que recebe o foco. O navegador só faz
  // isso sozinho quando o balão nativo aparece — e nós acabamos de
  // cancelá-lo.
  const focadoRef = useRef(false)

  function aoRecusar(event) {
    // Cancela o balão nativo. A mensagem em português entra abaixo do campo.
    event.preventDefault()

    const campo = event.currentTarget
    setErros((atuais) => ({ ...atuais, [campo.name]: mensagemDe(campo) }))

    if (!focadoRef.current) {
      focadoRef.current = true
      campo.focus()
      // O ciclo de validação do submit é síncrono; soltar a trava no fim
      // dele deixa o próximo submit escolher o primeiro campo de novo.
      setTimeout(() => {
        focadoRef.current = false
      }, 0)
    }
  }

  function aoDigitar(event) {
    const { name } = event.currentTarget
    setErros((atuais) => (atuais[name] ? { ...atuais, [name]: null } : atuais))
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="sr-only">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="E-mail"
          aria-invalid={erros.email ? 'true' : undefined}
          aria-describedby={erros.email ? 'erro-email' : undefined}
          onInvalid={aoRecusar}
          onInput={aoDigitar}
          className={CAMPO}
        />
        {erros.email && (
          <p id="erro-email" role="alert" className="px-1 font-sans text-[13px] leading-[20px] text-brand">
            {erros.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="sr-only">
          Senha
        </label>

        <div className="relative">
          {/* `autoComplete="current-password"` faz o gerenciador de senhas do
              navegador oferecer a senha salva — que é o que torna viável
              exigir uma senha longa e única. Sem isso, a pressão é para
              escolher algo digitável, e digitável é adivinhável.

              ⚠️ O `type` alterna, e o gerenciador continua reconhecendo o
              campo: é o `autoComplete` que o identifica, não o `type`. */}
          <input
            id="senha"
            name="senha"
            type={senhaVisivel ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="Senha"
            aria-invalid={erros.senha ? 'true' : undefined}
            aria-describedby={erros.senha ? 'erro-senha' : undefined}
            onInvalid={aoRecusar}
            onInput={aoDigitar}
            className={`${CAMPO} pr-14`}
          />

          {/* ⚠️ MOSTRAR A SENHA É DECISÃO DE QUEM DIGITA, e o padrão é
              escondida. O olhinho existe porque a alternativa real não é
              "senha protegida": é a pessoa errar a senha longa três vezes e
              trocá-la por uma curta.

              `tabIndex={-1}`: quem navega por teclado vai do campo de senha
              direto para "Entrar". O botão continua clicável e continua
              alcançável por leitor de tela pelo `aria-label`. */}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setSenhaVisivel((v) => !v)}
            aria-label={senhaVisivel ? 'Esconder a senha' : 'Mostrar a senha'}
            aria-pressed={senhaVisivel}
            className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center
                       rounded-xl text-muted
                       [transition:color_var(--motion-fast)_var(--ease-out)] hover:text-brand"
          >
            {senhaVisivel ? <OlhoRiscado /> : <Olho />}
          </button>
        </div>

        {erros.senha && (
          <p id="erro-senha" role="alert" className="px-1 font-sans text-[13px] leading-[20px] text-brand">
            {erros.senha}
          </p>
        )}
      </div>
    </>
  )
}
