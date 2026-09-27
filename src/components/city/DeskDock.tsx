import { useEffect, useRef, useState } from 'react'
import { interpretDesk } from '@/lib/desk'
import type { NextStep } from '@/lib/next-steps'
import type { MapPin } from '@/components/city/StreetMap'

type Brief = {
  source: string
  spoken: string
  steps: NextStep[]
  notice?: string
}

export default function DeskDock({
  focusId,
  focusName,
  pin,
  district,
  onChoose,
}: {
  focusId: string | null
  focusName: string | null
  pin: MapPin | null
  district: number | null
  onChoose: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setBrief(null)
    setStatus('idle')
    setError('')
  }, [focusId])

  useEffect(() => {
    if (!open) return
    field.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const council =
    pin && district != null && pin.id === focusId ? { district, neighborhoodId: pin.id } : null
  const local = focusName ? interpretDesk(focusName, null, window.location.origin, council) : null
  const shown = brief ?? (local ? { source: 'From the neighborhood record', spoken: local.spoken, steps: local.steps } : null)

  async function ask(text: string) {
    const asked = text.trim()
    if (!asked && !focusId) return
    setStatus('loading')
    setError('')
    const priorId = focusId
    const message = asked || 'Brief this neighborhood.'
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: message,
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
      if (payload.neighborhoodId && payload.neighborhoodId !== priorId) onChoose(payload.neighborhoodId)
      setBrief({
        source: payload.source === 'grok' ? 'Grok' : 'Computed from the open data',
        spoken,
        steps: Array.isArray(payload.steps) ? payload.steps : [],
        notice: payload.notice,
      })
      setStatus('idle')
    } catch {
      const fallback = interpretDesk(message, priorId, window.location.origin, council)
      if (fallback.neighborhoodId && fallback.neighborhoodId !== priorId) onChoose(fallback.neighborhoodId)
      setBrief({
        source: 'From the neighborhood record',
        spoken: fallback.spoken,
        steps: fallback.steps,
      })
      setError('The desk could not be reached, so this reply uses the numbers already on the map.')
      setStatus('error')
    }
  }

  return (
    <div className="desk-dock">
      {open && (
        <section id="desk-chat" className="desk-panel" role="dialog" aria-labelledby="desk-title">
          <header className="desk-panel-head">
            <div>
              <h3 id="desk-title" className="display text-2xl leading-none">
                The desk
              </h3>
              <p className="text-xs text-muted-foreground mt-1">The numbers that change the decision, then the step to take.</p>
            </div>
            <button type="button" className="desk-close" aria-label="Close the desk" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <div className="desk-panel-body">
            {shown ? (
              <>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{shown.source}</p>
                <ul className="desk-read">
                  {shown.spoken
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                </ul>
                {shown.steps.length > 0 && (
                  <div className="next-steps">
                    <ol>
                      {shown.steps.map((step) => (
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
                Name a neighborhood, or ask about the one selected on the map. A follow-up keeps that place.
              </p>
            )}
          </div>
          <form
            className="brief-panel"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(question)
            }}
          >
            <label className="sr-only" htmlFor="desk-question">
              Ask the desk
            </label>
            <textarea
              id="desk-question"
              ref={field}
              value={question}
              disabled={status === 'loading'}
              placeholder={focusName ? `What should I do in ${focusName}?` : 'Try East Harlem, Astoria, or Lower Manhattan'}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
            />
            <button
              type="submit"
              className="mt-3 bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
              disabled={status === 'loading' || (!question.trim() && !focusId)}
            >
              {status === 'loading' ? 'Writing…' : 'Ask'}
            </button>
            {status === 'error' && (
              <p className="text-sm mt-3" role="alert">
                {error}{' '}
                <button type="button" className="underline" onClick={() => void ask(question)}>
                  Try again
                </button>
              </p>
            )}
          </form>
        </section>
      )}
      <button
        type="button"
        className="desk-launcher"
        aria-expanded={open}
        aria-controls={open ? 'desk-chat' : undefined}
        aria-label={open ? 'Close the desk' : 'Ask the desk'}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6.5h14v9H9l-4 3.2V6.5z" />
          </svg>
        )}
      </button>
    </div>
  )
}
