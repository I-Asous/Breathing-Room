import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import StreetMap, { hoodColor, type HoodPaint, type MapPin } from '@/components/city/StreetMap'
import {
  AIR_YEARS,
  BOROUGHS,
  CITY,
  RENT_MONTHS,
  airAt,
  askingAt,
  boroughSummary,
  factsFor,
  formatCount,
  formatPercent,
  formatRate,
  formatRent,
  deepPer1k,
  householdsIn,
  HOUSEHOLDS_PERIOD,
  formatUg,
  isBorough,
  last,
  layerRange,
  neighborhoodById,
  percentChange,
  readingFor,
  type Borough,
  type Layer,
  type Neighborhood,
} from '@/lib/metrics'
import { councilDistrictAt } from '@/lib/council'
import { interpretDesk, type CouncilPin } from '@/lib/desk'
import type { NextStep } from '@/lib/next-steps'
import { findNeighborhood } from '@/lib/place-search'
import { formatClock, hourAir, trafficMarkCount, WEEKDAY_CRZ_ENTRIES } from '@/lib/traffic-day'
import './atlas.css'

const BOROUGH_OF = new Map(CITY.neighborhoods.map((n) => [n.id, n.borough]))
const NAME_OF = new Map(CITY.neighborhoods.map((n) => [n.id, n.name]))
const LAYERS: { id: Layer; label: string; hint: string }[] = [
  { id: 'air', label: 'Air', hint: 'Annual mean PM2.5 from the community air survey.' },
  {
    id: 'rent',
    label: 'Rent',
    hint: 'Median asking rent for new one-bedroom leases, from listings. Tenants already in place, including rent-stabilized ones, often pay less.',
  },
  {
    id: 'pair',
    label: 'Rent × asthma',
    hint: 'Asking rent for new one-bedroom leases against child asthma ED visits tied to PM2.5 (2017–19), each split into thirds of the 42 neighborhoods. Brick is rent, slate is asthma, dark ink is both.',
  },
  { id: 'gap', label: 'Gap', hint: 'Asking rent for new leases beside deeply affordable units per 1,000 households, started since 2014.' },
]

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 240
      const y = 48 - ((value - min) / span) * 40
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" viewBox="0 0 240 52" role="img" aria-label="Trend">
      <path d={d} />
    </svg>
  )
}

function councilFor(
  pin: MapPin | null,
  neighborhoodId: string | null,
  district: number | null,
): CouncilPin | null {
  if (!pin || district == null || !neighborhoodId || pin.id !== neighborhoodId) return null
  return { district, neighborhoodId: pin.id }
}

function boroughRows() {
  return BOROUGHS.map((borough) => {
    const summary = boroughSummary(borough)
    return {
      borough,
      pm: airAt(summary.pm25, '2024'),
      rent: last(summary.asking1br)?.median1br ?? null,
      deep: summary.deep,
      deepPer1k: summary.deepPer1k,
      count: summary.count,
    }
  })
}

