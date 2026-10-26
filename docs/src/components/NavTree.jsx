import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function isOnPath(node, pathname) {
  return pathname === node.path || pathname.startsWith(node.path + '/')
}

function NavItem({ node, depth, onNavigate }) {
  const { pathname } = useLocation()
  const hasChildren = Boolean(node.children?.length)
  const containsActive = hasChildren && isOnPath(node, pathname)
  const [open, setOpen] = useState(containsActive)

  // Auto-expand the branch that holds the current page (e.g. on deep links).
  useEffect(() => {
    if (containsActive) setOpen(true)
  }, [containsActive])

  const groupId = `nav-group-${node.id}`

  return (
    <li>
      <div className="nav-row" style={{ '--depth': depth }}>
        {hasChildren ? (
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls={groupId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.title}`}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="nav-toggle-spacer" aria-hidden="true" />
        )}
        <NavLink
          to={node.path}
          end
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          onClick={() => {
            if (hasChildren) setOpen(true)
            onNavigate?.()
          }}
        >
          {node.title}
        </NavLink>
      </div>
      {hasChildren && open && (
        <ul id={groupId} className="nav-list">
          {node.children.map((child) => (
            <NavItem key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function NavTree({ nodes, onNavigate }) {
  return (
    <ul className="nav-list nav-root">
      {nodes.map((node) => (
        <NavItem key={node.id} node={node} depth={0} onNavigate={onNavigate} />
      ))}
    </ul>
  )
}
