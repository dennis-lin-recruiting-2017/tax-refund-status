import StepDiagram from '../components/StepDiagram.jsx'

// The status read path and the writers behind it. Walkthroughs follow a read through each failure the design
// plans for, showing which fallback answers it and what the taxpayer sees.

const NODES = {
  browser: {
    kind: 'actor', x: 20, y: 190, w: 130, h: 56, title: 'Portal', sub: 'taxpayer\'s browser',
    points: [
      ['demo', 'Shows when each return was last checked with its agency.'],
      ['planned', 'Retries a failed read once, after 0.5 to 1.5 seconds of jitter.'],
      ['planned', 'If the retry fails too, keeps the last loaded status on screen, marked "couldn\'t refresh". It\'s held in memory only, never in browser storage, because shared computers are common.'],
      ['planned', 'The page shell comes from the CDN, so it loads even while the API is down and can say so.'],
    ],
  },
  edge: {
    x: 190, y: 190, w: 140, h: 56, title: 'Edge and LB', sub: 'CDN · 3 zones',
    points: [
      ['demo', 'nginx in the portal pods proxies /api to the API service.'],
      ['planned', 'A load balancer across three zones. Health checks take a zone out of rotation within 30 seconds.'],
      ['planned', 'Bot defense and per-client limits run here, so abusive traffic is dropped before it costs the API anything.'],
    ],
  },
  api: {
    x: 370, y: 190, w: 140, h: 56, title: 'API', sub: 'stateless · 3 zones',
    points: [
      ['demo', 'Two replicas, holding no state of their own.'],
      ['demo', 'Checking a session only reads. Its expiry is extended at most every 5 minutes, in the background.'],
      ['planned', 'Spread evenly across three zones, with a PodDisruptionBudget so upgrades never take a zone\'s pods all at once.'],
      ['planned', 'Every request has a 2-second deadline, and every dependency has its own shorter timeout and a fallback.'],
      ['planned', 'Retries are capped at 10% of requests per pod, so a slow database isn\'t buried under retries.'],
    ],
  },
  cache: {
    kind: 'store', planned: true, x: 560, y: 30, w: 175, h: 56, title: 'Status cache', sub: 'Redis · 3 zones',
    points: [
      ['planned', 'Holds sessions, and each taxpayer\'s latest statuses with the time they were written.'],
      ['planned', 'The batch sync writes it after its database commit, so it can lag the database but never get ahead of it.'],
      ['planned', 'Statuses are read from it only when the database can\'t answer. It\'s there for availability, not speed: reads are already a few milliseconds.'],
    ],
  },
  replicas: {
    kind: 'store', planned: true, x: 560, y: 140, w: 175, h: 56, title: 'Read replicas', sub: 'one per zone',
    points: [
      ['planned', 'Answer every status read, from the replica in the API pod\'s own zone.'],
      ['planned', 'One replica could carry the whole peak, about 1,000 reads a second. There are three because there are three zones.'],
      ['planned', 'Usually under a second behind the primary. Agency data is hours old, so that doesn\'t matter.'],
    ],
  },
  primary: {
    kind: 'store', x: 560, y: 260, w: 175, h: 56, title: 'Postgres primary', sub: '+ sync standby',
    points: [
      ['demo', 'A single Postgres pod takes every read and write.'],
      ['planned', 'Managed Postgres, with a synchronous standby in a second zone: no committed filing is lost, and failover takes one to two minutes.'],
      ['planned', 'Takes writes only: filings, sign-ins, and the batch sync\'s status changes. Status reads don\'t need it.'],
    ],
  },
  batch: {
    x: 560, y: 380, w: 175, h: 56, title: 'Batch sync', sub: 'and processor',
    points: [
      ['demo', 'Writes status changes from the agencies in chunks of 100 per transaction.'],
      ['planned', 'Refreshes each changed taxpayer\'s entry in the status cache after the commit.'],
    ],
  },
  agencies: {
    kind: 'external', x: 370, y: 380, w: 140, h: 56, title: 'Agencies', sub: 'IRS and states',
    points: [
      ['demo', 'Reached only by background work, behind a circuit breaker per agency. A status read never waits on an agency.'],
    ],
  },
}

