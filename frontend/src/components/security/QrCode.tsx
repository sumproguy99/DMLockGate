import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/**
 * A QR code as an inline SVG, drawn from the library's module grid (no HTML strings). Always dark
 * on white, in either theme, with the quiet zone scanners need around it.
 */
export function QrCode({ value, label, size = 192 }: { value: string; label: string; size?: number }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const modules = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) {
          d += `M${col + 4} ${row + 4}h1v1h-1z`
        }
      }
    }
    return { count: modules + 8, path: d }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-md border border-border"
    >
      <rect width={count} height={count} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
