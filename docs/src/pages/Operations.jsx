import { Link } from 'react-router-dom'
import { Demo, Planned } from '../components/Flowchart.jsx'
import MonitoringDiagram from './MonitoringDiagram.jsx'

// Operations pages: how the service is watched, and how it gets ready for filing season.

function MonitoringAlerting() {
  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1>Monitoring &amp; Alerting</h1>
      <p className="lede">
        How we know the service is working for taxpayers, and who gets woken up when it isn't. Attacks and misuse are
        covered separately in <Link to="/security/monitoring">Security Monitoring</Link>.
      </p>

      <section>
        <h2>What "working" means</h2>
        <p>
          Service level objectives are written from the taxpayer's side: can they see their status, quickly, and is it
          current and correct? Each has an error budget, and alerts fire on how fast the budget is being spent.
        </p>
        <table className="metrics compare">
          <thead>
            <tr><th>Objective</th><th>Target in season</th><th>Why it matters</th></tr>
          </thead>
          <tbody>
            <tr><td>Status reads that succeed</td><td>99.95%, about 22 minutes of failures a month</td><td>The page is worthless if it's down when everyone checks.</td></tr>
            <tr><td>Status read latency</td><td>p99 under 300 ms at the API</td><td>Slow pages get refreshed, which doubles the load.</td></tr>
            <tr><td>In-flight returns checked on time</td><td>99% checked within an hour of being due</td><td>Stale statuses create the support calls we exist to prevent.</td></tr>
            <tr><td>Returns transmitted after filing</td><td>99% within 15 minutes</td><td>Delays push the whole refund later.</td></tr>
            <tr><td>Status matches the agency</td><td>Under 0.01% mismatches in a daily sample</td><td>A wrong answer is worse than a slightly old one.</td></tr>
            <tr><td>Refunds landing inside the estimate</td><td>Set once the model ships</td><td>An estimate customers can't rely on creates calls.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>From signal to response</h2>
        <p>
          What's monitored is on the left, where the signals go is in the middle, and how an alert reaches a person is on
          the right. Pick a workflow to follow one alert end to end.
        </p>
        <MonitoringDiagram />
      </section>

      <section>
        <h2>What we measure</h2>
        <ul className="points">
          <li><strong>From the outside.</strong> Synthetic checks from several regions sign in with a test account and read a status every minute, and real-user monitoring reports page load times from browsers.</li>
          <li><strong>Each service.</strong> Request rate, errors, and latency for every endpoint, split by taxpayer and admin routes.</li>
          <li><strong>The workers.</strong> The age of the oldest return waiting to be filed; batch run duration against the schedule; returns overdue for a check; agency lookups a second against each agency's rate limit; 429s and failed chunks.</li>
          <li><strong>Dependencies.</strong> Postgres connections, locks, replication lag, and disk; each agency's error rate and latency.</li>
          <li><strong>The platform.</strong> Pod restarts, CPU and memory against limits, and autoscalers sitting at their maximum.</li>
        </ul>
        <ul className="checks">
          <li><Demo /> Structured JSON logs from every service, with the trace ID on each request line.</li>
          <li><Demo /> OpenTelemetry traces in Jaeger across the API, workers, Postgres, and agencies. See <Link to="/operations/tracing">Distributed Tracing</Link>.</li>
          <li><Demo /> Readiness and liveness probes on <code>/api/readyz</code> and <code>/api/healthz</code>.</li>
          <li><Demo /> Every batch run is recorded in <code>batch_runs</code> with its status and counts, and logged as a warning when it errors or a chunk fails.</li>
          <li><Planned /> OpenTelemetry metrics into Prometheus, with Grafana dashboards. The demo exports no metrics yet.</li>
          <li><Planned /> Exemplars on latency charts, so a slow point links straight to its trace.</li>
        </ul>
      </section>

      <section>
        <h2>What pages someone</h2>
        <p>
          Pages are for symptoms a taxpayer would notice, or will soon. Causes, like one pod restarting, go to dashboards
          and tickets.
        </p>
        <table className="metrics compare">
          <thead>
            <tr><th>Alert</th><th>Fires when</th><th>Severity</th></tr>
          </thead>
          <tbody>
            <tr><td>Status read errors</td><td>2% of the monthly error budget spent in an hour, or 5% in six hours</td><td>Page</td></tr>
            <tr><td>Status read latency</td><td>p99 over 300 ms for 10 minutes</td><td>Page</td></tr>
            <tr><td>Synthetic check failing</td><td>Failing from two or more regions</td><td>Page</td></tr>
            <tr><td>Returns overdue for a check</td><td>Over 1% of in-flight returns for 30 minutes</td><td>Page in season, ticket off season</td></tr>
            <tr><td>Filing backlog</td><td>Oldest unfiled return older than 15 minutes</td><td>Page</td></tr>
            <tr><td>Batch runs failing or skipped</td><td>Two runs in a row for one agency. A slow run makes the next one skip, since runs never overlap</td><td>Ticket, then page at three</td></tr>
            <tr><td>Agency errors or throttling</td><td>Above normal for an hour, so "last checked" times are going stale</td><td>Ticket, then page</td></tr>
            <tr><td>Status mismatches</td><td>The daily sample disagrees with the agency above baseline</td><td>Page</td></tr>
            <tr><td>Postgres health</td><td>Replication lag over 30 seconds, connections over 80%, or disk over 75%</td><td>Page</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>On-call</h2>
        <ul className="checks">
          <li><Planned /> A primary and a secondary on call around the clock in season, business hours off season. Pages are acknowledged within 5 minutes in season.</li>
          <li><Planned /> Every alert links to its runbook and dashboard. An alert without a runbook isn't allowed to page.</li>
          <li><Planned /> When the service is degraded, support agents see a banner with what to tell callers, and taxpayers see the last known status with when it was updated, rather than an error.</li>
          <li><Planned /> Every page is reviewed weekly. Alerts that didn't need a human are fixed or removed.</li>
        </ul>
      </section>

      <section>
        <h2>Dashboards</h2>
        <p>
          One season dashboard answers "are we OK?" at a glance: status reads a second against the forecast, error budget
          remaining, filings a second, returns in flight and overdue by agency, and each agency's health. Each service has
          its own dashboard below that for diagnosis.
        </p>
      </section>
    </>
  )
}

