import { neighborhoodIdAt } from './geo'
import {
  CITY,
  factsFor,
  formatCount,
  formatPercent,
  formatUg,
  neighborhoodById,
  percentChange,
  type BriefFacts,
  type Neighborhood,
} from './metrics'
import { nextSteps, type NextStep } from './next-steps'

/** A council district applies only to the neighborhood that contains the address. */
export type CouncilPin = { district: number; neighborhoodId: string }

/**
 * Passenger-car Congestion Relief Zone rates published by the MTA.
 * In effect since January 5, 2025. The scheduled step-up is 2028, then 2031.
 * https://www.mta.info/fares-tolls/tolls/congestion-relief-zone/about
 */
export const TOLL = {
  started: 'January 5, 2025',
  peakEzPass: 9,
  overnightEzPass: 2.25,
  peakMail: 13.5,
  overnightMail: 3.3,
  peakHours: 'weekdays 5 a.m. to 9 p.m., and weekends 9 a.m. to 9 p.m.',
} as const

export type ZoneRelation = 'inside' | 'edge' | 'outside'

/** Neighborhoods whose streets are at or south of 60th Street in Manhattan. */
const INSIDE = new Set(['306', '307', '308', '309', '310'])
/** Neighborhoods that cross 60th Street, including Roosevelt Island via the Upper East Side. */
const EDGE = new Set(['304', '305'])

const NICKNAMES: { phrase: string; ids: string[] }[] = [
  { phrase: 'spanish harlem', ids: ['303'] },
  { phrase: 'el barrio', ids: ['303'] },
  { phrase: 'east harlem', ids: ['303'] },
  { phrase: 'central harlem', ids: ['302'] },
  { phrase: 'morningside', ids: ['302'] },
  { phrase: 'washington heights', ids: ['301'] },
  { phrase: 'hells kitchen', ids: ['306'] },
  { phrase: 'hudson yards', ids: ['306'] },
  { phrase: 'midtown east', ids: ['307'] },
  { phrase: 'kips bay', ids: ['307'] },
  { phrase: 'financial district', ids: ['310'] },
  { phrase: 'battery park', ids: ['310'] },
  { phrase: 'lower east side', ids: ['309'] },
  { phrase: 'east village', ids: ['309'] },
  { phrase: 'greenwich village', ids: ['308'] },
  { phrase: 'west village', ids: ['308'] },
  { phrase: 'upper east side', ids: ['305'] },
  { phrase: 'upper west side', ids: ['304'] },
  { phrase: 'park slope', ids: ['202'] },
  { phrase: 'brooklyn heights', ids: ['202'] },
  { phrase: 'cobble hill', ids: ['202'] },
  { phrase: 'bed stuy', ids: ['203'] },
  { phrase: 'bedford stuyvesant', ids: ['203'] },
  { phrase: 'crown heights', ids: ['203'] },
  { phrase: 'long island city', ids: ['401'] },
  { phrase: 'jackson heights', ids: ['402'] },
  { phrase: 'forest hills', ids: ['405'] },
  { phrase: 'coney island', ids: ['210'] },
  { phrase: 'sunset park', ids: ['205'] },
  { phrase: 'bay ridge', ids: ['209'] },
  { phrase: 'mott haven', ids: ['107'] },
  { phrase: 'south bronx', ids: ['107'] },
  { phrase: 'st george', ids: ['502'] },
  { phrase: 'harlem', ids: ['302', '303'] },
  { phrase: 'midtown', ids: ['306', '307'] },
  { phrase: 'soho', ids: ['308'] },
  { phrase: 'tribeca', ids: ['310'] },
  { phrase: 'fidi', ids: ['310'] },
  { phrase: 'ues', ids: ['305'] },
  { phrase: 'uws', ids: ['304'] },
  { phrase: 'les', ids: ['309'] },
  { phrase: 'dumbo', ids: ['202'] },
  { phrase: 'astoria', ids: ['401'] },
  { phrase: 'lic', ids: ['401'] },
  { phrase: 'williamsburg', ids: ['211'] },
  { phrase: 'bushwick', ids: ['211'] },
  { phrase: 'greenpoint', ids: ['201'] },
  { phrase: 'flushing', ids: ['403'] },
  { phrase: 'jamaica', ids: ['408'] },
  { phrase: 'rockaway', ids: ['410'] },
  { phrase: 'riverdale', ids: ['101'] },
  { phrase: 'inwood', ids: ['301'] },
  { phrase: 'chelsea', ids: ['306'] },
  { phrase: 'staten island', ids: ['501', '502', '503', '504'] },
]

