import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SystemHealth } from '../../api/system'
import { describeIntegration, describeSubsystem, subsystemLabel } from '../../lib/health'
import { Timestamp } from '../status/Timestamp'
import { Banner } from '../ui/Banner'
import { Card } from '../ui/Card'
import { LoadingState } from '../ui/Spinner'
import { StatusBadge } from '../ui/StatusBadge'

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border py-2 last:border-b-0">
      <dt className="text-support text-text-muted">{label}</dt>
      <dd className="text-support">{children}</dd>
    </div>
  )
}

function MaybeTime({ iso, missing }: { iso: string | null | undefined; missing: string }) {
  return iso ? <Timestamp iso={iso} /> : <span className="text-text-muted">{missing}</span>
}

export function IntegrationPanel({ health, failed }: { health: SystemHealth | null; failed: boolean }) {
  if (!health) {
    return (
      <Card title="Eufy integration">
        {failed ? (
          <Banner tone="unknown" title="Integration status unavailable" live="none">
            LockGuard could not report the integration's health. Lock states below may be out of date.
          </Banner>
        ) : (
          <LoadingState label="Checking the integration…" />
        )}
      </Card>
    )
  }

  const { integration } = health
  const { tone, label, icon, explanation } = describeIntegration(integration.status)
  const details = integration.details

  return (
    <Card title="Eufy integration" description="The bridge between LockGuard and your Eufy account.">
      <div className="mb-3 flex flex-col gap-2">
        <StatusBadge tone={tone} label={label} icon={icon} className="self-start" />
        <p className="text-support text-text-muted">{explanation}</p>
      </div>
      <dl>
        <DetailRow label="Last state sync">
          <MaybeTime iso={integration.last_sync_at} missing="None recorded" />
        </DetailRow>
        <DetailRow label="Checked">
          <Timestamp iso={integration.checked_at} />
        </DetailRow>
        {details && (
          <>
            {details.error && <DetailRow label="Bridge error">{details.error}</DetailRow>}
            {details.degraded_reason && (
              <DetailRow label="Degraded because">
                {details.degraded_reason === 'cloud_silent' ? 'Eufy cloud stopped answering' : 'Repeated Eufy cloud errors'}
              </DetailRow>
            )}
            {details.cloud_ok_at !== undefined && (
              <DetailRow label="Eufy cloud last answered">
                <MaybeTime iso={details.cloud_ok_at} missing="Not yet" />
              </DetailRow>
            )}
            {details.cloud_failures != null && <DetailRow label="Cloud failures in a row">{details.cloud_failures}</DetailRow>}
            {details.cloud_last_error && <DetailRow label="Last cloud error">{details.cloud_last_error}</DetailRow>}
            {details.last_error && <DetailRow label="Last bridge error">{details.last_error}</DetailRow>}
            {details.locks_visible != null && <DetailRow label="Locks the bridge can see">{details.locks_visible}</DetailRow>}
          </>
        )}
      </dl>
    </Card>
  )
}

export function SystemHealthPanel({ subsystems }: { subsystems: NonNullable<SystemHealth['subsystems']> }) {
  return (
    <Card title="System health" description="Measured by the backend. Parts that are not built yet say so.">
      <ul className="divide-y divide-border">
        {subsystems.map((subsystem) => {
          const { tone, label } = describeSubsystem(subsystem.status)
          return (
            <li key={subsystem.key} className="flex flex-col gap-1 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-support font-medium">{subsystemLabel[subsystem.key] ?? subsystem.key}</span>
                <StatusBadge tone={tone} label={label} icon={subsystem.status === 'ok' ? ShieldCheck : undefined} />
              </div>
              <p className="text-caption text-text-muted">{subsystem.summary}</p>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
