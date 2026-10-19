import { ChevronLeft, MapPin, Radar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DetailRow as Row } from '../components/system/HealthPanels'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Tone } from '../components/ui/tones'

type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'checking'

const permissionLabel: Record<Permission, { tone: Tone; label: string }> = {
  granted: { tone: 'success', label: 'Allowed in this browser' },
  denied: { tone: 'warning', label: 'Blocked in this browser' },
  prompt: { tone: 'unknown', label: 'Not asked yet' },
  unsupported: { tone: 'unknown', label: 'This browser cannot say' },
  checking: { tone: 'unknown', label: 'Checking…' },
}

/** Some browsers (and older iOS Safari) have no Permissions API. */
const canQueryPermissions = () => 'permissions' in navigator && typeof navigator.permissions.query === 'function'

/** The browser's location permission, read without asking for the location itself. */
function useLocationPermission(): Permission {
  const [permission, setPermission] = useState<Permission>(() => (canQueryPermissions() ? 'checking' : 'unsupported'))

  useEffect(() => {
    if (!canQueryPermissions()) {
      return
    }
    let status: PermissionStatus | null = null
    const update = () => status && setPermission(status.state)
    navigator.permissions.query({ name: 'geolocation' }).then(
      (result) => {
        status = result
        update()
        result.addEventListener('change', update)
      },
      () => setPermission('unsupported'),
    )

    return () => status?.removeEventListener('change', update)
  }, [])

  return permission
}

/**
 * Mobile Location and Proximity (project.md 34.8 F). LockGuard does not collect locations or detect
 * when you are near a door yet, so this screen explains that and shows the browser's permission,
 * without ever requesting a location.
 */
export function MobileLocationPage() {
  const permission = useLocationPermission()
  const shown = permissionLabel[permission]

  return (
    <>
      <Link to="/m/more" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        More
      </Link>
      <PageHeader title="Location and proximity" />
      <div className="flex flex-col gap-4">
        <Card title="Status" headingLevel={2}>
          <dl>
            <Row label="Location permission">
              <StatusBadge tone={shown.tone} label={shown.label} />
            </Row>
            <Row label="Last location sent">Never: LockGuard does not collect locations</Row>
            <Row label="Proximity mode">Off</Row>
            <Row label="Geofence">Not available</Row>
            <Row label="Near-door detection">Not available</Row>
          </dl>
        </Card>

        <Card title="Why automatic unlocking is not available" headingLevel={2}>
          <div className="flex flex-col gap-3 text-support text-text-muted">
            <p className="flex gap-2">
              <Radar className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Unlocking as you arrive needs LockGuard to check, reliably and securely, that you are at the door. That has
                not been built or tested yet, so every unlock is something you ask for yourself.
              </span>
            </p>
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Even when it is built, a web app can only see your location while it is open and you allow it. It cannot
                follow your phone after you close the browser or take the permission away.
              </span>
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
