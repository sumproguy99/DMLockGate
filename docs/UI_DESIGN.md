# DM LockGuard — UI Design System

The frontend lives in `frontend/`: React, TypeScript, Vite and Tailwind CSS (project.md section 34.13).

## Branding assets

**Approved logo:** `Logo.png` at the project root, supplied by the operator. It is 1254×1254 RGB with the "DM LOCK" wordmark. It has **no transparency**: its background is near-black (`#00040A` to `#08111B`). The original is never modified.

No other DM Lock, DM LockGuard or DM Networks branding files exist in the project.

Derived files, all in `frontend/public/assets/branding/` and all generated from `Logo.png` by resizing or cropping only (no recoloring, stretching or redrawing):

| File | What it is |
|---|---|
| `dm-lock-logo.png` | Unchanged copy of `Logo.png` |
| `dm-lock-logo-640.webp` | The full logo at 640 px, used in the app |
| `dm-lock-mark-512.png`, `dm-lock-mark-256.webp` | The emblem alone (the DM monogram, keyhole and ring), cropped above the wordmark and padded to a square with the logo's own edge color |
| `pwa-icon-192.png`, `pwa-icon-512.png`, `apple-touch-icon.png` | PWA and home-screen icons from the emblem |
| `favicon-48.png`, `../../favicon.ico` | Browser icons from the emblem |

Emblem-only crops were approved by the operator on 2026-10-16, for compact spaces where the full logo is unreadable.

**Display on dark surfaces:** `BrandLogo` (`src/components/brand/BrandLogo.tsx`) renders the logo with `mix-blend-mode: lighten`. The logo's background is darker than every LockGuard surface, so it takes the surface color underneath, and the logo sits on any panel without editing the image. On the darkest token (`bg`, `#050B14`), a faint square remains at the top-right of the full logo, where the image background is slightly lighter. Place the logo on `panel` or lighter.

**"LockGuard" product name:** the logo says "DM LOCK". Where the product name "DM LockGuard" is needed (sidebar, login, page titles), it is set in Inter next to the logo, never drawn into the logo.

**Missing assets:**
- A transparent-background logo (project.md 34.2 prefers one for dark interfaces). The blend mode covers this for now, but a transparent PNG or an SVG would be sharper on light surfaces and in print.
- A vector (SVG) version of the logo or emblem.

## Mockup references

`ServerGui.png` (desktop dashboard) and `WebAppGUI.png` (eight mobile screens), at the project root, are references for **layout, color, hierarchy and component style only** (project.md 34.12).

Not carried over:
- **Their sample data:** names, battery levels, alert counts, firmware versions, timestamps.
- **Features LockGuard does not have:**
  - the camera feed and controls;
  - the weather widget;
  - the user-location map and the "At Home" or "At Work" statuses;
  - proximity unlock and geofence settings;
  - keypad access codes (the T85D0 has no PIN commands);
  - "Enable Lockdown", until lockdown mode exists.

Where a screen in the spec covers one of these, it says the feature is unavailable rather than showing a fake.

## Design tokens

`frontend/src/styles/tokens.css` is the single source. Tailwind generates utilities from it (`bg-panel`, `text-text-muted`, `border-border-strong`, `text-page-title`, and so on).

**Colors:** project.md's palette, with contrast-driven adjustments measured to WCAG 2.2:

| Token | Value | Use | Why it differs from the spec |
|---|---|---|---|
| `bg` `panel` `panel-2` `elevated` | `#050B14` `#091523` `#101D2C` `#17283A` | Surfaces | As specified |
| `text` / `text-muted` | `#F4F7FC` / `#A8B7C9` | Text | As specified. Muted is 7.3:1 or better |
| `primary` | `#087FFF` | Accents, icons, focus, large text | As specified |
| `primary-strong` | `#0A6FE0` | Filled buttons | White on `#087FFF` is only 3.8:1; white on this is 4.8:1 |
| `primary-text` | `#559DFF` | Blue text and links | `#087FFF` text on `elevated` is 3.9:1; this is 5.4:1 or better, and 4.7:1 on its own badge tint |
| `highlight` | `#20B8FF` | Focus ring, highlights | As specified |
| `success` / `warning` | `#20D990` / `#FFB547` | Confirmed healthy / degraded or attention | As specified. 8:1 or better as text |
| `danger` | `#FF4057` | Red icons and accents | As specified |
| `danger-strong` | `#D92D44` | Destructive buttons | White on `#FF4057` is 3.4:1; white on this is 4.8:1 |
| `danger-text` | `#FF6275` | Red text | 5.2:1 or better on every panel |
| `unknown` | `#93A2B4` | Unknown and stale states | `#78889A` is 4.1:1 on `elevated`; this is 5.7:1, and 4.7:1 on its own badge tint |
| `disabled` | `#78889A` | Disabled controls only | As specified. Disabled controls are exempt from contrast |
| `border` | `#243B52` | Decorative dividers | As specified |
| `border-strong` | `#4A6B8A` | Form-field outlines | `border` is 1.3–1.7:1; this is 3:1 or better on `bg`, `panel` and `panel-2` |

