import { RefreshCw } from 'lucide-react'
import { useSystemHealth } from '../../app/health-context'
import { IntegrationPanel, SystemHealthPanel } from '../../components/system/HealthPanels'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'

/**
 * Integration diagnostics and the health of each subsystem (project.md 34.6 I), as the backend
 * measured them. Settings are not editable here yet.
 */
export function SystemHealthPage() {
  const health = useSystemHealth()

  return (
    <>
      <PageHeader
        title="System health"
        description="Measured by the backend every time you open or refresh this page. Anything LockGuard cannot measure says so."
        actions={
          <div className="flex items-center gap-3">
            {health.loadedAt && (
              <span className="text-caption text-text-muted">
                Checked <Timestamp iso={health.loadedAt} />
              </span>
            )}
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={health.refresh} loading={health.refreshing}>
              Refresh
            </Button>
          </div>
        }
      />
      {health.error != null && health.data && (
        <Banner tone="warning" title="Showing the last check" className="mb-4">
          The latest check failed: {health.error instanceof Error ? health.error.message : 'something went wrong'}.
        </Banner>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IntegrationPanel health={health.data} failed={health.error != null} />
        {health.data?.subsystems ? (
          <SystemHealthPanel subsystems={health.data.subsystems} />
        ) : (
          health.data && (
            <Card title="System health">
              <p className="text-support text-text-muted">Your account can see the integration status only.</p>
            </Card>
          )
        )}
        <Card title="Settings" className="lg:col-span-2">
          <p className="text-support text-text-muted">
            Settings can't be changed from LockGuard yet. Integration credentials, the remote-unlock policy and other
            options are set in the server's configuration (the backend's .env file), so no secret is ever shown here.
          </p>
        </Card>
      </div>
    </>
  )
}