const QUESTION =
  /\b(air|rent|toll|congestion|asthma|afford|pm|no2|lease|apartment|appart|should|what|how|why|cost|price|breathe|pollut|drive|car|subway)\b/i

type DeskBody = {
  /** Full reply, including the actions. This is what iMessage sends. */
  text: string
  /** The metrics, without the action links. The map renders this above the links. */
  spoken: string
  /** Action lines and the map link, appended after a model rewrite so the URLs stay exact. */
  suffix: string
  steps: NextStep[]
}

export type DeskTurn =
  | (DeskBody & { kind: 'help'; neighborhoodId: null })
  | (DeskBody & { kind: 'choose'; neighborhoodId: null; options: string[] })
  | (DeskBody & { kind: 'brief'; neighborhoodId: string; facts: BriefFacts; focus: string })
  | (DeskBody & { kind: 'compare'; neighborhoodId: string; facts: BriefFacts; focus: string })

export function congestionRelation(neighborhood: Neighborhood): ZoneRelation {
  if (INSIDE.has(neighborhood.id)) return 'inside'
  if (EDGE.has(neighborhood.id)) return 'edge'
  return 'outside'
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `)
}

function aliases(): { phrase: string; ids: string[] }[] {
  const generated: { phrase: string; ids: string[] }[] = []
  for (const neighborhood of CITY.neighborhoods) {
    generated.push({ phrase: norm(neighborhood.name), ids: [neighborhood.id] })
    for (const part of neighborhood.name.split(/\s+-\s+/)) {
      const phrase = norm(part)
      if (phrase.length >= 5) generated.push({ phrase, ids: [neighborhood.id] })
    }
  }
  return [...NICKNAMES, ...generated].sort((a, b) => b.phrase.length - a.phrase.length)
}

const ALIASES = aliases()

function placesIn(text: string): { neighborhoods: Neighborhood[]; phrases: number } {
  const query = norm(text)
  if (!query) return { neighborhoods: [], phrases: 0 }
  const hit = ALIASES.filter((alias) => includesPhrase(query, alias.phrase))
  const kept = hit.filter(
    (alias) => !hit.some((other) => other !== alias && other.phrase.includes(alias.phrase) && other.phrase.length > alias.phrase.length),
  )
  const ids: string[] = []
  for (const alias of kept) {
    for (const id of alias.ids) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return {
    neighborhoods: ids.map((id) => neighborhoodById(id)).filter((n): n is Neighborhood => n != null),
    phrases: kept.length,
  }
}

function coordinatesIn(text: string): Neighborhood | null {
  const match = text.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
  if (!match) return null
  const a = Number(match[1])
  const b = Number(match[2])
  const lat = Math.abs(a) < 50 ? a : b
  const lon = Math.abs(a) < 50 ? b : a
  return neighborhoodById(neighborhoodIdAt(lon, lat))
}

function money(value: number): string {
  const cents = !Number.isInteger(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value)
}

function rentLine(facts: BriefFacts, withZori: boolean): string[] {
  const thin = facts.asking_n != null && facts.asking_n < 30
  const asking =
    facts.asking_1br != null
      ? `New one-bedrooms ask ${money(facts.asking_1br)}${
          facts.city_asking_1br != null ? `, city median ${money(facts.city_asking_1br)}` : ''
        }.${thin ? ` Only ${formatCount(facts.asking_n ?? 0)} listings.` : ''} Not a sitting tenant's rent.`
      : 'No one-bedroom asking rent joined here.'
  const deep = `${formatCount(facts.deep_units)} deeply affordable units financed since 2014, not vacant listings.`
  const zori =
    withZori && facts.zori_last != null
      ? `Zillow index ${money(facts.zori_last)} in ${facts.zori_last_year}${
          facts.zori_2019 != null ? ` (${formatPercent(percentChange(facts.zori_2019, facts.zori_last))} since 2019)` : ''
        }, a different measure from asking rent.`
      : null
  return [asking, deep, zori].filter((line): line is string => line != null)
}

