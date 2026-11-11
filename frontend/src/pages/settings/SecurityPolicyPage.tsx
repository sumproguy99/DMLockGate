import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { getSecurityPolicy, saveSecurityPolicy, type SecurityPolicy, type SecurityPolicyRole } from '../../api/settings'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { useAuth, useCurrentUser } from '../../auth/auth-context'
import { Timestamp } from '../../components/status/Timestamp'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CheckboxField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { LoadingState } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'

/** The roles that can manage people, settings or security; leaving all of them out is worth a warning. */
const ADMIN_ROLES = ['super_administrator', 'security_administrator']

/**
 * Security policy (admin.security_policies): which roles must use two-step sign-in. Members of a
 * required role who have no authenticator must set one up before they can do anything else.
 */
export function SecurityPolicyPage() {
  const policy = useLoaded(getSecurityPolicy, 'security-policy')

  return (
    <>
      <PageHeader
        title="Security policy"
        description="Choose which roles must sign in with a code from an authenticator app as well as a password."
      />
      {policy.data ? (
        <PolicyForm key={policy.data.updated_at ?? 'new'} policy={policy.data} onSaved={policy.reload} />
      ) : policy.error != null ? (
        <Banner
          tone="danger"
          title="The security policy could not be loaded"
          action={
            <Button variant="secondary" size="sm" onClick={policy.reload}>
              Try again
            </Button>
          }
        >
          {policy.error instanceof ApiError ? policy.error.message : null}
        </Banner>
      ) : (
        <LoadingState label="Loading the security policy…" />
      )}
    </>
  )
}

function memberHint(role: SecurityPolicyRole): string {
  if (role.members === 0) {
    return 'Nobody has this role.'
  }
  const members = role.members === 1 ? '1 person has this role' : `${role.members} people have this role`
  if (role.members_without_mfa === 0) {
    return `${members}, all with two-step sign-in.`
  }
  const without = role.members_without_mfa
  return `${members}; ${without} of them ${without === 1 ? 'has' : 'have'} not set up two-step sign-in.`
}

function PolicyForm({ policy, onSaved }: { policy: SecurityPolicy; onSaved: () => void }) {
  const user = useCurrentUser()
  const { reloadUser } = useAuth()
  const toast = useToast()
  const withStepUp = useStepUp()
  const [required, setRequired] = useState<string[]>(policy.mfa_required_roles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const owing = policy.roles
    .filter((role) => required.includes(role.key) && !policy.mfa_required_roles.includes(role.key))
    .reduce((sum, role) => sum + role.members_without_mfa, 0)
  const noAdminRole = !ADMIN_ROLES.some((key) => required.includes(key))
  const affectsMe = !user.mfa_enabled && user.roles.some((role) => required.includes(role.key))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await withStepUp('change the security policy', () => saveSecurityPolicy({ mfa_required_roles: required }))
      toast({ tone: 'success', title: 'Security policy saved' })
      if (affectsMe) {
        // The server now asks this user to set up two-step sign-in; the setup screen takes over.
        await reloadUser()
        return
      }
      onSaved()
    } catch (caught) {
      setBusy(false)
      if (!(caught instanceof StepUpCancelled)) {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
      }
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {error && (
        <Banner tone="danger" title="Could not save">
          {error}
        </Banner>
      )}

      <Card
        title="Two-step sign-in required for"
        description={
          policy.updated_at ? (
            <>
              Last changed <Timestamp iso={policy.updated_at} />
              {policy.updated_by ? ` by ${policy.updated_by}` : ''}.
            </>
          ) : (
            "Using the server's default: Super Administrator and Security Administrator."
          )
        }
      >
        <div className="flex flex-col gap-1">
          {policy.roles.map((role) => (
            <CheckboxField
              key={role.key}
              label={role.name}
              hint={memberHint(role)}
              checked={required.includes(role.key)}
              onChange={(event) =>
                setRequired((current) => (event.target.checked ? [...current, role.key] : current.filter((key) => key !== role.key)))
              }
            />
          ))}
        </div>
        <p className="mt-4 text-caption text-text-muted">
          People in a required role who have no authenticator app are asked to set one up the next time they use LockGuard, and can do
          nothing else until they have. Nobody in a required role can remove their authenticator app.
        </p>
      </Card>

      {noAdminRole && (
        <Banner tone="warning" title="Administrators would not need two-step sign-in" live="none">
          Anyone who learns an administrator&apos;s password could then change people&apos;s access and unlock doors.
        </Banner>
      )}
      {owing > 0 && (
        <Banner tone="info" title="Some people will be asked to set it up" live="none">
          {owing === 1 ? '1 person' : `${owing} people`} in the roles you added {owing === 1 ? 'has' : 'have'} no authenticator app
          yet. Their next request will ask them to set one up.
        </Banner>
      )}
      {affectsMe && (
        <Banner tone="info" title="This includes you" live="none">
          You have no authenticator app yet, so after saving you will be asked to set one up before you carry on.
        </Banner>
      )}

      <div>
        <Button type="submit" icon={Save} loading={busy}>
          Save security policy
        </Button>
      </div>
    </form>
  )
}
