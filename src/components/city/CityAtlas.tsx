import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RentTrend from '@/components/city/RentTrend'
import StreetMap, { hoodColor, type HoodPaint, type MapPin } from '@/components/city/StreetMap'
import {
  AIR_YEARS,
  BOROUGHS,
  CITY,
  RENT_MONTHS,
  airAt,
  boroughSummary,
  burdenShare,
  deepPer1k,
  formatPercent,
  formatRate,
  formatRent,
  formatShare,
  formatUg,
  isBorough,
  last,
  layerRange,
  nearestPmMonitors,
  neighborhoodById,
  percentChange,
  percentile,
  readingFor,
  toneIndex,
  type Borough,
  type Layer,
  type Neighborhood,
} from '@/lib/metrics'
import { EPA_ANNUAL_PM25, rentCapForIncome, rentGuidelineGap, signingHint } from '@/lib/actions'
import ActionPanel from '@/components/city/ActionPanel'
import DeskDock from '@/components/city/DeskDock'
import {
  DEFAULT_WEIGHTS,
  SCORE_LIMITS,
  SCORE_MEANS,
  burdenRows,
  carriesAllThree,
  readPlace,
  rentAgainstAsk,
  togetherLine,
  weightPercents,
  type BurdenWeights,
} from '@/lib/burden-index'
import { councilDistrictAt } from '@/lib/council'
import { monthLabel, neighborhoodsForBudget } from '@/lib/overlay'
import { findNeighborhood } from '@/lib/place-search'
import './atlas.css'

const BOROUGH_OF = new Map(CITY.neighborhoods.map((n) => [n.id, n.borough]))
const NAME_OF = new Map(CITY.neighborhoods.map((n) => [n.id, n.name]))

type MapView = 'combined' | 'air' | 'burden' | 'rent'

const VIEWS: { id: MapView; label: string; hint: string }[] = [
  {
    id: 'combined',
    label: 'Combined burden',
    hint: 'Darker means a heavier mix of 2024 PM2.5, rent burden, and rising new-lease asks. The weights sit beside the score.',
  },
  {
    id: 'air',
    label: 'Air',
    hint: 'Annual PM2.5. The survey runs through 2024, the year before congestion pricing.',
  },
  {
    id: 'burden',
    label: 'Rent burden',
    hint: 'Share of renter households paying 30% or more of income on rent and utilities, 2020–2024.',
  },
  {
    id: 'rent',
    label: 'New leases',
    hint: 'Median asking rent for a new one-bedroom. Tenants already in place, including rent-stabilized ones, often pay less.',
  },
]

function hoodPaints(
  readings: Map<string, { tone: number | null } | undefined>,
  borough: string | null,
  focusId: string | null,
  zoomed: boolean,
): HoodPaint[] {
  return CITY.neighborhoods.map((neighborhood) => {
    const reading = readings.get(neighborhood.id)
    const outside = borough != null && neighborhood.borough !== borough
    return {
      id: neighborhood.id,
      color: hoodColor(reading),
      opacity: outside ? 0.14 : zoomed ? 0.46 : 0.55,
      line: outside ? 0.22 : focusId === neighborhood.id ? 1 : 0.72,
      selected: focusId === neighborhood.id ? 1 : 0,
    }
  })
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 240
      const y = 36 - ((value - min) / span) * 28
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox="0 0 240 40" role="img" aria-label="PM2.5 from the first survey year through 2024">
      <path d={d} />
    </svg>
  )
}

function Weights({
  weights,
  onChange,
}: {
  weights: BurdenWeights
  onChange: (next: BurdenWeights) => void
}) {
  const split = weightPercents(weights)
  const rows: { key: keyof BurdenWeights; label: string }[] = [
    { key: 'air', label: 'Air' },
    { key: 'burden', label: 'Rent burden' },
    { key: 'rent', label: 'Rent rise' },
  ]
  return (
    <div>
      {rows.map((row) => (
        <label key={row.key} className="weight-row">
          <span>{row.label}</span>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={weights[row.key]}
            aria-valuetext={split ? `${split[row.key]} percent` : 'unused'}
            onChange={(event) => onChange({ ...weights, [row.key]: Number(event.target.value) })}
          />
          <span>{split ? `${split[row.key]}%` : '—'}</span>
        </label>
      ))}
    </div>
  )
}

