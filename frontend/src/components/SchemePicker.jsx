import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { applyScheme, SCHEMES } from '../schemes.js'

// Picks the portal's color scheme for a signed-in user. It changes at once and is saved to their profile.
// Signed-out pages always use Evergreen, so there's no picker until sign-in.
export default function SchemePicker() {
  const { user, setUser } = useAuth()
  const [error, setError] = useState('')
  if (!user) return null

  async function change(e) {
    const previous = user.colorScheme
    const next = applyScheme(e.target.value)
    setError('')
    setUser({ ...user, colorScheme: next })
    try {
      await api('/me/color-scheme', { method: 'PUT', body: { colorScheme: next } })
    } catch (err) {
      // Put it back, so what's on screen matches what's saved.
      applyScheme(previous)
      setUser({ ...user, colorScheme: previous })
      setError(err.message)
    }
  }

  return (
    <label className="scheme-picker" title={error || 'Saved to your profile'}>
      <span className="sr-only">Color scheme</span>
      <span className="scheme-swatch" aria-hidden="true" />
      <select value={user.colorScheme} onChange={change} aria-invalid={error ? true : undefined}>
        {SCHEMES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}
