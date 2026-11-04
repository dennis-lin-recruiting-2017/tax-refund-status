import { useState } from 'react'

// Interactive flowchart. The main path runs down the left column and exceptions branch right. Selecting a
// step shows its detail in a panel beside the chart (or pinned to the bottom of the screen when narrow);
// Back/Next walk the main path.
//
// nodes: { id: { kind, title, kicker, points: [[badge, text]], x/y/w/h or cx/cy/rx/ry for decisions } }
//   kind: terminal | step | decision | neutral | danger | success; badge: 'demo' | 'planned' | null
// edges: [{ from, to, d, label?, lx?, ly?, anchor? }]
// path:  node ids on the main path, in order

export const Demo = () => <span className="state done">Demo</span>
export const Planned = () => <span className="state planned">Planned</span>

function FlowNode({ id, n, state, onSelect }) {
  const decision = n.kind === 'decision'
  const cx = decision ? n.cx : n.x + n.w / 2
  const cy = decision ? n.cy : n.y + n.h / 2
  const pill = n.kind === 'terminal' || n.kind === 'success'
  return (
    <g
      className={`idflow-node ${n.kind} ${state}`}
      role="button"
      tabIndex={0}
      aria-label={`${n.title}: ${n.kicker}`}
      aria-pressed={state === 'selected'}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) }
      }}
    >
      {decision ? (
        <polygon points={`${cx},${cy - n.ry} ${cx + n.rx},${cy} ${cx},${cy + n.ry} ${cx - n.rx},${cy}`} />
      ) : (
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={pill ? n.h / 2 : 8} />
      )}
      <text x={cx} y={cy + 5} className="idflow-title">{n.title}</text>
    </g>
  )
}

export function Flowchart({ id, nodes, edges, path, height, label, hint }) {
  const [selected, setSelected] = useState(null)
  const select = (key) => setSelected((cur) => (cur === key ? null : key))
  const node = selected && nodes[selected]
  const pathIndex = path.indexOf(selected)
  // An exception returns to the main-path step it branched from.
  const branchedFrom = edges.find((e) => e.to === selected && path.includes(e.from))?.from
  const near = new Set(selected ? [selected] : [])
  const activeEdges = new Set()
  edges.forEach((e, i) => {
    if (e.from === selected || e.to === selected) { activeEdges.add(i); near.add(e.from); near.add(e.to) }
  })
  const nodeState = (key) => (!selected ? '' : key === selected ? 'selected' : near.has(key) ? 'active' : 'dim')

  return (
    <figure className="idflow-wrap">
      <div className="idflow">
        <div className="idflow-canvas">
          <svg viewBox={`0 0 464 ${height}`} role="group" aria-labelledby={`${id}-title`}>
            <title id={`${id}-title`}>{label}</title>
            <defs>
              <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className="idflow-head" />
              </marker>
              <marker id={`${id}-arrow-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className="idflow-head on" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const on = activeEdges.has(i)
              return (
                <g key={e.d} className={`idflow-edge-group${on ? ' on' : selected ? ' dim' : ''}`}>
                  <path d={e.d} className="idflow-edge" markerEnd={`url(#${id}-arrow${on ? '-on' : ''})`} />
                  {e.label && <text x={e.lx} y={e.ly} className="idflow-label" textAnchor={e.anchor ?? 'start'}>{e.label}</text>}
                </g>
              )
            })}
            {Object.entries(nodes).map(([key, n]) => (
              <FlowNode key={key} id={key} n={n} state={nodeState(key)} onSelect={select} />
            ))}
          </svg>
        </div>

        <div className="idflow-panel" aria-live="polite">
          {node ? (
            <>
              <p className="arch-panel-kicker">{node.kicker}</p>
              <h3>{node.title}</h3>
              <ul>
                {node.points.map(([badge, text]) => (
                  <li key={text}>{badge === 'demo' ? <Demo /> : badge === 'planned' ? <Planned /> : null} {text}</li>
                ))}
              </ul>
              <div className="arch-stepper">
                {pathIndex >= 0 ? (
                  <>
                    <button type="button" onClick={() => setSelected(path[pathIndex - 1])} disabled={pathIndex === 0}>← Back</button>
                    <button type="button" onClick={() => setSelected(path[pathIndex + 1])} disabled={pathIndex === path.length - 1}>Next →</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setSelected(branchedFrom ?? path[0])}>Back to the main path</button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="arch-panel-hint">
                {hint ?? 'Select any step for what happens there and what the demo does today. Exceptions branch to the right.'}
              </p>
              <div className="arch-stepper">
                <button type="button" onClick={() => setSelected(path[0])}>Walk through it →</button>
              </div>
            </>
          )}
        </div>
      </div>
    </figure>
  )
}
