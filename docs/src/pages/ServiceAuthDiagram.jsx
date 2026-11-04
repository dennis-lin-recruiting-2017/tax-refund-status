import { useState } from 'react'
import { Demo, Planned } from '../components/Flowchart.jsx'

// Interactive zero-trust view of service-to-service calls. "Connections" explains each call and component;
// "If compromised" highlights what an attacker who takes over one workload could reach. Both modes can show
// the demo as it runs today or the proposed controls.

const NODES = {
  internet: {
    kind: 'actor', x: 20, y: 180, w: 110, h: 56, title: 'Internet', sub: 'taxpayers · staff',
    points: [
      [null, 'Taxpayers and staff in their browsers. In the compromise view it also stands for anywhere a pod could send data.'],
    ],
  },
  portal: {
    x: 170, y: 180, w: 120, h: 56, title: 'Portal', sub: 'nginx :8080',
    points: [
      ['demo', 'The only pod reachable from outside. It serves the app and proxies /api to the API.'],
      ['demo', 'Holds no secrets.'],
      ['planned', 'TLS and a web application firewall at the edge in front of it.'],
      ['planned', 'Its own workload certificate, the only identity the API accepts requests from.'],
    ],
  },
  api: {
    x: 340, y: 180, w: 120, h: 56, title: 'API', sub: 'taxrefund serve',
    points: [
      ['demo', "Checks the taxpayer's session and limits every query to that taxpayer."],
      ['demo', 'Loads the whole shared secret: database password, bank fingerprint key, and both agency keys.'],
      ['planned', 'Its own short-lived database credential and the demo admin key, nothing else.'],
      ['planned', "The taxpayer's identity stops here. Downstream services act as themselves. If the status service is split out, the API passes a short-lived signed token, so that service can't be tricked into acting for someone else."],
    ],
  },
  processor: {
    x: 340, y: 30, w: 120, h: 56, title: 'Processor', sub: 'screen + file',
    points: [
      ['demo', 'Loads the whole shared secret, including the agency admin key it never uses.'],
      ['planned', 'Its own database credential, limited to the filing queue and screening data, and per-agency e-file credentials.'],
    ],
  },
  batch: {
    x: 340, y: 320, w: 120, h: 56, title: 'Batch jobs', sub: 'CronJobs',
    points: [
      ['demo', 'Loads the whole shared secret, including the agency admin key it never uses.'],
      ['planned', 'Its own database credential, limited to status fields and batch runs, and per-agency status-read credentials.'],
    ],
  },
  agencies: {
    kind: 'external', x: 580, y: 30, w: 150, h: 70, title: 'Agency mocks', sub: 'IRS · CA · NY :9100',
    points: [
      ['demo', 'Accept any pod labeled agency-client. One bearer key works for all three agencies, plus a separate admin key, both compared in constant time.'],
      ['demo', "The mocks use the app's own database login, in a separate schema."],
      ['planned', "Real agencies issue credentials per agency, each held only by the workload that needs it. Agency traffic leaves through an egress gateway that allows only the agencies' hostnames."],
    ],
  },
  postgres: {
    kind: 'store', x: 580, y: 175, w: 150, h: 66, title: 'Postgres', sub: 'pgvector :5432',
    points: [
      ['demo', 'Accepts any pod labeled db-client, on one shared login, with encryption off (sslmode=disable).'],
      ['planned', 'TLS required, and one role per service with only the grants it needs. The audit log is insert-only.'],
      ['planned', 'Short-lived passwords issued per workload by a secrets manager such as Vault.'],
    ],
  },
  jaeger: {
    x: 580, y: 330, w: 150, h: 56, title: 'Jaeger', sub: 'OTLP :4318',
    points: [
      ['demo', 'Accepts traces from any pod in the namespace, over plain HTTP.'],
      ['planned', 'Mutual TLS, spans scrubbed of personal data, and the UI behind staff SSO.'],
    ],
  },
}

