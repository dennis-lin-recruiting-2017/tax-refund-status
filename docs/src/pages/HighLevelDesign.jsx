import { useState } from 'react'
import { Link } from 'react-router-dom'

// The architecture as it runs today in local Kubernetes (namespace tax-refund).
// Coordinates are in the SVG's 1000×520 viewBox.

const NODES = {
  taxpayer: {
    x: 20, y: 110, w: 140, h: 56, kind: 'actor',
    title: 'Taxpayer', sub: 'Browser',
    meta: 'Outside the cluster',
    points: [
      'Signs in with email and password and gets a server-side session cookie.',
      'Files a demo federal or state return and watches its status on a phone or desktop.',
      'Never talks to the agencies or the database directly; everything goes through the portal.',
    ],
  },
  admin: {
    x: 20, y: 210, w: 140, h: 56, kind: 'actor',
    title: 'Admin', sub: 'Browser',
    meta: 'Outside the cluster · admin@test.com',
    points: [
      'Uses the same portal; its Admin page calls /api/admin, which requires the admin role.',
      'Sets or clears a return\'s status at the mock agency, asks for an immediate check, or releases a held return.',
    ],
    link: { to: '/demo/admin-console', label: 'Admin Console' },
  },
  frontend: {
    x: 210, y: 150, w: 160, h: 76,
    title: 'Portal', sub: 'nginx · ×2',
    meta: 'Deployment ×2 · port 8080 · React SPA built by Vite',
    points: [
      'Serves the single-page app: hashed /assets/ cached for a year, index.html never cached.',
      'Proxies /api/ to the API service, so the browser only ever sees one origin.',
      'Sends a strict Content-Security-Policy, X-Frame-Options DENY, and caps request bodies at 32 KB.',
      'The only pod reachable from outside the namespace (port-forwarded to :8090 locally).',
    ],
    link: { to: '/demo/local-kubernetes/deploy', label: 'Deploy & Access' },
  },
  backend: {
    x: 420, y: 150, w: 160, h: 76,
    title: 'API', sub: 'taxrefund serve · ×2',
    meta: 'Deployment ×2 · port 8080 · Go',
    points: [
      'Sign-in with account lockout, and 30-minute server-side sessions stored in Postgres.',
      'Taxpayer endpoints: list returns, drafts, refund estimate, submit a return.',
      'Reads status from Postgres only. A page view never calls an agency, so peak traffic stays off their APIs.',
      'Admin endpoints set an override through the agency\'s admin API, check that return right away, and write an audit log entry.',
      'An init container runs the schema migrations before the API starts.',
    ],
  },
  processor: {
    x: 640, y: 56, w: 160, h: 66,
    title: 'Processor', sub: 'taxrefund process · ×2',
    meta: 'Deployment ×2 · Go',
    points: [
      'Every 2 seconds, for each agency, takes tokens from that agency\'s shared rate limit and claims that many queued returns with a 60-second lease (FOR UPDATE SKIP LOCKED), so replicas never collide.',
      'Duplicate screening: finds other taxpayers\' returns paying into the same bank account fingerprint, then asks pgvector whether any have near-identical figures. Matches are held for identity verification.',
      'Otherwise transmits the return to its agency and stores the submission ID.',
      'A failed transmission waits its own backoff with jitter; repeated agency failures open that agency\'s circuit breaker. See API Gateway.',
    ],
  },
  batch: {
    x: 640, y: 300, w: 160, h: 66,
    title: 'Batch sync', sub: 'taxrefund batch-run',
    meta: '3 CronJobs (federal, CA, NY) · Indexed Jobs, 2 shards each',
    points: [
      'Each agency\'s CronJob runs every minute at demo pace, and never overlaps itself (concurrencyPolicy: Forbid).',
      'Shards claim returns that are due for a check, in chunks, and ask the agency in bulk.',
      'Maps the agency\'s answer to our status, writes the change and its history, and schedules the next check.',
      'Final statuses (Refund sent, Refund adjusted, Accepted) are never checked again.',
      'Stops a run early when too many chunks fail, rather than hammering an unhealthy agency.',
    ],
    link: { to: '/architecture/batch-sync', label: 'Batch Status Sync' },
  },
  postgres: {
    x: 420, y: 300, w: 160, h: 86, kind: 'store',
    title: 'Postgres', sub: 'pgvector · ×1',
    meta: 'StatefulSet ×1 · port 5432',
    points: [
      'Tables: users, sessions, tax_returns, return_events, audit_log, batch_runs.',
      'HNSW index on each return\'s feature vector, and an index on the keyed bank fingerprint, for duplicate screening.',
      'Only pods labeled as database clients may connect (network policy).',
      'The mock agencies keep their own data in a separate agency_mock schema.',
    ],
    link: { to: '/demo/local-development/database', label: 'Database' },
  },
  agencies: {
    x: 850, y: 40, w: 130, h: 340, kind: 'group',
    title: 'Mock agencies', sub: 'taxrefund agency',
    meta: '3 Deployments ×1 · port 9100',
    points: [
      'Stand in for the IRS, the California FTB, and the New York DTF.',
      'An API key covers e-file (POST /v1/returns) and bulk status (POST /v1/statuses/batch-get).',
      'A separate admin key covers status overrides (/v1/admin/submissions), used by the Admin page.',
      'Can answer 429 with Retry-After, so the clients\' backoff gets exercised.',
      'Only pods labeled as agency clients may call them (network policy).',
    ],
    link: { to: '/architecture/batch-sync/agencies', label: 'Agency Integration' },
  },
  jaeger: {
    x: 210, y: 420, w: 160, h: 60,
    title: 'Jaeger', sub: 'traces · ×1',
    meta: 'Deployment ×1 · OTLP :4318 · UI :16686',
    points: [
      'The API, processor, batch runs, and mock agencies export OpenTelemetry spans over OTLP/HTTP.',
      'Each service shows up separately, so one request can be followed across services and into agency calls.',
    ],
    link: { to: '/operations/tracing', label: 'Distributed Tracing' },
  },

  // Planned: refund-time prediction. Drawn dashed, and hidden with the "Planned ML" toggle.
  predictor: {
    x: 640, y: 440, w: 160, h: 60, planned: true,
    title: 'Predictor', sub: 'taxrefund predict',
    meta: 'Planned · Deployment ×2 · internal only',
    points: [
      'Estimates when a refund will be available, as a date range, from a coarse feature vector with no identifiers.',
      'Called by the batch sync when a status changes, never on a page view, so the model stays off the peak read path.',
      'Uses Kaplan-Meier survival curves per segment in the demo. In production, a gradient-boosted survival model serves the estimates and a random survival forest checks them, with the wider range shown where they disagree. All three handle returns still waiting.',
      'If it\'s slow or down, the batch sync falls back to the agency\'s published guidance and carries on.',
      'Logs and spans carry the model version and the return token only, never features.',
    ],
    link: { to: '/architecture/prediction', label: 'Refund Time Prediction' },
  },
  export: {
    x: 210, y: 660, w: 150, h: 66, planned: true,
    title: 'Event export', sub: 'CDC · consented only',
    meta: 'Planned · change data capture from return_events',
    points: [
      'Streams status changes only for returns whose taxpayer opted in to model training.',
      'Drops names, SSNs, addresses, employers, and bank details before anything leaves production.',
      'Replaces the return ID with a keyed hash. The key stays in production, so the ML environment can\'t link a row back to a person.',
    ],
  },
  training: {
    x: 400, y: 660, w: 150, h: 66, kind: 'store', planned: true,
    title: 'Training data', sub: 'pseudonymized',
    meta: 'Planned · separate account, audited access',
    points: [
      'Coarse features from an allowlist: agency, week of season, e-file vs. paper, direct deposit vs. check, credit flags, refund band, current backlog.',
      'The label is days from transmission to deposit, using the agency\'s deposit date where it gives one.',
      'Groups smaller than a minimum size are merged into broader ones.',
      'Kept for 3 seasons, then deleted. Withdrawn consent removes a return from future training sets.',
    ],
  },
  trainer: {
    x: 590, y: 660, w: 150, h: 66, planned: true,
    title: 'Training job', sub: 'nightly in season',
    meta: 'Planned · scheduled job in the ML environment',
    points: [
      'Retrains nightly in season so the model tracks agency backlogs, and less often off season.',
      'Treats returns still waiting as censored data rather than dropping them, which would bias estimates toward fast refunds.',
      'Evaluates each candidate on error and on how often the actual date lands inside the range, overall and for groups such as EITC filers.',
    ],
  },
  registry: {
    x: 780, y: 660, w: 150, h: 66, planned: true,
    title: 'Model registry', sub: 'versioned models',
    meta: 'Planned · model versions with model cards',
    points: [
      'Stores each trained version with its evaluation results, features, and limits.',
      'A new version runs in shadow next to the current one before it\'s approved.',
      'The predictor loads only approved versions, and rolling back means pointing it at the previous one.',
    ],
  },
}

