import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NavTree from './components/NavTree.jsx'
import { flatten, navTree } from './navigation.js'
import Overview from './pages/Overview.jsx'
import Placeholder from './pages/Placeholder.jsx'
import { securityPages } from './pages/Security.jsx'
import Demo from './pages/Demo.jsx'
import Capacity from './pages/Capacity.jsx'
import ApiGateway from './pages/ApiGateway.jsx'
import { functionalPages } from './pages/FunctionalRequirements.jsx'
import SecurityRequirements from './pages/SecurityRequirements.jsx'
import { batchSyncPages } from './pages/BatchSync.jsx'
import Tracing from './pages/Tracing.jsx'
import { operationsPages } from './pages/Operations.jsx'
import { predictionPages } from './pages/Prediction.jsx'
import { attackSurfacePages } from './pages/AttackSurfaces.jsx'
import AdminConsole from './pages/AdminConsole.jsx'
import HighLevelDesign from './pages/HighLevelDesign.jsx'
import { localDevelopmentPages } from './pages/LocalDevelopment.jsx'
import { localKubernetesPages } from './pages/LocalKubernetes.jsx'

// Pages that have real content. Everything else in the nav renders a placeholder.
const pages = {
  overview: Overview,
  ...functionalPages,
  ...securityPages,
  demo: Demo,
  capacity: Capacity,
  gateway: ApiGateway,
  'security-requirements': SecurityRequirements,
  tracing: Tracing,
  ...operationsPages,
  ...predictionPages,
  ...attackSurfacePages,
  'admin-console': AdminConsole,
  'high-level': HighLevelDesign,
  ...batchSyncPages,
  ...localKubernetesPages,
  ...localDevelopmentPages,
}

const entries = flatten()

function Breadcrumbs({ ancestors, node }) {
  if (!ancestors.length) return null
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {ancestors.map((a) => (
        <span key={a.id}>
          <Link to={a.path}>{a.title}</Link>
          <span className="sep" aria-hidden="true">/</span>
        </span>
      ))}
      <span aria-current="page">{node.title}</span>
    </nav>
  )
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className={`layout${navOpen ? ' nav-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="menu-button"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <Link to="/overview" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Refund Status <span className="brand-sub">System Design</span>
        </Link>
      </header>

      <aside className="sidebar" aria-label="Sections">
        <NavTree nodes={navTree} onNavigate={() => setNavOpen(false)} />
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          {entries.map(({ node, ancestors }) => {
            const Page = pages[node.id]
            return (
              <Route
                key={node.id}
                path={node.path}
                element={
                  <article className="page">
                    <Breadcrumbs ancestors={ancestors} node={node} />
                    {Page ? <Page /> : <Placeholder node={node} />}
                  </article>
                }
              />
            )
          })}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  )
}
