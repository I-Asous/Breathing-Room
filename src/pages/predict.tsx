import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AirOutlookChart, EquityMeters, RentOutlookChart } from '@/components/city/OutlookCharts'
import SiteHeader from '@/components/SiteHeader'
import '@/components/city/atlas.css'
import { monthLabel } from '@/lib/overlay'
import {
  EQUITY_HOLD,
  airSentence,
  cityAir,
  describeAirSlope,
  equityRecord,
  lineSentence,
  placeAir,
  rentOutlook,
  rentSentence,
} from '@/lib/outlook'
import {
  BOROUGHS,
  BURDEN_PERIOD,
  CITY,
  formatRate,
  formatRent,
  formatShare,
  formatUg,
  neighborhoodById,
} from '@/lib/metrics'

export default function PredictiveModeling() {
  const [params, setParams] = useSearchParams()
  const place = neighborhoodById(params.get('n'))
  const cityFit = useMemo(() => cityAir(), [])
  const placeFit = place ? placeAir(place) : null
  const rentRows = place ? place.asking1br : CITY.citywide.asking1br
  const rent = useMemo(() => rentOutlook(rentRows), [rentRows])
  const equity = equityRecord(place ? [place] : CITY.neighborhoods)
  const cityEquity = useMemo(() => equityRecord(CITY.neighborhoods), [])
  const equityName = place ? place.name : 'The city'
  const lineNote = rent ? lineSentence(rent) : null

  function choose(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('n', id)
    else next.delete('n')
    setParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-6 md:py-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Predictive Modeling</p>
        <h2 className="display mt-1 text-4xl leading-none">What the newest point can still say</h2>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Same three series as the atlas, continued one step. Air is a straight line through the annual survey,
          2009–2024. Rent repeats the same calendar month from the one year of listings on record, and only where
          both months have at least 20 one-bedroom listings. Housing equity is a single period, so it stays put.{' '}
          <Link to={place ? `/?n=${place.id}&b=${place.borough}#place` : '/'} className="underline underline-offset-4">
            Back to the neighborhood
          </Link>
          .
        </p>

        <label className="mt-6 block max-w-md text-sm">
          <span className="text-muted-foreground">Place</span>
          <select
            className="place-select mt-1"
            value={place?.id ?? ''}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="">Citywide</option>
            {BOROUGHS.map((borough) => (
              <optgroup key={borough} label={borough}>
                {CITY.neighborhoods
                  .filter((neighborhood) => neighborhood.borough === borough)
                  .map((neighborhood) => (
                    <option key={neighborhood.id} value={neighborhood.id}>
                      {neighborhood.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="dossier mt-8 max-w-3xl">
          <section className="theme-block" aria-labelledby="air-model">
            <h3 id="air-model">Air quality</h3>
            {cityFit && (
              <AirOutlookChart
                citySeries={CITY.citywide.pm25}
                cityFit={cityFit}
                placeName={place?.name ?? null}
                placeSeries={place?.pm25 ?? null}
                placeFit={placeFit}
              />
            )}
            {cityFit && (
              <>
                <p className="text-sm mt-2">
                  Citywide, {cityFit.n} annual means, {cityFit.firstYear}–{cityFit.lastYear}. Last published mean{' '}
                  {formatUg(cityFit.lastValue)} µg/m³. {describeAirSlope(cityFit.slopePerYear)} The line accounts for{' '}
                  {Math.round(cityFit.r2 * 100)}% of the year-to-year movement.
                </p>
                <p className="text-sm mt-2">{airSentence(cityFit)}</p>
              </>
            )}
            {place && placeFit && (
              <p className="text-sm mt-2">
                {place.name}: last published mean {formatUg(placeFit.lastValue)} µg/m³ in {placeFit.lastYear}.{' '}
                {describeAirSlope(placeFit.slopePerYear)} {airSentence(placeFit)}
              </p>
            )}
            {place && !placeFit && (
              <p className="text-sm mt-2">{place.name} does not have three annual means to draw a line through.</p>
            )}
          </section>

          <section className="theme-block" aria-labelledby="equity-model">
            <h3 id="equity-model">Housing equity</h3>
            <EquityMeters record={equity} city={cityEquity} name={place?.name ?? null} />
            <p className="text-sm mt-2">{EQUITY_HOLD}</p>
            <p className="text-sm mt-2">
              {equityName}: {formatShare(equity.burdenPct)} of renter households pay 30% or more of income, American
              Community Survey {BURDEN_PERIOD}. The Census publishes a margin of error on each ZIP. This page does not
              carry that margin.
            </p>
            {equity.asthmaRate != null && equity.asthmaPeriod && (
              <p className="text-sm mt-2">
                Child asthma emergency visits were {Math.round(equity.asthmaRate)} per 100,000 in {equity.asthmaPeriod}.
                That record ends in {equity.asthmaPeriod}.
              </p>
            )}
            {equity.deepPer1k != null && (
              <p className="text-sm mt-2">
                {formatRate(equity.deepPer1k)} deeply affordable homes were financed per 1,000 households since 2014.
                That is production, not vacant apartments, and it is not a year-by-year series.
              </p>
            )}
          </section>

          <section className="theme-block" aria-labelledby="rent-model">
            <h3 id="rent-model">Rent trends</h3>
            {rent && (
              <>
                <RentOutlookChart series={rentRows} outlook={rent} name={place ? place.name : 'Citywide'} />
                <p className="text-sm mt-2">
                  {place ? place.name : 'Citywide'} new one-bedroom asking rent, {monthLabel(rent.startMonth)} through{' '}
                  {monthLabel(rent.endMonth)}, {rent.points} months.
                  {rent.pairs.length === 0
                    ? ' Fewer than 20 listings sit on both sides of any year-apart month, so the change is left out.'
                    : ''}
                </p>
                <p className="text-sm mt-2">{rentSentence(rent)}</p>
                {rent.latestPair && (
                  <p className="text-sm mt-2">
                    The latest paired months are {monthLabel(rent.latestPair.earlierMonth)} at{' '}
                    {formatRent(rent.latestPair.earlier)} and {monthLabel(rent.latestPair.laterMonth)} at{' '}
                    {formatRent(rent.latestPair.later)}.
                  </p>
                )}
                {lineNote && (
                  <details className="fold mt-3">
                    <summary>The straight line through these months</summary>
                    <p className="text-sm mt-2">{lineNote}</p>
                  </details>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
