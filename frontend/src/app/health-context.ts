import { createContext, useContext } from 'react'
import type { SystemHealth } from '../api/system'
import type { Polled } from '../lib/usePolled'

/** How often the shell asks the backend for system health. */
export const HEALTH_INTERVAL_MS = 60_000

export const HealthContext = createContext<Polled<SystemHealth> | null>(null)

/** System health, shared by the header indicator and the dashboard so they never disagree. */
export function useSystemHealth(): Polled<SystemHealth> {
  const health = useContext(HealthContext)
  if (!health) {
    throw new Error('useSystemHealth must be used inside HealthProvider')
  }
  return health
}
