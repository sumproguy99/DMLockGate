import { Building2, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { createProperty, fetchProperties, type Property } from '../../api/locks'
import { StepUpCancelled, useStepUp } from '../../app/step-up-context'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/EmptyState'
import { TextField } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/toast-context'
import { useLoaded } from '../../lib/useLoaded'

const columns: Column<Property>[] = [
  { key: 'name', header: 'Property', cell: (p) => <span className="font-medium">{p.name}</span> },
  { key: 'address', header: 'Address', cell: (p) => p.address ?? <span className="text-text-muted">Not set</span>, className: 'hidden md:table-cell' },
  { key: 'timezone', header: 'Time zone', cell: (p) => p.timezone, className: 'hidden lg:table-cell' },
  {
    key: 'locks',
    header: 'Locks',
    align: 'right',
    cell: (p) => (p.locks_count > 0 ? <Link to="/locks" className="text-primary-text hover:underline">{p.locks_count}</Link> : '0'),
  },
]

/** The places LockGuard manages. Every lock belongs to one property. */
export function PropertiesPage() {
  const toast = useToast()
  const withStepUp = useStepUp()
  const properties = useLoaded(fetchProperties, 'properties')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const address = String(data.get('address') ?? '').trim() || null
    if (!name) {
      setErrors({ name: 'Give the property a name.' })
      return
    }
    setBusy(true)
    setFormError(null)
    setErrors({})
    try {
      const property = await withStepUp('add a property', () =>
        createProperty({ name, address, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      )
      toast({ tone: 'success', title: `${property.name} added` })
      form.reset()
      properties.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.keys(error.fields).map((k) => [k, error.field(k)])))
      } else if (!(error instanceof StepUpCancelled)) {
        setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Properties" description="The places LockGuard manages. Every lock belongs to a property." />
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {properties.error != null && (
            <Banner
              tone="danger"
              title="Properties could not be loaded"
              className="mb-4"
              action={
                <Button variant="secondary" size="sm" onClick={properties.reload}>
                  Try again
                </Button>
              }
            >
              {properties.error instanceof Error ? properties.error.message : 'Something went wrong.'}
            </Banner>
          )}
          <DataTable
            caption="Properties"
            captionHidden
            columns={columns}
            rows={properties.data ?? []}
            rowKey={(p) => p.id}
            loading={properties.loading && !properties.data}
            empty={<EmptyState icon={Building2} title="No properties yet" description="Add one to start registering locks." />}
          />
        </div>
        <Card title="Add a property">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {formError && (
              <Banner tone="danger" title="Could not add the property">
                {formError}
              </Banner>
            )}
            <TextField name="name" label="Name" maxLength={120} error={errors.name} required />
            <TextField name="address" label="Address" maxLength={255} hint="Optional." error={errors.address} />
            <p className="text-caption text-text-muted">
              Uses this browser's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </p>
            <div>
              <Button type="submit" icon={Plus} loading={busy}>
                Add property
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}
