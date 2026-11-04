import StepDiagram from '../components/StepDiagram.jsx'

// What is monitored (left), where the signals go (middle), and how an alert reaches a person and gets resolved
// (right). Walkthroughs follow one alert from the first bad signal to mitigation.

const NODES = {
  synthetic: {
    kind: 'actor', x: 20, y: 20, w: 170, h: 56, title: 'Synthetic checks', sub: 'outside, every minute',
    points: [['planned', 'From several regions, sign in with a test account and read a status every minute. Catches DNS, edge, and certificate problems that internal metrics miss.']],
    alerts: ['Synthetic check failing'],
  },
  api: {
    x: 20, y: 100, w: 170, h: 56, title: 'API', sub: 'rate · errors · latency',
    points: [
      ['demo', 'JSON request logs with method, path, status, latency, and trace ID.'],
      ['demo', 'Readiness and liveness probes on /api/readyz and /api/healthz.'],
      ['planned', 'Request rate, errors, and latency per endpoint, split by taxpayer and admin routes.'],
    ],
    alerts: ['Status read errors', 'Status read latency'],
  },
  workers: {
    x: 20, y: 180, w: 170, h: 56, title: 'Processor and batch', sub: 'backlog · overdue · runs',
    points: [
      ['demo', 'Every batch run is recorded in batch_runs with its status, counts, and trace ID, and logged as a warning when it errors or a chunk fails.'],
      ['planned', 'Age of the oldest unfiled return, returns overdue for a check, run duration against the schedule, and agency lookups a second against each rate limit.'],
    ],
    alerts: ['Filing backlog', 'Returns overdue for a check', 'Batch runs failing or skipped'],
  },
  agencies: {
    kind: 'external', x: 20, y: 260, w: 170, h: 56, title: 'Agencies', sub: 'errors · 429s · latency',
    points: [
      ['demo', 'The batch sync honors Retry-After, and failed chunks are recorded on the run.'],
      ['planned', 'Error rate, throttling, and latency per agency.'],
    ],
    alerts: ['Agency errors or throttling'],
  },
  postgres: {
    kind: 'store', x: 20, y: 340, w: 170, h: 56, title: 'Postgres', sub: 'lag · connections · disk',
    points: [['planned', 'Replication lag, connections against the pool, locks, and disk usage.']],
    alerts: ['Postgres health'],
  },
  platform: {
    x: 20, y: 420, w: 170, h: 56, title: 'Kubernetes', sub: 'restarts · saturation',
    points: [['planned', 'Pod restarts, CPU and memory against limits, and autoscalers sitting at their maximum. These are causes, so they feed dashboards and tickets, not pages.']],
  },
  metrics: {
    kind: 'store', x: 250, y: 140, w: 150, h: 64, title: 'Metrics store', sub: 'Prometheus',
    points: [
      ['planned', 'OpenTelemetry metrics from every service, scraped into Prometheus.'],
      ['planned', 'The demo exports no metrics yet.'],
    ],
  },
  logs: {
    kind: 'store', x: 250, y: 330, w: 150, h: 56, title: 'Logs and traces', sub: 'JSON logs · Jaeger',
    points: [
      ['demo', 'Structured JSON logs and OpenTelemetry traces, joined by trace ID.'],
      ['planned', 'Logs shipped to a central store, searchable by trace ID, service, and level.'],
    ],
  },
  rules: {
    x: 450, y: 140, w: 140, h: 64, title: 'Alert rules', sub: 'SLO burn · limits',
    points: [
      ['planned', 'Rules kept as code. Error-budget burn for the objectives, thresholds for workers and dependencies.'],
      ['planned', 'Some alerts page in season but only open a ticket off season.'],
      ['planned', 'Every rule that can page links to its runbook and dashboard.'],
    ],
  },
  dashboards: {
    x: 450, y: 330, w: 140, h: 56, title: 'Dashboards', sub: 'season view',
    points: [['planned', 'A season dashboard for "are we OK?", and per-service dashboards for diagnosis, with exemplars linking slow points to traces.']],
  },
  ticket: {
    kind: 'external', x: 620, y: 40, w: 120, h: 56, title: 'Ticket', sub: 'not urgent',
    points: [['planned', "For problems customers won't notice soon. Reviewed weekly with the pages."]],
  },
  page: {
    kind: 'alert', x: 620, y: 144, w: 120, h: 56, title: 'Page', sub: 'symptoms only',
    points: [['planned', 'For problems taxpayers notice now, or soon. Acknowledged within 5 minutes in season.']],
  },
  oncall: {
    kind: 'actor', x: 620, y: 260, w: 120, h: 56, title: 'On-call', sub: 'runbook in hand',
    points: [['planned', 'A primary and a secondary, around the clock in season and in business hours off season.']],
  },
  comms: {
    x: 620, y: 380, w: 120, h: 56, title: 'Support', sub: 'banner · script',
    points: [['planned', 'When the service is degraded, support agents get a banner with what to tell callers, and taxpayers see their last known status with when it was updated.']],
  },
}

