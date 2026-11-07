import { BatteryLow, BatteryMedium, BatteryFull, CircleHelp, Lock as LockIcon, LockOpen, Wifi, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * The training's pictures. Each is a labelled image (the label says what it shows), drawn with the
 * app's own colors so it reads on the dark theme.
 */

function Scene({ label, children, viewBox = '0 0 320 180', className }: { label: string; children: ReactNode; viewBox?: string; className?: string }) {
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className={cx('h-auto w-full max-w-sm', className)}>
      {children}
    </svg>
  )
}

const C = {
  panel: '#101d2c',
  elevated: '#17283a',
  border: '#4a6b8a',
  text: '#f4f7fc',
  muted: '#a8b7c9',
  primary: '#087fff',
  highlight: '#20b8ff',
  success: '#20d990',
  warning: '#ffb547',
  danger: '#ff4057',
  wood: '#8a5a35',
  woodDark: '#5e3b21',
}

function Phone({ x, y, children, glow }: { x: number; y: number; children?: ReactNode; glow?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="64" height="118" rx="12" fill={C.elevated} stroke={glow ?? C.border} strokeWidth="3" />
      <rect x="6" y="12" width="52" height="92" rx="4" fill={C.panel} />
      <rect x="24" y="5" width="16" height="3" rx="1.5" fill={C.border} />
      {children}
    </g>
  )
}

function Door({ x, y, locked = true, label }: { x: number; y: number; locked?: boolean; label?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-8" y="-8" width="96" height="156" rx="4" fill="#24384d" />
      <rect width="80" height="148" rx="3" fill={C.wood} stroke={C.woodDark} strokeWidth="3" />
      <rect x="10" y="12" width="60" height="50" rx="3" fill="none" stroke={C.woodDark} strokeWidth="2.5" />
      <rect x="10" y="74" width="60" height="58" rx="3" fill="none" stroke={C.woodDark} strokeWidth="2.5" />
      <rect x="58" y="66" width="16" height="26" rx="3" fill="#1b2430" stroke="#6f8aa6" strokeWidth="2" />
      <circle cx="66" cy="74" r="3" fill={locked ? C.success : C.warning} />
      <rect x="62" y="81" width="8" height="6" rx="1" fill="#6f8aa6" />
      {label && (
        <text x="40" y="-14" textAnchor="middle" fontSize="12" fontWeight="600" fill={C.muted}>
          {label}
        </text>
      )}
    </g>
  )
}

/** A phone sending a request to a door, and the door answering. */
export function PhoneToDoorScene() {
  return (
    <Scene label="A phone sends a request to a door's smart lock, and the lock sends back what it did.">
      <Phone x={30} y={30}>
        <rect x="12" y="50" width="40" height="16" rx="4" fill={C.primary} />
        <text x="32" y="62" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
          Lock
        </text>
        <text x="32" y="36" textAnchor="middle" fontSize="8" fill={C.muted}>
          Front Door
        </text>
      </Phone>
      <g fill="none" stroke={C.highlight} strokeWidth="3" strokeLinecap="round">
        <path d="M110 70 Q150 50 190 70" strokeDasharray="6 7" />
        <path d="M190 104 Q150 124 110 104" stroke={C.success} strokeDasharray="6 7" />
      </g>
      <path d="M186 64 L194 71 L184 76" fill="none" stroke={C.highlight} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M114 110 L106 103 L116 98" fill="none" stroke={C.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <text x="150" y="44" textAnchor="middle" fontSize="11" fill={C.highlight}>
        please lock
      </text>
      <text x="150" y="140" textAnchor="middle" fontSize="11" fill={C.success}>
        I'm locked!
      </text>
      <Door x={212} y={20} />
    </Scene>
  )
}

/** One phone with a shield: the account works on this phone only. */
export function OnePhoneScene() {
  return (
    <Scene label="Your phone with a shield on it, and a second phone crossed out: your account works on one phone only.">
      <Phone x={70} y={30} glow={C.success}>
        <path d="M32 40 L48 46 V62 Q48 76 32 84 Q16 76 16 62 V46 Z" fill={C.success} opacity="0.9" />
        <path d="M25 62 L30 68 L40 55" fill="none" stroke="#06281b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </Phone>
      <text x="102" y="168" textAnchor="middle" fontSize="12" fontWeight="600" fill={C.success}>
        Your phone
      </text>
      <g opacity="0.55">
        <Phone x={190} y={30} />
        <text x="222" y="168" textAnchor="middle" fontSize="12" fill={C.muted}>
          Someone else's
        </text>
      </g>
      <path d="M186 40 L258 140 M258 40 L186 140" stroke={C.danger} strokeWidth="6" strokeLinecap="round" />
    </Scene>
  )
}

