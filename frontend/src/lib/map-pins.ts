import type { MapPin, PinOutcome } from '../api/location'
import type { Tone } from '../components/ui/tones'

/** How a lock request ended, in the words and tone used everywhere else. */
const outcomes: Record<PinOutcome, { tone: Tone; label: string; symbol: string }> = {
  success: { tone: 'success', label: 'Succeeded', symbol: '✓' },
  failure: { tone: 'danger', label: 'Failed', symbol: '✕' },
  denied: { tone: 'warning', label: 'Denied', symbol: '!' },
  unknown: { tone: 'unknown', label: 'Outcome unknown', symbol: '?' },
  pending: { tone: 'info', label: 'In progress', symbol: '…' },
}

export type PinDescription = {
  tone: Tone
  /** A one-character mark drawn on the pin, so the result never depends on color alone. */
  symbol: string
  /** "Unlock Front Door" or "Location shared". */
  title: string
  /** "Succeeded", "Denied", or who asked for a shared location. */
  result: string
}

export function describePin(pin: MapPin): PinDescription {
  if (pin.kind === 'lock_request') {
    const { tone, label, symbol } = outcomes[pin.outcome]
    return { tone, symbol, title: `${pin.action === 'unlock' ? 'Unlock' : 'Lock'} ${pin.lock.name}`, result: label }
  }

  return {
    tone: 'info',
    symbol: '●',
    title: 'Location shared',
    result: pin.requested_by ? `Requested by ${pin.requested_by.name}` : 'Requested by an administrator',
  }
}

/** The pin's fill and text classes, from the status tokens. */
export const pinClass: Record<Tone, string> = {
  info: 'bg-primary text-white',
  success: 'bg-success text-bg',
  warning: 'bg-warning text-bg',
  danger: 'bg-danger-strong text-white',
  unknown: 'bg-unknown text-bg',
}