export default function CityAtlas() {
  const [params, setParams] = useSearchParams()
  const [layer, setLayer] = useState<Layer>('air')
  const [showMonitors, setShowMonitors] = useState(true)
  const [activeMonitorId, setActiveMonitorId] = useState<string | null>(null)
  const [airYear, setAirYear] = useState('2024')
  const [rentMonth, setRentMonth] = useState(RENT_MONTHS[RENT_MONTHS.length - 1] ?? '2026-08')
  const [question, setQuestion] = useState('')
  const [brief, setBrief] = useState<{
    source: string
    spoken: string
    steps: NextStep[]
    notice?: string
  } | null>(null)
  const [councilDistrict, setCouncilDistrict] = useState<number | null>(null)
  const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [briefError, setBriefError] = useState('')
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeStatus, setPlaceStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [placeNote, setPlaceNote] = useState('')
  const [hour, setHour] = useState(8)
  const [playing, setPlaying] = useState(true)
  const [pin, setPin] = useState<MapPin | null>(null)

  const selected = neighborhoodById(params.get('n'))
  const focus: Neighborhood | null = selected
  const boroughParam = params.get('b')
  // A chosen neighborhood always decides the borough, so a stale `b` cannot disagree with it.
  const borough: Borough | null = focus
    ? isBorough(focus.borough)
      ? focus.borough
      : null
    : isBorough(boroughParam)
      ? boroughParam
      : null
  const area = useMemo(() => (borough ? boroughSummary(borough) : null), [borough])
  const scope = focus ?? area ?? CITY.citywide
  const zoomed = borough != null
  useEffect(() => {
    if (!zoomed || !playing) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setHour((current) => (current + 1) % 24), 900)
    return () => window.clearInterval(timer)
  }, [zoomed, playing])

  useEffect(() => {
    if (!pin) {
      setCouncilDistrict(null)
      return
    }
    let cancel = false
    void councilDistrictAt(pin.lon, pin.lat).then((district) => {
      if (!cancel) setCouncilDistrict(district)
    })
    return () => {
      cancel = true
    }
  }, [pin])

  const choices = borough
    ? CITY.neighborhoods.filter((n) => n.borough === borough)
    : CITY.neighborhoods

  const readings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof readingFor>>()
    for (const neighborhood of CITY.neighborhoods) {
      map.set(neighborhood.id, readingFor(neighborhood, layer, airYear, rentMonth, CITY.neighborhoods))
    }
    return map
  }, [layer, airYear, rentMonth])

  const range = useMemo(
    () => layerRange(layer, airYear, rentMonth, CITY.neighborhoods),
    [layer, airYear, rentMonth],
  )

  const boroughs = useMemo(() => boroughRows(), [])

  function choose(id: string) {
    const next = new URLSearchParams(params)
    next.set('n', id)
    const home = BOROUGH_OF.get(id)
    if (home) next.set('b', home)
    setParams(next, { replace: true })
    setPin(null)
    setBrief(null)
    setBriefStatus('idle')
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
    setParams(next, { replace: true })
    setPin(
      match.lon != null && match.lat != null
        ? { id: match.id, lon: match.lon, lat: match.lat, label: match.matched }
        : null,
    )
    setBrief(null)
    setBriefStatus('idle')
    setPlaceStatus('idle')
    setPlaceNote(`${match.matched} is in ${NAME_OF.get(match.id)}, ${BOROUGH_OF.get(match.id)}.`)
  }

  function chooseBorough(name: Borough | null) {
    const next = new URLSearchParams(params)
    next.delete('n')
    if (name) next.set('b', name)
    else next.delete('b')
    setParams(next, { replace: true })
    setPin(null)
    setBrief(null)
    setBriefStatus('idle')
  }

  async function askDesk() {
    const asked = question.trim()
    if (!asked && !focus) return
    setBriefStatus('loading')
    setBriefError('')
    const priorId = focus?.id ?? null
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: asked || 'Brief this neighborhood.',
          priorId,
          lon: pin && pin.id === priorId ? pin.lon : undefined,
          lat: pin && pin.id === priorId ? pin.lat : undefined,
        }),
      })
      if (!response.ok) throw new Error('The desk did not answer.')
      const payload = (await response.json()) as {
        source?: string
        text?: string
        spoken?: string
        steps?: NextStep[]
        notice?: string
        neighborhoodId?: string | null
      }
      const spoken = payload.spoken || payload.text
      if (!spoken) throw new Error('The desk came back empty.')
      if (payload.neighborhoodId && payload.neighborhoodId !== priorId) {
        const next = new URLSearchParams(params)
        next.set('n', payload.neighborhoodId)
        setParams(next, { replace: true })
      }
      setBrief({
        source: payload.source === 'grok' ? 'Grok' : 'Computed from the open data',
        spoken,
        steps: Array.isArray(payload.steps) ? payload.steps : [],
        notice: payload.notice,
      })
      setBriefStatus('idle')
    } catch {
      const local = interpretDesk(
        asked || 'Brief this neighborhood.',
        priorId,
        window.location.origin,
        councilFor(pin, priorId, councilDistrict),
      )
      if (local.neighborhoodId && local.neighborhoodId !== priorId) {
        const next = new URLSearchParams(params)
        next.set('n', local.neighborhoodId)
        setParams(next, { replace: true })
      }
      setBrief({
        source: 'From the neighborhood record',
        spoken: local.spoken,
        steps: local.steps,
      })
      setBriefError('The desk could not be reached, so this reply uses the numbers already on the map.')
      setBriefStatus('error')
    }
  }

  const pmNow = airAt(scope.pm25, '2024')
  const pmThen = airAt(scope.pm25, '2009')
  const no2Now = airAt(scope.no2, '2024')
  const cityNo2 = airAt(CITY.citywide.no2, '2024')
  const day = hourAir(no2Now, pmNow, hour)
  const markCount = trafficMarkCount(day.relative, no2Now, cityNo2)
  const scopeIds = useMemo(
    () =>
      focus ? [focus.id] : borough ? CITY.neighborhoods.filter((n) => n.borough === borough).map((n) => n.id) : [],
    [focus, borough],
  )
  const paints = useMemo<HoodPaint[]>(() => {
    const haze = Math.min(0.16, Math.max(0, (day.relative - 0.5) * 0.16))
    return CITY.neighborhoods.map((neighborhood) => {
      const reading = readings.get(neighborhood.id)
      const outside = borough != null && neighborhood.borough !== borough
      const inView = !outside && zoomed
      return {
        id: neighborhood.id,
        color: hoodColor(reading),
        opacity: outside ? 0.14 : inView ? 0.46 + haze : 0.55,
        line: outside ? 0.22 : focus?.id === neighborhood.id ? 1 : 0.72,
        selected: focus?.id === neighborhood.id ? 1 : 0,
      }
    })
  }, [readings, borough, focus, day.relative, zoomed])
  const monitors = useMemo(
    () =>
      CITY.airMonitors.map((monitor) => ({
        id: monitor.id,
        lon: monitor.lon,
        lat: monitor.lat,
        title: monitor.name,
        borough: monitor.borough,
        pm25: monitor.pm25,
        no2: monitor.no2,
      })),
    [],
  )
  const traffic = zoomed ? { count: markCount, hour, playing, relative: day.relative } : null
  const maxEntries = Math.max(...WEEKDAY_CRZ_ENTRIES)
  const ask = last(scope.asking1br)
  const askStart = scope.asking1br[0]
  const zoriEnd = last(scope.zori)
  const zori2019 = scope.zori.find((p) => p.year === 2019)?.value
  const asthma = last(scope.asthmaChild)
  const deepRows = focus
    ? [focus]
    : borough
      ? CITY.neighborhoods.filter((n) => n.borough === borough)
      : CITY.neighborhoods
  const deep = deepRows.reduce((sum, n) => sum + n.housing.since2014eli, 0)
  const deepRate = deepPer1k(deepRows)
  const deepHouseholds = householdsIn(deepRows)
  const pmChange = percentChange(pmThen, pmNow)
  const rentChange = percentChange(zori2019 ?? null, zoriEnd?.value ?? null)
  const sparkValues =
    layer === 'air'
      ? scope.pm25.map((p) => p.value)
      : layer === 'rent'
        ? scope.asking1br.map((p) => p.median1br)
        : scope.zori.map((p) => p.value)

  const activeHint = LAYERS.find((item) => item.id === layer)?.hint
  const councilPin = councilFor(pin, focus?.id ?? null, councilDistrict)
  const localDesk = focus ? interpretDesk(focus.name, null, '', councilPin) : null
  const speech = brief?.spoken ?? localDesk?.spoken ?? ''
  const steps = brief?.steps.length ? brief.steps : (localDesk?.steps ?? [])
  const deskSource = brief?.source ?? (focus ? 'From the neighborhood record' : '')

  return (
    <div className="atlas">
      <div>
        <form
          className="place-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            void findPlace()
          }}
        >
          <label htmlFor="place-query" className="text-sm text-muted-foreground">
            Find your block — a street address or ZIP
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
        <div className="layer-rail" role="group" aria-label="Map layer">
          {LAYERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={layer === item.id}
              onClick={() => setLayer(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mb-3">{activeHint}</p>
        <div className="layer-rail borough-rail" role="group" aria-label="Borough">
          <button type="button" aria-pressed={borough == null} onClick={() => chooseBorough(null)}>
            All five
          </button>
          {BOROUGHS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={borough === name}
              onClick={() => chooseBorough(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="monitor-toggle"
          aria-pressed={showMonitors}
          onClick={() => setShowMonitors((value) => !value)}
        >
          {showMonitors ? 'Hide' : 'Show'} EPA air monitors, 2025–26
        </button>
        {layer === 'air' && (
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
        {layer === 'rent' && (
          <label className="scrubber block text-sm">
            <span className="text-muted-foreground">Listings {rentMonth}</span>
            <input
              type="range"
              min={0}
              max={RENT_MONTHS.length - 1}
              value={Math.max(0, RENT_MONTHS.indexOf(rentMonth))}
              onChange={(event) =>
                setRentMonth(RENT_MONTHS[Number(event.target.value)] ?? rentMonth)
              }
            />
          </label>
        )}
        <label className="mt-4 block text-sm">
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
        <div className="map-frame">
          <StreetMap
            paints={paints}
            focusId={focus?.id ?? null}
            scopeIds={scopeIds}
            monitors={monitors}
            showMonitors={showMonitors}
            activeMonitorId={activeMonitorId}
            onSelectHood={choose}
            onSelectMonitor={(id) => setActiveMonitorId((current) => (current === id ? null : id))}
            pin={pin}
            traffic={traffic}
          />
          {layer === 'pair' ? (
            <div
              className="legend-pair"
              role="img"
              aria-label="Color key: rent thirds from left to right, child asthma thirds from bottom to top."
            >
              <span className="axis-y text-xs text-muted-foreground">Child asthma →</span>
              <div className="grid" aria-hidden="true">
                {[2, 1, 0].flatMap((asthma) =>
                  [0, 1, 2].map((rent) => <i key={`${rent}${asthma}`} className={`bi-${rent}${asthma}`} />),
                )}
              </div>
              <span />
              <span className="text-xs text-muted-foreground">Rent →</span>
            </div>
          ) : (
            <div className="legend">
              <span className="text-xs text-muted-foreground">
                {layer === 'gap' ? 'More deep units' : (range?.low ?? 'Lower')}
              </span>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((tone) => (
                <i key={tone} className={`tone-${tone}`} aria-hidden="true" />
              ))}
              <span className="text-xs text-muted-foreground">
                {layer === 'gap' ? 'Rent high, deep units thin' : (range?.high ?? 'Higher')}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Streets, route names, and house numbers are OpenStreetMap, via OpenFreeMap. The color is still the neighborhood survey.
        </p>
        {zoomed && (
          <div className="day-clock">
            <div className="day-clock-head">
              <p className="text-sm">
                <strong>{formatClock(hour)}</strong>
                <span className="text-muted-foreground">
                  {' '}
                  · {formatCount(day.entries)} vehicles an hour enter the zone
                </span>
              </p>
              <button type="button" className="monitor-toggle" onClick={() => setPlaying((value) => !value)}>
                {playing ? 'Pause the day' : 'Play the day'}
              </button>
            </div>
            <div className="day-bars" aria-hidden="true">
              {WEEKDAY_CRZ_ENTRIES.map((entries, index) => (
                <button
                  key={index}
                  type="button"
                  className={index === hour ? 'is-now' : undefined}
                  style={{ height: `${Math.max(8, (entries / maxEntries) * 100)}%` }}
                  onClick={() => {
                    setHour(index)
                    setPlaying(false)
                  }}
                >
                  <span className="sr-only">{formatClock(index)}</span>
                </button>
              ))}
            </div>
            <label className="scrubber block text-sm">
              <span className="text-muted-foreground">Hour of a weekday</span>
              <input
                type="range"
                min={0}
                max={23}
                value={hour}
                onChange={(event) => {
                  setHour(Number(event.target.value))
                  setPlaying(false)
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Weekday average from MTA counts of vehicles entering the Congestion Relief Zone.
              {focus ? ` ${focus.name}` : ` ${borough}`} keeps its 2024 air as the level of the day:
              estimated NO2 {formatUg(day.no2)} ppb and PM2.5 {formatUg(day.pm25)} µg/m³ at this hour,
              against annual means of {formatUg(no2Now)} ppb and {formatUg(pmNow)} µg/m³. NO2 rises and
              falls with the entries. PM2.5 moves less. The marks follow streets in view; they are not a count
              of cars on that block. The survey does not record the hour, and this does not score the toll.
            </p>
          </div>
        )}
        {showMonitors && (
          <p className="text-xs text-muted-foreground mt-2">
            Dots are real EPA monitors, not modeled for every neighborhood — NYC has only 14 for
            PM2.5 and 4 for NO2. Click one for its 2025–2026 reading.
          </p>
        )}
        <table className="borough-table">
          <caption className="text-left text-xs text-muted-foreground mb-1">
            PM2.5 and rent are the median of neighborhoods, not of people. Deep units are extremely-low and very-low income homes in projects started since 2014, per 1,000 households in the whole borough.
          </caption>
          <thead>
            <tr>
              <th>Borough</th>
              <th>PM2.5</th>
              <th>1-bed, new lease</th>
              <th>Deep units per 1,000 households</th>
            </tr>
          </thead>
          <tbody>
            {boroughs.map((row) => (
              <tr key={row.borough} className={borough === row.borough ? 'is-current' : undefined}>
                <td>
                  <button
                    type="button"
                    className="borough-link"
                    aria-pressed={borough === row.borough}
                    onClick={() => chooseBorough(borough === row.borough ? null : row.borough)}
                  >
                    {row.borough}
                  </button>
                </td>
                <td>{formatUg(row.pm)}</td>
                <td>{formatRent(row.rent)}</td>
                <td title={`${formatCount(row.deep)} units`}>{formatRate(row.deepPer1k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        {!focus && area && (
          <p className="text-xs text-muted-foreground mb-2">
            {area.count} neighborhoods, read as their median.
          </p>
        )}
        <p className="mb-3">
          <Link to={focus ? `/home?n=${focus.id}` : '/home'} className="text-sm underline underline-offset-4">
            Open the {focus ? `${focus.name} forum` : 'neighborhood forums'}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          {focus
            ? readings.get(focus.id)?.label
            : `PM2.5 ${formatUg(pmNow)} µg/m³ in 2024. New one-bedroom leases ask ${formatRent(ask?.median1br ?? null)}.`}
        </p>

        <div className="figure-row">
          <strong>{formatUg(pmNow)}</strong>
          <div>
            <div>µg/m³ PM2.5, 2024</div>
            <div className={pmChange != null && pmChange < 0 ? 'delta-relief' : 'delta-pressure'}>
              {formatPercent(pmChange)} since 2009
              {no2Now != null ? ` · NO2 ${formatUg(no2Now)} ppb` : ''}
            </div>
          </div>
        </div>
        {zoomed && (
          <div className="figure-row">
            <strong>{formatUg(day.no2)}</strong>
            <div>
              <div>ppb NO2 at {formatClock(hour)}, estimated</div>
              <div className={day.relative > 1 ? 'delta-pressure' : 'delta-relief'}>
                PM2.5 {formatUg(day.pm25)} µg/m³ at the same hour · {formatCount(day.entries)} zone entries
              </div>
            </div>
          </div>
        )}
        <div className="figure-row">
          <strong>{formatRent(ask?.median1br ?? null)}</strong>
          <div>
            <div>median asking rent for a new 1-bedroom lease, {ask?.month ?? 'latest'}</div>
            <div className={rentChange != null && rentChange > 0 ? 'delta-pressure' : 'delta-relief'}>
              {zoriEnd
                ? `Zillow index ${formatRent(zoriEnd.value)} in ${zoriEnd.year} (${formatPercent(rentChange)} since 2019)`
                : `Listings ${formatPercent(percentChange(askStart?.median1br ?? null, ask?.median1br ?? null))} since ${askStart?.month ?? 'the start'}`}
            </div>
          </div>
        </div>
        <div className="figure-row">
          <strong>{formatRate(deepRate)}</strong>
          <div>
            <div>deeply affordable units per 1,000 households, started since 2014</div>
            <div className="text-muted-foreground">
              {formatCount(deep)} units across {formatCount(deepHouseholds)} households (ACS {HOUSEHOLDS_PERIOD})
            </div>
            <div className="text-muted-foreground">
              {asthma
                ? `Child asthma ED visits tied to PM2.5: ${formatCount(Math.round(asthma.value))} per 100,000 (${asthma.period})`
                : 'Asthma estimate unavailable'}
            </div>
          </div>
        </div>
        <Spark values={sparkValues} />
        {sparkValues.length > 1 && (
          <p className="text-xs text-muted-foreground mt-1">
            {layer === 'rent'
              ? 'Sparkline: asking rent for new one-bedroom leases, Feb 2025–Aug 2026.'
              : layer === 'air'
                ? 'Sparkline: annual PM2.5.'
                : 'Sparkline: Zillow Observed Rent Index, annual.'}
          </p>
        )}

        <section className="desk-agent mt-8" aria-labelledby="desk-title">
          <h3 id="desk-title" className="display text-2xl mb-1">
            The desk
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            The numbers that change the decision, then the step to take.
          </p>
          {focus && speech ? (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{deskSource}</p>
              <ul className="desk-read">
                {speech
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
              {steps.length > 0 && (
                <div className="next-steps">
                  <ol>
                    {steps.map((step) => (
                      <li key={step.kind}>
                        <a href={step.href} target="_blank" rel="noreferrer">
                          {step.title} ↗
                        </a>
                        <p className="text-sm text-muted-foreground">{step.note}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {brief?.notice && <p className="text-xs text-muted-foreground mt-2">{brief.notice}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a neighborhood on the map. The desk will read its record and name where to take it: the health
              report, a housing lottery or tenant help, and the council district for an address.
            </p>
          )}
        </section>

        <form
          className="brief-panel mt-6"
          onSubmit={(event) => {
            event.preventDefault()
            void askDesk()
          }}
        >
          <h3 className="display text-2xl mb-1">Ask the desk</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Name a neighborhood, or ask about the one selected on the map. A follow-up keeps that place.
          </p>
          <textarea
            value={question}
            disabled={briefStatus === 'loading'}
            placeholder={focus ? `What should I do in ${focus.name}?` : 'Try East Harlem, Astoria, or Lower Manhattan'}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
          />
          <button
            type="submit"
            className="mt-3 bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
            disabled={briefStatus === 'loading' || (!question.trim() && !focus)}
          >
            {briefStatus === 'loading' ? 'Writing…' : 'Ask the desk'}
          </button>
          {briefStatus === 'error' && (
            <p className="text-sm mt-3" role="alert">
              {briefError}{' '}
              <button type="button" className="underline" onClick={() => void askDesk()}>
                Try again
              </button>
            </p>
          )}
        </form>
      </aside>
    </div>
  )
}
