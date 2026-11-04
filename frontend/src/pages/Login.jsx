import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const home = (u) => (u.role === 'admin' ? '/admin' : '/')
  if (user) return <Navigate to={location.state?.from ?? home(user)} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setPending(true)
    setError('')
    try {
      const signedIn = await login(email, password)
      navigate(location.state?.from ?? home(signedIn), { replace: true })
    } catch (err) {
      setError(err.message)
      setPassword('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="panel auth-panel">
        <h1>Sign in</h1>
        <p className="muted">File your returns and check your refund status.</p>
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="hint">
          Demo accounts: <code>tester00@test.com</code> to <code>tester09@test.com</code> (federal + California),{' '}
          <code>tester10@test.com</code> to <code>tester19@test.com</code> (federal + New York), and{' '}
          <code>admin@test.com</code>. The password for all of them is <code>test</code>.
        </p>
      </div>
    </div>
  )
}