const EDGES = [
  {
    id: 'in-po', from: 'internet', to: 'portal', d: 'M130 208 H170', title: 'Internet → portal', purpose: 'Serve the app, proxy /api',
    today: 'The only pod reachable from outside, on port 8080.',
    proposed: 'TLS and a web application firewall at the edge. The portal stays the single public entry.',
  },
  {
    id: 'po-api', from: 'portal', to: 'api', d: 'M290 208 H340', weak: true, title: 'Portal → API', purpose: 'Taxpayer and admin requests',
    today: 'Network policy allows only portal pods. Plain HTTP; the user is authenticated by session cookie at the API.',
    proposed: "Mutual TLS with the portal's workload identity. The user's session is still checked at the API.",
  },
  {
    id: 'api-db', from: 'api', to: 'postgres', d: 'M460 208 H580', weak: true, title: 'API → Postgres', purpose: 'Sessions, returns, audit log',
    today: 'Any pod labeled db-client, on one shared login, with encryption off.',
    proposed: "TLS required. The API's own role, with insert-only access to the audit log.",
  },
  {
    id: 'pr-db', from: 'processor', to: 'postgres', d: 'M460 72 C525 72 525 195 580 195', weak: true, title: 'Processor → Postgres', purpose: 'Claim and screen filings',
    today: 'The same shared login and plaintext connection.',
    proposed: 'Its own role, limited to the filing queue and screening data.',
  },
  {
    id: 'ba-db', from: 'batch', to: 'postgres', d: 'M460 348 C525 348 525 225 580 225', weak: true, title: 'Batch → Postgres', purpose: 'Record new statuses',
    today: 'The same shared login and plaintext connection.',
    proposed: 'Its own role, limited to status fields and batch run records.',
  },
  {
    id: 'pr-ag', from: 'processor', to: 'agencies', d: 'M460 52 H580', weak: true, title: 'Processor → agency e-file', purpose: 'Transmit returns',
    today: 'Any pod labeled agency-client, with one bearer key shared by all three agencies.',
    proposed: 'Separate credentials per agency, held only by the processor and allowed only to file.',
  },
  {
    id: 'ba-ag', from: 'batch', to: 'agencies', d: 'M400 376 V404 H748 V65 H730', weak: true, title: 'Batch → agency status', purpose: 'Bulk status checks',
    today: 'The same shared key.',
    proposed: 'Separate per-agency credentials, allowed only to read status.',
  },
  {
    id: 'api-ag', from: 'api', to: 'agencies', d: 'M430 180 V128 H612 V100', weak: true, title: 'API → agency admin', purpose: 'Admin status overrides (demo only)',
    today: 'A separate admin key, but every workload loads it.',
    proposed: 'Only the API holds it. Real agencies have no such endpoint, so production drops it.',
  },
  {
    id: 'ag-db', from: 'agencies', to: 'postgres', d: 'M690 100 V175', weak: true, title: 'Agency mocks → Postgres', purpose: "The mocks' own schema",
    today: 'The same login as the app, in a separate schema.',
    proposed: "A separate database. The mocks stand in for outside systems and shouldn't share ours.",
  },
  {
    id: 'traces', ends: ['portal', 'api', 'processor', 'batch', 'jaeger'], trace: true, weak: true,
    d: 'M340 58 H312 V300 M230 236 V300 M390 236 V300 M390 320 V300 M230 300 H655 V330',
    title: 'Everything → Jaeger', purpose: 'Traces',
    today: 'Any pod in the namespace, over plain HTTP.',
    proposed: 'Mutual TLS, with spans scrubbed of personal data.',
  },
]

const ends = (e) => e.ends ?? [e.from, e.to]

const SHARED_SECRET = [
  "Database password with full access to every table, including the agency mocks' schema",
  'Bank fingerprint HMAC key',
  'Agency API key, valid at all three agencies',
  'Agency admin key',
]

