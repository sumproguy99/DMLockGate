// Builds docs/manual/index.html from parts/*.html. Shorthand tags: <x-cmd shell where>, <x-code lang where>,
// <x-tip|note|joke|alert|caution title>, <x-term word tech>, <x-shot src frame caption url/>, <x-chapter n id title sub ico c1 c2>, {i:icon-name}.
// Assembles docs/manual/index.html from the chapter parts, expanding the shorthand tags.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
// Run from anywhere: node docs/manual/source/build.mjs
import { fileURLToPath } from 'node:url'
const HERE = fileURLToPath(new URL('.', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '')
const OUT = `${HERE}/../index.html`
// PNG width/height from the file header, so lazy images reserve their space and links land correctly.
const dims = (file) => { const b = readFileSync(file); return `width="${b.readUInt32BE(16)}" height="${b.readUInt32BE(20)}"` }
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attrs = (s) => Object.fromEntries([...(s ?? '').matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const icon = (n, extra = '') => `<svg class="i"${extra} aria-hidden="true"><use href="#i-${n}"/></svg>`
const dedent = (s) => {
  const lines = s.replace(/^\n+|\s+$/g, '').split('\n')
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length))
  return lines.map((l) => l.slice(pad))
}
const copyBtn = (what) => `<button class="copy" type="button" aria-label="Copy ${what}">${icon('copy')}<span>Copy</span></button>`

let html = readdirSync(`${HERE}/parts`).filter((f) => f.endsWith('.html')).sort().map((f) => readFileSync(`${HERE}/parts/${f}`, 'utf8')).join('\n')

// Role comparison chart and permission bars, from the same permission lists as backend/app/Enums/RoleTemplate.php
const ALL = 'lock.view_status lock.lock lock.unlock lock.remote_unlock lock.proximity_unlock lock.view_history users.create users.edit users.suspend users.reactivate users.revoke users.assign_roles users.modify_permissions access.grants_create access.grants_revoke access.schedules_manage access.codes_manage access.codes_sync devices.view devices.enroll devices.rename devices.revoke devices.revoke_sessions location.use location.view_reports location.view_history location.manage_policies location.review_audit admin.integration_settings admin.security_policies admin.notifications admin.incidents_view admin.incidents_manage admin.reports_export admin.audit_retention'.split(' ')
const ROLES = [
  { key: 'super', name: 'Super Administrator', anchor: 'role-super-admin', perms: ALL.filter((p) => p !== 'lock.proximity_unlock') },
  { key: 'security', name: 'Security Administrator', anchor: 'role-security-admin', perms: 'lock.view_status lock.lock lock.view_history users.suspend users.reactivate users.revoke access.grants_revoke devices.view devices.revoke devices.revoke_sessions location.view_reports location.review_audit admin.security_policies admin.notifications admin.incidents_view admin.incidents_manage admin.reports_export'.split(' ') },
  { key: 'manager', name: 'Property Manager', anchor: 'role-property-manager', perms: 'lock.view_status lock.lock lock.unlock lock.remote_unlock lock.view_history users.create users.edit users.suspend users.reactivate access.grants_create access.grants_revoke access.schedules_manage access.codes_manage devices.view'.split(' ') },
  { key: 'resident', name: 'Resident', anchor: 'role-resident', perms: 'lock.view_status lock.lock lock.unlock lock.remote_unlock lock.view_history location.use'.split(' ') },
  { key: 'guest', name: 'Temporary Guest', anchor: 'role-guest', perms: 'lock.view_status lock.lock lock.unlock lock.remote_unlock'.split(' ') },
  { key: 'service', name: 'Service Provider', anchor: 'role-service-provider', perms: 'lock.view_status lock.lock lock.unlock lock.remote_unlock'.split(' ') },
  { key: 'auditor', name: 'Read-Only Auditor', anchor: 'role-auditor', perms: 'lock.view_status lock.view_history location.review_audit admin.incidents_view admin.reports_export'.split(' ') },
]
const FEATURES = [
  ['Doors (only the doors you have been given)'],
  ['See doors and their status', 'lock.view_status'], ['Lock a door', 'lock.lock'], ['Unlock a door from the app', 'UNLOCK_APP'], ['&nbsp;&nbsp;↳ basic unlock permission', 'lock.unlock'], ['&nbsp;&nbsp;↳ remote unlock permission', 'lock.remote_unlock'], ['Walk-up proximity unlock', 'lock.proximity_unlock'], ['See door history', 'lock.view_history'],
  ['People'],
  ['Create people &amp; send invitations', 'users.create'], ['Edit people\'s details', 'users.edit'], ['Suspend an account', 'users.suspend'], ['Reactivate an account', 'users.reactivate'], ['Revoke an account for good', 'users.revoke'], ['Assign roles', 'users.assign_roles'], ['Add individual permission overrides', 'users.modify_permissions'],
  ['Access to doors'],
  ['Give someone access to a lock', 'access.grants_create'], ['Take lock access away', 'access.grants_revoke'], ['Manage access schedules', 'access.schedules_manage'], ['Manage keypad-code records', 'access.codes_manage'], ['Sync keypad codes to the lock', 'access.codes_sync'],
  ['Phones &amp; browsers'],
  ['See everyone\'s devices', 'devices.view'], ['Enroll devices for people', 'devices.enroll'], ['Rename devices', 'devices.rename'], ['Switch off (revoke) a device', 'devices.revoke'], ['Sign someone out everywhere', 'devices.revoke_sessions'],
  ['Location &amp; privacy'],
  ['Share own location for access', 'location.use'], ['See current location reports', 'location.view_reports'], ['See location history &amp; map', 'location.view_history'], ['Change location policies', 'location.manage_policies'], ['Review who looked at locations', 'location.review_audit'],
  ['Administration'],
  ['Eufy integration, properties &amp; lock setup', 'admin.integration_settings'], ['Security policies', 'admin.security_policies'], ['Notifications &amp; email settings', 'admin.notifications'], ['See alerts, incidents &amp; audit log', 'admin.incidents_view'], ['Handle alerts &amp; incidents', 'admin.incidents_manage'], ['Export reports', 'admin.reports_export'], ['Audit retention settings', 'admin.audit_retention'],
  ['Everyone, always'],
  ['Own account, password &amp; two-step sign-in', '*'], ['Own registered phone (see, trust, sign out)', '*'], ['Own notifications', '*'],
]
const yes = '<span class="yes" title="Included">✓</span>', no = '<span class="no" title="Not included">✗</span>'
const some = '<span class="some" title="Not by default: needs the Remote unlock permission added as an override">!</span>'
const cell = (r, key) => {
  if (key === '*') return yes
  if (key === 'UNLOCK_APP') return r.perms.includes('lock.unlock') && r.perms.includes('lock.remote_unlock') ? yes : r.perms.includes('lock.unlock') ? some : no
  return r.perms.includes(key) ? yes : no
}
const matrix = `<div class="filter"><input type="search" data-filter="#role-matrix" placeholder="Filter features… (e.g. unlock, invite, audit)" aria-label="Filter the comparison chart"></div>
<div class="table-wrap" style="max-height:80vh"><table class="matrix" id="role-matrix"><thead><tr><th>Feature</th>${ROLES.map((r) => `<th><i style="background:var(--r-${r.key})"></i><a href="#${r.anchor}" style="color:inherit">${r.name}</a></th>`).join('')}</tr></thead><tbody>${
  FEATURES.map(([label, key]) => key
    ? `<tr><td>${label}${key !== '*' && key !== 'UNLOCK_APP' ? ` <code style="font-size:11px">${key}</code>` : ''}</td>${ROLES.map((r) => `<td>${cell(r, key)}</td>`).join('')}</tr>`
    : `<tr class="group"><td colspan="8">${label}</td></tr>`).join('')
}</tbody></table></div>`
const bars = `<div class="bars">${ROLES.map((r) => `<div class="bar" style="--rc:var(--r-${r.key})"><span>${r.name}</span><div class="track"><div class="fill" data-w="${Math.round(r.perms.length / 35 * 100)}%"></div></div><b>${r.perms.length}</b></div>`).join('')}</div>`

html = html.replace('<!--MATRIX-->', () => matrix).replace('<!--BARS-->', () => bars)

// Commands to run: dark terminal, prompt drawn by CSS (never copied), Copy button.
html = html.replace(/<x-cmd([^>]*)>([\s\S]*?)<\/x-cmd>/g, (_, a, body) => {
  const { shell = 'PowerShell', where = '' } = attrs(a)
  const p = shell === 'PowerShell' ? 'PS>' : '$'
  let cont = false
  const lines = dedent(body).map((l) => {
    const cls = l.startsWith('#') ? 'ln cm' : cont ? 'ln cont' : 'ln'
    cont = /[`\\]$/.test(l)
    return `<span class="${cls}" data-p="${p}">${esc(l)}</span>`
  }).join('')
  return `<div class="cmd"><div class="cmd-bar"><span class="dots"><i></i><i></i><i></i></span><span>${icon('terminal')} ${shell}</span>${where ? `<span class="where">in ${esc(where)}</span>` : ''}${copyBtn('command')}</div><pre><code>${lines}</code></pre></div>`
})

// Syntax to read or paste into a file: light box, settings highlighted, Copy button.
html = html.replace(/<x-code([^>]*)>([\s\S]*?)<\/x-code>/g, (_, a, body) => {
  const { lang = 'text', where = '' } = attrs(a)
  const lines = dedent(body).map((l) => {
    if (/^\s*#/.test(l)) return `<span class="ln"><span class="c">${esc(l)}</span></span>`
    const m = l.match(/^(\s*)([A-Za-z_][\w.]*)(\s*[=:]\s*)(.*)$/)
    if (m && (lang === 'dotenv' || lang === 'ini')) return `<span class="ln">${m[1]}<span class="k">${esc(m[2])}</span>${esc(m[3])}<span class="v">${esc(m[4])}</span></span>`
    return `<span class="ln">${esc(l)}</span>`
  }).join('\n')
  return `<div class="code"><div class="cmd-bar"><span>${icon('file-code')} ${esc(lang)}</span>${where ? `<span class="where">${esc(where)}</span>` : ''}${copyBtn('text')}</div><pre><code>${lines}</code></pre></div>`
})

// Callouts
const callout = (kind, ico, label) => (html = html.replace(new RegExp(`<x-${kind}([^>]*)>([\\s\\S]*?)<\\/x-${kind}>`, 'g'), (_, a, body) => {
  const { title } = attrs(a)
  const role = kind === 'alert' ? ' role="note"' : ''
  return `<aside class="callout ${kind}"${role}><div class="ico">${icon(ico)}</div><div class="label">${label}</div><div class="body">${title ? `<span class="title">${title}</span>` : ''}${body.trim()}</div></aside>`
}))
callout('tip', 'lightbulb', 'Tech tip')
callout('note', 'info', 'Good to know')
callout('joke', 'laugh', 'Byte-sized humor')
callout('alert', 'octagon-alert', 'Alert')
callout('caution', 'triangle-alert', 'Caution')

// Jargon buster: tech talk beside plain talk
html = html.replace(/<x-term([^>]*)>([\s\S]*?)<\/x-term>/g, (_, a, plain) => {
  const { word, tech } = attrs(a)
  return `<div class="term"><div class="tech"><b>${icon('cpu')} Tech talk</b><span class="word">${word}</span><p>${tech}</p></div><div class="plain"><b>${icon('book-open')} Plain talk</b><p>${plain.trim()}</p></div></div>`
})

// Screenshots
html = html.replace(/<x-shot((?:\s+[\w-]+="[^"]*")*)\s*\/>/g, (_, a) => {
  const { src, frame = 'browser', caption = '', url = 'lockguard.example.com', alt = caption } = attrs(a)
  const img = `<img src="img/app/${src}" alt="${alt}" ${dims(`${HERE}/../img/app/${src}`)} loading="lazy">`
  const inner = frame === 'phone' ? `<div class="phone">${img}</div>` : frame === 'tall' ? `<div class="phone tall">${img}</div>` : `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>${url}</span></div>${img}</div>`
  return `<figure>${inner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`
})

// Inline icons {i:name}
html = html.replace(/\{i:([a-z0-9-]+)\}/g, (_, n) => icon(n))

// Chapters
const toc = []
html = html.replace(/<x-chapter([^>]*)>([\s\S]*?)<\/x-chapter>/g, (_, a, body) => {
  const { n, id, title, sub = '', ico = 'book-open', c1 = '#0a6fe0', c2 = '#0d1f35' } = attrs(a)
  const subs = [...body.matchAll(/<h3 id="([^"]+)">([\s\S]*?)<\/h3>/g)].map((m) => ({ id: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() }))
  toc.push({ n, id, title, subs })
  body = body.replace(/<h3 id="/g, '<h3 data-toc id="')
  return `<section class="chapter" id="${id}" style="--c1:${c1};--c2:${c2}"><header class="chapter-head" data-toc id="${id}-head"><span class="n">${n}</span><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${icon(ico)}</header>${body}</section>`
})
// The chapter head carries the observer id; point TOC links at the chapter section.
const nav = toc.map((c) => `<li><a href="#${c.id}"><span class="num">${c.n}</span>${c.title}</a>${c.subs.length ? `<ol>${c.subs.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ol>` : ''}</li>`).join('')
const tocPage = toc.map((c) => `<li><a href="#${c.id}"><b>${c.n}. ${c.title}</b></a>${c.subs.length ? `<ul>${c.subs.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ul>` : ''}</li>`).join('')
html = html.replace('<!--TOC-->', `<ol class="toc-list">${tocPage}</ol>`)

const sprite = readFileSync(`${HERE}/sprite.svg`, 'utf8')
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DM LockGuard Manual</title>
<meta name="description" content="The complete, friendly guide to setting up and using DM LockGuard: roles, step-by-step how-tos, error codes, troubleshooting and glossary.">
<link rel="icon" href="../brand/dmlockguard-icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@500;600&family=Fira+Code:wght@400;500&family=JetBrains+Mono:wght@400;600&family=Lexend:wght@400;600;700;800&family=Patrick+Hand&display=swap" rel="stylesheet">
<link rel="stylesheet" href="manual.css">
</head>
<body>
${sprite}
<header class="topbar">
  <button class="icon-btn menu-btn" id="menu" type="button" aria-label="Show contents">${icon('menu')}</button>
  <a class="brand" href="#top"><img src="../brand/dmlockguard-icon.svg" alt=""><span>DM LockGuard<small>User manual</small></span></a>
  <div class="search" role="search">${icon('search')}<input id="q" type="search" placeholder="Search the manual  ( / )" aria-label="Search the manual" autocomplete="off"><div class="search-results" id="results"></div></div>
  <button class="icon-btn" id="theme" type="button" aria-label="Switch light or dark theme">${icon('sun')}</button>
</header>
<div class="layout">
  <nav class="side" aria-label="Contents"><h2>Contents</h2><ol>${nav}</ol></nav>
  <main id="top">
${html}
<footer class="end"><div class="page">DM LockGuard User Manual · November 2026 · Source: <a href="https://github.com/sumproguy99/DMLockGate">github.com/sumproguy99/DMLockGate</a></div></footer>
  </main>
</div>
<button class="back-top" type="button" aria-label="Back to top">${icon('arrow-up')}</button>
<script src="manual.js"></script>
</body>
</html>
`
writeFileSync(OUT, page)
console.log('built', OUT, Math.round(page.length / 1024) + ' KB', toc.length, 'chapters', toc.reduce((s, c) => s + c.subs.length, 0), 'sections')
const leftovers = page.match(/<x-[a-z]+|\{i:/g)
if (leftovers) console.log('UNEXPANDED:', [...new Set(leftovers)].join(' '))
