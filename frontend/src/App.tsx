import { CircleAlert, CircleCheck, CircleHelp, Lock, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandLogo } from './components/brand/BrandLogo'

/**
 * UI checkpoint 1: a development preview of the branding and design tokens. It shows no lock or
 * account data. Replaced by the application shell at UI checkpoint 3.
 */
const surfaces = [
  ['bg', 'bg-bg'],
  ['panel', 'bg-panel'],
  ['panel-2', 'bg-panel-2'],
  ['elevated', 'bg-elevated'],
] as const

const accents = [
  ['primary', 'bg-primary', 'Accents, focus, icons'],
  ['primary-strong', 'bg-primary-strong', 'Filled buttons'],
  ['highlight', 'bg-highlight', 'Focus ring, highlights'],
  ['success', 'bg-success', 'Confirmed healthy'],
  ['warning', 'bg-warning', 'Degraded, attention'],
  ['danger', 'bg-danger', 'Critical, failed'],
  ['danger-strong', 'bg-danger-strong', 'Destructive buttons'],
  ['unknown', 'bg-unknown', 'Unknown, stale'],
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-6 shadow-panel">
      <h2 className="mb-4 text-section">{title}</h2>
      {children}
    </section>
  )
}

export default function App() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <p className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-support text-warning">
        Development preview (UI checkpoint 1): branding and design tokens. No live data is shown.
      </p>

      <header className="flex flex-wrap items-center gap-6">
        <BrandLogo variant="mark" className="size-16" />
        <div>
          <h1 className="text-page-title">DM LockGuard design system</h1>
          <p className="text-support text-text-muted">Secure access. Total control.</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Logo on every surface">
          <div className="grid grid-cols-2 gap-3">
            {surfaces.map(([name, cls]) => (
              <div key={name} className={`${cls} flex flex-col items-center rounded-md border border-border p-3`}>
                <BrandLogo className="size-32" />
                <span className="text-caption text-text-muted">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-2">
            <p className="text-page-title">Page title</p>
            <p className="text-section">Section heading</p>
            <p className="text-panel-title">Panel heading</p>
            <p className="text-body">Body text for descriptions and forms.</p>
            <p className="text-support text-text-muted">Supporting description in muted text.</p>
            <p className="text-label uppercase tracking-wider text-text-muted">Form label</p>
            <p className="text-metric">4</p>
            <p className="font-mono text-caption text-text-muted">2026-10-17T10:39:20Z · T85D0…FB9</p>
          </div>
        </Section>
      </div>

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {accents.map(([name, cls, use]) => (
            <div key={name} className="rounded-md border border-border bg-panel-2 p-3">
              <div className={`${cls} mb-2 h-10 rounded-sm`} />
              <p className="text-label">{name}</p>
              <p className="text-caption text-text-muted">{use}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Status always pairs color, icon and label">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/12 px-2.5 py-1 text-label text-success">
            <CircleCheck className="size-4" aria-hidden /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning/12 px-2.5 py-1 text-label text-warning">
            <TriangleAlert className="size-4" aria-hidden /> Degraded
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-danger/12 px-2.5 py-1 text-label text-danger-text">
            <CircleAlert className="size-4" aria-hidden /> Denied
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-unknown/12 px-2.5 py-1 text-label text-unknown">
            <CircleHelp className="size-4" aria-hidden /> Unknown
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="inline-flex items-center gap-2 rounded-md bg-primary-strong px-4 py-2.5 text-support font-semibold text-white transition hover:bg-primary">
            <Lock className="size-4" aria-hidden /> Primary action
          </button>
          <button type="button" className="rounded-md border border-border-strong px-4 py-2.5 text-support font-semibold transition hover:bg-elevated">
            Secondary action
          </button>
          <button type="button" className="rounded-md bg-danger-strong px-4 py-2.5 text-support font-semibold text-white transition hover:bg-danger">
            Destructive action
          </button>
        </div>
      </Section>
    </main>
  )
}