const AGENCY_BOXES = [
  { y: 84, title: 'IRS', sub: 'federal' },
  { y: 170, title: 'CA FTB', sub: 'California' },
  { y: 256, title: 'NY DTF', sub: 'New York' },
]

const EDGES = [
  { id: 'tp-fe', from: 'taxpayer', to: 'frontend', d: 'M160 138 L208 176', label: 'HTTPS', lx: 178, ly: 146 },
  { id: 'ad-fe', from: 'admin', to: 'frontend', d: 'M160 238 L208 202', label: 'HTTPS', lx: 178, ly: 236 },
  { id: 'fe-be', from: 'frontend', to: 'backend', d: 'M370 188 L418 188', label: '/api/*', lx: 394, ly: 180 },
  { id: 'be-db', from: 'backend', to: 'postgres', d: 'M500 226 L500 298', label: 'SQL', lx: 508, ly: 266, anchor: 'start' },
  { id: 'be-ag', from: 'backend', to: 'agencies', d: 'M580 188 L848 188', label: 'status override', lx: 714, ly: 180 },
  { id: 'pr-db', from: 'processor', to: 'postgres', d: 'M680 122 L562 298', label: 'claim new returns', lx: 616, ly: 270, anchor: 'start' },
  { id: 'pr-ag', from: 'processor', to: 'agencies', d: 'M800 89 L848 89', label: 'e-file', lx: 824, ly: 81 },
  { id: 'ba-db', from: 'batch', to: 'postgres', d: 'M640 333 L582 333', label: 'due returns', lx: 611, ly: 325 },
  { id: 'ba-ag', from: 'batch', to: 'agencies', d: 'M800 333 L848 333', label: 'bulk status', lx: 824, ly: 325 },
  { id: 'ag-db', from: 'agencies', to: 'postgres', d: 'M915 380 V415 H520 V388', label: 'own agency_mock schema', lx: 850, ly: 409, dashed: true },
  { id: 'tr-be', from: 'backend', to: 'jaeger', d: 'M420 215 H404 V450 H372', trace: true },
  { id: 'tr-pr', from: 'processor', to: 'jaeger', d: 'M800 108 H826 V580 H290 V482', trace: true },
  { id: 'tr-ba', from: 'batch', to: 'jaeger', d: 'M640 355 H612 V580 H290 V482', trace: true, label: 'OTLP spans', lx: 500, ly: 574 },
  { id: 'tr-ag', from: 'agencies', to: 'jaeger', d: 'M950 380 V580 H290 V482', trace: true },
  // Planned: refund-time prediction
  { id: 'tr-pd', from: 'predictor', to: 'jaeger', d: 'M720 500 V580 H290 V482', trace: true, planned: true },
  { id: 'ba-pd', from: 'batch', to: 'predictor', d: 'M720 366 V438', label: 'features, no IDs', lx: 728, ly: 395, anchor: 'start', planned: true },
  { id: 'db-ex', from: 'postgres', to: 'export', d: 'M440 386 V630 H285 V658', label: 'return_events', lx: 448, ly: 520, anchor: 'start', planned: true },
  { id: 'ex-ts', from: 'export', to: 'training', d: 'M360 693 L398 693', planned: true },
  { id: 'ts-tr', from: 'training', to: 'trainer', d: 'M550 693 L588 693', planned: true },
  { id: 'tr-rg', from: 'trainer', to: 'registry', d: 'M740 693 L778 693', planned: true },
  { id: 'rg-pd', from: 'registry', to: 'predictor', d: 'M855 658 V470 H802', label: 'approved model', lx: 862, ly: 540, anchor: 'start', planned: true },
]

