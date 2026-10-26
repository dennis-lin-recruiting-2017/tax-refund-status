import { Link, useLocation } from 'react-router-dom'
import { flatten } from '../navigation.js'

const entries = flatten()

export function Step({ n, title, children }) {
  return (
    <section>
      <h2 className="step-title">
        {n && (
          <span className="step-num" aria-hidden="true">
            {n}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

// A guide is a parent page plus its sub-pages, read in nav order.
function guideFor(pathname) {
  const entry = entries.find((e) => e.node.path === pathname)
  if (!entry) return null
  const root = entry.node.children?.length ? entry.node : entry.ancestors.at(-1)
  if (!root?.children) return null
  const pages = [root, ...root.children]
  return { root, pages, index: pages.findIndex((p) => p.path === pathname) }
}

/** Lists a guide's sub-pages with their summaries. Use on the parent page. */
export function GuideContents() {
  const guide = guideFor(useLocation().pathname)
  if (!guide) return null
  return (
    <section>
      <h2>In this section</h2>
      <ol className="guide-contents">
        {guide.root.children.map((c) => (
          <li key={c.id}>
            <Link to={c.path}>{c.title}</Link>
            {c.summary && <span>{c.summary}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Previous / next links between the pages of a guide. */
export function GuideNav() {
  const guide = guideFor(useLocation().pathname)
  if (!guide) return null
  const prev = guide.pages[guide.index - 1]
  const next = guide.pages[guide.index + 1]
  return (
    <nav className="guide-nav" aria-label="Guide pages">
      {prev ? (
        <Link to={prev.path} className="guide-prev">
          <small>Previous</small>
          {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to={next.path} className="guide-next">
          <small>Next</small>
          {next.title}
        </Link>
      )}
    </nav>
  )
}
