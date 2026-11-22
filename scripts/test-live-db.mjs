/**
 * Live database checks on a throwaway account (run after migrations 0007 + 0009 are applied):
 *   1. 10 parallel ai_take() calls let through at most the per-minute limit (6 on the shared pool).
 *   2. delete_my_account() really deletes the account; signing in afterwards fails.
 * Usage: node scripts/test-live-db.mjs   (SITE defaults to the live site; the publishable key is read from dist/)
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'

const SITE = process.env.SITE ?? 'https://forgefit-india.vercel.app'
const SB = `${SITE}/sb`
const assets = fs.readdirSync('dist/app/assets').filter(f => f.endsWith('.js'))
const KEY = process.env.SUPABASE_ANON_KEY ?? assets.map(f => fs.readFileSync(`dist/app/assets/${f}`, 'utf8').match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]).find(Boolean)
if (!KEY) throw new Error('No publishable key: run npm run build first or set SUPABASE_ANON_KEY')

const email = `forge-dbtest+${Date.now()}@example.com`
const password = `Db-${randomBytes(12).toString('base64url')}`
const post = (path, body, token) => fetch(`${SB}${path}`, {
  method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})

const signup = await (await post('/auth/v1/signup', { email, password })).json()
const token = signup.access_token
if (!token) throw new Error(`signup failed: ${JSON.stringify(signup).slice(0, 200)}`)
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed = true }

try {
  const res = await Promise.all(Array.from({ length: 10 }, () => post('/rest/v1/rpc/ai_take', { p_task: 'coach_chat', p_global_cap: 0, p_global_hour_cap: 0 }, token).then(r => r.json())))
  const allowed = res.filter(r => r?.ok === true).length
  check(allowed === 6, `10 parallel requests -> ${allowed} allowed (limit 6/min on the shared pool)`)
  check(res.every(r => r?.ok === true || r?.reason === 'minute'), 'the rest refused with reason "minute"')
} finally {
  const del = await post('/rest/v1/rpc/delete_my_account', {}, token)
  check(del.ok, `delete_my_account -> HTTP ${del.status}`)
  const again = await post('/auth/v1/token?grant_type=password', { email, password })
  check(!again.ok, `sign-in after delete refused (HTTP ${again.status})`)
}
process.exit(failed ? 1 : 0)
