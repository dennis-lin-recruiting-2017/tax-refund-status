import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, fileFirst, FORMS, formsFor, noReturnNotes } from '../api.js'
import { useAuth } from '../auth.jsx'
import ReturnCard, { FINAL_STATUSES } from '../components/ReturnCard.jsx'

const POLL_MS = 4000

export default function Dashboard() {
  const { user, setUser } = useAuth()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(location.state?.flash ?? '')

  const load = useCallback(async () => {
    try {
      setData(await api('/returns'))
      setError('')
    } catch (err) {
      if (err.status === 401) setUser(null)
      else setError(err.message)
    }
  }, [setUser])

  useEffect(() => {
    load()
  }, [load])

  // Poll only while a return is still moving through processing.
  const inFlight = data?.returns.some((r) => !FINAL_STATUSES.includes(r.status))
  useEffect(() => {
    if (!inFlight) return
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [inFlight, load])

  async function reset() {
    if (!window.confirm('Delete your demo returns so you can file again?')) return
    await api('/returns', { method: 'DELETE' })
    setFlash('')
    load()
  }

  const byForm = Object.fromEntries((data?.returns ?? []).map((r) => [r.form, r]))

  return (
    <div className="page">
      <p className="eyebrow">Tax year {data?.taxYear ?? 2025}</p>
      <h1>Hi, {user.fullName.split(' ')[0]}</h1>
      <p className="muted">
        Filing as {user.fullName} · Tax ID •••-••-{user.taxIdLast4}
      </p>

      {flash && (
        <div className="alert success" role="status">
          {flash}
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      {noReturnNotes(user).map((note) => (
        <p key={note} className="muted small">{note}</p>
      ))}

      {!data ? (
        <p className="loading">Loading your returns…</p>
      ) : (
        <div className="returns">
          {formsFor(user).map((id) => FORMS[id]).map((form) =>
            byForm[form.id] ? (
              <ReturnCard key={form.id} ret={byForm[form.id]} />
            ) : (
              <article key={form.id} className="panel return-card empty">
                <p className="eyebrow">{form.agency} · {data.taxYear}</p>
                <h2>{form.title}</h2>
                <p className="muted">{form.subtitle}. Not filed yet.</p>
                {fileFirst(user, form.id, Object.keys(byForm)).length > 0 && (
                  <p className="muted small">
                    File your {fileFirst(user, form.id, Object.keys(byForm)).join(' and ')} return first. This return
                    claims a credit for the tax charged there.
                  </p>
                )}
                <Link to={`/file/${form.id}`} className="btn">
                  File {form.title}
                </Link>
              </article>
            ),
          )}
        </div>
      )}

      {data?.returns.length > 0 && (
        <p className="reset">
          <button type="button" className="link-button" onClick={reset}>
            Reset demo returns
          </button>
        </p>
      )}
    </div>
  )
}