**Color rules:**
- **Blue:** actions, selection and focus.
- **Green:** confirmed healthy.
- **Amber:** degraded or needs attention.
- **Red:** critical, failed or dangerous.
- **Gray:** unknown, stale or disabled.

A status always pairs its color with an icon and a text label.

**Typography:** Inter Variable, self-hosted through `@fontsource-variable/inter` (no external font CDN). The scale runs page title, section, panel title, body, support, label, caption and metric; body text is 15 px. Monospace is used for technical values such as serial numbers and timestamps.

**Other tokens:**
- **Radii:** sm, md, lg, xl.
- **Shadows:** panel and raised. There are also glows for primary, success and danger, used only to mark a state.
- **Breakpoints:** 640, 768, 1024, 1280 and 1536 px.
- **Motion:** 120, 200 and 320 ms with a standard easing; motion is turned off under `prefers-reduced-motion`.
- **Focus:** a 2 px `highlight` outline, with a 2 px offset, on every focusable element.

## Shared components

All in `frontend/src/components`. Presentation only: no component calls the API or decides permissions. Pages pass in what the backend returned.

**General UI (`ui/`):**
- `Button` and `IconButton`. They come in primary, secondary, danger and ghost variants. In the loading state the button keeps its label, shows a spinner, is disabled and sets `aria-busy`. Icon buttons need a `label`.
- Form fields: `TextField`, `SelectField`, `CheckboxField` and `SearchField`. The label, hint and error are connected to the field so screen readers read them with it, and an error marks the field invalid.
- `Card` (with a heading level that fits the page) and `Metric`.
- `StatusBadge` and `Banner`. Banners are announced as alerts for danger and as status messages otherwise; use `live="none"` for banners that are there when the page loads.
- `Dialog`. It moves focus inside, keeps Tab inside, closes on Escape, returns focus to whatever opened it, makes the page behind inert and stops it scrolling.
- `ConfirmDialog`. It states the consequence, starts on Cancel, can't be dismissed while busy, and shows a failure inside the dialog. It can optionally require a typed phrase.
- Toasts: `ToastProvider` and `useToast`. Failures are announced assertively and stay until dismissed. Others are polite and leave after 6 s.
- `DataTable`. It has a caption and column headers, scrolls inside its own frame, and shows loading and empty states.
- `Tabs`, which follows the WAI-ARIA tabs pattern with arrow, Home and End keys.
- `Menu`, a WAI-ARIA menu button. Arrow keys move through the items, disabled items are skipped, Escape and Tab close it, and focus returns to the trigger.
- `Pagination`, `Tooltip` (supplementary text only, shown on hover or focus, Escape hides it), `EmptyState`, `Spinner` and `LoadingState`.

**LockGuard status (`status/`, mappings in `src/lib/lockguard.ts`):**
- `LockStatusDisplay` and `LockStateBadge` show only the state the lock reported, together with the backend's `state_freshness`.
  - Locked is green, unlocked is amber and jammed is red.
  - A stale report is gray and labelled "(stale)". An unknown report says "Unknown" and never guesses.
- `CommandProgress` uses the backend's request lifecycle and the stage names from project.md 34.9.
  - The stages run "Request received", "Authorization completed", "Command submitted", "Integration response received" (when `command.integration_result` is set), then "Physical state confirmed".
  - A sent command is never shown as a success. "Outcome unknown" is kept separate from "Failed". "Expired" and "Cancelled" say that nothing was sent.
- `DeviceStatus`, `ConnectionBadge` and `BatteryBadge` show the connection status, the battery (or "Battery unknown") and the last contact.
- `ActivityEntry`, `SecurityAlert` and `Timestamp`. Times are relative, with the exact time in the markup and on hover.

## Testing and accessibility checks

`npm test` runs Vitest with Testing Library in jsdom.
- **Behaviour:** keyboard paths, focus management, live regions, validation wiring and lifecycle mapping.
- **Accessibility:** axe-core runs against each component and against the whole gallery page, using the WCAG 2.0–2.2 A and AA rules.
- **Contrast:** axe can't measure contrast in jsdom, so `src/styles/contrast.test.ts` reads `tokens.css` and checks every color pair the components use, including tone text on its own 12% tint. That test caught blue and gray badge text on `elevated` at 4.43:1 and 4.46:1. `primary-text` and `unknown` were lightened as a result.
- **Phone width:** layout at 390 px was checked by screenshot, with no horizontal overflow.
## Development

```bash
cd frontend
npm install
npm run dev     # http://127.0.0.1:5173, proxies /api and /sanctum to LOCKGUARD_API_URL (default http://127.0.0.1:8100)
npm run build
npm test        # components, accessibility (axe) and token contrast
```
