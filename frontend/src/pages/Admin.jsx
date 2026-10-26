import { useCallback, useEffect, useRef, useState } from 'react'
import { api, FORMS, formatMoney } from '../api.js'

const POLL_MS = 5000

const AGENCY_LABELS = {
  received: 'Received',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  accepted: 'Accepted',
  action_required: 'Action required',
  not_found: 'Not found',
}

const OUR_LABELS = {
  received: 'Received (not sent yet)',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  accepted: 'Accepted',
  action_needed: 'Action needed',
}

// The status our system will show once a batch run syncs the agency's status.
const AGENCY_TO_OURS = {
  received: 'processing',
  processing: 'processing',
  approved: 'approved',
  sent: 'sent',
  accepted: 'accepted',
  action_required: 'action_needed',
}

const settableFor = (ret) =>
  ret.refund > 0
    ? ['received', 'processing', 'approved', 'sent', 'action_required']
    : ['received', 'processing', 'accepted', 'action_required']

const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'
const stamp = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
const today = () => new Date().toISOString().slice(0, 10)

function Chip({ status, labels, tone }) {
  return <span className={`chip ${tone ?? status}`}>{labels[status] ?? status}</span>
}

function ReturnRow({ ret, onChange }) {
  const options = settableFor(ret)
  const [status, setStatus] = useState(ret.agencyStatus?.status && options.includes(ret.agencyStatus.status) ? ret.agencyStatus.status : options[0])
  const [paymentDate, setPaymentDate] = useState(ret.agencyStatus?.paymentDate || today())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const form = FORMS[ret.form]
  const live = ret.agencyStatus
  const pendingSync = live?.status && AGENCY_TO_OURS[live.status] && AGENCY_TO_OURS[live.status] !== ret.status
  const needsDate = status === 'approved' || status === 'sent'

  async function act(label, path, method, body) {
    setBusy(label)
    setError('')
    try {
      onChange(await api(`/admin/returns/${ret.id}${path}`, { method, body }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <article className="panel admin-row">
      <header className="admin-row-head">
        <div>
          <strong>{ret.taxpayer.name}</strong>
          <span className="muted small">
            {' '}
            · {ret.taxpayer.email} · •••-••-{ret.taxpayer.taxIdLast4}
          </span>
          <p className="muted small admin-meta">
            {form.title} · {ret.agency} · {ret.owed > 0 ? `owes ${formatMoney(ret.owed)}` : `refund ${formatMoney(ret.refund)}`} ·
            filed {stamp(ret.submittedAt)}
          </p>
        </div>
        {ret.submissionId && <code className="submission">{ret.submissionId}</code>}
      </header>

      <div className="status-grid">
        <div>
          <p className="label">Taxpayer sees (synced by batch)</p>
          <Chip status={ret.status} labels={OUR_LABELS} />
          {ret.statusReason && <p className="muted small">{ret.statusReason}</p>}
          {ret.submissionId && (
            <p className="muted small">
              Last checked {clock(ret.lastCheckedAt)} · next {ret.nextCheckAt ? clock(ret.nextCheckAt) : 'none (final)'}
            </p>
          )}
        </div>
        <div>
          <p className="label">Agency has (live)</p>
          {!ret.submissionId ? (
            <p className="muted small">{ret.held ? 'Not sent: held by our duplicate screening.' : 'Not sent to the agency yet.'}</p>
          ) : live?.error ? (
            <p className="field-error small">{live.error}</p>
          ) : (
            <>
              <Chip status={live?.status} labels={AGENCY_LABELS} />{' '}
              <span className={`tag ${live?.manual ? 'manual' : ''}`}>{live?.manual ? 'Set by admin' : 'Automatic'}</span>
              {live?.paymentDate && <p className="muted small">Payment date {live.paymentDate}</p>}
            </>
          )}
        </div>
      </div>

      {pendingSync && (
        <p className="sync-note">
          The taxpayer will see <strong>{OUR_LABELS[AGENCY_TO_OURS[live.status]]}</strong> after the next batch run.
        </p>
      )}

      {ret.held ? (
        <div className="admin-actions">
          <button type="button" className="btn small" disabled={!!busy} onClick={() => act('release', '/release', 'POST')}>
            {busy === 'release' ? 'Releasing…' : 'Identity verified: release and send'}
          </button>
          <span className="muted small">Clears the hold; the return is sent without re-screening.</span>
        </div>
      ) : ret.submissionId ? (
        <form
          className="admin-actions"
          onSubmit={(e) => {
            e.preventDefault()
            act('set', '/agency-status', 'PUT', { status, paymentDate: needsDate ? paymentDate : '' })
          }}
        >
          <label className="inline-field">
            <span className="sr-only">Agency status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {AGENCY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {needsDate && (
            <label className="inline-field">
              <span className="sr-only">Payment date</span>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
            </label>
          )}
          <button type="submit" className="btn small" disabled={!!busy}>
            {busy === 'set' ? 'Saving…' : 'Set at agency'}
          </button>
          {live?.manual && (
            <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => act('clear', '/agency-status', 'DELETE')}>
              Resume automatic
            </button>
          )}
          <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => act('check', '/check-now', 'POST')}>
            Check now
          </button>
        </form>
      ) : (
        <p className="muted small">Waiting for the processor to send this return to the agency.</p>
      )}

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      <details className="details">
        <summary>History ({ret.events.length})</summary>
        <ol className="history">
          {[...ret.events].reverse().map((e, i) => (
            <li key={i}>
              <span className="muted small">{stamp(e.createdAt)}</span>
              <span>{e.note}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  )
}

export default function Admin() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const queryRef = useRef(query)
  queryRef.current = query

  const load = useCallback(async () => {
    try {
      const q = queryRef.current.trim()
      setData(await api(`/admin/returns${q ? `?q=${encodeURIComponent(q)}` : ''}`))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 250) // debounce typing
    return () => clearTimeout(t)
  }, [query, load])

  useEffect(() => {
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const replace = (updated) =>
    setData((d) => ({ ...d, returns: d.returns.map((r) => (r.id === updated.id ? updated : r)) }))

  return (
    <div className="page admin">
      <p className="eyebrow">Admin · mock agencies</p>
      <h1>Return status console</h1>
      <p className="muted">
        Play the IRS and the California FTB. A status you set here changes the agency's record, not ours: taxpayers see
        it after the next batch run, the same way a real agency update would reach them. Use <strong>Check now</strong>{' '}
        to make a return due immediately.
      </p>

      <label className="field search">
        <span className="sr-only">Search taxpayers</span>
        <input
          type="search"
          placeholder="Search by taxpayer name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p className="loading">Loading returns…</p>
      ) : data.returns.length === 0 ? (
        <p className="muted">No returns{query ? ' match that search' : ' have been filed yet'}.</p>
      ) : (
        <div className="admin-list">
          {data.returns.map((r) => (
            <ReturnRow key={r.id} ret={r} onChange={replace} />
          ))}
          {data.returns.length >= data.limit && <p className="muted small">Showing the newest {data.limit}. Search to narrow down.</p>}
        </div>
      )}
    </div>
  )
}