/** A key and a sealed envelope: secrets stay secret. */
export function SecretsScene() {
  return (
    <Scene label="A key and a sealed envelope with a padlock: passwords and codes stay secret.">
      <g transform="translate(40 50)">
        <circle cx="30" cy="40" r="26" fill="none" stroke={C.warning} strokeWidth="10" />
        <path d="M56 40 H130 M110 40 V62 M126 40 V56" stroke={C.warning} strokeWidth="10" strokeLinecap="round" />
      </g>
      <g transform="translate(190 46)">
        <rect width="96" height="66" rx="6" fill={C.elevated} stroke={C.border} strokeWidth="3" />
        <path d="M0 4 L48 40 L96 4" fill="none" stroke={C.border} strokeWidth="3" />
        <rect x="36" y="38" width="24" height="20" rx="4" fill={C.primary} />
        <path d="M41 38 V31 Q48 22 55 31 V38" fill="none" stroke={C.primary} strokeWidth="4" />
      </g>
      <text x="160" y="160" textAnchor="middle" fontSize="13" fontWeight="600" fill={C.muted}>
        Shhh. Some things are just for you.
      </text>
    </Scene>
  )
}

/** A phone with question marks: lost! */
export function LostPhoneScene() {
  return (
    <Scene label="A phone lying under a couch cushion with question marks around it: a lost phone.">
      <rect x="40" y="110" width="240" height="40" rx="14" fill="#3b2a52" />
      <rect x="60" y="86" width="200" height="34" rx="12" fill="#4b3768" />
      <g transform="translate(200 104) rotate(-12)">
        <rect width="50" height="26" rx="5" fill={C.elevated} stroke={C.border} strokeWidth="2.5" />
      </g>
      <text x="90" y="60" fontSize="34" fontWeight="800" fill={C.warning}>
        ?
      </text>
      <text x="150" y="44" fontSize="26" fontWeight="800" fill={C.highlight}>
        ?
      </text>
      <text x="236" y="70" fontSize="30" fontWeight="800" fill={C.danger}>
        ?
      </text>
    </Scene>
  )
}

