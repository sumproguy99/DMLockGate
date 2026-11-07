import type { SharedLocation } from '../api/location'

/** What a shared location was for, in the person's own words. */
export function describeShared(item: SharedLocation): string {
  if (item.kind === 'location_request') {
    return item.requested_by ? `${item.requested_by} asked for your location` : 'An administrator asked for your location'
  }
  const verb = item.action === 'unlock' ? 'Unlock' : 'Lock'
  return item.lock ? `${verb} request for ${item.lock}` : `${verb} request`
}
