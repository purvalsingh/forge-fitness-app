/* FORGE blueprint landing. No libraries: native scroll, one rAF loop.
   Each .sheet gets --d (line work inked) and --f (scan-line fill) from its scroll position. */
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const clamp = v => Math.min(1, Math.max(0, v))
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---------- install tabs (ARIA tabs: click, ←/→, Home/End) ---------- */
  const tabs = $$('.tabs [role="tab"]')
  function selectTab(name, focus) {
    tabs.forEach(b => {
      const on = b.dataset.tab === name
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1
      if (on && focus) b.focus()
    })
    $$('.steps').forEach(p => { p.hidden = p.dataset.panel !== name })
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => selectTab(b.dataset.tab))
    b.addEventListener('keydown', e => {
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
      if (j === undefined) return
      e.preventDefault(); selectTab(tabs[(j + tabs.length) % tabs.length].dataset.tab, true)
    })
  })
  $$('[data-ios]').forEach(a => a.addEventListener('click', () => selectTab('ios')))

  /* ---------- iOS visitors: iPhone path first everywhere ---------- */
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    $$('.hero-cta').forEach(cta => {
      const iosBtn = $('[data-ios]', cta)
      iosBtn.classList.remove('btn-ghost'); cta.prepend(iosBtn)
      cta.querySelector('a[download]').classList.add('btn-ghost')
    })
    const dock = $('[data-dock]')
    dock.removeAttribute('download'); dock.href = '#install'; dock.innerHTML = '<span>Install on iPhone</span>'
    dock.addEventListener('click', () => selectTab('ios'))
    selectTab('ios')
  }

  /* ---------- copy the APK fingerprint ---------- */
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓' } catch { b.textContent = 'Select & copy' }
    setTimeout(() => { b.textContent = 'Copy' }, 2000)
  }))
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
    const qty = parseQty(w)
    const big = qty.find(q => q.n > 20 && !UNITS.has(q.word))
    if (big) return ['bad', `✗ Rejected: ${big.n} ${big.word} in one sitting isn't realistic.`]
    const found = Object.keys(KNOWN).map(k => ({ k, at: w.indexOf(k.split(' ')[0]) })).filter(x => x.at >= 0).sort((x, y) => x.at - y.at)
    if (!found.length) return ['unk', '? Not in this demo\'s short list. In the app, the AI names each item and FORGE checks its numbers against a database of 16,000+ foods before anything is logged.']
    return ['ok', '✓ ' + found.map(({ k, at }) => {
      const n = qty.find(q => q.end <= at && at - q.end <= 2)?.n ?? 1
      const [, u, kcal, p] = KNOWN[k]
      return `${n} × ${k} (${u}) · ${Math.round(kcal * n)} kcal · ${+(p * n).toFixed(1)} g protein`
    }).join('   ')]
  }
  const UNITS = new Set(['g', 'gm', 'gms', 'gram', 'grams', 'ml', 'kcal', 'cal', 'calories', 'minutes', 'mins', 'min', 'km', 'percent'])
  const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000, dozen: 12 }
  // every number in the text with the word after it; `end` is where the next word starts
  function parseQty(w) {
    return [...w.matchAll(/ (\d+|[a-z]+)(?= ([a-z]+))/g)].flatMap(m => {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDS[m[1]]
      return n === undefined ? [] : [{ n, word: m[2], end: m.index + m[1].length + 2 }]
    })
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

  const fmt = n => n.toLocaleString('en-IN')
  $$('.survey .state .n').forEach(n => { n.dataset.to = n.textContent.trim() })
  const counters = reduce ? [] : $$('[data-to]').map(el => ({ el, to: Number(el.dataset.to), sheet: el.closest('.sheet'), done: false }))
  // start at 0 only once JS is running (the HTML keeps the real number for no-JS, crawlers, previews)
  counters.forEach(c => { c.el.textContent = '0' })
  function countUp(c, dur = 900) {
    const t0 = performance.now()
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - 2 ** (-10 * k)   // exponential ease-out
      c.el.textContent = fmt(k === 1 ? c.to : Math.round(c.to * e))
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

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
    // each counter runs once, forwards, when its sheet starts to fill; it never scrubs backwards
    for (const c of counters) if (!c.done && state.get(c.sheet)?.f > .02) { c.done = true; countUp(c) }
    // mobile dock: visible after the hero, hidden at the install steps and the closing CTA
    const hero = sheets[0].getBoundingClientRect(), endZone = $('#install').getBoundingClientRect().top < vh
    document.body.classList.toggle('dock-on', hero.bottom < vh * .5 && !endZone)
  }
  let queued = false
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; frame() }) } }
  addEventListener('scroll', request, { passive: true })
  addEventListener('resize', request)
  frame()


  /* ---------- crosshair with page coordinates (fine pointers only) ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const xh = $('.xhair'), read = $('.xh-read')
    addEventListener('pointermove', e => {
      xh.style.setProperty('--x', e.clientX + 'px'); xh.style.setProperty('--y', e.clientY + 'px')
      read.textContent = `X ${String(Math.round(e.clientX)).padStart(4, '0')} · Y ${String(Math.round(e.clientY + scrollY)).padStart(5, '0')}`
    }, { passive: true })
  }
})()
