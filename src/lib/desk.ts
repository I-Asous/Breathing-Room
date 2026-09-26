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

export type DeskTurn =
  | { kind: 'help'; text: string; neighborhoodId: null }
  | { kind: 'choose'; text: string; neighborhoodId: null; options: string[] }
  | { kind: 'brief'; text: string; neighborhoodId: string; facts: BriefFacts; focus: string }
  | { kind: 'compare'; text: string; neighborhoodId: string; facts: BriefFacts; focus: string }

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

function zoneParagraph(neighborhood: Neighborhood): string {
  const relation = congestionRelation(neighborhood)
  const rate = `A passenger car with E-ZPass pays ${money(TOLL.peakEzPass)} to enter during peak hours (${TOLL.peakHours}) and ${money(TOLL.overnightEzPass)} overnight, once per calendar day. Tolls by Mail are ${money(TOLL.peakMail)} and ${money(TOLL.overnightMail)}. The FDR Drive, the West Side Highway, and the Hugh L. Carey connections to West Street are not tolled. A trip that stays inside the zone is not tolled either.`
  if (relation === 'inside') {
    const hedge =
      neighborhood.id === '306' || neighborhood.id === '307'
        ? 'Most of it is inside the Congestion Relief Zone, Manhattan local streets at or south of 60th Street. Confirm any block at or north of 60th.'
        : 'It sits inside the Congestion Relief Zone, Manhattan local streets at or south of 60th Street.'
    return `${hedge} ${rate}`
  }
  if (relation === 'edge') {
    return `${neighborhood.name} crosses 60th Street, so some blocks are in the Congestion Relief Zone and some are not. South of 60th is in the zone. ${rate}`
  }
  return `${neighborhood.name} is outside the Congestion Relief Zone. Living here does not itself charge the toll. Driving a car into Manhattan at or south of 60th Street does. ${rate}`
}

function rentParagraph(facts: BriefFacts): string {
  const thin = facts.asking_n != null && facts.asking_n < 30
  const asking =
    facts.asking_1br != null
      ? `One-bedroom listings in ${facts.asking_month} asked about ${money(facts.asking_1br)}${
          facts.asking_n != null ? ` across ${formatCount(facts.asking_n)} listings` : ''
        }${facts.city_asking_1br != null ? `, against a citywide median of ${money(facts.city_asking_1br)}` : ''}. That is an asking price, not the rent a sitting tenant pays.`
      : 'Listing rents did not join to this neighborhood, so there is no one-bedroom asking median to compare.'
  const sample = thin ? ` The median rests on only ${formatCount(facts.asking_n ?? 0)} listings, so treat it as a hint.` : ''
  const zori =
    facts.zori_last != null
      ? ` The Zillow index for ZIPs placed here was ${money(facts.zori_last)} in ${facts.zori_last_year}${
          facts.zori_2019 != null
            ? `, ${formatPercent(percentChange(facts.zori_2019, facts.zori_last))} since 2019`
            : ''
        }. That index tracks observed rents and can disagree with asking prices.`
      : ''
  const homes = ` Since 2014, preservation records count ${formatCount(facts.deep_units)} extremely-low and very-low income units in projects started here. Those are homes that were financed, not vacant apartments listed today.`
  return `${asking}${sample}${zori}${homes}`
}

function airParagraph(facts: BriefFacts): string {
  const pm =
    facts.pm25_2024 != null
      ? `In 2024, modeled annual PM2.5 was ${formatUg(facts.pm25_2024)} µg/m³${
          facts.city_pm25_2024 != null ? `, against ${formatUg(facts.city_pm25_2024)} citywide` : ''
        }${
          facts.pm25_2009 != null
            ? `. In 2009 it was ${formatUg(facts.pm25_2009)} (${formatPercent(percentChange(facts.pm25_2009, facts.pm25_2024))} since then)`
            : ''
        }.`
      : 'This extract has no 2024 PM2.5 value for this neighborhood.'
  const no2 =
    facts.no2_2024 != null
      ? ` Annual NO2 was ${formatUg(facts.no2_2024)} ppb${
          facts.no2_2009 != null ? `, from ${formatUg(facts.no2_2009)} ppb in 2009` : ''
        }.`
      : ''
  const asthma =
    facts.asthma_child != null
      ? ` The child asthma emergency-department estimate tied to PM2.5 is ${formatCount(Math.round(facts.asthma_child))} per 100,000 (${facts.asthma_period}), older than the rent record.`
      : ''
  return `${pm}${no2}${asthma} The air record ends in 2024, before congestion pricing began on ${TOLL.started}, so it does not show whether the toll changed the air.`
}

function mapLine(origin: string, id: string): string {
  const base = origin.replace(/\/$/, '')
  return `Map: ${base}/?n=${id}`
}