function airLine(facts: BriefFacts, withNo2: boolean): string {
  const pm =
    facts.pm25_2024 != null
      ? `PM2.5 ${formatUg(facts.pm25_2024)} µg/m³ in 2024${
          facts.city_pm25_2024 != null ? ` (city ${formatUg(facts.city_pm25_2024)})` : ''
        }`
      : 'No 2024 PM2.5'
  const no2 = withNo2 && facts.no2_2024 != null ? `, NO2 ${formatUg(facts.no2_2024)} ppb` : ''
  const asthma =
    facts.asthma_child != null
      ? `Child asthma visits ${formatCount(Math.round(facts.asthma_child))} per 100,000${
          facts.city_asthma != null ? `, against ${formatCount(Math.round(facts.city_asthma))} citywide` : ''
        } (${facts.asthma_period}). `
      : ''
  return `${asthma}${pm}${no2}. The air record does not show whether the toll changed the air.`
}

function zoneLine(neighborhood: Neighborhood, full: boolean): string {
  const relation = congestionRelation(neighborhood)
  const where =
    relation === 'inside'
      ? neighborhood.id === '306' || neighborhood.id === '307'
        ? 'Most of it sits inside the Congestion Relief Zone. Confirm a block at or north of 60th.'
        : 'It sits inside the Congestion Relief Zone.'
      : relation === 'edge'
        ? 'It crosses 60th Street, so some blocks are inside the Congestion Relief Zone.'
        : 'It is outside the Congestion Relief Zone.'
  const rate = `E-ZPass ${money(TOLL.peakEzPass)} at peak and ${money(TOLL.overnightEzPass)} overnight to drive in.`
  const detail = full
    ? ` Peak is ${TOLL.peakHours}. Tolls by Mail are ${money(TOLL.peakMail)} and ${money(TOLL.overnightMail)}. The FDR, West Side Highway, and Hugh L. Carey connections to West Street are not tolled.`
    : ''
  return `${where} ${rate}${detail}`
}

function mapLine(origin: string, id: string): string {
  const base = origin.replace(/\/$/, '')
  return `Map: ${base}/?n=${id}`
}

function stepsFor(neighborhood: Neighborhood, council: CouncilPin | null): NextStep[] {
  const district = council && council.neighborhoodId === neighborhood.id ? council.district : null
  return nextSteps(neighborhood, CITY.neighborhoods, district)
}

function actionSuffix(steps: NextStep[], origin: string, id: string): string {
  const lines = steps.map((step) => `${step.note} ${step.href}`)
  return `What you can do: ${lines.join(' ')} ${mapLine(origin, id)}`
}

function briefParts(neighborhood: Neighborhood, question: string): { spoken: string; facts: BriefFacts } {
  const facts = factsFor(neighborhood)
  const focus = question.toLowerCase()
  const toll = /toll|congestion|\bdrive\b|\bcar\b/.test(focus)
  const air = /air|asthma|pollut|no2|\bpm\b/.test(focus)
  const rent = rentLine(facts, focus.includes('zillow'))
  const lines = toll
    ? [zoneLine(neighborhood, true), airLine(facts, false), ...rent]
    : air
      ? [airLine(facts, true), ...rent, zoneLine(neighborhood, false)]
      : [...rent, airLine(facts, false), zoneLine(neighborhood, false)]
  return {
    spoken: lines.join('\n'),
    facts,
  }
}

function compareSpoken(left: Neighborhood, right: Neighborhood): string {
  const line = (neighborhood: Neighborhood) => {
    const facts = factsFor(neighborhood)
    const rent = facts.asking_1br != null ? money(facts.asking_1br) : 'no joined one-bedroom median'
    const pm = facts.pm25_2024 != null ? `${formatUg(facts.pm25_2024)} µg/m³ PM2.5 in 2024` : 'no 2024 PM2.5'
    const relation = congestionRelation(neighborhood)
    const where = relation === 'inside' ? 'inside' : relation === 'edge' ? 'on the edge of' : 'outside'
    return `${neighborhood.name}: one-bedroom asking ${rent}, ${pm}, ${where} the congestion zone.`
  }
  return `${line(left)} ${line(right)} Air figures end in 2024 and do not show whether the toll changed the air. E-ZPass is ${money(TOLL.peakEzPass)} at peak to enter the zone.`.replace(
    /\s+/g,
    ' ',
  )
}

