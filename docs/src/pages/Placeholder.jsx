import { Link } from 'react-router-dom'

export default function Placeholder({ node }) {
  return (
    <>
      <h1>{node.title}</h1>
      <p className="lede">This section hasn't been written yet.</p>
      {node.children?.length > 0 && (
        <>
          <h2>In this section</h2>
          <ul className="child-links">
            {node.children.map((c) => (
              <li key={c.id}>
                <Link to={c.path}>{c.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
