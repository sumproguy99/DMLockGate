import { createContext, useContext } from 'react'
import type { LockRequest, LockSummary } from '../api/locks'
import type { Polled } from '../lib/usePolled'

/** How often the mobile app reloads the locks. */
export const MOBILE_LOCKS_INTERVAL_MS = 30_000

export type MobileLocks = {
  locks: LockSummary[]
  /** The newest request per lock; null when the user may not see lock history. */
  lastRequests: LockRequest[] | null
}

export const MobileLocksContext = createContext<Polled<MobileLocks> | null>(null)

/** The user's locks, shared by Home, Devices, Notifications and the header so they never disagree. */
export function useMobileLocks(): Polled<MobileLocks> {
  const locks = useContext(MobileLocksContext)
  if (!locks) {
    throw new Error('useMobileLocks must be used inside MobileLocksProvider')
  }
  return locks
}

/** The newest request for one lock: undefined when history is hidden, null when there is none. */
export function lastRequestFor(data: MobileLocks, lockId: number): LockRequest | null | undefined {
  return data.lastRequests === null ? undefined : (data.lastRequests.find((r) => r.lock_id === lockId) ?? null)
}