const REACH = {
  portal: {
    today: {
      nodes: ['api', 'jaeger', 'internet'], edges: ['po-api', 'traces'], holds: ['No secrets'],
      note: 'Outbound traffic is unrestricted, so it can also send data anywhere on the internet.',
    },
    proposed: {
      nodes: ['api', 'jaeger'], edges: ['po-api', 'traces'], holds: ['No secrets'],
      note: 'Only the API, over mutual TLS, and traces. Nothing outside the cluster.',
    },
  },
  api: {
    today: {
      nodes: ['postgres', 'agencies', 'jaeger', 'internet'], edges: ['api-db', 'api-ag', 'traces'], holds: SHARED_SECRET,
      note: 'It can read and change every return, file or check status at any agency, override statuses, and send data anywhere.',
    },
    proposed: {
      nodes: ['postgres', 'agencies', 'jaeger'], edges: ['api-db', 'api-ag', 'traces'],
      holds: ['Its own short-lived database credential: its tables only, audit log insert-only', 'The demo-only agency admin key'],
      note: 'No outbound internet, and no filing or status credentials.',
    },
  },
  processor: {
    today: {
      nodes: ['postgres', 'agencies', 'jaeger', 'internet'], edges: ['pr-db', 'pr-ag', 'traces'], holds: SHARED_SECRET,
      note: 'Everything the API can do, including changing statuses at the agencies with an admin key the processor never needs.',
    },
    proposed: {
      nodes: ['postgres', 'agencies', 'jaeger'], edges: ['pr-db', 'pr-ag', 'traces'],
      holds: ['Its own database credential: filing queue and screening data', 'Per-agency e-file credentials'],
      note: 'It can file returns, but not read sessions, change statuses, or reach the internet.',
    },
  },
  batch: {
    today: {
      nodes: ['postgres', 'agencies', 'jaeger', 'internet'], edges: ['ba-db', 'ba-ag', 'traces'], holds: SHARED_SECRET,
      note: 'The same reach as the API. The shared secret makes every workload equivalent.',
    },
    proposed: {
      nodes: ['postgres', 'agencies', 'jaeger'], edges: ['ba-db', 'ba-ag', 'traces'],
      holds: ['Its own database credential: status fields and batch runs', 'Per-agency status-read credentials'],
      note: 'It can read statuses at the agencies and record them, nothing more.',
    },
  },
}

const SUMMARY = {
  today: [
    'Network policies deny incoming traffic by default and allow the pairs shown, keyed on pod labels. Outgoing traffic is not restricted.',
    'Traffic inside the cluster is plaintext, and every workload shares one secret and one database login.',
    'Pods run as non-root on read-only file systems, with all capabilities dropped and no service account token.',
  ],
  proposed: [
    'Each workload gets a short-lived certificate for its identity, from a service mesh or SPIFFE/SPIRE, and every connection uses mutual TLS.',
    'Policies name identities, not labels: a pod that copies a label gets nothing without the right certificate.',
    'Outgoing traffic is denied by default. Agency traffic leaves through an egress gateway that allows only their hostnames.',
    'Credentials are per workload, short-lived, and issued by a secrets manager.',
  ],
}

function Node({ id, n, state, onSelect }) {
  const cx = n.x + n.w / 2
  return (
    <g
      className={`arch-node ${n.kind ?? 'service'} ${state}`}
      role="button"
      tabIndex={0}
      aria-label={`${n.title}, ${n.sub}`}
      aria-pressed={state === 'selected' || state === 'compromised'}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id) }
      }}
    >
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.kind === 'store' ? 14 : 8} />
      <text x={cx} y={n.y + n.h / 2 - 3} className="arch-title">{n.title}</text>
      <text x={cx} y={n.y + n.h / 2 + 15} className="arch-sub">{n.sub}</text>
    </g>
  )
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" className={`arch-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

