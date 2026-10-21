import type { LocationFix, UnavailableReason } from '../api/location'

/** How long to wait for the browser's position. Mutable so tests can shorten it. */
export const geolocationTiming = { timeoutMs: 15_000, maximumAgeMs: 30_000 }

export class PositionUnavailable extends Error {
  readonly reason: UnavailableReason

  constructor(reason: UnavailableReason) {
    super(`Position unavailable: ${reason}`)
    this.name = 'PositionUnavailable'
    this.reason = reason
  }
}

/**
 * The phone's current position from the Geolocation API. The browser asks the person for
 * permission the first time; LockGuard never works around a refusal. Rejects with PositionUnavailable.
 */
export function currentPosition(): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    // Browsers share location only with HTTPS pages (and localhost), never over a plain-HTTP LAN address.
    if (typeof navigator === 'undefined' || !navigator.geolocation || window.isSecureContext === false) {
      reject(new PositionUnavailable('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captured_at: new Date(position.timestamp).toISOString(),
        }),
      (error) =>
        reject(
          new PositionUnavailable(
            error.code === error.PERMISSION_DENIED ? 'permission_denied' : error.code === error.TIMEOUT ? 'timeout' : 'position_unavailable',
          ),
        ),
      { enableHighAccuracy: true, timeout: geolocationTiming.timeoutMs, maximumAge: geolocationTiming.maximumAgeMs },
    )
  })
}
