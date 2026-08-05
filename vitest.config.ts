// ============================================================
// RUNNER DE TESTES
//
// O projeto passou a existir sem nenhum teste, e isso estava registrado
// como tensão no `REPORT.md` §8.5: as regras de maior consequência —
// o pareamento turma/status, a resposta idêntica na duplicata, a
// validação de DDD — eram verificadas por leitura de código e por render
// de PNG. O `shot.mjs` é excelente no que faz e não faz nada disso.
//
// ⚠️ ESTA CONFIG É DE PROPÓSITO PEQUENA. Ela existe para cobrir três
// coisas, e só elas:
//
//   `src/lib/telefone.ts`      função pura, regra compartilhada
//   `src/config/schemas.ts`    validação — aceita e rejeita o esperado
//   `src/config/consentimento` derivação de `CONSENT_TEXT`
//
// Tudo isso é TypeScript puro rodando em Node. Por isso não há aqui —
// e não deve passar a haver sem que alguém precise de verdade:
//
//   ✗ jsdom / happy-dom      nenhum teste toca o DOM. A modal continua
//                            validada por render (`shot.mjs`), que é o
//                            que o `design/SPEC.md` exige.
//   ✗ @testing-library       idem.
//   ✗ mock de rede (msw…)    nada aqui faz requisição.
//   ✗ arquivo de setup       não há nada global para preparar.
//   ✗ cobertura              número que ninguém lê não é verificação.
//
// A regra: se a config crescer além do necessário para os testes que
// existem, ela virou infraestrutura própria em vez de suporte. Cada
// linha acrescentada aqui deveria ser exigida por um teste concreto que
// já esteja escrito.
// ============================================================
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // Node, nunca browser. É a linha que registra a decisão acima; sem
    // ela o default seria o mesmo, mas a intenção não estaria escrita.
    environment: 'node',
  },
  resolve: {
    // O único item de infraestrutura de verdade: `@/` é o alias do
    // `tsconfig.json`, e os módulos sob teste importam uns aos outros por
    // ele. Sem isto o Vitest não resolve `@/config/dominio`.
    //
    // Uma linha à mão em vez do plugin `vite-tsconfig-paths`: há um alias
    // só, e uma dependência a mais para lê-lo de outro arquivo seria mais
    // peça móvel do que economia.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