export default function ServiceAuthDiagram() {
  const [mode, setMode] = useState('connections')
  const [view, setView] = useState('today')
  const [selected, setSelected] = useState(null) // { type: 'node' | 'edge', id }

  const changeMode = (m) => { setMode(m); setSelected(null) }
  const pick = (type, id) => {
    if (mode === 'compromise' && (type === 'edge' || !REACH[id])) return
    setSelected((cur) => (cur?.type === type && cur.id === id ? null : { type, id }))
  }

  // Work out what to highlight.
  let litNodes = null
  let litEdges = null
  const reach = mode === 'compromise' && selected ? REACH[selected.id][view] : null
  if (reach) {
    litNodes = new Set(reach.nodes)
    litEdges = new Set(reach.edges)
  } else if (selected?.type === 'edge') {
    const e = EDGES.find((x) => x.id === selected.id)
    litEdges = new Set([e.id])
    litNodes = new Set(ends(e))
  } else if (selected?.type === 'node') {
    litEdges = new Set(EDGES.filter((e) => ends(e).includes(selected.id)).map((e) => e.id))
    litNodes = new Set(EDGES.filter((e) => litEdges.has(e.id)).flatMap(ends))
  }

  const nodeState = (id) => {
    if (!selected) return ''
    if (selected.id === id && selected.type === 'node') return mode === 'compromise' ? 'compromised' : 'selected'
    if (litNodes?.has(id)) return reach ? 'reach' : 'active'
    return 'dim'
  }
  const edgeClass = (e) => {
    const lit = litEdges?.has(e.id)
    return [
      'arch-edge',
      e.trace && 'trace',
      view === 'today' && e.weak && !lit && 'weak',
      lit && (reach ? 'reach' : 'on'),
      selected && !lit && 'dim',
    ].filter(Boolean).join(' ')
  }
  const marker = (e) => {
    const lit = litEdges?.has(e.id)
    if (lit) return reach ? 'zt-arrow-reach' : 'zt-arrow-on'
    return view === 'today' && e.weak ? 'zt-arrow-weak' : 'zt-arrow'
  }

  const node = selected?.type === 'node' && NODES[selected.id]
  const edge = selected?.type === 'edge' && EDGES.find((e) => e.id === selected.id)

  return (
    <figure className="arch zt">
      <div className="arch-toolbar" role="group" aria-label="Diagram mode">
        <span className="arch-toolbar-label">Show:</span>
        <Chip on={mode === 'connections'} onClick={() => changeMode('connections')}>Connections</Chip>
        <Chip on={mode === 'compromise'} onClick={() => changeMode('compromise')}>If compromised</Chip>
        <span className="arch-toolbar-label zt-gap">Controls:</span>
        <Chip on={view === 'today'} onClick={() => setView('today')}>Today</Chip>
        <Chip on={view === 'proposed'} onClick={() => setView('proposed')}>Proposed</Chip>
      </div>

      <div className="arch-canvas">
        <svg viewBox="0 0 760 420" role="group" aria-label="Service-to-service connections in the tax refund system">
          <defs>
            {[['zt-arrow', ''], ['zt-arrow-on', ' on'], ['zt-arrow-weak', ' weak'], ['zt-arrow-reach', ' reach']].map(([mid, cls]) => (
              <marker key={mid} id={mid} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className={`arch-arrowhead${cls}`} />
              </marker>
            ))}
          </defs>

          {EDGES.map((e) => (
            <g key={e.id}>
              <path d={e.d} className={edgeClass(e)} markerEnd={`url(#${marker(e)})`} />
              <path
                d={e.d}
                className="zt-hit"
                role="button"
                tabIndex={mode === 'connections' ? 0 : -1}
                aria-label={`${e.title}: ${e.purpose}`}
                onClick={() => pick('edge', e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick('edge', e.id) }
                }}
              />
            </g>
          ))}

          {Object.entries(NODES).map(([id, n]) => (
            <Node key={id} id={id} n={n} state={nodeState(id)} onSelect={(nid) => pick('node', nid)} />
          ))}
        </svg>
      </div>

      <div className="arch-panel" aria-live="polite">
        {reach ? (
          <>
            <p className="arch-panel-kicker">If compromised · {view === 'today' ? 'today' : 'with the proposed controls'}</p>
            <h3>{NODES[selected.id].title}</h3>
            <p className="arch-panel-text">{reach.note}</p>
            <p className="zt-holds-label">Credentials it holds</p>
            <ul>{reach.holds.map((h) => <li key={h}>{h}</li>)}</ul>
          </>
        ) : edge ? (
          <>
            <p className="arch-panel-kicker">Connection · {edge.purpose}</p>
            <h3>{edge.title}</h3>
            <ul className="zt-compare">
              <li className={view === 'today' ? 'current' : ''}><Demo /> {edge.today}</li>
              <li className={view === 'proposed' ? 'current' : ''}><Planned /> {edge.proposed}</li>
            </ul>
          </>
        ) : node ? (
          <>
            <p className="arch-panel-kicker">Component · {node.sub}</p>
            <h3>{node.title}</h3>
            <ul className="zt-compare">
              {node.points.map(([badge, text]) => (
                <li key={text}>{badge === 'demo' ? <Demo /> : badge === 'planned' ? <Planned /> : null} {text}</li>
              ))}
            </ul>
          </>
        ) : mode === 'compromise' ? (
          <p className="arch-panel-hint">
            Select the portal, API, processor, or batch jobs to see what an attacker who takes it over could reach. Switch
            between Today and Proposed to compare.
          </p>
        ) : (
          <>
            <p className="arch-panel-kicker">{view === 'today' ? 'Today (demo)' : 'Proposed'}</p>
            <ul>{SUMMARY[view].map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="arch-panel-hint zt-hint">
              Select a connection or a component for details.
              {view === 'today' && ' Amber dashed lines are unencrypted or use a shared credential.'}
            </p>
          </>
        )}
      </div>
    </figure>
  )
}
