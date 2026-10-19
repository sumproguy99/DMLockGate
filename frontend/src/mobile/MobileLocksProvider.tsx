import type { ReactNode } from 'react'
import { fetchLocks } from '../api/locks'
import { fetchDashboard } from '../api/system'
import { usePolled } from '../lib/usePolled'
import { MOBILE_LOCKS_INTERVAL_MS, MobileLocksContext, type MobileLocks } from './locks-context'

async function loadLocks(signal: AbortSignal): Promise<MobileLocks> {
  const [locks, dashboard] = await Promise.all([fetchLocks(signal), fetchDashboard(signal)])
  return { locks, lastRequests: dashboard.last_requests }
}

/** Loads the locks once for the whole mobile app and keeps them fresh. */
export function MobileLocksProvider({ children }: { children: ReactNode }) {
  const locks = usePolled(loadLocks, MOBILE_LOCKS_INTERVAL_MS)

  return <MobileLocksContext value={locks}>{children}</MobileLocksContext>
}
