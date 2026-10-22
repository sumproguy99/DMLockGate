// End-to-end checks of the real web app against the real LockGuard API, with the real Eufy bridge driver talking
// to the fake bridge. Isolated: web 5182 -> API 8101 (throwaway SQLite) -> fake bridge 8790. No real lock exists here.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Playwright is a frontend dev dependency (npm install in frontend/, then npx playwright install chromium).
const pw = createRequire(new URL('../frontend/package.json', import.meta.url))('playwright')

const WEB = 'http://127.0.0.1:5182'
const BRIDGE = 'http://127.0.0.1:8790'
const HERE = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/')
const SHOTS = `${HERE}/shots`
mkdirSync(SHOTS, { recursive: true })
const PASSWORD = 'e2e-password-123'
const only = process.argv[2] ?? null

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail })

async function control(body) {
  await fetch(`${BRIDGE}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
async function reset() {
  await control({ health: 'up', locks: { FAKE0001: { state: 'unlocked', mode: 'ok' }, FAKE0002: { state: 'locked', mode: 'ok' } } })
  artisan('lockguard:sync-locks')
}
/** Runs PHP against the E2E database only (env.sh points every setting at it). */
function php(code) {
  return execFileSync('bash', ['-c', `cd "${HERE}/../backend" && source "${HERE}/env.sh" && php artisan tinker --execute '${code}'`], { encoding: 'utf8' })
}
function artisan(command) {
  return execFileSync('bash', ['-c', `cd "${HERE}/../backend" && source "${HERE}/env.sh" && php artisan ${command}`], { encoding: 'utf8' })
}

const browser = await pw.chromium.launch()

async function signedIn(email, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' })
  const page = await context.newPage()
  page.on('pageerror', (e) => check(`no page errors (${email})`, false, String(e).slice(0, 200)))
  await page.goto(WEB)
  await page.locator('input[name=email]').fill(email)
  await page.locator('input[name=password]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState('networkidle')
  return { context, page }
}
const phone = { width: 390, height: 844 }
const desktop = { width: 1440, height: 900 }
const card = (page, name) => page.locator('article').filter({ has: page.getByRole('heading', { name }) })
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const visible = async (locator, timeout = 15000) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false)

const scenarios = {
  async lockSucceeds() {
    await reset()
    await control({ locks: { FAKE0001: { mode: 'slow' } } })
    const { context, page } = await signedIn('resident@e2e.test', phone)
    check('phone opens the mobile app', page.url().endsWith('/m'), page.url())
    const front = card(page, 'Front Door')
    check('Home shows the reported state', await visible(front.getByText('Unlocked', { exact: true })))
    await front.getByRole('button', { name: 'Lock Front Door', exact: true }).click()
    check('shows Locking while the command is on its way', await visible(front.getByText('Locking…')))
    check('says the reported state has not changed yet', await visible(front.getByText('Still unlocked until the lock reports its new state.')))
    check('ends Confirmed once the lock reports', await visible(front.getByText('Confirmed', { exact: true }), 30000))
    check('then shows Locked', await visible(front.getByText('Locked', { exact: true }), 30000))
    await page.screenshot({ path: `${SHOTS}/lock-confirmed.png`, fullPage: true })
    await context.close()
  },

  async unlockNeedsConfirmationAndIdentity() {
    await reset()
    await control({ locks: { FAKE0001: { state: 'locked' } } })
    artisan('lockguard:sync-locks')
    const { context, page } = await signedIn('resident@e2e.test', phone)
    const front = card(page, 'Front Door')
    await front.getByRole('button', { name: 'Unlock Front Door', exact: true }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Unlock Front Door?' })
    check('asks before unlocking', await visible(confirm))
    await confirm.getByRole('button', { name: 'Unlock' }).click()
    // A fresh sign-in may already count as a recent identity check; ask only if the server wants it.
    const stepUp = page.getByRole('dialog', { name: "Confirm it's you" })
    if (await visible(stepUp, 4000)) {
      await stepUp.locator('input[type=password]').fill(PASSWORD)
      await stepUp.getByRole('button', { name: 'Confirm' }).click()
      check('the identity check accepts the password', !(await visible(stepUp.getByText('Could not confirm'), 2000)))
    }
    check('unlock is confirmed by the lock', await visible(front.getByText('Confirmed', { exact: true }), 30000))
    check('then shows Unlocked', await visible(front.getByText('Unlocked', { exact: true }), 30000))
    await context.close()
  },

  async notSentFails() {
    await reset()
    await control({ locks: { FAKE0001: { mode: 'not_sent' } } })
    const { context, page } = await signedIn('resident@e2e.test', phone)
    const front = card(page, 'Front Door')
    await front.getByRole('button', { name: 'Lock Front Door', exact: true }).click()
    check('a command that was not sent ends Failed', await visible(front.getByText('Failed', { exact: true }), 30000))
    await page.reload()
    await page.waitForLoadState('networkidle')
    check('the lock is not marked Disconnected afterwards', !(await visible(card(page, 'Front Door').getByText('Disconnected'), 3000)))
    await page.goto(`${WEB}/m/locks/1`)
    check('the lock screen shows the bridge reason in full', await visible(page.getByText(/192\.0\.2\.2 Subscribe error/)))
    await page.screenshot({ path: `${SHOTS}/not-sent.png`, fullPage: true })
    await context.close()
  },

  async ambiguousIsUnknown() {
    await reset()
    await control({ locks: { FAKE0001: { mode: 'ambiguous' } } })
    const sends = async () => (await (await fetch(`${BRIDGE}/control`)).json()).sent.filter((x) => x.sn === 'FAKE0001').length
    const before = await sends()
    const { context, page } = await signedIn('resident@e2e.test', phone)
    const front = card(page, 'Front Door')
    await front.getByRole('button', { name: 'Lock Front Door', exact: true }).click()
    check('an ambiguous send ends Outcome unknown (or confirmed if the lock reports it)', await visible(front.getByText(/Outcome unknown|Confirmed/), 40000))
    await page.waitForTimeout(3000)
    const posts = (await sends()) - before
    check('nothing was sent twice', posts === 1, `${posts} sends`)
    await context.close()
  },

  async noConfirmationIsUnknown() {
    await reset()
    await control({ locks: { FAKE0001: { mode: 'no_confirm' } } })
    const { context, page } = await signedIn('resident@e2e.test', phone)
    const front = card(page, 'Front Door')
    await front.getByRole('button', { name: 'Lock Front Door', exact: true }).click()
    check('waits for the lock while it has not confirmed', await visible(front.getByText(/Waiting for the lock|Sent|Locking…/)))
    check('ends Outcome unknown when the lock never confirms', await visible(front.getByText('Outcome unknown', { exact: true }), 40000))
    check('still shows the reported state, not the requested one', await visible(front.getByText('Unlocked', { exact: true })))
    await page.screenshot({ path: `${SHOTS}/unknown.png`, fullPage: true })
    await context.close()
  },

  async desktopCommand() {
    await reset()
    let { context, page } = await signedIn('admin@e2e.test', desktop)
    check('a wide screen opens the desktop dashboard', await visible(page.getByRole('heading', { level: 1, name: 'Dashboard' })))
    let back = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Back Door' }) })
    check('an administrator without a grant sees why the controls are off', await visible(back.getByText('You have not been given access to this lock.')))
    check('and the Lock button is disabled', await back.getByRole('button', { name: 'Lock', exact: true }).isDisabled())
    await context.close()

    await control({ locks: { FAKE0002: { state: 'unlocked' } } })
    artisan('lockguard:sync-locks')
    ;({ context, page } = await signedIn('resident@e2e.test', desktop))
    back = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Back Door' }) })
    check('the desktop card shows the synced state', await visible(back.getByText('Unlocked', { exact: true })))
    await back.getByRole('button', { name: 'Lock', exact: true }).click()
    check('the desktop command is confirmed by the lock', await visible(back.getByText('Confirmed', { exact: true }), 30000))
    check('and the desktop card then shows Locked', await visible(back.getByText('Locked', { exact: true }), 30000))
    await page.screenshot({ path: `${SHOTS}/desktop-confirmed.png` })
    await context.close()
  },

  async staleState() {
    await reset()
    php('App\\Models\\Lock::where("external_id", "FAKE0002")->update(["last_state_observed_at" => now()->subHours(2)]);')
    const { context, page } = await signedIn('resident@e2e.test', phone)
    check('an old report reads State stale', await visible(card(page, 'Back Door').getByText('State stale', { exact: true })))
    check('and is listed under Needs attention', await visible(page.getByText('Back Door: state not confirmed')))
    await context.close()
  },

  async bridgeOffline() {
    await reset()
    await control({ health: 'down' })
    // LockGuard caches the bridge's health for 15 s.
    await new Promise((r) => setTimeout(r, 16000))
    const { context, page } = await signedIn('resident@e2e.test', phone)
    check('the header says the bridge is offline', await visible(page.getByRole('banner').getByText(/offline|degraded|unknown/i)))
    const front = card(page, 'Front Door')
    await front.getByRole('button', { name: 'Lock Front Door', exact: true }).click()
    check('a command while offline fails or is refused, never confirmed', await visible(page.getByText(/Failed|not sent|Denied/i), 30000))
    await page.screenshot({ path: `${SHOTS}/offline.png`, fullPage: true })
    await control({ health: 'up' })
    await context.close()
  },

  async guestAccess() {
    await reset()
    const { context, page } = await signedIn('guest@e2e.test', phone)
    const tabs = await page.getByRole('navigation', { name: 'Main' }).getByRole('link').allTextContents()
    check('a guest has no Activity tab', !tabs.includes('Activity'), tabs.join(','))
    check('a guest sees only their lock', (await page.locator('article').count()) === 1)
    check('a guest without remote unlock has no Unlock button', !(await visible(page.getByRole('button', { name: /^Unlock / }), 2000)))
    await page.goto(`${WEB}/m/activity`)
    check('Activity by address is refused', await visible(page.getByRole('heading', { name: 'Not available to you' })))
    const api = await page.request.get(`${WEB}/api/v1/activity`, { headers: { Accept: 'application/json', Origin: WEB, Referer: `${WEB}/` } })
    check('the activity API refuses a guest', api.status() === 403, String(api.status()))
    const users = await page.request.get(`${WEB}/api/v1/users`, { headers: { Accept: 'application/json', Origin: WEB, Referer: `${WEB}/` } })
    check('the users API refuses a guest', users.status() === 403, String(users.status()))
    const history = await page.request.get(`${WEB}/api/v1/locks/2/history`, { headers: { Accept: 'application/json', Origin: WEB, Referer: `${WEB}/` } })
    check("a guest cannot read another lock's history", history.status() === 403 || history.status() === 404, String(history.status()))
    await page.goto(`${WEB}/users`)
    check('the desktop Users page is refused', await visible(page.getByRole('heading', { name: 'Not available to you' })))
    await context.close()
  },

  async auditorAndAdmin() {
    await reset()
    let { context, page } = await signedIn('auditor@e2e.test', desktop)
    await page.goto(`${WEB}/audit`)
    check('an auditor can open the audit log', await visible(page.getByRole('heading', { level: 1, name: 'Audit log' })))
    await page.goto(WEB)
    check('an auditor has no lock buttons', !(await visible(page.getByRole('button', { name: /^Lock/ }), 3000)))
    await context.close()
    ;({ context, page } = await signedIn('admin@e2e.test', desktop))
    for (const [path, title] of [['/', 'Dashboard'], ['/users', 'Users'], ['/locks', 'Locks'], ['/audit', 'Audit log'], ['/system', 'System health']]) {
      await page.goto(`${WEB}${path}`)
      const ok = await visible(page.getByRole('heading', { level: 1, name: title }))
      check(`an administrator opens ${title}`, ok)
      check(`${title} fits 1440 px`, (await overflow(page)) <= 0)
    }
    await page.goto(`${WEB}/audit`)
    check('the audit log records the commands from earlier scenarios', await visible(page.getByText(/Lock command approved|lock\.command/i)))
    await page.screenshot({ path: `${SHOTS}/admin-audit.png` })
    await context.close()
  },

  async responsive() {
    await reset()
    for (const viewport of [{ width: 360, height: 740 }, phone]) {
      const { context, page } = await signedIn('resident@e2e.test', viewport)
      for (const path of ['/m', '/m/locks/1', '/m/activity', '/m/devices', '/m/notifications', '/m/account', '/m/location', '/m/help', '/m/more']) {
        await page.goto(`${WEB}${path}`)
        await page.waitForLoadState('networkidle')
        check(`${path} fits ${viewport.width} px`, (await overflow(page)) <= 0)
      }
      await context.close()
    }
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
      const { context, page } = await signedIn('admin@e2e.test', viewport)
      for (const path of ['/', '/users', '/locks', '/audit']) {
        await page.goto(`${WEB}${path}`)
        await page.waitForLoadState('networkidle')
        check(`${path} fits ${viewport.width} px`, (await overflow(page)) <= 0)
      }
      await context.close()
    }
  },

  async sessionExpiry() {
    await reset()
    const { context, page } = await signedIn('resident@e2e.test', phone)
    php('DB::table("sessions")->where("user_id", App\\Models\\User::where("email", "resident@e2e.test")->value("id"))->delete();')
    await page.getByRole('button', { name: 'Refresh' }).click()
    check('an ended session returns to sign-in with a notice', await visible(page.getByText('Your session ended. Sign in again to continue.')))
    await context.close()
  },
}

for (const [name, run] of Object.entries(scenarios)) {
  if (only && name !== only) continue
  try {
    await run()
  } catch (e) {
    check(`${name} ran without an exception`, false, String(e.message ?? e).split('\n')[0].slice(0, 300))
  }
}
await reset()
await browser.close()

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
