import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Admin from './pages/Admin.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FileReturn from './pages/FileReturn.jsx'
import Login from './pages/Login.jsx'

function RequireAuth({ children, admin = false }) {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) return <p className="loading">Loading…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // Admins operate the demo and don't file returns; taxpayers never see the admin console.
  const isAdmin = user.role === 'admin'
  if (admin && !isAdmin) return <Navigate to="/" replace />
  if (!admin && isAdmin) return <Navigate to="/admin" replace />
  return children
}

function Header() {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Refund Portal
      </Link>
      {user && (
        <div className="topbar-user">
          {user.role === 'admin' && <span className="badge">Admin</span>}
          <span className="topbar-name">{user.fullName}</span>
          <button type="button" className="btn small secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
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
          <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">Demo system with sample data only. Not affiliated with any tax agency.</footer>
    </>
  )
}
