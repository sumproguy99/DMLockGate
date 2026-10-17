import { useEffect, type ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description?: ReactNode
  /** Page-level actions, such as "Add user". */
  actions?: ReactNode
}

/** The page's one h1, a short description and its actions. Also sets the browser tab title. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · DM LockGuard`
  }, [title])

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page-title">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-support text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
