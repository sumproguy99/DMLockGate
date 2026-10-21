import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { MapPin } from '../../api/location'
import { cx } from '../../lib/cx'
import { describePin, pinClass } from '../../lib/map-pins'
import { formatAbsolute } from '../../lib/time'

type LeafletMapProps = {
  pins: MapPin[]
  /** A pin to center on and open, such as a location that just arrived. */
  focusPinId?: number | null
  className?: string
}

/** The pin's hover and focus card, built as DOM text so no name is ever read as HTML. */
function tooltipFor(pin: MapPin): HTMLElement {
  const { title, result } = describePin(pin)
  const card = document.createElement('div')
  const lines: [string, string][] = [
    ['font-semibold', title],
    ['', pin.user.name],
    ['', formatAbsolute(pin.at)],
    ['font-semibold', result],
    ['opacity-80', `Within about ${Math.round(pin.accuracy_meters)} m`],
  ]
  for (const [className, text] of lines) {
    const line = document.createElement('div')
    line.className = className
    line.textContent = text
    card.append(line)
  }
  return card
}

function iconFor(pin: MapPin): L.DivIcon {
  const { tone, symbol } = describePin(pin)
  const mark = document.createElement('span')
  mark.className = cx(
    'flex size-7 items-center justify-center rounded-full border-2 border-white text-sm font-bold shadow-panel',
    pinClass[tone],
  )
  mark.textContent = symbol
  return L.divIcon({ html: mark, className: '', iconSize: [28, 28], iconAnchor: [14, 14], tooltipAnchor: [0, -14] })
}

/**
 * An OpenStreetMap map with one pin per location. Hovering over or focusing a pin shows who, when
 * and the result. Leaflet is only loaded with this component.
 */
export default function LeafletMap({ pins, focusPinId = null, className }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const map = L.map(containerRef.current, { worldCopyJump: true }).setView([39.5, -98.35], 4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) {
      return
    }
    layer.clearLayers()

    let focused: L.Marker | null = null
    for (const pin of pins) {
      const { title, result } = describePin(pin)
      const marker = L.marker([pin.latitude, pin.longitude], { icon: iconFor(pin), keyboard: true })
        .bindTooltip(tooltipFor(pin), { direction: 'top' })
        .addTo(layer)
      // A divIcon ignores alt; name the focusable pin for screen readers instead.
      marker.getElement()?.setAttribute('aria-label', `${title}, ${pin.user.name}, ${formatAbsolute(pin.at)}, ${result}`)
      if (pin.id === focusPinId) {
        focused = marker
      }
    }

    if (focused) {
      map.setView(focused.getLatLng(), Math.max(map.getZoom(), 16))
      focused.openTooltip()
    } else if (pins.length > 0) {
      map.fitBounds(L.latLngBounds(pins.map((pin) => [pin.latitude, pin.longitude])), { padding: [40, 40], maxZoom: 17 })
    }
  }, [pins, focusPinId])

  return <div ref={containerRef} className={cx('z-0 rounded-md border border-border bg-panel-2', className)} />
}
