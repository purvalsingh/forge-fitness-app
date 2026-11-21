/* FORGE landing motion. No libraries: IntersectionObserver for reveals and count-ups,
   one rAF loop for scroll progress, timeline fill and pointer tilt, magnetic buttons on fine pointers. */
(() => {
  // Live theme: tapping a swatch repaints the page with that app palette, remembered per visitor.
  const meta = document.querySelector('meta[name="theme-color"]')
  const setTheme = (btn, save) => {
    const [g1, g2, g3, a1, a2, p1, p2, p3] = btn.dataset.c.split(',')
    const r = document.documentElement.style
    Object.entries({ g1, g2, g3, a1, a2, p1, p2, p3 }).forEach(([k, v]) => r.setProperty('--' + k, v))
    meta && meta.setAttribute('content', g2)
    document.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', b === btn))
    if (save) try { localStorage.setItem('forge-theme', btn.dataset.theme) } catch {}
  }
  document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => setTheme(b, true)))
  try { const t = localStorage.getItem('forge-theme'), b = t && document.querySelector(`.sw[data-theme="${t}"]`); b && setTheme(b) } catch {}
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]

  // Split headlines into words for the staggered reveal (screen readers keep the original text).
  $$('[data-words]').forEach(el => {
    el.setAttribute('aria-label', el.textContent.trim())
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w, k) => `<span class="w" style="--k:${k}" aria-hidden="true">${w}</span>`).join(' ')
  })

  // Count numbers up from 0 when they come into view.
  const count = el => {
    const to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || ''
    if (reduce || to === 0) { el.textContent = pre + to.toLocaleString('en-IN') + suf; return }
    const t0 = performance.now(), dur = 1400
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4)
      el.textContent = pre + Math.round(to * e).toLocaleString('en-IN') + suf
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return
    en.target.classList.add('in')
    if (en.target.dataset.count !== undefined) count(en.target)
    io.unobserve(en.target)
  }), { threshold: 0.2, rootMargin: '0px 0px -8% 0px' })
  $$('.reveal, [data-words], [data-count]').forEach(el => io.observe(el))

  // Scroll-linked: progress bar, header border, step timeline fill.
  const root = document.documentElement, top = document.querySelector('.top')
  const tl = document.querySelector('.timeline'), steps = tl ? $$('li', tl) : []
  let ticking = false
  const onScroll = () => {
    ticking = false
    const max = root.scrollHeight - innerHeight
    root.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0)
    top.classList.toggle('scrolled', scrollY > 8)
    if (tl) {
      const r = tl.getBoundingClientRect()
      const fill = Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / r.height))
      tl.style.setProperty('--fill', fill.toFixed(3))
      steps.forEach((li, i) => li.classList.toggle('on', fill >= i / Math.max(1, steps.length - 1) - 0.02))
    }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll) } }, { passive: true })
  onScroll()

  if (reduce || !fine) return

  // Hero: phone tilts and food chips drift toward the pointer (damped).
  const stage = document.querySelector('[data-tilt]')
  if (stage) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0
    const loop = () => {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08
      stage.style.setProperty('--mx', cx.toFixed(3)); stage.style.setProperty('--my', cy.toFixed(3))
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(loop) : 0
    }
    addEventListener('pointermove', e => {
      tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(loop)
    }, { passive: true })
  }

  // Magnetic buttons: follow the cursor a little, spring back on leave.
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect()
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`
    })
    b.addEventListener('pointerleave', () => { b.style.transform = '' })
  })
})()