const FLOWS = [
  {
    id: 'status',
    title: 'Check status',
    steps: [
      { edges: ['tp-fe'], text: 'The taxpayer opens the portal. nginx serves the single-page app.' },
      { edges: ['fe-be'], text: 'Sign-in posts to /api/auth/login through the nginx proxy. Failed attempts count toward a lockout.' },
      { edges: ['be-db'], text: 'The API creates a server-side session, then GET /api/returns reads the stored status and history. No agency is called on the read path.' },
    ],
  },
  {
    id: 'file',
    title: 'File a return',
    steps: [
      { edges: ['tp-fe', 'fe-be'], text: 'The taxpayer reviews a draft, gets a refund estimate, and submits it with POST /api/returns/{form}.' },
      { edges: ['be-db'], text: 'The API stores the return as Return received, with its feature vector and keyed bank fingerprint, ready for the processor.' },
      { edges: ['pr-db'], text: 'Within seconds, a processor replica claims it from its agency\'s queue, within that agency\'s shared rate limit, and runs duplicate screening with pgvector.' },
      { edges: ['pr-ag'], text: 'If it\'s not a near-duplicate, the processor e-files it with the agency and stores the submission ID. A duplicate is held for identity verification instead.' },
    ],
  },
  {
    id: 'sync',
    title: 'Sync statuses',
    steps: [
      { edges: ['ba-db'], text: 'Each agency\'s CronJob starts two shards. Each shard claims returns that are due for a check, in chunks.' },
      { edges: ['ba-ag'], text: 'The shard asks the agency about the whole chunk in one bulk call, backing off on 429s.' },
      { edges: ['ba-db'], text: 'Changes are written with their history and the next check time. Final statuses drop out of the schedule.' },
      { edges: ['be-db', 'fe-be', 'tp-fe'], text: 'The taxpayer\'s next page view shows the new status, read from Postgres.' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin override',
    steps: [
      { edges: ['ad-fe', 'fe-be'], text: 'The admin picks a status, such as Refund adjusted, on the Admin page. /api/admin requires the admin role.' },
      { edges: ['be-ag'], text: 'The API validates it and sets the override at the mock agency with the admin key. It doesn\'t write our status directly.' },
      { edges: ['ag-db'], text: 'The mock agency saves the override in its own schema, as a real agency would in its own systems.' },
      { edges: ['be-ag', 'be-db'], text: 'The API immediately checks that one return at the agency, the same way a batch run does, records the new status, and writes an audit log entry. If that check fails, the next batch run picks it up.' },
    ],
  },
  {
    id: 'trace',
    title: 'Tracing',
    steps: [
      { edges: ['tr-be', 'tr-pr', 'tr-ba', 'tr-ag', 'tr-pd'], text: 'Every Go service exports spans to Jaeger over OTLP, so a filing can be followed from the HTTP request to the agency calls.' },
    ],
  },
  {
    id: 'predict',
    title: 'Predict refund date',
    planned: true,
    steps: [
      { edges: ['ba-ag', 'ba-db'], text: 'A batch run records a status change for a return that hasn\'t been paid yet.' },
      { edges: ['ba-pd'], text: 'The batch sync builds a coarse feature vector with no identifiers and asks the predictor for a date range. If the predictor is slow or down, it uses the agency\'s published guidance instead.' },
      { edges: ['ba-db'], text: 'The range is stored on the return with the model version. It\'s replaced by the agency\'s own date once there is one, and cleared once the refund is sent.' },
      { edges: ['be-db', 'fe-be', 'tp-fe'], text: 'The taxpayer sees "Estimated Mar 3–7, based on similar returns". Showing it is still just a database read.' },
    ],
  },
  {
    id: 'train',
    title: 'Train the model',
    planned: true,
    steps: [
      { edges: ['db-ex'], text: 'Change data capture streams return_events for taxpayers who opted in, drops personal details, and swaps the return ID for a keyed hash whose key stays in production.' },
      { edges: ['ex-ts'], text: 'Coarse features and the label (days to deposit) land in a separate, audited environment. Small groups are merged, and data is deleted after 3 seasons.' },
      { edges: ['ts-tr'], text: 'A nightly job trains the two survival models, gradient-boosted and random forest, counting returns still waiting as censored, and evaluates error and range coverage overall and per group.' },
      { edges: ['tr-rg'], text: 'The candidate is registered with its model card and runs in shadow next to the current model.' },
      { edges: ['rg-pd'], text: 'Once approved, the predictor loads it. Estimates refresh as returns come due in the batch sync.' },
    ],
  },
]

function nodesOf(edges, edgeIds) {
  const ids = new Set()
  for (const e of edges) if (edgeIds.includes(e.id)) { ids.add(e.from); ids.add(e.to) }
  return ids
}

function Node({ id, node, state, onSelect }) {
  const { x, y, w, h, kind = 'service', title, sub, planned } = node
  const cx = x + w / 2
  const activate = () => onSelect(id)
  return (
    <g
      className={`arch-node ${kind}${planned ? ' planned' : ''} ${state}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}: ${node.meta}`}
      aria-pressed={state === 'selected'}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
      }}
    >
      <rect x={x} y={y} width={w} height={h} rx={kind === 'store' ? 14 : 8} />
      {planned && <text x={x + w - 8} y={y + 13} className="arch-tag">PLANNED</text>}
      {kind === 'group' ? (
        <>
          <text x={cx} y={y + 22} className="arch-title">{title}</text>
          <text x={cx} y={y + 38} className="arch-sub">{sub}</text>
          {AGENCY_BOXES.map((a) => (
            <g key={a.title} className="arch-inner">
              <rect x={x + 12} y={a.y} width={w - 24} height={66} rx={6} />
              <text x={cx} y={a.y + 30} className="arch-title">{a.title}</text>
              <text x={cx} y={a.y + 48} className="arch-sub">{a.sub}</text>
            </g>
          ))}
        </>
      ) : (
        <>
          <text x={cx} y={y + h / 2 - 3} className="arch-title">{title}</text>
          <text x={cx} y={y + h / 2 + 15} className="arch-sub">{sub}</text>
        </>
      )}
    </g>
  )
}

