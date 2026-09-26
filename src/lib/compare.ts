import {
  airAt,
  deepPer1k,
  formatCount,
  formatRate,
  formatRent,
  formatUg,
  last,
  type Neighborhood,
} from './metrics'
import { reportSlug, type NextStep } from './next-steps'

const REPORTS = 'https://a816-dohbesp.nyc.gov/IndicatorPublic/neighborhood-reports'
const HOUSING_CONNECT = 'https://housingconnect.nyc.gov/PublicWeb/'
const INSIDE = new Set(['306', '307', '308', '309', '310'])
const EDGE = new Set(['304', '305'])

export type CompareWinner = 'mine' | 'other' | 'tie'

export type ComparePoint = {
  id: 'rent' | 'asthma' | 'pm' | 'deep'
  /** Counts toward whether the other neighborhood is better. PM does not, when asthma is present. */
  counted: boolean
  title: string
  detail: string
  winner: CompareWinner
  /** Relative advantage of the winner, from 0 to 1. */
  gap: number
}

export type Comparison = {
  pros: ComparePoint[]
  cons: ComparePoint[]
  otherIsBetter: boolean
  insight: NextStep | null
  zone: string
}

function zoneWords(id: string): string {
  if (INSIDE.has(id)) return 'inside the congestion zone'
  if (EDGE.has(id)) return 'on the edge of the congestion zone'
  return 'outside the congestion zone'
}

function judge(mine: number, other: number, lowerIsBetter: boolean): { winner: CompareWinner; gap: number } {
  if (!Number.isFinite(mine) || !Number.isFinite(other) || mine === other) return { winner: 'tie', gap: 0 }
  const otherBetter = lowerIsBetter ? other < mine : other > mine
  const gap = Math.abs(mine - other) / Math.max(Math.abs(mine), Math.abs(other))
  return { winner: otherBetter ? 'other' : 'mine', gap }
}

/**
 * Pros and cons of `other` against the neighborhood the reader is already in.
 * The other place is better only when it wins more of rent, asthma, and deeply
 * affordable homes per 1,000 households. The congestion zone is described and not scored.
 * An action is attached only when the other place is better.
 */
export function compareNeighborhoods(mine: Neighborhood, other: Neighborhood): Comparison {
  const mineAsk = last(mine.asking1br)?.median1br ?? null
  const otherAsk = last(other.asking1br)?.median1br ?? null
  const mineAsthma = last(mine.asthmaChild)
  const otherAsthma = last(other.asthmaChild)
  const minePm = airAt(mine.pm25, '2024')
  const otherPm = airAt(other.pm25, '2024')
  const mineDeep = deepPer1k([mine])
  const otherDeep = deepPer1k([other])
  const points: ComparePoint[] = []

  if (mineAsk != null && otherAsk != null) {
    const { winner, gap } = judge(mineAsk, otherAsk, true)
    points.push({
      id: 'rent',
      counted: true,
      title: 'New one-bedroom asking rent',
      detail: `${formatRent(otherAsk)} in ${other.name}, ${formatRent(mineAsk)} in ${mine.name}.`,
      winner,
      gap,
    })
  }

  if (mineAsthma != null && otherAsthma != null) {
    const { winner, gap } = judge(mineAsthma.value, otherAsthma.value, true)
    points.push({
      id: 'asthma',
      counted: true,
      title: `Child asthma visits, ${otherAsthma.period}`,
      detail: `${formatCount(Math.round(otherAsthma.value))} per 100,000 in ${other.name}, ${formatCount(Math.round(mineAsthma.value))} in ${mine.name}.`,
      winner,
      gap,
    })
  }

  if (minePm != null && otherPm != null) {
    const { winner, gap } = judge(minePm, otherPm, true)
    points.push({
      id: 'pm',
      counted: mineAsthma == null || otherAsthma == null,
      title: 'PM2.5, 2024',
      detail: `${formatUg(otherPm)} µg/m³ in ${other.name}, ${formatUg(minePm)} in ${mine.name}.`,
      winner,
      gap,
    })
  }

  if (mineDeep != null && otherDeep != null) {
    const { winner, gap } = judge(mineDeep, otherDeep, false)
    points.push({
      id: 'deep',
      counted: true,
      title: 'Deeply affordable homes since 2014',
      detail: `${formatRate(otherDeep)} per 1,000 households in ${other.name}, ${formatRate(mineDeep)} in ${mine.name}. Financed, not vacant listings.`,
      winner,
      gap,
    })
  }

  const counted = points.filter((point) => point.counted && point.winner !== 'tie')
  const otherWins = counted.filter((point) => point.winner === 'other').length
  const mineWins = counted.filter((point) => point.winner === 'mine').length
  const otherIsBetter = otherWins > mineWins
  const best = otherIsBetter
    ? counted
        .filter((point) => point.winner === 'other')
        .sort((a, b) => b.gap - a.gap)[0] ?? null
    : null

  return {
    pros: points.filter((point) => point.winner === 'other'),
    cons: points.filter((point) => point.winner === 'mine'),
    otherIsBetter,
    insight: best ? insightFor(mine, other, best) : null,
    zone: `${other.name} is ${zoneWords(other.id)}. ${mine.name} is ${zoneWords(mine.id)}. The zone is not scored as better or worse, and the 2024 air record does not show whether the toll changed the air.`,
  }
}

function insightFor(mine: Neighborhood, other: Neighborhood, best: ComparePoint): NextStep {
  if (best.id === 'asthma' || best.id === 'pm') {
    return {
      kind: 'air',
      title: `Read the ${other.name} asthma report`,
      href: `${REPORTS}/${reportSlug(other.name)}/asthma_and_the_environment/`,
      note: `${best.detail} Read the report before a new lease.`,
    }
  }
  if (best.id === 'deep') {
    return {
      kind: 'housing',
      title: `Enter the lotteries that include ${other.name}`,
      href: HOUSING_CONNECT,
      note: `${best.detail} One application covers many buildings.`,
    }
  }
  return {
    kind: 'housing',
    title: `Look at new leases in ${other.name}`,
    href: `/?n=${other.id}&b=${encodeURIComponent(other.borough)}`,
    note: `${best.detail} That is asking rent for a new lease, not what a sitting tenant pays.`,
  }
}

export function comparisonSpeech(comparison: Comparison, otherName: string): string {
  const pros = comparison.pros.length
    ? comparison.pros.map((point) => point.detail).join(' ')
    : `${otherName} is not ahead on rent, asthma, or deeply affordable homes.`
  const cons = comparison.cons.length
    ? comparison.cons.map((point) => point.detail).join(' ')
    : `${otherName} is not behind on those measures.`
  return `Pros of ${otherName}: ${pros} Cons of ${otherName}: ${cons} ${comparison.zone}`
}
