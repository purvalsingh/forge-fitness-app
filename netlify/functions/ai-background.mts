// Long-running AI tasks (physique analysis with several photos) exceed a synchronous function's
// timeout, so they run here — Netlify background functions get 15 minutes — and the result is
// parked in a blob the client polls for.
import { getStore } from '@netlify/blobs'
import { buildRequest, extractJson } from '../../supabase/functions/_shared/prompts.ts'
import { callGemini } from '../lib/gemini.mts'

export default async (req: Request) => {
  const body = await req.json().catch(() => null) as any
  const jobId = body?.job_id
  if (!jobId || typeof body?.task !== 'string') return new Response('bad request', { status: 400 })

  const store = getStore('ai-jobs')
  try {
    const request = buildRequest(body.task, body.payload)
    if (!request) {
      await store.setJSON(jobId, { status: 'error', error: 'unknown_task' })
      return new Response('', { status: 202 })
    }
    const result = await callGemini(request, extractJson)
    await store.setJSON(jobId, result === null
      ? { status: 'error', error: 'ai_unavailable' }
      : { status: 'done', result })
  } catch (e) {
    console.error('ai-background failed', e)
    await store.setJSON(jobId, { status: 'error', error: 'ai_unavailable' })
  }
  return new Response('', { status: 202 })
}