function Diagram() {
  const [selected, setSelected] = useState(null)
  const [flow, setFlow] = useState(null)
  const [step, setStep] = useState(0)
  const [showPlanned, setShowPlanned] = useState(true)

  const nodes = Object.entries(NODES).filter(([, n]) => showPlanned || !n.planned)
  const edges = EDGES.filter((e) => showPlanned || !e.planned)
  const flows = FLOWS.filter((f) => showPlanned || !f.planned)
  const visible = new Set(edges.map((e) => e.id))

  const activeFlow = flows.find((f) => f.id === flow)
  const activeStep = activeFlow?.steps[step]

  let activeEdges = []
  let activeNodes = new Set()
  if (activeStep) {
    activeEdges = activeStep.edges.filter((id) => visible.has(id))
    activeNodes = nodesOf(edges, activeEdges)
  } else if (selected) {
    activeEdges = edges.filter((e) => e.from === selected || e.to === selected).map((e) => e.id)
    activeNodes = nodesOf(edges, activeEdges)
    activeNodes.add(selected)
  }
  const focused = activeEdges.length > 0 || selected

  const selectNode = (id) => {
    setFlow(null)
    setSelected((s) => (s === id ? null : id))
  }
  const selectFlow = (id) => {
    setSelected(null)
    setFlow((f) => (f === id ? null : id))
    setStep(0)
  }
  const reset = () => { setSelected(null); setFlow(null) }
  const togglePlanned = () => { reset(); setShowPlanned((s) => !s) }

  const nodeState = (id) => {
    if (id === selected) return 'selected'
    if (!focused) return ''
    return activeNodes.has(id) ? 'active' : 'dim'
  }
  const node = selected && NODES[selected]

  return (
    <figure className="arch">
      <div className="arch-toolbar" role="group" aria-label="Walk through a flow">
        <span className="arch-toolbar-label">Walk through:</span>
        {flows.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`arch-chip${f.planned ? ' planned' : ''}${flow === f.id ? ' on' : ''}`}
            aria-pressed={flow === f.id}
            onClick={() => selectFlow(f.id)}
          >
            {f.title}
          </button>
        ))}
        {focused && (
          <button type="button" className="arch-chip reset" onClick={reset}>Clear</button>
        )}
        <label className="arch-toggle">
          <input type="checkbox" checked={showPlanned} onChange={togglePlanned} />
          Show planned ML
        </label>
      </div>

      <div className="arch-canvas">
        <svg viewBox={`0 0 1000 ${showPlanned ? 780 : 612}`} role="img" aria-labelledby="arch-title arch-desc">
          <title id="arch-title">Tax refund status architecture</title>
          <desc id="arch-desc">
            Browsers reach an nginx portal, which proxies to the Go API. The API, a processor, and batch CronJobs share
            Postgres with pgvector. The processor and batch jobs call three mock tax agencies; the API calls them for admin
            overrides. All Go services send traces to Jaeger.
            {showPlanned && ' Planned: the batch sync asks a predictor service for refund-date estimates. Consented, pseudonymized status history is exported to a separate ML environment, where a nightly job trains models into a registry that the predictor loads from.'}
          </desc>
          <defs>
            <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="arch-arrowhead" />
            </marker>
            <marker id="arch-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="arch-arrowhead on" />
            </marker>
          </defs>

          <rect x="192" y="20" width="800" height="580" rx="14" className="arch-boundary" />
          <text x="208" y="42" className="arch-boundary-label">Kubernetes namespace tax-refund · default-deny ingress</text>
          {showPlanned && (
            <>
              <rect x="192" y="616" width="800" height="152" rx="14" className="arch-boundary planned" />
              <text x="976" y="638" className="arch-boundary-label" textAnchor="end">Separate ML environment · pseudonymized data only · planned</text>
            </>
          )}

          {edges.map((e) => {
            const on = activeEdges.includes(e.id)
            if (e.trace && !on) return null
            const cls = ['arch-edge', e.dashed && 'dashed', e.trace && 'trace', e.planned && !e.trace && 'planned', on && 'on', focused && !on && 'dim']
            return (
              <g key={e.id}>
                <path d={e.d} className={cls.filter(Boolean).join(' ')} markerEnd={`url(#arch-arrow${on ? '-on' : ''})`} />
                {on && e.label && (
                  <text x={e.lx} y={e.ly} className="arch-edge-label" textAnchor={e.anchor ?? 'middle'}>{e.label}</text>
                )}
              </g>
            )
          })}

          {nodes.map(([id, n]) => (
            <Node key={id} id={id} node={n} state={nodeState(id)} onSelect={selectNode} />
          ))}
        </svg>
      </div>

      <div className="arch-panel" aria-live="polite">
        {activeFlow ? (
          <>
            <p className="arch-panel-kicker">
              {activeFlow.title}{activeFlow.planned && ' (planned)'} · step {step + 1} of {activeFlow.steps.length}
            </p>
            <p className="arch-panel-text">{activeStep.text}</p>
            {activeFlow.steps.length > 1 && (
              <div className="arch-stepper">
                <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>← Back</button>
                <button type="button" onClick={() => setStep((s) => s + 1)} disabled={step === activeFlow.steps.length - 1}>Next →</button>
              </div>
            )}
          </>
        ) : node ? (
          <>
            <p className="arch-panel-kicker">{node.meta}</p>
            <h3>{node.title}</h3>
            <ul>
              {node.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {node.link && <p className="arch-panel-link">More in <Link to={node.link.to}>{node.link.label}</Link>.</p>}
          </>
        ) : (
          <p className="arch-panel-hint">
            Select a component to see what it does and what it connects to, or pick a flow above to step through it.
          </p>
        )}
      </div>
    </figure>
  )
}

