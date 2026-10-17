import { useCallback, useRef, useState, type ReactNode } from 'react'
import { StepUpDialog } from '../components/locks/StepUpDialog'
import { StepUpContext, type ConfirmIdentity } from './step-up-context'

/** Shows the identity check whenever a screen asks for it. One dialog for the whole app. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [purpose, setPurpose] = useState<string | null>(null)
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmIdentity>(
    (why) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false)
        resolveRef.current = resolve
        setPurpose(why)
      }),
    [],
  )

  function finish(confirmed: boolean) {
    resolveRef.current?.(confirmed)
    resolveRef.current = null
    setPurpose(null)
  }

  return (
    <StepUpContext value={confirm}>
      {children}
      <StepUpDialog open={purpose !== null} purpose={purpose ?? ''} onConfirmed={() => finish(true)} onCancel={() => finish(false)} />
    </StepUpContext>
  )
}