const EDGES = [
  { id: 'sy-m', from: 'synthetic', to: 'metrics', d: 'M190 48 C222 48 222 156 250 156' },
  { id: 'api-m', from: 'api', to: 'metrics', d: 'M190 128 C222 128 225 164 250 164' },
  { id: 'wk-m', from: 'workers', to: 'metrics', d: 'M190 208 C222 208 225 176 250 176' },
  { id: 'ag-m', from: 'agencies', to: 'metrics', d: 'M190 288 C226 288 226 184 250 184' },
  { id: 'db-m', from: 'postgres', to: 'metrics', d: 'M190 368 C230 368 230 192 250 192' },
  { id: 'pl-m', from: 'platform', to: 'metrics', d: 'M190 448 C234 448 234 198 250 198' },
  { id: 'api-l', from: 'api', to: 'logs', dashed: true, d: 'M190 142 C214 142 214 344 250 344' },
  { id: 'wk-l', from: 'workers', to: 'logs', dashed: true, d: 'M190 222 C218 222 218 356 250 356' },
  { id: 'm-r', from: 'metrics', to: 'rules', d: 'M400 172 H450', label: 'queries', lx: 425, ly: 164 },
  { id: 'm-d', from: 'metrics', to: 'dashboards', d: 'M380 204 C380 270 500 270 505 330' },
  { id: 'l-d', from: 'logs', to: 'dashboards', d: 'M400 358 H450' },
  { id: 'r-t', from: 'rules', to: 'ticket', d: 'M590 156 C606 156 604 68 620 68', label: 'ticket', lx: 604, ly: 112, anchor: 'end' },
  { id: 'r-p', from: 'rules', to: 'page', d: 'M590 172 H620', label: 'page', lx: 605, ly: 164 },
  { id: 'p-o', from: 'page', to: 'oncall', d: 'M680 200 V260', label: 'acknowledge', lx: 688, ly: 234, anchor: 'start' },
  { id: 'o-d', from: 'oncall', to: 'dashboards', d: 'M620 290 C600 290 605 350 590 350', label: 'diagnose', lx: 598, ly: 300, anchor: 'end' },
  { id: 'o-l', from: 'oncall', to: 'logs', d: 'M630 316 C610 440 360 440 325 386', label: 'trace', lx: 480, ly: 430 },
  { id: 'o-c', from: 'oncall', to: 'comms', d: 'M680 316 V380', label: 'inform', lx: 688, ly: 352, anchor: 'start' },
]

