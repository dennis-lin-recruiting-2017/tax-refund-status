import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Everything here is fake and runs only in the browser. Sample tax IDs start with
// 000, which is never issued, so the demo can refuse anything that could be real.
const TAX_YEAR = 2025
const MAX_FAILURES = 3
const LOCKOUT_SECONDS = 60
const RESPONSE_DELAY_MS = 700

const STEPS = ['Return received', 'Under processing', 'Refund approved', 'Refund sent']

const FILING_STATUSES = [
  'Single',
  'Married filing jointly',
  'Married filing separately',
  'Head of household',
  'Qualifying surviving spouse',
]

const SAMPLES = [
  {
    taxId: '000001001',
    filingStatus: 'Single',
    amount: 1250,
    step: 0,
    message: 'We received your return and it is waiting to be processed.',
    detail: 'Most returns move to processing within a few days.',
  },
  {
    taxId: '000001002',
    filingStatus: 'Married filing jointly',
    amount: 3480,
    step: 1,
    message: 'Your return is being processed.',
    detail: 'No action is needed. We will show a payment date once your refund is approved.',
  },
  {
    taxId: '000001003',
    filingStatus: 'Head of household',
    amount: 2015,
    step: 2,
    message: 'Your refund is approved.',
    detail: 'Expected by direct deposit on March 4, 2026.',
  },
  {
    taxId: '000001004',
    filingStatus: 'Single',
    amount: 612,
    step: 3,
    message: 'Your refund was sent.',
    detail: 'Deposited on February 18, 2026 to the account ending in ••42. Allow up to 5 days for your bank to post it.',
  },
  {
    taxId: '000001005',
    filingStatus: 'Married filing separately',
    amount: 940,
    step: 1,
    action: true,
    message: 'We need more information to finish processing your return.',
    detail: 'A letter with instructions was mailed to the address on your return. We never ask for details by email or text.',
  },
]

const digitsOnly = (v) => v.replace(/\D/g, '').slice(0, 9)

