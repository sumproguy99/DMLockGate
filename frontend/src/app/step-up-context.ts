import { createContext, useCallback, useContext } from 'react'
import { ApiError } from '../api/client'

/** Thrown when the user closes the identity check instead of confirming. Callers ignore it. */
export class StepUpCancelled extends Error {
  constructor() {
    super('Identity confirmation was cancelled.')
    this.name = 'StepUpCancelled'
  }
}

export type ConfirmIdentity = (purpose: string) => Promise<boolean>

export const StepUpContext = createContext<ConfirmIdentity | null>(null)

/**
 * Runs an administrative change. If the server answers step_up_required, asks the user to confirm
 * their identity and runs it once more; if they cancel, rejects with StepUpCancelled.
 */
export function useStepUp(): <T>(purpose: string, action: () => Promise<T>) => Promise<T> {
  const confirm = useContext(StepUpContext)
  if (!confirm) {
    throw new Error('useStepUp must be used inside StepUpProvider')
  }

  return useCallback(
    async <T,>(purpose: string, action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'step_up_required')) {
          throw error
        }
        if (!(await confirm(purpose))) {
          throw new StepUpCancelled()
        }
        return action()
      }
    },
    [confirm],
  )
}
