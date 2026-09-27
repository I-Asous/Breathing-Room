/**
 * Design Direction
 *
 * Product: A neighborhood atlas for Columbia DivHacks Hack the City, so a
 * resident or a council staffer can see where air, rent, and deep affordability
 * land differently across New York.
 * Emotion: The quiet unease of a newspaper graphic that will not let the
 * expensive neighborhood and the asthma neighborhood be two different stories.
 * Metaphor: A broadsheet opened on a kitchen table, the map still damp from the press.
 * References: A New York Times print map, a surveyor's notebook, a rent-stabilized
 * lease with the numbers circled.
 * Signature: The 42-neighborhood choropleth, inked from moss to brick.
 * Hero: The map is on screen immediately, with three citywide figures beside it.
 *
 * Style Tile
 * - Color: warm newsprint, ink, brick pressure, moss relief; low saturation
 * - Type: Newsreader for figures and headlines, Public Sans for the record
 * - Theme: light, because this is a document you are meant to read in daylight
 * - Art direction: editorial cartography
 * - Motion: a short fill change when the layer or year moves; nothing loops
 * - Voice: specific, numerical, unwilling to score data it does not have
 */

import { Link } from 'react-router-dom'
import CityAtlas from '@/components/city/CityAtlas'
import CleaningNotes from '@/components/city/CleaningNotes'
import { CITY } from '@/lib/metrics'

const traffic = 'headline' in CITY.trafficNote ? CITY.trafficNote : null

export default function Landing() {
  return (
    <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Columbia DivHacks · Hack the City
            </p>
            <h1 className="display text-lg leading-none">Breathing Room</h1>
          </div>
          <Link to="/home" className="text-sm underline underline-offset-4">
            Forums
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6 md:py-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          New York, neighborhood by neighborhood
        </p>
        <p className="mb-6 max-w-2xl text-base text-muted-foreground">
          Forty-two neighborhoods. The air through 2024, asking rents for new one-bedroom leases through
          August 2026, and where deeply affordable homes were built.
        </p>
        <CityAtlas />

        <CleaningNotes />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
          <p className="mb-3">
            ZIP rents are placed in a neighborhood by the centroid of listings in that ZIP.
            Asthma estimates end in 2017–2019. The neighborhood air model ends in 2024, the year
            before congestion pricing; it is not scored here. The map's monitor dots add real,
            far sparser EPA readings from after that date.
          </p>
          {traffic && (
            <p className="mb-3">
              {traffic.headline}{' '}
              <a className="underline underline-offset-4" href={traffic.href}>
                {traffic.source}
              </a>
              .
            </p>
          )}
          <ul className="space-y-1">
            {CITY.sources.map((source) => (
              <li key={source.href}>
                <a className="underline underline-offset-4" href={source.href}>
                  {source.name}
                </a>
                <span> — {source.publisher}</span>
              </li>
            ))}
            <li>
              <a className="underline underline-offset-4" href="https://www.census.gov/programs-surveys/acs/data/summary-file.html">
                American Community Survey 5-year, households by ZIP (B11001)
              </a>
              <span> — US Census Bureau, 2020–2024, summed into neighborhoods by NYC Health ZIP definition</span>
            </li>
            <li>
              <a className="underline underline-offset-4" href="https://www.census.gov/programs-surveys/acs/data/summary-file.html">
                American Community Survey 5-year, gross rent as a share of income by ZIP (B25070)
              </a>
              <span> — US Census Bureau, 2020–2024, checked against </span>
              <a className="underline underline-offset-4" href="https://a816-dohbesp.nyc.gov/IndicatorPublic/data-explorer/housing-stability/?id=2336">
                NYC Health's rent-burdened households
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
