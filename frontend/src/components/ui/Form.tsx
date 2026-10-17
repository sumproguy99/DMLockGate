import { CircleAlert, Eye, EyeOff, Search } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

const control =
  'min-h-11 w-full rounded-md border border-border-strong bg-bg px-3 text-body text-text ' +
  'placeholder:text-unknown transition-colors hover:border-text-muted ' +
  'disabled:cursor-not-allowed disabled:border-border disabled:text-disabled ' +
  'aria-invalid:border-danger-text'

type FieldShellProps = {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: ReactNode
}

/** Label, hint and error around one control. Ids are wired by the field components below. */
function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-text">
        {label}
        {required && <span className="ml-1 text-text-muted">(required)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-caption text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-label text-danger-text">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: ReactNode
  hint?: ReactNode
  /** A validation message. Marks the input invalid and is read with it. */
  error?: string | null
  ref?: Ref<HTMLInputElement>
}

export function TextField({ label, hint, error, required, className, type = 'text', ...rest }: TextFieldProps) {
  const id = useId()

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(control, className)}
        {...rest}
      />
    </FieldShell>
  )
}

type PasswordFieldProps = Omit<TextFieldProps, 'type'>

/** A password input with a show/hide toggle. The toggle never submits the form. */
export function PasswordField({ label, hint, error, required, className, ...rest }: PasswordFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          autoCapitalize="none"
          spellCheck={false}
          className={cx(control, 'pr-12', className)}
          {...rest}
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-label="Show password"
          title={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-elevated hover:text-text"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </FieldShell>
  )
}

type SelectFieldProps =Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: ReactNode
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>
  hint?: ReactNode
  error?: string | null
  /** A first, empty option such as "Choose a lock". */
  placeholder?: string
  ref?: Ref<HTMLSelectElement>
}

export function SelectField({ label, options, hint, error, required, placeholder, className, ...rest }: SelectFieldProps) {
  const id = useId()

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(control, 'appearance-auto', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  ref?: Ref<HTMLInputElement>
}

export function CheckboxField({ label, hint, error, className, ...rest }: CheckboxFieldProps) {
  const id = useId()

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
          {...rest}
        />
        <label htmlFor={id} className="cursor-pointer text-body">
          {label}
        </label>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="pl-8 text-caption text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 pl-8 text-label text-danger-text">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'aria-label'> & {
  /** The accessible name; the field has a placeholder but no visible label. */
  label: string
  ref?: Ref<HTMLInputElement>
}

/** A search box inside a search landmark. */
export function SearchField({ label, className, ...rest }: SearchFieldProps) {
  return (
    <div role="search" className={cx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
      <input type="search" aria-label={label} className={cx(control, 'pl-9')} {...rest} />
    </div>
  )
}
