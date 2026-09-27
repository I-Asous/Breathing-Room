/**
 * Design Direction
 *
 * Product: A citywide atlas for Columbia DivHacks Hack the City.
 * Emotion: Clear attention. The city averages look orderly. They do not land
 * in the same neighborhoods.
 * Metaphor: A daylight reading of the whole city, the map still the main page.
 * Hero: Three citywide figures, then the 42-neighborhood map.
 *
 * Style Tile
 * - Color: warm paper, soft ink, muted moss; no full-bleed alarm field
 * - Type: Newsreader for figures and headlines, Outfit for the record
 * - Theme: light
 * - Motion: a short fill change when the layer or year moves
 * - Voice: specific, numerical, unwilling to score data it does not have
 */

import { Link } from 'react-router-dom'
import CityAtlas from '@/components/city/CityAtlas'
import CleaningNotes from '@/components/city/CleaningNotes'
import SiteHeader from '@/components/SiteHeader'
import { BURDEN_PERIOD, CITY, airAt, burdenShare, formatRent, formatShare, formatUg, last } from '@/lib/metrics'

const SHOWN_SOURCES = new Set([
  'Air Quality and Health Impacts',
  'Affordable Housing Production by Building',
  'NYC rental listing extracts',
  'UHF42 neighborhood boundaries',
])

/** EPA primary annual PM2.5 standard, 2024. A threshold, not a measured value. */
const EPA_ANNUAL_PM25 = 9

export default function Landing() {
  const cityAsthma = last(CITY.citywide.asthmaChild)
  const cityAsk = last(CITY.citywide.asking1br)
  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityBurden = burdenShare(CITY.neighborhoods)
  const aboveCount = CITY.neighborhoods.filter((neighborhood) => {
    const value = airAt(neighborhood.pm25, '2024')
    return value != null && value > EPA_ANNUAL_PM25
  }).length
  const aboveLine =
    aboveCount === 0
      ? 'Every neighborhood in this record sits at or under that standard.'
      : aboveCount === 1
        ? 'One neighborhood is above that standard. The city figure does not name it.'
        : `${aboveCount} neighborhoods are above that standard. The city figure does not name them.`

  return (
    <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {cityAsthma && cityAsk && cityPm != null && (
        <section aria-label="New York City">
          <div className="city-hero">
            <p className="alarm-kicker">New York City</p>
            <h2>The city average is the number that looks fine.</h2>
            <p className="city-dek">
              Air, the share of income that goes to rent, and the new-lease ask are records for the whole city. They
              do not rise and fall in the same neighborhoods. The map is how you see all 42 at once.
            </p>
            <div className="city-figures">
              <article className="city-figure">
                <strong>{formatUg(cityPm)}</strong>
                <p>µg/m³ of PM2.5 in 2024, an annual mean. The EPA annual standard is {EPA_ANNUAL_PM25.toFixed(1)}. This is not a reading for today.</p>
              </article>
              <article className="city-figure">
                <strong>{formatShare(cityBurden)}</strong>
                <p>
                  of renter households pay 30% or more of income, {BURDEN_PERIOD}. The Census publishes a margin of
                  error for this share. This page does not carry it.
                </p>
              </article>
              <article className="city-figure">
                <strong>{formatRent(cityAsk.median1br)}</strong>
                <p>Latest citywide new one-bedroom ask. A new lease, not the rent a tenant already in place pays.</p>
              </article>
            </div>
          </div>
          <div className="city-reasons">
            <article className="city-reason">
              <p className="num">01</p>
              <h2>The air average sits under the standard</h2>
              <p>
                {formatUg(cityPm)} µg/m³ is under {EPA_ANNUAL_PM25.toFixed(1)}. {aboveLine} The annual mean also does
                not show whether the toll changed the air.
              </p>
            </article>
            <article className="city-reason">
              <p className="num">02</p>
              <h2>Rent burden is already half the city</h2>
              <p>
                {formatShare(cityBurden)} is the share of renter households, not a grade of any neighborhood. The
                new-lease ask of {formatRent(cityAsk.median1br)} is a separate measure.
              </p>
            </article>
            <article className="city-reason">
              <p className="num">03</p>
              <h2>The health rate is a city figure too</h2>
              <p>
                Child asthma visits were {Math.round(cityAsthma.value)} per 100,000 in {cityAsthma.period}. That rate
                is not flat across the 42 neighborhoods. The average is where to start.
              </p>
            </article>
          </div>
        </section>
      )}

      <main className="mx-auto max-w-6xl px-5 pb-8">
        <div className="atlas-intro">
          <p className="alarm-kicker">The whole city</p>
          <h2 className="display text-4xl leading-none md:text-5xl">Forty-two neighborhoods, one record.</h2>
          <p>
            Open a place when you want its steps. The round button is the desk, and it answers from the record you
            have open. <Link to="/home">Neighborhood forums</Link> are the public threads.
          </p>
        </div>
        <CityAtlas />

        <CleaningNotes />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-muted-foreground">
          <details className="fold">
            <summary>Sources, and what this page does not show</summary>
            <p className="mt-3 mb-3">
              ZIP rents are placed in a neighborhood by the centroid of listings in that ZIP. There is no
              block-level rent or air series. Asthma estimates end in 2017–2019. Neighborhood air ends in 2024,
              the year before congestion pricing, and does not show whether the toll changed the air. Asking rent
              is for new one-bedroom leases. Deeply affordable units are financed production since 2014, not vacant
              listings. Borough figures, when a borough is selected, are medians of its neighborhoods.
            </p>
            <ul className="space-y-1">
              {CITY.sources.filter((source) => SHOWN_SOURCES.has(source.name)).map((source) => (
                <li key={source.href}>
                  <a className="underline underline-offset-4" href={source.href}>
                    {source.name}
                  </a>
                  <span> — {source.publisher}</span>
                </li>
              ))}
              <li>
                <a
                  className="underline underline-offset-4"
                  href="https://www.census.gov/programs-surveys/acs/data/summary-file.html"
                >
                  American Community Survey 5-year, households by ZIP (B11001)
                </a>
                <span> — US Census Bureau, 2020–2024, summed into neighborhoods by NYC Health ZIP definition</span>
              </li>
              <li>
                <a
                  className="underline underline-offset-4"
                  href="https://www.census.gov/programs-surveys/acs/data/summary-file.html"
                >
                  American Community Survey 5-year, gross rent as a share of income by ZIP (B25070)
                </a>
                <span> — US Census Bureau, 2020–2024</span>
              </li>
            </ul>
          </details>
        </div>
      </footer>
    </div>
  )
}
