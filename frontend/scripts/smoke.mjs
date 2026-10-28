// Browser smoke test for the running app (backend on :8000, Vite on :5173).
// Uses the locally installed Microsoft Edge in headless mode with software WebGL.
//   node scripts/smoke.mjs [baseUrl]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const OUT = fileURLToPath(new URL('../smoke-output/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) })

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

const results = {}
const check = async (name, fn) => {
  try {
    results[name] = (await fn()) ?? 'ok'
  } catch (e) {
    results[name] = `FAILED: ${e.message.split('\n')[0]}`
  }
}

await page.goto(BASE)
await check('office renders', async () => {
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => (document.querySelector('canvas')?.width ?? 0) > 300, null, { timeout: 20000 })
  await page.waitForSelector('.screen-root', { timeout: 20000 })
  await page.waitForTimeout(3500)
  await shot(page, '01-overview')
})

await check('agent labels', async () => {
  const labels = await page.locator('div.select-none').allInnerTexts()
  if (labels.length < 3) throw new Error(`only ${labels.length} agent labels visible`)
  return labels.map((t) => t.replace(/\s+/g, ' ')).join(' | ')
})

await check('click avatar selects agent', async () => {
  const label = page.locator('div.select-none', { hasText: 'Business Analyst' }).first()
  const box = await label.boundingBox({ timeout: 5000 })
  if (!box) throw new Error('label not found')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 45)
  await page.waitForSelector('[data-testid="agent-details"]', { timeout: 5000 })
  const text = await page.locator('[data-testid="agent-details"]').innerText()
  if (!text.includes('Business Analyst')) throw new Error(`details show: ${text.slice(0, 80)}`)
  await page.waitForTimeout(2500)
  await shot(page, '02-selected-focus')
})

await check('top-down camera', async () => {
  await page.getByRole('button', { name: 'Top-down camera' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '03-top-down')
})

await check('orbit and zoom', async () => {
  await page.getByRole('button', { name: 'Overview camera' }).click()
  await page.waitForTimeout(2500)
  const c = await page.locator('canvas').boundingBox()
  const cx = c.x + c.width * 0.75
  const cy = c.y + c.height * 0.8
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 220, cy - 30, { steps: 12 })
  await page.mouse.up()
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(1200)
  await shot(page, '04-orbit-zoom')
})

await check('presentation of latest results', async () => {
  const btn = page.getByRole('button', { name: 'Show findings' }).first()
  if (!(await btn.count())) return 'skipped (no completed run yet)'
  await btn.click()
  await page.waitForSelector('.screen-root h1', { timeout: 10000 })
  await page.waitForTimeout(3000)
  await shot(page, '05-presentation')
})

await browser.close()
console.log(JSON.stringify({ results, consoleProblems: problems }, null, 2))
process.exit(Object.values(results).some((r) => String(r).startsWith('FAILED')) ? 1 : 0)
