/* FORGE landing — motion + interactions. Transform/opacity only; everything degrades without JS. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]

  /* ---------- Loader (≤ 1.6 s) ---------- */
  const count = $('.loader-count')
  let n = 0
  const t0 = performance.now()
  const tick = () => {
    n = Math.min(100, Math.round(((performance.now() - t0) / 1200) * 100))
    count.textContent = n
    if (n < 100) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const ready = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r)))
  Promise.race([ready.then(() => new Promise(r => setTimeout(r, 600))), new Promise(r => setTimeout(r, 1600))])
    .then(() => { document.body.classList.add('loaded'); intro() })

  /* ---------- Platform hint: put the right button first ---------- */
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (ios) {
    const cta = $('.hero-cta'), iosBtn = $('[data-ios]')
    iosBtn.classList.remove('btn-ghost'); cta.prepend(iosBtn)
    cta.querySelector('a[download]').classList.add('btn-ghost')
    selectTab('ios')
  }

  /* ---------- Install tabs ---------- */
  function selectTab(name) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)))
    $$('.steps').forEach(p => { p.hidden = p.dataset.panel !== name })
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)))
  $('[data-ios]').addEventListener('click', () => selectTab('ios'))

  /* ---------- Mobile menu ---------- */
  const burger = $('.burger'), menu = $('.mobile-menu')
  const toggle = open => { burger.setAttribute('aria-expanded', String(open)); menu.classList.toggle('open', open); menu.setAttribute('aria-hidden', String(!open)) }
  burger.addEventListener('click', () => toggle(!menu.classList.contains('open')))
  $$('a', menu).forEach(a => a.addEventListener('click', () => toggle(false)))

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

  /* ---------- Hero word cycle ---------- */
  const words = ['Indian', 'desi', 'Punjabi', 'Bengali', 'Kerala', 'Gujarati', 'Naga', 'Kashmiri', 'ghar ka']
  const cyc = $('.cycle')
  let wi = 0
  if (!reduce) setInterval(() => {
    wi = (wi + 1) % words.length
    if (window.gsap) gsap.to(cyc, { yPercent: -40, opacity: 0, duration: .25, ease: 'power2.in', onComplete: () => { cyc.textContent = words[wi]; gsap.fromTo(cyc, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .35, ease: 'power3.out' }) } })
    else cyc.textContent = words[wi]
  }, 2600)

  if (reduce || !window.gsap) { $$('.count').forEach(c => { c.textContent = Number(c.dataset.to).toLocaleString('en-IN') }); $$('.scrub').forEach(s => s.style.opacity = 1); return }

  /* ---------- GSAP stack ---------- */
  gsap.registerPlugin(ScrollTrigger)
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add(t => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return
    const el = $(id); if (!el) return
    e.preventDefault(); lenis.scrollTo(el, { offset: -80 })
  }))

  // Progress bar + nav hide on scroll-down
  const nav = $('.nav')
  let lastY = 0
  let marqueeBoost = 0, mx = 0
  lenis.on('scroll', ({ scroll, limit, velocity }) => {
    $('.progress').style.transform = `scaleX(${limit ? scroll / limit : 0})`
    nav.classList.toggle('hide', scroll > 300 && scroll > lastY && !menu.classList.contains('open'))
    lastY = scroll
    marqueeBoost = Math.min(6, Math.abs(velocity) * 0.4)
  })

  function intro() {
    if (reduce || !window.gsap) return
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
    tl.from('.hero-title .line > span', { yPercent: 110, duration: 1.1, stagger: .09 })
      .from('.hero-copy .reveal', { y: 24, opacity: 0, duration: .8, stagger: .08 }, '-=.7')
      .from('.phone', { y: 80, opacity: 0, rotateY: -30, duration: 1.2 }, '-=1')
      .from('.nav', { y: -30, opacity: 0, duration: .6 }, '-=1')
      .to('.s-ring .arc', { strokeDashoffset: 264 * (1 - .6), duration: 1.4, ease: 'power2.out' }, '-=.6')
    countUp($('.phone .count'), 1.4)
  }

  // Counters
  function countUp(el, dur = 1.6) {
    const to = Number(el.dataset.to), o = { v: 0 }
    gsap.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString('en-IN') } })
  }
  $$('.count').filter(c => !c.closest('.phone')).forEach(c => ScrollTrigger.create({ trigger: c, start: 'top 85%', once: true, onEnter: () => countUp(c) }))

  // Split-word title reveals
  $$('.split').forEach(el => {
    el.innerHTML = el.innerHTML.replace(/(<[^>]+>)|([^<\s]+)/g, (m, tag, word) => tag ?? `<span class="word" style="display:inline-block">${word}</span>`)
    gsap.from($$('.word', el), { yPercent: 60, opacity: 0, stagger: .04, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 82%' } })
  })

  // Scroll-scrubbed statement, word by word
  $$('.scrub').forEach(el => {
    el.innerHTML = el.textContent.split(' ').map(w => `<span class="w">${w}</span>`).join(' ')
    gsap.to($$('.w', el), { opacity: 1, stagger: .05, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } })
  })

  // Fade + lift, staggered cards
  $$('.bento, .sec-grid, .steps, .faq').forEach(g => gsap.from(g.children, { y: 40, opacity: 0, duration: .8, stagger: .06, ease: 'power3.out', scrollTrigger: { trigger: g, start: 'top 85%' } }))

  // Parallax blobs + phone
  gsap.to('.b1', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
  gsap.to('.hero-phone', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })

  // Pinned horizontal rail of states
  const rail = $('.india-rail')
  const distance = () => Math.max(0, rail.scrollWidth - innerWidth)
  gsap.to(rail, { x: () => -distance(), ease: 'none', scrollTrigger: { trigger: '.india', start: 'top top', end: () => '+=' + distance(), pin: '.india-pin', scrub: 0.6, invalidateOnRefresh: true } })

  // Marquee whose speed follows scroll velocity
  const track = $('.marquee-track')
  gsap.ticker.add(() => {
    mx -= 0.6 + marqueeBoost; marqueeBoost *= 0.92
    const half = track.scrollWidth / 2
    if (-mx >= half) mx += half
    track.style.transform = `translate3d(${mx}px,0,0)`
  })

  if (!fine) return

  // Cursor with context labels
  const cur = $('.cursor'), curLabel = $('.cursor span')
  const qx = gsap.quickTo(cur, 'x', { duration: .25, ease: 'power3' }), qy = gsap.quickTo(cur, 'y', { duration: .25, ease: 'power3' })
  addEventListener('pointermove', e => { qx(e.clientX); qy(e.clientY) })
  $$('[data-cursor]').forEach(el => {
    el.addEventListener('pointerenter', () => { curLabel.textContent = el.dataset.cursor.toUpperCase(); cur.classList.add('label') })
    el.addEventListener('pointerleave', () => cur.classList.remove('label'))
  })

  // Cursor-following hero blobs
  addEventListener('pointermove', e => {
    const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5
    gsap.to('.b1', { x: x * 80, y: y * 60, duration: 1.2, ease: 'power2.out', overwrite: 'auto' })
    gsap.to('.b2', { x: -x * 60, y: -y * 40, duration: 1.4, ease: 'power2.out', overwrite: 'auto' })
  })

  // Magnetic buttons
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); gsap.to(b, { x: (e.clientX - r.left - r.width / 2) * .25, y: (e.clientY - r.top - r.height / 2) * .35, duration: .4, ease: 'power3.out' }) })
    b.addEventListener('pointerleave', () => gsap.to(b, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1, .4)' }))
  })

  // 3D tilt + spotlight
  $$('.tilt').forEach(c => {
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
      c.style.setProperty('--mx', `${px * 100}%`); c.style.setProperty('--my', `${py * 100}%`)
      gsap.to(c.classList.contains('hero-phone') ? '.phone' : c, { rotateY: (px - .5) * 10, rotateX: (.5 - py) * 8, duration: .5, ease: 'power2.out', transformPerspective: 900 })
    })
    c.addEventListener('pointerleave', () => gsap.to(c.classList.contains('hero-phone') ? '.phone' : c, { rotateY: c.classList.contains('hero-phone') ? -14 : 0, rotateX: c.classList.contains('hero-phone') ? 6 : 0, duration: .8, ease: 'power3.out' }))
  })
})()
