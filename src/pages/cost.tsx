import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import SiteHeader from '@/components/SiteHeader'
import { councilDistrictAt } from '@/lib/council'
import { findNeighborhood } from '@/lib/place-search'
import { formatPercent, formatRent, formatUg, neighborhoodById } from '@/lib/metrics'
import {
  EPA_ANNUAL_PM25,
  OFFICIAL_LINKS,
  WHO_ANNUAL_PM25,
  ZORI_FROM,
  ZORI_TO,
  coOccurPlaces,
  costRecord,
  dossierText,
  testimonyText,
  type CostRecord,
} from '@/lib/true-cost'

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function TrueCostPage() {
  const zones = coOccurPlaces()
  const [query, setQuery] = useState('')
  const [rent, setRent] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [note, setNote] = useState('')
  const [address, setAddress] = useState<string | null>(null)
  const [district, setDistrict] = useState<number | null>(null)
  const [record, setRecord] = useState<CostRecord | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const paid = Number(rent.replace(/[$,]/g, ''))
    if (!Number.isInteger(paid) || paid < 1 || paid > 100_000) {
      setStatus('error')
      setNote('Enter the monthly rent in whole dollars.')
      return
    }
    setStatus('loading')
    setNote('')
    const match = await findNeighborhood(query)
    if ('error' in match) {
      setStatus('error')
      setNote(match.error)
      setRecord(null)
      return
    }
    const place = neighborhoodById(match.id)
    if (!place) {
      setStatus('error')
      setNote('That address is outside the 42 neighborhoods in this atlas.')
      return
    }
    setAddress(match.matched)
    setRecord(costRecord(place, paid))
    setDistrict(match.lon != null && match.lat != null ? await councilDistrictAt(match.lon, match.lat) : null)
    setStatus('idle')
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Renters, advocates, council staff</p>
        <h1 className="display mt-2 text-4xl leading-none md:text-5xl">What the monthly rent leaves out</h1>
        <p className="mt-4 text-muted-foreground">
          Enter an address and a monthly rent. The page sets that rent next to the neighborhood’s air, child-asthma
          rate, and three-year rent index. It does not estimate a health bill in dollars.
        </p>

        <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" onSubmit={(event) => void onSubmit(event)}>
          <label className="text-sm">
            <span className="text-muted-foreground">Address or ZIP</span>
            <input
              className="mt-1 w-full border border-border bg-card px-3 py-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="2 E 116th St, or 10029"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Monthly rent</span>
            <input
              className="mt-1 w-full border border-border bg-card px-3 py-2"
              inputMode="numeric"
              value={rent}
              onChange={(event) => setRent(event.target.value)}
              placeholder="2800"
            />
          </label>
          <button type="submit" className="bg-foreground px-3 py-2 text-sm text-background" disabled={status === 'loading'}>
            {status === 'loading' ? 'Looking up…' : 'Read the record'}
          </button>
        </form>
        {note && <p className="mt-3 text-sm text-muted-foreground">{note}</p>}

        {record && (
          <section className="mt-8 border border-border bg-card p-4" aria-label="True cost breakdown">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{record.borough}</p>
            <h2 className="mt-1 text-3xl leading-none">{record.name}</h2>
            <p className="mt-3 text-sm">
              You entered {formatRent(record.paid)} a month
              {address ? ` for ${address}` : ''}. The latest new one-bedroom ask here is {formatRent(record.ask)}. The
              city ask is {formatRent(record.cityAsk)}. The ask is a new lease, not the rent a sitting tenant pays.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                2024 PM2.5 is {formatUg(record.pm)} µg/m³, an annual mean. The city is {formatUg(record.cityPm)}. The
                WHO annual guideline is {WHO_ANNUAL_PM25}, and the EPA annual standard is {EPA_ANNUAL_PM25.toFixed(1)}.
                This page does not count days above either line, and the mean is not today’s air.
              </li>
              <li>
                Child asthma visits were {record.asthma == null ? '—' : Math.round(record.asthma)} per 100,000 in{' '}
                {record.asthmaPeriod}. The city rate is {record.cityAsthma == null ? '—' : Math.round(record.cityAsthma)}.
              </li>
              <li>
                {record.zoriChange == null
                  ? `The Zillow Observed Rent Index is missing a ${ZORI_FROM} or ${ZORI_TO} value here, so this page does not state a three-year change.`
                  : `The Zillow Observed Rent Index moved ${formatPercent(record.zoriChange)} from ${ZORI_FROM} to ${ZORI_TO}. The city index moved ${formatPercent(record.cityZoriChange)}. That index is not the listing ask.`}
              </li>
              <li>
                {record.burden == null
                  ? 'No rent-burden estimate.'
                  : `${Math.round(record.burden)}% of renter households pay 30% or more of income. The city share is ${record.cityBurden == null ? '—' : `${Math.round(record.cityBurden)}%`}. The Census margin of error is not on this page.`}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <button type="button" className="underline underline-offset-4" onClick={() => download(`${record.name}-dossier.txt`, dossierText(record, address))}>
                Download the dossier
              </button>
              <button type="button" className="underline underline-offset-4" onClick={() => download(`${record.name}-testimony.txt`, testimonyText(record, address))}>
                Download testimony
              </button>
              <Link to={`/?n=${record.id}&b=${record.borough}#place`} className="underline underline-offset-4">
                Open {record.name} on the map
              </Link>
              {district != null && (
                <a className="underline underline-offset-4" href={`https://council.nyc.gov/district-${district}/`}>
                  Council District {district}
                </a>
              )}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-2xl leading-none">Where the rent index and the air mean both run high</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These neighborhoods are in the top third on both the {ZORI_FROM}–{ZORI_TO} Zillow rent-index rise and the
            2024 PM2.5 annual mean. Neighborhoods missing either year of the index are left out. This is not a
            toxic-burden score.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {zones.map((zone) => (
              <li key={zone.id}>
                <Link to={`/?n=${zone.id}&b=${zone.borough}#place`} className="underline underline-offset-4">
                  {zone.name}
                </Link>
                <span className="text-muted-foreground">
                  {' '}
                  · {zone.borough} · index {formatPercent(zone.zoriChange)} · PM2.5 {formatUg(zone.pm)} µg/m³
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl leading-none">Lookups this atlas does not calculate</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {OFFICIAL_LINKS.map((link) => (
              <li key={link.href}>
                <a className="underline underline-offset-4" href={link.href}>
                  {link.title}
                </a>
                <span className="text-muted-foreground"> — {link.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
