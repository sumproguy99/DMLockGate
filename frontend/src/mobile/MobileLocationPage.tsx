import { ChevronLeft, ChevronRight, MapPin, Radar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchOwnLocationSharing } from '../api/location'
import { Timestamp } from '../components/status/Timestamp'
import { DetailRow as Row } from '../components/system/HealthPanels'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { LoadingState } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { Tone } from '../components/ui/tones'
import { describeShared } from '../lib/location-sharing'
import { useLoaded } from '../lib/useLoaded'

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
 * Mobile Location and Proximity (project.md 34.8 F, 20). Shows the browser's permission (read without
 * asking for a location), what LockGuard records, and every time this person's location was shared.
 */
export function MobileLocationPage() {
  const permission = useLocationPermission()
  const shown = permissionLabel[permission]
  const sharing = useLoaded(fetchOwnLocationSharing, 'mine')
  const shared = sharing.data?.shared ?? []

  return (
    <>
      <Link to="/m/more" className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 px-2 text-label font-semibold text-primary-text">
        <ChevronLeft className="size-4" aria-hidden />
        More
      </Link>
      <PageHeader title="Location and proximity" />
      <div className="flex flex-col gap-4">
        {window.isSecureContext === false && (
          <Banner tone="warning" title="This address cannot share your location">
            Browsers only share location with sites opened over HTTPS. Ask your LockGuard administrator for its HTTPS address.
          </Banner>
        )}
        <Card title="Status" headingLevel={2}>
          <dl>
            <Row label="Location permission">
              <StatusBadge tone={shown.tone} label={shown.label} />
            </Row>
            <Row label="Location sharing">On, as agreed when you signed in</Row>
            <Row label="Last location sent">{shared[0] ? <Timestamp iso={shared[0].at} /> : sharing.data ? 'Never' : '…'}</Row>
            <Row label="Proximity mode">Off</Row>
            <Row label="Geofence">Not available</Row>
            <Row label="Near-door detection">Not available</Row>
          </dl>
        </Card>

        <Card title="What LockGuard records" headingLevel={2}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-support text-text-muted">
            <li>Where your phone is when you press Lock or Unlock in this app, shown on the administrators' location map.</li>
            <li>
              Your current location when an administrator asks for it, sent automatically while LockGuard is open on this
              phone. Nothing is sent while the app is closed or in the background.
            </li>
            <li>
              Each record is deleted after {sharing.data?.retention_days ?? 30} days. If your browser blocks location, nothing
              is sent and LockGuard records that it could not get one.
            </li>
          </ul>
        </Card>

        <Card
          title="When your location was shared"
          headingLevel={2}
          actions={
            <Link to="/m/location/history" className="inline-flex min-h-11 items-center gap-1 text-label font-semibold text-primary-text">
              Timeline
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          }
        >
          {sharing.loading && !sharing.data ? (
            <LoadingState label="Loading…" />
          ) : sharing.error && !sharing.data ? (
            <Banner
              tone="danger"
              title="This list could not be loaded"
              action={
                <Button variant="secondary" size="sm" onClick={sharing.reload}>
                  Try again
                </Button>
              }
            />
          ) : shared.length === 0 ? (
            <EmptyState icon={MapPin} title="Your location has not been shared" />
          ) : (
            <ul className="divide-y divide-border">
              {shared.map((item) => (
                <li key={`${item.kind}-${item.at}`} className="flex flex-col gap-0.5 py-3">
                  <span className="text-support font-medium">{describeShared(item)}</span>
                  <span className="text-caption text-text-muted">
                    <Timestamp iso={item.at} /> · within about {Math.round(item.accuracy_meters)} m
                  </span>
                </li>
              ))}
            </ul>
          )}
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
                A web app can only see your location while it is open and you allow it. It cannot follow your phone after
                you close the browser or take the permission away.
              </span>
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
