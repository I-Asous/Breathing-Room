import { cleaningSteps, rateExample } from '@/lib/cleaning'
import { formatCount, formatRate } from '@/lib/metrics'

const STEPS = cleaningSteps()
const EXAMPLE = rateExample()

export default function CleaningNotes() {
  return (
    <section className="cleaning" aria-labelledby="cleaning-title">
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">The messy part</p>
      <h2 id="cleaning-title" className="display text-4xl leading-none mb-3">
        How we cleaned this
      </h2>
      <p className="max-w-2xl text-muted-foreground mb-6">
        Every public record here is messy in its own way. This is what went in, what came out, and why. The
        build scripts count every number here as they run.
      </p>

      <ol className="cleaning-steps">
        {STEPS.map((step) => (
          <li key={step.record}>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{step.record}</p>
            <p className="cleaning-flow">
              <span>{step.from}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> became </span>
              <strong>{step.to}</strong>
            </p>
            <p className="text-sm text-muted-foreground">{step.what}</p>
          </li>
        ))}
      </ol>

      {EXAMPLE && (
        <div className="cleaning-example">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Why the rate, not the count</p>
          <div className="cleaning-compare">
            {[EXAMPLE.more, EXAMPLE.fewer].map((row) => (
              <div key={row.name}>
                <p className="display text-2xl leading-tight">{row.name}</p>
                <p className="text-sm">
                  {formatCount(row.units)} units, #{row.unitRank} of 42 by count
                </p>
                <p className="text-sm">
                  <strong>{formatRate(row.rate)} per 1,000 households</strong>, #{row.rateRank} by rate
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {EXAMPLE.more.name} has {(EXAMPLE.more.units / EXAMPLE.fewer.units).toFixed(1)} times the units, but{' '}
            {EXAMPLE.fewer.name} has more for its size. Big neighborhoods pile up big counts, so the Gap layer and the
            side panel use the rate.
          </p>
        </div>
      )}
    </section>
  )
}