function PeakSeason() {
  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1>Peak Season Readiness</h1>
      <p className="lede">
        Filing season is a handful of predictable spikes. Getting ready is a calendar of work that ends with the system
        scaled up, frozen, and rehearsed before the first one.
      </p>

      <section>
        <h2>The peaks</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>When</th><th>What happens</th><th>Load to plan for</th></tr>
          </thead>
          <tbody>
            <tr><td>Season opens, late January</td><td>Early filers who were waiting for the IRS to start accepting returns</td><td>Filing peak: ~100 returns a second in the busiest hour</td></tr>
            <tr><td>Mid-February</td><td>The IRS can't issue refunds claiming the EITC or ACTC before mid-February, so a wave of held refunds is released together</td><td>Status reads burst toward ~1,000 a second</td></tr>
            <tr><td>Late February to March</td><td>Deposit mornings for the first big wave of refunds</td><td>Repeated read bursts; ~280 reads a second at the daily peak</td></tr>
            <tr><td>The days before April 15</td><td>Deadline filers</td><td>A second filing peak</td></tr>
            <tr><td>Late April to May</td><td>The tail of federal returns, and slower state refunds</td><td>30–35M returns in flight: the batch sync's busiest period</td></tr>
            <tr><td>October 15</td><td>The extension deadline, in the off season. See <Link to="/operations/peak-season/extension-deadline">Extension Deadline</Link></td><td>A smaller filing spike: ~14% of the year's returns arrive after mid-April</td></tr>
          </tbody>
        </table>
        <p>
          The numbers come from <Link to="/technical-design/non-functional/capacity">Capacity Estimates</Link>. Each one is
          planned at twice the forecast.
        </p>
      </section>

      <section>
        <h2>Readiness calendar</h2>
        <ol className="timeline">
          <li><strong>October–November: plan</strong><span>Update the capacity forecast from last season's actuals and growth. Confirm each agency's rate limits, and complete their annual testing for the new tax year.</span></li>
          <li><strong>December: prove</strong><span>Load test at twice the forecast peak. Run the game days below. Fix what breaks, and test again.</span></li>
          <li><strong>Early January: lock down</strong><span>Scale up ahead of the season, start the change freeze, staff on-call around the clock, and walk through every runbook. Brief support on what's new.</span></li>
          <li><strong>Season: watch</strong><span>A daily capacity review against the forecast, and a staffed war room on peak days.</span></li>
          <li><strong>After April 15: learn</strong><span>A season review, scale down, and lift the freeze. Feed the actual numbers into next year's plan.</span></li>
        </ol>
      </section>

      <section>
        <h2>Load testing</h2>
        <ul className="checks">
          <li><Planned /> Run against a production-sized environment with synthetic taxpayers, never real data.</li>
          <li><Planned /> Model the real mix together: status read bursts at 2,000 a second, a sign-in surge, filings at 200 a second, and the batch sync working through 35M in-flight returns.</li>
          <li><Planned /> Pass only if the objectives in <Link to="/operations/monitoring">Monitoring &amp; Alerting</Link> hold at twice the forecast, and the service degrades in the planned order beyond it.</li>
          <li><Demo /> The agency mocks can throttle with 429 and Retry-After and inject 503 errors, so the batch sync's backoff can be tested under load.</li>
        </ul>
      </section>

      <section>
        <h2>Scaling plan</h2>
        <ul className="checks">
          <li><Demo /> The API, processor, and portal run two replicas each. The processor claims work with <code>FOR UPDATE SKIP LOCKED</code>, so adding replicas adds throughput without double-filing.</li>
          <li><Demo /> Batch runs are sharded Indexed Jobs, and never overlap.</li>
          <li><Planned /> Scale up before each peak instead of waiting for autoscalers to react. Autoscaling stays on as a backstop, with season minimums raised.</li>
          <li><Planned /> Size batch shards to each agency's rate limit. Past that limit, more shards only cause more throttling.</li>
          <li><Planned /> Read replicas and connection pooling in front of Postgres, with vacuum and index maintenance done before the season, and data partitioned by tax year.</li>
          <li><Planned /> Static assets on a CDN, and cloud capacity reserved for the season.</li>
        </ul>
      </section>

      <section>
        <h2>Degrading gracefully</h2>
        <p>If load passes what we planned for, non-essential work is shed in this order:</p>
        <ol>
          <li>Delay status-change notifications.</li>
          <li>Pause refreshing refund estimates, and serve the last one.</li>
          <li>Check returns that aren't close to payment less often.</li>
          <li>Move admin and reporting queries entirely to replicas.</li>
        </ol>
        <p>
          Status reads and sign-in protections are never shed. When an agency is down, taxpayers see their last known
          status with when it was updated, not an error. Security controls are never relaxed to keep up.
        </p>
      </section>

      <section>
        <h2>Change freeze</h2>
        <ul className="checks">
          <li><Planned /> From mid-January to late April, only incident fixes and security patches ship, through an expedited review.</li>
          <li><Planned /> Features finished during the freeze ship turned off behind flags.</li>
          <li><Planned /> Only additive schema changes, tested against a production-sized copy first.</li>
          <li><Planned /> Deploys in quiet hours, with a one-step rollback.</li>
        </ul>
      </section>

      <section>
        <h2>Game days</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Scenario</th><th>We pass if</th></tr>
          </thead>
          <tbody>
            <tr><td>The IRS returns errors for two hours</td><td>Status reads are unaffected, "last checked" ages honestly, and the batch catches up within a run once it recovers</td></tr>
            <tr><td>The Postgres primary fails</td><td>Failover inside the objective, with no lost filings</td></tr>
            <tr><td>A zone goes down</td><td>Traffic shifts with no customer-visible errors</td></tr>
            <tr><td>A credential-stuffing surge during a read peak</td><td>Edge defenses absorb it, and honest sign-ins still succeed</td></tr>
            <tr><td>A bad deploy on a peak day</td><td>Detected by alerts and rolled back within 10 minutes</td></tr>
            <tr><td>The log or trace pipeline goes down</td><td>An alert fires, and the service keeps running</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Go / no-go before the season opens</h2>
        <ul className="checks">
          <li>Load test passed at twice the forecast, on the release that will run the season.</li>
          <li>Every game day passed, or its gaps have a fix in place.</li>
          <li>Pre-scaled, capacity reserved, and agency rate limits confirmed.</li>
          <li>On-call staffed, every paging alert has a runbook, and support is briefed.</li>
          <li>Change freeze announced, and feature flags in place for anything still risky.</li>
        </ul>
      </section>
    </>
  )
}

