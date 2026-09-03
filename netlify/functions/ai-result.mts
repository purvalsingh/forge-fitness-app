// Poll endpoint for background AI jobs.
import { getStore } from '@netlify/blobs'

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
}

export default async (req: Request) => {
  // Answer the preflight, so a poll carrying headers from another origin still works.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const job = new URL(req.url).searchParams.get('job')
  if (!job) return json({ error: 'bad_request' }, 400)

  const record = await getStore('ai-jobs').get(job, { type: 'json' }).catch(() => null) as any
  if (!record) return json({ status: 'pending' }, 202)
  if (record.status === 'error') return json({ error: record.error ?? 'ai_unavailable' }, 503)
  return json(record.result, 200)
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  })
}

export const config = { path: '/api/ai-result' }
