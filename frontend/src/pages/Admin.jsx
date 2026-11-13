import { useCallback, useEffect, useRef, useState } from 'react'
import { api, FORMS, formatMoney, RESIDENCY_LABELS } from '../api.js'

const POLL_MS = 5000

const AGENCY_LABELS = {
  received: 'Received',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  adjusted: 'Refund adjusted',
  accepted: 'Accepted',
  action_required: 'Action required',
  not_found: 'Not found',
}

const OUR_LABELS = {
  received: 'Received (not sent yet)',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  adjusted: 'Refund adjusted',
  accepted: 'Accepted',
  action_needed: 'Action needed',
}

const settableFor = (ret) =>
  ret.refund > 0
    ? ['received', 'processing', 'approved', 'sent', 'adjusted', 'action_required']
    : ['received', 'processing', 'accepted', 'action_required']

// Which details each status sends to the taxpayer. These match the server's validation.
// Approved and Refund sent are the refund as filed; any other amount is Refund adjusted.
const NEEDS = {
  approved: { date: true },
  sent: { date: true },
  adjusted: { refund: true, date: true, message: true },
  accepted: { owed: true },
  action_required: { message: true },
}

// Time of day for today; date and time otherwise (approved refunds aren't rechecked until payment day).
const clock = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}
const stamp = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
const isoDay = (offsetDays) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

// --- Randomize: plausible agency decisions, within the limits the server enforces ---

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
const pick = (list) => list[Math.floor(Math.random() * list.length)]

const LOWER_REASONS = [
  'We corrected a math error on your return.',
  'Part of your refund was applied to a past-due debt. You will receive a separate notice.',
  'We adjusted a credit you claimed based on the information we have on file.',
]
const HIGHER_REASONS = ['We corrected a math error in your favor.', 'We found a credit you are eligible for.']
const ACTION_REASONS = [
  'Verify your identity. We mailed you a letter with instructions; respond within 30 days.',
  'Send copies of your W-2 forms so we can confirm your wages and withholding.',
  'Confirm the bank account for your direct deposit using the number in the letter we mailed you.',
  'Send documents supporting the dependents you claimed. See the letter we mailed you for details.',
  'We received more than one return with your information. Follow the instructions in the letter we mailed you.',
]

// An adjusted refund: 80–105% of the claim, never exactly the claim.
function randomAdjustment(claimed) {
  const refund = Math.max(1, Math.round(claimed * (0.8 + Math.random() * 0.25)))
  if (refund !== claimed) return refund
  return claimed > 1 ? claimed - 1 : claimed + 1
}

function randomDetails(status, ret) {
  switch (status) {
    case 'approved':
      return { paymentDate: isoDay(randInt(5, 21)) }
    case 'sent':
      return { paymentDate: isoDay(-randInt(0, 3)) }
    case 'adjusted': {
      const refund = randomAdjustment(ret.refund)
      const message = pick(refund < ret.refund ? LOWER_REASONS : HIGHER_REASONS)
      return { refundAmount: String(refund), paymentDate: isoDay(-randInt(0, 3)), message }
    }
    case 'accepted': {
      const owed = ret.owed > 0 ? Math.round(ret.owed * (1 + Math.random() * 0.1)) : 0
      return { amountOwed: String(owed), message: owed > 0 ? 'Pay the balance due by April 15 to avoid penalties and interest.' : '' }
    }
    case 'action_required':
      return { message: pick(ACTION_REASONS) }
    default:
      return {}
  }
}

const EMPTY_DETAILS = { refundAmount: '', paymentDate: '', amountOwed: '', message: '' }

// Start the editor from what the agency currently says, when it's a status we can edit.
function initialEditor(ret) {
  const live = ret.agencyStatus
  const options = settableFor(ret)
  const status = live?.status && options.includes(live.status) ? live.status : options[0]
  return {
    status,
    // Default to the amounts as filed until the agency says otherwise.
    refundAmount: String(live?.refundAmount ?? ret.refund),
    paymentDate: live?.paymentDate ?? '',
    amountOwed: String(live?.amountOwed ?? ret.owed),
    message: live?.message ?? '',
  }
}

function Chip({ status, labels }) {
  return <span className={`chip ${status}`}>{labels[status] ?? status}</span>
}