function ExtensionDeadline() {
  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1>Extension Deadline</h1>
      <p className="lede">
        Taxpayers who file for an extension have until October 15. That's a much smaller spike than April, but it lands
        in the off season, when the system is scaled down and fewer people are watching. Here's how big it is, and how
        we plan for it.
      </p>

      <section>
        <h2>How big it is</h2>
        <p>
          The IRS publishes cumulative filing-season statistics every week. Comparing the snapshot just after April 15
          with the one just after October 15 shows how much arrives late:
        </p>
        <table className="metrics compare">
          <thead>
            <tr><th>Individual returns</th><th>By mid-April</th><th>By mid-October</th><th>Arrived after mid-April</th></tr>
          </thead>
          <tbody>
            <tr><td>Returns received, 2024</td><td>139.1M (Apr 19)</td><td>161.5M (Oct 18)</td><td>~22.4M, 14% of the year</td></tr>
            <tr><td>Refunds issued, 2024</td><td>86.1M</td><td>103.2M</td><td>~17.1M, 17% of the year</td></tr>
            <tr><td>Returns received, 2025</td><td>140.6M (Apr 18)</td><td>163.6M (Oct 17)</td><td>~23.0M, 14% of the year</td></tr>
            <tr><td>Refunds issued, 2025</td><td>86.0M</td><td>102.1M</td><td>~16.1M, 16% of the year</td></tr>
            <tr><td>Returns received, 2026</td><td>140.2M (Apr 17)</td><td>Not published yet</td><td>~4.8M in the first three weeks (145.0M by May 8), against ~5.2M in the same weeks of 2025</td></tr>
          </tbody>
        </table>
        <p>
          The share is steady at about 14% of returns, and 2026 is tracking 2025 so far. The IRS hasn't yet published an
          October snapshot for 2026.
        </p>
        <p>
          Not every late return is an extension: some are simply filed late, and some refunds are for returns filed
          earlier that took longer to process. The IRS doesn't publish a regular count of extension requests, but in 2019
          it said it expected about 14.6 million.
        </p>
      </section>

      <section>
        <h2>What it means for us</h2>
        <ul className="points">
          <li>
            <strong>About 5–6 million late federal returns.</strong> If our 40 million customers file like the country
            does, about 14% of their federal returns arrive after mid-April, many of them clustered in the weeks before
            October 15. Their refunds keep arriving through November and December.
          </li>
          <li>
            <strong>Capacity isn't the risk.</strong> Spread over six months, with one short spike, that's well under the
            April peak the system is already sized for. <Link to="/technical-design/non-functional/capacity">Capacity
            Estimates</Link> assumes about 10% of filings fall outside the main season; the IRS figures suggest closer to
            14%, which is inside the margin of planning at twice the forecast.
          </li>
          <li>
            <strong>Timing is the risk.</strong> By October we've scaled down, lifted the change freeze, moved on-call to
            business hours, and may be shipping changes for next season.
          </li>
        </ul>
      </section>

      <section>
        <h2>Why it still needs a plan</h2>
        <ul className="points">
          <li>
            <strong>The deadline moves.</strong> The IRS regularly postpones deadlines for federally declared disaster
            areas, sometimes by months, and some states set their own extension dates. October 15 is the usual date, not
            a constant.
          </li>
          <li>
            <strong>The tail overlaps the next season.</strong> Refunds for October filings arrive in November and
            December, and some state refunds later still. In January, the batch sync is still tracking last year's
            stragglers while the new season opens, so two tax years are in flight at once.
          </li>
          <li>
            <strong>Estimates are weakest here.</strong> Extension filers skew toward complex returns, such as
            self-employment and investment income, and most training data comes from peak season.
          </li>
        </ul>
      </section>

      <section>
        <h2>What we do</h2>
        <ul className="checks">
          <li><Planned /> A small readiness cycle in late September: scale up for the final two weeks, freeze changes from about October 10 to 17, and run in-season on-call that week.</li>
          <li><Planned /> Keep deadlines as per-jurisdiction settings that operations can change without a release, so a disaster postponement is a configuration change.</li>
          <li><Planned /> Keep checking a return until it reaches a final status, whatever the season. Partition data by tax year, and show a customer both their new return and any prior-year refund still in flight, rather than only the most recent one.</li>
          <li><Planned /> Measure the refund-time model on off-season filings separately. Where its ranges don't hold up, fall back to the agency's published guidance.</li>
          <li><Planned /> Alerts compare with the same week last season, so they neither go quiet nor get noisy just because October traffic is low.</li>
        </ul>
      </section>

      <section>
        <h2>Sources</h2>
        <p>IRS filing-season statistics, cumulative snapshots for individual returns:</p>
        <table className="metrics compare">
          <thead>
            <tr><th>Season</th><th>Mid-April</th><th>Mid-October, or latest</th></tr>
          </thead>
          <tbody>
            <tr><td>2024</td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-april-19-2024" target="_blank" rel="noreferrer">Week ending April 19, 2024</a></td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-oct-18-2024" target="_blank" rel="noreferrer">Week ending Oct. 18, 2024</a></td></tr>
            <tr><td>2025</td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-april-18-2025" target="_blank" rel="noreferrer">Week ending April 18, 2025</a></td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-oct-17-2025" target="_blank" rel="noreferrer">Week ending Oct. 17, 2025</a>, and <a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-may-9-2025" target="_blank" rel="noreferrer">May 9, 2025</a> for comparison with 2026</td></tr>
            <tr><td>2026</td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-april-17-2026" target="_blank" rel="noreferrer">Week ending April 17, 2026</a></td><td>Not published yet. Latest: <a href="https://www.irs.gov/newsroom/filing-season-statistics-for-week-ending-may-8-2026" target="_blank" rel="noreferrer">week ending May 8, 2026</a></td></tr>
          </tbody>
        </table>
        <table className="metrics compare">
          <thead>
            <tr><th>Other sources</th><th>Link</th></tr>
          </thead>
          <tbody>
            <tr><td>Every weekly release, by year</td><td><a href="https://www.irs.gov/newsroom/filing-season-statistics-by-year" target="_blank" rel="noreferrer">IRS: Filing season statistics by year</a></td></tr>
            <tr><td>Extension requests the IRS expected in 2019</td><td><a href="https://www.irs.gov/newsroom/with-tax-filing-deadline-nearing-irs-says-about-50-million-still-need-to-file" target="_blank" rel="noreferrer">IRS: IR-2019-72, about 14.6 million</a></td></tr>
            <tr><td>Disaster postponements of deadlines</td><td><a href="https://www.irs.gov/newsroom/tax-relief-in-disaster-situations" target="_blank" rel="noreferrer">IRS: Tax relief in disaster situations</a></td></tr>
          </tbody>
        </table>
      </section>
    </>
  )
}

export const operationsPages = {
  monitoring: MonitoringAlerting,
  'peak-season': PeakSeason,
  'extension-deadline': ExtensionDeadline,
}
