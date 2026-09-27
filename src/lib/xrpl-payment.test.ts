import { describe, expect, it } from 'vitest'
import { listingFee, paymentMatches } from './xrpl-payment'

const DEST = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const fee = listingFee({ network: 'testnet', destination: DEST, amount: '1', currency: 'XRP' })

function tx(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      hash: 'AB'.repeat(32),
      validated: true,
      TransactionType: 'Payment',
      Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      Destination: DEST,
      Amount: '1000000',
      meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000' },
      ...overrides,
    },
  }
}

describe('paymentMatches', () => {
  it('accepts a validated 1 XRP payment to the hosting address', () => {
    const result = paymentMatches(tx(), fee, 'AB'.repeat(32))
    expect(result.ok).toBe(true)
  })

  it('rejects a payment to another address, a short amount, and an unvalidated tx', () => {
    expect(paymentMatches(tx({ Destination: 'rUnconfiguredxxxxxxxxxxxxxxxxxx' }), fee, 'AB'.repeat(32)).ok).toBe(false)
    expect(paymentMatches(tx({ meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1' } }), fee, 'AB'.repeat(32)).ok).toBe(false)
    expect(paymentMatches(tx({ validated: false }), fee, 'AB'.repeat(32)).ok).toBe(false)
  })

  it('accepts an issued token only from the configured issuer', () => {
    const issuer = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    const issued = listingFee({ destination: DEST, currency: 'BRM', issuer, amount: '10' })
    const good = tx({
      Account: issuer,
      Amount: { currency: 'BRM', issuer, value: '10' },
      meta: {
        TransactionResult: 'tesSUCCESS',
        delivered_amount: { currency: 'BRM', issuer, value: '10' },
      },
    })
    const wrongIssuer = tx({
      Account: issuer,
      meta: {
        TransactionResult: 'tesSUCCESS',
        delivered_amount: { currency: 'BRM', issuer: DEST, value: '10' },
      },
    })
    expect(paymentMatches(good, issued, 'AB'.repeat(32)).ok).toBe(true)
    expect(paymentMatches(wrongIssuer, issued, 'AB'.repeat(32)).ok).toBe(false)
  })

  it('stays unconfigured without a real destination', () => {
    expect(listingFee({ destination: '' }).configured).toBe(false)
  })
})
