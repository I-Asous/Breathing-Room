import type { Neighborhood } from '@/lib/metrics'
import { actionsToTake } from '@/lib/take-action'

export default function ActionPanel({
  focus,
  address,
  district,
  paid,
}: {
  focus: Neighborhood | null
  address: string | null
  district: number | null
  paid: number | null
}) {
  if (!focus) return null
  const steps = actionsToTake(focus, { address, district, paid })

  return (
    <section className="take-steps" aria-labelledby="act-title">
      <h3 id="act-title">What you can do</h3>
      <ol>
        {steps.map((step) => (
          <li key={step.id}>
            <p>{step.why}</p>
            <a href={step.href} target="_blank" rel="noreferrer">
              {step.title}
            </a>
            <p className="note">{step.note}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
