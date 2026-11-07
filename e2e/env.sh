# Environment for the isolated end-to-end LockGuard. Process variables override backend/.env, so
# everything below points at a throwaway SQLite file and the fake bridge, never the real database or locks.
E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export APP_ENV=e2e
export APP_DEBUG=true
export APP_URL=http://127.0.0.1:8101
export DB_CONNECTION=sqlite
export DB_DATABASE="$E2E_DIR/.data/e2e.sqlite"
export SESSION_DRIVER=database
export SESSION_DOMAIN=null
export QUEUE_CONNECTION=database
export CACHE_STORE=database
export SANCTUM_STATEFUL_DOMAINS=127.0.0.1:5182
export LOCKGUARD_LOCK_DRIVER=eufy_bridge
export LOCKGUARD_BRIDGE_URL=http://127.0.0.1:8790
export LOCKGUARD_BRIDGE_SECRET=e2e-only-secret-0123456789abcdef0123456789
export LOCKGUARD_CONFIRM_TIMEOUT_SECONDS=8
export LOCKGUARD_CONFIRM_POLL_SECONDS=1
# The existing checks sign in residents and guests on fresh browsers; binding has its own tests.
export LOCKGUARD_DEVICE_BINDING=false
export LOG_CHANNEL=stderr
export LOG_STACK=stderr
