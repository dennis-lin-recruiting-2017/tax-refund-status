import { useEffect, useState } from 'react'
import { api, clockSkew, formatCountdown } from '../api.js'

// Shares one filed return with support for 5 minutes, ended early whenever the taxpayer likes. The server
// enforces the window; this countdown just shows it. skew corrects for the browser's clock.
export default function SupportAccess({ ret, skew = 0, onChange }) {
  const [grant, setGrant] = useState({ expiresAt: ret.supportAccessUntil, skew })
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Follow the dashboard's own refreshes, which only happen with new data from the server.
  useEffect(() => {
    setGrant({ expiresAt: ret.supportAccessUntil, skew })
  }, [ret.supportAccessUntil, skew])

  const left = grant.expiresAt ? new Date(grant.expiresAt).getTime() - (now + grant.skew) : 0
  const active = left > 0

  useEffect(() => {
    if (!grant.expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [grant.expiresAt])

  // While shared, check with the server now and then: support can end access early, and the countdown
  // should stop when they do.
  useEffect(() => {
    if (!active || !onChange) return
    const id = setInterval(onChange, 10000)
    return () => clearInterval(id)
  }, [active, onChange])

  // When the window runs out here, confirm with the server rather than trusting this clock.
  useEffect(() => {
    if (grant.expiresAt && left <= 0) onChange?.()
  }, [grant.expiresAt, left <= 0, onChange]) // eslint-disable-line react-hooks/exhaustive-deps

  async function change(method) {
    setBusy(true)
    setError('')
    try {
      const g = await api(`/returns/${ret.id}/support-access`, { method })
      setGrant({ expiresAt: g.expiresAt, skew: clockSkew(g.serverTime) })
      setNow(Date.now())
      onChange?.() // so the dashboard's copy agrees, and a later re-render can't bring back the old state
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`support-access${active ? ' active' : ''}`} aria-live="polite">
      <p className="small">
        {active ? (
          <>
            Support can see this return for <strong className="countdown">{formatCountdown(left)}</strong>.
          </>
        ) : (
          <span className="muted">
            Talking to support? Let them see this return for 5 minutes: its status, history, and figures, as you see them
            here. They can't change anything, and never see your full tax ID or bank account number.
          </span>
        )}
      </p>
      <div className="support-access-actions">
        {active ? (
          <>
            <button type="button" className="btn small" disabled={busy} onClick={() => change('DELETE')}>
              End access
            </button>
            <button type="button" className="btn small secondary" disabled={busy} onClick={() => change('POST')}>
              Restart 5 minutes
            </button>
          </>
        ) : (
          <button type="button" className="btn small secondary" disabled={busy} onClick={() => change('POST')}>
            Give support access
          </button>
        )}
      </div>
      {error && <p className="field-error small" role="alert">{error}</p>}
    </div>
  )
}
