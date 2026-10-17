import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { describeCommandStatus, describeLockState, type AccessRequestStatus } from '../../lib/lockguard'
import { expectNoAxeViolations } from '../../test/axe'
import { ActivityEntry } from './ActivityEntry'
import { CommandProgress } from './CommandProgress'
import { BatteryBadge, DeviceStatus } from './DeviceStatus'
import { LockStateBadge, LockStatusDisplay } from './LockStatus'
import { SecurityAlert } from './SecurityAlert'

const now = new Date('2026-10-17T12:00:00Z')

describe('describeLockState', () => {
  it('shows current reports in their own tone', () => {
    expect(describeLockState('locked', 'current')).toMatchObject({ tone: 'success', label: 'Locked' })
    expect(describeLockState('unlocked', 'current')).toMatchObject({ tone: 'warning', label: 'Unlocked' })
    expect(describeLockState('jammed', 'current')).toMatchObject({ tone: 'danger', label: 'Jammed' })
  })

  it('grays out a stale report and says it is stale', () => {
    expect(describeLockState('locked', 'stale')).toMatchObject({ tone: 'unknown', label: 'Locked (stale)' })
  })

  it('never claims a state it does not know', () => {
    expect(describeLockState('unknown', 'current')).toMatchObject({ tone: 'unknown', label: 'Unknown' })
    expect(describeLockState('locked', 'unknown')).toMatchObject({ tone: 'unknown', label: 'Unknown' })
  })
})

describe('describeCommandStatus', () => {
  it.each<[AccessRequestStatus, boolean, string, string | null, boolean]>([
    ['received', false, 'Checking request', 'received', true],
    ['authenticating', false, 'Checking request', 'received', true],
    ['authorized', false, 'Approved, sending', 'authorized', true],
    ['queued', false, 'Approved, sending', 'authorized', true],
    ['submitted', false, 'Sent', 'submitted', true],
    ['submitted', true, 'Waiting for the lock', 'integration_response', true],
    ['confirmed_success', true, 'Confirmed', 'confirmed', false],
    ['already_in_state', false, 'Already in that state', null, false],
    ['denied', false, 'Denied', 'failed', false],
    ['failed', false, 'Failed', 'failed', false],
    ['unknown_result', true, 'Outcome unknown', 'failed', false],
    ['expired', false, 'Expired, not sent', null, false],
    ['cancelled', false, 'Cancelled, not sent', null, false],
  ])('%s (integration responded: %s) is "%s"', (status, responded, label, stage, pending) => {
    expect(describeCommandStatus(status, responded)).toMatchObject({ label, stage, pending })
  })

  it('only calls a confirmed command a success, never a submitted one', () => {
    expect(describeCommandStatus('submitted', true).tone).toBe('info')
    expect(describeCommandStatus('confirmed_success').tone).toBe('success')
  })
})

describe('LockStatusDisplay', () => {
  it('says when the lock reported its state', async () => {
    const { container } = render(
      <LockStatusDisplay state="locked" freshness="current" observedAt="2026-10-17T11:58:00Z" now={now} />,
    )

    expect(screen.getByText('Locked')).toBeInTheDocument()
    expect(container).toHaveTextContent('Reported by the lock 2 minutes ago')
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-10-17T11:58:00Z')
    await expectNoAxeViolations(container)
  })

  it('warns that a stale report may be out of date', () => {
    const { container } = render(
      <LockStatusDisplay state="unlocked" freshness="stale" observedAt="2026-10-17T09:00:00Z" now={now} />,
    )

    expect(screen.getByText('Unlocked (stale)')).toBeInTheDocument()
    expect(container).toHaveTextContent('Last report 3 hours ago. It may have changed since.')
  })

  it('says there is no reliable report when none exists', () => {
    render(<LockStatusDisplay state="unknown" freshness="unknown" observedAt={null} now={now} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('No reliable report from the lock.')).toBeInTheDocument()
  })

  it('renders the compact badge with the same words', () => {
    render(<LockStateBadge state="jammed" freshness="current" />)

    expect(screen.getByText('Jammed')).toBeInTheDocument()
  })
})

describe('CommandProgress', () => {
  it('marks the current step and announces the status', async () => {
    const { container } = render(
      <CommandProgress
        status="submitted"
        integrationResponded
        message="Sent. Waiting for the lock to report its new state."
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the lock')
    const current = container.querySelector('[aria-current="step"]')
    expect(current).toHaveTextContent('Integration response received')
    expect(screen.getByText('Physical state confirmed').parentElement).toHaveTextContent('(not yet)')
    expect(screen.getByText('Command submitted').parentElement).toHaveTextContent('(done)')
    await expectNoAxeViolations(container)
  })

  it('completes every step only when the lock confirmed', () => {
    const { container } = render(<CommandProgress status="confirmed_success" message="Confirmed by the lock." />)

    expect(container.querySelector('[aria-current="step"]')).toBeNull()
    expect(screen.getAllByText('(done)')).toHaveLength(5)
  })

  it('shows no steps when nothing was sent', () => {
    render(<CommandProgress status="expired" message="The request expired before it could be sent." />)

    expect(screen.getByRole('status')).toHaveTextContent('Expired, not sent')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('keeps an unknown outcome distinct from a failure', () => {
    render(<CommandProgress status="unknown_result" message="The lock did not confirm in time." />)

    expect(screen.getByRole('status')).toHaveTextContent('Outcome unknown')
    expect(screen.getByRole('status')).not.toHaveTextContent('Failed')
  })
})

describe('device, activity and alert entries', () => {
  it('shows connection, battery and last contact', async () => {
    const { container } = render(
      <DeviceStatus connection="degraded" batteryLevel={22} lastCommunicationAt="2026-10-17T11:59:30Z" now={now} />,
    )

    expect(container).toHaveTextContent('Degraded')
    expect(container).toHaveTextContent('Battery 22%')
    expect(container).toHaveTextContent('Last contact 30 seconds ago')
    await expectNoAxeViolations(container)
  })

  it('says when the battery level is not known', () => {
    render(<BatteryBadge level={null} />)

    expect(screen.getByText('Battery unknown')).toBeInTheDocument()
  })

  it('renders activity entries and security alerts with their time and severity in words', async () => {
    const { container } = render(
      <main>
        <h1>Activity</h1>
        <ul>
          <ActivityEntry tone="success" title="Front Door locked" actor="Dustin" at="2026-10-17T11:55:00Z" now={now} />
        </ul>
        <SecurityAlert severity="critical" title="Lock jammed" description="Back Door reported a jam." at="2026-10-17T11:00:00Z" now={now} />
      </main>,
    )

    expect(screen.getByRole('listitem')).toHaveTextContent('Front Door locked · Dustin5 minutes ago')
    expect(screen.getByRole('article')).toHaveTextContent('Critical')
    expect(screen.getByRole('heading', { name: 'Lock jammed' })).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})
