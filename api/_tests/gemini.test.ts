import { describe, it, expect, vi, afterEach } from 'vitest'
import { callGemini } from '../_lib/gemini.js'

const answer = (v: unknown) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }] }) })
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((r, j) => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); j(new Error('aborted')) }) })

afterEach(() => vi.unstubAllGlobals())

describe('hedged Gemini call', () => {
  it('a stuck first key does not block: the hedge answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      if (init.headers['x-goog-api-key'] === 'key-slow-aaaaaaaa') { await wait(5_000, init.signal); return answer({ who: 'slow' }) }
      return answer({ who: 'fast' })
    }))
    const t0 = Date.now()
    const out = await callGemini(['key-slow-aaaaaaaa', 'key-fast-bbbbbbbb'], { contents: [] }, ['m1'], 2_000, 100)
    expect(out).toEqual({ who: 'fast' })
    expect(Date.now() - t0).toBeLessThan(1_000)
  })
  it('gives up inside the budget when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => { await wait(10_000, init.signal); return answer({}) }))
    const t0 = Date.now()
    const out = await callGemini(['key-a-cccccccc'], { contents: [] }, ['m2'], 500, 100)
    expect(out).toBeNull()
    expect(Date.now() - t0).toBeLessThan(900)
  })
  it('moves straight on after a failure, without waiting for the hedge', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) =>
      init.headers['x-goog-api-key'] === 'key-bad-dddddddd' ? { ok: false, status: 500, json: async () => ({}) } : answer({ ok: 1 })))
    const out = await callGemini(['key-bad-dddddddd', 'key-good-eeeeeeee'], { contents: [] }, ['m3'], 2_000, 5_000)
    expect(out).toEqual({ ok: 1 })
  })
  it('an overloaded (503) model goes to the back; another model answers', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      seen.push(u)
      return u.includes('/busy:') ? { ok: false, status: 503, json: async () => ({}) } : answer({ m: 'calm' })
    }))
    const out = await callGemini(['key-x-ffffffff', 'key-y-gggggggg'], { contents: [] }, ['busy', 'calm'], 2_000, 5_000, 1)
    expect(out).toEqual({ m: 'calm' })
    expect(seen.filter(u => u.includes('/busy:')).length).toBe(1)
  })
  it('retries once without thinkingConfig when a model rejects it', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      const b = JSON.parse(init.body); bodies.push(b)
      return b.generationConfig.thinkingConfig ? { ok: false, status: 400, json: async () => ({}) } : answer({ ok: 2 })
    }))
    const out = await callGemini(['key-z-hhhhhhhh'], { contents: [], generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } }, ['m9'], 2_000, 5_000, 1)
    expect(out).toEqual({ ok: 2 })
    expect(bodies.length).toBe(2)
  })
})
