import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthProfileReady, useMutations, usePresenceRoom, useQuery } from 'deepspace'
import { SCOPE_ID } from '../../constants'
import { CITY, neighborhoodById } from '@/lib/metrics'
import '@/components/city/atlas.css'

type FieldNote = {
  uhfId: string
  placeName: string
  borough: string
  body: string
  authorName: string
}

export default function HomePage() {
  const [params] = useSearchParams()
  const preset = neighborhoodById(params.get('n'))
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const { records, status, error } = useQuery<FieldNote>('field-notes', { orderBy: 'createdAt', orderDir: 'desc' })
  const { createConfirmed, removeConfirmed, ready } = useMutations<FieldNote>('field-notes')
  const { peers, connected, updateState } = usePresenceRoom(SCOPE_ID)
  const [uhfId, setUhfId] = useState(preset?.id ?? CITY.neighborhoods[0].id)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const sent = useRef('')

  const place = neighborhoodById(uhfId)

  useEffect(() => {
    if (preset) setUhfId(preset.id)
  }, [preset])

  useEffect(() => {
    const label = place?.name ?? 'the desk'
    if (sent.current === label) return
    sent.current = label
    updateState({ desk: label })
  }, [place?.name, updateState])

  const notes = useMemo(() => records, [records])

  async function publish() {
    if (!place || !body.trim() || !isSignedIn) return
    setSaving(true)
    setSaveError('')
    try {
      await createConfirmed({
        uhfId: place.id,
        placeName: place.name,
        borough: place.borough,
        body: body.trim(),
        authorName: user?.name || 'Teammate',
      })
      setBody('')
    } catch {
      setSaveError('The desk did not keep that note. Try again once the room is connected.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:py-12">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Shared margin</p>
      <h1 className="text-4xl md:text-6xl leading-none mt-2">Notes on the map</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        The atlas is the record. This desk is where a team writes what they want to do about a
        neighborhood. Notes sync live for everyone in the room.
      </p>
      <p className="mt-3 text-sm">
        <Link to={place ? `/?n=${place.id}` : '/'} className="underline underline-offset-4">
          Back to {place?.name ?? 'the atlas'}
        </Link>
        <span className="text-muted-foreground">
          {' '}
          · {connected ? `${peers.length + 1} on the desk` : 'connecting'}
          {peers.length > 0 && (
            <>
              {' '}
              ·{' '}
              {peers
                .map((peer) => {
                  const desk = typeof peer.state.desk === 'string' ? peer.state.desk : ''
                  const name = peer.userName || 'Guest'
                  return desk ? `${name} on ${desk}` : name
                })
                .join(', ')}
            </>
          )}
        </span>
      </p>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="text-2xl mb-4">On the desk</h2>
          {status === 'loading' && <p className="text-muted-foreground">Opening the desk…</p>}
          {status === 'error' && (
            <p role="alert">The notes did not load. {error ?? 'Refresh the page to reconnect.'}</p>
          )}
          {status === 'ready' && notes.length === 0 && (
            <p className="text-muted-foreground">
              No notes yet. The first one becomes part of the shared desk.
            </p>
          )}
          <ul className="space-y-5">
            {notes.map((note) => (
              <li key={note.recordId} className="border-t border-border pt-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  <Link to={`/?n=${note.data.uhfId}`} className="underline underline-offset-4">
                    {note.data.placeName}
                  </Link>
                  {' · '}
                  {note.data.borough}
                </p>
                <p className="display text-xl mt-1">{note.data.body}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {note.data.authorName}
                  {isSignedIn && user && note.createdBy === user.id && (
                    <button
                      type="button"
                      className="ml-3 underline"
                      disabled={!ready}
                      onClick={() => void removeConfirmed(note.recordId)}
                    >
                      Remove
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="note-box">
          <h2 className="text-2xl mb-4">Add a note</h2>
          {!isSignedIn && (
            <p className="text-sm text-muted-foreground mb-3">
              Sign in to leave a note. Notes already on the desk stay visible.
            </p>
          )}
          <label className="block text-sm text-muted-foreground">
            Neighborhood
            <select className="mt-1" value={uhfId} onChange={(event) => setUhfId(event.target.value)}>
              {CITY.neighborhoods.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.borough} — {n.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-muted-foreground mt-3">
            What should change here
            <textarea
              className="mt-1 min-h-32"
              value={body}
              maxLength={600}
              disabled={!isSignedIn}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="mt-3 bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
            disabled={!ready || !isSignedIn || saving || body.trim().length < 2}
            onClick={() => void publish()}
          >
            {saving ? 'Saving…' : 'Pin to the desk'}
          </button>
          {saveError && (
            <p className="text-sm mt-3" role="alert">
              {saveError}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
