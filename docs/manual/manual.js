// DM LockGuard User Manual: copy buttons, theme, contents highlighting, search and filters.
(function () {
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s))
  const store = {
    get(k) { try { return localStorage.getItem(k) } catch { return null } },
    set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  }

  // ----- Copy buttons: copy exactly the command (prompts are drawn by CSS, so they are never copied)
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      let ok = false
      try { ok = document.execCommand('copy') } catch { ok = false }
      ta.remove(); return ok
    }
  }
  $$('button.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const box = btn.closest('.cmd, .code')
      const lines = $$('.ln', box)
      const text = lines.length ? lines.map((l) => l.textContent).join('\n') : $('code', box).textContent
      const ok = await copyText(text.replace(/\s+$/, ''))
      const label = $('span', btn)
      btn.classList.toggle('done', ok)
      label.textContent = ok ? 'Copied!' : 'Press Ctrl+C'
      if (!ok) { const r = document.createRange(); r.selectNodeContents($('code', box)); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }
      setTimeout(() => { btn.classList.remove('done'); label.textContent = 'Copy' }, 1800)
    })
  })

  // ----- Theme
  const root = document.documentElement
  const saved = store.get('lg-manual-theme')
  if (saved) root.dataset.theme = saved
  $('#theme')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'light' : 'dark'
    store.set('lg-manual-theme', root.dataset.theme)
  })

  // ----- Mobile contents drawer
  $('#menu')?.addEventListener('click', () => document.body.classList.toggle('nav-open'))
  $$('nav.side a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')))

  // ----- Highlight the section you are reading
  const links = new Map($$('nav.side a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a]))
  const heads = $$('[data-toc]')
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      $$('nav.side a.active').forEach((a) => a.classList.remove('active'))
      const a = links.get(e.target.id.replace(/-head$/, ''))
      if (a) { a.classList.add('active'); a.scrollIntoView({ block: 'nearest' }) }
    })
  }, { rootMargin: '-70px 0px -70% 0px' })
  heads.forEach((h) => obs.observe(h))

  // ----- Search: headings, glossary terms, error codes and troubleshooting questions
  const index = []
  $$('[data-toc], dl.glossary dt, table.errors td:first-child code, details.trouble summary').forEach((el) => {
    const target = el.closest('[id]')
    if (!target) return
    const chapter = el.closest('section.chapter')?.querySelector('.chapter-head h2')?.textContent ?? ''
    index.push({ title: el.textContent.trim(), id: target.id, where: chapter, text: (target.textContent || '').toLowerCase().slice(0, 1500) })
  })
  const input = $('#q'), results = $('#results')
  function search() {
    const q = input.value.trim().toLowerCase()
    if (q.length < 2) { results.classList.remove('open'); return }
    const scored = index.map((it) => {
      const t = it.title.toLowerCase()
      const s = (t.startsWith(q) ? 6 : 0) + (t.includes(q) ? 4 : 0) + (it.text.includes(q) ? 1 : 0)
      return [s, it]
    }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12)
    results.innerHTML = scored.length
      ? scored.map(([, it]) => `<a href="#${it.id}"><b>${it.title.replace(/</g, '&lt;')}</b><span>${it.where}</span></a>`).join('')
      : '<div class="empty">Nothing found. Try another word, or check the Glossary.</div>'
    results.classList.add('open')
  }
  input?.addEventListener('input', search)
  input?.addEventListener('focus', search)
  input?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { results.classList.remove('open'); input.blur() } if (e.key === 'Enter') { $('a', results)?.click() } })
  results?.addEventListener('click', () => results.classList.remove('open'))
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) results?.classList.remove('open') })
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); input?.focus() } })

  // ----- Table and glossary filters
  $$('[data-filter]').forEach((box) => {
    const target = $(box.dataset.filter)
    box.addEventListener('input', () => {
      const q = box.value.trim().toLowerCase()
      $$(target.matches('table') ? 'tbody tr' : '.entry', target).forEach((row) => { row.hidden = q !== '' && !row.textContent.toLowerCase().includes(q) })
    })
  })

  // ----- Launch checklist remembers your ticks (on this computer only)
  $$('ul.checklist input').forEach((box, i) => {
    const key = 'lg-manual-check-' + i
    box.checked = store.get(key) === '1'
    box.addEventListener('change', () => store.set(key, box.checked ? '1' : '0'))
  })

  // ----- Animate the permission bars when they scroll into view
  const bars = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { $$('.fill', e.target).forEach((f) => { f.style.width = f.dataset.w }); bars.unobserve(e.target) }
  }), { threshold: .3 })
  $$('.bars').forEach((b) => bars.observe(b))

  // ----- Back to top
  const top = $('.back-top')
  addEventListener('scroll', () => top?.classList.toggle('show', scrollY > 900), { passive: true })
  top?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }))
})()
