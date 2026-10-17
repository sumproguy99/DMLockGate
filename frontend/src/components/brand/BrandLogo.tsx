/**
 * The approved DM Lock logo (Logo.png at the project root, copied unchanged to public/assets/branding).
 *
 * The logo has an opaque near-black background (#00040A to #08111B), darker than every LockGuard
 * surface. mix-blend-mode "lighten" lets those pixels take the surface color underneath, so the logo
 * sits on any dark panel without editing the image. Use only on dark surfaces.
 *
 * - full: the complete logo with the "DM LOCK" wordmark.
 * - mark: the emblem alone (a crop of the same file, no recoloring), for compact spaces.
 */
type BrandLogoProps = {
  variant?: 'full' | 'mark'
  className?: string
}

const sources = {
  full: { src: '/assets/branding/dm-lock-logo-640.webp', width: 640, height: 640 },
  mark: { src: '/assets/branding/dm-lock-mark-256.webp', width: 256, height: 256 },
} as const

export function BrandLogo({ variant = 'full', className = '' }: BrandLogoProps) {
  const { src, width, height } = sources[variant]

  return (
    <img
      src={src}
      width={width}
      height={height}
      alt="DM Lock"
      draggable={false}
      className={`select-none mix-blend-lighten ${className}`}
    />
  )
}