/** A map with a pin and a little timeline. */
export function LocationScene() {
  return (
    <Scene label="A map with a pin where the phone was when it locked the door, next to a timeline of times.">
      <rect x="20" y="20" width="170" height="140" rx="10" fill="#14324a" stroke={C.border} strokeWidth="2" />
      <path d="M20 70 Q80 60 110 90 T190 100" stroke="#2a5677" strokeWidth="10" fill="none" />
      <path d="M70 20 V160" stroke="#2a5677" strokeWidth="8" />
      <path d="M105 40 C105 25 135 25 135 40 C135 56 120 70 120 78 C120 70 105 56 105 40 Z" fill={C.danger} stroke="#7a1020" strokeWidth="2" />
      <circle cx="120" cy="41" r="6" fill="#fff" />
      <g transform="translate(212 34)">
        <path d="M8 0 V118" stroke={C.border} strokeWidth="3" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0 ${10 + i * 44})`}>
            <circle cx="8" cy="0" r="7" fill={i === 0 ? C.primary : C.elevated} stroke={C.border} strokeWidth="2" />
            <rect x="22" y="-9" width="70" height="18" rx="4" fill={C.elevated} />
            <rect x="28" y="-3" width={i === 0 ? 50 : 38} height="6" rx="3" fill={C.muted} opacity="0.6" />
          </g>
        ))}
      </g>
    </Scene>
  )
}

/** A stranger by the door. */
export function StrangerScene() {
  return (
    <Scene label="A person you do not know standing by a locked door, asking to be let in.">
      <Door x={40} y={20} />
      <g transform="translate(190 40)">
        <circle cx="30" cy="22" r="18" fill="#5c6f86" />
        <path d="M0 120 Q0 50 30 50 Q60 50 60 120 Z" fill="#5c6f86" />
        <rect x="14" y="12" width="32" height="10" rx="4" fill="#1b2430" />
      </g>
      <g transform="translate(150 20)">
        <rect width="104" height="30" rx="10" fill={C.elevated} stroke={C.border} strokeWidth="2" />
        <text x="52" y="20" textAnchor="middle" fontSize="11" fill={C.text}>
          "Let me in? Pleeease?"
        </text>
      </g>
    </Scene>
  )
}

/** A lifebuoy: help is here. */
export function HelpScene() {
  return (
    <Scene label="A life ring floating on waves: help is always close.">
      <path d="M0 140 Q40 124 80 140 T160 140 T240 140 T320 140 V180 H0 Z" fill="#14324a" />
      <circle cx="160" cy="86" r="52" fill="none" stroke={C.danger} strokeWidth="26" />
      <circle cx="160" cy="86" r="52" fill="none" stroke="#fff" strokeWidth="26" strokeDasharray="40.8 40.8" />
      <circle cx="160" cy="86" r="65" fill="none" stroke="#7a1020" strokeWidth="1.5" />
      <circle cx="160" cy="86" r="39" fill="none" stroke="#7a1020" strokeWidth="1.5" />
    </Scene>
  )
}

/** The bell that shows notifications. */
export function BellScene() {
  return (
    <Scene label="A notification bell with a red dot: LockGuard telling you something important.">
      <path d="M160 30 C130 30 118 54 118 84 V110 L104 128 H216 L202 110 V84 C202 54 190 30 160 30 Z" fill={C.warning} stroke="#7a5212" strokeWidth="3" />
      <circle cx="160" cy="140" r="12" fill={C.warning} stroke="#7a5212" strokeWidth="3" />
      <circle cx="200" cy="44" r="14" fill={C.danger} stroke="#fff" strokeWidth="3" />
      <text x="200" y="49" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
        1
      </text>
    </Scene>
  )
}

export type MockDoorState = 'locked' | 'unlocked' | 'unknown' | 'locking' | 'unlocking'

const doorStateView: Record<MockDoorState, { label: string; icon: typeof LockIcon; tone: string; surface: string }> = {
  locked: { label: 'Locked', icon: LockIcon, tone: 'text-success', surface: 'border-success/40 bg-success/10' },
  unlocked: { label: 'Unlocked', icon: LockOpen, tone: 'text-warning', surface: 'border-warning/40 bg-warning/10' },
  unknown: { label: 'Unknown', icon: CircleHelp, tone: 'text-unknown', surface: 'border-unknown/40 bg-unknown/10' },
  locking: { label: 'Locking…', icon: LockIcon, tone: 'text-primary-text', surface: 'border-primary/40 bg-primary/10' },
  unlocking: { label: 'Unlocking…', icon: LockOpen, tone: 'text-primary-text', surface: 'border-primary/40 bg-primary/10' },
}

type MockDoorCardProps = {
  name: string
  state: MockDoorState
  battery?: number
  online?: boolean
  reported?: string
  className?: string
}

/** A pretend door card, shaped like the real one on Home. Not connected to any lock. */
export function MockDoorCard({ name, state, battery = 80, online = true, reported = '2 minutes ago', className }: MockDoorCardProps) {
  const view = doorStateView[state]
  const Icon = view.icon
  const Battery = battery <= 20 ? BatteryLow : battery <= 60 ? BatteryMedium : BatteryFull
  const pending = state === 'locking' || state === 'unlocking'

  return (
    <div className={cx('flex w-full flex-col gap-2 rounded-lg border border-border bg-panel p-3 text-left', className)}>
      <span className="text-panel-title">{name}</span>
      <span className={cx('flex items-center gap-3 rounded-md border p-2', view.surface)}>
        <Icon className={cx('size-6 shrink-0', view.tone, pending && 'animate-pulse')} aria-hidden />
        <span className="flex flex-col">
          <span className={cx('text-section', view.tone)}>{view.label}</span>
          <span className="text-caption text-text-muted">
            {pending ? 'Waiting for the lock to say so' : state === 'unknown' ? 'No reliable report from the lock' : `Lock reported ${reported}`}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted">
        <span className="inline-flex items-center gap-1">
          {online ? <Wifi className="size-4 text-success" aria-hidden /> : <WifiOff className="size-4 text-danger-text" aria-hidden />}
          {online ? 'Online' : 'Offline'}
        </span>
        <span className={cx('inline-flex items-center gap-1', battery <= 20 && 'font-semibold text-warning')}>
          <Battery className="size-4" aria-hidden />
          Battery {battery}%
        </span>
      </span>
    </div>
  )
}

/** The browser's location question, as most phones show it. */
export function BrowserLocationPrompt({ onAllow, onBlock, answered }: { onAllow: () => void; onBlock: () => void; answered: 'allow' | 'block' | null }) {
  return (
    <div className="w-full max-w-sm rounded-lg border border-border-strong bg-elevated p-4 shadow-raised">
      <p className="text-support">
        <span className="font-semibold">lockguard.dmfmedia.net</span> wants to
      </p>
      <p className="mt-1 flex items-center gap-2 text-support text-text-muted">
        <span aria-hidden>📍</span> Know your location
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onBlock}
          aria-pressed={answered === 'block'}
          className="min-h-11 rounded-md px-4 text-support font-semibold text-text-muted hover:bg-panel-2 aria-pressed:bg-panel-2"
        >
          Block
        </button>
        <button
          type="button"
          onClick={onAllow}
          aria-pressed={answered === 'allow'}
          className="min-h-11 rounded-md bg-primary-strong px-4 text-support font-semibold text-white hover:bg-primary"
        >
          Allow
        </button>
      </div>
    </div>
  )
}
