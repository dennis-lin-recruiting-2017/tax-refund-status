import { useState } from 'react'
import StepDiagram from '../components/StepDiagram.jsx'

// How a trace is made: spans start in each Go service, context crosses to the agencies in the traceparent header,
// the SDK exports to Jaeger (through a Collector in production), and an engineer finds the trace from a log line
// or a batch_runs row.

const NODES = {
  portal: {
    kind: 'actor', x: 20, y: 52, w: 130, h: 56, title: 'Portal', sub: 'nginx, not traced',
    points: [
      ['demo', 'Proxies /api to the API. It is not instrumented, so traces start at the API.'],
      ['planned', "nginx's OpenTelemetry module would start the trace at the edge, so time spent in the proxy shows up too."],
    ],
  },
  cron: {
    kind: 'actor', x: 20, y: 200, w: 130, h: 56, title: 'CronJob', sub: 'every minute',
    points: [['demo', 'Starts a batch run for each agency, as sharded Indexed Jobs. Each run is a new trace.']],
  },
  api: {
    x: 200, y: 20, w: 150, h: 56, title: 'refund-api', sub: 'HTTP server spans',
    points: [
      ['demo', 'One trace per API request, named by method and path, with a child span for each Postgres query.'],
      ['demo', 'Health checks are not traced.'],
      ['demo', 'Each request log line carries the trace ID.'],
    ],
  },
  processor: {
    x: 200, y: 110, w: 150, h: 56, title: 'refund-processor', sub: 'processor.transmit',
    points: [
      ['demo', 'One trace per return transmitted: the claim, duplicate screening, the agency submit, and the status update.'],
      ['demo', 'screening.flagged marks returns held as near-duplicates.'],
    ],
  },
  batch: {
    x: 200, y: 200, w: 150, h: 56, title: 'refund-batch', sub: 'batch.run',
    points: [
      ['demo', 'One trace per batch run: the claims, each chunk, each agency call and retry, and the writes.'],
      ['demo', 'batch.status, batch.run_id, and batch.chunks_failed make failed runs easy to find.'],
    ],
  },
  postgres: {
    kind: 'store', x: 440, y: 30, w: 150, h: 64, title: 'Postgres', sub: 'client spans only',
    points: [
      ['demo', "Postgres doesn't report spans itself. Each Go service's database driver records a client span per query."],
      ['demo', 'Spans include the SQL text, never the parameter values.'],
    ],
  },
  agencies: {
    kind: 'external', x: 440, y: 170, w: 150, h: 66, title: 'Agency mocks', sub: 'agency-* services',
    points: [
      ['demo', "Each mock reads the caller's traceparent header, so its server span joins the caller's trace."],
      ['demo', 'agency.simulated_error marks the failures the mock injects.'],
    ],
  },
  sdk: {
    x: 200, y: 340, w: 150, h: 56, title: 'OpenTelemetry SDK', sub: 'in every service',
    points: [
      ['demo', 'OTEL_EXPORTER_OTLP_ENDPOINT says where to send spans. Unset means tracing is off.'],
      ['demo', 'TRACE_SAMPLE_RATIO decides which new traces to keep, and child spans follow the decision made at the root.'],
      ['demo', 'Spans are exported in batches in the background, so tracing never holds up a request.'],
    ],
  },
  collector: {
    x: 400, y: 340, w: 130, h: 56, planned: true, title: 'Collector', sub: 'production only',
    points: [
      ['planned', 'Batches spans and drops sensitive attributes as a second line of defense.'],
      ['planned', 'Tail sampling: keeps every trace with an error or high latency and every batch run, plus a few percent of ordinary requests.'],
    ],
  },
  jaeger: {
    kind: 'store', x: 570, y: 340, w: 170, h: 56, title: 'Jaeger', sub: 'OTLP :4318 · UI :16686',
    points: [
      ['demo', 'All-in-one with an in-memory store, which loses traces on restart.'],
      ['demo', 'UI at localhost:16686 in Docker, or localhost:16687 after make k8s-jaeger.'],
      ['planned', 'OpenSearch or Cassandra storage with a retention period, and the UI behind staff sign-in.'],
    ],
  },
  logs: {
    kind: 'store', x: 20, y: 432, w: 170, h: 56, title: 'Logs and batch_runs', sub: 'both carry trace_id',
    points: [
      ['demo', 'API request logs include trace_id, so a slow or failed request leads straight to its trace.'],
      ['demo', 'Each batch_runs row stores the trace ID of its run.'],
    ],
  },
  engineer: {
    kind: 'actor', x: 570, y: 432, w: 170, h: 56, title: 'Engineer', sub: 'searches by trace ID',
    points: [[null, 'Pastes a trace ID into the search box at the top of Jaeger, or searches by service and attributes.']],
  },
}

