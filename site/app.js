/* FORGE blueprint landing. No libraries: native scroll, one rAF loop.
   Each .sheet gets --d (line work inked) and --f (scan-line fill) from its scroll position. */
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const clamp = v => Math.min(1, Math.max(0, v))
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---------- iOS visitors: open the iPhone install tab ---------- */
  function selectTab(name) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)))
    $$('.steps').forEach(p => { p.hidden = p.dataset.panel !== name })
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)))
  $('[data-ios]').addEventListener('click', () => selectTab('ios'))
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    const cta = $('.hero-cta'), iosBtn = $('[data-ios]')
    iosBtn.classList.remove('btn-ghost'); cta.prepend(iosBtn)
    cta.querySelector('a[download]').classList.add('btn-ghost')
    selectTab('ios')
  }
  $$('.nav-index a').forEach(a => a.addEventListener('click', () => a.closest('details').removeAttribute('open')))


  /* ---------- Accuracy demo (same rules as the app's pre-check) ---------- */
  const NON_FOOD = ['bomb', 'nuke', 'nuclear', 'uranium', 'grenade', 'bullet', 'gun', 'missile', 'poison', 'cyanide', 'bleach', 'detergent', 'soap', 'acid', 'petrol', 'diesel', 'kerosene', 'plastic', 'cement', 'brick', 'stone', 'rock', 'sand', 'metal', 'nail', 'coin', 'battery', 'phone', 'laptop', 'car', 'paper', 'shoe', 'paint', 'glue', 'human', 'sun', 'moon', 'planet', 'star', 'house']
  const OK = ['star fruit', 'star anise', 'rock salt', 'sandwich', 'paper dosa', 'baby corn', 'sun dried']
  const INJ = /(ignore|disregard|forget)\s+(all\s+|the\s+|your\s+|previous\s+|prior\s+)*(instructions|rules|prompt)|system\s*prompt|you\s+are\s+now|jailbreak/i
  const KNOWN = { 'vada pav': [1, 'piece ≈ 150 g', 408, 9.8], 'roti': [1, 'roti ≈ 40 g', 120, 3.6], 'dal tadka': [1, 'katori ≈ 150 g', 180, 9], 'samosa': [1, 'piece ≈ 70 g', 230, 4], 'idli': [1, 'idli ≈ 40 g', 58, 2], 'dosa': [1, 'dosa ≈ 120 g', 210, 5], 'biryani': [1, 'plate ≈ 350 g', 700, 28], 'poha': [1, 'plate ≈ 200 g', 270, 5] }
  function check(text) {
    const t = text.trim()
    if (t.length < 2) return ['', 'Waiting for a meal…']
    if (INJ.test(t)) return ['bad', '✗ Rejected: that isn\'t a meal. Instructions inside a food log are ignored.']
    let w = ` ${t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
    OK.forEach(o => { w = w.replaceAll(o, '') })
    const hit = NON_FOOD.find(b => w.includes(` ${b} `) || w.includes(` ${b}s `))
    if (hit) return ['bad', `✗ Rejected: "${hit}" isn't food. FORGE only logs things people can actually eat.`]
    const m = t.match(/\b(\d{2,})\s*(roti|rotis|eggs?|samosas?|idlis?|dosas?|puris?|pav|plates?)\b/i)
    if (m && Number(m[1]) > 20) return ['bad', `✗ Rejected: ${m[1]} ${m[2]} in one sitting isn't realistic.`]
    const found = Object.keys(KNOWN).filter(k => w.includes(k.split(' ')[0]))
    if (!found.length) return ['ok', '✓ Looks like food. In the app, the AI estimates each item and FORGE checks the numbers against its database.']
    return ['ok', '✓ ' + found.map(k => { const [q, u, kcal, p] = KNOWN[k]; return `${k}: ${q} ${u} · ${kcal} kcal · ${p} g protein` }).join('   ')]
  }
  const input = $('#acc-input'), out = $('.acc-out')
  const run = () => { const [cls, msg] = check(input.value); out.className = 'acc-out mono ' + cls; out.textContent = msg }
  $('.acc-demo').addEventListener('submit', run)
  input.addEventListener('input', () => { if (!input.value) run() })
  $$('.acc-chips .chip').forEach(c => c.addEventListener('click', () => { input.value = c.textContent; run() }))

  /* ---------- hero: trace the real screen's boxes into the blueprint, so line and fill always match ---------- */
  const drawing = $('.drawing'), traced = $('.traced', drawing), NS = 'http://www.w3.org/2000/svg'
  const targets = $$('[data-trace]', drawing).map(el => {
    const shape = document.createElementNS(NS, el.dataset.trace)
    if (el.hasAttribute('data-dash')) shape.style.strokeDasharray = '.012 .012'
    traced.append(shape)
    return { el, shape }
  })
  function trace() {
    const d = drawing.getBoundingClientRect()
    if (!d.width) return
    const k = 640 / d.width
    const box = el => { const r = el.getBoundingClientRect(); return { x: (r.left - d.left) * k, y: (r.top - d.top) * k, w: r.width * k, h: r.height * k } }
    for (const { el, shape } of targets) {
      const b = box(el)
      if (shape.tagName === 'circle') {
        shape.setAttribute('cx', b.x + b.w / 2); shape.setAttribute('cy', b.y + b.h / 2); shape.setAttribute('r', Math.min(b.w, b.h) / 2 * (el.tagName === 'svg' ? .92 : 1))
      } else {
        const rx = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) * k || 0, b.h / 2)
        Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, rx }).forEach(([a, v]) => shape.setAttribute(a, v.toFixed(1)))
      }
    }
    // callout leaders start at the right edge of the element they describe
    $$('.leaders [data-from]', drawing).forEach(l => {
      const b = box($(`[data-callout="${l.dataset.from}"]`, drawing)), y = Number(l.dataset.y)
      const sx = b.x + b.w, sy = b.y + b.h / 2
      l.setAttribute('points', `${sx.toFixed(1)},${sy.toFixed(1)} ${Math.max(sx + 30, 480)},${y} 630,${y}`)
    })
  }
  trace()
  new ResizeObserver(trace).observe(drawing)
  document.fonts?.ready.then(trace)

  /* ---------- drawing setup: normalise every stroke to length 1, stagger by index ---------- */
  $$('.dr').forEach(svg => $$('path, line, rect, circle, polyline', svg).forEach((el, i) => {
    el.setAttribute('pathLength', '1'); el.style.setProperty('--i', i)
  }))
  $$('.bom li, .survey .state, .layers li').forEach(el => el.style.setProperty('--r', [...el.parentNode.children].indexOf(el)))

  const counters = $$('[data-to]').map(el => ({ el, to: Number(el.dataset.to), sheet: el.closest('.sheet'), last: -1 }))
  const fmt = n => n.toLocaleString('en-IN')

  const sheets = $$('.sheet')
  const state = new Map(sheets.map(s => [s, { d: -1, f: -1 }]))
  const ruler = $('.ruler'), roSheet = $('.ro-sheet'), roTitle = $('.ro-title'), roPct = $('.ro-pct')
  let lastSheet = null

  function frame() {
    const vh = innerHeight, max = document.documentElement.scrollHeight - vh
    ruler.style.setProperty('--p', (scrollY / max).toFixed(4))
    roPct.textContent = (scrollY / max * 100).toFixed(1).padStart(5, '0') + '%'
    let current = sheets[0]
    for (const s of sheets) {
      const r = s.getBoundingClientRect()
      if (r.top < vh * .5) current = s
      if (r.bottom < -vh || r.top > vh * 2) continue // offscreen: leave as is
      let p
      if (s.hasAttribute('data-pin')) p = clamp(-r.top / (r.height - vh))           // sticky hero: whole track
      else p = clamp((vh * .92 - r.top) / (Math.min(r.height, vh * 1.6) * .75 + vh * .2))
      const d = reduce ? 1 : clamp(p / .6), f = reduce ? 1 : clamp((p - .4) / .5)
      const st = state.get(s)
      if (Math.abs(st.d - d) > .001) { s.style.setProperty('--d', d.toFixed(4)); st.d = d }
      if (Math.abs(st.f - f) > .001) { s.style.setProperty('--f', f.toFixed(4)); st.f = f }
    }
    if (current !== lastSheet) {
      lastSheet = current
      roSheet.textContent = `SHEET ${current.dataset.sheet} / 08`
      roTitle.textContent = current.dataset.title
    }
    // counters are scrubbed by their sheet's fill, so they run backwards when you scroll up
    if (!reduce) for (const c of counters) {
      const st = state.get(c.sheet), v = Math.round(c.to * (st ? Math.max(st.f, 0) ** .6 : 1))
      if (v !== c.last) { c.el.textContent = fmt(v); c.last = v }
    }
  }
  let queued = false
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; frame() }) } }
  addEventListener('scroll', request, { passive: true })
  addEventListener('resize', request)
  frame()

  /* ---------- survey cells: their dish counts also scrub with the sheet ---------- */
  $$('.survey .state .n').forEach(n => { n.dataset.to = n.textContent.trim(); n.textContent = '0' })
  counters.push(...$$('.survey .state .n').map(el => ({ el, to: Number(el.dataset.to), sheet: el.closest('.sheet'), last: -1 })))
  if (reduce) counters.forEach(c => { c.el.textContent = fmt(c.to) })
  request()

  /* ---------- crosshair with page coordinates (fine pointers only) ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const xh = $('.xhair'), read = $('.xh-read')
    addEventListener('pointermove', e => {
      xh.style.setProperty('--x', e.clientX + 'px'); xh.style.setProperty('--y', e.clientY + 'px')
      read.textContent = `X ${String(Math.round(e.clientX)).padStart(4, '0')} · Y ${String(Math.round(e.clientY + scrollY)).padStart(5, '0')}`
    }, { passive: true })
  }
})()
