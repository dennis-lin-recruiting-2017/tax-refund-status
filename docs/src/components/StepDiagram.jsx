import { useState } from 'react'
import { Demo, Planned } from './Flowchart.jsx'

// Interactive diagram with walkthroughs, styled with the .arch-* classes. Select a component to see its details,
// or pick a walkthrough to step through a flow; each step highlights its edges (and their end nodes) plus any extra
// nodes it names.
//
// nodes:  { id: { x, y, w, h, kind?, planned?, title, sub, meta?, points: [text | [badge, text]], alerts? } }
// edges:  [{ id, from, to, d, dashed?, trace?, planned?, label?, lx?, ly?, anchor? }]
// flows:  [{ id, title, steps: [{ edges?: [ids], nodes?: [ids], text }] }]
// renderExtra({ flow, step }) adds content under the panel text, such as a span waterfall.

function Points({ points }) {
  return (
    <ul>
      {points.map((p) => {
        const [badge, text] = Array.isArray(p) ? p : [null, p]
        return <li key={text}>{badge === 'demo' ? <Demo /> : badge === 'planned' ? <Planned /> : null} {text}</li>
      })}
    </ul>
  )
}

function Node({ id, n, state, onSelect }) {
  const { x, y, w, h, kind = 'service', title, sub, planned } = n
  const cx = x + w / 2
  return (
    <g
      className={`arch-node ${kind}${planned ? ' planned' : ''} ${state}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}: ${sub}`}
      aria-pressed={state === 'selected'}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) }
      }}
    >
      <rect x={x} y={y} width={w} height={h} rx={kind === 'store' ? 14 : 8} />
      {planned && <text x={x + w - 8} y={y + 13} className="arch-tag">PLANNED</text>}
      <text x={cx} y={y + h / 2 - 3} className="arch-title">{title}</text>
      <text x={cx} y={y + h / 2 + 15} className="arch-sub">{sub}</text>
    </g>
  )
}

export default function StepDiagram({ id, nodes, edges, flows, width = 760, height, label, hint, toolbarExtra, renderExtra, decorations }) {
  const [selected, setSelected] = useState(null)
  const [flowId, setFlowId] = useState(null)
  const [step, setStep] = useState(0)

  const flow = flows.find((f) => f.id === flowId)
  const current = flow?.steps[Math.min(step, flow.steps.length - 1)]

  const selectFlow = (fid) => {
    setSelected(null)
    setStep(0)
    setFlowId((cur) => (cur === fid ? null : fid))
  }
  const selectNode = (nid) => {
    setFlowId(null)
    setSelected((cur) => (cur === nid ? null : nid))
  }
  const reset = () => { setFlowId(null); setSelected(null) }

  let activeEdges = []
  const activeNodes = new Set()
  if (current) {
    activeEdges = current.edges ?? []
    for (const e of edges) if (activeEdges.includes(e.id)) { activeNodes.add(e.from); activeNodes.add(e.to) }
    for (const n of current.nodes ?? []) activeNodes.add(n)
  } else if (selected) {
    activeEdges = edges.filter((e) => e.from === selected || e.to === selected).map((e) => e.id)
    for (const e of edges) if (activeEdges.includes(e.id)) { activeNodes.add(e.from); activeNodes.add(e.to) }
    activeNodes.add(selected)
  }
  const focused = Boolean(current || selected)
  const nodeState = (nid) => {
    if (!focused) return ''
    if (nid === selected) return 'selected'
    return activeNodes.has(nid) ? 'active' : 'dim'
  }
  const node = selected && nodes[selected]

  return (
    <figure className="arch">
      <div className="arch-toolbar" role="group" aria-label="Walk through a flow">
        <span className="arch-toolbar-label">Walk through:</span>
        {flows.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`arch-chip${flowId === f.id ? ' on' : ''}`}
            aria-pressed={flowId === f.id}
            onClick={() => selectFlow(f.id)}
          >
            {f.title}
          </button>
        ))}
        {focused && <button type="button" className="arch-chip reset" onClick={reset}>Clear</button>}
        {toolbarExtra}
      </div>

      <div className="arch-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="arch-arrowhead" />
            </marker>
            <marker id={`${id}-arrow-on`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="arch-arrowhead on" />
            </marker>
          </defs>
          {decorations}
          {edges.map((e) => {
            const on = activeEdges.includes(e.id)
            const cls = ['arch-edge', e.dashed && 'dashed', e.trace && 'trace', e.planned && 'planned', on && 'on', focused && !on && 'dim']
            return (
              <g key={e.id}>
                <path d={e.d} className={cls.filter(Boolean).join(' ')} markerEnd={`url(#${id}-arrow${on ? '-on' : ''})`} />
                {on && e.label && (
                  <text x={e.lx} y={e.ly} className="arch-edge-label" textAnchor={e.anchor ?? 'middle'}>{e.label}</text>
                )}
              </g>
            )
          })}
          {Object.entries(nodes).map(([nid, n]) => (
            <Node key={nid} id={nid} n={n} state={nodeState(nid)} onSelect={selectNode} />
          ))}
        </svg>
      </div>

      <div className="arch-panel" aria-live="polite">
        {current ? (
          <>
            <p className="arch-panel-kicker">{flow.title} · step {step + 1} of {flow.steps.length}</p>
            <p className="arch-panel-text">{current.text}</p>
            {renderExtra?.({ flow, step })}
            <div className="arch-stepper">
              <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>← Back</button>
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={step === flow.steps.length - 1}>Next →</button>
            </div>
          </>
        ) : node ? (
          <>
            <p className="arch-panel-kicker">{node.meta ?? node.sub}</p>
            <h3>{node.title}</h3>
            <Points points={node.points} />
            {node.alerts?.length > 0 && (
              <>
                <p className="zt-holds-label">Alerts that use it</p>
                <div className="sd-alerts">{node.alerts.map((a) => <span key={a}>{a}</span>)}</div>
              </>
            )}
          </>
        ) : (
          <p className="arch-panel-hint">{hint}</p>
        )}
      </div>
    </figure>
  )
}
