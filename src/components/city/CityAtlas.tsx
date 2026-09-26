import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { neighborhoodPaths, MAP_HEIGHT, MAP_WIDTH } from '@/lib/geo'
import {
  AIR_YEARS,
  CITY,
  RENT_MONTHS,
  airAt,
  askingAt,
  formatCount,
  formatPercent,
  formatRent,
  formatUg,
  last,
  neighborhoodById,
  percentChange,
  readingFor,
  type Layer,
  type Neighborhood,
} from '@/lib/metrics'
import { interpretDesk } from '@/lib/desk'
import './atlas.css'

const PATHS = neighborhoodPaths()
const LAYERS: { id: Layer; label: string; hint: string }[] = [
  { id: 'stack', label: 'Stack', hint: 'PM2.5, one-bedroom asking rent, and child asthma, averaged.' },
  { id: 'air', label: 'Air', hint: 'Annual mean PM2.5 from the community air survey.' },
  { id: 'rent', label: 'Rent', hint: 'Median asking rent on one-bedroom listings.' },
  { id: 'gap', label: 'Gap', hint: 'High asking rent beside thin deeply affordable production since 2014.' },
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

function boroughRows() {
  const names = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
  return names.map((borough) => {
    const rows = CITY.neighborhoods.filter((n) => n.borough === borough)
    const pm = rows
      .map((n) => airAt(n.pm25, '2024'))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    const rents = rows
      .map((n) => last(n.asking1br)?.median1br)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    const mid = (list: number[]) => (list.length ? list[Math.floor(list.length / 2)] : null)
    const deep = rows.reduce((sum, n) => sum + n.housing.since2014eli, 0)
    return { borough, pm: mid(pm), rent: mid(rents), deep, count: rows.length }
  })
}

export default function CityAtlas() {
  const [params, setParams] = useSearchParams()
  const [layer, setLayer] = useState<Layer>('stack')
  const [airYear, setAirYear] = useState('2024')
  const [rentMonth, setRentMonth] = useState(RENT_MONTHS[RENT_MONTHS.length - 1] ?? '2026-08')
  const [question, setQuestion] = useState('')
  const [brief, setBrief] = useState<{ source: string; text: string } | null>(null)
  const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [briefError, setBriefError] = useState('')

  const selected = neighborhoodById(params.get('n'))
  const focus: Neighborhood | null = selected

  const readings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof readingFor>>()
    for (const neighborhood of CITY.neighborhoods) {
      map.set(neighborhood.id, readingFor(neighborhood, layer, airYear, rentMonth, CITY.neighborhoods))
    }
    return map
  }, [layer, airYear, rentMonth])

  const boroughs = useMemo(() => boroughRows(), [])

  function choose(id: string) {
    const next = new URLSearchParams(params)
    next.set('n', id)
    setParams(next, { replace: true })
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
        body: JSON.stringify({ text: asked || 'Brief this neighborhood.', priorId }),
      })
      if (!response.ok) throw new Error('The desk did not answer.')
      const payload = (await response.json()) as {
        source?: string
        text?: string
        notice?: string
        neighborhoodId?: string | null
      }
      if (!payload.text) throw new Error('The desk came back empty.')
      if (payload.neighborhoodId && payload.neighborhoodId !== priorId) {
        const next = new URLSearchParams(params)
        next.set('n', payload.neighborhoodId)
        setParams(next, { replace: true })
      }
      setBrief({
        source: payload.source === 'grok' ? 'Grok' : 'Computed from the open data',
        text: payload.notice ? `${payload.text} ${payload.notice}` : payload.text,
      })
      setBriefStatus('idle')
    } catch {
      const local = interpretDesk(asked || 'Brief this neighborhood.', priorId, window.location.origin)
      if (local.neighborhoodId && local.neighborhoodId !== priorId) {
        const next = new URLSearchParams(params)
        next.set('n', local.neighborhoodId)
        setParams(next, { replace: true })
      }
      setBrief({ source: 'Computed from the open data', text: local.text })
      setBriefError('The desk could not be reached, so this reply uses the numbers already on the map.')
      setBriefStatus('error')
    }
  }

  const pmNow = focus ? airAt(focus.pm25, '2024') : airAt(CITY.citywide.pm25, '2024')
  const pmThen = focus ? airAt(focus.pm25, '2009') : airAt(CITY.citywide.pm25, '2009')
  const no2Now = focus ? airAt(focus.no2, '2024') : airAt(CITY.citywide.no2, '2024')
  const ask = focus ? last(focus.asking1br) : last(CITY.citywide.asking1br)
  const askStart = focus ? focus.asking1br[0] : CITY.citywide.asking1br[0]
  const zoriEnd = focus ? last(focus.zori) : last(CITY.citywide.zori)
  const zori2019 = focus
    ? focus.zori.find((p) => p.year === 2019)?.value
    : CITY.citywide.zori.find((p) => p.year === 2019)?.value
  const asthma = focus ? last(focus.asthmaChild) : last(CITY.citywide.asthmaChild)
  const deep = focus
    ? focus.housing.since2014eli
    : CITY.neighborhoods.reduce((sum, n) => sum + n.housing.since2014eli, 0)
  const pmChange = percentChange(pmThen, pmNow)
  const rentChange = percentChange(zori2019 ?? null, zoriEnd?.value ?? null)
  const sparkValues =
    layer === 'air'
      ? (focus ? focus.pm25 : CITY.citywide.pm25).map((p) => p.value)
      : layer === 'rent'
        ? (focus ? focus.asking1br : CITY.citywide.asking1br).map((p) => p.median1br)
        : (focus ? focus.zori : CITY.citywide.zori).map((p) => p.value)

  const activeHint = LAYERS.find((item) => item.id === layer)?.hint

  return (
    <div className="atlas">
      <div>
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
        <div className="map-frame">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label="New York neighborhoods">
            {PATHS.map((path) => {
              const reading = readings.get(path.id)
              const tone = reading?.tone
              return (
                <path
                  key={path.id}
                  d={path.d}
                  className={`hood${tone == null ? ' is-missing' : ` tone-${tone}`}${
                    focus?.id === path.id ? ' is-selected' : ''
                  }`}
                  onClick={() => choose(path.id)}
                >
                  <title>
                    {CITY.neighborhoods.find((n) => n.id === path.id)?.name}
                    {reading ? ` — ${reading.label}` : ''}
                  </title>
                </path>
              )
            })}
          </svg>
          <div className="legend" aria-hidden="true">
            <span className="text-xs text-muted-foreground">Lighter</span>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((tone) => (
              <i key={tone} className={`tone-${tone}`} />
            ))}
            <span className="text-xs text-muted-foreground">Heavier</span>
          </div>
        </div>
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
              Choose a neighborhood
            </option>
            {CITY.neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.borough} — {n.name}
              </option>
            ))}
          </select>
        </label>
        <table className="borough-table">
          <caption className="text-left text-xs text-muted-foreground mb-1">
            Median of neighborhoods, not of people. Deep units are extremely-low and very-low income homes in projects started since 2014.
          </caption>
          <thead>
            <tr>
              <th>Borough</th>
              <th>PM2.5</th>
              <th>1-bed</th>
              <th>Deep units</th>
            </tr>
          </thead>
          <tbody>
            {boroughs.map((row) => (
              <tr key={row.borough}>
                <td>{row.borough}</td>
                <td>{formatUg(row.pm)}</td>
                <td>{formatRent(row.rent)}</td>
                <td>{formatCount(row.deep)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="dossier">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {focus ? focus.borough : 'Citywide'}
        </p>
        <h2 className="display text-4xl leading-none mt-1 mb-2">
          {focus ? focus.name : 'All 42 neighborhoods'}
        </h2>
        <p className="mb-3">
          <Link to={focus ? `/home?n=${focus.id}` : '/home'} className="text-sm underline underline-offset-4">
            Pin a note on the field desk
          </Link>
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          {focus
            ? readings.get(focus.id)?.label
            : `PM2.5 ${formatUg(pmNow)} µg/m³ in 2024. One-bedrooms ${formatRent(ask?.median1br ?? null)}.`}
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
        <div className="figure-row">
          <strong>{formatRent(ask?.median1br ?? null)}</strong>
          <div>
            <div>median 1-bedroom, {ask?.month ?? 'latest'}</div>
            <div className={rentChange != null && rentChange > 0 ? 'delta-pressure' : 'delta-relief'}>
              {zoriEnd
                ? `Zillow index ${formatRent(zoriEnd.value)} in ${zoriEnd.year} (${formatPercent(rentChange)} since 2019)`
                : `Listings ${formatPercent(percentChange(askStart?.median1br ?? null, ask?.median1br ?? null))} since ${askStart?.month ?? 'the start'}`}
            </div>
          </div>
        </div>
        <div className="figure-row">
          <strong>{formatCount(deep)}</strong>
          <div>
            <div>deeply affordable units since 2014</div>
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
              ? 'Sparkline: one-bedroom asking rent, Feb 2025–Aug 2026.'
              : layer === 'air'
                ? 'Sparkline: annual PM2.5.'
                : 'Sparkline: Zillow Observed Rent Index, annual.'}
          </p>
        )}

        <form
          className="brief-panel mt-8"
          onSubmit={(event) => {
            event.preventDefault()
            void askDesk()
          }}
        >
          <h3 className="display text-2xl mb-1">Ask the desk</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Rent, 2024 air, and how the congestion toll applies. Name a neighborhood, or ask about the one
            selected on the map. The same desk answers on iMessage.
          </p>
          <textarea
            value={question}
            disabled={briefStatus === 'loading'}
            placeholder={focus ? `Should I rent in ${focus.name}?` : 'Try East Harlem, Astoria, or Lower Manhattan'}
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
          {brief && (
            <div className="brief-answer">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 not-italic font-sans">
                {brief.source}
              </p>
              <p>{brief.text}</p>
            </div>
          )}
          {!brief && briefStatus === 'idle' && focus && (
            <p className="text-sm text-muted-foreground mt-3">
              The reply stays empty until you ask. It uses the open-data extract and the MTA toll schedule, and it does not score the toll.
            </p>
          )}
        </form>
      </aside>
    </div>
  )
}
