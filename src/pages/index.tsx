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
            <p className="display text-lg leading-none">Breathing Room</p>
          </div>
          <Link to="/home" className="text-sm underline underline-offset-4">
            Field desk
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          New York, neighborhood by neighborhood
        </p>
        <h1 className="text-5xl leading-[0.95] md:text-7xl max-w-3xl">Breathing Room</h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Forty-two neighborhoods. The air through 2024, one-bedroom asking rents through
          August 2026, and where deeply affordable homes were actually built.
        </p>

        <div className="mt-10">
          <CityAtlas />
        </div>
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
          </ul>
        </div>
      </footer>
    </div>
  )
}
