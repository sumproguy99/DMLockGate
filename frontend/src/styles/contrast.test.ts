// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/*
 * Checks the WCAG 2.2 contrast of the color pairs the components actually use, computed from
 * tokens.css itself, so a token change that breaks contrast fails here.
 */

const colors = Object.fromEntries(
  Array.from(tokensCss.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi), (m) => [m[1], m[2]]),
) as Record<string, string>

type Rgb = [number, number, number]

function rgb(name: string): Rgb {
  const hex = name.startsWith('#') ? name : colors[name]
  if (!hex) {
    throw new Error(`No color token ${name}`)
  }
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

/** A token at `alpha` over a solid surface, as Tailwind's bg-<token>/<n> renders it. */
function blend(top: Rgb, alpha: number, under: Rgb): Rgb {
  return top.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const surfaces = ['bg', 'panel', 'panel-2', 'elevated'] as const
const textTokens = ['text', 'text-muted', 'unknown', 'primary-text', 'success', 'warning', 'danger-text']

/** Tone text over its own 12% tint (badges, banners), as in components/ui/tones.ts. */
const toneTints: Array<[text: string, tint: string]> = [
  ['primary-text', 'primary'],
  ['success', 'success'],
  ['warning', 'warning'],
  ['danger-text', 'danger'],
  ['unknown', 'unknown'],
]

describe('design token contrast (WCAG 2.2 AA)', () => {
  it('reads every token it checks', () => {
    for (const name of [...surfaces, ...textTokens, 'primary-strong', 'danger-strong', 'border-strong', 'highlight']) {
      expect(colors[name], name).toMatch(/^#/)
    }
  })

  it.each(surfaces.flatMap((s) => textTokens.map((t) => [t, s])))('%s text on %s is at least 4.5:1', (text, surface) => {
    expect(contrast(rgb(text), rgb(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(surfaces.flatMap((s) => toneTints.map(([t, tint]) => [t, tint, s])))(
    '%s text on a 12 percent %s tint over %s is at least 4.5:1',
    (text, tint, surface) => {
      expect(contrast(rgb(text), blend(rgb(tint), 0.12, rgb(surface)))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(['primary-strong', 'danger-strong'])('white button text on %s is at least 4.5:1', (fill) => {
    expect(contrast(rgb('#ffffff'), rgb(fill))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['bg', 'panel', 'panel-2'])('form-field outlines on %s are at least 3:1', (surface) => {
    expect(contrast(rgb('border-strong'), rgb(surface))).toBeGreaterThanOrEqual(3)
    expect(contrast(rgb('danger-text'), rgb(surface))).toBeGreaterThanOrEqual(3)
  })

  it.each(surfaces)('the focus ring on %s is at least 3:1', (surface) => {
    expect(contrast(rgb('highlight'), rgb(surface))).toBeGreaterThanOrEqual(3)
  })
})
