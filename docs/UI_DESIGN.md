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

## Application shell and sign-in

**Sign-in** (`src/pages/LoginPage.tsx`, project.md 34.6 A):
- **Fields:** email (the backend signs in by email only, not username) and password, with a show/hide toggle.
- **Two-step verification:** when the account has MFA, the next step asks for the authenticator code, or a recovery code instead. "Start over" returns to the email and password step.
- **Choose your own password:** when `password_change_required` is true (an administrator typed the password when creating the account), `RequireAuth` shows `PasswordChangeRequired` before anything else, the two-step setup screen included: the logo, why, the shared `ChangePasswordCard` (current password, new password twice) and Sign out. A 403 `password_change_required` mid-session switches to it (`onPasswordChangeRequired`). Account security has the same **Change password** card for everyone; it says how many other sessions ended. The user page shows whether the password was set by an administrator.
- **Two-step sign-in required by role:** when `mfa_setup_required` is true (the user's role must use it and they have no authenticator), `RequireAuth` shows `MfaSetupRequired` instead of either shell, at any address: the logo, why, the shared `TwoStepCard` (identity check, `otpauth://` link and key, code, recovery codes) and Sign out. "I have saved them" re-reads the user and the app opens. A 403 `mfa_setup_required` on any request mid-session switches to the same screen (`onMfaSetupRequired` in the API client). For a required role, Account security offers **Move to a new phone** instead of **Remove authenticator app**; confirming removes it and goes straight to setup.
- **Security policy** (`/settings/security`, Settings > Security policy, `admin.security_policies`): a checkbox per role with how many members have no authenticator yet, saved after an identity check. It warns when no administrator role is left required, says how many people will be asked to set it up, and when the change includes the signed-in administrator, the setup screen takes over after saving. The user list shows "Required, not set up" in the Two-step column, and the user page says when it is required for their role.
- **Errors:**
  - Empty fields are caught before anything is sent.
  - The backend's field errors show under their fields.
  - Other errors (rate limit, inactive account, network) show in a banner.
- **Forgot password:** a link under the form opens `/forgot-password` (email in, the same answer for every address). The emailed link opens `/reset-password#token=…&email=…`; the page reads the token from the `#` part, removes it from the address bar, and sets the new password (12+ characters, letters and numbers, confirmed). Success says the person was signed out everywhere and links to sign-in. An expired or used link offers a new one. Lost authenticators still go to an administrator.

**Session** (`src/auth/`, `src/api/client.ts`):
- **Cookies only:** Sanctum's session cookie and its CSRF cookie. No token is stored in the browser.
- **Start-up:** the app asks `/api/v1/auth/me`, showing the logo and "Checking your session…" meanwhile. If LockGuard can't be reached, it shows "LockGuard is unreachable" under the logo with a Try again button. Both sit on a panel, like sign-in, so the logo's background blends in.
- **Expiry:** any later 401 returns the user to sign-in with "Your session ended".
- **Timeouts:** requests time out after 20 s.
- **CSRF:** the CSRF cookie is fetched before the first state-changing request, and refreshed once on a 419.

**Origin:** in development the Vite server (`127.0.0.1:5173`) proxies `/api` and `/sanctum` to Laravel. `config/sanctum.php` lists that address as stateful by default. Production sets `SANCTUM_STATEFUL_DOMAINS` to its real host.

**Shell** (`src/app/`):
- **Sidebar** (large screens): logo, grouped navigation, current page highlighted. It collapses to icons only; links keep their names, show labels on hover or focus, and the setting is remembered in this browser.
- **Smaller screens:** the same navigation opens as a drawer from the header's menu button.
- **Header:** where you are (group and page), the Eufy integration status, the user's name and role, and the account menu (Mobile view, Sign out).
- **Keyboard and screen readers:** there's a skip link to the main content. Focus moves to the content after each navigation, and each page sets the browser tab title.

**Navigation shows only screens the backend supports today, and only to users allowed to open them:**

| Item | Shown with any of |
|---|---|
| Location map | `location.view_history` |
| Dashboard | every signed-in user |
| Users, Roles and permissions | `users.*` (the backend's user-management view permissions) |
| Properties | `admin.integration_settings` |
| Locks | `lock.view_status`, `devices.view` |
| Audit log | `admin.incidents_view` |
| System health | `admin.integration_settings`, `admin.incidents_view` |

A user who types the address of a page they can't use sees "Not available to you". The backend refuses the data either way.

**Integration indicator:** the header shows the Eufy integration status from `GET /api/v1/system/health`, refreshed every 60 seconds and shared with the dashboard. While the first check runs, or if the check fails, it says so ("Checking Eufy…", "Eufy status unavailable") instead of guessing.

**Not in the shell yet:**
- **Notification center, global search, settings shortcut:** these have no backend yet.
- **Navigation items from project.md 34.4 that have no backend yet:** access codes, schedules, geofences, settings. They're added as their features are built (Location map, Security center, Notifications and Devices have been since).

**Component gallery:** `/dev/components`, in development builds only.

## Dashboard

The dashboard (project.md 34.5) reads `GET /api/v1/locks`, `GET /api/v1/dashboard` and `GET /api/v1/system/health`. It reloads every 30 seconds while the tab is visible, at once when the tab comes back, and on **Refresh**. If a reload fails, the last data stays on screen under a warning; if the first load fails, the page offers **Try again**.

The backend leaves out (returns null for) each section the user may not see, so the page shows only what the server would allow:

| Panel | Shown to | Source |
|---|---|---|
| Locks | anyone with locks they may see | `/locks`; last request per lock from `/dashboard` when the user has `lock.view_history` |
| Eufy integration | everyone; diagnostics with `admin.integration_settings` or `admin.incidents_view` | `/system/health` |
| Security | `admin.incidents_view` | audit log, last 24 hours |
| Users and access | any `users.*` permission | users table and time-limited lock access |
| Recent activity | `admin.incidents_view`: the audit trail; otherwise `lock.view_history`: requests on the user's locks, other people shown as "Another user" | `/dashboard` |
| System health | same as the integration diagnostics | `/system/health` |

**Lock cards** show the reported state and its freshness (stale is gray, with the age of the report), connection, battery, last contact, the last problem, and the last request with its real outcome.
- **Lock** sends at once. **Unlock** asks first ("Unlock Front Door?"; Cancel has focus). Buttons appear only with `lock.lock`, or `lock.unlock` plus `lock.remote_unlock`. They're disabled, with the reason, when commands are off for the lock.
- **Identity re-check:** when the server answers `step_up_required`, the card asks for the password (and the authenticator code if two-step verification is on), then sends a new request.
- **Progress:** after a 202 the card polls `GET /lock-requests/{id}` every 1.5 seconds and shows the six stages from 34.9 until the request is final. Only "Confirmed" means the lock reported the new state. After 3 minutes it stops polling on screen and says so.
- **No answer:** if the send itself gets no answer, the card says the request may or may not have been received. **Check again** resends with the same idempotency key, which returns the existing request and can't create a second command.

**System health** is measured, not assumed:
- application;
- database (a query);
- background jobs (database-queue jobs waiting over 2 minutes, failures in 24 hours);
- lock state sync (newest scheduled poll; a warning after 15 minutes);
- Eufy integration (the bridge's `/v1/health`, cached 15 seconds, 5-second timeout);
- audit trail (append-only triggers installed);
- notifications (in the app and by email, per each person's preferences; push is not built yet);
- live updates, which show "Not built yet".

**Not on the dashboard, because the backend has no support yet:** lockdown status and quick action (alerts are handled in the Security center), revoked devices, proximity-unlock controls, widget customization.

## Administrative screens

**Identity re-check (step-up):** many admin changes answer `step_up_required` until the administrator has re-entered their password (and code) in the last few minutes. One shared dialog (`StepUpProvider`) asks for it, then the change runs once more. Cancelling it changes nothing and shows no error.

**Users** (`/users`, 34.6 B):
- **List:** search, plus status, role, property and lock filters. Filters live in the address, so links and Back keep them.
- **Add user** (`/users/new`): name, email, optional username and expiry, a first password, and roles, with the permission preview. Overrides are added afterwards.
- **User page** has four tabs:
  - **Profile:** edit details, expiry and notes. Only changed fields are sent.
  - **Roles and permissions:** role checkboxes and a per-permission "Follow roles / Always allow / Always deny" choice. The server's preview shows the effective permissions and where each comes from, what would change (sensitive gains highlighted), and whether you're allowed to save. Save stays disabled until the preview says yes.
  - **Lock access:** give access with an optional time window, or remove it. These are LockGuard records, never keypad codes on the lock.
  - **Security history:** the user's sign-in and admin events, with older pages on request.
- **Account actions:** each asks for a reason, which the audit log keeps.
  - **Suspend:** signs them out everywhere.
  - **Reactivate.**
  - **Sign out everywhere:** ends all sessions but leaves the account active.
  - **Reset two-step sign-in** (`admin.security_policies`, shown when they have an authenticator): for a lost phone and lost recovery codes. It clears their authenticator and recovery codes and signs them out everywhere. The dialog says whether their role makes them set up a new one at the next sign-in or lets them sign in with a password alone.
  - **Revoke:** permanent, so the dialog says so.
- **Your own account:** you can't change it; the page says so.

**Roles and permissions** (`/roles`, 34.6 C): pick a role to see what it includes, grouped by area, with sensitive permissions marked. Roles are fixed by LockGuard; individual changes are overrides on a user's page.

**Locks** (`/locks`, `/locks/:id`, 34.6 D):
- **The list shows:** reported state and freshness, connection, battery, last contact, last command outcome, and whether commands are on. A banner explains when the Eufy integration isn't connected.
- **A lock's page shows:**
  - the lock card, with Lock and Unlock;
  - integration diagnostics, including the serial number shown as `••••1234`;
  - settings: rename, commands on/off (turning them on asks first), and disable or re-enable the lock;
  - who has access, linking to their user pages;
  - the last 50 requests and reported states.
- **Register lock:** commands start off.

**Properties** (`/properties`): list with lock counts, and add a property in this browser's time zone.

**Audit log** (`/audit`, 34.6 H):
- **Filtering:** search (action, reason or event ID), category, outcome, lock, and a date range. Click a person to filter by them.
- **Pages:** 50 events per page.
- **Detail dialog:** request context, the metadata (already redacted when it was written), and the record hash.
- **Export CSV:** needs `admin.reports_export`. Each export is recorded in the audit log, limited to 10,000 rows and 6 exports a minute. Cells that a spreadsheet would treat as formulas are prefixed with a quote.

**System health** (`/system`, 34.6 I): the integration diagnostics and subsystem list from the dashboard, on their own page. Settings can't be edited here: they live in the server's `.env`, so no secret is shown.

**Not built, because the backend has no support yet:**
- access codes and temporary access as their own screen (34.6 E; time-limited lock access is on each user's page);
- location and proximity (F);
- the Security Center's incidents and alert acknowledgement (G; the audit log's failure and denial filters cover the event feed);
- trusted devices (built since; see Trusted devices);
- editable settings;
- role editing.

## Mobile web app

**A separate interface** under `/m` (project.md 34.7), built on the same tokens, logo and components as the desktop application (`src/mobile/`).
- **Header:** the logo mark, "DM LockGuard", a compact Eufy status (the same health check as the desktop header, including "Eufy degraded" when commands keep failing), a notification bell with the unread notifications, or the number of current alerts when everything is read (red when any current alert is critical), and the user's initials linking to More.
- **Bottom navigation:** Home, Activity, Devices, More, each at least 64 px tall and inside the safe area. Activity needs `lock.view_history` (the feed's own permission); Devices needs `lock.view_status` or `devices.view`. Hidden tabs are also refused by address ("Not available to you"), and the backend refuses the data either way.
- **More:** the account (name, email, roles, whether two-step verification is on), links to Notifications, Account security, Location and proximity, and Help, then **Use the desktop view** and **Sign out**, set apart at the bottom so it isn't tapped by accident.
- **Which view opens:** `/` sends a phone-width screen (under 768 px) to `/m` before the desktop shell renders. Choosing **Use the desktop view** (More) or **Mobile view** (desktop account menu) is remembered in this browser (`localStorage` key `lockguard.view`) and overrides the screen width.
- **Install:** `manifest.webmanifest` lets a phone add LockGuard to its home screen, opening at `/m`. There's no service worker and nothing works offline: a lock's state is never shown from a cache. `viewport-fit=cover` with safe-area padding keeps the header and navigation clear of notches and the home indicator.
- **Keyboard and screen readers:** skip link; focus moves to the content after each tab change.
- **One lock list:** `MobileLocksProvider` loads the locks (and each lock's newest request, when the user may see history) every 30 s for Home, Devices, Notifications and the bell, so they never disagree.
- **Home:** a greeting with the user's roles, **Needs attention** (the two most severe alerts, "See all" beyond that), one card per lock, a Connection card for the integration, and when the data was last updated with **Refresh**.
- **Lock card (`MobileLockCard`):** a large state in its tone with icon and words: Locked, Unlocked, Jammed, **Locking…/Unlocking…** while a command is on its way ("Still unlocked until the lock reports its new state"), **State unknown**, **State stale**, or **Device unavailable** (lock disconnected). Connection, battery, last contact and the last request. **Lock** (filled) and **Unlock** (outlined) are full width, 56 px tall, with 24 px between them; Unlock asks for confirmation and, when the policy requires it, the identity check. The command lifecycle, wording and "no answer" retry with the same key are the desktop's (`useLockCommand`, `CommandOutcome`); nothing is ever sent again automatically.
- **Lock controls (`/m/locks/:id`):** the same card without its title, the last problem the lock reported, Device details (connection, battery, last contact, last confirmed state, model, masked serial, firmware, commands on or off) and the five most recent requests.
- **Activity:** `GET /activity`: lock requests by their real stage and the state changes the locks reported (the scheduled sync's repeats are dropped), newest first. Filters: All, Requests or Lock reports, and Result (succeeded, failed or unknown, denied, in progress). **Load older activity** pages back 30 at a time. Other people are only "Another user".
- **Devices:** the locks, each linking to its controls, then the person's own devices (see Trusted devices).
- **Notifications:** "Right now": alerts worked out from the locks and the integration (`lib/alerts.ts`): integration offline, sign-in needed or degraded; a lock jammed, offline, stale or unknown; battery at 25% or less (critical at 10%). Then the person's stored notifications with read status (see Security alerts, incidents and notifications).
- **Account security:** account details and roles; two-step verification set-up (after the identity check: an **Open in authenticator app** link with the `otpauth://` address and the key to type, a code, then the recovery codes shown once) and removal with a warning; **Where you are signed in** (`GET /auth/sessions`: browser and system, address, last activity, "This device") and **Sign out everywhere else** after confirming (`DELETE /auth/sessions/others`, audited as `auth.other_sessions_signed_out`). No QR code: on a touch device the link opens the authenticator app directly; on a computer (no coarse pointer) the steps and the setup key, in groups of four with Copy key, come first and the link is a small fallback. Adding a QR library needs approval.
- **Location and proximity:** the browser's location permission (read through the Permissions API without asking for a location), that sharing is on as agreed at sign-in, what LockGuard records and for how long, **When your location was shared** (`GET /location/mine`: each lock request with a position and each administrator's request, with who asked), and why automatic unlocking is unavailable. Proximity is off and near-door detection does not exist.
- **Help and troubleshooting:** expandable answers for an unavailable lock, a degraded integration, unknown or stale state, an unknown or failed command, a denied request, location, and an ended session.

## Testing and accessibility checks

`npm test` runs Vitest with Testing Library in jsdom.
- **Behaviour:** keyboard paths, focus management, live regions, validation wiring and lifecycle mapping.
- **Accessibility:** axe-core runs against each component and against the whole gallery page, using the WCAG 2.0–2.2 A and AA rules.
- **Contrast:** axe can't measure contrast in jsdom, so `src/styles/contrast.test.ts` reads `tokens.css` and checks every color pair the components use, including tone text on its own 12% tint. That test caught blue and gray badge text on `elevated` at 4.43:1 and 4.46:1. `primary-text` and `unknown` were lightened as a result.
- **Phone width:** layout at 390 px is checked with headless Edge driven through the DevTools protocol, using a true 390 px viewport and checking that the page is no wider than the screen.
- **Admin screen tests:** user list filters, suspend with a reason, revoke after the identity re-check, a cancelled re-check, own account, preview-gated saving of roles, giving and removing lock access, creating a user; lock list, registration, lock page diagnostics and settings, a resident's view, an unknown lock; properties; audit log filters, detail and export, a refused export, the permission guard; system health.
- **Dashboard tests:** permission-filtered panels for a resident and an administrator, stale state, unreachable bridge, load failure and retry, and lock commands (stage-by-stage progress, unlock confirmation, identity re-check with a fresh key, refusal, final unknown outcome, same-key retry after no answer, disabled and hidden buttons).
- **Mobile tests:** phone and desktop start pages, permission-filtered tabs, a refused tab by address, focus on tab change, More (account, links, desktop switch remembered, sign-out), the desktop menu's switch to mobile, and the mobile not-found page. Workflows: Home with lock cards, Locking until confirmed, unlock confirmation and cancel, an unknown outcome not sent again, the stale, unknown, unavailable and jammed states, hidden and disabled controls, alerts and the bell count; alert rules; lock controls and a lock that is not yours; Activity filters, paging and load failure; Devices; Notifications; signing out other sessions; two-step set-up through the identity check; Location without a location request; Help. axe runs on every mobile screen: Home, lock controls, Activity, Devices, Notifications, Account security, Location, Help and More.
- **Lock access on the cards:** each lock in the API carries `your_access` (whether the signed-in user's own grant lets them command it now, and why not), worked out by the same rule as the command check. Lock and Unlock are disabled with that reason, for example for an administrator who can see every lock but has no grant. The backend still decides every command.
- **End-to-end (UI checkpoint 8):** the real web app, real API, real queue worker and the real `EufyBridgeDriver` were run against a fake bridge that speaks the bridge's HTTP API, with a throwaway SQLite database, on separate ports (web 5182, API 8101, fake bridge 8790). Playwright drove 75 checks: Locking until confirmed, unlock with confirmation and identity check, not sent (Failed, lock stays Connected, full reason on the lock screen), ambiguous (no second send), never confirmed (Outcome unknown), stale state, bridge offline, a desktop command, guest, auditor and administrator access in the UI and by direct API calls, session expiry, and every mobile screen at 360 and 390 px and desktop screens at 768, 1024 and 1440 px without sideways scrolling. The harness is in `e2e/` (see its README). Playwright is a frontend dev dependency (added 2026-10-22).
- **Table overflow:** screen-reader-only text inside a scrolling table is absolutely positioned; without a positioned ancestor it escaped the scroll area and widened the whole page (the audit log at 1024 px). `DataTable` and `Tabs` scroll areas are `relative` for that reason.
- **Shell tests:** sign-in, MFA, session expiry, unreachable API, permission-filtered navigation, sidebar collapse, drawer, sign-out and the API client (CSRF, retry, timeout, 401) run against a mocked `fetch`.
- **axe on desktop screens:** sign-in, the shell, dashboard, users, a user page, add user, roles, locks, a lock page, properties, audit log and system health.
## Location map and location requests

Decided by the operator on 2026-10-21: **signing in is agreeing to share location**, and administrators' location requests are answered without prompting the person. The sign-in screen says so next to the Sign in button, and each sign-in records the notice version (`lockguard.location.notice_version`) in the audit log. Project.md section 20's "user-visible location status" is met by the person's own Location screen, which lists every time their location was shared and who asked.

**What a phone sends:**
- **With each Lock or Unlock from the mobile app:** `useLockCommand(..., { sendLocation: true })` asks the browser for its position at the moment of the press, sends the command without waiting, then posts the position to `POST /lock-requests/{id}/location`. A denied request carries its `request_id`, so it gets a pin too. If the browser blocks location or has no position, the command goes ahead with no pin. The desktop app never sends a location.
- **When an administrator asks:** `useLocationResponder` in the mobile shell checks `GET /location/requests/pending` on start, every 10 seconds while the app is visible, and when it becomes visible again. It answers with the position, or with why there is none (`permission_denied`, `position_unavailable`, `timeout`, `unsupported`). Nothing is shown on the phone. A closed or hidden browser cannot answer, and the request expires after 2 minutes (`LOCKGUARD_LOCATION_REQUEST_TTL_SECONDS`).

**HTTPS is required.** Browsers give a position only to pages opened over HTTPS (or on localhost). Opened at a plain-HTTP address such as the LAN address, the phone answers `unsupported`, lock requests get no pin, and the Location screen says the address cannot share location.

**Location map** (`/location`, desktop, Security group; needs `location.view_history`, which only Super Administrator holds by default):
- An OpenStreetMap map (Leaflet 1.9.4, loaded only with this page) with a pin per record. Pins carry a mark as well as a color: ✓ succeeded, ✕ failed, ! denied, ? outcome unknown, … in progress, ● location shared on request. Hovering over or tabbing to a pin shows who, the date and time, the result, and the accuracy. Each pin is named for screen readers, and the same records are listed in a table under the map.
- Period: last 24 hours, 7 days or 30 days. Every view is audited (`location.history_viewed`).
- **Request location:** choose a person (active users) and send, after the identity re-check. The page follows the request every 3 seconds and says when the location arrives (and centers on it), when the phone answered without one, or when it expired unanswered. Requests are audited (`location.requested`), and so are answers (`location.shared`).

**Kept and checked by the backend:** coordinates on the globe, accuracy above 0 and at most 10 km, a capture time no more than 2 minutes old; a lock request's location only from its requester within 5 minutes; an answer only from the person asked, once, while the request is open. Positions come from the browser and are not proof of anything; they never affect a lock decision. `lockguard:prune-locations` runs daily and deletes location reports and requests older than `LOCKGUARD_LOCATION_RETENTION_DAYS` (30 by default). The lock requests themselves stay in the activity and audit logs.

**Changing the notice:** edit the text in `LoginPage.tsx` and raise `notice_version` in `config/lockguard.php` together, so the audit log shows which wording each sign-in agreed to.

## Security alerts, incidents and notifications

Built on 2026-10-22 (project.md sections 18 and 22, 34.6 G and 34.8 G).

**Alert engine** (`app/Services/Security/AlertEngine.php`):
- **Event rules** read the audit trail. `AuditLogger` hands each watched record to the engine once the caller's transaction has committed, so nothing is raised for an operation that rolled back, and an alerting failure never fails the operation. Repeated failed sign-ins and identity checks (5 in 15 minutes per account, or per address for unknown accounts; High), repeated denied lock requests (3 in 15 minutes per person; Medium), repeated failed or unconfirmed commands (3 in 30 minutes per lock; High), a command whose outcome is unknown (Medium), an administrative or sensitive permission given by role or override (Medium; ordinary door access is not reported), two-step sign-in turned off (Medium), a recovery code used (Low).
- **Condition rules** run every minute (`lockguard:check-alerts`, scheduled): the Eufy integration unreachable or needing sign-in (Critical) or degraded (High), a lock offline (High), jammed (High), with stale or unknown state (Medium), battery at 25% or less (Medium; 10% or less High), audit protection triggers missing (Critical), and a failed audit write noted by `AuditLogger` (Critical). Condition alerts resolve themselves when the condition clears and cannot be resolved by hand.
- **Storm control:** one active alert per problem (repeats add to its count), a problem that returns within 60 minutes of resolving reopens its alert without notifying again, event alerts with no new occurrence for 24 hours resolve themselves, and each person gets at most 20 alert notifications an hour (Critical is never held back). All thresholds are `LOCKGUARD_ALERT_*` settings in `.env`.
- **Correlation:** High and Critical alerts open an incident, or join the open incident about the same lock, account, address or subsystem.
- **Not alerts:** location anomalies (a phone's position proves nothing, project.md 18). Device alerts are described under Trusted devices.

**Incidents:** New, Acknowledged, Investigating, Contained, Resolved, Closed. Any status may follow another except that Closed is final. Every change is kept in the incident's history with who made it and an optional note, and is audited (`security.incident_status_changed`). Resolving or closing an incident resolves its event alerts.

**Permissions:** `admin.incidents_view` to see alerts and incidents (Super Administrator, Security Administrator, Read-Only Auditor); the new `admin.incidents_manage` to acknowledge and resolve alerts, open incidents and change their status (Super Administrator, Security Administrator; migration `2026_10_22_000004` adds it to the existing built-in roles). No step-up, so a handler can respond at once.

**Notifications** are Laravel database notifications (`notifications` table) with read status, in the app only. Incident handlers always receive security notifications, marked as mandatory; no preference can turn them off. People who can currently use a lock are told when it is offline, jammed or low on battery. The person an account alert is about is told in words meant for them ("Failed sign-in attempts on your account"). A failed notification is logged and never removes the alert or its audit record.

**Screens:**
- **Security center** (`/security`, Security group): Alerts (needs attention by default; status, severity and search filters; Details, Acknowledge, Resolve with a note, Open incident), Incidents (open by default; table linking to each incident), and Security events (ready-made audit views: all failures, refusals, failed and refused sign-ins, denied lock requests, command failures, location failures, Security Center actions, with a link into the audit log). `?alert=<id>` opens an alert's details, which is where notifications link.
- **Incident** (`/security/incidents/:id`): severity, status, who opened it, its alerts, the history, and for handlers a status form. A closed incident says it is final.
- **Notifications** (`/notifications`, Overview group, and the bell in the header with the unread count): All or Unread, Mark read, Mark all read, links to the alert (for people with incident access) and the lock.
- **Mobile Notifications:** "Right now" (the problems worked out live from the locks, as before) and "Your notifications" with read status. The bell shows the unread count, or when everything is read, how many problems need attention now.

## Trusted devices

Built on 2026-10-22 (project.md sections 6, 7, 12, 16 and 34.8 E).

**How a device is recognized:** at sign-in, each browser gets a random 64-character token in an HTTP-only, SameSite=Lax cookie (`lockguard_device`, 400 days) and LockGuard stores only its SHA-256 hash (`user_devices`). The session remembers which device it signed in on. One browser used by two people is a separate device on each account. Sessions from before devices were recorded get their device on their next request, without an alert. The name starts as "Chrome on Android" and so on, and can be changed.

**Standing:** Not trusted (every device that signs in), Trusted, Revoked.
- **Trusting** needs a recent identity check (step-up). People trust only the device in hand; administrators with `devices.enroll` can trust someone else's.
- **Revoking** needs no step-up, so a lost phone can be cut off at once. A revoked device's session ends on its next request (`EnsureDeviceIsAllowed`, the `device` middleware on every signed-in route), it cannot sign in again even with the right password, and its lock requests are refused (`device` check in `LockCommandService`, which re-reads the device). It cannot be un-revoked; a browser whose site data is cleared signs in as a new device.
- **Reporting lost** also revokes it and signs out the account everywhere (sessions and API tokens). When the owner reports it, the session they report from stays signed in.
- **Unlocking with a trusted device only:** `LOCKGUARD_UNLOCK_REQUIRES_TRUSTED_DEVICE=true`. Off by default so nobody is locked out; locking never needs it.

**Who can do what:** everyone lists, renames, revokes and reports lost their own devices (`/api/v1/auth/devices`). `devices.view` lists everyone's (Super, Security Administrator, Property Manager), `devices.rename` renames, `devices.revoke` revokes and reports lost (Super, Security Administrator), `devices.enroll` trusts (Super Administrator). Administrators act on others under the usual user-management rules: not on their own account there, and not on someone who outranks them.

**Audit and alerts:** `device.new_sign_in`, `device.trusted`, `device.renamed`, `device.revoked`, `device.reported_lost` and `device.revoked_access_attempt` (category Devices; also in each person's security history). Alerts:
- **Sign-in from a new device** (Low): only the owner is told, and only for an account's second and later devices.
- **Revoked device used** (High, opens an incident): an attempt to sign in or make a request from a revoked device. Handlers and the owner are told.
- **Device reported lost** (High, opens an incident). Handlers and the owner are told.

**Screens:**
- **Devices** (`/devices`, Access management, for everyone): Your devices, with a "This device is not trusted" prompt to trust the device in hand; for `devices.view` also Everyone's devices, searchable by device, person or email and filtered by status. Actions are in each device's menu: Rename, Trust, Revoke, Report lost. Each confirmation says what happens; administrators also give a reason, which the audit log keeps.
- **User page:** the person's devices with the same actions, for `devices.view`.
- **Mobile Devices:** the locks, then Your devices. **Mobile Account security** links to it.

## Final review (UI checkpoint 9) and remaining limitations

Checked on 2026-10-21 against project.md 34.14 and 34.15:
- **Logo:** the approved logo, unaltered, on sign-in, the session check and "unreachable" screens, the desktop sidebar, the mobile header, the favicon and the PWA icons. The full logo is always on `panel` or lighter.
- **Visual consistency:** no color outside `tokens.css` (no hex values or Tailwind palette colors in components). Every page sets its tab title, including mobile Home, which before this review kept the previous screen's title.
- **Accessibility:** axe (WCAG 2.0–2.2 A and AA) on every screen above, token contrast pairs checked, reduced motion honoured globally, visible focus, skip links, and focus moved to the content on navigation.
- **Navigation and actions:** every sidebar, bottom-bar, More and in-page link leads to a route that exists. The only buttons without a handler are samples in the development-only gallery. The access matrix and the checkpoint 8 end-to-end run cover each role's routes and actions.
- **Placeholders:** no TODO, sample or made-up data in the application. Screens for features without a backend say so in plain words; they are listed below.

**Not built, because the backend has no support yet** (each screen that touches one says so):
- Access codes and access schedules as their own screens; time-limited lock access is on each user's page. The T85D0 has no keypad-code commands.
- Geofences and proximity detection. Locations are collected only for the location map (see Location map and location requests).
- Push notifications. (Built since: Security Center, incidents, stored notifications with read status, the notification center, and on 2026-11-11 email alerts with per-person preferences at /notifications/preferences and /m/notifications/preferences, administrator limits and delivery tracking at /settings/notifications.)
- Global search, editable settings (they live in `.env`), role editing, lockdown, and dashboard widget customization.

**Other limitations:**
- No transparent or vector logo exists; the blend mode stands in (see Branding assets).
- No QR code for two-step set-up, because a QR library needs approval; the `otpauth://` link opens the authenticator on a phone.
- The activity feed's `before` paging can skip events that share the exact millisecond at a page boundary.
- Lock commands validate their body before the permission check (the one exception in the access matrix); the errors only describe format.
- One unexplained Vitest failure was seen on a cold first run during this review. Found on 2026-10-22: the mobile "Locking until confirmed" test raced the command's poll timer under load; the test now holds the lock's report until it has checked the in-between state.
- Alerts, incidents and notifications are kept indefinitely; there is no retention setting for them yet.

## Development

```bash
cd frontend
npm install
npm run dev     # http://127.0.0.1:5173, proxies /api and /sanctum to LOCKGUARD_API_URL (default http://127.0.0.1:8100)
npm run build
npm test        # components, accessibility (axe) and token contrast
```
