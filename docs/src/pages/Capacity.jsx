import { Link } from 'react-router-dom'

function Stat({ value, label }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export default function Capacity() {
  return (
    <>
      <p className="eyebrow">Requirements</p>
      <h1>Capacity Estimates</h1>
      <p className="lede">
        Sized for a consumer tax product on the scale of TurboTax: about 40 million customers in the 2026 filing
        season (tax year 2025).
      </p>

      <div className="stats">
        <Stat value="40M" label="customers per season" />
        <Stat value="~68M" label="returns to track" />
        <Stat value="~35M" label="returns in flight at peak" />
        <Stat value="~1,000/s" label="peak status reads" />
      </div>

      <p className="note">
        <strong>These are planning estimates,</strong> built from the assumptions below. Each one is stated so it can
        be replaced with real numbers from the previous season's traffic.
      </p>

      <section>
        <h2>Assumptions</h2>
        <table className="metrics">
          <thead>
            <tr><th>Input</th><th>Value</th><th>Basis</th></tr>
          </thead>
          <tbody>
            <tr><td>Customers</td><td>40 million</td><td>Given</td></tr>
            <tr><td>Federal returns</td><td>40 million</td><td>Every customer files one</td></tr>
            <tr><td>State returns</td><td>~28 million</td><td>~70% of customers live in a state with income tax and file there</td></tr>
            <tr><td>Returns with a refund</td><td>~75%</td><td>Most individual filers are owed a refund</td></tr>
            <tr><td>Filing season</td><td>~12 weeks</td><td>Late January to April 15 holds ~90% of filings</td></tr>
            <tr><td>Peak filing day</td><td>~2.5% of the season</td><td>Early February and the days before April 15</td></tr>
            <tr><td>Time in flight</td><td>Federal ~3 weeks, states 1–8 weeks</td><td>Agencies issue most e-filed refunds within 21 days</td></tr>
            <tr><td>Status checks per customer</td><td>~8 per season</td><td>Several checks per return, more while waiting for money</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Returns filed</h2>
        <ul className="points">
          <li>
            <strong>Season total:</strong> 40M federal + 28M state ≈ <strong>68M returns</strong> to transmit and track.
          </li>
          <li>
            <strong>Peak day:</strong> 2.5% of 40M customers ≈ 1M customers, filing ≈ 1.7M returns. That's about 20
            filings a second averaged over the day and ~100 a second in the busiest hour.
          </li>
          <li>
            <strong>In flight at peak:</strong> ~1M federal returns a day × ~3 weeks, plus state returns that take
            longer, ≈ <strong>30–35M returns</strong> waiting on an agency at once. This is the number the batch system
            has to keep current.
          </li>
        </ul>
      </section>

      <section>
        <h2>Status reads</h2>
        <ul className="points">
          <li>
            <strong>Season total:</strong> 40M customers × ~8 checks ≈ <strong>320M status reads</strong>.
          </li>
          <li>
            <strong>Peak day:</strong> ~3% of the season ≈ 10M reads. With ~10% of a day's reads in the busiest hour,
            that's ~1M reads an hour, or <strong>~280 reads a second</strong>.
          </li>
          <li>
            <strong>Bursts:</strong> refund-release mornings and notification pushes can triple that:{' '}
            <strong>~1,000 reads a second</strong>.
          </li>
        </ul>
        <p>
          Every read is answered from our own database: one indexed lookup, a few milliseconds. No customer request ever
          waits on an agency, which is what makes this traffic cheap to serve.
        </p>
      </section>

      <section>
        <h2>Agency status lookups</h2>
        <p>
          This is where design matters most. Compare asking the agencies on every page view with polling them in{' '}
          <Link to="/architecture/batch-sync">batch runs</Link>:
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Approach</th><th>Lookups per peak day</th><th>Agency requests</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Pass every customer read through to the agency</td>
              <td>~10M, in bursts of 1,000/s</td>
              <td>~10M single lookups, tied to customer traffic</td>
            </tr>
            <tr>
              <td>Batch: every in-flight return, 4 runs a day</td>
              <td>35M × 4 = 140M</td>
              <td>1.4M (100 per bulk request)</td>
            </tr>
            <tr>
              <td>
                <strong>Batch with smart scheduling</strong> (the design)
              </td>
              <td>~1.5 checks per return per day ≈ 50M</td>
              <td>
                <strong>~500K</strong>, on our schedule
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Smart scheduling skips returns that can't have changed. Approved refunds wait for their payment date, and checks
          line up with each agency's own update cycle. See <Link to="/architecture/batch-sync/scheduling">Scheduling</Link>.
        </p>
        <p>
          Spread over 4 runs a day with a 60-minute target per run, that's ~12.5M lookups a run ≈{' '}
          <strong>3,500 lookups a second ≈ 35 bulk requests a second</strong> across all agencies. The IRS share is
          about 60% (~20 requests a second); the rest is spread across ~40 state agencies. Each agency's rate limit, not
          our hardware, sets how many workers a run uses.
        </p>
      </section>

      <section>
        <h2>Writes</h2>
        <ul className="points">
          <li>
            <strong>Status changes:</strong> ~68M returns × ~3 changes ≈ 200M over the season, ~6M on a peak day.
          </li>
          <li>
            <strong>During a run:</strong> 6M ÷ 4 runs ÷ 60 minutes ≈ 400 changed rows a second, written 100 at a time in
            one transaction per chunk: a handful of commits a second per worker.
          </li>
          <li>
            <strong>Check bookkeeping:</strong> every lookup also updates <code>last_checked_at</code> and{' '}
            <code>next_check_at</code>, ~3,500 row updates a second during a run. Fine for one Postgres primary with
            batched writes; the main tuning point is autovacuum on <code>tax_returns</code>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Storage</h2>
        <table className="metrics">
          <thead>
            <tr><th>Item</th><th>Per return</th><th>Season</th></tr>
          </thead>
          <tbody>
            <tr><td>Return row (figures, calculation, status)</td><td>~3 KB</td><td>~200 GB</td></tr>
            <tr><td>Status history (~4 events)</td><td>~0.6 KB</td><td>~40 GB</td></tr>
            <tr><td>Feature vector (16 floats) and HNSW index</td><td>~0.2 KB</td><td>~15 GB</td></tr>
            <tr><td>Other indexes</td><td>~1 KB</td><td>~70 GB</td></tr>
            <tr><td><strong>Total</strong></td><td><strong>~5 KB</strong></td><td><strong>~325 GB</strong></td></tr>
          </tbody>
        </table>
        <p>
          Partition <code>tax_returns</code> and <code>return_events</code> by tax year so each season is its own set of
          tables, and archive past seasons once refunds have settled.
        </p>
      </section>

      <section>
        <h2>Traces</h2>
        <p>
          Keeping every trace would mean hundreds of millions of traces a season. Production samples a few percent of
          ordinary requests and keeps every trace with an error or high latency, using tail sampling in an OpenTelemetry
          Collector. Batch runs are few (tens a day per agency) and always kept. See{' '}
          <Link to="/operations/tracing">Distributed Tracing</Link>.
        </p>
      </section>

      <section>
        <h2>What this means for the design</h2>
        <ul className="checks">
          <li>Serve every status read from our own data. Agency latency and outages never reach customers.</li>
          <li>Poll agencies in scheduled, sharded batch runs, sized to each agency's rate limit.</li>
          <li>Check a return only when its status could have changed.</li>
          <li>One Postgres primary handles the writes; read replicas and a cache absorb read bursts.</li>
          <li>Partition by tax year, and keep the hot set to the current season.</li>
        </ul>
      </section>
    </>
  )
}
