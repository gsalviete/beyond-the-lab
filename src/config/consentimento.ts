// ============================================================
// TEXTO DO CONSENTIMENTO — fonte única
//
// Este arquivo existe por um motivo probatório, não de organização.
//
// A LGPD (art. 8º, §1º) põe no controlador o ônus de PROVAR que o
// consentimento foi obtido. Provar isso exige saber, para cada linha do
// banco, qual redação a pessoa tinha diante dos olhos quando marcou a
// caixa — e essa redação muda com o tempo. Uma constante duplicada
// entre modal e API é exatamente como esse par se separa em silêncio:
// alguém ajusta o texto exibido, esquece o outro lado, e a partir dali
// todo cadastro grava a prova de um consentimento que ninguém leu.
//
// Por isso a constante mora aqui, num módulo neutro que os dois lados
// importam:
//
//   - `src/components/InscricaoModal.jsx` (client) — EXIBE
//   - `app/api/inscricao/route.ts`        (server) — GRAVA
//
// Não é `src/config/curso.ts` porque aquilo é dado do curso, que varia
// por safra; isto é texto legal, que varia por revisão jurídica. E não é
// `src/lib/supabase.ts` porque aquele módulo é `server-only` e a modal
// não conseguiria importá-lo.
//
// ⚠️ AO ALTERAR A REDAÇÃO: não edite pensando só na tela. Toda linha
// gravada a partir do deploy passa a apontar para o texto novo, e as
// antigas continuam apontando para o antigo — que é justamente o
// comportamento desejado. O que NÃO pode acontecer é o texto exibido
// mudar sem que este arquivo mude junto.
// ============================================================

/**
 * Um pedaço da frase de consentimento. Com `href`, vira link; sem, é
 * texto puro.
 */
export type SegmentoConsentimento = {
  texto: string
  href?: string
}

/**
 * A frase, em pedaços.
 *
 * Ela precisou deixar de ser uma string única quando passou a citar os
 * Termos e a Política: a modal tem que renderizar dois links no meio
 * dela, e o banco tem que gravar a sentença inteira em texto corrido.
 *
 * A saída óbvia — uma string para gravar e um JSX à parte para exibir —
 * é a duplicação que este módulo existe para impedir, só que disfarçada:
 * as duas versões ficariam a um `git blame` de distância uma da outra e
 * divergiriam na primeira revisão de redação.
 *
 * Aqui há uma fonte só. A modal percorre os segmentos e decide o que
 * vira <a>; `CONSENT_TEXT` os concatena. Mudar a frase é mudar este
 * array, e os dois lados acompanham por construção.
 */
export const CONSENT_SEGMENTS: readonly SegmentoConsentimento[] = [
  {
    texto:
      'Concordo em receber e-mails e mensagens sobre as turmas do Beyond The Lab. ' +
      'Li e aceito os ',
  },
  { texto: 'Termos de Uso', href: '/termos' },
  { texto: ' e a ' },
  { texto: 'Política de Privacidade', href: '/privacidade' },
  { texto: '. Posso sair a qualquer momento.' },
]

/**
 * A frase exata ao lado da caixa de consentimento, em texto corrido.
 *
 * O servidor grava esta constante em `waitlist.consent_text` — e não o
 * que o cliente enviar no corpo do POST. Um cliente pode afirmar
 * qualquer coisa; o que tem valor de prova é o texto que o servidor
 * sabe ter servido.
 *
 * Derivada de `CONSENT_SEGMENTS`, nunca escrita à mão: é a mesma frase
 * que a tela mostra, por construção e não por disciplina.
 */
export const CONSENT_TEXT: string = CONSENT_SEGMENTS.map((s) => s.texto).join('')