function formatTaxId(digits) {
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

const maskTaxId = (digits) => `•••-••-${digits.slice(-4)}`
const formatMoney = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function StatusResult({ record, onReset }) {
  return (
    <div className="demo-result" role="status">
      <div className="demo-result-head">
        <div>
          <p className="demo-label">Tax year {TAX_YEAR} refund</p>
          <p className="demo-amount">{formatMoney(record.amount)}</p>
        </div>
        <p className="demo-id">Tax ID {maskTaxId(record.taxId)}</p>
      </div>

      <ol className="demo-steps">
        {STEPS.map((label, i) => {
          const state = i < record.step ? 'done' : i === record.step ? (record.action ? 'action' : 'current') : 'todo'
          return (
            <li key={label} className={`demo-step ${state}`}>
              <span className="dot" aria-hidden="true" />
              <span className="demo-step-label">
                {label}
                {state === 'current' && <span className="sr-only"> (current step)</span>}
                {state === 'action' && <span className="sr-only"> (action needed)</span>}
              </span>
            </li>
          )
        })}
      </ol>

      <div className={`demo-message${record.action ? ' action' : ''}`}>
        <strong>{record.message}</strong>
        <p>{record.detail}</p>
      </div>

      <button type="button" className="btn secondary" onClick={onReset}>
        Check another refund
      </button>
    </div>
  )
}

export default function Demo() {
  const [taxId, setTaxId] = useState('')
  const [showId, setShowId] = useState(false)
  const [filingStatus, setFilingStatus] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState(null)
  const [failures, setFailures] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const timer = useRef(null)

  const lockRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  const locked = lockRemaining > 0

  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= lockedUntil) {
        setLockedUntil(0)
        setFailures(0)
        setError('')
      }
    }, 250)
    return () => clearInterval(id)
  }, [lockedUntil])

  useEffect(() => () => clearTimeout(timer.current), [])

  function fillSample(s) {
    setTaxId(s.taxId)
    setFilingStatus(s.filingStatus)
    setAmount(String(s.amount))
    setError('')
  }

  function reset() {
    setResult(null)
    setTaxId('')
    setFilingStatus('')
    setAmount('')
    setShowId(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (locked || pending) return

    // Input checks are about format only and never reveal whether a record exists.
    if (taxId.length !== 9 || !filingStatus || !/^\d+$/.test(amount)) {
      setError('Enter all three fields: a 9-digit tax ID, your filing status, and your refund in whole dollars.')
      return
    }
    if (!taxId.startsWith('000')) {
      setTaxId('')
      setError('This demo only accepts the sample tax IDs listed below. Never enter a real tax ID here.')
      return
    }

    setError('')
    setPending(true)
    // A fixed delay for every outcome, so response time doesn't hint at which field was wrong.
    timer.current = setTimeout(() => {
      const match = SAMPLES.find(
        (s) => s.taxId === taxId && s.filingStatus === filingStatus && s.amount === Number(amount),
      )
      setPending(false)
      if (match) {
        setFailures(0)
        setResult(match)
        return
      }
      const next = failures + 1
      setFailures(next)
      if (next >= MAX_FAILURES) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000
        setNow(Date.now())
        setLockedUntil(until)
        setError('')
      } else {
        setError(
          `We couldn't find a refund that matches that information. Check your details and try again. ` +
            `${MAX_FAILURES - next} attempt${MAX_FAILURES - next === 1 ? '' : 's'} left.`,
        )
      }
    }, RESPONSE_DELAY_MS)
  }

  return (
    <>
      <p className="eyebrow">Demo</p>
      <h1>Check your refund status</h1>
      <p className="lede">
        A working mock of the taxpayer experience, using sample data only.
      </p>

      <div className="run-real" role="note">
        <strong>Want the real system?</strong> The same workflow runs against a Go backend and Postgres with pgvector.
        Run it on <Link to="/demo/local-kubernetes">Local Kubernetes</Link> or follow{' '}
        <Link to="/demo/local-development">Local Development</Link> to work on the code.
      </div>

      <div className="demo-banner" role="note">
        <strong>Demo only. Don't enter real information.</strong> Nothing you type leaves your browser, and
        only the sample tax IDs below (starting with 000) are accepted.
      </div>

      <div className="demo-panel">
        {result ? (
          <StatusResult record={result} onReset={reset} />
        ) : (
          <form className="demo-form" onSubmit={handleSubmit} autoComplete="off" noValidate>
            <p className="demo-label">Tax year {TAX_YEAR}</p>

            <label className="field">
              <span>Social Security number or ITIN</span>
              <div className="input-with-action">
                <input
                  type={showId ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="000-00-0000"
                  value={showId ? formatTaxId(taxId) : taxId}
                  onChange={(e) => setTaxId(digitsOnly(e.target.value))}
                  disabled={locked}
                  aria-describedby="taxid-hint"
                />
                <button type="button" className="input-action" onClick={() => setShowId((s) => !s)} disabled={locked}>
                  {showId ? 'Hide' : 'Show'}
                </button>
              </div>
              <small id="taxid-hint">Hidden by default so it can't be read over your shoulder.</small>
            </label>

            <label className="field">
              <span>Filing status</span>
              <select value={filingStatus} onChange={(e) => setFilingStatus(e.target.value)} disabled={locked}>
                <option value="">Select…</option>
                {FILING_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Exact refund amount (whole dollars)</span>
              <div className="input-prefix">
                <span aria-hidden="true">$</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  disabled={locked}
                />
              </div>
            </label>

            {locked ? (
              <div className="demo-alert locked" role="alert">
                <strong>Too many attempts.</strong> For your security, lookups are paused for {lockRemaining}{' '}
                second{lockRemaining === 1 ? '' : 's'}.
              </div>
            ) : (
              error && (
                <div className="demo-alert" role="alert">
                  {error}
                </div>
              )
            )}

            <button type="submit" className="btn" disabled={locked || pending}>
              {pending ? 'Checking…' : 'Check status'}
            </button>
          </form>
        )}
      </div>

      <section>
        <h2>Sample data</h2>
        <p>Use one of these made-up records, or change one field to see what a failed lookup looks like.</p>
        <div className="table-scroll">
          <table className="metrics demo-samples">
            <thead>
              <tr><th>Tax ID</th><th>Filing status</th><th>Refund</th><th>Shows</th><th /></tr>
            </thead>
            <tbody>
              {SAMPLES.map((s) => (
                <tr key={s.taxId}>
                  <td className="mono">{formatTaxId(s.taxId)}</td>
                  <td>{s.filingStatus}</td>
                  <td>{formatMoney(s.amount)}</td>
                  <td>{s.action ? 'Action needed' : STEPS[s.step]}</td>
                  <td>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => fillSample(s)}
                      disabled={locked || Boolean(result)}
                    >
                      Use
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Security behaviors shown here</h2>
        <ul className="checks">
          <li>
            <strong>Uniform failures.</strong> A wrong tax ID, filing status, or amount all produce the same message,
            so a failed lookup never confirms which detail was correct.
          </li>
          <li>
            <strong>Constant response time.</strong> Every lookup takes the same time whether or not it matches.
          </li>
          <li>
            <strong>Lockout.</strong> After {MAX_FAILURES} failed attempts, lookups pause for {LOCKOUT_SECONDS} seconds.
            In the real system this is enforced on the server, per identity and per client.
          </li>
          <li>
            <strong>Masked output.</strong> Results show only the last four digits of the tax ID and of the bank account.
          </li>
          <li>
            <strong>No data in URLs or storage.</strong> Inputs are never put in the address bar or saved by the browser.
          </li>
        </ul>
        <p>
          See <Link to="/security">Security</Link> for the full set of controls.
        </p>
      </section>
    </>
  )
}
