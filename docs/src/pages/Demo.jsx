import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Everything here is fake and runs only in the browser. Sample accounts use the
// demo.test domain, which can't receive mail, and one shared demo password.
const TAX_YEAR = 2025
const DEMO_PASSWORD = 'test'
const MAX_FAILURES = 3
const LOCKOUT_SECONDS = 60
const RESPONSE_DELAY_MS = 700

const REFUND_STEPS = ['received', 'processing', 'approved', 'sent']
const NO_REFUND_STEPS = ['received', 'processing', 'accepted']
const STEP_LABELS = {
  received: 'Received',
  processing: 'Processing',
  approved: 'Approved',
  sent: 'Refund sent',
  accepted: 'Accepted',
}
const STATUS_LABELS = { ...STEP_LABELS, adjusted: 'Refund adjusted', action_needed: 'Action needed' }

// What the taxpayer can do at each status. This is the guidance that keeps a status from
// turning into a support call.
const HELP = {
  received: [
    'Nothing yet. Most returns move to processing within a few days.',
    'Filing again will delay your refund, so don’t send a second return.',
  ],
  processing: [
    'No action is needed while your return is processing.',
    'If it has been more than 21 days since you e-filed, contact the agency. Have a copy of your return ready.',
  ],
  approved: [
    'Your refund is scheduled. If it hasn’t arrived 5 days after the payment date, check with your bank first.',
    'If your bank can’t find it, contact the agency to trace the payment.',
  ],
  sent: [
    'Allow up to 5 days for your bank to post the deposit.',
    'If your bank rejects the deposit, the agency mails a paper check to the address on your return.',
  ],
  adjusted: [
    'The agency is mailing a notice that explains the change line by line.',
    'If you disagree, respond by the date on the notice, with any documents that support your return.',
    'If part of your refund paid a past-due debt, contact the agency that received it, not the tax agency.',
  ],
  accepted: [
    'Pay the balance due by the filing deadline to avoid penalties and interest.',
    'If you can’t pay in full, the agency offers payment plans.',
  ],
  action_needed: [
    'Follow the instructions in the letter mailed to the address on your return, and respond by its deadline.',
    'Agencies never ask for personal details by email, text, or social media. Ignore any message that does.',
    'Your refund continues processing once the agency has what it needs.',
  ],
}

const ACCOUNTS = [
  {
    email: 'jordan@demo.test',
    name: 'Jordan',
    shows: 'Processing, Received',
    returns: [
      { agency: 'IRS', form: 'Form 1040', refund: 1250, bank: '4410', status: 'processing',
        note: 'The IRS is processing your return.' },
      { agency: 'California FTB', form: 'CA Form 540', refund: 310, bank: '4410', status: 'received',
        note: 'We sent your return to the California FTB. It’s waiting to be processed.' },
    ],
  },
  {
    email: 'priya@demo.test',
    name: 'Priya',
    shows: 'Approved, Processing',
    returns: [
      { agency: 'IRS', form: 'Form 1040', refund: 3480, bank: '7731', status: 'approved', date: 'March 4, 2026',
        note: 'The IRS approved your refund of $3,480.' },
      { agency: 'New York DTF', form: 'NY Form IT-201', refund: 620, bank: '7731', status: 'processing',
        note: 'The New York DTF is processing your return.' },
    ],
  },
  {
    email: 'sam@demo.test',
    name: 'Sam',
    shows: 'Refund sent, Refund adjusted',
    returns: [
      { agency: 'IRS', form: 'Form 1040', refund: 2015, bank: '0042', status: 'sent', date: 'February 18, 2026',
        note: 'The IRS sent your refund of $2,015 by direct deposit.' },
      { agency: 'California FTB', form: 'CA Form 540', refund: 480, adjustedTo: 355, bank: '0042', status: 'adjusted',
        date: 'February 24, 2026',
        note: 'The California FTB adjusted your refund to $355 and sent it by direct deposit. Part of your refund was applied to a past-due debt.' },
    ],
  },
  {
    email: 'alex@demo.test',
    name: 'Alex',
    shows: 'Action needed, Processing',
    returns: [
      { agency: 'IRS', form: 'Form 1040', refund: 940, bank: '5519', status: 'action_needed',
        note: 'The IRS needs more information: verify your identity using the letter we mailed you.' },
      { agency: 'California FTB', form: 'CA Form 540', refund: 205, bank: '5519', status: 'processing',
        note: 'The California FTB is processing your return.' },
    ],
  },
  {
    email: 'morgan@demo.test',
    name: 'Morgan',
    shows: 'Accepted with balance due, Refund sent',
    returns: [
      { agency: 'IRS', form: 'Form 1040', refund: 0, owed: 612, status: 'accepted',
        note: 'The IRS accepted your return. Balance due: $612.' },
      { agency: 'New York DTF', form: 'NY Form IT-201', refund: 145, bank: '2208', status: 'sent', date: 'March 2, 2026',
        note: 'The New York DTF sent your refund of $145 by direct deposit.' },
    ],
  },
]

