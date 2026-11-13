import { Link } from 'react-router-dom'

// What the design takes as given. Each assumption names its basis and what would change if it turned out
// to be wrong, so a reviewer can see which ones carry the most risk.
const GROUPS = [
  {
    title: 'Product and scope',
    rows: [
      [
        'Only the most recent tax year is shown',
        'The problem statement asks for the most recent refund',
        'Prior years need longer retention and amended-return statuses.',
        null,
      ],
      [
        'One federal return, plus one return for each state with an income tax that the taxpayer lived or worked in, with at most one full resident state',
        'A person has one home state at a time. Movers file part-year returns in both states, and commuters file nonresident returns where they work',
        'Supported in the demo. Joint filers who live in different states, and cities with their own income tax, aren\'t modeled.',
        '/technical-design/functional/status-lookup',
      ],
      [
        'States with no income tax on wages need no return, whether the taxpayer lives there, worked there, or both',
        'Nine states don\'t tax wages: Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington, and Wyoming. The demo models Florida, Texas, and Washington',
        'A state that starts taxing wages needs a form, tax math, and an agency adapter. Washington\'s capital gains tax is a reminder that "no income tax" can have exceptions.',
        '/technical-design/functional/status-lookup',
      ],
      [
        'Where a taxpayer lives and works is recorded even when no state return results',
        'It explains an empty state section to the taxpayer, and to support agents who see the same view',
        'Without it, a Texas resident with only a federal return looks like a filer whose state return is missing.',
        null,
      ],
      [
        'A taxpayer living in a state with no income tax gets no credit on a nonresident return elsewhere',
        'The credit for tax paid to other states is claimed on a resident return, and there isn\'t one',
        'None in the demo: the nonresident return already taxes only that state\'s share of income.',
        null,
      ],
      [
        'The resident state\'s credit for tax paid to other states is limited to its own tax on that income',
        'How California and New York both work, simplified: the demo applies the limit to the whole credit, not income type by income type',
        'Real credits have more rules (which income qualifies, which states have reciprocity), so the demo\'s refund can differ from a real return.',
        null,
      ],
      [
        'The filing product transmits returns; this service observes them afterwards',
        'Filing is a separate product. The demo includes a processor only to stand in for it',
        'If this service owns transmission, the submission queue becomes a core component.',
        '/architecture/components/gateway',
      ],
      [
        'Nothing here can change a refund amount or bank account',
        'Read-only toward money is a security principle',
        'Any write path to money needs dual control and much stronger review.',
        '/security',
      ],
    ],
  },
  {
    title: 'Scale and traffic',
    rows: [
      [
        'About 40 million customers in a season',
        'The scale of a large consumer tax product',
        'The design scales out, but capacity and cost estimates change in proportion.',
        '/technical-design/non-functional/capacity',
      ],
      [
        'About 90% of filings arrive between late January and April 15, with a smaller rush before October 15',
        'IRS filing-season statistics for 2024–2026',
        'A flatter season lowers peak cost. A sharper one needs more headroom.',
        '/operations/peak-season/extension-deadline',
      ],
      [
        'Each customer checks about 8 times a season, mostly on phones',
        'Several checks per return, more while waiting for money',
        'Many more checks shift the bottleneck to the read path and caching.',
        '/technical-design/non-functional/capacity',
      ],
    ],
  },
  {
    title: 'Tax agencies',
    rows: [
      [
        'Agencies offer a bulk status feed to e-file partners',
        'No agency offers one today: refund status after acceptance is only available to taxpayers themselves. This is the riskiest assumption.',
        'Without a feed, status falls back to e-file acknowledgments plus the model\'s estimate, or to taxpayer-authorized lookups.',
        '/architecture/batch-sync/agencies',
      ],
      [
        'Agencies never push updates; we have to ask',
        'Agencies offer no push notifications today',
        'If they push, batch polling becomes reconciliation, and status gets fresher.',
        '/architecture/batch-sync',
      ],
      [
        'Each agency has its own rate limit, schedule, and credentials',
        'Each agency runs its own systems',
        'Shared infrastructure would simplify the adapters, not remove them.',
        '/architecture/batch-sync/agencies',
      ],
      [
        'Updates every few hours are acceptable',
        'Agencies update in daily or nightly cycles; showing the wrong status is worse than an old one',
        'If minutes matter, polling cost rises sharply, and only a push feed makes it affordable.',
        '/technical-design/non-functional/availability',
      ],
      [
        'Agencies are slow or unavailable at peak',
        'Peak load hits agencies at the same time it hits us',
        'If agencies keep up, the queues and circuit breakers are rarely used, but they cost little.',
        '/architecture/components/gateway',
      ],
    ],
  },
  {
    title: 'Data and privacy',
    rows: [
      [
        'We never need full tax IDs or bank account numbers to show status',
        'The last 4 digits, plus a keyed fingerprint for fraud checks, are enough',
        'Storing full identifiers would need tokenization and a much stricter data boundary.',
        '/security/data-protection',
      ],
      [
        'Return information is covered by §7216, so model training needs separate opt-in consent',
        'IRC §7216 and its regulations',
        'If too few taxpayers opt in, the model falls back to published agency guidance more often.',
        '/security/compliance',
      ],
      [
        'Taxpayers accept a range, not a date, until the agency sets one',
        'Only the agency can promise a payment date',
        'A single date would be wrong more often, and would create calls instead of preventing them.',
        '/architecture/prediction',
      ],
    ],
  },
  {
    title: 'Platform and team',
    rows: [
      [
        'Kubernetes and managed Postgres are available, in more than one availability zone',
        'Standard platform for a product at this scale',
        'Without them, failover and scaling have to be built rather than configured.',
        null,
      ],
      [
        'One team owns the service, with on-call through filing season',
        'The service is critical for a few months a year',
        'Without dedicated on-call, peak-season readiness and game days carry more risk.',
        '/operations/peak-season',
      ],
    ],
  },
]

export default function Assumptions() {
  return (
    <>
      <p className="eyebrow">Technical Design</p>
      <h1>Assumptions</h1>
      <p className="lede">
        What this design takes as given. Each assumption has its basis and what would change if it's wrong, so the
        riskiest ones can be checked first.
      </p>

      <p className="note">
        <strong>The riskiest assumption is the agency status feed.</strong> Everything else can be adjusted with
        configuration or capacity. If no agency will provide a bulk feed to partners, the status source changes, not just
        its size.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <table className="metrics compare">
            <thead>
              <tr><th>Assumption</th><th>Basis</th><th>If it's wrong</th></tr>
            </thead>
            <tbody>
              {g.rows.map(([assumption, basis, ifWrong, to]) => (
                <tr key={assumption}>
                  <td>{to ? <Link to={to}>{assumption}</Link> : assumption}</td>
                  <td>{basis}</td>
                  <td>{ifWrong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
