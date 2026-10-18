import { ShieldQuestionMark } from 'lucide-react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { describeIntegration } from '../lib/health'
import { useSystemHealth } from './health-context'

/**
 * The header's Eufy integration status, as the backend measured it. While the first check runs, or
 * when the check itself fails, it says so instead of showing a guess.
 */
export function IntegrationIndicator() {
  const { data, error, loading } = useSystemHealth()

  if (loading && !data) {
    return <StatusBadge tone="unknown" label="Checking Eufy…" icon={ShieldQuestionMark} />
  }
  if (!data || error) {
    return <StatusBadge tone="unknown" label="Eufy status unavailable" icon={ShieldQuestionMark} />
  }

  const { tone, label, icon } = describeIntegration(data.integration.status, data.integration.degraded_reason)
  return <StatusBadge tone={tone} label={label} icon={icon} />
}