const EMPTY: Pick<DeskBody, 'suffix' | 'steps'> = { suffix: '', steps: [] }

function reply(
  spoken: string,
  suffix: string,
  lead = '',
): { text: string; spoken: string; suffix: string } {
  const flat = spoken.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const text = `${lead}${lead ? ' ' : ''}${flat} ${suffix}`.replace(/\s+/g, ' ').trim()
  return { text, spoken, suffix }
}

const HELP =
  'Text a New York neighborhood. I will read the rent, the 2024 air, and the congestion toll, then name the step those numbers support. Try East Harlem, Astoria, or Lower Manhattan. The air record stops in 2024, so I will not score the toll.'

export function interpretDesk(
  text: string,
  priorId: string | null,
  origin: string,
  council: CouncilPin | null = null,
): DeskTurn {
  const trimmed = text.trim()
  if (!trimmed || /^(hi|hey|hello|help|start|yo)[.!?\s]*$/i.test(trimmed)) {
    return { kind: 'help', text: HELP, spoken: HELP, neighborhoodId: null, ...EMPTY }
  }

  const pinned = coordinatesIn(trimmed)
  const found = pinned ? { neighborhoods: [pinned], phrases: 1 } : placesIn(trimmed)
  const named = found.neighborhoods
  const ambiguous = found.phrases < 2 && named.length > 1
  if (named.length > 2 || ambiguous) {
    const sample = named
      .slice(0, 4)
      .map((n) => n.name)
      .join(', ')
    const text = `That name covers more than one neighborhood: ${sample}. Name one of them.`
    return {
      kind: 'choose',
      text,
      spoken: text,
      neighborhoodId: null,
      options: named.map((n) => n.id),
      ...EMPTY,
    }
  }
  if (named.length === 2) {
    const [left, right] = named
    const steps = stepsFor(left, council)
    const rightLead = stepsFor(right, council)[0]
    const suffix = `What you can do: ${left.name}: ${steps[0].note} ${steps[0].href} ${right.name}: ${rightLead.note} ${rightLead.href} ${mapLine(origin, left.id)}`
    return {
      kind: 'compare',
      ...reply(compareSpoken(left, right), suffix),
      neighborhoodId: left.id,
      facts: factsFor(left),
      focus: trimmed,
      steps,
    }
  }
  if (named.length === 1) {
    return briefTurn(named[0], trimmed, origin, council)
  }

  const prior = neighborhoodById(priorId)
  if (prior && QUESTION.test(trimmed)) {
    return briefTurn(prior, trimmed, origin, council)
  }

  const missed = `That name is not one of the 42 neighborhoods in this atlas. ${HELP}`
  return { kind: 'help', text: missed, spoken: missed, neighborhoodId: null, ...EMPTY }
}

function briefTurn(
  neighborhood: Neighborhood,
  question: string,
  origin: string,
  council: CouncilPin | null,
): DeskTurn {
  const { spoken, facts } = briefParts(neighborhood, question)
  const steps = stepsFor(neighborhood, council)
  return {
    kind: 'brief',
    ...reply(spoken, actionSuffix(steps, origin, neighborhood.id), `${neighborhood.name}, ${neighborhood.borough}.`),
    neighborhoodId: neighborhood.id,
    facts,
    focus: question,
    steps,
  }
}

/** Facts the model is allowed to use when it rewrites a desk brief. */
export function modelBrief(turn: DeskTurn): { system: string; user: string } | null {
  if (turn.kind !== 'brief' && turn.kind !== 'compare') return null
  return {
    system: [
      'You portray measured conditions for New York neighborhoods, replying in iMessage.',
      'Use only the numbers and statements in the user message.',
      'Write at most four short sentences, under 60 words, in the order of the grounding.',
      'Do not add history or detail that is not in the grounding.',
      'Do not add links, offices, lottery buildings, or council member names. The app appends those actions.',
      'Listing rent and the Zillow index are different measures. Say so when both appear.',
      'Deeply affordable counts are financed units, not vacant listings.',
      'Do not claim the toll changed air quality. The air record ends in 2024, before January 5, 2025.',
      'Do not invent rates, crossings, or health effects.',
    ].join(' '),
    user: `Grounding brief:\n${turn.text.split(' What you can do:')[0]}\n\nQuestion: ${turn.focus}`,
  }
}
