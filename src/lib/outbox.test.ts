import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake Supabase: `down` makes every request fail like a dropped connection.
const server = { down: false, rows: new Map<string, unknown>() }
vi.mock('./supabase', () => {
  const q = (t: string) => ({
    upsert: (row: { id: string }) => ({ select: () => ({ single: async () => {
      if (server.down) throw new TypeError('Failed to fetch')
      server.rows.set(`${t}:${row.id}`, row); return { data: row, error: null }
    } }) }),
    delete: () => ({ eq: async (_: string, id: string) => {
      if (server.down) throw new TypeError('Failed to fetch')
      server.rows.delete(`${t}:${id}`); return { error: null }
    } }),
  })
  return { supabaseConfigured: true, supabase: { from: q, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } }
})

const db = await import('./db')

describe('offline saving (web)', () => {
  beforeEach(() => { localStorage.clear(); server.down = false; server.rows.clear(); db.setLocalMode(false) })

  it('keeps a meal logged offline and uploads it once back online', async () => {
    server.down = true
    await db.put('food_logs', { id: 'm1', name: 'Poha' } as never)   // must not throw
    expect(db.pendingCount()).toBe(1)
    expect(await db.flushOutbox()).toBe(1)                            // still down: stays queued, no duplicate
    expect(db.pendingCount()).toBe(1)
    server.down = false
    expect(await db.flushOutbox()).toBe(0)
    expect(server.rows.has('food_logs:m1')).toBe(true)
  })

  it("wipes the previous person's saved data when someone else signs in", () => {
    localStorage.setItem('forge:cache:food_logs', '[{"id":"x"}]')
    db.claimDevice('alice'); db.claimDevice('bob')
    expect(localStorage.getItem('forge:cache:food_logs')).toBeNull()
  })
})
