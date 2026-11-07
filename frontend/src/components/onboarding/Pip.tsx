import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

/**
 * Pip the paperclip: the guide through the invitation, the training and device registration.
 * An original character: a silver paperclip in a navy guard's cap with a gold key badge.
 */
export type PipMood = 'happy' | 'wave' | 'think' | 'cheer' | 'oops' | 'point'

const WIRE = '#d3deea'
const WIRE_EDGE = '#6f8aa6'
const INK = '#0b1726'

const moodLabel: Record<PipMood, string> = {
  happy: 'smiling',
  wave: 'waving hello',
  think: 'thinking',
  cheer: 'cheering',
  oops: 'surprised',
  point: 'pointing',
}

const brows: Record<PipMood, [string, string]> = {
  happy: ['M45 50 Q51 45 57 49', 'M65 49 Q71 45 77 50'],
  wave: ['M45 50 Q51 45 57 49', 'M65 49 Q71 45 77 50'],
  point: ['M45 49 Q51 46 57 49', 'M65 48 Q71 43 77 47'],
  think: ['M45 50 L57 50', 'M65 46 Q71 41 77 45'],
  cheer: ['M45 47 Q51 41 57 46', 'M65 46 Q71 41 77 47'],
  oops: ['M45 53 L57 47', 'M65 47 L77 53'],
}

function Mouth({ mood }: { mood: PipMood }) {
  switch (mood) {
    case 'cheer':
      return <path d="M51 80 Q61 97 71 80 Z" fill="#c2364b" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    case 'oops':
      return <ellipse cx="61" cy="86" rx="4" ry="5" fill="#c2364b" stroke={INK} strokeWidth="2.5" />
    case 'think':
      return <path d="M55 86 Q60 83 67 86" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    default:
      return <path d="M53 81 Q61 91 69 81" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
  }
}

/** Each arm: [path, hand x, hand y]. */
const arms: Record<PipMood, { right: [string, number, number]; left: [string, number, number] }> = {
  happy: { right: ['M90 106 Q104 114 107 128', 107, 130], left: ['M30 106 Q16 114 13 128', 13, 130] },
  wave: { right: ['M90 100 Q106 90 110 72', 110, 69], left: ['M30 106 Q16 114 13 128', 13, 130] },
  point: { right: ['M90 100 Q106 96 124 90', 127, 89], left: ['M30 106 Q16 114 13 128', 13, 130] },
  think: { right: ['M90 110 Q86 100 74 97', 71, 96], left: ['M30 106 Q16 114 13 128', 13, 130] },
  cheer: { right: ['M90 100 Q105 86 107 66', 107, 63], left: ['M30 100 Q15 86 13 66', 13, 63] },
  oops: { right: ['M90 104 Q103 99 105 87', 105, 84], left: ['M30 104 Q17 99 15 87', 15, 84] },
}

type PipProps = {
  mood?: PipMood
  className?: string
  /** Off for small repeated uses, such as inline next to a quiz answer. */
  animated?: boolean
}