function briefText(neighborhood: Neighborhood, origin: string, question: string): string {
  const facts = factsFor(neighborhood)
  const rent = rentParagraph(facts)
  const air = airParagraph(facts)
  const zone = zoneParagraph(neighborhood)
  const focus = question.toLowerCase()
  const parts = [
    `${neighborhood.name}, ${neighborhood.borough}.`,
    focus.includes('toll') || focus.includes('congestion') || focus.includes('drive')
      ? [zone, air, rent]
      : focus.includes('air') || focus.includes('asthma') || focus.includes('pollut')
        ? [air, rent, zone]
        : [rent, air, zone],
  ]
  const flat = parts.flat()
  return `${flat.join(' ')} ${mapLine(origin, neighborhood.id)}`.replace(/\s+/g, ' ').trim()
}

function compareText(left: Neighborhood, right: Neighborhood, origin: string): string {
  const a = factsFor(left)
  const b = factsFor(right)
  const line = (facts: BriefFacts, neighborhood: Neighborhood) => {
    const rent = facts.asking_1br != null ? money(facts.asking_1br) : 'no joined one-bedroom median'
    const pm = facts.pm25_2024 != null ? `${formatUg(facts.pm25_2024)} µg/m³ PM2.5 in 2024` : 'no 2024 PM2.5'
    const relation = congestionRelation(neighborhood)
    const where = relation === 'inside' ? 'inside' : relation === 'edge' ? 'on the edge of' : 'outside'
    return `${neighborhood.name}: one-bedroom asking ${rent}, ${pm}, ${where} the congestion zone.`
  }
  return `${line(a, left)} ${line(b, right)} The air record ends in 2024, before the ${TOLL.started} toll, so neither figure shows whether congestion pricing changed the air. A passenger car with E-ZPass pays ${money(TOLL.peakEzPass)} at peak to enter the zone. ${mapLine(origin, left.id)}`.replace(
    /\s+/g,
    ' ',
  )
}

const HELP =
  'Text a New York neighborhood. I will tell you what a one-bedroom lists for, what the air measured in 2024, and how the congestion toll applies there. Try East Harlem, Astoria, or Lower Manhattan. The air record stops in 2024, so I will not score the toll.'

export function interpretDesk(text: string, priorId: string | null, origin: string): DeskTurn {
  const trimmed = text.trim()
  if (!trimmed || /^(hi|hey|hello|help|start|yo)[.!?\s]*$/i.test(trimmed)) {
    return { kind: 'help', text: HELP, neighborhoodId: null }
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
    return {
      kind: 'choose',
      text: `That name covers more than one neighborhood: ${sample}. Name one of them.`,
      neighborhoodId: null,
      options: named.map((n) => n.id),
    }
  }
  if (named.length === 2) {
    const [left, right] = named
    return {
      kind: 'compare',
      text: compareText(left, right, origin),
      neighborhoodId: left.id,
      facts: factsFor(left),
      focus: trimmed,
    }
  }
  if (named.length === 1) {
    const neighborhood = named[0]
    return {
      kind: 'brief',
      text: briefText(neighborhood, origin, trimmed),
      neighborhoodId: neighborhood.id,
      facts: factsFor(neighborhood),
      focus: trimmed,
    }
  }

  const prior = neighborhoodById(priorId)
  if (prior && QUESTION.test(trimmed)) {
    return {
      kind: 'brief',
      text: briefText(prior, origin, trimmed),
      neighborhoodId: prior.id,
      facts: factsFor(prior),
      focus: trimmed,
    }
  }

  return {
    kind: 'help',
    text: `That name is not one of the 42 neighborhoods in this atlas. ${HELP}`,
    neighborhoodId: null,
  }
}

/** Facts the model is allowed to use when it rewrites a desk brief. */
export function modelBrief(turn: DeskTurn): { system: string; user: string } | null {
  if (turn.kind !== 'brief' && turn.kind !== 'compare') return null
  return {
    system: [
      'You are a rental desk for New York neighborhoods, replying in iMessage.',
      'Use only the numbers and statements in the user message.',
      'Write 90 to 140 words in three short paragraphs: rent, air, then congestion pricing.',
      'Help the reader compare, and do not tell them to sign or reject a lease.',
      'Listing rent and the Zillow index are different measures. Say so when both appear.',
      'Deeply affordable counts are financed units, not vacant listings.',
      'Do not claim the toll changed air quality. The air record ends in 2024, before January 5, 2025.',
      'Do not invent rates, crossings, or health effects.',
    ].join(' '),
    user: `Grounding brief:\n${turn.text}\n\nQuestion: ${turn.focus}`,
  }
}