const EDGES = [
  { id: 'b-e', from: 'browser', to: 'edge', d: 'M150 218 H190' },
  { id: 'e-a', from: 'edge', to: 'api', d: 'M330 218 H370' },
  { id: 'a-c', from: 'api', to: 'cache', planned: true, d: 'M510 204 C536 204 534 58 560 58', label: 'sessions', lx: 528, ly: 120, anchor: 'end' },
  { id: 'a-r', from: 'api', to: 'replicas', planned: true, d: 'M510 214 C536 214 536 168 560 168', label: 'reads', lx: 540, ly: 186, anchor: 'end' },
  { id: 'a-p', from: 'api', to: 'primary', d: 'M510 230 C536 230 536 288 560 288', label: 'writes', lx: 540, ly: 268, anchor: 'end' },
  { id: 'p-r', from: 'primary', to: 'replicas', planned: true, d: 'M648 260 V196', label: 'replicate', lx: 656, ly: 232, anchor: 'start' },
  { id: 'bt-p', from: 'batch', to: 'primary', d: 'M648 380 V316', label: 'status changes', lx: 656, ly: 352, anchor: 'start' },
  { id: 'bt-c', from: 'batch', to: 'cache', planned: true, dashed: true, d: 'M735 400 C756 400 756 66 735 66', label: 'refresh', lx: 752, ly: 232, anchor: 'end' },
  { id: 'bt-ag', from: 'batch', to: 'agencies', d: 'M560 408 H510', label: 'bulk polls', lx: 535, ly: 400 },
]

const FLOWS = [
  {
    id: 'normal', title: 'Normal read', steps: [
      { edges: ['b-e', 'e-a'], text: 'The portal asks for the taxpayer\'s returns. The load balancer sends the request to an API pod in a healthy zone.' },
      { edges: ['a-c'], text: 'The API checks the session in the cache, in about a millisecond. Nothing is written: the session\'s expiry is extended at most every 5 minutes, in the background.' },
      { edges: ['a-r'], text: 'One indexed query on the replica in the same zone: 2 to 10 milliseconds.' },
      { nodes: ['browser'], text: 'Answered in well under 100 ms at the median. Against a 300 ms p99 objective that leaves a lot of room, and the walkthroughs below spend it on staying up.' },
    ],
  },
  {
    id: 'replica', title: 'A replica fails', steps: [
      { edges: ['a-r'], text: 'The zone\'s replica stops answering. The query times out after 150 ms.' },
      { nodes: ['replicas'], text: 'The API retries once on another zone\'s replica, and stops sending to the failed one for 30 seconds.' },
      { nodes: ['browser'], text: 'The taxpayer gets the same answer about 150 ms later. A slower answer, not an error.' },
    ],
  },
  {
    id: 'primary', title: 'The primary fails', steps: [
      { edges: ['a-p'], nodes: ['primary'], text: 'The primary goes down. The managed service promotes the synchronous standby in another zone. That takes one to two minutes, and no committed filing is lost.' },
      { edges: ['a-r'], text: 'Status reads don\'t notice: they come from replicas, and session checks write nothing.' },
      { edges: ['b-e', 'e-a'], text: 'For those minutes, filing a return and signing in fail. The portal retries, then asks the taxpayer to try again in a minute.' },
      { edges: ['p-r'], text: 'The replicas follow the new primary, and writes resume.' },
    ],
  },
  {
    id: 'zone', title: 'A zone goes down', steps: [
      { edges: ['e-a'], text: 'A whole zone fails: its API pods, its replica, and maybe the primary.' },
      { nodes: ['edge'], text: 'Health checks take the zone out of rotation within 30 seconds. Requests already in flight there are retried by the portal.' },
      { nodes: ['api', 'replicas'], text: 'Each zone is sized to run at no more than two-thirds of its capacity in season, so the other two zones absorb the full peak.' },
      { nodes: ['primary'], text: 'If the primary was in that zone, the "primary fails" walkthrough runs too. Reads carry on either way.' },
    ],
  },
  {
    id: 'database', title: 'Database unreachable', steps: [
      { edges: ['a-r', 'a-p'], text: 'Neither replicas nor the primary answer within their timeouts, for example during a network partition.' },
      { edges: ['a-c'], text: 'The API answers from the status cache: the last statuses the batch sync wrote, with when.' },
      { nodes: ['browser'], text: 'The taxpayer sees their status with "as of 10:42 AM". It counts as available, and as a degraded response, which has its own alert.' },
      { nodes: ['cache'], text: 'A session the cache can\'t vouch for is rejected, not trusted. Sign-in and filing wait for the database. Security is the one place availability doesn\'t win.' },
    ],
  },
  {
    id: 'agency', title: 'An agency is down', steps: [
      { edges: ['bt-ag'], text: 'The IRS returns errors. Its circuit breaker opens, and the batch sync backs off.' },
      { edges: ['a-r'], text: 'Status reads never touch an agency, so nothing changes for them.' },
      { nodes: ['browser'], text: 'The taxpayer sees their last known status, and "last checked" ages honestly. When the agency recovers, the batch catches up within a run.' },
    ],
  },
]

export default function AvailabilityDiagram() {
  return (
    <StepDiagram
      id="avail"
      nodes={NODES}
      edges={EDGES}
      flows={FLOWS}
      height={456}
      label="The status read path, its fallbacks, and the writers behind it"
      hint="Select a component to see what it does for availability. Or pick a walkthrough to follow a status read through a failure."
    />
  )
}
