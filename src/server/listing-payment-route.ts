/**
 * Host a neighbor listing only after a validated XRPL Payment.
 * The worker reads the public ledger. It never sees a wallet seed.
 */

import type { Hono } from 'hono'
import type { VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { parseListingDraft } from '../lib/listing-draft.js'
import { CITY, neighborhoodById } from '../lib/metrics.js'
import { TX_HASH, listingFee, paymentMatches, type ListingFee } from '../lib/xrpl-payment.js'

type ResolveAuth = (req: Request, env: Env) => Promise<VerifyResult | null>

function feeFromEnv(env: Env): ListingFee {
  return listingFee({
    network: env.XRPL_NETWORK,
    destination: env.XRPL_DESTINATION,
    amount: env.XRPL_AMOUNT,
    currency: env.XRPL_CURRENCY,
    issuer: env.XRPL_ISSUER,
  })
}

type ToolResult = {
  success?: boolean
  error?: string
  data?: { records?: unknown[]; recordId?: string }
}

async function execTool(
  env: Env,
  userId: string,
  tool: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  const res = await stub.fetch(
    new Request('https://internal/api/tools/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
        'X-App-Action': 'true',
      },
      body: JSON.stringify({ tool, params }),
    }),
  )
  return res.json() as Promise<ToolResult>
}

export function registerListingPaymentRoutes(app: Hono<AppContext>, resolveAuth: ResolveAuth): void {
  app.get('/api/xrpl/listing-fee', (c) => {
    const fee = feeFromEnv(c.env)
    return c.json({
      configured: fee.configured,
      network: fee.network,
      destination: fee.destination,
      currency: fee.currency,
      amount: fee.amount,
      issuer: fee.issuer,
      faucetUrl: fee.faucetUrl,
      explorerTx: fee.explorerTx,
    })
  })

  app.post('/api/listings/host', async (c) => {
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in to host a listing.' }, 401)

    const fee = feeFromEnv(c.env)
    if (!fee.configured || !fee.destination) {
      return c.json(
        { error: 'Listing payments are not configured. Set XRPL_DESTINATION to the hosting address.' },
        503,
      )
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Send the listing as JSON.' }, 400)
    }
    if (!body || typeof body !== 'object') return c.json({ error: 'Send the listing as JSON.' }, 400)
    const row = body as Record<string, unknown>
    const hash = typeof row.paymentTxHash === 'string' ? row.paymentTxHash.trim().toUpperCase() : ''
    if (!TX_HASH.test(hash)) {
      return c.json({ error: 'Paste the 64-character transaction hash. Not a wallet secret.' }, 400)
    }

    const askingRent =
      typeof row.askingRent === 'number' && Number.isFinite(row.askingRent)
        ? String(Math.trunc(row.askingRent))
        : typeof row.askingRent === 'string'
          ? row.askingRent
          : ''
    const parsed = parseListingDraft({
      neighborhoodId: typeof row.neighborhoodId === 'string' ? row.neighborhoodId : '',
      askingRent,
      beds: typeof row.beds === 'string' ? row.beds : '',
      note: typeof row.note === 'string' ? row.note : '',
      knownIds: new Set(CITY.neighborhoods.map((place) => place.id)),
    })
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    const place = neighborhoodById(parsed.value.neighborhoodId)
    if (!place) return c.json({ error: 'Choose a neighborhood.' }, 400)
    const authorName =
      (typeof row.authorName === 'string' ? row.authorName.trim().replace(/\s+/g, ' ').slice(0, 40) : '') ||
      'Neighbor'

    let payload: unknown
    try {
      const res = await fetch(fee.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tx', params: [{ transaction: hash, binary: false }] }),
        signal: AbortSignal.timeout(8000),
      })
      payload = await res.json()
    } catch {
      return c.json({ error: 'The XRPL ledger could not be reached. Try the hash again in a moment.' }, 502)
    }

    const ledger = payload as { result?: { error?: string } }
    if (ledger.result?.error) {
      return c.json({ error: 'The ledger has no validated transaction with that hash.' }, 400)
    }
    const match = paymentMatches(payload, fee, hash)
    if (!match.ok) return c.json({ error: match.error }, 400)

    const prior = await execTool(c.env, auth.userId, 'records.query', {
      collection: 'listings',
      where: { paymentTxHash: hash },
      limit: 1,
    })
    if (!prior.success) return c.json({ error: 'The listing could not be checked against earlier payments.' }, 502)
    if ((prior.data?.records?.length ?? 0) > 0) {
      return c.json({ error: 'This payment already hosts a listing.' }, 409)
    }

    const created = await execTool(c.env, auth.userId, 'records.create', {
      collection: 'listings',
      data: {
        neighborhoodId: place.id,
        neighborhoodName: place.name,
        borough: place.borough,
        askingRent: parsed.value.askingRent,
        beds: parsed.value.beds,
        note: parsed.value.note,
        authorName,
        paymentTxHash: hash,
        paymentNetwork: fee.network,
        payerAccount: match.payer,
      },
    })
    if (!created.success || !created.data?.recordId) {
      const duplicate = created.error?.includes('Duplicate')
      return c.json(
        { error: duplicate ? 'This payment already hosts a listing.' : 'The listing could not be saved.' },
        duplicate ? 409 : 502,
      )
    }
    return c.json({ recordId: created.data.recordId, paymentTxHash: hash, network: fee.network })
  })
}