const FLOWS = [
  {
    id: 'errors', title: 'Status read errors', steps: [
      { edges: ['api-m'], text: 'Status reads start failing at the API, for example after a bad deploy. The error rate rises in the request metrics.' },
      { edges: ['m-r'], text: 'The rule measures how fast the error budget is being spent: 2% of the monthly budget in an hour, or 5% in six hours.' },
      { edges: ['r-p'], text: "That's a fast burn, so it pages. Taxpayers are seeing errors now." },
      { edges: ['p-o'], text: 'The primary acknowledges within 5 minutes and opens the runbook linked from the alert.' },
      { edges: ['o-d', 'o-l'], text: 'Dashboards show which endpoint and which pods. A failing request\'s trace_id leads to its trace.' },
      { edges: ['o-c'], text: 'Support gets a banner and a script while the fix is underway.' },
      { nodes: ['oncall', 'api'], text: 'Roll back the deploy, watch the burn rate fall, and write up the incident.' },
    ],
  },
  {
    id: 'agency', title: 'Agency outage', steps: [
      { edges: ['ag-m'], text: 'The IRS starts returning errors and throttling. Agency error rate and 429s climb.' },
      { edges: ['wk-m', 'wk-l'], text: 'Batch runs finish partial with failed chunks, and returns overdue for a check start to accumulate.' },
      { edges: ['m-r', 'r-t'], text: 'Agency errors above normal for an hour open a ticket: "last checked" times are going stale.' },
      { edges: ['m-r', 'r-p'], text: 'If more than 1% of in-flight returns are overdue for 30 minutes in season, it pages.' },
      { edges: ['p-o', 'o-d'], text: "On-call confirms it's the agency, not us: other agencies are healthy, and our status reads are fine." },
      { edges: ['o-c'], text: 'Status reads come from our database, so taxpayers still see their last known status, with when it was checked. Support gets a script.' },
      { nodes: ['oncall', 'workers'], text: "Slow that agency's sync to respect its limits. When the agency recovers, the batch catches up within a run." },
    ],
  },
  {
    id: 'backlog', title: 'Filing backlog', steps: [
      { edges: ['wk-m'], text: 'The oldest unfiled return keeps getting older: the processor is stuck or can\'t keep up.' },
      { edges: ['m-r', 'r-p'], text: 'Older than 15 minutes pages, because every delay pushes the refund later.' },
      { edges: ['p-o', 'o-l'], text: 'Logs show processor tick failures. Traces show where processor.transmit spends its time.' },
      { nodes: ['oncall', 'workers'], text: 'If the agency\'s breaker is open, the agency is down: wait it out and tell support. If sending is at the agency\'s rate limit, more replicas won\'t help, because they share it; raise SUBMIT_RPS only if the agency allows. Otherwise fix the fault or add replicas.' },
    ],
  },
  {
    id: 'skipped', title: 'Batch runs skipped', steps: [
      { edges: ['wk-m'], text: 'A run takes longer than the minute between runs. Runs never overlap, so the next one is skipped.' },
      { edges: ['m-r', 'r-t'], text: 'Two failed or skipped runs in a row for one agency open a ticket.' },
      { edges: ['m-r', 'r-p'], text: 'A third in a row pages.' },
      { edges: ['p-o', 'o-d', 'o-l'], text: 'batch_runs shows the durations. The slow run\'s trace shows whether chunks, retries, or writes took the time.' },
      { nodes: ['oncall', 'workers'], text: "Add shards, up to the agency's rate limit, or lengthen the interval." },
    ],
  },
  {
    id: 'database', title: 'Database pressure', steps: [
      { edges: ['db-m'], text: 'Replication lag passes 30 seconds, connections pass 80% of the pool, or disk passes 75%.' },
      { edges: ['m-r', 'r-p'], text: 'Any of the three pages, before it becomes errors.' },
      { edges: ['p-o', 'o-d'], text: 'Dashboards show which workload is driving it.' },
      { nodes: ['oncall', 'postgres'], text: 'Move reporting to replicas, add pool capacity, or extend disk. If the primary is unhealthy, follow the failover runbook.' },
    ],
  },
  {
    id: 'synthetic', title: 'Synthetic check failing', steps: [
      { edges: ['sy-m'], text: "Checks from two or more regions can't sign in or read a status." },
      { edges: ['m-r', 'r-p'], text: 'It pages even if internal metrics look healthy. The outside view is what taxpayers see.' },
      { edges: ['p-o', 'o-d'], text: "Internal dashboards look fine, which points outside the cluster: DNS, the edge, or a certificate." },
      { edges: ['o-c'], text: 'Support gets a banner while it is fixed.' },
    ],
  },
]

export default function MonitoringDiagram() {
  return (
    <StepDiagram
      id="mon"
      nodes={NODES}
      edges={EDGES}
      flows={FLOWS}
      height={500}
      label="What is monitored, and how alerts reach on-call"
      hint="Select something on the left to see what's measured there and which alerts use it. Or pick a workflow to follow one alert from the first bad signal to the fix."
    />
  )
}