const EDGES = [
  { id: 'po-api', from: 'portal', to: 'api', d: 'M150 80 C175 80 175 48 200 48', label: 'HTTP', lx: 175, ly: 58 },
  { id: 'cron-ba', from: 'cron', to: 'batch', d: 'M150 228 H200', label: 'starts run', lx: 175, ly: 220 },
  { id: 'api-db', from: 'api', to: 'postgres', d: 'M350 48 H440', label: 'SQL', lx: 395, ly: 40 },
  { id: 'pr-db', from: 'processor', to: 'postgres', d: 'M350 132 C395 132 395 78 440 78', label: 'SQL', lx: 405, ly: 112 },
  { id: 'ba-db', from: 'batch', to: 'postgres', d: 'M350 214 C410 214 410 88 440 88', label: 'SQL', lx: 418, ly: 150 },
  { id: 'pr-ag', from: 'processor', to: 'agencies', d: 'M350 150 C395 150 400 186 440 186', label: 'traceparent', lx: 395, ly: 178 },
  { id: 'ba-ag', from: 'batch', to: 'agencies', d: 'M350 238 C395 238 400 220 440 220', label: 'traceparent', lx: 395, ly: 252 },
  {
    id: 'export', from: 'agencies', to: 'sdk', dashed: true,
    d: 'M350 62 H372 V300 M350 156 H372 M350 246 H372 M515 236 V300 H290 V340',
    label: 'spans', lx: 440, ly: 294,
  },
  { id: 'sdk-jg', from: 'sdk', to: 'jaeger', d: 'M350 384 C420 430 520 430 570 384', label: 'OTLP/HTTP', lx: 460, ly: 432 },
  { id: 'sdk-co', from: 'sdk', to: 'collector', d: 'M350 368 H400', planned: true, label: 'OTLP', lx: 375, ly: 360 },
  { id: 'co-jg', from: 'collector', to: 'jaeger', d: 'M530 368 H570', planned: true },
  { id: 'lg-en', from: 'logs', to: 'engineer', d: 'M190 460 H570', label: 'trace_id', lx: 380, ly: 452 },
  { id: 'en-jg', from: 'engineer', to: 'jaeger', d: 'M655 432 V396', label: 'search', lx: 662, ly: 418, anchor: 'start' },
]

// Span waterfalls shown under each step. Times in ms; rows are highlighted by index.
const WATERFALLS = {
  api: {
    total: 20, note: 'Illustrative timings',
    rows: [
      { svc: 'refund-api', name: 'GET /api/returns', start: 0, dur: 18, depth: 0 },
      { svc: 'refund-api', name: 'SELECT sessions', start: 1, dur: 2, depth: 1 },
      { svc: 'refund-api', name: 'SELECT tax_returns', start: 5, dur: 4, depth: 1 },
    ],
  },
  filing: {
    total: 140, note: 'Illustrative timings',
    rows: [
      { svc: 'refund-processor', name: 'processor.transmit', start: 0, dur: 138, depth: 0 },
      { svc: 'refund-processor', name: 'UPDATE tax_returns (claim)', start: 1, dur: 2, depth: 1 },
      { svc: 'refund-processor', name: 'SELECT … ORDER BY features <=>', start: 4, dur: 6, depth: 1 },
      { svc: 'refund-processor', name: 'HTTP POST (submit)', start: 12, dur: 110, depth: 1 },
      { svc: 'agency-irs', name: 'POST (submit)', start: 13, dur: 107, depth: 2 },
      { svc: 'refund-processor', name: 'UPDATE, INSERT return_events', start: 124, dur: 4, depth: 1 },
    ],
  },
  batch: {
    total: 1130, note: 'The real batch-run trace shown below',
    rows: [
      { svc: 'refund-batch', name: 'batch.run ca-ftb', start: 0, dur: 1129, depth: 0 },
      { svc: 'refund-batch', name: 'INSERT batch_runs', start: 1, dur: 1, depth: 1 },
      { svc: 'refund-batch', name: 'UPDATE tax_returns (claim chunk)', start: 3, dur: 2, depth: 1 },
      { svc: 'refund-batch', name: 'batch.chunk', start: 6, dur: 1123, depth: 1 },
      { svc: 'refund-batch', name: 'HTTP POST → 503', start: 7, dur: 62, depth: 2, error: true },
      { svc: 'agency-ca-ftb', name: 'POST /v1/statuses/batch-get', start: 8, dur: 61, depth: 3, error: true },
      { svc: 'refund-batch', name: 'HTTP POST (retry) → 200', start: 1068, dur: 58, depth: 2 },
      { svc: 'agency-ca-ftb', name: 'POST /v1/statuses/batch-get', start: 1069, dur: 57, depth: 3 },
      { svc: 'refund-batch', name: 'UPDATE, INSERT return_events, COMMIT', start: 1126, dur: 3, depth: 2 },
    ],
  },
}

