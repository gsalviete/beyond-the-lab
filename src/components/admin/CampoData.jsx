'use client'

import { Calendario } from './Icones.jsx'

// ============================================================
// O CAMPO DE DATA DO PAINEL — um só, para os três que existem
//
// ⚠️ OS TRÊS CAMPOS DE DATA DO PAINEL ERAM TRÊS `<input type="date">` CRUS,
// e cada navegador desenhava o seu: o Chrome punha um ícone de calendário
// à direita, o Firefox punha outro, o Safari não punha nenhum. Três telas
// do mesmo painel pareciam de produtos diferentes — e, pior, em dois deles
// só o ícone abria o calendário. O resto do campo, que é 90% da área,
// respondia ao clique com nada.
//
// ⚠️ A ÁREA INTEIRA ABRE O CALENDÁRIO, por dois caminhos que se completam:
//
//   1. `::-webkit-calendar-picker-indicator` é esticado sobre o campo
//      inteiro e deixado invisível. É o caminho do Chrome, do Edge e do
//      Safari — o clique cai no controle nativo, sem JavaScript nosso.
//   2. `showPicker()` no clique, para o Firefox, onde o pseudo-elemento
//      acima não existe.
//
// O `try` no segundo não é zelo: `showPicker` lança se o navegador
// entender que não houve gesto do usuário, e um calendário que não abriu
// não pode derrubar a tela inteira.
//
// ⚠️ A SETA DESENHADA É NOSSA, e é a mesma família de ícone dos campos de
// escolha do painel. Sem `pointer-events-none` ela roubaria o clique do
// pseudo-elemento esticado — e o único pedaço do campo que não abriria o
// calendário seria justamente o ícone que promete abri-lo.
//
// ⚠️ DIGITAR CONTINUA FUNCIONANDO. O campo é o mesmo `<input>` nativo:
// quem prefere teclar 09/2026 tecla, e quem usa leitor de tela recebe o
// controle de data que sempre esteve ali. Isto não é um seletor
// reimplementado — é o nativo, com a área de clique consertada.
//
// ⚠️⚠️ EXCEÇÃO DECLARADA À REGRA "NENHUM NÚMERO VISUAL ESTIMADO" — ver o
// bloco em `app/admin/login/page.jsx`. A altura, o raio e a borda são os
// do `CAMPO` que os formulários do painel já usavam.
// ============================================================

const CAMPO =
  'h-[52px] w-full cursor-pointer rounded-2xl border border-border-soft bg-white px-4 pr-12 ' +
  'font-sans text-[15px] text-ink shadow-soft focus-visible:border-brand ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  // Some a aparência nativa (que muda de navegador para navegador) sem
  // esconder o campo: o valor e a edição por teclado continuam nativos.
  '[&::-webkit-calendar-picker-indicator]:absolute ' +
  '[&::-webkit-calendar-picker-indicator]:inset-0 ' +
  '[&::-webkit-calendar-picker-indicator]:h-full ' +
  '[&::-webkit-calendar-picker-indicator]:w-full ' +
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer ' +
  '[&::-webkit-calendar-picker-indicator]:opacity-0'

export default function CampoData({ id, name, tipo = 'date', required = false, disabled = false }) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={tipo}
        required={required}
        disabled={disabled}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.()
          } catch {
            // Firefox recusa fora de gesto direto; o clique no campo já é
            // um gesto, mas se recusar, o campo continua editável no
            // teclado. Não há nada a fazer nem a avisar.
          }
        }}
        className={CAMPO}
      />
      <Calendario className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  )
}
