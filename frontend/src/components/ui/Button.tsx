import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from '../../lib/cx'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary',
  secondary: 'border border-border-strong bg-panel-2 text-text hover:bg-elevated',
  danger: 'bg-danger-strong text-white hover:bg-danger',
  ghost: 'text-text-muted hover:bg-elevated hover:text-text',
}

/** Heights keep touch targets at 36 px (sm) and 44 px or more (md, lg). */
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-label gap-1.5',
  md: 'min-h-11 px-4 text-support gap-2',
  lg: 'min-h-12 px-5 text-body gap-2',
}

const base =
  'inline-flex items-center justify-center rounded-md font-semibold transition-colors select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  /** Shows a spinner, disables the button and sets aria-busy. The label stays visible. */
  loading?: boolean
  fullWidth?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  fullWidth = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: LucideIcon
  /** The accessible name. Required, because the button has no visible text. */
  label: string
  variant?: 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        base,
        variant === 'danger' ? 'text-danger-text hover:bg-danger/15' : variants[variant],
        size === 'sm' ? 'size-9' : 'size-11',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden />
    </button>
  )
}
