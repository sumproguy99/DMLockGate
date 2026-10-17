import type { ActivityItem, AuditOutcome } from '../api/system'
import type { Tone } from '../components/ui/tones'
import { describeCommandStatus } from './lockguard'

/** Audit actions in plain words, by outcome where the outcome changes the meaning. */
const auditTitles: Record<string, Partial<Record<AuditOutcome, string>> & { default: string }> = {
  'auth.login': { default: 'Signed in', failure: 'Sign-in failed', denied: 'Sign-in refused', info: 'Password accepted, code requested' },
  'auth.logout': { default: 'Signed out' },
  'auth.mfa_verify': { default: 'Two-step code accepted', failure: 'Two-step code rejected', denied: 'Two-step code refused' },
  'auth.mfa_recovery_code_used': { default: 'Recovery code used' },
  'auth.mfa_enrollment_started': { default: 'Two-step verification setup started' },
  'auth.mfa_enabled': { default: 'Two-step verification turned on' },
  'auth.mfa_disabled': { default: 'Two-step verification turned off' },
  'auth.step_up': { default: 'Identity confirmed', failure: 'Identity confirmation failed' },
  'lock.command_authorized': { default: 'Lock command approved' },
  'lock.command_denied': { default: 'Lock command denied' },
  'lock.registered': { default: 'Lock registered' },
  'lock.updated': { default: 'Lock settings changed' },
  'lock.access_granted': { default: 'Lock access granted' },
  'lock.access_revoked': { default: 'Lock access removed' },
  'property.created': { default: 'Property added' },
  'user.created': { default: 'User created' },
  'user.updated': { default: 'User details changed' },
  'user.roles_changed': { default: 'Roles changed' },
  'user.permissions_changed': { default: 'Permissions changed' },
  'user.suspended': { default: 'User suspended' },
  'user.reactivated': { default: 'User reactivated' },
  'user.revoked': { default: 'User revoked' },
}

const outcomeTone: Record<AuditOutcome, Tone> = {
  success: 'success',
  failure: 'danger',
  denied: 'warning',
  info: 'info',
}

/** "user.roles_changed" → "User roles changed", for actions this screen has no wording for yet. */
function humanize(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * How one activity item reads. Lock requests are named by their real stage (denied, sent,
 * confirmed, outcome unknown), never by what was asked for alone.
 */
export function describeActivity(item: ActivityItem): { tone: Tone; title: string; detail: string | null } {
  if (item.kind === 'request' && item.request) {
    const { tone, label } = describeCommandStatus(item.request.status, item.request.integration_responded)
    const verb = item.request.action === 'lock' ? 'Lock' : 'Unlock'
    return {
      tone,
      title: `${verb} request: ${label}`,
      detail: [item.lock, item.detail].filter(Boolean).join(' · ') || null,
    }
  }

  const titles = auditTitles[item.action]
  return {
    tone: outcomeTone[item.outcome] ?? 'unknown',
    title: titles ? (titles[item.outcome] ?? titles.default) : humanize(item.action),
    detail: [item.lock, item.detail].filter(Boolean).join(' · ') || null,
  }
}
