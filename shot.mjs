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
  const { doc, win } = await pg.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }))
  console.log(`[${prefixo}] ${width}x${height} — scrollWidth ${doc} / innerWidth ${win}${doc > win ? '  ⚠️ OVERFLOW-X' : '  ok'}`)

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
  const ctaModal = pg.locator('main button:has-text("Lista de espera")').first()
  await ctaModal.scrollIntoViewIfNeeded()
  await ctaModal.click()
  await pg.waitForSelector('[role="dialog"]', { state: 'visible' })
  await pg.waitForTimeout(600)
  await pg.screenshot({ path:`design/render_${prefixo}_s09_modal.png`, clip:{ x:0, y:0, width, height } })
  console.log('  →', 's09_modal')
  await pg.keyboard.press('Escape')
  await pg.waitForTimeout(400)

  // rota dedicada — o loop acima só cobre a landing ("/")
  await pg.goto(`${BASE}/conteudo-programatico`, { waitUntil:'networkidle' })
  await pg.waitForTimeout(800)
  await pg.screenshot({ path:`design/render_${prefixo}_conteudo_full.png`, fullPage:true })
  await pg.screenshot({ path:`design/render_${prefixo}_conteudo_fold.png`, clip:{ x:0, y:0, width, height } })
  const syl = await pg.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }))
  console.log(`[${prefixo}] conteudo-programatico — scrollWidth ${syl.doc} / innerWidth ${syl.win}${syl.doc > syl.win ? '  ⚠️ OVERFLOW-X' : '  ok'}`)

  await pg.close()
}

await b.close(); server.kill()
console.log('shot done')
