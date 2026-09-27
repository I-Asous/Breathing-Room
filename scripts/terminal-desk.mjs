/**
 * Terminal front door for the rental desk. Same endpoint as the iMessage bridge:
 *
 *   npm run preview:city        (in one terminal)
 *   npm run desk:terminal       (in another)
 *
 * ATLAS_ORIGIN points at a running atlas. A follow-up stays on the last neighborhood.
 */
import { createInterface } from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'

const atlas = (process.env.ATLAS_ORIGIN ?? 'http://127.0.0.1:44731').replace(/\/$/, '')
const rl = createInterface({ input, output })
let priorId = null

console.log(`Desk at ${atlas}/api/agent. Type a neighborhood or a question; "exit" to quit.\n`)

rl.setPrompt('you › ')
rl.prompt()

for await (const raw of rl) {
  const line = raw.trim()
  if (/^(exit|quit)$/i.test(line)) break
  if (line) await ask(line)
  rl.prompt()
}

rl.close()

async function ask(line) {
  try {
    const response = await fetch(`${atlas}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line, priorId, origin: atlas }),
    })
    if (!response.ok) throw new Error(`desk answered ${response.status}`)
    const payload = await response.json()
    if (typeof payload.neighborhoodId === 'string') priorId = payload.neighborhoodId
    console.log(`\ndesk › ${payload.text ?? 'The desk had nothing to add.'}`)
    if (payload.notice) console.log(`       (${payload.notice})`)
    console.log()
  } catch (error) {
    console.error(`\nCould not reach the desk: ${error.message}. Is \`npm run preview:city\` running?\n`)
  }
}
