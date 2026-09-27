/** Public XRPL hosting fee. The destination is the operator's address, never a secret. */

export type XrplNetwork = 'testnet' | 'mainnet' | 'devnet'

export type ListingFee = {
  configured: boolean
  network: XrplNetwork
  destination: string | null
  currency: string
  amount: string
  issuer: string | null
  rpcUrl: string
  faucetUrl: string | null
  explorerTx: string
}

const RPC: Record<XrplNetwork, string> = {
  testnet: 'https://s.altnet.rippletest.net:51234',
  devnet: 'https://s.devnet.rippletest.net:51234',
  mainnet: 'https://xrplcluster.com',
}

const EXPLORER: Record<XrplNetwork, string> = {
  testnet: 'https://testnet.xrpl.org/transactions/',
  devnet: 'https://devnet.xrpl.org/transactions/',
  mainnet: 'https://livenet.xrpl.org/transactions/',
}

const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/
export const TX_HASH = /^[0-9A-Fa-f]{64}$/

export function isXrplAddress(value: string): boolean {
  return ADDRESS.test(value)
}

export function explorerTxUrl(network: string, hash: string): string | null {
  if (network !== 'testnet' && network !== 'devnet' && network !== 'mainnet') return null
  if (!TX_HASH.test(hash)) return null
  return EXPLORER[network] + hash.toUpperCase()
}

export function listingFee(input: {
  network?: string
  destination?: string
  amount?: string
  currency?: string
  issuer?: string
}): ListingFee {
  const network: XrplNetwork =
    input.network === 'mainnet' || input.network === 'devnet' ? input.network : 'testnet'
  const currency = (input.currency || 'XRP').trim().toUpperCase() || 'XRP'
  const amount = (input.amount || '1').trim() || '1'
  const destination = input.destination?.trim() || ''
  const issuer = input.issuer?.trim() || ''
  const issued = currency !== 'XRP'
  const configured =
    isXrplAddress(destination) &&
    Number(amount) > 0 &&
    (!issued || isXrplAddress(issuer))
  return {
    configured,
    network,
    destination: configured ? destination : null,
    currency,
    amount,
    issuer: issued && isXrplAddress(issuer) ? issuer : null,
    rpcUrl: RPC[network],
    faucetUrl: network === 'mainnet' ? null : 'https://xrpl.org/resources/dev-tools/xrp-faucets',
    explorerTx: EXPLORER[network],
  }
}

type Amount = string | { currency?: string; issuer?: string; value?: string }

function delivered(tx: Record<string, unknown>): Amount | null {
  const meta = tx.meta
  if (meta && typeof meta === 'object') {
    const row = meta as Record<string, unknown>
    const amount = row.delivered_amount ?? row.DeliveredAmount
    if (typeof amount === 'string' || (amount && typeof amount === 'object')) return amount as Amount
  }
  const amount = tx.Amount
  if (typeof amount === 'string' || (amount && typeof amount === 'object')) return amount as Amount
  return null
}

function covers(paid: Amount, fee: ListingFee): boolean {
  const price = Number(fee.amount)
  if (!Number.isFinite(price) || price <= 0) return false
  if (fee.currency === 'XRP') {
    if (typeof paid !== 'string' || !/^\d+$/.test(paid)) return false
    const drops = BigInt(paid)
    const need = BigInt(Math.round(price * 1_000_000))
    return drops >= need
  }
  if (typeof paid === 'string' || !paid.currency || !paid.issuer || !paid.value) return false
  if (paid.currency.toUpperCase() !== fee.currency) return false
  if (paid.issuer !== fee.issuer) return false
  const value = Number(paid.value)
  return Number.isFinite(value) && value + 1e-12 >= price
}

/**
 * A validated Payment to the hosting address, for at least the listing fee.
 * Accepts the rippled `tx` result object, with or without a `result` wrapper.
 */
export function paymentMatches(
  payload: unknown,
  fee: ListingFee,
  hash: string,
): { ok: true; payer: string } | { ok: false; error: string } {
  if (!fee.configured || !fee.destination) return { ok: false, error: 'Listing payments are not configured.' }
  if (!TX_HASH.test(hash)) return { ok: false, error: 'Paste the 64-character transaction hash. Not a wallet secret.' }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'The ledger did not return that transaction.' }
  const root = payload as Record<string, unknown>
  const tx = (root.result && typeof root.result === 'object' ? root.result : root) as Record<string, unknown>
  const found = typeof tx.hash === 'string' ? tx.hash : ''
  if (found.toUpperCase() !== hash.toUpperCase()) return { ok: false, error: 'That hash does not match the transaction.' }
  if (tx.validated !== true) return { ok: false, error: 'The transaction is not validated on the ledger yet.' }
  const meta = tx.meta
  const result =
    meta && typeof meta === 'object' ? (meta as Record<string, unknown>).TransactionResult : undefined
  if (result !== 'tesSUCCESS') return { ok: false, error: 'The transaction did not succeed.' }
  if (tx.TransactionType !== 'Payment') return { ok: false, error: 'The transaction is not a payment.' }
  if (tx.Destination !== fee.destination) return { ok: false, error: 'The payment was sent to a different address.' }
  const payer = typeof tx.Account === 'string' ? tx.Account : ''
  if (!payer || payer === fee.destination) return { ok: false, error: 'The payment has no sender.' }
  const amount = delivered(tx)
  if (!amount || !covers(amount, fee)) {
    return { ok: false, error: `The payment is below the hosting fee of ${fee.amount} ${fee.currency}.` }
  }
  return { ok: true, payer }
}
