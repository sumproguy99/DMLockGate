import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { error: Error | null }

/**
 * The last line of defence: if a screen throws while rendering, show what happened and a way back
 * instead of an empty page. Lock state shown before the failure is never left on screen as if current.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LockGuard screen error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div role="alert" className="w-full max-w-md rounded-lg border border-danger/40 bg-panel p-6 shadow-panel">
          <h1 className="text-section">Something went wrong on this screen</h1>
          <p className="mt-2 text-support text-text-muted">
            Nothing was sent to any lock because of this. Reload to try again. If it keeps happening, tell your LockGuard
            administrator what you were doing and the message below.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-bg p-3 font-mono text-caption whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-11 rounded-md bg-primary-strong px-4 text-support font-semibold text-white hover:bg-primary"
          >
            Reload
          </button>
        </div>
      </main>
    )
  }
}
