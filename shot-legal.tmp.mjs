import { chromium } from 'playwright-core'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'

const PORT = 3111
const BASE = `http://localhost:${PORT}`
const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { stdio: 'ignore' })
for (let i = 0; i < 160; i++) {
  try { if ((await fetch(BASE)).ok) break } catch {}
  await new Promise((r) => setTimeout(r, 500))
}

const mac = os.homedir() + '/Library/Caches/ms-playwright'
let exe
for (const p of [
  mac + '/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  mac + '/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
]) { if (fs.existsSync(p)) { exe = p; break } }

const out = process.argv[2]
const b = await chromium.launch({ executablePath: exe, chromiumSandbox: false, args: ['--no-sandbox', '--disable-gpu'] })

for (const [rota, nome] of [['/termos', 'termos'], ['/privacidade', 'privacidade']]) {
  for (const [w, tag] of [[375, 'mobile375'], [1440, 'desktop']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    const p = await ctx.newPage()
    const erros = []
    p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })
    await p.goto(BASE + rota, { waitUntil: 'networkidle' })

    // rolagem horizontal? (o body nunca pode passar da viewport)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    console.log(`${nome} @${w} :: overflow-x=${overflow} :: erros-console=${erros.length}`)
    if (erros.length) console.log('   ', erros.join(' | '))

    await p.screenshot({ path: `${out}/${nome}-${tag}.png`, fullPage: true })
    await ctx.close()
  }
}

// Footer e consentimento na landing, a 375
const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
const p = await ctx.newPage()
await p.goto(BASE + '/', { waitUntil: 'networkidle' })
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
console.log(`landing @375 :: overflow-x=${overflow}`)
await p.locator('footer').scrollIntoViewIfNeeded()
await p.locator('footer').screenshot({ path: `${out}/footer-mobile375.png` })
await ctx.close()

const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
const p2 = await ctx2.newPage()
await p2.goto(BASE + '/', { waitUntil: 'networkidle' })
await p2.locator('footer').scrollIntoViewIfNeeded()
await p2.locator('footer').screenshot({ path: `${out}/footer-desktop.png` })
await ctx2.close()

await b.close()
server.kill()
process.exit(0)
