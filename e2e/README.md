# End-to-end checks (UI checkpoint 8)

The real web app, API, queue worker and `EufyBridgeDriver`, run against a **fake bridge** and a **throwaway SQLite database** on their own ports. Nothing here touches the real database, the real bridge or a lock.

| Part | Port |
|---|---|
| Web app (Vite, proxying to the E2E API) | 5182 |
| LockGuard API (`php -S`, from `backend/public`) | 8101 |
| Fake bridge (`fake-bridge.mjs`, steered through `POST /control`) | 8790 |

`run.mjs` uses Playwright from the frontend's dev dependencies. Once per machine: `cd frontend && npm install && npx playwright install chromium`.

## Run (Git Bash, from the repository root)

```bash
# 1. Fresh database
source e2e/env.sh && mkdir -p e2e/.data && rm -f e2e/.data/e2e.sqlite && touch e2e/.data/e2e.sqlite
(cd backend && source ../e2e/env.sh && php artisan migrate --seed --force && php ../e2e/seed.php)

# 2. Four processes, each in its own terminal
node e2e/fake-bridge.mjs 8790
(cd backend/public && source ../../e2e/env.sh && php -S 127.0.0.1:8101 ../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php)
(cd backend && source ../e2e/env.sh && php artisan queue:work --tries=1 --sleep=1)
(cd frontend && LOCKGUARD_API_URL=http://127.0.0.1:8101 npx vite --port 5182 --strictPort)

# 3. State, then the checks (75 on 2026-10-19). Screenshots go to e2e/shots/.
(cd backend && source ../e2e/env.sh && php artisan lockguard:sync-locks)
node e2e/run.mjs              # or: node e2e/run.mjs lockSucceeds
```

Users (password `e2e-password-123`): `admin@e2e.test` (super administrator, no lock grant), `resident@e2e.test` (both locks), `guest@e2e.test` (temporary guest, Front Door), `auditor@e2e.test` (read-only auditor).

Fake bridge command modes per lock: `ok`, `slow` (confirms after 4 s), `no_confirm`, `not_sent`, `ambiguous`; and `health: 'down'` for an offline bridge. LockGuard caches bridge health for 15 s.
