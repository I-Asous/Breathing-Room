import { askGrok } from './brief-route.js'
import { interpretDesk, modelBrief, type DeskTurn } from '../lib/desk.js'

function originOf(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback
    return url.origin
  } catch {
    return fallback
  }
}

export async function writeDesk(
  key: string | undefined,
  body: unknown,
  requestOrigin: string,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const parsed = body && typeof body === 'object' ? (body as { text?: unknown; priorId?: unknown; origin?: unknown }) : null
  if (!parsed || typeof parsed.text !== 'string') {
    return { status: 400, payload: { error: 'Send the message text.' } }
  }
  const text = parsed.text.slice(0, 500)
  const priorId = typeof parsed.priorId === 'string' ? parsed.priorId.slice(0, 8) : null
  const origin = originOf(parsed.origin, requestOrigin)
  const turn = interpretDesk(text, priorId, origin)
  const payload = await withGrok(key, turn)
  return { status: 200, payload }
}

async function withGrok(key: string | undefined, turn: DeskTurn): Promise<Record<string, unknown>> {
  const base = {
    text: turn.text,
    neighborhoodId: turn.neighborhoodId,
    source: 'computed' as const,
  }
  const prompt = modelBrief(turn)
  if (!prompt) return base
  if (!key) {
    return { ...base, notice: 'Set the XAI_API_KEY secret to have Grok write this reply.' }
  }
  try {
    const written = await askGrok(key, prompt.system, prompt.user)
    if (!written) {
      return {
        ...base,
        notice: 'Grok was unavailable, so this reply is computed from the open data.',
      }
    }
    return { text: written, neighborhoodId: turn.neighborhoodId, source: 'grok' }
  } catch {
    return {
      ...base,
      notice: 'Grok could not be reached, so this reply is computed from the open data.',
    }
  }
}
