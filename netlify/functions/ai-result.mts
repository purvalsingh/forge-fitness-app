// Poll endpoint for background AI jobs.
import { getStore } from '@netlify/blobs'

export default async (req: Request) => {
  const job = new URL(req.url).searchParams.get('job')
  if (!job) return json({ error: 'bad_request' }, 400)

  const record = await getStore('ai-jobs').get(job, { type: 'json' }).catch(() => null) as any
  if (!record) return json({ status: 'pending' }, 202)
  if (record.status === 'error') return json({ error: record.error ?? 'ai_unavailable' }, 503)
  return json(record.result, 200)
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  })
}

export const config = { path: '/api/ai-result' }
