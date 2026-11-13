import { Link } from 'react-router-dom'
import { Demo, Planned } from '../components/Flowchart.jsx'
import AvailabilityDiagram from './AvailabilityDiagram.jsx'

function Stat({ value, label }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

const Badge = ({ status }) => (status === 'demo' ? <Demo /> : <Planned />)

// [objective, target, how it's measured]
const OBJECTIVES = [
  ['Status reads available', '99.95% in season (January to May), 99.9% otherwise. About 22 minutes of failures a month in season.', 'Share of valid status reads that succeed within 2 seconds, at the load balancer'],
  ['Sign-in available', '99.9%', 'Share of sign-in attempts that get an answer, right or wrong password, within 2 seconds'],
  ['Filings accepted', '99.9%', 'Share of valid submissions saved durably. Sending to the agency happens later, from a queue'],
  ['Status read latency', 'p50 under 100 ms, p99 under 300 ms. p99 under 1 second while degraded', 'At the API, for successful reads'],
  ['Freshness', '99% of in-flight returns checked within an hour of being due, and every answer shows its age', 'From next_check_at and last_checked_at'],
  ['No lost data', 'No committed filing or status change is ever lost (RPO zero)', 'Synchronous standby in a second zone; failover game days'],
  ['Recovery', 'Reads: no interruption from losing a zone or the primary. Writes: back within 2 minutes of losing the primary', 'Game days, and real incidents'],
]

// [dependency, on the read path?, if it's down, status]
const DEPENDENCIES = [
  ['Agencies', 'No. Only the batch sync and the processor call them', 'Reads are unaffected; "last checked" ages', 'demo'],
  ['Prediction model', 'No. Estimates are computed during the batch sync and stored', 'The last estimate, or published agency guidance', 'planned'],
  ['Postgres primary', 'Not for writes: checking a session only reads. Until replicas exist, the demo\'s single Postgres also answers reads', 'Reads continue from replicas; filing and sign-in wait for failover', 'planned'],
  ['Read replicas', 'Yes', 'Another zone\'s replica, then the primary, then the status cache', 'planned'],
  ['Status cache', 'Sessions, and statuses as a last resort', 'Sessions are checked on a replica; statuses come from replicas as usual', 'planned'],
  ['Notifications, admin, reporting', 'No', 'Nothing a taxpayer would notice on the status page', 'demo'],
  ['Identity provider and MFA vendor', 'Sign-in only', 'Signed-in taxpayers keep working; new sign-ins wait', 'planned'],
]

// [step, normal, timeout, on timeout]
const BUDGET = [
  ['Check the session (cache)', '~1 ms', '50 ms', 'Check it on a replica'],
  ['Read statuses (zone replica)', '2–10 ms', '150 ms', 'Retry once on another zone\'s replica, then the primary'],
  ['Read statuses (primary)', 'Only on fallback', '300 ms', 'Answer from the status cache, with its age'],
  ['Whole request', 'p99 under 300 ms', '2 s deadline', 'Return 503; the portal retries once and keeps showing the last status'],
]

// [situation, taxpayer sees, still works, waits]
const DEGRADED = [
  ['An agency is down', 'Their last known status, with when it was checked', 'Everything', 'Fresh statuses from that agency'],
  ['A replica or a zone is lost', 'No difference, or an answer ~150 ms slower', 'Everything', 'Nothing'],
  ['The primary fails over (1–2 min)', 'Their status as usual', 'Status reads for signed-in taxpayers', 'Filing and sign-in, retried by the portal'],
  ['The database is unreachable', 'Their status, "as of" when the cache was written', 'Status reads, for sessions the cache can vouch for', 'Filing, sign-in, and history'],
  ['Load beyond the plan', 'Their status, maybe more slowly', 'Status reads and sign-in protections', 'Notifications, estimate refreshes, and admin reports are shed first'],
]

export default function Availability() {
  return (
    <>
      <p className="eyebrow">Requirements</p>
      <h1>Availability &amp; Latency</h1>
      <p className="lede">
        Taxpayers read their status far more often than anything is written, and they read it hardest in the weeks
        when every other system is busiest. The service has to answer through all of it. When availability and latency
        pull against each other, availability wins: a slower answer, or an older one that says how old it is, beats an
        error.
      </p>

      <div className="stats">
        <Stat value="99.95%" label="status reads available in season" />
        <Stat value="< 300 ms" label="p99 status read" />
        <Stat value="0" label="read outage from losing a zone" />
        <Stat value="0" label="committed filings lost" />
      </div>

      <blockquote className="callout">
        Someone who asks where their refund is always gets an answer: the current status if we have it, the last one
        we know with its age if we don't. Never someone else's, and never a contradictory one.
      </blockquote>

      <section>
        <h2>When they conflict</h2>
        <ol>
          <li>
            <strong>Never wrong.</strong> A status that's old and says so isn't wrong. Another taxpayer's status, or one
            that contradicts what the agency told them, is.
          </li>
          <li>
            <strong>Always answer.</strong> Spend latency, money, and freshness to keep answering.
          </li>
          <li>
            <strong>Answer fast.</strong> Inside the first two, as fast as we can.
          </li>
        </ol>
        <p>
          Freshness gives way to availability because agency data is already hours old: the IRS updates refund status
          about once a day. A read a few seconds behind the primary changes nothing a taxpayer can see. See{' '}
          <Link to="/technical-design/assumptions">Assumptions</Link>.
        </p>
      </section>

      <section>
        <h2>What read-heavy means here</h2>
        <table className="metrics">
          <thead>
            <tr><th>Traffic at peak</th><th>Rate</th><th>Needs the primary?</th></tr>
          </thead>
          <tbody>
            <tr><td>Status reads</td><td>~280 a second, bursts to ~1,000</td><td>No</td></tr>
            <tr><td>Filings</td><td>~100 a second in the busiest hour</td><td>Yes</td></tr>
            <tr><td>Status changes from agencies</td><td>~400 a second during a batch run</td><td>Yes, from background workers only</td></tr>
          </tbody>
        </table>
        <ul className="points">
          <li>
            <strong>Reads don't need the writable database,</strong> so they shouldn't depend on it. Replicas answer
            them, and a cache can answer them when no database can.
          </li>
          <li>
            <strong>Reads are cheap:</strong> one indexed lookup, a few milliseconds. One replica could carry the whole
            peak. We run one per zone to survive losing a zone, not to add throughput.
          </li>
          <li>
            <strong>The latency objective has a lot of headroom.</strong> A normal read takes tens of milliseconds
            against a 300 ms target. That headroom is what pays for timeouts, retries, and fallbacks.
          </li>
        </ul>
        <p>
          Numbers from <Link to="/technical-design/non-functional/capacity">Capacity Estimates</Link>.
        </p>
      </section>

      <section>
        <h2>Objectives</h2>
        <table className="metrics">
          <thead>
            <tr><th>Objective</th><th>Target</th><th>Measured as</th></tr>
          </thead>
          <tbody>
            {OBJECTIVES.map(([name, target, measure]) => (
              <tr key={name}><td>{name}</td><td>{target}</td><td>{measure}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          Alerts and dashboards for these live in <Link to="/operations/monitoring">Monitoring &amp; Alerting</Link>.
        </p>
      </section>

      <section>
        <h2>What counts as available</h2>
        <ul className="points">
          <li>
            <strong>Good:</strong> any answer within 2 seconds, including the taxpayer's own mistakes: a wrong password,
            an expired session, a return that doesn't exist.
          </li>
          <li>
            <strong>Bad:</strong> server errors, timeouts, anything slower than 2 seconds, and requests we turn away to
            shed load. Past 2 seconds, people refresh, so a slow answer is as good as no answer.
          </li>
          <li>
            <strong>Degraded:</strong> an answer from a fallback, such as the status cache, counts as good, so the
            objective isn't spent when the design works. Degraded answers are counted separately, and more than 1% for
            15 minutes opens an incident, so fallbacks can't hide a real outage.
          </li>
          <li>
            <strong>Measured from outside too.</strong> Synthetic checks from several regions sign in and read a status
            every minute, catching DNS, edge, and certificate failures that internal metrics miss.
          </li>
        </ul>
      </section>

      <section>
        <h2>The error budget sets priorities</h2>
        <p>The two objectives are enforced differently, on purpose:</p>
        <table className="metrics compare">
          <thead>
            <tr><th></th><th>Availability</th><th>Latency</th></tr>
          </thead>
          <tbody>
            <tr><td>Alert</td><td>Pages when the budget burns fast: 2% of the month's in an hour, or 5% in six hours</td><td>Opens a ticket when p99 is over 300 ms for 30 minutes. Pages only over 1 second, where slow is about to become unavailable</td></tr>
            <tr><td>Budget half spent in season</td><td>Only fixes ship until it recovers</td><td>No release freeze</td></tr>
            <tr><td>When the fix costs the other</td><td>Accepted: retries and fallbacks add latency</td><td>Not accepted if it adds a way to fail</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>The read path</h2>
        <AvailabilityDiagram />
      </section>

      <section>
        <h2>Keep dependencies off the read path</h2>
        <p>Every dependency a status read waits on can take it down. The list is kept short on purpose:</p>
        <table className="metrics">
          <thead>
            <tr><th>Dependency</th><th>On the read path?</th><th>If it's down</th><th>Status</th></tr>
          </thead>
          <tbody>
            {DEPENDENCIES.map(([dep, onPath, down, status]) => (
              <tr key={dep}><td>{dep}</td><td>{onPath}</td><td>{down}</td><td><Badge status={status} /></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Sessions that don't write</h2>
        <p>
          Extending a session's expiry on every signed-in request would make every status read a write: a primary
          failover would take reads down with it, and the busiest table in a read-heavy service would be{' '}
          <code>sessions</code>. So checking a session only reads:
        </p>
        <ul className="checks">
          <li><Demo /> A session is extended at most once every 5 minutes, in the background. If that write fails, the request still succeeds. Idle timeouts stay accurate to within 5 minutes.</li>
          <li><Demo /> If the database can't confirm a session, the request is rejected with a 503, and the cookie is kept for when it can. This is the one place we choose security over availability.</li>
          <li><Planned /> Check sessions in the status cache, falling back to a replica.</li>
          <li><Planned /> Signing out and account locks write to the primary and remove the session from the cache at once.</li>
        </ul>
      </section>

      <section>
        <h2>Seeing your own filing</h2>
        <p>
          Replicas trail the primary by up to a second. Right after filing, the dashboard could briefly miss the new
          return, which is exactly the kind of moment that leads to a duplicate filing. So:
        </p>
        <ul className="checks">
          <li><Planned /> The submit response includes the saved return, and the portal shows it straight away.</li>
          <li><Planned /> For 30 seconds after a taxpayer's own write, their reads go to the primary. If the primary is down, they go to a replica as usual.</li>
        </ul>
      </section>

      <section>
        <h2>Spending latency to stay up</h2>
        <table className="metrics">
          <thead>
            <tr><th>Step</th><th>Normally</th><th>Timeout</th><th>On timeout</th></tr>
          </thead>
          <tbody>
            {BUDGET.map(([step, normal, timeout, then]) => (
              <tr key={step}><td>{step}</td><td>{normal}</td><td>{timeout}</td><td>{then}</td></tr>
            ))}
          </tbody>
        </table>
        <ul className="points">
          <li>
            <strong>Retries are budgeted.</strong> At most 10% of a pod's requests may be retries, and a replica that
            times out is skipped for 30 seconds. A slow database gets less traffic, not a retry storm.
          </li>
          <li>
            <strong>The portal retries once,</strong> after 0.5 to 1.5 seconds of jitter, so a failed zone doesn't turn
            into a synchronized wave of refreshes. If that fails, it keeps showing the last status it loaded.
          </li>
        </ul>
      </section>

      <section>
        <h2>Topology</h2>
        <ul className="checks">
          <li><Planned /> One region, three availability zones. Every tier runs in all three.</li>
          <li><Planned /> In season, each zone runs at no more than two-thirds of its capacity, so losing any one zone leaves enough for the full peak. Capacity is added before each peak, not by waiting for autoscaling.</li>
          <li><Planned /> Managed Postgres: a primary, a synchronous standby in a second zone, and a read replica in each zone behind a connection pooler.</li>
          <li><Planned /> If the standby is lost, commits continue without it rather than stop, and an alert fires. For those minutes, losing the primary too could lose recent commits. We accept that small window rather than turn filings away.</li>
          <li><Planned /> A status cache with a replica in each zone, written by the batch sync after each commit.</li>
          <li><Planned /> API and portal pods spread across zones, with PodDisruptionBudgets.</li>
          <li><Demo /> Two replicas each of the API, portal, and processor, so losing a pod doesn't stop the service. Postgres is a single pod.</li>
        </ul>
      </section>

      <section>
        <h2>Degraded modes</h2>
        <table className="metrics">
          <thead>
            <tr><th>Situation</th><th>Taxpayer sees</th><th>Still works</th><th>Waits</th></tr>
          </thead>
          <tbody>
            {DEGRADED.map(([what, sees, works, waits]) => (
              <tr key={what}><td>{what}</td><td>{sees}</td><td>{works}</td><td>{waits}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          The order load is shed in, and the game days that test each row, are in{' '}
          <Link to="/operations/peak-season">Peak Season Readiness</Link>.
        </p>
      </section>

      <section>
        <h2>What this costs</h2>
        <ul className="points">
          <li><strong>Freshness:</strong> reads may trail the primary by a second, and fallbacks by minutes. Every answer shows its age.</li>
          <li><strong>Write latency:</strong> waiting for the standby in another zone adds a few milliseconds to every commit.</li>
          <li><strong>Money:</strong> three zones running at two-thirds, and a cache we don't need for speed.</li>
          <li><strong>Complexity:</strong> two places a status can come from. The cache is written only after the database commits and read only when the database can't answer, so it can lag but never contradict.</li>
        </ul>
      </section>

      <section>
        <h2>Revisit when</h2>
        <ul className="points">
          <li>
            <strong>A regional outage becomes a credible risk, or the target rises past 99.95%.</strong> Being read-heavy
            makes a second region cheap: an async replica and cache there can serve status reads read-only while filing
            waits for the home region.
          </li>
          <li>
            <strong>An agency offers push updates.</strong> Freshness would then be minutes, and the read-your-own-writes
            window and cache refresh would need tightening to match.
          </li>
          <li>
            <strong>Reads stop being cheap,</strong> for example if live predictions move onto the read path. Then the
            cache would also be needed for latency, and the timeouts above would need a new budget.
          </li>
        </ul>
      </section>
    </>
  )
}
