// Builds an SVG <symbol> sprite from the app's own icon library (lucide-react), so the manual shows
// exactly the icons people see in LockGuard.
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
// Run: node docs/manual/source/make-sprite.mjs docs/manual/source/sprite.svg (needs frontend/node_modules)
const DIR = fileURLToPath(new URL('../../../frontend/node_modules/lucide-react/dist/esm/icons', import.meta.url)).replaceAll('\\', '/')
const names = `lock lock-open key-round shield-check shield-alert shield-x shield-off shield-question-mark check x chevron-right smartphone map-pin map-pinned bell bell-off wifi wifi-off log-out log-in activity user-plus users trash-2 scroll-text pencil monitor-smartphone monitor history eye eye-off check-check unplug triangle-alert send mail mail-plus mail-check locate-fixed external-link circle-help circle-alert circle-check circle-x circle-slash building-2 battery-low battery-warning battery-medium battery-full undo-2 siren search radar plug-zap play pause panel-left-close menu ellipsis lightbulb life-buoy layout-dashboard laugh info inbox house filter download ban refresh-cw save plus
octagon-alert terminal copy book-open sun moon list wrench file-code sparkles party-popper coffee bug server globe cpu database arrow-right arrow-up book-marked graduation-cap user user-cog user-check user-x hard-hat eye-closed clock calendar-clock route network cloud cable hand target trophy brain fingerprint-pattern qr-code timer link`.split(/\s+/)
const out = []
const missing = []
for (const name of names) {
  const file = `${DIR}/${name}.mjs`
  if (!existsSync(file)) { missing.push(name); continue }
  let mod = await import(pathToFileURL(file).href)
  if (!mod.__iconData) {
    const target = (await import('node:fs')).readFileSync(file, 'utf8').match(/from '\.\/([^']+)'/)
    if (target) mod = await import(pathToFileURL(`${DIR}/${target[1]}`).href)
  }
  const nodes = mod.__iconData?.node ?? mod.default?.iconNode
  if (!nodes) { missing.push(name + '(' + Object.keys(mod).join('/') + ')'); continue }
  const inner = nodes.map(([tag, attrs]) => {
    const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')
    return `<${tag} ${a}/>`
  }).join('')
  out.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`)
}
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${out.join('')}</svg>`)
console.log('symbols', out.length, 'missing', missing.join(' '))