function monitorSentence(lon: number, lat: number): string | null {
  const near = nearestPmMonitors(lon, lat)
  if (!near) return null
  const nearest = `${near.nearest.name}, ${near.nearest.miles.toFixed(1)} miles away, annual mean ${formatUg(near.nearest.value)} µg/m³ in ${near.nearest.year}`
  if (near.within === 0) {
    return `No EPA PM2.5 monitor is within ${near.radiusMiles} miles of this address. The nearest is ${nearest}. The neighborhood color is the survey, not a monitor on this block. NYC has ${near.citywide} of these monitors.`
  }
  const count = near.within === 1 ? 'One EPA PM2.5 monitor is' : `${near.within} EPA PM2.5 monitors are`
  return `${count} within ${near.radiusMiles} miles of this address. The nearest is ${nearest}. That reading is the monitor, not the neighborhood mean above. NYC has ${near.citywide} of these monitors.`
}

export default function CityAtlas() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<MapView>('combined')
  const [weights, setWeights] = useState<BurdenWeights>(DEFAULT_WEIGHTS)
  const [budgetInput, setBudgetInput] = useState('')
  const [incomeInput, setIncomeInput] = useState('')
  const [paidInput, setPaidInput] = useState('')
  const [airYear, setAirYear] = useState('2024')
  const [rentMonth, setRentMonth] = useState(RENT_MONTHS[RENT_MONTHS.length - 1] ?? '2026-08')
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeStatus, setPlaceStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [placeNote, setPlaceNote] = useState('')
  const [pin, setPin] = useState<MapPin | null>(null)
  const [district, setDistrict] = useState<number | null>(null)

  const focus: Neighborhood | null = neighborhoodById(params.get('n'))
  const boroughParam = params.get('b')
  const borough: Borough | null = focus
    ? isBorough(focus.borough)
      ? focus.borough
      : null
    : isBorough(boroughParam)
      ? boroughParam
      : null
  const area = useMemo(() => (borough ? boroughSummary(borough) : null), [borough])
  const zoomed = borough != null
  const choices = borough ? CITY.neighborhoods.filter((n) => n.borough === borough) : CITY.neighborhoods
  const rows = useMemo(() => burdenRows(weights), [weights])
  const focusRow = focus ? (rows.find((row) => row.id === focus.id) ?? null) : null
  const placeRead = focus && focusRow ? readPlace(focus, focusRow) : null
  const together = useMemo(() => togetherLine(burdenRows()), [])

  useEffect(() => {
    if (!pin) {
      setDistrict(null)
      return
    }
    let cancel = false
    void councilDistrictAt(pin.lon, pin.lat).then((value) => {
      if (!cancel) setDistrict(value)
    })
    return () => {
      cancel = true
    }
  }, [pin])

  const layer: Layer = view === 'combined' ? 'air' : view
  const readings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof readingFor>>()
    if (view === 'combined') return map
    for (const neighborhood of CITY.neighborhoods) {
      map.set(neighborhood.id, readingFor(neighborhood, layer, airYear, rentMonth, CITY.neighborhoods))
    }
    return map
  }, [view, layer, airYear, rentMonth])

  const range = useMemo(
    () => (view === 'combined' ? null : layerRange(layer, airYear, rentMonth, CITY.neighborhoods)),
    [view, layer, airYear, rentMonth],
  )

  const paints = useMemo<HoodPaint[]>(() => {
    if (view !== 'combined') return hoodPaints(readings, borough, focus?.id ?? null, zoomed)
    const present = rows.map((row) => row.score).filter((score): score is number => score != null)
    const scored = new Map(rows.map((row) => [row.id, row.score]))
    const combined = new Map<string, { tone: number | null }>()
    for (const neighborhood of CITY.neighborhoods) {
      const score = scored.get(neighborhood.id) ?? null
      combined.set(neighborhood.id, {
        tone: score == null ? null : toneIndex(percentile(score, present)),
      })
    }
    return hoodPaints(combined, borough, focus?.id ?? null, zoomed)
  }, [view, readings, rows, borough, focus, zoomed])

  function choose(id: string) {
    const next = new URLSearchParams(params)
    next.set('n', id)
    const home = BOROUGH_OF.get(id)
    if (home) next.set('b', home)
    next.delete('c')
    setParams(next, { replace: true })
    setPin(null)
    setPaidInput('')
  }

  async function findPlace() {
    setPlaceStatus('loading')
    setPlaceNote('')
    const match = await findNeighborhood(placeQuery)
    if ('error' in match) {
      setPlaceStatus('error')
      setPlaceNote(match.error)
      return
    }
    const next = new URLSearchParams(params)
    next.set('n', match.id)
    const home = BOROUGH_OF.get(match.id)
    if (home) next.set('b', home)
    next.delete('c')
    setParams(next, { replace: true })
    setPin(
      match.lon != null && match.lat != null
        ? { id: match.id, lon: match.lon, lat: match.lat, label: match.matched }
        : null,
    )
    setPaidInput('')
    setPlaceStatus('idle')
    setPlaceNote(`${match.matched} is in ${NAME_OF.get(match.id)}, ${BOROUGH_OF.get(match.id)}.`)
  }

  function chooseBorough(name: Borough | null) {
    const next = new URLSearchParams(params)
    next.delete('n')
    next.delete('c')
    if (name) next.set('b', name)
    else next.delete('b')
    setParams(next, { replace: true })
    setPin(null)
    setPaidInput('')
  }

  const incomeValue = Number(incomeInput)
  const incomeCap = incomeInput.trim() && Number.isFinite(incomeValue) ? rentCapForIncome(incomeValue) : null
  const budgetValue = incomeCap ?? Number(budgetInput)
  const bracket =
    (incomeCap != null || budgetInput.trim()) && Number.isFinite(budgetValue)
      ? neighborhoodsForBudget(budgetValue)
      : null
  const paidValue = Number(paidInput)
  const paidNote =
    focusRow?.ask != null && paidInput.trim() && Number.isFinite(paidValue) && paidValue > 0
      ? rentAgainstAsk(paidValue, focusRow.ask)
      : null
  const gap = focus ? rentGuidelineGap(focus) : null
  const season = focus ? signingHint(focus) : null
  const monitors = pin && focus && pin.id === focus.id ? monitorSentence(pin.lon, pin.lat) : null
  const activeHint = VIEWS.find((item) => item.id === view)?.hint
  const scopeIds = useMemo(
    () =>
      focus ? [focus.id] : borough ? CITY.neighborhoods.filter((n) => n.borough === borough).map((n) => n.id) : [],
    [focus, borough],
  )

  const cityPm = airAt(CITY.citywide.pm25, '2024')
  const cityBurden = burdenShare(CITY.neighborhoods)
  const cityAsk = last(CITY.citywide.asking1br)
  const cityAskStart = CITY.citywide.asking1br[0]
  const cityRentChange = percentChange(cityAskStart?.median1br ?? null, cityAsk?.median1br ?? null)

  return (
    <div className="atlas">
      <div className="atlas-find">
        <form
          className="place-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            void findPlace()
          }}
        >
          <label htmlFor="place-query" className="text-sm text-muted-foreground">
            Address or ZIP
          </label>
          <div className="place-search-row">
            <input
              id="place-query"
              type="search"
              value={placeQuery}
              placeholder="2 E 116th St, or 11216"
              autoComplete="street-address"
              onChange={(event) => setPlaceQuery(event.target.value)}
            />
            <button type="submit" disabled={placeStatus === 'loading' || !placeQuery.trim()}>
              {placeStatus === 'loading' ? 'Finding…' : 'Find'}
            </button>
          </div>
          <p className="text-sm mt-1" role="status">
            {placeNote}
          </p>
        </form>
        <label className="block text-sm">
          <span className="text-muted-foreground">Neighborhood</span>
          <select
            className="place-select mt-1"
            value={focus?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) choose(event.target.value)
            }}
          >
            <option value="" disabled>
              {borough ? `Choose a neighborhood in ${borough}` : 'Choose a neighborhood'}
            </option>
            {choices.map((n) => (
              <option key={n.id} value={n.id}>
                {borough ? n.name : `${n.borough} — ${n.name}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="atlas-stage">
        <div className="atlas-map">
          <div className="layer-rail" role="group" aria-label="What the map colors">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={view === item.id}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{activeHint}</p>
          <div className="layer-rail borough-rail" role="group" aria-label="Borough">
            <button type="button" aria-pressed={borough == null} onClick={() => chooseBorough(null)}>
              All five
            </button>
            {BOROUGHS.map((name) => (
              <button key={name} type="button" aria-pressed={borough === name} onClick={() => chooseBorough(name)}>
                {name}
              </button>
            ))}
          </div>
          {view === 'air' && (
            <label className="scrubber block text-sm">
              <span className="text-muted-foreground">PM2.5 year {airYear}</span>
              <input
                type="range"
                min={0}
                max={AIR_YEARS.length - 1}
                value={Math.max(0, AIR_YEARS.indexOf(airYear))}
                onChange={(event) => setAirYear(AIR_YEARS[Number(event.target.value)] ?? '2024')}
              />
            </label>
          )}
          {view === 'rent' && (
            <label className="scrubber block text-sm">
              <span className="text-muted-foreground">Listings {monthLabel(rentMonth)}</span>
              <input
                type="range"
                min={0}
                max={RENT_MONTHS.length - 1}
                value={Math.max(0, RENT_MONTHS.indexOf(rentMonth))}
                onChange={(event) => setRentMonth(RENT_MONTHS[Number(event.target.value)] ?? rentMonth)}
              />
            </label>
          )}
          <div className="map-frame">
            <StreetMap
              paints={paints}
              focusId={focus?.id ?? null}
              scopeIds={scopeIds}
              monitors={[]}
              showMonitors={false}
              activeMonitorId={null}
              onSelectHood={choose}
              onSelectMonitor={() => {}}
              pin={pin}
              traffic={null}
            />
            <div className="legend">
              <span className="text-xs text-muted-foreground">
                {view === 'combined' ? 'Lighter burden' : (range?.low ?? 'Lower')}
              </span>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((tone) => (
                <i key={tone} className={`tone-${tone}`} aria-hidden="true" />
              ))}
              <span className="text-xs text-muted-foreground">
                {view === 'combined' ? 'Heavier burden' : (range?.high ?? 'Higher')}
              </span>
            </div>
          </div>
        </div>

        <aside className="dossier">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {focus && borough ? (
              <button type="button" className="borough-link" onClick={() => chooseBorough(borough)}>
                ← {focus.borough}
              </button>
            ) : area ? (
              <button type="button" className="borough-link" onClick={() => chooseBorough(null)}>
                ← Citywide
              </button>
            ) : (
              'Citywide'
            )}
          </p>
          <h2 className="display text-4xl leading-none mt-1 mb-2">
            {focus ? focus.name : borough ?? 'All 42 neighborhoods'}
          </h2>

          {focus && focusRow && placeRead ? (
            <>
              <ActionPanel
                focus={focus}
                address={pin && pin.id === focus.id ? pin.label : null}
                district={pin && pin.id === focus.id ? district : null}
                paid={paidInput.trim() && Number.isFinite(paidValue) && paidValue > 0 ? paidValue : null}
              />
              <section className="theme-block" aria-labelledby="score-figure">
                <h3 id="score-figure">Combined burden</h3>
                <div className="figure-row">
                  <strong>{focusRow.score == null ? '—' : Math.round(focusRow.score)}</strong>
                  <div>
                    <div>out of 100. Higher means the three are heavier together.</div>
                    {carriesAllThree(focusRow) && (
                      <div>Above the middle of the 42 neighborhoods on air, rent burden, and the rise in new-lease asks.</div>
                    )}
                  </div>
                </div>
                <details className="fold">
                  <summary>How this score is weighted</summary>
                  <p className="text-sm mt-2">{SCORE_MEANS}</p>
                  <Weights weights={weights} onChange={setWeights} />
                  <p className="text-xs text-muted-foreground mt-2">{SCORE_LIMITS}</p>
                </details>
              </section>

              <section className="theme-block" aria-labelledby="air-figure">
                <h3 id="air-figure">Air quality</h3>
                <p className="text-sm mt-1">{placeRead.airMeans}</p>
                <p className="text-sm mt-1">{placeRead.airLine}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The EPA annual standard is {EPA_ANNUAL_PM25.toFixed(1)} µg/m³. The air record does not show whether
                  the toll changed the air.
                </p>
                {placeRead.no2Line && <p className="text-sm text-muted-foreground mt-1">{placeRead.no2Line}</p>}
                {placeRead.asthmaLine && <p className="text-sm mt-1">{placeRead.asthmaLine}</p>}
                {monitors && <p className="text-sm text-muted-foreground mt-1">{monitors}</p>}
                <Spark values={focus.pm25.map((point) => point.value)} />
                <p className="text-xs text-muted-foreground">Annual PM2.5, 2009–2024. NYC Community Air Survey.</p>
              </section>

              <section className="theme-block" aria-labelledby="equity-figure">
                <h3 id="equity-figure">Housing</h3>
                <p className="text-sm mt-1">{placeRead.burdenMeans}</p>
                <p className="text-sm mt-1">{placeRead.burdenLine}</p>
                <p className="text-xs text-muted-foreground mt-1">{placeRead.burdenCaveat}</p>
                {placeRead.deepLine && <p className="text-sm mt-2">{placeRead.deepLine}</p>}
              </section>

              <section className="theme-block" aria-labelledby="rent-figure">
                <h3 id="rent-figure">Rent</h3>
                <p className="text-sm mt-1">{placeRead.rentMeans}</p>
                <p className="text-sm mt-1">{placeRead.rentLine}</p>
                <p className="text-sm mt-1">{placeRead.rentMove}</p>
                <label className="block text-sm mt-3">
                  <span className="text-muted-foreground">What you pay now, monthly</span>
                  <input
                    className="place-select mt-1"
                    type="number"
                    min={0}
                    step={50}
                    inputMode="numeric"
                    placeholder="2500"
                    value={paidInput}
                    onChange={(event) => setPaidInput(event.target.value)}
                  />
                </label>
                {paidNote && <p className="text-sm mt-2">{paidNote}</p>}
                {gap ? (
                  <p className="text-sm mt-2">
                    {gap.note}{' '}
                    <a href={gap.orderHref} target="_blank" rel="noreferrer">
                      Order 57 ↗
                    </a>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">
                    The latest month has fewer than 20 listings, so this page does not compare the ask with the Rent
                    Guidelines Board cap.
                  </p>
                )}
                {season && <p className="text-sm text-muted-foreground mt-2">{season.note}</p>}
                <RentTrend place={{ name: focus.name, asking1br: focus.asking1br }} />
              </section>
            </>
          ) : (
            <>
              <p className="text-sm">
                {borough && area
                  ? `${borough} is ${area.count} neighborhoods, read as their median for air and new leases. Rent burden is the share of the borough's renter households.`
                  : `Citywide, 2024 PM2.5 averages ${formatUg(cityPm)} µg/m³. ${formatShare(cityBurden)} of renter households pay 30% or more of income. New one-bedroom asks are ${formatPercent(cityRentChange)} since ${cityAskStart ? monthLabel(cityAskStart.month) : 'the start'}.`}
              </p>
              {borough && area && (
                <p className="text-sm mt-2">
                  PM2.5 {formatUg(airAt(area.pm25, '2024'))} µg/m³. Rent burden {formatShare(burdenShare(CITY.neighborhoods.filter((n) => n.borough === borough)))}.
                  Deeply affordable homes {formatRate(deepPer1k(CITY.neighborhoods.filter((n) => n.borough === borough)))} per
                  1,000 households. Latest new one-bedroom ask {formatRent(last(area.asking1br)?.median1br ?? null)}.
                </p>
              )}
              <section className="theme-block" aria-labelledby="score-figure">
                <h3 id="score-figure">Who carries all three</h3>
                {borough && (
                  <p className="text-xs text-muted-foreground mt-1">Across all 42 neighborhoods, not only {borough}.</p>
                )}
                <p className="text-sm mt-1">{together.sentence}</p>
                {together.names.length > 0 && (
                  <div className="name-row">
                    {together.names.map((row) => (
                      <button key={row.id} type="button" onClick={() => choose(row.id)}>
                        {row.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm mt-3">{SCORE_MEANS}</p>
                <Weights weights={weights} onChange={setWeights} />
                <p className="text-xs text-muted-foreground mt-2">{SCORE_LIMITS}</p>
                <h3 className="mt-4">Heaviest with these weights</h3>
                <ol className="desk-read">
                  {rows.slice(0, 8).map((row) => (
                    <li key={row.id}>
                      <button type="button" className="borough-link" onClick={() => choose(row.id)}>
                        {row.name}
                      </button>{' '}
                      {row.score == null ? '—' : Math.round(row.score)}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </aside>
      </div>

      <section className="health-premium" aria-labelledby="premium-title">
        <h3 id="premium-title" className="display text-2xl mb-1">
          Where a budget can go
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Neighborhoods whose latest new one-bedroom ask is at or under that monthly rent, cleanest 2024 air first.
          The 30% figure is a budgeting rule, not a legal cap, and it does not say what you qualify for.
        </p>
        <div className="atlas-find">
          <label className="block text-sm">
            <span className="text-muted-foreground">Yearly income</span>
            <input
              className="place-select mt-1"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              placeholder="62000"
              value={incomeInput}
              onChange={(event) => setIncomeInput(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">
              {incomeCap != null ? 'Monthly rent is set from income until you clear it' : 'Or a target monthly rent'}
            </span>
            <input
              className="place-select mt-1"
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              placeholder="3000"
              disabled={incomeCap != null}
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
            />
          </label>
        </div>
        {incomeCap != null && (
          <p className="text-sm mt-2">
            30% of {formatRent(incomeValue)} a year is {formatRent(incomeCap)} a month.
          </p>
        )}
        {bracket && bracket.rows.length === 0 && (
          <p className="text-sm mt-3">
            No neighborhood in this atlas has a new one-bedroom ask at or under {formatRent(bracket.budget)} in{' '}
            {monthLabel(bracket.month)}.
          </p>
        )}
        {bracket && bracket.rows.length > 0 && (
          <>
            <ol className="desk-read">
              {bracket.rows.map((row) => (
                <li key={row.id}>
                  <button type="button" className="borough-link" onClick={() => choose(row.id)}>
                    {row.name}
                  </button>{' '}
                  {formatRent(row.ask)}. PM2.5 {formatUg(row.pm25)} µg/m³.
                </li>
              ))}
            </ol>
            {bracket.insight && (
              <div className="next-steps">
                {bracket.insight.href.startsWith('http') ? (
                  <a href={bracket.insight.href} target="_blank" rel="noreferrer">
                    {bracket.insight.title} ↗
                  </a>
                ) : (
                  <Link to={bracket.insight.href}>{bracket.insight.title}</Link>
                )}
                <p className="text-sm text-muted-foreground">{bracket.insight.note}</p>
              </div>
            )}
          </>
        )}
      </section>
      <DeskDock
        focusId={focus?.id ?? null}
        focusName={focus?.name ?? null}
        pin={pin}
        district={district}
        onChoose={choose}
      />
    </div>
  )
}
