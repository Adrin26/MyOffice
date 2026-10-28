// Real end-to-end run through the UI. Creates a custom agent, checks it survives a reload,
// starts the real CrewAI workflow (uses OpenAI credits) and waits for the findings.
//   node scripts/e2e-real.mjs [baseUrl]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const TOPIC = 'Benefits and risks of a four-day work week for small software teams'
const OUT = fileURLToPath(new URL('../smoke-output/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('THREE.Clock'))) problems.push(`${m.type()}: ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const ready = async () => {
  await page.waitForSelector('.screen-root', { timeout: 30000 })
  await page.waitForTimeout(2500)
}
const labels = () => page.locator('[data-testid="agent-label"]').allInnerTexts().then((t) => t.map((s) => s.replace(/\s+/g, ' ')))

await page.goto(BASE)
await ready()

if (!(await labels()).some((l) => l.startsWith('Quinn'))) {
  log('creating custom agent through the form')
  await page.getByRole('button', { name: 'Add Agent' }).click()
  await page.fill('#f-name', 'Quinn')
  await page.fill('#f-role', 'Fact Checker')
  await page.fill('#f-goal', 'Make sure the final report on {topic} only makes claims a reader could verify.')
  await page.fill('#f-backstory', 'A meticulous editor who flags vague or unsupported statements without inventing new facts.')
  await page.fill('#f-task-name', 'Fact check')
  await page.fill('#f-task-desc', 'Review the final report about {topic}. List the claims that need verification and explain why.')
  await page.fill('#f-task-out', 'A short Markdown bullet list of claims that need verification, each with a one-line reason.')
  await page.getByLabel('Include in future workflow runs').check()
  await page.getByRole('button', { name: 'Create Agent' }).click()
  await page.waitForSelector('text=Created Quinn', { timeout: 10000 })
  log('agent created')
} else log('Quinn already exists; reusing')

await page.reload()
await ready()
const afterReload = await labels()
log('labels after reload:', afterReload.join(' | '))
if (!afterReload.some((l) => l.startsWith('Quinn'))) throw new Error('custom agent missing after reload')
await shot('10-before-run')

log('starting run')
await page.getByRole('button', { name: 'Start', exact: true }).click()
await page.fill('#input-topic', TOPIC)
await page.getByRole('button', { name: 'Start project' }).click()

const seen = new Map()
const deadline = Date.now() + 10 * 60 * 1000
let shots = 0
while (Date.now() < deadline) {
  await page.waitForTimeout(2000)
  const now = await labels()
  for (const l of now) {
    if (!seen.has(l)) {
      seen.set(l, true)
      log('label:', l)
      if (/Working|Thinking|Using a tool/.test(l) && shots < 4) await shot(`11-working-${++shots}`)
    }
  }
  const status = await page.locator('header').first().innerText()
  if (/Completed|Failed|Partial/i.test(status) && !/Running/i.test(status)) {
    log('top bar:', status.replace(/\s+/g, ' ').slice(0, 160))
    break
  }
}

await page.waitForTimeout(6000)
await shot('12-finished')
const screenTitle = await page.locator('.screen-root h1').first().innerText().catch(() => '(none)')
log('screen title:', screenTitle)
const state = await page.evaluate(() => fetch('/api/state').then((r) => r.json()))
log('run:', JSON.stringify({ status: state.current_run?.status, done: state.current_run?.completed_tasks, total: state.current_run?.total_tasks, error: state.current_run?.error_message }))
log('tasks:', state.tasks.map((t) => `${t.position + 1}. ${t.agent_name}: ${t.status}`).join(' | '))
log('console problems:', problems.length ? problems : 'none')
await browser.close()
