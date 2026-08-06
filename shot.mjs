import { chromium } from 'playwright-core'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'

// Antes o script subia um dev server do Vite em processo. O Next não expõe
// equivalente, então roda como processo filho na porta 3000.
const PORT = 3000
const BASE = `http://localhost:${PORT}`
const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { stdio: 'ignore' })
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(BASE)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

const shellDir='/sessions/trusting-upbeat-faraday/.cache/ms-playwright/chromium_headless_shell-1228'
const mac=os.homedir()+'/Library/Caches/ms-playwright'
let exe
for (const p of [
  shellDir+'/chrome-linux/headless_shell',
  '/sessions/trusting-upbeat-faraday/.cache/ms-playwright/chromium-1228/chrome-linux/chrome',
  mac+'/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  mac+'/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
  if (fs.existsSync(p)) { exe=p; break }
}
console.log('exe', exe)

// nomes por slice, na ordem em que App.jsx renderiza dentro de <main>
// (a antiga 's06b_waitlist' saiu: o formulário virou modal e não é mais seção)
const nomes = ['hero','s01_painpoints','s02_personas','s03_skills','s04_timeline','s05_teacher','s06_pricing','s07_faq','s08_finalcta']

// Dois alvos por execução, mesmas flags nos dois: deviceScaleFactor 1 e
// reducedMotion reduce — o scroll-reveal precisa estar assentado no print.
const alvos = [
  { prefixo: 'desktop', width: 1440, height: 1024 },
  { prefixo: 'mobile',  width: 390,  height: 844  },
]

const b = await chromium.launch({ executablePath: exe, chromiumSandbox:false, args:['--no-sandbox','--disable-gpu'] })

for (const { prefixo, width, height } of alvos) {
  const pg = await b.newPage({ viewport:{ width, height }, deviceScaleFactor:1 })

  await pg.emulateMedia({ reducedMotion: 'reduce' })
  await pg.goto(BASE, { waitUntil:'networkidle' })
  await pg.waitForTimeout(1500)

  await pg.screenshot({ path:`design/render_${prefixo}_full.png`, fullPage:true })
  await pg.screenshot({ path:`design/render_${prefixo}_fold.png`, clip:{ x:0, y:0, width, height } })

  // Scroll horizontal é bug de layout, não detalhe visual: medir sempre,
  // em vez de depender de alguém reparar na barra do print.
  //
  // Antes isto comparava `scrollWidth` com `innerWidth`, e essa medida mente
  // nas duas direções. `getBoundingClientRect` ignora recorte, então qualquer
  // decorativo já cortado por um ancestral com overflow-hidden aparecia como
  // vazamento (falso positivo); e um `overflow-x: clip` que não segura de fato
  // pode zerar a diferença sem impedir a rolagem (falso negativo). O que
  // interessa é a única coisa que o usuário sente: dá para arrastar a página
  // para o lado? Empurrar o scroll para o extremo e ler onde ele parou
  // responde isso direto.
  const rolagem = await pg.evaluate(() => {
    const antes = window.scrollX
    window.scrollTo(99999, window.scrollY)
    const max = window.scrollX
    window.scrollTo(antes, window.scrollY)
    return { max, doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }
  })
  console.log(
    `[${prefixo}] ${width}x${height} — rolagem-x ${rolagem.max}px ` +
      `(scrollWidth ${rolagem.doc} / clientWidth ${rolagem.win})` +
      `${rolagem.max > 0 ? '  ⚠️ OVERFLOW-X' : '  ok'}`,
  )

  const secoes = await pg.$$('main > *')
  for (let i = 0; i < secoes.length; i++) {
    const nome = nomes[i] || `sec${i}`
    await secoes[i].scrollIntoViewIfNeeded()
    await secoes[i].screenshot({ path:`design/render_${prefixo}_${nome}.png` })
    console.log('  →', nome)
  }

  // MODAL DE INSCRIÇÃO
  // Vive num portal no <body>, fora de <main>, então o loop de seções
  // acima não a alcança — precisa de captura própria. `clip` na viewport
  // e não `fullPage`: o overlay é `position: fixed` e num print de página
  // inteira sairia esticado ou repetido.
  // O fluxo virou duas etapas: "Lista de espera" agora é uma âncora que rola
  // até o card de compra, e quem abre a modal é o "Garantir minha vaga" de
  // dentro dele. Antes daqui saía um clique em `button:has-text("Lista de
  // espera")`, que não casa mais com nada — os CTAs são <a href="#planos">.
  const ctaModal = pg.locator('#planos button:has-text("Garantir minha vaga")')
  await ctaModal.scrollIntoViewIfNeeded()
  await ctaModal.click()
  await pg.waitForSelector('[role="dialog"]', { state: 'visible' })
  // A modal abre em estado de carregamento e só decide o que mostrar depois
  // de perguntar a `/api/safra-ativa` qual é a safra e se ela está aberta. Esperar no relógio
  // fotografava o spinner — em dev a primeira chamada ainda paga a compilação
  // da rota. `aria-busy="false"` é a condição de verdade, e é o mesmo atributo
  // que o leitor de tela usa.
  await pg.waitForSelector('[role="dialog"][aria-busy="false"]', { state: 'visible' })
  await pg.waitForTimeout(400)
  await pg.screenshot({ path:`design/render_${prefixo}_s09_modal.png`, clip:{ x:0, y:0, width, height } })
  console.log('  →', 's09_modal')
  await pg.keyboard.press('Escape')
  await pg.waitForTimeout(400)

  // rota dedicada — o loop acima só cobre a landing ("/")
  await pg.goto(`${BASE}/conteudo-programatico`, { waitUntil:'networkidle' })
  await pg.waitForTimeout(800)
  await pg.screenshot({ path:`design/render_${prefixo}_conteudo_full.png`, fullPage:true })
  await pg.screenshot({ path:`design/render_${prefixo}_conteudo_fold.png`, clip:{ x:0, y:0, width, height } })
  const syl = await pg.evaluate(() => {
    const antes = window.scrollX
    window.scrollTo(99999, window.scrollY)
    const max = window.scrollX
    window.scrollTo(antes, window.scrollY)
    return { max, doc: document.documentElement.scrollWidth, win: document.documentElement.clientWidth }
  })
  console.log(
    `[${prefixo}] conteudo-programatico — rolagem-x ${syl.max}px ` +
      `(scrollWidth ${syl.doc} / clientWidth ${syl.win})${syl.max > 0 ? '  ⚠️ OVERFLOW-X' : '  ok'}`,
  )

  await pg.close()
}

await b.close(); server.kill()
console.log('shot done')
