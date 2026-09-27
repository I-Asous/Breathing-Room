import { useEffect, useMemo, useState } from 'react'
import { AuthOverlay, getAuthToken, useAuthProfileReady, useMutations, useQuery, useUser, type RecordData } from 'deepspace'
import { BED_OPTIONS, parseListingDraft, parseQuestion } from '@/lib/listing-draft'
import { BOROUGHS, CITY, formatRent } from '@/lib/metrics'
import { TX_HASH, explorerTxUrl } from '@/lib/xrpl-payment'

type Listing = {
  neighborhoodId: string
  neighborhoodName: string
  borough: string
  askingRent: number
  beds: string
  note: string
  authorName: string
  paymentTxHash?: string
  paymentNetwork?: string
  payerAccount?: string
}

type ListingFeeView = {
  configured: boolean
  network: string
  destination: string | null
  currency: string
  amount: string
  issuer: string | null
  faucetUrl: string | null
}

type Like = { listingId: string; userId: string }
type Question = { listingId: string; body: string; authorName: string }

export default function ListingsBoard() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const { user } = useUser()
  const { records, status } = useQuery<Listing>('listings', { orderBy: 'createdAt', orderDir: 'desc', limit: 100 })
  const likes = useQuery<Like>('listing-likes', { limit: 500 })
  const questions = useQuery<Question>('listing-questions', { orderBy: 'createdAt', orderDir: 'asc', limit: 500 })
  const listingWrites = useMutations<Listing>('listings')
  const likeWrites = useMutations<Like>('listing-likes')
  const questionWrites = useMutations<Question>('listing-questions')
  const [showAuth, setShowAuth] = useState(false)
  const [filter, setFilter] = useState('')
  const [fee, setFee] = useState<ListingFeeView | null>(null)
  const [feeStatus, setFeeStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/xrpl/listing-fee')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (cancelled) return
        const feeBody = body as ListingFeeView | null
        if (feeBody && typeof feeBody.network === 'string') {
          setFee(feeBody)
          setFeeStatus('ready')
        } else setFeeStatus('error')
      })
      .catch(() => {
        if (!cancelled) setFeeStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const knownIds = useMemo(() => new Set(CITY.neighborhoods.map((place) => place.id)), [])
  const authorName = user?.name?.trim() || user?.email?.split('@')[0] || 'Neighbor'
  const visible = records.filter((row) => !filter || row.data.neighborhoodId === filter)

  function requireSignIn() {
    if (isSignedIn && user) return true
    setShowAuth(true)
    return false
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Neighbor listings</p>
      <h1 className="mt-1 text-4xl leading-none">Host a listing. Ask about one.</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Anyone can read. Hosting a listing takes an XRPL payment, checked on the ledger before the post is saved.
        A signed-in person can like a listing and leave a question. These posts are what neighbors typed. They are
        not the city listing extract on the atlas, and a like is not a check that the rent is real.
      </p>

      <ListingForm
        knownIds={knownIds}
        fee={fee}
        feeStatus={feeStatus}
        canWrite={Boolean(isSignedIn && user)}
        onNeedSignIn={() => setShowAuth(true)}
        onSubmit={async (draft) => {
          const token = await getAuthToken()
          if (!token) {
            setShowAuth(true)
            throw new Error('Sign in to host a listing.')
          }
          const res = await fetch('/api/listings/host', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              neighborhoodId: draft.neighborhoodId,
              askingRent: draft.askingRent,
              beds: draft.beds,
              note: draft.note,
              authorName,
              paymentTxHash: draft.paymentTxHash,
            }),
          })
          const payload = (await res.json().catch(() => null)) as { error?: string } | null
          if (!res.ok) throw new Error(payload?.error || 'The listing could not be hosted.')
        }}
      />

      <label className="mt-8 block max-w-md text-sm">
        <span className="text-muted-foreground">Neighborhood</span>
        <select className="place-select mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All neighborhoods</option>
          {BOROUGHS.map((borough) => (
            <optgroup key={borough} label={borough}>
              {CITY.neighborhoods
                .filter((place) => place.borough === borough)
                .map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {status === 'loading' && <p className="mt-6 text-sm text-muted-foreground">Loading listings…</p>}
      {status === 'error' && (
        <p className="mt-6 text-sm text-muted-foreground">The listings could not be loaded.</p>
      )}
      {status === 'ready' && visible.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No listings yet{filter ? ' in this neighborhood' : ''}. Sign in to host the first one.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {visible.map((row) => (
          <ListingCard
            key={row.recordId}
            row={row}
            likes={likes.records.filter((like) => like.data.listingId === row.recordId)}
            questions={questions.records.filter((question) => question.data.listingId === row.recordId)}
            userId={user?.id ?? null}
            authorName={authorName}
            canLike={likeWrites.ready}
            canAsk={questionWrites.ready}
            canRemove={listingWrites.ready}
            onNeedSignIn={() => setShowAuth(true)}
            signedIn={Boolean(isSignedIn && user)}
            onLike={async () => {
              if (!requireSignIn() || !user) return
              const mine = likes.records.find(
                (like) => like.data.listingId === row.recordId && like.createdBy === user.id,
              )
              if (mine) await likeWrites.remove(mine.recordId)
              else await likeWrites.create({ listingId: row.recordId, userId: user.id })
            }}
            onAsk={async (body) => {
              if (!requireSignIn()) return
              await questionWrites.create({ listingId: row.recordId, body, authorName })
            }}
            onRemove={async () => {
              if (row.createdBy !== user?.id) return
              await listingWrites.remove(row.recordId)
            }}
          />
        ))}
      </div>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}

function ListingForm({
  knownIds,
  fee,
  feeStatus,
  canWrite,
  onNeedSignIn,
  onSubmit,
}: {
  knownIds: ReadonlySet<string>
  fee: ListingFeeView | null
  feeStatus: 'loading' | 'ready' | 'error'
  canWrite: boolean
  onNeedSignIn: () => void
  onSubmit: (draft: {
    neighborhoodId: string
    askingRent: number
    beds: string
    note: string
    paymentTxHash: string
  }) => Promise<void>
}) {
  const [neighborhoodId, setNeighborhoodId] = useState('')
  const [askingRent, setAskingRent] = useState('')
  const [beds, setBeds] = useState<string>(BED_OPTIONS[1])
  const [note, setNote] = useState('')
  const [paymentTxHash, setPaymentTxHash] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const networkLabel = fee?.network === 'mainnet' ? 'XRPL mainnet' : fee?.network === 'devnet' ? 'XRPL devnet' : 'XRPL testnet'

  return (
    <form
      className="mt-6 space-y-3 border border-border bg-card p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!canWrite) {
          onNeedSignIn()
          return
        }
        const parsed = parseListingDraft({ neighborhoodId, askingRent, beds, note, knownIds })
        if (!parsed.ok) {
          setError(parsed.error)
          return
        }
        const hash = paymentTxHash.trim()
        if (!TX_HASH.test(hash)) {
          setError('Paste the 64-character transaction hash. Not a wallet secret.')
          return
        }
        if (!fee?.configured) {
          setError('The hosting address is not set yet.')
          return
        }
        setError(null)
        setBusy(true)
        try {
          await onSubmit({ ...parsed.value, paymentTxHash: hash })
          setAskingRent('')
          setNote('')
          setPaymentTxHash('')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'The listing could not be hosted.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="text-sm">Host a listing</p>
      <div className="border border-border bg-background p-3 text-sm">
        {feeStatus === 'loading' && <p className="text-muted-foreground">Checking the hosting fee…</p>}
        {feeStatus === 'error' && (
          <p>The hosting fee could not be loaded. The ledger check runs in the app worker.</p>
        )}
        {fee && !fee.configured && (
          <p>
            Hosting costs {fee.amount} {fee.currency} on the {networkLabel}. The receiving address is not set yet.
            Put your XRPL address in <span className="font-mono">XRPL_DESTINATION</span>. A wallet seed is never asked
            for.
          </p>
        )}
        {fee?.configured && fee.destination && (
          <div className="space-y-2">
            <p>
              Send {fee.amount} {fee.currency}
              {fee.issuer ? ` issued by ${fee.issuer}` : ''} on the {networkLabel} to this address, then paste the
              transaction hash. The server reads the ledger before the listing is saved.
              {fee.network === 'testnet' ? ' A mainnet payment does not count.' : ''}
            </p>
            <p className="break-all font-mono text-xs">{fee.destination}</p>
            {fee.faucetUrl && (
              <a className="underline underline-offset-4" href={fee.faucetUrl} target="_blank" rel="noreferrer">
                Open the {fee.network} faucet
              </a>
            )}
          </div>
        )}
      </div>
      <label className="block text-sm">
        <span className="text-muted-foreground">Neighborhood</span>
        <select
          className="place-select mt-1"
          value={neighborhoodId}
          onChange={(event) => setNeighborhoodId(event.target.value)}
          required
        >
          <option value="">Choose a neighborhood</option>
          {BOROUGHS.map((borough) => (
            <optgroup key={borough} label={borough}>
              {CITY.neighborhoods
                .filter((place) => place.borough === borough)
                .map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted-foreground">Asking rent, monthly</span>
          <input
            className="mt-1 w-full border border-border bg-background px-3 py-2"
            inputMode="numeric"
            value={askingRent}
            onChange={(event) => setAskingRent(event.target.value)}
            placeholder="3100"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Bedrooms</span>
          <select className="place-select mt-1" value={beds} onChange={(event) => setBeds(event.target.value)}>
            {BED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-muted-foreground">Note</span>
        <textarea
          className="mt-1 w-full border border-border bg-background px-3 py-2"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What should someone know before they ask?"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">XRPL transaction hash</span>
        <input
          className="mt-1 w-full border border-border bg-background px-3 py-2 font-mono text-xs"
          value={paymentTxHash}
          onChange={(event) => setPaymentTxHash(event.target.value)}
          placeholder="64 hex characters from your wallet"
          spellCheck={false}
          autoComplete="off"
          required
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type={canWrite ? 'submit' : 'button'}
        className="bg-foreground px-3 py-2 text-sm text-background disabled:opacity-60"
        disabled={canWrite && (busy || !fee?.configured)}
        onClick={() => {
          if (!canWrite) onNeedSignIn()
        }}
      >
        {canWrite ? (busy ? 'Checking the ledger…' : 'Host listing') : 'Sign in to host'}
      </button>
    </form>
  )
}

function ListingCard({
  row,
  likes,
  questions,
  userId,
  authorName,
  canLike,
  canAsk,
  canRemove,
  signedIn,
  onNeedSignIn,
  onLike,
  onAsk,
  onRemove,
}: {
  row: RecordData<Listing>
  likes: RecordData<Like>[]
  questions: RecordData<Question>[]
  userId: string | null
  authorName: string
  canLike: boolean
  canAsk: boolean
  canRemove: boolean
  signedIn: boolean
  onNeedSignIn: () => void
  onLike: () => Promise<void>
  onAsk: (body: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const liked = likes.some((like) => like.createdBy === userId)
  const listing = row.data

  return (
    <article className="border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {listing.borough} · {listing.beds}
      </p>
      <h2 className="mt-1 text-2xl leading-none">{listing.neighborhoodName}</h2>
      <p className="mt-2 text-lg">{formatRent(listing.askingRent)} a month</p>
      <p className="mt-2 text-sm">{listing.note}</p>
      <p className="mt-2 text-xs text-muted-foreground">Posted by {listing.authorName}</p>
      {listing.paymentTxHash && (
        <p className="mt-1 text-xs text-muted-foreground">
          Hosted after an XRPL payment on {listing.paymentNetwork || 'the ledger'}
          {explorerTxUrl(listing.paymentNetwork || '', listing.paymentTxHash) ? (
            <>
              {' '}
              ·{' '}
              <a
                className="underline underline-offset-4"
                href={explorerTxUrl(listing.paymentNetwork || '', listing.paymentTxHash) || undefined}
                target="_blank"
                rel="noreferrer"
              >
                {listing.paymentTxHash.slice(0, 8)}…{listing.paymentTxHash.slice(-6)}
              </a>
            </>
          ) : (
            ` · ${listing.paymentTxHash.slice(0, 8)}…`
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="border border-border px-3 py-1.5 text-sm"
          aria-pressed={liked}
          onClick={() => {
            if (!signedIn) onNeedSignIn()
            else if (canLike) void onLike()
          }}
        >
          {liked ? 'Liked' : 'Like'} · {likes.length}
        </button>
        {row.createdBy === userId && canRemove && (
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => void onRemove()}>
            Remove
          </button>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {questions.map((item) => (
          <p key={item.recordId} className="text-sm">
            <span className="text-muted-foreground">{item.data.authorName}: </span>
            {item.data.body}
          </p>
        ))}
      </div>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!signedIn) {
            onNeedSignIn()
            return
          }
          const parsed = parseQuestion(question)
          if (!parsed.ok) {
            setError(parsed.error)
            return
          }
          if (!canAsk) return
          setError(null)
          await onAsk(parsed.value)
          setQuestion('')
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          <span className="sr-only">Question for {authorName}</span>
          <input
            className="w-full border border-border bg-background px-3 py-2"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about this listing"
          />
        </label>
        <button type="submit" className="border border-border px-3 py-2 text-sm">
          {signedIn ? 'Ask' : 'Sign in to ask'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </article>
  )
}