function exportStep(production, rows) {
  return production
    ? { edges: ['export', 'sdk-co', 'co-jg'], rows, text: 'As spans end, each service exports them over OTLP to the Collector, which scrubs sensitive attributes and tail-samples: errors, slow traces, and batch runs are always kept. Jaeger stores what survives.' }
    : { edges: ['export', 'sdk-jg'], rows, text: 'As spans end, each service, the agency mocks included, exports them in batches over OTLP/HTTP to Jaeger on port 4318. Jaeger joins them into one trace by trace ID.' }
}

function flows(production) {
  return [
    {
      id: 'api', title: 'API request', steps: [
        { edges: ['po-api'], rows: [0], text: "A browser request reaches the portal, which proxies /api to refund-api. The API's HTTP middleware starts a new trace, and the sampler decides whether to keep it." },
        { edges: ['api-db'], rows: [1, 2], text: 'Each Postgres query becomes a child span with the SQL text, never the parameter values.' },
        { nodes: ['api', 'logs'], rows: [0], text: 'When the request finishes, the API writes one JSON log line with method, path, status, latency, and the trace ID.' },
        exportStep(production, [0, 1, 2]),
        { edges: ['lg-en', 'en-jg'], rows: [0], text: 'Later, an engineer spots a slow request in the logs, copies its trace_id, and opens the trace in Jaeger.' },
      ],
    },
    {
      id: 'filing', title: 'Filing a return', steps: [
        { edges: ['pr-db'], rows: [0, 1, 2], text: 'The processor starts a processor.transmit trace for each return it claims, then screens for near-duplicates with a pgvector query.' },
        { edges: ['pr-ag'], rows: [3, 4], text: "It submits the return to the agency. The HTTP client adds a traceparent header; the agency mock reads it, so the agency's span lands inside the same trace." },
        { edges: ['pr-db'], rows: [5], text: 'The new status and a return_events row are written. If screening flagged the return, screening.flagged is set and the return is held instead.' },
        exportStep(production, [0, 1, 2, 3, 4, 5]),
      ],
    },
    {
      id: 'batch', title: 'Batch run', steps: [
        { edges: ['cron-ba'], rows: [0], text: 'The CronJob starts a shard. The run opens a batch.run root span tagged with the jurisdiction, agency, and trigger.' },
        { edges: ['ba-db'], rows: [1, 2], text: 'It records the run in batch_runs and claims a chunk of returns that are due for a check.' },
        { edges: ['ba-ag'], rows: [3, 4, 5], text: 'batch.chunk calls the agency\'s bulk status endpoint with traceparent. Here the CA FTB mock injects a 503, marked agency.simulated_error.' },
        { edges: ['ba-ag'], rows: [6, 7], text: 'The client waits for the Retry-After second and retries. The retry succeeds, still inside the same trace.' },
        { edges: ['ba-db'], rows: [8], text: 'Status changes and return_events rows are written in one transaction, and the run stores its trace ID on its batch_runs row.' },
        exportStep(production, [0, 1, 2, 3, 4, 5, 6, 7, 8]),
        { edges: ['lg-en', 'en-jg'], rows: [0], text: 'To investigate a run, look up trace_id in batch_runs and paste it into Jaeger.' },
      ],
    },
  ]
}

function Waterfall({ data, rows }) {
  const lit = new Set(rows)
  return (
    <div className="wf" aria-label="Span waterfall">
      {data.rows.map((r, i) => (
        <div key={i} className={`wf-row${lit.has(i) ? ' on' : ''}${r.error ? ' error' : ''}`}>
          <span className="wf-name" style={{ paddingLeft: r.depth * 12 }}>
            <span className="wf-svc">{r.svc}</span> {r.name}
          </span>
          <span className="wf-track">
            <span
              className="wf-bar"
              style={{ left: `${(r.start / data.total) * 100}%`, width: `${Math.max((r.dur / data.total) * 100, 0.8)}%` }}
            />
          </span>
          <span className="wf-ms">{r.dur} ms</span>
        </div>
      ))}
      <p className="wf-note">{data.note}</p>
    </div>
  )
}

export default function TracingDiagram() {
  const [production, setProduction] = useState(false)
  const nodes = production ? NODES : Object.fromEntries(Object.entries(NODES).filter(([k]) => k !== 'collector'))
  const edges = EDGES.filter((e) => (production ? e.id !== 'sdk-jg' : !e.planned))
  return (
    <StepDiagram
      key={production ? 'prod' : 'demo'}
      id="trace"
      nodes={nodes}
      edges={edges}
      flows={flows(production)}
      height={500}
      label="How a trace is created, propagated, exported, and found"
      hint="Pick a walkthrough to follow one trace from start to Jaeger, with its spans highlighted as they're created. Or select a component to see what it records."
      toolbarExtra={(
        <label className="arch-toggle">
          <input type="checkbox" checked={production} onChange={(e) => setProduction(e.target.checked)} />
          Production pipeline
        </label>
      )}
      renderExtra={({ flow, step }) => <Waterfall data={WATERFALLS[flow.id]} rows={flow.steps[step].rows ?? []} />}
    />
  )
}
