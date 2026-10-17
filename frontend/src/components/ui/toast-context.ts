import { createContext, useContext } from 'react'
import type { Tone } from './tones'

export type ToastInput = {
  tone: Tone
  title: string
  message?: string
}

export const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

/** Shows a toast. Needs a ToastProvider above it. */
export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext)
  if (!show) {
    throw new Error('useToast must be used inside a ToastProvider.')
  }

  return show
}
