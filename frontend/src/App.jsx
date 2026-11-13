import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from './auth.jsx'
import Admin from './pages/Admin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FileReturn from './pages/FileReturn.jsx'
import Login from './pages/Login.jsx'
import Support from './pages/Support.jsx'
import SchemePicker from './components/SchemePicker.jsx'

// Each page belongs to one role. Admins and support agents don't file returns, and taxpayers never
// see the staff pages; anyone on another role's page is sent to their own home.
function RequireAuth({ children, role = 'taxpayer' }) {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) return <p className="loading">Loading…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />
  return children
}

const ROLE_BADGES = { admin: 'Admin', support: 'Support' }

function Header() {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Refund Portal
      </Link>
      <div className="topbar-user">
        <SchemePicker />
        {user && (
          <>
            {ROLE_BADGES[user.role] && <span className="badge">{ROLE_BADGES[user.role]}</span>}
            <span className="topbar-name">{user.fullName}</span>
            <button type="button" className="btn small secondary" onClick={logout}>
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <main className="main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/file/:form" element={<RequireAuth><FileReturn /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth role="admin"><Admin /></RequireAuth>} />
          <Route path="/support" element={<RequireAuth role="support"><Support /></RequireAuth>} />          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">Demo system with sample data only. Not affiliated with any tax agency.</footer>
    </>
  )
}