function ReturnRow({ ret, onChange }) {
  const [editor, setEditor] = useState(() => initialEditor(ret))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const form = FORMS[ret.form]
  const live = ret.agencyStatus
  const needs = NEEDS[editor.status] ?? {}
  const set = (patch) => {
    setEditor((e) => ({ ...e, ...patch }))
    setSent('')
  }

  async function act(label, path, method, body) {
    setBusy(label)
    setError('')
    setSent('')
    try {
      const updated = await api(`/admin/returns/${ret.id}${path}`, { method, body })
      onChange(updated)
      if (label === 'send') setSent('Sent. The taxpayer sees it now.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  function send(e) {
    e.preventDefault()
    const num = (v) => (v === '' ? undefined : Number(v))
    act('send', '/agency-status', 'PUT', {
      status: editor.status,
      paymentDate: needs.date ? editor.paymentDate : '',
      refundAmount: needs.refund ? num(editor.refundAmount) : undefined,
      amountOwed: needs.owed ? num(editor.amountOwed) : undefined,
      message: editor.message,
    })
  }

  const asFiled = ret.owed > 0 ? `owes ${formatMoney(ret.owed)}` : `refund ${formatMoney(ret.refund)}`

  return (
    <div className="return-row">
      <div className="return-row-head">
        <strong>{form.title}</strong>
        <span className="muted small">
          {' '}
          · {ret.agency} · as filed: {asFiled} · filed {stamp(ret.submittedAt)}
        </span>
        {ret.submissionId && <code className="submission">{ret.submissionId}</code>}
      </div>

      <div className="status-grid">
        <div>
          <p className="label">Taxpayer sees</p>
          <Chip status={ret.status} labels={OUR_LABELS} />
          {ret.agencyRefund != null && <span className="muted small"> {formatMoney(ret.agencyRefund)}</span>}
          {ret.agencyOwed != null && ret.agencyOwed > 0 && <span className="muted small"> owes {formatMoney(ret.agencyOwed)}</span>}
          {ret.events.length > 0 && <p className="muted small latest-note">“{ret.events[ret.events.length - 1].note}”</p>}
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
              {live?.refundAmount != null && <p className="muted small">Refund {formatMoney(live.refundAmount)}</p>}
              {live?.amountOwed != null && <p className="muted small">Balance due {formatMoney(live.amountOwed)}</p>}
              {live?.paymentDate && <p className="muted small">Payment date {live.paymentDate}</p>}
              {live?.message && <p className="muted small">“{live.message}”</p>}
            </>
          )}
        </div>
      </div>

      {ret.held ? (
        <div className="admin-actions">
          <button type="button" className="btn small" disabled={!!busy} onClick={() => act('release', '/release', 'POST')}>
            {busy === 'release' ? 'Releasing…' : 'Identity verified: release and send'}
          </button>
          <span className="muted small">Clears the hold; the return is sent without re-screening.</span>
        </div>
      ) : ret.submissionId ? (
        <form className="editor" onSubmit={send}>
          <div className="editor-fields">
            <label className="field compact">
              <span>Status</span>
              <select
                value={editor.status}
                onChange={(e) =>
                  set({ status: e.target.value, ...EMPTY_DETAILS, amountOwed: String(ret.owed) })
                }
              >
                {settableFor(ret).map((s) => (
                  <option key={s} value={s}>
                    {AGENCY_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {needs.refund && (
              <label className="field compact">
                <span>Adjusted refund (filed {formatMoney(ret.refund)})</span>
                <div className="input-prefix">
                  <span aria-hidden="true">$</span>
                  <input
                    inputMode="numeric"
                    required
                    value={editor.refundAmount}
                    onChange={(e) => set({ refundAmount: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                  />
                </div>
              </label>
            )}
            {needs.date && (
              <label className="field compact">
                <span>{editor.status === 'approved' ? 'Expected payment date' : 'Deposit date'}</span>
                <input type="date" required value={editor.paymentDate} onChange={(e) => set({ paymentDate: e.target.value })} />
              </label>
            )}
            {needs.owed && (
              <label className="field compact">
                <span>Balance due</span>
                <div className="input-prefix">
                  <span aria-hidden="true">$</span>
                  <input
                    inputMode="numeric"
                    value={editor.amountOwed}
                    onChange={(e) => set({ amountOwed: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                  />
                </div>
              </label>
            )}
          </div>
          <label className="field compact">
            <span>
              Message to the taxpayer{needs.message ? '' : ' (optional)'}
            </span>
            <textarea
              rows={2}
              maxLength={500}
              required={needs.message}
              minLength={needs.message ? 10 : undefined}
              placeholder={
                editor.status === 'adjusted'
                  ? 'Why did the refund change?'
                  : needs.message
                    ? 'What does the agency need from the taxpayer?'
                    : 'Shown with the status.'
              }
              value={editor.message}
              onChange={(e) => set({ message: e.target.value })}
            />
          </label>
          <div className="admin-actions">
            {NEEDS[editor.status] && (
              <button type="button" className="btn small secondary" onClick={() => set(randomDetails(editor.status, ret))}>
                Randomize
              </button>
            )}
            <button type="submit" className="btn small" disabled={!!busy}>
              {busy === 'send' ? 'Sending…' : 'Send to taxpayer'}
            </button>
            {live?.manual && (
              <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => act('clear', '/agency-status', 'DELETE')}>
                Resume automatic
              </button>
            )}
            <button type="button" className="btn small secondary" disabled={!!busy} onClick={() => act('check', '/check-now', 'POST')}>
              Check now
            </button>
            {sent && <span className="sent-note small">{sent}</span>}
          </div>
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
    </div>
  )
}

// Group returns under their taxpayer, keeping the newest activity first.
function byTaxpayer(returns) {
  const groups = new Map()
  for (const r of returns) {
    if (!groups.has(r.taxpayer.email)) groups.set(r.taxpayer.email, { taxpayer: r.taxpayer, returns: [] })
    groups.get(r.taxpayer.email).returns.push(r)
  }
  for (const g of groups.values()) g.returns.sort((a, b) => (a.form === '1040' ? -1 : b.form === '1040' ? 1 : 0))
  return [...groups.values()]
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

  const groups = data ? byTaxpayer(data.returns) : []

  return (
    <div className="page admin">
      <p className="eyebrow">Admin · mock agencies</p>
      <h1>Return status console</h1>
      <p className="muted">
        Play the IRS and the state agencies. Choose a status for any return a taxpayer has sent in, add the details it
        needs, and <strong>Send to taxpayer</strong>: the status is set at the agency and synced to the taxpayer right
        away. <strong>Randomize</strong> fills in a plausible refund, date, or message.
      </p>

      <label className="field search">
        <span className="sr-only">Search taxpayers</span>
        <input type="search" placeholder="Search by taxpayer name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p className="loading">Loading returns…</p>
      ) : groups.length === 0 ? (
        <p className="muted">No taxpayer{query ? ' matching that search has' : ' has'} sent in a return yet.</p>
      ) : (
        <div className="admin-list">
          <p className="muted small">
            {groups.length} taxpayer{groups.length === 1 ? '' : 's'} · {data.returns.length} return{data.returns.length === 1 ? '' : 's'}
          </p>
          {groups.map(({ taxpayer, returns }) => (
            <article key={taxpayer.email} className="panel taxpayer-group">
              <header className="taxpayer-head">
                <strong>{taxpayer.name}</strong>
                <span className="muted small">
                  {' '}
                  · {taxpayer.email} · •••-••-{taxpayer.taxIdLast4} · states:{' '}
                  {taxpayer.states
                    .map((f) => {
                      const how = [f.residency === 'resident' ? '' : RESIDENCY_LABELS[f.residency], f.incomeTax ? '' : 'no income tax']
                      const detail = how.filter(Boolean).join(', ')
                      return detail ? `${f.state} (${detail})` : f.state
                    })
                    .join(', ') || 'none'}
                </span>
              </header>
              {returns.map((r) => (
                <ReturnRow key={r.id} ret={r} onChange={replace} />
              ))}
            </article>
          ))}
          {data.returns.length >= data.limit && <p className="muted small">Showing the newest {data.limit} returns. Search to narrow down.</p>}
        </div>
      )}
    </div>
  )
}
