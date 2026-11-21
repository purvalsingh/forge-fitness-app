/**
 * App language without touching every component: the English text React renders is the key, and
 * /app/i18n/<code>.json maps it to Hindi or Marathi. A MutationObserver swaps text nodes and a few
 * attributes in place and remembers the English, so switching back to English restores it exactly.
 * Strings without a translation stay English.
 */
export const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['mr', 'मराठी']] as const
export type Lang = (typeof LANGS)[number][0]

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']
let dict: Record<string, string> = {}
// For each node: the English it came with, and the text we last put there. If the node still shows what we
// put there, its English is the saved one; anything else means React wrote new English since.
const original = new WeakMap<Node, { en: string; shown: string }>()
const originalAttr = new WeakMap<Element, Record<string, { en: string; shown: string }>>()
let observer: MutationObserver | null = null

export function currentLang(): Lang {
  try { return (localStorage.getItem('forge:lang') as Lang) || 'en' } catch { return 'en' }
}

function tr(s: string): string | null {
  const core = s.trim()
  if (!core) return null
  const hit = dict[core]
  return hit ? s.replace(core, hit) : null
}

function translateNode(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const p = n.parentElement
    if (!p || p.closest('script,style,textarea,[data-no-i18n]')) return
    const cur = n.nodeValue ?? ''
    const known = original.get(n)
    const base = known && known.shown === cur ? known.en : cur
    const out = tr(base) ?? base
    original.set(n, { en: base, shown: out })
    if (out !== cur) n.nodeValue = out
    return
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return
  const el = n as Element
  if (el.closest('script,style,[data-no-i18n]')) return
  const saved = originalAttr.get(el) ?? {}
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (v == null) continue
    const base = saved[a] && saved[a].shown === v ? saved[a].en : v
    const out = tr(base) ?? base
    saved[a] = { en: base, shown: out }
    if (out !== v) el.setAttribute(a, out)
  }
  originalAttr.set(el, saved)
  el.childNodes.forEach(translateNode)
}

export async function setLang(code: Lang) {
  try { localStorage.setItem('forge:lang', code) } catch { /* private mode */ }
  document.documentElement.lang = code
  dict = {}
  if (code !== 'en') {
    try { dict = await (await fetch(`${import.meta.env.BASE_URL}i18n/${code}.json`)).json() } catch { dict = {} }
  }
  translateNode(document.body)
  if (!observer) {
    observer = new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') translateNode(m.target)
        else if (m.type === 'attributes') translateNode(m.target)
        else m.addedNodes.forEach(translateNode)
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  }
}
