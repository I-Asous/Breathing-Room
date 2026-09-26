import { briefFromFacts } from '../lib/brief.js'
import type { BriefFacts } from '../lib/metrics.js'

function grokText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as {
    output_text?: unknown
    output?: { type?: string; content?: { type?: string; text?: string }[] }[]
  }
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text.trim()
  const parts: string[] = []
  for (const item of record.output ?? []) {
    if (item.type !== 'message') continue
    for (const chunk of item.content ?? []) {
      if (chunk.type === 'output_text' && chunk.text) parts.push(chunk.text)
    }
  }
  return parts.join('\n').trim()
}

function isFacts(value: unknown): value is BriefFacts {
  if (!value || typeof value !== 'object') return false
  const name = (value as { name?: unknown }).name
  const borough = (value as { borough?: unknown }).borough
  return typeof name === 'string' && name.length > 0 && name.length < 120 && typeof borough === 'string'
}

export async function writeBrief(
  key: string | undefined,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const parsed = body && typeof body === 'object' ? (body as { facts?: unknown; question?: unknown }) : null
  if (!parsed) return { status: 400, payload: { error: 'Send a neighborhood snapshot as JSON.' } }
  if (!isFacts(parsed.facts)) return { status: 400, payload: { error: 'Name a neighborhood first.' } }
  const question = typeof parsed.question === 'string' ? parsed.question.slice(0, 500) : ''
  const computed = briefFromFacts(parsed.facts, question)
  if (!key) {
    return {
      status: 200,
      payload: {
        source: 'computed',
        text: computed,
        notice: 'Set the XAI_API_KEY secret to have Grok write this brief.',
      },
    }
  }

  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4.6',
        store: false,
        max_output_tokens: 450,
        input: [
          {
            role: 'system',
            content:
              'You are Grok, briefing one New York neighborhood for a civic hackathon. Use only the numbers in the user message. Do not invent statistics, rates, or citations. Write 90 to 140 words in plain sentences: what is heavy here, what improved, and one concrete next step a resident or council office could take. If a figure is missing, say so. Do not score congestion pricing; the air record ends in 2024.',
          },
          {
            role: 'user',
            content: `Neighborhood facts:\n${JSON.stringify(parsed.facts)}\n\nQuestion: ${question || 'Brief this neighborhood.'}`,
          },
        ],
      }),
    })
    if (!response.ok) {
      return {
        status: 200,
        payload: {
          source: 'computed',
          text: computed,
          notice: 'Grok was unavailable, so this brief is computed from the open data.',
        },
      }
    }
    const payload = await response.json()
    const text = grokText(payload)
    if (!text) {
      return {
        status: 200,
        payload: {
          source: 'computed',
          text: computed,
          notice: 'Grok returned an empty brief, so this one is computed from the open data.',
        },
      }
    }
    return { status: 200, payload: { source: 'grok', text } }
  } catch {
    return {
      status: 200,
      payload: {
        source: 'computed',
        text: computed,
        notice: 'Grok could not be reached, so this brief is computed from the open data.',
      },
    }
  }
}

export async function askGrok(key: string, system: string, user: string): Promise<string | null> {
  const response = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.6',
      store: false,
      max_output_tokens: 450,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) return null
  const text = grokText(await response.json())
  return text || null
}
