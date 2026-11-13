import { useCallback, useEffect, useRef, useState } from 'react'
import { api, clockSkew, formatCountdown } from '../api.js'
import ReturnCard from './ReturnCard.jsx'

const REFRESH_MS = 10000

// A shared return in full, as its taxpayer sees it, for a support agent. It's only open while the
// taxpayer's grant lasts: the server refuses once it ends, and the countdown here ends with it.
export default function SupportReturnDialog({ returnId, onClose, onEnd }) {
  const dialogRef = useRef(null)
  const [data, setData] = useState(null)
  const [ended, setEnded] = useState(false) // false, 'expired', or 'by-support'
  const [ending, setEnding] = useState(false)

  // Ends the grant now, clears the return from the screen, and leaves the dialog open saying so.
  async function endAccess() {
    setEnding(true)
    await onEnd(returnId)
    setEnding(false)
    setEnded('by-support')
    setData(null)
  }
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      const d = await api(`/support/returns/${returnId}`)
      setData({ ...d, skew: clockSkew(d.serverTime) })
      setError('')
    } catch (err) {
      if (err.status === 404) {
        setEnded((e) => e || 'expired')
        setData(null) // don't leave the return on screen once access is gone
      } else setError(err.message)
    }
  }, [returnId])

  // Open as a modal: the rest of the page is inert, focus moves in, and Esc closes it. There's no cleanup
  // that closes it, because closing fires onClose; unmounting removes the dialog anyway.
  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal()
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const until = data?.return.supportAccessUntil
  const left = until ? new Date(until).getTime() - (now + data.skew) : 0

  // The moment the window runs out, hide the return; then confirm with the server.
  useEffect(() => {
    if (data && left <= 0) {
      setEnded('expired')
      setData(null)
    }
  }, [data, left])

  return (
    <dialog
      ref={dialogRef}
      className="return-dialog"
      aria-labelledby="return-dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()} // click on the backdrop
    >
      <header className="return-dialog-head">
        <div>
          <p className="eyebrow">Shared by the taxpayer · read-only</p>
          <h2 id="return-dialog-title">{data ? data.taxpayer.name : ended ? 'Access ended' : 'Loading…'}</h2>
          {data && <p className="muted small">{data.taxpayer.email}</p>}
        </div>
        <div className="return-dialog-actions">
          {data && <span className={`chip timer${left < 60000 ? ' ending' : ''}`}>{formatCountdown(left)} left</span>}
          {data && (
            <button type="button" className="btn small" disabled={ending} onClick={endAccess}>
              End access
            </button>
          )}
          <button type="button" className="btn small secondary" onClick={() => dialogRef.current.close()} autoFocus>
            Close
          </button>
        </div>
      </header>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {ended ? (
        <p className="muted return-dialog-ended" role="status">
          {ended === 'by-support'
            ? "You ended access to this return, so it's no longer shown. The taxpayer can share it again if you need it."
            : "The taxpayer's access grant for this return has ended, so it's no longer shown."}{' '}
          {ended !== 'by-support' && (
            <>
              Ask them to choose <strong>Give support access</strong> on the return again if you still need it.
            </>
          )}
        </p>
      ) : data ? (
        <ReturnCard ret={data.return} showSupportAccess={false} />
      ) : (
        !error && <p className="loading">Loading the return…</p>
      )}
    </dialog>
  )
}
