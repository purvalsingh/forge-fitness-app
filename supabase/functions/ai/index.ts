// Supabase Edge Function: the only place Gemini keys exist.
// Deploy: supabase functions deploy ai
// Secrets: supabase secrets set GEMINI_API_KEY_1=... GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...
// deno-lint-ignore-file no-explicit-any

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

const CORS = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface KeyState { key: string; cooldownUntil: number }
const keys: KeyState[] = [1, 2, 3]
  .map(n => Deno.env.get(`GEMINI_API_KEY_${n}`)?.trim())
  .filter((k): k is string => Boolean(k))
  .map(key => ({ key, cooldownUntil: 0 }))

const COOLDOWN_MS = 60_000

const FOOD_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    qty: { type: 'NUMBER' },
    unit: { type: 'STRING' },
    calories: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
  },
  required: ['name', 'qty', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
}
const FOOD_LIST_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: FOOD_ITEM_SCHEMA } },
  required: ['items'],
}

function buildRequest(task: string, payload: any) {
  switch (task) {
    case 'parse_food_text':
      return {
        contents: [{ role: 'user', parts: [{ text:
          `Parse this food description into structured items with realistic nutrition estimates. ` +
          `Use grams/ml/piece/slice/serving/scoop/tbsp/tsp/cup units. Description: ${String(payload?.text ?? '').slice(0, 800)}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: FOOD_LIST_SCHEMA, temperature: 0.2 },
      }
    case 'analyze_food_photo':
      return {
        contents: [{ role: 'user', parts: [
          { text: 'Identify the foods in this meal photo. Estimate the portion of each and its nutrition. Be conservative and realistic.' },
          { inlineData: { mimeType: String(payload?.mimeType ?? 'image/jpeg'), data: String(payload?.image ?? '') } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: FOOD_LIST_SCHEMA, temperature: 0.2 },
      }
    case 'target_advice':
      return {
        contents: [{ role: 'user', parts: [{ text:
          `A deterministic calculator produced these nutrition targets. Explain them in 2-3 sentences for the user ` +
          `and suggest at most small adjustments (never more than 10% from the calculated values). ` +
          `You are not a medical professional; frame it as a planning estimate.\n${JSON.stringify(payload).slice(0, 2000)}` }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.4,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              adjustments: {
                type: 'OBJECT',
                properties: {
                  calories: { type: 'NUMBER' }, protein_g: { type: 'NUMBER' },
                  carbs_g: { type: 'NUMBER' }, fat_g: { type: 'NUMBER' },
                },
              },
            },
            required: ['summary'],
          },
        },
      }
    case 'insights':
      return {
        contents: [{ role: 'user', parts: [{ text:
          `Given this fitness history summary, write up to 4 short factual observations. ` +
          `No hype, no medical advice. Mark any that suggest changing a target as kind="adjustment".\n${JSON.stringify(payload).slice(0, 4000)}` }] }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.5,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              insights: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { kind: { type: 'STRING' }, text: { type: 'STRING' } },
                  required: ['kind', 'text'],
                },
              },
            },
            required: ['insights'],
          },
        },
      }
    case 'physique_analysis': {
      const photos: { angle: string; mimeType: string; data: string }[] = payload?.photos ?? []
      const parts: unknown[] = [{ text:
        `You are a fitness coach reviewing physique check-in photos. Analyse ONLY fitness-related visual attributes: ` +
        `visible muscular development, proportions, relative development between muscle groups, symmetry, ` +
        `areas that would benefit from extra training emphasis, and general body-composition appearance. ` +
        `Everything you say is an ESTIMATE from photos — never a measurement or a medical assessment. ` +
        `Never state a precise body-fat percentage; give a range and call it an estimate.\n` +
        (payload?.reference
          ? `The user also supplied a reference physique they want to work toward. Treat it as an aspirational visual reference. ` +
            `Do NOT claim they can reproduce that person's physique — genetics, skeletal structure, muscle insertions and proportions differ. ` +
            `Translate it into attainable training characteristics and objectives.\n`
          : '') +
        `Goal: ${payload?.goal}. Stated priorities: ${String(payload?.priorities ?? 'none').slice(0, 400)}. ` +
        `Context: ${JSON.stringify(payload?.context ?? {}).slice(0, 1200)}\n` +
        (payload?.previous ? `Previous check-in assessment: ${JSON.stringify(payload.previous).slice(0, 1500)}. ` +
          `Describe observable CHANGES since then in changes_since_last; do not invent measurements.\n` : '') +
        `Give an estimated timeline as a RANGE with milestones, and list the assumptions behind it. Never guarantee an outcome by a date.` }]
      for (const p of photos.slice(0, 5)) {
        parts.push({ text: `Angle: ${p.angle}` })
        parts.push({ inlineData: { mimeType: p.mimeType, data: p.data } })
      }
      if (payload?.reference) {
        parts.push({ text: 'Reference physique the user aspires to (aspirational only):' })
        parts.push({ inlineData: { mimeType: payload.reference.mimeType, data: payload.reference.data } })
      }
      return {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.4,
          responseSchema: {
            type: 'OBJECT',
            properties: {
              composition_estimate: { type: 'STRING' },
              strengths: { type: 'ARRAY', items: { type: 'STRING' } },
              priorities: { type: 'ARRAY', items: { type: 'STRING' } },
              observations: { type: 'ARRAY', items: { type: 'STRING' } },
              changes_since_last: { type: 'ARRAY', items: { type: 'STRING' } },
              timeline: {
                type: 'OBJECT',
                properties: {
                  range: { type: 'STRING' },
                  assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
                  milestones: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: { window: { type: 'STRING' }, expectation: { type: 'STRING' } },
                      required: ['window', 'expectation'],
                    },
                  },
                },
                required: ['range', 'assumptions', 'milestones'],
              },
              training: {
                type: 'OBJECT',
                properties: {
                  days_per_week: { type: 'NUMBER' },
                  focus: { type: 'STRING' },
                  emphasis: { type: 'ARRAY', items: { type: 'STRING' } },
                  rationale: { type: 'STRING' },
                },
                required: ['days_per_week', 'focus', 'emphasis', 'rationale'],
              },
              nutrition: {
                type: 'OBJECT',
                properties: {
                  strategy: { type: 'STRING' },
                  calorie_delta: { type: 'NUMBER' },
                  protein_g_per_kg: { type: 'NUMBER' },
                },
                required: ['strategy', 'calorie_delta', 'protein_g_per_kg'],
              },
            },
            required: ['composition_estimate', 'strengths', 'priorities', 'observations', 'timeline', 'training', 'nutrition'],
          },
        },
      }
    }
    default:
      return null
  }
}

async function callGemini(body: unknown): Promise<any> {
  const now = Date.now()
  const available = keys.filter(k => k.cooldownUntil <= now)
  if (available.length === 0) return null

  for (const state of available) {
    let res: Response
    try {
      res = await fetch(ENDPOINT(MODEL, state.key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      state.cooldownUntil = Date.now() + COOLDOWN_MS
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      // Rate limited / exhausted / upstream trouble: park this key, try the next one. No retry storms.
      state.cooldownUntil = Date.now() + COOLDOWN_MS
      continue
    }
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') return null
    try { return JSON.parse(text) } catch { return null }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (keys.length === 0) return json({ error: 'ai_unconfigured' }, 503)

  const body = await req.json().catch(() => null)
  const task = body?.task
  if (typeof task !== 'string') return json({ error: 'bad_request' }, 400)

  const request = buildRequest(task, body?.payload)
  if (!request) return json({ error: 'unknown_task' }, 400)

  const result = await callGemini(request)
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  })
}
