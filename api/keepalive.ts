/**
 * Daily keep-awake (Vercel cron, see vercel.json). Supabase pauses free projects after ~7 days with no
 * database traffic, which silently broke sign-in for everyone. One tiny read a day keeps it running.
 * It uses only the public anon key; RLS returns no rows, but the query still counts as activity.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY
  if (!url || !anon) return Response.json({ ok: false, error: 'not configured' }, { status: 500 })
  try {
    const r = await fetch(`${url}/rest/v1/meal_types?select=id&limit=1`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })
    return Response.json({ ok: r.ok, status: r.status, at: new Date().toISOString() }, { status: r.ok ? 200 : 502 })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 })
  }
}