export default function HighLevelDesign() {
  return (
    <>
      <p className="eyebrow">Architecture</p>
      <h1>High-Level Design</h1>
      <p className="lede">
        The system as it runs today: a portal, an API that only reads our own data, and background workers that
        file returns with the agencies and keep their statuses in sync. Dashed boxes marked planned show the
        refund-time prediction still to be built: the predictor, and the pipeline that trains it.
      </p>

      <Diagram />

      <section>
        <h2>Principles behind the layout</h2>
        <ul className="points">
          <li>
            <strong>Reads never reach an agency.</strong> Taxpayers read the status stored in Postgres, so peak-season
            traffic scales with our API and database, not with the agencies' rate limits.
          </li>
          <li>
            <strong>Agency work happens in the background.</strong> The processor files returns and the batch jobs poll
            for status changes in bulk, on a schedule each agency can sustain.
          </li>
          <li>
            <strong>Workers coordinate through the database.</strong> Leases with FOR UPDATE SKIP LOCKED let any number of
            processor replicas or batch shards run without a separate queue or coordinator.
          </li>
          <li>
            <strong>One binary, many roles.</strong> Every Go component is the same <code>taxrefund</code> image started
            with a different subcommand, which keeps builds and deployments simple.
          </li>
          <li>
            <strong>Predictions are precomputed.</strong> The batch sync asks the predictor when a status changes and stores
            the answer, so the model never sits on the peak read path, and an outage only means estimates fall back to
            agency guidance.
          </li>
          <li>
            <strong>Training data never sees a person.</strong> Only opted-in returns are exported, as coarse features
            under a keyed hash whose key stays in production, into a separate environment with audited access.
          </li>
          <li>
            <strong>Least-privilege network.</strong> Ingress is denied by default; only the portal is reachable from
            outside, and only labeled clients may reach Postgres or the agencies.
          </li>
        </ul>
      </section>

      <section>
        <h2>Outside Kubernetes</h2>
        <p>
          The same components run elsewhere for development. In <Link to="/demo/local-development/run">dev mode</Link>,{' '}
          <code>taxrefund all</code> runs the API, processor, batch scheduler, and all three mock agencies in one
          process, with Vite serving the portal; Postgres and Jaeger run in Docker. In{' '}
          <Link to="/demo/local-development/integration">integration mode</Link>, Docker Compose runs each component in
          its own container, with <code>taxrefund batch-schedule</code> standing in for the CronJobs.
        </p>
      </section>
    </>
  )
}
