/**
 * Privacy guarantees for photos: they live only in the memory of one request. These tests fail if image bytes
 * reach a log line or the database, if a photo is sent to Google more than once, or if anything in api/ gains a
 * way to write files, upload to storage, or use the Gemini Files API (which keeps uploads for 48 h).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const MARK = 'UFJJVkFURVBIT1RPQllURVM' // base64-looking marker standing in for the photo
const dbCalls: unknown[] = []
const fakeDb = {
  rpc: (fn: string, args: unknown) => { dbCalls.push({ fn, args }); return Promise.resolve({ data: { ok: true, shared: true }, error: null }) },
  from: (table: string) => {
    const q: any = // eslint-disable-line @typescript-eslint/no-explicit-any
      { select: () => q, maybeSingle: () => Promise.resolve({ data: table === 'profiles' ? { age: 30 } : null }),
      insert: (row: unknown) => { dbCalls.push({ table, row }); return Promise.resolve({}) } }
    return q
  },
}
vi.mock('../_lib/http.js', async (orig) => ({ ...(await orig<object>()), caller: async () => ({ userId: 'u1', db: fakeDb }) }))

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [] })
}

describe('photos never leave the request', () => {
  const logs: string[] = []
  const spies = (['log', 'info', 'warn', 'error'] as const).map(k => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }))
  afterAll(() => { spies.forEach(s => s.mockRestore()); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('physique photos never go through the shared keys (Google free tier): refused before any Gemini call', async () => {
    vi.stubEnv('FORGE_SHARED_KEYS', 'AIzaTESTKEY000000000000000000000000000')
    const sent: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => { sent.push(String(init?.body ?? '')); return new Response('{}') }))
    vi.resetModules()
    const { POST } = await import('../ai.js')
    const res = await POST(new Request('https://x/api/ai', { method: 'POST', body: JSON.stringify({ task: 'physique_analysis',
      payload: { photos: [{ angle: 'front', mimeType: 'image/jpeg', data: MARK.repeat(50) }], goal: 'lean bulk', age_confirmed: true } }) }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('needs_own_key')
    expect(sent.filter(b => b.includes(MARK))).toHaveLength(0)
  })

  for (const task of ['analyze_food_photo']) {
    it(`${task}: sent to Gemini once, never logged or stored`, async () => {
      vi.stubEnv('FORGE_SHARED_KEYS', 'AIzaTESTKEY000000000000000000000000000')
      const sent: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        sent.push(String(init?.body ?? ''))
        const out = task === 'analyze_food_photo'
          ? { is_food_request: true, items: [{ name: 'Roti', qty: 2, unit: 'piece', grams: 80, calories: 240, protein_g: 7, carbs_g: 44, fat_g: 4, edible: true, confidence: 0.9 }] }
          : { composition_estimate: 'estimate', strengths: [], priorities: [], observations: [], timeline: { range: '6-12 months', assumptions: [], milestones: [] } }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }))
      }))
      const { POST } = await import('../ai.js')
      const payload = task === 'analyze_food_photo'
        ? { image: MARK.repeat(50), mimeType: 'image/jpeg' }
        : { photos: [{ angle: 'front', mimeType: 'image/jpeg', data: MARK.repeat(50) }], goal: 'lean bulk' }
      logs.length = 0; dbCalls.length = 0
      const res = await POST(new Request('https://x/api/ai', { method: 'POST', body: JSON.stringify({ task, payload }) }))
      expect(res.status).toBe(200)
      expect(sent.filter(b => b.includes(MARK))).toHaveLength(1)        // exactly one call carries the photo
      expect(logs.join('\n')).not.toContain(MARK)                         // never in a log line
      expect(JSON.stringify(dbCalls)).not.toContain(MARK)                 // never in the database
      expect(dbCalls).toEqual([{ fn: 'ai_take', args: { p_task: task, p_global_cap: 0, p_global_hour_cap: 0 } }]) // usage holds the task name only
      expect(JSON.stringify(await res.json())).not.toContain(MARK)        // and never echoed back
    })
  }

  it('a photo is sent at most twice even when Google keeps failing, and never to another AI company', async () => {
    vi.stubEnv('FORGE_SHARED_KEYS', 'AIzaTESTKEY000000000000000000000000001,AIzaTESTKEY000000000000000000000000002,AIzaTESTKEY000000000000000000000000003')
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(init?.body ?? '').includes(MARK)) urls.push(String(url))
      return new Response('overloaded', { status: 503 })
    }))
    vi.resetModules()
    const { POST } = await import('../ai.js')
    await POST(new Request('https://x/api/ai', { method: 'POST', body: JSON.stringify({ task: 'analyze_food_photo', payload: { image: MARK.repeat(50), mimeType: 'image/jpeg' } }) }))
    expect(urls.length).toBeLessThanOrEqual(2)
    expect(urls.every(u => u.startsWith('https://generativelanguage.googleapis.com/'))).toBe(true)
  })

  it('api/ has no way to persist or upload a photo', () => {
    const banned: [RegExp, string][] = [
      [/\bwriteFile|appendFile|createWriteStream|mkdtemp|['"]node:fs['"]|from ['"]fs['"]/, 'filesystem write'],
      [/\/tmp\b|os\.tmpdir/, 'temp directory'],
      [/\.storage\b|\.upload\(/, 'Supabase storage upload'],
      [/upload\/v1beta\/files|\/v1beta\/files|fileData|files\.upload/, 'Gemini Files API'],
    ]
    for (const f of files(join(process.cwd(), 'api')).filter(f => !f.includes('_tests'))) {
      const src = readFileSync(f, 'utf8')
      for (const [re, what] of banned) expect(re.test(src), `${f}: ${what}`).toBe(false)
      // A log line may carry status, timing, task and model names; never the request body, payload or image data.
      for (const line of src.split('\n').filter(l => /console\.(log|info|warn|error)/.test(l))) {
        expect(/payload|body|image|inlineData|\bdata\b|photos|request\)/.test(line), `${f}: ${line.trim()}`).toBe(false)
      }
    }
  })
})

describe('only photos reach Gemini', () => {
  it('rejects documents and oversized images', async () => {
    const { imagesOk } = await import('../ai.js')
    expect(imagesOk('analyze_food_photo', { image: 'abc', mimeType: 'image/jpeg' })).toBe(true)
    expect(imagesOk('analyze_food_photo', { image: 'abc', mimeType: 'application/pdf' })).toBe(false)
    expect(imagesOk('analyze_food_photo', { image: 'x'.repeat(4_000_001), mimeType: 'image/png' })).toBe(false)
    expect(imagesOk('physique_analysis', { photos: [{ mimeType: 'image/webp', data: 'a' }], reference: { mimeType: 'text/html', data: 'a' } })).toBe(false)
    expect(imagesOk('parse_food_text', { text: 'dal' })).toBe(true)
  })
})