export function Pip({ mood = 'happy', className, animated = true }: PipProps) {
  const { left, right } = arms[mood]
  const pupilDy = mood === 'think' ? -3 : 0
  const pupilDx = mood === 'point' ? 2 : 0

  return (
    <svg
      viewBox="0 0 140 200"
      role="img"
      aria-label={`Pip the paperclip, ${moodLabel[mood]}`}
      className={cx('shrink-0 overflow-visible', animated && 'pip-bob', className)}
    >
      {mood === 'cheer' && (
        <g aria-hidden className={animated ? 'pip-confetti' : undefined}>
          <rect x="2" y="20" width="7" height="4" rx="1" fill="#ffb547" transform="rotate(-25 5 22)" />
          <rect x="118" y="26" width="7" height="4" rx="1" fill="#20d990" transform="rotate(30 121 28)" />
          <rect x="20" y="2" width="6" height="4" rx="1" fill="#ff6275" transform="rotate(15 23 4)" />
          <rect x="104" y="6" width="6" height="4" rx="1" fill="#559dff" transform="rotate(-35 107 8)" />
          <circle cx="128" cy="52" r="3" fill="#ffb547" />
          <circle cx="8" cy="48" r="3" fill="#20b8ff" />
        </g>
      )}

      {/* Shadow on the ground */}
      <ellipse cx="60" cy="192" rx="34" ry="5" fill="#000" opacity="0.28" />

      {/* Arms (behind the wire) */}
      <g fill="none" strokeLinecap="round">
        <path d={left[0]} stroke={WIRE_EDGE} strokeWidth="6.5" />
        <path d={left[0]} stroke={WIRE} strokeWidth="3.5" />
        <g className={mood === 'wave' && animated ? 'pip-wave' : undefined} style={{ transformOrigin: '90px 100px', transformBox: 'view-box' }}>
          <path d={right[0]} stroke={WIRE_EDGE} strokeWidth="6.5" />
          <path d={right[0]} stroke={WIRE} strokeWidth="3.5" />
          <circle cx={right[1]} cy={right[2]} r="5.5" fill={WIRE} stroke={WIRE_EDGE} strokeWidth="2" />
        </g>
        <circle cx={left[1]} cy={left[2]} r="5.5" fill={WIRE} stroke={WIRE_EDGE} strokeWidth="2" />
      </g>

      {/* The paperclip body: an edge stroke, the silver wire, and a shine */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M78 64 V135 A18 18 0 0 1 42 135 V40 A24 24 0 0 1 90 40 V150 A30 30 0 0 1 30 150 V72" stroke={WIRE_EDGE} strokeWidth="11" />
        <path d="M78 64 V135 A18 18 0 0 1 42 135 V40 A24 24 0 0 1 90 40 V150 A30 30 0 0 1 30 150 V72" stroke={WIRE} strokeWidth="7" />
        <path d="M88 60 V140" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" />
        <path d="M32 90 V145" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2" />
      </g>

      {/* Guard's cap with a key badge */}
      <g>
        <path d="M38 22 Q66 -2 94 22 L92 28 Q66 22 40 28 Z" fill="#163a63" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M34 28 Q66 20 98 28 Q100 34 92 34 Q66 28 40 34 Q32 34 34 28 Z" fill="#0f2b4c" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="66" cy="15" r="5" fill="#ffb547" stroke={INK} strokeWidth="1.5" />
        <path d="M66 17 V22 M66 20 H69" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Face */}
      <g>
        <path d={brows[mood][0]} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <path d={brows[mood][1]} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <circle cx="51" cy="62" r="9" fill="#fff" stroke={INK} strokeWidth="2.5" />
        <circle cx="71" cy="62" r="9" fill="#fff" stroke={INK} strokeWidth="2.5" />
        <circle cx={52 + pupilDx} cy={63 + pupilDy} r="4" fill={INK} className={animated ? 'pip-blink' : undefined} />
        <circle cx={72 + pupilDx} cy={63 + pupilDy} r="4" fill={INK} className={animated ? 'pip-blink' : undefined} />
        <circle cx={53.5 + pupilDx} cy={61 + pupilDy} r="1.3" fill="#fff" />
        <circle cx={73.5 + pupilDx} cy={61 + pupilDy} r="1.3" fill="#fff" />
        <ellipse cx="46" cy="77" rx="4" ry="2.5" fill="#ff8fa0" opacity="0.6" />
        <ellipse cx="76" cy="77" rx="4" ry="2.5" fill="#ff8fa0" opacity="0.6" />
        <Mouth mood={mood} />
      </g>

      {mood === 'think' && (
        <g aria-hidden fill={WIRE} opacity="0.85">
          <circle cx="104" cy="40" r="3" />
          <circle cx="112" cy="28" r="4.5" />
          <circle cx="124" cy="14" r="7" />
        </g>
      )}
    </svg>
  )
}

type PipSaysProps = {
  mood?: PipMood
  children: ReactNode
  className?: string
  /** A bigger Pip, for welcome and celebration screens. */
  large?: boolean
}

/** Pip beside a speech bubble. The bubble is ordinary text, read in order with the page. */
export function PipSays({ mood = 'happy', children, className, large = false }: PipSaysProps) {
  return (
    <div className={cx('flex items-end gap-2 sm:gap-3', className)}>
      <Pip mood={mood} className={large ? 'h-36 w-24 sm:h-48 sm:w-32' : 'h-24 w-16 sm:h-36 sm:w-24'} />
      <div className="relative mb-3 min-w-0 flex-1 rounded-xl border border-border-strong bg-elevated px-4 py-3 text-body shadow-raised">
        {/* The bubble's tail, pointing at Pip */}
        <span aria-hidden className="absolute bottom-4 -left-2 size-4 rotate-45 border-b border-l border-border-strong bg-elevated" />
        <div className="relative flex flex-col gap-2">{children}</div>
      </div>
    </div>
  )
}
