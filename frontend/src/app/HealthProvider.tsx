import type { ReactNode } from 'react'
import { fetchSystemHealth } from '../api/system'
import { usePolled } from '../lib/usePolled'
import { HEALTH_INTERVAL_MS, HealthContext } from './health-context'

export function HealthProvider({ children }: { children: ReactNode }) {
  const health = usePolled(fetchSystemHealth, HEALTH_INTERVAL_MS)

  return <HealthContext value={health}>{children}</HealthContext>
}
