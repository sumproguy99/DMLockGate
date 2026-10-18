/**
 * Which interface a browser prefers: the mobile web app (/m) or the desktop application. Phones get
 * the mobile app unless the person chose the desktop view; the choice is remembered per browser.
 */
export type View = 'mobile' | 'desktop'

const KEY = 'lockguard.view'

/** The width below which a screen counts as a phone (Tailwind's md breakpoint). */
export const PHONE_QUERY = '(max-width: 767px)'

export function readViewPreference(): View | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'mobile' || value === 'desktop' ? value : null
  } catch {
    return null
  }
}

export function saveViewPreference(view: View): void {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // Not remembered in this browser; the switch still applies now.
  }
}

/** Whether "/" should open the mobile app in this browser. */
export function prefersMobile(): boolean {
  const chosen = readViewPreference()
  if (chosen) {
    return chosen === 'mobile'
  }
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}
