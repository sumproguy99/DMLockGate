// A fake Eufy bridge for end-to-end tests. It speaks the real bridge's HTTP API (integrations/eufy/src/bridge/app.mjs)
// so LockGuard's real EufyBridgeDriver can be exercised, but there is no Eufy account, cloud or lock behind it.
// The test steers it through POST /control. Usage: node fake-bridge.mjs [port]
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 8790)
const now = () => new Date().toISOString()

/** Per lock: reported state, battery, and what the next command does. */
const locks = {
  FAKE0001: { name: 'Front Door', model: 'T85D0', state: 'unlocked', battery: 80, mode: 'ok' },
  FAKE0002: { name: 'Back Door', model: 'T85D0', state: 'locked', battery: 60, mode: 'ok' },
}
/** 'up', or 'down' (every request fails with 503, like a bridge that lost Eufy). */
let health = 'up'
const sent = []

/*
 * Command modes:
 * - ok:          acknowledged, and the lock reports the new state at once.
 * - slow:        acknowledged, and the lock reports the new state 4 s later.
 * - no_confirm:  acknowledged, but the lock never reports a new state (LockGuard ends in unknown_result).
 * - not_sent:    504 rejected not_sent with a detail, as when no broker would carry it.
 * - ambiguous:   502 ambiguous, as when the bridge timed out after publishing.
 */
function command(sn, body) {
  const lock = locks[sn]
  if (!lock) return [404, { result: 'rejected', error: 'unknown_lock' }]
  sent.push({ at: now(), sn, ...body })
  const target = body.action === 'lock' ? 'locked' : 'unlocked'
  switch (lock.mode) {
    case 'not_sent':
      return [504, { result: 'rejected', error: 'not_sent', detail: 'No Eufy command server would accept this lock (192.0.2.1 Subscribe error: Unspecified error; 192.0.2.2 Subscribe error: Unspecified error).', latency_ms: 300 }]
    case 'ambiguous':
      return [502, { result: 'ambiguous', error: 'no acknowledgement within 25000 ms', latency_ms: 25000 }]
    case 'no_confirm':
      return [200, { result: 'acknowledged', device_acked: true, latency_ms: 900 }]
    case 'slow':
      setTimeout(() => (lock.state = target), 4000)
      return [200, { result: 'acknowledged', device_acked: true, latency_ms: 900 }]
    default:
      lock.state = target
      return [200, { result: 'acknowledged', device_acked: true, latency_ms: 900 }]
  }
}

function route(method, path, body) {
  if (path === '/control' && method === 'POST') {
    if (body.health) health = body.health
    for (const [sn, changes] of Object.entries(body.locks ?? {})) Object.assign(locks[sn], changes)
    return [200, { locks, health }]
  }
  if (path === '/control' && method === 'GET') return [200, { locks, health, sent }]
  if (health === 'down') return [503, { result: 'rejected', error: 'eufy_not_connected' }]

  if (method === 'GET' && path === '/v1/health') {
    return [200, {
      status: 'connected', degraded_reason: null, locks: Object.keys(locks).length, last_sync_at: now(), cloud_ok_at: now(),
      cloud_failures: 0, cloud_last_error: null, last_error: null,
      commands: { consecutive_failures: 0, last_failure: null, last_failure_at: null, last_success_at: null },
    }]
  }
  if (method === 'GET' && path === '/v1/locks') {
    return [200, { data: Object.entries(locks).map(([sn, l]) => ({ external_id: sn, name: l.name, model: l.model, firmware_version: '9.9.9' })) }]
  }
  let m = path.match(/^\/v1\/locks\/([^/]+)\/state$/)
  if (method === 'GET' && m) {
    const lock = locks[decodeURIComponent(m[1])]
    return lock ? [200, { data: { state: lock.state, battery_level: lock.battery } }] : [404, { error: 'unknown_lock' }]
  }
  m = path.match(/^\/v1\/locks\/([^/]+)\/commands$/)
  if (method === 'POST' && m) return command(decodeURIComponent(m[1]), body)

  return [404, { error: 'not_found' }]
}

createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const path = new URL(req.url, 'http://x').pathname
    const signed = path.startsWith('/control') || (req.headers['x-lockguard-signature'] ?? req.headers['x-signature'] ?? Object.keys(req.headers).some((h) => h.includes('signature')))
    if (!signed) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ result: 'rejected', error: 'unauthorized' }))
      return
    }
    let body = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { /* empty */ }
    const [status, payload] = route(req.method, path, body)
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload))
  })
}).listen(port, '127.0.0.1', () => console.log(`fake bridge on http://127.0.0.1:${port}`))
