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

import CityAtlas from '@/components/city/CityAtlas'
import SiteHeader from '@/components/SiteHeader'
import { CITY } from '@/lib/metrics'

const SHOWN_SOURCES = new Set([
  'Air Quality and Health Impacts',
  'Affordable Housing Production by Building',
  'NYC rental listing extracts',
  'UHF42 neighborhood boundaries',
])

export default function Landing() {
  return (
    <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 py-6 md:py-8">
        <p className="mb-6 max-w-2xl text-base text-muted-foreground">
          Type an address or choose a neighborhood. See its air, the share of income that goes to rent, and what a
          new lease asks — and where those three are heavy together.
        </p>
        <CityAtlas />
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
