// Resolve o alias `@/*` → `src/*` quando um script roda direto no Node,
// fora do Next.
//
// O `tsconfig.json` declara esse alias e o Next o entende; o Node, não —
// para ele `@/lib/supabase` é um pacote npm que não existe. Este arquivo
// é a tradução, e ele existe para que o script de operação possa importar
// os MESMOS módulos que a aplicação usa, em vez de reimplementá-los.
//
// ⚠️ A EXTENSÃO É ADIVINHADA AQUI, e é por isso que este arquivo precisa
// existir em vez de um simples `imports` no package.json. O ESM do Node
// exige caminho com extensão (`./lib/supabase.ts`), enquanto o código da
// aplicação escreve sem — porque o bundler resolve. A lista abaixo é a
// mesma ordem que o TypeScript usa.
//
// ⚠️ ELE NÃO AFROUXA NADA. Alias não é permissão: o `import 'server-only'`
// continua no topo dos módulos, e quem faz esses arquivos rodarem em Node
// é a flag `--conditions=react-server` da linha de comando, não este
// loader. Ver o cabeçalho de `convidar-pendentes.mts`.

import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const EXTENSOES = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs']

function comExtensao(base) {
  if (existsSync(base) && !existsSync(resolve(base, 'index.ts'))) return base

  for (const ext of EXTENSOES) {
    const tentativa = `${base}${ext}`
    if (existsSync(tentativa)) return tentativa
  }

  for (const ext of EXTENSOES) {
    const tentativa = resolve(base, `index${ext}`)
    if (existsSync(tentativa)) return tentativa
  }

  // Devolve o caminho cru: o erro do Node é mais informativo que um
  // lançado daqui, porque ele diz quem estava importando.
  return base
}

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (!especificador.startsWith('@/')) return proximo(especificador, contexto)

    const alvo = comExtensao(resolve(RAIZ_SRC, especificador.slice(2)))
    return proximo(pathToFileURL(alvo).href, contexto)
  },
})
