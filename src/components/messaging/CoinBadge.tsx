import bronzeCoin from '@/assets/icons/bronze-coin.png'
import silverCoin from '@/assets/icons/silver-coin.png'
import goldCoin from '@/assets/icons/gold-coin.png'
import { COIN_TIERS, coinFor, type CoinTier } from '@/lib/forum-tokens'

export const COIN_ART: Record<CoinTier, string> = { bronze: bronzeCoin, silver: silverCoin, gold: goldCoin }

export const COIN_LABEL: Record<CoinTier, string> = {
  bronze: 'Bronze contributor',
  silver: 'Silver contributor',
  gold: 'Gold contributor',
}

/** The public coin next to an author's name. Nothing below the bronze threshold. */
export function CoinBadge({ tokens, className = '' }: { tokens: number; className?: string }) {
  const tier = coinFor(tokens)
  if (!tier) return null
  const min = COIN_TIERS.find((entry) => entry.tier === tier)?.min ?? 0
  const label = `${COIN_LABEL[tier]} · ${min}+ tokens`
  return (
    <img
      src={COIN_ART[tier]}
      alt={label}
      title={label}
      width={14}
      height={14}
      className={`inline-block h-3.5 w-3.5 align-[-2px] ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
