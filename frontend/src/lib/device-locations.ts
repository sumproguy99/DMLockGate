import type { MapDevice, MapPerson, MapPin } from '../api/location'

/** One device and every location it reported in the period, newest first. */
export type DeviceGroup = {
  key: string
  device: MapDevice | null
  owner: MapPerson
  pins: MapPin[]
}

/**
 * Groups pins by the device they came from. Older records without a device are grouped per person
 * as "Device not recorded". Devices with the most recent location come first.
 */
export function groupByDevice(pins: MapPin[]): DeviceGroup[] {
  const groups = new Map<string, DeviceGroup>()
  const newestFirst = [...pins].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  for (const pin of newestFirst) {
    const key = pin.device ? `device-${pin.device.id}` : `person-${pin.user.id}`
    const group = groups.get(key) ?? { key, device: pin.device, owner: pin.user, pins: [] }
    group.pins.push(pin)
    groups.set(key, group)
  }
  return [...groups.values()]
}