const formatMoney = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function Steps({ ret }) {
  const steps = ret.refund > 0 ? REFUND_STEPS : NO_REFUND_STEPS
  const flagged = ret.status === 'action_needed'
  // Action needed holds the return in processing; an adjusted refund takes the Refund sent step.
  const at = flagged ? 'processing' : ret.status === 'adjusted' ? 'sent' : ret.status
  const current = steps.indexOf(at)
  const final = ['sent', 'accepted'].includes(at)
  return (
    <ol className="demo-steps" style={{ '--count': steps.length }}>
      {steps.map((s, i) => {
        let state = i < current || (i === current && final) ? 'done' : i === current ? 'current' : 'todo'
        if (flagged && i === current) state = 'action'
        const label =
          flagged && i === current ? 'Action needed' : ret.status === 'adjusted' && s === 'sent' ? 'Refund adjusted' : STEP_LABELS[s]
        return (
          <li key={s} className={`demo-step ${state}`}>
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
  )
}

function ReturnStatus({ ret }) {
  const flagged = ret.status === 'action_needed'
  const owes = ret.owed > 0
  const amount = owes ? ret.owed : (ret.adjustedTo ?? ret.refund)
  const amountLabel = owes ? 'Balance due' : ret.adjustedTo != null ? 'Adjusted refund' : 'Refund'
  return (
    <article className="demo-return">
      <div className="demo-result-head">
        <div>
          <p className="demo-label">{ret.agency} · {TAX_YEAR}</p>
          <p className="demo-return-title">{ret.form}</p>
        </div>
        <div className="demo-return-amount">
          <span className="demo-id">{amountLabel}</span>
          <p className="demo-amount">{formatMoney(amount)}</p>
          {ret.adjustedTo != null && <span className="demo-id">You claimed {formatMoney(ret.refund)}</span>}
        </div>
      </div>

      <Steps ret={ret} />

      <div className={`demo-message${flagged ? ' action' : ''}`} role="status">
        <strong>{ret.note}</strong>
        {ret.status === 'approved' && <p>Expected by direct deposit on {ret.date} to the account ending in {ret.bank}.</p>}
        {['sent', 'adjusted'].includes(ret.status) && <p>Deposited on {ret.date} to the account ending in {ret.bank}.</p>}
      </div>

      <div className="demo-help">
        <p className="demo-label">What you can do</p>
        <ul>
          {HELP[ret.status].map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}

function Dashboard({ account, onSignOut }) {
  return (
    <div className="demo-result">
      <div className="demo-result-head">
        <div>
          <p className="demo-label">Tax year {TAX_YEAR}</p>
          <p className="demo-amount">Hi, {account.name}</p>
        </div>
        <button type="button" className="btn small secondary" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      {account.returns.map((r) => (
        <ReturnStatus key={r.form} ret={r} />
      ))}
    </div>
  )
}

export default function Demo() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [account, setAccount] = useState(null)
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

  function fillSample(a) {
    setEmail(a.email)
    setPassword(DEMO_PASSWORD)
    setError('')
  }

  function signOut() {
    setAccount(null)
    setEmail('')
    setPassword('')
    setShowPassword(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (locked || pending) return

    // Input checks are about format only and never reveal whether an account exists.
    const address = email.trim().toLowerCase()
    if (!address || !password) {
      setError('Enter your email and password.')
      return
    }
    if (!address.endsWith('@demo.test')) {
      setError('This demo only accepts the sample accounts listed below. Never enter a real password here.')
      return
    }

    setError('')
    setPending(true)
    // A fixed delay for every outcome, so response time doesn't hint at whether the account exists.
    timer.current = setTimeout(() => {
      const match = ACCOUNTS.find((a) => a.email === address)
      setPending(false)
      if (match && password === DEMO_PASSWORD) {
        setFailures(0)
        setPassword('')
        setAccount(match)
        return
      }
      setPassword('')
      const next = failures + 1
      setFailures(next)
      if (next >= MAX_FAILURES) {
        setNow(Date.now())
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000)
        setError('')
      } else {
        setError(
          `That email and password don't match. Try again. ` +
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
        A working mock of the taxpayer experience: sign in, see your federal and state refunds, and find out what to do
        if there's a problem.
      </p>

      <div className="run-real" role="note">
        <strong>Want the real system?</strong> The same workflow runs against a Go backend and Postgres with pgvector.
        Run it on <Link to="/demo/local-kubernetes">Local Kubernetes</Link> or follow{' '}
        <Link to="/demo/local-development">Local Development</Link> to work on the code.
      </div>

      <div className="demo-banner" role="note">
        <strong>Demo only. Don't enter real information.</strong> Nothing you type leaves your browser, and only the
        sample accounts below are accepted.
      </div>

      <div className={`demo-panel${account ? ' wide' : ''}`}>
        {account ? (
          <Dashboard account={account} onSignOut={signOut} />
        ) : (
          <form className="demo-form" onSubmit={handleSubmit} autoComplete="off" noValidate>
            <p className="demo-label">Sign in</p>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="off"
                spellCheck="false"
                placeholder="you@demo.test"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={locked}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <div className="input-with-action">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={locked}
                />
                <button type="button" className="input-action" onClick={() => setShowPassword((s) => !s)} disabled={locked}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {locked ? (
              <div className="demo-alert locked" role="alert">
                <strong>Too many attempts.</strong> For your security, sign-in is paused for {lockRemaining}{' '}
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
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>

      <section>
        <h2>Sample accounts</h2>
        <p>
          The password for every sample account is <code>{DEMO_PASSWORD}</code>. Enter a wrong password to see a failed
          sign-in, and three in a row to see the lockout.
        </p>
        <div className="table-scroll">
          <table className="metrics demo-samples">
            <thead>
              <tr><th>Account</th><th>Federal, state</th><th /></tr>
            </thead>
            <tbody>
              {ACCOUNTS.map((a) => (
                <tr key={a.email}>
                  <td className="mono">{a.email}</td>
                  <td>{a.shows}</td>
                  <td>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={() => fillSample(a)}
                      disabled={locked || Boolean(account)}
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
        <h2>Statuses shown here</h2>
        <table className="metrics">
          <thead>
            <tr><th>Status</th><th>Means</th></tr>
          </thead>
          <tbody>
            <tr><td>{STATUS_LABELS.received}</td><td>We sent the return to the agency; it hasn't started processing.</td></tr>
            <tr><td>{STATUS_LABELS.processing}</td><td>The agency is validating and reviewing the return.</td></tr>
            <tr><td>{STATUS_LABELS.approved}</td><td>The agency confirmed the refund as filed and set a payment date.</td></tr>
            <tr><td>{STATUS_LABELS.sent}</td><td>The refund was paid as filed.</td></tr>
            <tr><td>{STATUS_LABELS.adjusted}</td><td>The refund was paid, for a different amount than claimed, with the reason.</td></tr>
            <tr><td>{STATUS_LABELS.accepted}</td><td>A return with no refund was accepted; any balance due is shown.</td></tr>
            <tr><td>{STATUS_LABELS.action_needed}</td><td>The agency needs something from the taxpayer before it can continue.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Security behaviors shown here</h2>
        <ul className="checks">
          <li>
            <strong>Uniform failures.</strong> An unknown email and a wrong password produce the same message, so a
            failed sign-in never confirms that an account exists.
          </li>
          <li>
            <strong>Constant response time.</strong> Every sign-in takes the same time whether or not it succeeds.
          </li>
          <li>
            <strong>Lockout.</strong> After {MAX_FAILURES} failed attempts, sign-in pauses for {LOCKOUT_SECONDS} seconds.
            In the real system this is enforced on the server, per account and per client.
          </li>
          <li>
            <strong>Masked output.</strong> Results show only the last four digits of the bank account, and never a tax
            ID.
          </li>
          <li>
            <strong>No data in URLs or storage.</strong> Nothing is put in the address bar or saved by the browser, and
            the password field is cleared after every attempt.
          </li>
        </ul>
        <p>
          See <Link to="/security">Security</Link> for the full set of controls.
        </p>
      </section>
    </>
  )
}
