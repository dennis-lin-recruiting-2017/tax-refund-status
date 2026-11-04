import { filingStatusLabel, FORMS, formatMoney } from '../api.js'

const REFUND_STEPS = ['received', 'processing', 'approved', 'sent']
const NO_REFUND_STEPS = ['received', 'processing', 'accepted']
const STEP_LABELS = {
  received: 'Received',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  accepted: 'Accepted',
}
export const FINAL_STATUSES = ['sent', 'adjusted', 'accepted', 'action_needed']

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const formatClock = (iso) => {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}
const formatTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

function Timeline({ ret }) {
  const steps = ret.refund > 0 ? REFUND_STEPS : NO_REFUND_STEPS
  const flagged = ret.status === 'action_needed'
  const adjusted = ret.status === 'adjusted' // takes the Refund sent step
  const current = flagged ? steps.indexOf('processing') : steps.indexOf(adjusted ? 'sent' : ret.status)
  return (
    <ol className="steps" style={{ '--count': steps.length }}>
      {steps.map((s, i) => {
        let state = i < current ? 'done' : i === current ? 'current' : 'todo'
        if (flagged && i === current) state = 'action'
        if (i === current && FINAL_STATUSES.includes(ret.status) && !flagged) state = 'done'
        return (
          <li key={s} className={`step ${state}`}>
            <span className="dot" aria-hidden="true" />
            <span>
              {flagged && i === current ? 'Action needed' : adjusted && s === 'sent' ? 'Refund adjusted' : STEP_LABELS[s]}
              {i === current && <span className="sr-only"> (current)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function ReturnCard({ ret }) {
  const form = FORMS[ret.form]
  const latest = ret.events[ret.events.length - 1]
  const flagged = ret.status === 'action_needed'
  // The agency may adjust the refund or report a balance due; show its figure.
  const owes = ret.owed > 0 || (ret.agencyOwed ?? 0) > 0
  const approvedRefund = ['approved', 'sent', 'adjusted'].includes(ret.status) ? ret.agencyRefund : null
  const claimed = ret.owed > 0 ? ret.owed : ret.refund
  const shown = owes ? (ret.agencyOwed ?? ret.owed) : (approvedRefund ?? ret.refund)

  return (
    <article className="panel return-card">
      <header className="return-head">
        <div>
          <p className="eyebrow">{form.agency} · {ret.taxYear}</p>
          <h2>{form.title}</h2>
          <p className="muted small">{filingStatusLabel(ret.filingStatus)}</p>
        </div>
        <div className="return-amount">
          <span className="muted small">{owes ? 'Amount owed' : ret.status === 'adjusted' ? 'Adjusted refund' : approvedRefund != null ? 'Approved refund' : 'Refund'}</span>
          <strong>{formatMoney(shown)}</strong>
          {shown !== claimed && <span className="muted small">You claimed {formatMoney(claimed)}</span>}
        </div>
      </header>

      <Timeline ret={ret} />

      <div className={`message${flagged ? ' warn' : ''}`} role="status">
        <strong>{latest?.note}</strong>
        {ret.status === 'approved' && ret.expectedPaymentDate && (
          <p>Expected by direct deposit on {formatDate(ret.expectedPaymentDate)} to the account ending in {ret.bankLast4}.</p>
        )}
        {['sent', 'adjusted'].includes(ret.status) && <p>Deposited to the account ending in {ret.bankLast4}. Allow up to 5 days for your bank to post it.</p>}
        {ret.status === 'accepted' && owes && shown > 0 && <p>Pay {formatMoney(shown)} by the filing deadline to avoid penalties.</p>}
        {flagged && <p>We never ask for personal details by email or text. Follow only the instructions in the mailed letter.</p>}
        {ret.status === 'received' && <p className="live">We'll send your return to the {ret.agency} shortly.</p>}
        {(ret.status === 'processing' || ret.status === 'approved') && (
          <p className="live">
            {ret.lastCheckedAt
              ? `Last checked with the ${ret.agency} at ${formatClock(ret.lastCheckedAt)}.`
              : `We'll check with the ${ret.agency} in the next status run.`}
            {ret.nextCheckAt && new Date(ret.nextCheckAt) > Date.now()
              ? ` Next check around ${formatClock(ret.nextCheckAt)}.`
              : ret.lastCheckedAt && ' Due in the next status run.'}
          </p>
        )}
      </div>

      <details className="details">
        <summary>History</summary>
        <ol className="history">
          {[...ret.events].reverse().map((e, i) => (
            <li key={i}>
              <span className="muted small">{formatTime(e.createdAt)}</span>
              <span>{e.note}</span>
            </li>
          ))}
        </ol>
      </details>

      <details className="details">
        <summary>Calculation</summary>
        <table className="calc">
          <tbody>
            {ret.computed.lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td>{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </article>
  )
}
