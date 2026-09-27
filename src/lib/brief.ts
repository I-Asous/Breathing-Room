import { formatCount, formatPercent, formatRate, formatRent, formatShare, formatUg, percentChange, type BriefFacts } from './metrics'

/**
 * A briefing written only from the snapshot. Used when the Grok request
 * cannot run, and as the fact sheet the model is allowed to draw on.
 */
export function briefFromFacts(facts: BriefFacts, question = ''): string {
  const pmDelta = percentChange(facts.pm25_2009, facts.pm25_2024)
  const zoriDelta = percentChange(facts.zori_2019 ?? facts.zori_first, facts.zori_last)
  const askDelta = percentChange(facts.asking_start, facts.asking_1br)
  const focus = question.trim().toLowerCase()

  const air = [
    facts.pm25_2024 != null
      ? `In 2024, modeled annual PM2.5 in ${facts.name} was ${formatUg(facts.pm25_2024)} µg/m³`
      : `${facts.name} has no 2024 PM2.5 value in this extract`,
    facts.city_pm25_2024 != null ? `, against a citywide ${formatUg(facts.city_pm25_2024)}` : '',
    facts.pm25_2009 != null ? `. In 2009 it was ${formatUg(facts.pm25_2009)} (${formatPercent(pmDelta)} since then)` : '',
    facts.no2_2024 != null ? `. Annual NO2 was ${formatUg(facts.no2_2024)} ppb` : '',
    facts.no2_2009 != null ? `, down from ${formatUg(facts.no2_2009)} ppb in 2009` : '',
    '.',
  ].join('')

  const health =
    facts.asthma_child != null
      ? ` The latest child asthma emergency-department estimate tied to PM2.5 is ${formatCount(Math.round(facts.asthma_child))} per 100,000 (${facts.asthma_period})${
          facts.city_asthma != null
            ? `, compared with ${formatCount(Math.round(facts.city_asthma))} citywide`
            : ''
        }. That health figure is older than the rent record.`
      : ''

  const rent = [
    facts.asking_1br != null
      ? ` A one-bedroom listing in ${facts.asking_month} asked about ${formatRent(facts.asking_1br)}`
      : ' Listing rents did not join to this neighborhood',
    facts.asking_n != null ? ` (${formatCount(facts.asking_n)} one-bedrooms)` : '',
    facts.city_asking_1br != null ? `, against a citywide median of ${formatRent(facts.city_asking_1br)}` : '',
    facts.asking_start != null && facts.asking_start_month
      ? `. Since ${facts.asking_start_month} that median moved ${formatPercent(askDelta)}`
      : '',
    facts.zori_last != null
      ? `. The Zillow rent index for ZIPs placed here was ${formatRent(facts.zori_last)} in ${facts.zori_last_year}, ${formatPercent(zoriDelta)} from ${facts.zori_2019 != null ? '2019' : String(facts.zori_first_year)}`
      : '. No Zillow ZIP index joined here, so the listing median is the rent series',
    '.',
  ].join('')

  const homes = ` Since 2014, housing-preservation records count ${formatCount(facts.deep_units)} extremely-low and very-low income units in projects started here${
    facts.deep_per_1k_households != null
      ? ` (${formatRate(facts.deep_per_1k_households)} per 1,000 households)`
      : ''
  }${
    facts.counted_units
      ? `, inside ${formatCount(facts.counted_units)} counted rental units`
      : ''
  }. Those are production counts, not a census of every apartment.${
    facts.rent_burden_pct != null
      ? ` ${formatShare(facts.rent_burden_pct)} of renter households here pay 30% or more of income on rent, and ${formatShare(
          facts.rent_burden_severe_pct,
        )} pay half or more (ACS ${facts.rent_burden_period}${
          facts.city_rent_burden_pct != null ? `; city ${formatShare(facts.city_rent_burden_pct)}` : ''
        }).`
      : ''
  }`

  const limit =
    ' NYCCAS annual neighborhood means in this atlas stop in 2024, the year before congestion pricing. They do not score the toll. A handful of real EPA monitors show 2025-2026 readings where they exist, marked apart from the modeled map. Rent listings run through August 2026.'

  let answer = ''
  if (focus.includes('asthma') || focus.includes('health') || focus.includes('child')) {
    answer = health.trim() ? ` On the health question: ${health.trim()}` : ' The asthma series does not include this neighborhood.'
  } else if (focus.includes('rent') || focus.includes('zillow') || focus.includes('1-bed') || focus.includes('one-bed')) {
    answer = ` On the rent question: ${rent.trim()}`
  } else if (focus.includes('afford') || focus.includes('equity') || focus.includes('housing') || focus.includes('unit')) {
    answer = ` On the housing question: ${homes.trim()}`
  } else if (focus.includes('air') || focus.includes('pm') || focus.includes('pollut') || focus.includes('toll')) {
    answer = ` On the air question: ${air.trim()}${limit.trim()}`
  }

  return `${facts.name}, ${facts.borough}. ${air}${health}${rent}${homes}${limit}${answer}`.replace(/\s+/g, ' ').trim()
}
