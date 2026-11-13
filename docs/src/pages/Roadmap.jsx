import { Link } from 'react-router-dom'
import { Demo, Planned } from '../components/Flowchart.jsx'

// The order the work ships in. Each phase has a goal, what's in it, what has to be true to call it done,
// and what it depends on. The demo column says which parts the demo already shows.
const PHASES = [
  {
    title: 'Phase 0: before the first season',
    goal: 'Remove the risks that would change the design, before writing production code.',
    rows: [
      ['Status-feed agreements with the IRS and the states with the most filers', 'planned', '/architecture/batch-sync/agencies'],
      ['A fallback if an agency won\'t provide a feed: acknowledgments, then accepted, then an estimate', 'planned', '/technical-design/assumptions'],
      ['Privacy review, including §7216 consent for training the model', 'planned', '/security/compliance'],
      ['Capacity targets from last season\'s real traffic', 'planned', '/technical-design/non-functional/capacity'],
    ],
    done: 'A signed feed agreement, or a fallback chosen for each agency in scope. Capacity numbers replaced with real ones.',
    depends: 'Partnerships, legal and privacy, and last season\'s data.',
  },
  {
    title: 'Season 1: the minimum we can trust',
    goal: 'A correct, available status page for federal and the largest states, measured by fewer support calls.',
    rows: [
      ['Federal plus the largest states, each behind its own agency adapter', 'demo', '/architecture/batch-sync/agencies'],
      ['Batch status runs, with a "last updated" time on every answer', 'demo', '/architecture/batch-sync'],
      ['Submission queues per agency, with shared rate limits and circuit breakers', 'demo', '/architecture/components/gateway'],
      ['Estimates from published agency guidance, such as "most within 21 days"', 'planned', '/architecture/prediction'],
      ['What to do when action is needed or a refund was adjusted', 'demo', '/technical-design/functional/status-lookup'],
      ['Strong sign-in, lockout, and audited staff access', 'demo', '/security/identity-access'],
      ['Load tests at twice the forecast peak, game days, and a change freeze from early January to April 15', 'planned', '/operations/peak-season'],
    ],
    done: 'Status reads available 99.95% of the time with p99 under 300 ms through the season, status matching agency records, and fewer "where\'s my refund" calls than last season.',
    depends: 'Phase 0, on-call staffing for the season, and support briefed on what taxpayers will see.',
  },
  {
    title: 'Season 2: predict and reach out',
    goal: 'Answer "when" as well as "where", and stop taxpayers having to keep checking.',
    rows: [
      ['The survival model, shadowed against Season 1 outcomes before anyone sees it', 'planned', '/architecture/prediction'],
      ['Notifications that say only that the status changed, never details', 'planned', '/technical-design/functional/notifications'],
      ['Support agents see the taxpayer\'s view, tied to a case', 'planned', '/security/identity-access/agents'],
      ['More states, and taxpayers who file in several', 'demo', '/technical-design/functional/status-lookup'],
      ['Metrics and dashboards exported from every service', 'planned', '/operations/monitoring'],
    ],
    done: 'Refunds land inside the estimated range at the target rate for every segment, and repeat checks per taxpayer fall.',
    depends: 'Enough opted-in history to train on, and Season 1 outcomes to compare against.',
  },
  {
    title: 'Later',
    goal: 'Widen who the service serves, once the core is trusted.',
    rows: [
      ['Prior-year returns still in flight, such as extension filers', 'planned', '/operations/peak-season/extension-deadline'],
      ['Preparers see the returns their clients share with them', 'planned', '/security/identity-access/preparers'],
      ['Push feeds where agencies offer them, with polling kept for reconciliation', 'planned', '/architecture/batch-sync'],
    ],
    done: 'Driven by demand: each item starts with the support-call data that justifies it.',
    depends: 'Agency capabilities, and preparer identity proofing.',
  },
]

export default function Roadmap() {
  return (
    <>
      <p className="eyebrow">Technical Design</p>
      <h1>Roadmap</h1>
      <p className="lede">
        The order the work ships in, and why. Each phase removes the biggest remaining risk, and each ends with something
        measurable.
      </p>

      <ol className="timeline">
        {PHASES.map((p) => (
          <li key={p.title}><strong>{p.title}</strong><span>{p.goal}</span></li>
        ))}
      </ol>

      <p>
        <Demo /> marks what the demo already shows. <Planned /> marks what production adds.
      </p>

      {PHASES.map((p) => (
        <section key={p.title}>
          <h2>{p.title}</h2>
          <p>{p.goal}</p>
          <table className="metrics">
            <thead>
              <tr><th>Scope</th><th>Status</th></tr>
            </thead>
            <tbody>
              {p.rows.map(([item, status, to]) => (
                <tr key={item}>
                  <td><Link to={to}>{item}</Link></td>
                  <td>{status === 'demo' ? <Demo /> : <Planned />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="points">
            <li><strong>Done when:</strong> {p.done}</li>
            <li><strong>Depends on:</strong> {p.depends}</li>
          </ul>
        </section>
      ))}

      <section>
        <h2>What could change the order</h2>
        <ul className="points">
          <li>
            <strong>No agency feed.</strong> The fallback moves into Season 1, and estimates matter more, so a simple model
            moves up from Season 2.
          </li>
          <li>
            <strong>An agency offers push updates.</strong> That agency gets fresher status sooner, and its polling becomes
            reconciliation.
          </li>
          <li>
            <strong>Takeover attacks surge.</strong> Stronger sign-in, such as passkeys and breached-password checks,
            moves ahead of new features.
          </li>
        </ul>
      </section>

      <section>
        <h2>Deliberately not on the roadmap</h2>
        <ul className="crosses">
          <li>Caching beyond the database: status reads are already one indexed lookup.</li>
          <li>Multi-region: one region across several availability zones is enough for the first seasons.</li>
          <li>Tax calculation: the filing product owns it. The demo's version is only an illustration.</li>
          <li>Changing refunds or bank accounts: nothing in this service touches money.</li>
        </ul>
      </section>
    </>
  )
}
