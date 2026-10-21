import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, NETWORK_ERROR } from '../../api/client'
import { attachLockRequestLocation, type LocationFix } from '../../api/location'
import { fetchLockRequest, newIdempotencyKey, requestLockCommand, type LockAction, type LockRequest } from '../../api/locks'
import { currentPosition } from '../../lib/geolocation'

/** Polling cadence for a request in progress. Mutable so tests can shorten it. */
export const commandTiming = {
  pollMs: 1500,
  /** Stop polling after this long; the request may still finish, and the lock list will show it. */
  giveUpMs: 3 * 60_000,
}

export type CommandState =
  | { phase: 'idle' }
  /** Waiting for the user to re-confirm their identity before sending. */
  | { phase: 'step_up'; action: LockAction }
  | { phase: 'sending'; action: LockAction }
  | { phase: 'tracking'; request: LockRequest; contactLost: boolean }
  | { phase: 'finished'; request: LockRequest }
  | { phase: 'gave_up'; request: LockRequest }
  /** Refused before anything was sent (denied, rate-limited, validation). */
  | { phase: 'refused'; action: LockAction; message: string }
  /** The send itself got no answer: the request may or may not have been received. */
  | { phase: 'no_answer'; action: LockAction; message: string }

/**
 * Attaches the phone's position to a lock request for the location map, once both are known. Getting
 * the position runs alongside the command and never delays it; without a position there is no pin.
 */
function attachLocation(position: Promise<LocationFix> | null, requestId: string | null) {
  if (position === null || requestId === null) {
    return
  }
  position.then((fix) => attachLockRequestLocation(requestId, fix)).catch(() => {})
}

/**
 * One lock's command lifecycle on screen: send, follow the backend's real request status until it is
 * final, and report what actually happened. A retry after "no answer" reuses the idempotency key, so
 * it can never create a second command. With sendLocation (the mobile app), each new request also
 * carries the phone's position, as the user agreed at sign-in.
 */
export function useLockCommand(lockId: number, onFinished: () => void, { sendLocation = false } = {}) {
  const [state, setState] = useState<CommandState>({ phase: 'idle' })
  const keyRef = useRef<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const onFinishedRef = useRef(onFinished)

  useEffect(() => {
    onFinishedRef.current = onFinished
  }, [onFinished])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const track = useCallback((request: LockRequest, startedAt: number) => {
    if (request.is_final) {
      setState({ phase: 'finished', request })
      onFinishedRef.current()
      return
    }
    setState({ phase: 'tracking', request, contactLost: false })

    const poll = () => {
      if (Date.now() - startedAt > commandTiming.giveUpMs) {
        setState({ phase: 'gave_up', request })
        onFinishedRef.current()
        return
      }
      fetchLockRequest(request.id).then(
        (latest) => {
          if (latest.is_final) {
            setState({ phase: 'finished', request: latest })
            onFinishedRef.current()
            return
          }
          setState({ phase: 'tracking', request: latest, contactLost: false })
          timerRef.current = window.setTimeout(poll, commandTiming.pollMs)
        },
        () => {
          setState({ phase: 'tracking', request, contactLost: true })
          timerRef.current = window.setTimeout(poll, commandTiming.pollMs)
        },
      )
    }
    timerRef.current = window.setTimeout(poll, commandTiming.pollMs)
  }, [])

  const send = useCallback(
    async (action: LockAction, { reuseKey = false } = {}) => {
      const isNew = !reuseKey || keyRef.current === null
      const key = isNew || keyRef.current === null ? newIdempotencyKey() : keyRef.current
      keyRef.current = key
      const position = sendLocation && isNew ? currentPosition() : null
      position?.catch(() => {})
      setState({ phase: 'sending', action })
      try {
        const request = await requestLockCommand(lockId, action, key)
        attachLocation(position, request.id)
        track(request, Date.now())
      } catch (error) {
        // A denied request exists too, and its pin shows where it was refused.
        if (error instanceof ApiError && typeof error.details.request_id === 'string') {
          attachLocation(position, error.details.request_id)
        }
        if (error instanceof ApiError && error.code === 'step_up_required') {
          keyRef.current = null
          setState({ phase: 'step_up', action })
        } else if (error instanceof ApiError && error.code === NETWORK_ERROR) {
          setState({
            phase: 'no_answer',
            action,
            message: 'LockGuard did not answer, so the request may or may not have been received. Check again before sending a new one.',
          })
        } else {
          keyRef.current = null
          setState({
            phase: 'refused',
            action,
            message: error instanceof ApiError ? error.message : 'Something went wrong. Nothing was sent.',
          })
        }
      }
    },
    [lockId, sendLocation, track],
  )

  const reset = useCallback(() => {
    window.clearTimeout(timerRef.current)
    keyRef.current = null
    setState({ phase: 'idle' })
  }, [])

  return { state, send, reset }
}
