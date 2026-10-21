import { api } from './client'

/** A position from the browser, as the API takes it. Client-reported, never proof of anything. */
export type LocationFix = {
  latitude: number
  longitude: number
  /** Meters, as the browser reports it. */
  accuracy: number
  captured_at: string
}

/** Why a phone answered a location request without a position. */
export type UnavailableReason = 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported'

export type MapPerson = { id: number; name: string }

type PinBase = {
  id: number
  latitude: number
  longitude: number
  accuracy_meters: number
  captured_at: string
  /** When it happened: the lock request's time, or when the phone shared its position. */
  at: string
  user: MapPerson
}

/** How a lock request ended, as the person pressing the button would see it. */
export type PinOutcome = 'success' | 'failure' | 'denied' | 'unknown' | 'pending'

export type LockRequestPin = PinBase & {
  kind: 'lock_request'
  action: 'lock' | 'unlock'
  lock: { id: number; name: string }
  status: string
  outcome: PinOutcome
}

export type LocationRequestPin = PinBase & {
  kind: 'location_request'
  requested_by: MapPerson | null
}

export type MapPin = LockRequestPin | LocationRequestPin

export type LocationMap = {
  days: number
  retention_days: number
  pins: MapPin[]
  /** Active users, for choosing whose location to request. */
  people: MapPerson[]
}

export type LocationRequestStatus = 'pending' | 'fulfilled' | 'unavailable' | 'expired'

export type LocationRequestRecord = {
  id: string
  status: LocationRequestStatus
  failure_reason: UnavailableReason | null
  user: MapPerson
  requested_at: string
  expires_at: string
  completed_at: string | null
  location: { latitude: number; longitude: number; accuracy_meters: number; captured_at: string } | null
}

export type SharedLocation = {
  at: string
  kind: 'lock_request' | 'location_request'
  accuracy_meters: number
  lock: string | null
  action: 'lock' | 'unlock' | null
  requested_by: string | null
}

export type OwnLocationSharing = {
  notice_version: string
  retention_days: number
  shared: SharedLocation[]
}

export async function fetchLocationMap(days: number, signal?: AbortSignal): Promise<LocationMap> {
  const { data } = await api<{ data: LocationMap }>(`/location/map?days=${days}`, { signal })
  return data
}

/** Ask a user's phone for its location. Asking again while it is still open returns the same request. */
export async function requestLocation(userId: number): Promise<LocationRequestRecord> {
  const { data } = await api<{ data: LocationRequestRecord }>('/location/requests', { method: 'POST', body: { user_id: userId } })
  return data
}

export async function fetchLocationRequest(id: string, signal?: AbortSignal): Promise<LocationRequestRecord> {
  const { data } = await api<{ data: LocationRequestRecord }>(`/location/requests/${encodeURIComponent(id)}`, { signal })
  return data
}

/** The open location requests addressed to the signed-in user. */
export async function fetchPendingLocationRequests(): Promise<{ id: string; expires_at: string }[]> {
  const { data } = await api<{ data: { id: string; expires_at: string }[] }>('/location/requests/pending')
  return data
}

export async function answerLocationRequest(id: string, answer: LocationFix | { unavailable: UnavailableReason }): Promise<void> {
  await api(`/location/requests/${encodeURIComponent(id)}/respond`, { method: 'POST', body: answer })
}

export async function attachLockRequestLocation(requestId: string, fix: LocationFix): Promise<void> {
  await api(`/lock-requests/${encodeURIComponent(requestId)}/location`, { method: 'POST', body: fix })
}

export async function fetchOwnLocationSharing(signal?: AbortSignal): Promise<OwnLocationSharing> {
  const { data } = await api<{ data: OwnLocationSharing }>('/location/mine', { signal })
  return data
}
