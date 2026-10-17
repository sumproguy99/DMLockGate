import axe from 'axe-core'
import { expect } from 'vitest'

/**
 * Runs axe-core (WCAG 2.0–2.2 A and AA rules) against a rendered container and fails with the
 * violations listed. Color contrast is skipped here because jsdom does not compute styles; the
 * token contrast is checked separately in src/styles/contrast.test.ts.
 */
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`,
  )
  expect(summary).toEqual([])
}
