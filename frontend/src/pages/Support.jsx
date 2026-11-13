import { useCallback, useEffect, useState } from 'react'
import { api, clockSkew, filingStatusLabel, formatCountdown, RESIDENCY_LABELS } from '../api.js'
import SupportReturnDialog from '../components/SupportReturnDialog.jsx'

const POLL_MS = 10000

// Where a return stands, in the words the taxpayer sees. The chip colors come from the admin console.
const STATUS_LABELS = {
  received: 'Received',
  processing: 'Processing',
  action_needed: 'Action needed',
  approved: 'Approved',
  sent: 'Refund sent',
  adjusted: 'Refund adjusted',
  accepted: 'Accepted',
}

const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const day = (iso) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? '' : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, `
}

// A shared return's status, with a way to open it in full.
function ReturnStatus({ ret, onOpen }) {
  return (
    <span className="return-status">
      <span className={`chip ${ret.status}`}>{STATUS_LABELS[ret.status] ?? ret.status}</span>
      <span className="muted small">
        {ret.form} · {filingStatusLabel(ret.filingStatus)} · {ret.taxYear}
      </span>
      <button type="button" className="link-button small view-return" onClick={() => onOpen(ret.id)}>
        View return
      </button>
    </span>
  )
}

const NoAccess = () => <span className="chip no-access">No access</span>

// The state they live in, or "none" for someone who only works in other states.
function Residence({ states }) {
  const home = states.find((f) => f.residency === 'resident')
  const others = states.filter((f) => f !== home)
  return (
    <>
      <span>{home ? home.name : <span className="muted">No resident state</span>}</span>
      {others.map((f) => (
        <span key={f.state} className="muted small">
          {f.name} ({RESIDENCY_LABELS[f.residency]})
        </span>
      ))}
    </>
  )
}

// One line per state: the shared return, why there's no return, or no access.
function StateReturns({ user, shared, onOpen }) {
  const lines = user.states.map((f) => ({ key: f.state, name: f.name, incomeTax: f.incomeTax, ret: shared.find((r) => r.jurisdiction === f.state) }))
  for (const r of shared) {
    if (r.jurisdiction !== 'federal' && !lines.some((l) => l.key === r.jurisdiction)) lines.push({ key: r.jurisdiction, name: r.jurisdiction, incomeTax: true, ret: r })
  }
  if (lines.length === 0) return <span className="muted small">Federal only</span>
  return lines.map((l) => (
    <span key={l.key} className="state-line">
      <span className="state-name">{l.name}</span>
      {!l.incomeTax ? <span className="muted small">No income tax, no return needed</span> : l.ret ? <ReturnStatus ret={l.ret} onOpen={onOpen} /> : <NoAccess />}
    </span>
  ))
}

const ENDED_BY = { taxpayer: 'ended by taxpayer', support: 'ended by support' }

// Recent grants, newest first: active ones count down and can be ended; the rest say how and when they ended.
function AccessLog({ entries, leftUntil, onEnd, ending }) {
  if (entries.length === 0) return <span className="muted small">None this week</span>
  return (
    <ul className="access-log">
      {entries.map((e) => {
        const left = leftUntil(e.expiresAt)
        const live = !e.revokedAt && left > 0
        return (
          <li key={e.grantedAt}>
            <span className="form">{e.form}</span>
            <span className="muted">
              {day(e.grantedAt)}
              {clock(e.grantedAt)}
              {!live && `–${clock(e.revokedAt ?? e.expiresAt)}`}
            </span>
            {live ? (
              <>
                <span className={`chip timer${left < 60000 ? ' ending' : ''}`}>{formatCountdown(left)} left</span>
                <button type="button" className="link-button small end-access" disabled={ending === e.returnId} onClick={() => onEnd(e.returnId)}>
                  End access
                </button>
              </>
            ) : (
              <span className="muted">{e.revokedAt ? ENDED_BY[e.revokedBy] ?? 'ended' : 'expired'}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const matches = (u, q) =>
  !q || [u.name, u.email, ...u.states.map((f) => f.name), ...u.states.map((f) => f.state)].some((v) => v.toLowerCase().includes(q))

export default function Support() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [now, setNow] = useState(Date.now())
  const [openId, setOpenId] = useState(null) // the return shown in the dialog
  const [ending, setEnding] = useState(null) // the return whose access is being ended

  const load = useCallback(async () => {
    try {
      const d = await api('/support/users')
      setData({ ...d, skew: clockSkew(d.serverTime) })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // Ends a taxpayer's grant early. The server is the record; the list is reloaded either way.
  const endAccess = useCallback(
    async (returnId) => {
      setEnding(returnId)
      try {
        await api(`/support/returns/${returnId}/access`, { method: 'DELETE' })
        setError('')
      } catch (err) {
        if (err.status !== 404) setError(err.message) // 404: it had already ended
      } finally {
        setEnding(null)
        load()
      }
    },
    [load],
  )

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Milliseconds until a time, on the server's clock.
  const leftUntil = (iso) => (iso && data ? new Date(iso).getTime() - (now + data.skew) : 0)
  // Shared returns whose window hasn't run out on this screen yet.
  const sharedOf = (u) => u.returns.filter((r) => leftUntil(r.accessUntil) > 0)

  // The moment any window runs out, its return is hidden; then ask the server again.
  const expired = data?.users.some((u) => u.returns.some((r) => leftUntil(r.accessUntil) <= 0))
  useEffect(() => {
    if (expired) load()
  }, [expired, load])

  const q = query.trim().toLowerCase()
  const users = data ? data.users.filter((u) => matches(u, q)) : []
  const sharing = data ? data.users.filter((u) => sharedOf(u).length > 0).length : 0

  return (
    <div className="page support">
      <p className="eyebrow">Support</p>
      <h1>Taxpayers</h1>
      <p className="muted">
        Every taxpayer and where they live. You see a return only while its taxpayer is sharing it: they choose{' '}
        <strong>Give support access</strong> on that return, for 5 minutes at a time, and can end it early. Every grant
        is in the access log. Choose <strong>View return</strong> to open a shared return as the taxpayer sees it, and{' '}
        <strong>End access</strong> once you're done with it. What you see is read-only and recorded in the audit log.
      </p>

      <label className="field search">
        <span className="sr-only">Search taxpayers</span>
        <input type="search" placeholder="Search by name, email, or state" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <p className="loading">Loading taxpayers…</p>
      ) : (
        <>
          <p className="muted small">
            {q ? `${users.length} of ${data.users.length}` : data.users.length} taxpayer{data.users.length === 1 ? '' : 's'} ·{' '}
            {sharing === 0 ? 'none sharing a return right now' : `${sharing} sharing a return`}
          </p>
          {users.length === 0 ? (
            <p className="muted">No taxpayer matches that search.</p>
          ) : (
            <div className="table-wrap panel">
              <table className="support-table">
                <thead>
                  <tr>
                    <th scope="col">Taxpayer</th>
                    <th scope="col">Residence</th>
                    <th scope="col">Federal return</th>
                    <th scope="col">State returns</th>
                    <th scope="col">Access log</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const shared = sharedOf(u)
                    const federal = shared.find((r) => r.jurisdiction === 'federal')
                    return (
                      <tr key={u.id} className={shared.length ? 'shared' : undefined}>
                        <td>
                          <span className="cell-stack">
                            <strong>{u.name}</strong>
                            <span className="muted small">{u.email}</span>
                          </span>
                        </td>
                        <td>
                          <span className="cell-stack">
                            <Residence states={u.states} />
                          </span>
                        </td>
                        <td>{federal ? <ReturnStatus ret={federal} onOpen={setOpenId} /> : <NoAccess />}</td>
                        <td>
                          <span className="cell-stack">
                            <StateReturns user={u} shared={shared} onOpen={setOpenId} />
                          </span>
                        </td>
                        <td>
                          <AccessLog entries={u.accessLog} leftUntil={leftUntil} onEnd={endAccess} ending={ending} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.users.length >= data.limit && <p className="muted small">Showing the first {data.limit} taxpayers.</p>}
        </>
      )}
      {openId && <SupportReturnDialog key={openId} returnId={openId} onClose={() => setOpenId(null)} onEnd={endAccess} />}
    </div>
  )
}
