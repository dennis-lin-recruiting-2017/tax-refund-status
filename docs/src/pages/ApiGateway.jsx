import { Link } from 'react-router-dom'
import { Demo, Planned } from '../components/Flowchart.jsx'

export default function ApiGateway() {
  return (
    <>
      <p className="eyebrow">Components</p>
      <h1>API Gateway</h1>
      <p className="lede">
        The way into the service, and the place where filing surges are absorbed. The gateway accepts a return in
        milliseconds and puts it in a queue for its agency, so a deadline-day rush never reaches the IRS or a state
        faster than that agency will take it.
      </p>

      <section>
        <h2>What it does</h2>
        <ul className="checks">
          <li><Demo /> nginx serves the portal and proxies <code>/api/</code> to the Go API, adding the client's address to X-Forwarded-For.</li>
          <li><Demo /> The API authenticates every request by session, checks the CSRF header, caps request bodies, and sets security headers.</li>
          <li><Demo /> Sign-in is rate limited per client and per account (see <Link to="/security/abuse-prevention">Abuse Prevention</Link>).</li>
          <li><Demo /> Status reads are answered from our own database. No customer request ever waits on an agency.</li>
          <li><Planned /> A managed load balancer and web application firewall in front, terminating TLS and enforcing rate limits at the edge.</li>
        </ul>
      </section>

      <section>
        <h2>Filing a return</h2>
        <ol className="timeline">
          <li><strong>Accept</strong><span>The API validates the return, computes it, and stores it as Return received in one transaction. That row is its place in its agency's queue.</span></li>
          <li><strong>Answer</strong><span>The taxpayer gets a 201 at once. Nothing they do waits on an agency, however busy it is.</span></li>
          <li><strong>Drain</strong><span>Processor replicas take returns from each agency's queue, screen them for fraud, and e-file them, never faster than that agency's rate limit.</span></li>
          <li><strong>Track</strong><span>Once sent, the return is due for its first status check in the next <Link to="/architecture/batch-sync">batch run</Link>.</span></li>
        </ol>
      </section>

      <section>
        <h2>Decision: queue submissions per agency, in Postgres</h2>

        <h3>Problem</h3>
        <p>
          Filing is a stampede. On a peak day about 1.7 million returns arrive, about 100 a second in the busiest hour (see{' '}
          <Link to="/technical-design/non-functional/capacity">Capacity Estimates</Link>). Each agency
          accepts only so many a second, and agencies slow down or go offline at exactly these times. Without a queue:
        </p>
        <ul className="points">
          <li><strong>A rush passes straight through.</strong> Adding processor replicas to keep up adds load on the agency instead.</li>
          <li><strong>Failures retry together.</strong> Returns that fail at the same moment all come back at the same moment, and hit a struggling agency again.</li>
          <li><strong>One agency blocks the others.</strong> In a single queue, the IRS being down holds up California and New York.</li>
          <li><strong>A failing return blocks the queue.</strong> If the oldest returns keep failing, they are picked first every time.</li>
        </ul>

        <h3>Options considered</h3>
        <table className="metrics compare">
          <thead>
            <tr><th>Option</th><th>For</th><th>Against</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Send to the agency while the taxpayer waits</td>
              <td>Simplest; the taxpayer sees the agency's answer at once</td>
              <td>Agency slowness and outages become our outage, exactly at the deadline. Rejected.</td>
            </tr>
            <tr>
              <td>A message broker (SQS, Kafka, RabbitMQ) with a queue per agency</td>
              <td>Built-in delays and dead-letter queues; scales far past Postgres; the usual choice at very large scale</td>
              <td>The return and its message are written to two systems, so we'd need an outbox to keep them in step. Another system to run, secure, and monitor. Rate limits and circuit breakers still have to be built on top.</td>
            </tr>
            <tr>
              <td><strong>A queue per agency in the returns table (chosen)</strong></td>
              <td>The return and its place in the queue commit together, so none is lost or sent twice. No new infrastructure. Queue depth is one SQL query.</td>
              <td>Queue traffic shares the database with everything else. Needs care with indexes and row locks.</td>
            </tr>
          </tbody>
        </table>

        <h3>How the queue works</h3>
        <table className="metrics">
          <thead>
            <tr><th>Mechanism</th><th>What it prevents</th><th></th></tr>
          </thead>
          <tbody>
            <tr>
              <td>One queue per agency, drained separately each tick</td>
              <td>One agency's outage or backlog holding up another's</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>A token bucket per agency in <code>agency_queues</code>, shared by every replica (<code>SUBMIT_RPS</code>)</td>
              <td>More processors meaning more load on the agency</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>Claims with a short lease and <code>FOR UPDATE SKIP LOCKED</code></td>
              <td>Two replicas sending the same return; a crashed replica losing one</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>Each failed return waits its own backoff: up to 2s, 4s, 8s… capped at 10 minutes, with full jitter</td>
              <td>Retry storms, and failing returns blocking the ones behind them</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>A circuit breaker per agency: 5 agency-side failures in a row stop sending for 30 seconds, then one probe decides</td>
              <td>Hammering an agency that is down, and wasting the batch on it</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>A return rejected for itself (a 4xx) retries on its own schedule without tripping the breaker</td>
              <td>One bad return shutting off an agency for everyone</td>
              <td><Demo /></td>
            </tr>
            <tr>
              <td>Alerts on the age of the oldest queued return, and on an open breaker</td>
              <td>A backlog no one notices (see <Link to="/operations/monitoring">Monitoring &amp; Alerting</Link>)</td>
              <td><Planned /></td>
            </tr>
            <tr>
              <td>Returns rejected repeatedly move to a review queue for support</td>
              <td>A return retrying forever without anyone knowing</td>
              <td><Planned /></td>
            </tr>
          </tbody>
        </table>
        <p>
          Tested with two processor replicas, <code>SUBMIT_RPS=1</code>, and 40 returns filed at once, with the New
          York agency down. Federal and California went out at one a second each across both replicas. New York's
          breaker opened after five failures without slowing the others, and its returns went out within seconds of
          the agency coming back.
        </p>

        <h3>Settings</h3>
        <table className="metrics">
          <thead>
            <tr><th>Variable</th><th>Default</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td><code>SUBMIT_RPS</code></td><td>10</td><td>Transmissions a second to each agency, across all processor replicas. Set from the agency's published limit, less what batch runs use.</td></tr>
            <tr><td><code>PROCESSOR_INTERVAL_MS</code></td><td>2000</td><td>How often each replica checks the queues</td></tr>
          </tbody>
        </table>

        <h3>Revisit when</h3>
        <ul className="points">
          <li>Queue writes and claims become a noticeable share of database load at peak.</li>
          <li>Other consumers need submission events, such as notifications or analytics. A broker fed from an outbox table becomes worth its cost.</li>
          <li>The service runs in more than one region.</li>
        </ul>
      </section>
    </>
  )
}
