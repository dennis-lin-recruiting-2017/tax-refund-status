import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'
import { GuideContents, GuideNav } from '../components/Guide.jsx'

function Page({ title, lede, children }) {
  return (
    <>
      <p className="eyebrow">Batch Status Sync</p>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
      <GuideNav />
    </>
  )
}

function Flow() {
  const box = (title, detail, kind = '') => (
    <div className={`flow-box ${kind}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
  return (
    <figure className="flow" aria-label="Batch status sync data flow">
      <div className="flow-lane">
        <p className="flow-lane-label">Customer path: always reads our data</p>
        <div className="flow-row">
          {box('Taxpayer', 'Portal')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('API', 'Reads stored status')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Postgres', 'tax_returns, history', 'store')}
        </div>
      </div>
      <div className="flow-lane">
        <p className="flow-lane-label">Filing: seconds after submission</p>
        <div className="flow-row">
          {box('Processor', 'Duplicate screening (pgvector)')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Agency e-file', 'IRS, state FTBs', 'external')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Postgres', 'submission ID, first check due', 'store')}
        </div>
      </div>
      <div className="flow-lane">
        <p className="flow-lane-label">Status sync: scheduled runs throughout the day</p>
        <div className="flow-row">
          {box('Scheduler', 'CronJob per agency')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Batch shards', 'Claim due returns, 100 per chunk')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Agency status', 'Bulk lookup, rate-limited', 'external')}
          <span className="flow-arrow" aria-hidden="true">→</span>
          {box('Postgres', 'status, next check', 'store')}
        </div>
      </div>
    </figure>
  )
}

function Overview() {
  return (
    <Page
      title="Batch Status Sync"
      lede="Keep the status of every in-flight return current by asking the tax agencies in scheduled batches, instead of on every customer request."
    >
      <section>
        <h2>Why batch</h2>
        <p>
          The agencies own refund status: the IRS for federal returns, and each state's revenue agency for state returns.
          We can only learn it by asking them. Three facts make batching the right fit:
        </p>
        <ul className="points">
          <li>
            <strong>Agency data changes slowly.</strong> The IRS updates refund status about once a day, overnight.
            Asking it 50 times a day about the same return returns the same answer 49 times.
          </li>
          <li>
            <strong>Customer traffic is spiky; agency capacity isn't.</strong> Reads peak at ~1,000 a second on
            refund-release mornings (see <Link to="/technical-design/requirements/non-functional/capacity">Capacity Estimates</Link>).
            Passing those through would exceed agency rate limits exactly when customers care most.
          </li>
          <li>
            <strong>Agencies offer bulk lookups.</strong> One request can carry up to 100 submission IDs, so a batch
            costs 1% of the requests that one-at-a-time lookups would.
          </li>
        </ul>
        <blockquote className="callout">
          Customers read status from our database, which batch runs keep current on our schedule and within each
          agency's limits.
        </blockquote>
      </section>

      <section>
        <h2>How it fits together</h2>
        <Flow />
        <ol className="points">
          <li>
            <strong>File.</strong> The API stores the return as <em>Received</em>. Within seconds the processor screens
            it for near-duplicates, then transmits it to the agency and stores the submission ID. The return is now{' '}
            <em>Processing</em> and due for its first check.
          </li>
          <li>
            <strong>Sync.</strong> A scheduler starts a run for each agency several times a day. The run's shards claim
            due returns in chunks of 100, call the agency's bulk status endpoint, and store each answer along with the
            next time that return should be checked.
          </li>
          <li>
            <strong>Read.</strong> The portal shows the stored status, the history, and when we last checked with the
            agency.
          </li>
        </ol>
      </section>

      <section>
        <h2>Key properties</h2>
        <ul className="checks">
          <li>Customer reads never wait on, or add load to, an agency.</li>
          <li>Each agency gets its own schedule, rate limit, and credentials.</li>
          <li>Runs scale out by adding shards; shards never check the same return.</li>
          <li>A failed chunk or run is retried by the next run with no manual cleanup.</li>
          <li>Every run is recorded in <code>batch_runs</code> with its trace ID, so any run can be opened in Jaeger.</li>
        </ul>
      </section>

      <section>
        <h2>In the demo</h2>
        <p>
          The demo runs the same design with mock IRS, California FTB, and New York DTF services and compressed timing: runs every
          minute on Kubernetes (every 15 seconds in Docker and dev mode) instead of a few times a day. Try it in{' '}
          <Link to="/demo/local-kubernetes">Local Kubernetes</Link>.
        </p>
      </section>

      <GuideContents />
    </Page>
  )
}

function Scheduling() {
  return (
    <Page title="Scheduling" lede="When runs happen, and when each return is due to be checked again.">
      <section>
        <h2>Run schedule</h2>
        <p>
          Each agency has its own schedule, set just after its own update cycle so a run sees fresh data. For example:
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Agency</th><th>Updates</th><th>Runs (Eastern time)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>IRS</td>
              <td>Once a day, overnight</td>
              <td>05:00 main run; 11:00, 16:00, 21:00 catch-up runs for new transmissions and retries</td>
            </tr>
            <tr>
              <td>State agencies</td>
              <td>Varies: daily to several times a day</td>
              <td>Set per agency from its published update times and rate limit</td>
            </tr>
          </tbody>
        </table>
        <p>
          Runs for the same agency never overlap (<code>concurrencyPolicy: Forbid</code>). If a run is still going at the
          next scheduled time, that slot is skipped and the next run picks up whatever is still due.
        </p>
      </section>

      <section>
        <h2>When a return is due</h2>
        <p>
          Every return has a <code>next_check_at</code>. A run checks only returns that were due when it started, and
          each answer sets the next due time:
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Status after a check</th><th>Next check</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr><td>Just transmitted</td><td>Next run</td><td>Confirm the agency has it</td></tr>
            <tr><td>Processing</td><td>Next agency update cycle</td><td>Nothing changes between updates</td></tr>
            <tr><td>Approved, payment date ahead</td><td>On the payment date</td><td>Nothing else changes before then</td></tr>
            <tr><td>Approved, payment date today or past</td><td>Next update cycle</td><td>Watch for Sent</td></tr>
            <tr><td>Sent, Accepted</td><td>Never</td><td>Final status (an operator can force a recheck)</td></tr>
            <tr><td>Agency needs more information</td><td>Next update cycle</td><td>The agency resolves it when the taxpayer responds</td></tr>
            <tr><td>Held by our duplicate screening</td><td>Never (until released)</td><td>Not transmitted yet</td></tr>
            <tr><td>Agency didn't recognise it, or the check failed</td><td>Next run</td><td>Try again</td></tr>
          </tbody>
        </table>
        <p>
          Up to 10% random jitter is added to each due time, so millions of returns filed on the same day don't all come
          due in the same second. This policy is what brings agency lookups from ~140M to ~50M on a peak day (see{' '}
          <Link to="/technical-design/requirements/non-functional/capacity">Capacity Estimates</Link>).
        </p>
      </section>

      <section>
        <h2>Order within a run</h2>
        <p>
          A run claims the most overdue returns first (<code>ORDER BY next_check_at</code>). If a run can't finish within
          its window, the oldest checks are done and the remainder rolls into the next run.
        </p>
      </section>

      <section>
        <h2>Demo timing</h2>
        <table className="metrics">
          <thead>
            <tr><th>Setting</th><th>Production</th><th>Demo</th></tr>
          </thead>
          <tbody>
            <tr><td>Runs per agency</td><td>~4 a day</td><td>Every minute (Kubernetes), every 15 s (Docker, dev)</td></tr>
            <tr><td><code>RECHECK_INTERVAL_SECONDS</code></td><td>Hours, matched to the agency cycle</td><td>10</td></tr>
            <tr><td>Agency approves / sends</td><td>Days to weeks</td><td>20 s / 45 s after transmission</td></tr>
          </tbody>
        </table>
      </section>
    </Page>
  )
}

function Sharding() {
  return (
    <Page title="Sharding & Scale" lede="Splitting a run across workers, and sizing it for 40 million customers.">
      <section>
        <h2>Shards</h2>
        <p>
          A run is split into shards by a hash of the return ID: shard <em>i</em> of <em>N</em> only claims returns where{' '}
          <code>hash(id) mod N = i</code>. On Kubernetes each run is an Indexed Job, and each pod reads its shard number
          from <code>JOB_COMPLETION_INDEX</code>.
        </p>
        <CodeBlock label="kubernetes/batch.yaml (excerpt)">{`kind: CronJob
spec:
  schedule: "0 5,11,16,21 * * *"   # demo: every minute
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      completionMode: Indexed
      completions: 8               # shards
      parallelism: 8
      template:
        spec:
          containers:
            - args: ["batch-run", "federal"]
              env:
                - { name: BATCH_SHARDS, value: "8" }`}</CodeBlock>
      </section>

      <section>
        <h2>Claiming work</h2>
        <p>
          Within a shard, several workers claim chunks of up to 100 due returns at a time. A claim sets a short lease in
          the same statement that selects the rows:
        </p>
        <CodeBlock label="Claim the next chunk">{`UPDATE tax_returns SET lease_until = now() + interval '2 minutes'
WHERE id IN (
  SELECT id FROM tax_returns
  WHERE jurisdiction = $1
    AND status IN ('processing', 'approved')
    AND next_check_at <= $run_started_at
    AND (lease_until IS NULL OR lease_until < now())
    AND mod(abs(hashtext(id::text)), $shards) = $shard
  ORDER BY next_check_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED)
RETURNING id, agency_submission_id, status;`}</CodeBlock>
        <ul className="points">
          <li>
            <strong>SKIP LOCKED</strong> means concurrent workers take different rows instead of waiting on each other.
          </li>
          <li>
            <strong>The lease</strong> keeps a claimed return out of other workers' hands while its agency call is in
            flight, without holding a database transaction open during the network call.
          </li>
          <li>
            <strong>A partial index</strong> on <code>(jurisdiction, next_check_at)</code>, covering only in-flight
            returns, keeps the query fast however many settled returns pile up.
          </li>
        </ul>
        <p>
          Results for a chunk are written in one transaction: the new status, a history entry for anything that changed,
          and the next due time.
        </p>
      </section>

      <section>
        <h2>Sizing a run</h2>
        <p>
          From <Link to="/technical-design/requirements/non-functional/capacity">Capacity Estimates</Link>: a peak-day IRS run checks
          ~7.5M returns, 75,000 bulk requests. Three limits decide how many shards it needs:
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Limit</th><th>Example</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Agency rate limit</td>
              <td>25 requests/s</td>
              <td>75,000 ÷ 25 = 50 minutes minimum, however many shards</td>
            </tr>
            <tr>
              <td>Agency latency</td>
              <td>~300 ms per bulk request</td>
              <td>25 req/s × 0.3 s ≈ 8 requests in flight → 8 workers in total</td>
            </tr>
            <tr>
              <td>Database writes</td>
              <td>~2,500 row updates/s</td>
              <td>Comfortable for one primary with 100-row transactions</td>
            </tr>
          </tbody>
        </table>
        <p>
          So the IRS run uses 2 shards × 4 workers, each shard limited to half the agency's rate. Smaller state agencies
          need one shard. The rate limit is shared: each process gets <code>AGENCY_RPS ÷ BATCH_SHARDS</code>.
        </p>
      </section>

      <section>
        <h2>Scaling knobs</h2>
        <table className="metrics">
          <thead>
            <tr><th>Setting</th><th>Raise it when</th></tr>
          </thead>
          <tbody>
            <tr><td><code>completions</code>, <code>parallelism</code>, <code>BATCH_SHARDS</code></td><td>Runs miss their window and the agency has rate limit to spare</td></tr>
            <tr><td><code>BATCH_WORKERS</code></td><td>Agency latency is high relative to its rate limit</td></tr>
            <tr><td><code>AGENCY_RPS</code></td><td>The agency raises your limit</td></tr>
            <tr><td>Runs per day</td><td>The agency starts updating more often</td></tr>
          </tbody>
        </table>
      </section>
    </Page>
  )
}

function Agencies() {
  return (
    <Page title="Agency Integration" lede="Bulk status calls, credentials, rate limits, and retries.">
      <div className="note">
        <strong>No agency offers this API today.</strong> E-file providers learn whether a return was accepted or
        rejected through the IRS Modernized e-File (MeF) acknowledgment system, which states also use. Refund status
        after acceptance is only available to taxpayers themselves, through the IRS "Where's My Refund?" tool and each
        state's equivalent. This design assumes a partner status feed with the shape below; the demo's mock agencies
        provide it, plus operator controls for the{' '}
        <Link to="/demo/admin-console">admin console</Link>.
      </div>

      <section>
        <h2>The interface</h2>
        <p>Each agency client speaks two operations, behind one adapter per agency:</p>
        <table className="metrics">
          <thead>
            <tr><th>Call</th><th>Used by</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><code>POST /v1/returns</code></td>
              <td>Processor</td>
              <td>Transmit a return. Our return ID is the idempotency key; the response is the agency's submission ID.</td>
            </tr>
            <tr>
              <td><code>POST /v1/statuses/batch-get</code></td>
              <td>Batch runs</td>
              <td>Status for up to 100 submission IDs, with payment date and when the agency last changed each one.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Whatever each agency eventually offers (a bulk feed, files dropped on a schedule, or acknowledgments only), an
          adapter per agency turns it into these two calls, so the batch system doesn't change when an agency is added.
        </p>
        <p>Agency statuses map to ours:</p>
        <table className="metrics">
          <thead>
            <tr><th>Agency says</th><th>We show</th></tr>
          </thead>
          <tbody>
            <tr><td>received, processing</td><td>Processing</td></tr>
            <tr><td>approved (with payment date)</td><td>Approved</td></tr>
            <tr><td>sent (the refund as filed)</td><td>Refund sent</td></tr>
            <tr><td>adjusted (a different refund, with the reason)</td><td>Refund adjusted</td></tr>
            <tr><td>accepted (no refund)</td><td>Accepted</td></tr>
            <tr><td>action required (agency needs more information)</td><td>Action needed</td></tr>
            <tr><td>not found</td><td>No change; checked again next run</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Credentials</h2>
        <ul className="points">
          <li>Each agency issues its own credentials. Production uses mutual TLS plus an API credential per agency, stored in a secret manager and rotated.</li>
          <li>Only the processor and batch pods can reach agencies; network policies block everything else.</li>
          <li>Requests carry submission IDs and our return IDs only: no names, tax IDs, or bank details.</li>
        </ul>
      </section>

      <section>
        <h2>Rate limits</h2>
        <p>
          Every client waits on a token bucket before each request (<code>AGENCY_RPS</code>, divided across shards). A{' '}
          <code>429</code> response's <code>Retry-After</code> is always honoured, so we slow down when the agency asks
          even if our own limit would allow more.
        </p>
      </section>

      <section>
        <h2>Retries</h2>
        <ul className="points">
          <li>
            <strong>Retried:</strong> network errors, <code>429</code>, and <code>5xx</code>, up to 4 attempts with
            exponential backoff (100 ms, 200 ms, 400 ms, plus jitter) or <code>Retry-After</code>, whichever is longer.
          </li>
          <li>
            <strong>Not retried:</strong> other <code>4xx</code> responses, which mean the request itself is wrong.
          </li>
          <li>
            <strong>Circuit breaker:</strong> after 5 failed chunks a run stops early instead of hammering an agency that
            is clearly down. See <Link to="/architecture/batch-sync/failures">Failure Handling</Link>.
          </li>
        </ul>
        <p>
          The mock agencies fail 5% of status calls on purpose, so every demo run exercises retries. In Jaeger they show up
          as a <code>503</code> span followed by a successful retry in the same trace.
        </p>
      </section>
    </Page>
  )
}

function Failures() {
  return (
    <Page title="Failure Handling" lede="What happens when a chunk, a run, or a whole agency fails.">
      <table className="metrics">
        <thead>
          <tr><th>Failure</th><th>What happens</th><th>Customer sees</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>One agency request fails after retries</td>
            <td>That chunk's leases expire; its returns stay due and the next run checks them. The run finishes as <em>partial</em>.</td>
            <td>Last known status, with an older "last checked" time</td>
          </tr>
          <tr>
            <td>Agency down</td>
            <td>After 5 failed chunks the circuit opens and the run stops. Each later run tries again.</td>
            <td>Same as above</td>
          </tr>
          <tr>
            <td>Worker pod crashes mid-run</td>
            <td>Leases on its chunks expire after <code>BATCH_LEASE_SECONDS</code>. The Job retries the pod (<code>backoffLimit</code>).</td>
            <td>Nothing</td>
          </tr>
          <tr>
            <td>Run overruns its window</td>
            <td>The next scheduled run is skipped (no overlap); remaining returns roll into the run after.</td>
            <td>Nothing</td>
          </tr>
          <tr>
            <td>Agency answers out of order, or omits IDs</td>
            <td>Results are matched by submission ID; omitted ones are released and checked next run.</td>
            <td>Nothing</td>
          </tr>
          <tr>
            <td>Transmission fails</td>
            <td>The return stays <em>Received</em> and is retried after a backoff with jitter. If the agency itself keeps failing, its circuit breaker pauses sending (see <Link to="/architecture/components/gateway">API Gateway</Link>).</td>
            <td>"We'll send your return shortly"</td>
          </tr>
        </tbody>
      </table>

      <section>
        <h2>Why retries are safe</h2>
        <ul className="points">
          <li>Status checks are reads; asking twice changes nothing at the agency.</li>
          <li>Storing a result is idempotent: a status only produces a history entry when it differs from the stored one.</li>
          <li>Transmission uses our return ID as the idempotency key, so a retried submit doesn't file twice.</li>
        </ul>
      </section>

      <section>
        <h2>Knowing something is wrong</h2>
        <ul className="points">
          <li>
            Every run writes a <code>batch_runs</code> row: status, returns checked, status changes, failed chunks, and
            trace ID.
          </li>
          <li>
            Alert when a run ends <em>failed</em> or <em>partial</em> twice in a row, or when any in-flight return hasn't
            been checked for more than a day:
          </li>
        </ul>
        <CodeBlock label="Returns overdue for a check">{`SELECT jurisdiction, count(*)
FROM tax_returns
WHERE status IN ('processing', 'approved')
  AND next_check_at < now() - interval '24 hours'
GROUP BY jurisdiction;`}</CodeBlock>
        <p>
          To investigate a run, copy its <code>trace_id</code> into Jaeger's search. See{' '}
          <Link to="/operations/tracing">Distributed Tracing</Link>.
        </p>
      </section>

      <section>
        <h2>Running a batch by hand</h2>
        <p>After an agency outage, run a catch-up batch without waiting for the schedule:</p>
        <CodeBlock>{`kubectl -n tax-refund create job --from=cronjob/batch-federal batch-federal-manual`}</CodeBlock>
      </section>
    </Page>
  )
}

export const batchSyncPages = {
  'batch-sync': Overview,
  'batch-scheduling': Scheduling,
  'batch-sharding': Sharding,
  'batch-agencies': Agencies,
  'batch-failures': Failures,
}
