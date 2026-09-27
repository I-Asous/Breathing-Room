import { useState } from 'react'
import {
  CAUSE_LOOKUPS,
  STACK_ABSENT,
  STACK_LINKS,
  airAdvice,
  formatDeep,
  higherAskHigherAir,
  rentGuidelineGap,
  signingHint,
  tenantLevers,
  type Lever,
  type StackPlace,
} from '@/lib/actions'
import { formatCount, formatRent, formatUg, type Neighborhood } from '@/lib/metrics'
import { ASK_WINDOW, monthLabel, type PressurePlace } from '@/lib/overlay'

function LeverLink({ lever }: { lever: Lever }) {
  return (
    <li>
      <a href={lever.href} target="_blank" rel="noreferrer">
        {lever.title} ↗
      </a>
      <p className="text-sm text-muted-foreground">{lever.note}</p>
    </li>
  )
}

function NameRow({
  names,
  currentId,
  onPick,
}: {
  names: { id: string; name: string }[]
  currentId: string | null
  onPick: (id: string) => void
}) {
  return (
    <div className="name-row">
      {names.map((place) => (
        <button
          key={place.id}
          type="button"
          aria-pressed={place.id === currentId}
          onClick={() => onPick(place.id)}
        >
          {place.name}
        </button>
      ))}
    </div>
  )
}

function stackLine(place: StackPlace): string {
  const asthma = place.asthmaAbove
    ? `Child asthma ${formatCount(Math.round(place.asthma))} per 100,000 (${place.asthmaPeriod}).`
    : 'Child asthma is not above the city.'
  return `${place.name} asks ${formatRent(place.ask)}. 2024 PM2.5 is ${formatUg(place.pm25)} µg/m³. ${asthma} ${formatDeep(place.deepPer1k)} deeply affordable, financed since 2014.`
}

export default function ActionPanel({
  focus,
  address,
  pressure,
  onChoose,
  onPressure,
}: {
  focus: Neighborhood | null
  address: string | null
  pressure: PressurePlace[]
  onChoose: (id: string) => void
  onPressure: (id: string) => void
}) {
  const stacked = higherAskHigherAir()
  const advice = focus ? airAdvice(focus) : null
  const gap = focus ? rentGuidelineGap(focus) : null
  const season = signingHint(focus)
  const levers = focus ? tenantLevers(address) : []
  const rentHistory = levers[0] ?? null
  const moreLevers = levers.slice(1)
  const focusedStack = focus ? (stacked.find((place) => place.id === focus.id) ?? null) : null
  const focusedPressure = focus ? (pressure.find((place) => place.id === focus.id) ?? null) : null
  const [openSet, setOpenSet] = useState<'higher' | 'rising'>('higher')

  return (
    <section className="atlas-read" aria-labelledby="stack-title">
      <h3 id="stack-title" className="display text-2xl mb-1">
        Where it stacks
      </h3>
      <p className="text-sm text-muted-foreground mb-1">{STACK_ABSENT}</p>

      <div className="layer-rail" role="group" aria-label="Overlap">
        <button type="button" aria-pressed={openSet === 'higher'} onClick={() => setOpenSet('higher')}>
          Higher ask, higher PM2.5
        </button>
        <button type="button" aria-pressed={openSet === 'rising'} onClick={() => setOpenSet('rising')}>
          Asks rose faster
        </button>
      </div>

      {openSet === 'higher' ? (
        <>
          <p className="text-sm text-muted-foreground">
            Latest new one-bedroom ask above the city, and 2024 PM2.5 above the city mean. At least 20 listings.
          </p>
          <NameRow names={stacked} currentId={focus?.id ?? null} onPick={onChoose} />
          <p className="text-sm">
            {focusedStack
              ? stackLine(focusedStack)
              : `${stacked.length} neighborhoods. Choose one to read the ask beside the 2024 mean.`}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            New asks from {monthLabel(ASK_WINDOW.start)} to {monthLabel(ASK_WINDOW.end)} rose at least one
            percentage point faster than the city, and 2024 PM2.5 or NO2 is still above the city mean.
          </p>
          <NameRow names={pressure} currentId={focus?.id ?? null} onPick={onPressure} />
          {focusedPressure ? (
            <div className="next-steps">
              <p className="text-sm mb-2">{focusedPressure.insight.note}</p>
              <a href={focusedPressure.insight.href} target="_blank" rel="noreferrer">
                {focusedPressure.insight.title} ↗
              </a>
            </div>
          ) : (
            <p className="text-sm">
              {pressure.length} neighborhoods. Choose one to read how far the ask moved.
            </p>
          )}
        </>
      )}

      <ul className="next-steps">
        {STACK_LINKS.map((lever) => (
          <LeverLink key={lever.href} lever={lever} />
        ))}
      </ul>

      {focus && advice && (
        <div className="act-here mt-8">
          <h3 id="act-title" className="display text-2xl mb-1">
            What you can do in {focus.name}
          </h3>
          <p className="text-sm mt-2">{advice.summary}</p>
          <p className="text-sm text-muted-foreground mt-2">{advice.sensitive}</p>
          <ul className="next-steps">
            <LeverLink lever={advice.report} />
            {rentHistory && <LeverLink lever={rentHistory} />}
          </ul>

          <h4 className="mt-4 text-sm uppercase tracking-widest text-muted-foreground">The new lease</h4>
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

          <details className="fold">
            <summary>Look up a cause near this neighborhood</summary>
            <ul className="next-steps">
              {CAUSE_LOOKUPS.map((lever) => (
                <LeverLink key={lever.href} lever={lever} />
              ))}
            </ul>
          </details>
          <details className="fold">
            <summary>The building, the landlord, and who to call</summary>
            <p className="text-sm text-muted-foreground mt-2">
              Stabilization is decided from the state rent history. This page does not flag buildings as likely
              stabilized.
            </p>
            <ul className="next-steps">
              {moreLevers.map((lever) => (
                <LeverLink key={lever.href} lever={lever} />
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  )
}
