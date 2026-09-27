/**
 * iMessage front door for the rental desk.
 *
 * Photon has no public HTTP "send" API. This process holds the Spectrum
 * connection and replies in the chat. The briefing itself stays in the app:
 *
 *   npm run preview:city      (the atlas, in one terminal)
 *   npm run desk:imessage     (this bridge, in another)
 *
 * Credentials can live in a local .env file, which the npm script loads.
 *
 * SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET come from the Photon
 * dashboard. PUBLIC_ORIGIN is the map link sent back to the phone.
 */
import { Spectrum, text } from 'spectrum-ts'
import { imessage } from 'spectrum-ts/providers/imessage'

const projectId = process.env.SPECTRUM_PROJECT_ID || process.env.PROJECT_ID
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET || process.env.PROJECT_SECRET
const atlas = (process.env.ATLAS_ORIGIN ?? 'http://127.0.0.1:44731').replace(/\/$/, '')
const publicOrigin = (process.env.PUBLIC_ORIGIN ?? atlas).replace(/\/$/, '')

if (!projectId || !projectSecret) {
  console.error('Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET in .env (copy them from the Photon dashboard).')
  process.exit(1)
}

const memory = new Map()
const seen = new Set()

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
})

try {
  const probe = await fetch(`${atlas}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hi' }),
  })
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
} catch (error) {
  console.warn(`Warning: the desk at ${atlas}/api/agent did not answer (${error.message}). Start it with \`npm run preview:city\`.`)
}

console.log(`iMessage desk is listening. Briefs come from ${atlas}/api/agent`)

for await (const [space, message] of app.messages) {
  if (!message?.id || seen.has(message.id)) continue
  seen.add(message.id)
  if (message.direction === 'outbound') continue
  const sender = message.sender?.id ?? space.id
  const inbound = message.content?.type === 'text' ? String(message.content.text ?? '') : ''
  console.log(`← ${sender}: ${inbound || `[${message.content?.type ?? 'unknown'}]`}`)
  try {
    await space.responding(async () => {
      let reply
      try {
        reply = inbound
          ? await ask(inbound, memory.get(sender) ?? null)
          : { text: 'Text a neighborhood name, like East Harlem or Astoria.', neighborhoodId: null }
      } catch (error) {
        console.error(`  desk unreachable at ${atlas}/api/agent:`, error.message)
        reply = { text: 'The desk is offline for a moment. Please try again shortly.', neighborhoodId: null }
      }
      if (reply.neighborhoodId) memory.set(sender, reply.neighborhoodId)
      await space.send(text(reply.text))
      console.log(`→ ${sender}: ${reply.text.slice(0, 120)}${reply.text.length > 120 ? '…' : ''}`)
    })
  } catch (error) {
    console.error('desk turn failed', error)
  }
}

async function ask(body, priorId) {
  const response = await fetch(`${atlas}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: body, priorId, origin: publicOrigin }),
  })
  if (!response.ok) throw new Error(`desk answered ${response.status}`)
  const payload = await response.json()
  return {
    text: typeof payload.text === 'string' ? payload.text : 'The desk had nothing to add.',
    neighborhoodId: typeof payload.neighborhoodId === 'string' ? payload.neighborhoodId : null,
  }
}
