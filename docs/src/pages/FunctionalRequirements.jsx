import { Link } from 'react-router-dom'
import { GuideContents } from '../components/Guide.jsx'
import { Demo, Planned } from '../components/Flowchart.jsx'
import StatusDiagram from './StatusDiagram.jsx'

// What the service must do. As on the Security requirements page, each requirement is stated so it can be
// tested, with where the design covers it and whether the demo does it today.

const BASE = '/technical-design/requirements/functional'

function Header({ title, lede }) {
  return (
    <>
      <p className="eyebrow">Requirements</p>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </>
  )
}

function Groups({ groups }) {
  return groups.map((g) => (
    <section key={g.title}>
      <h2>{g.title}</h2>
      <table className="metrics">
        <thead>
          <tr><th>Requirement</th><th>Measure</th><th>Status</th></tr>
        </thead>
        <tbody>
          {g.rows.map(([req, measure, status, to]) => (
            <tr key={req}>
              <td>{to ? <Link to={to}>{req}</Link> : req}</td>
              <td>{measure}</td>
              <td>{status === 'demo' ? <Demo /> : <Planned />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ))
}

function Functional() {
  return (
    <>
      <Header
        title="Functional"
        lede="What the service must do for the people who use it. Each sub-page states requirements so they can be tested. How well it must do them is covered in Non-Functional."
      />

      <section>
        <h2>Who needs what</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Who</th><th>What they need</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr><td>Taxpayers</td><td>Where each refund is, when it will arrive, and what to do if there's a problem</td><td>The refund is often money they're counting on, and the agencies can't tell them when.</td></tr>
            <tr><td>Support agents</td><td>The same view the taxpayer sees, for the case in front of them</td><td>An answer that matches what the taxpayer read online ends the call.</td></tr>
            <tr><td>Preparers</td><td>The status of returns their clients have shared with them</td><td>Clients ask their preparer first.</td></tr>
            <tr><td>Operations</td><td>A way to see held returns and release them after verification</td><td>Fraud screening stops returns that real taxpayers may have filed.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>What the service does</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Capability</th><th>In short</th></tr>
          </thead>
          <tbody>
            <tr><td><Link to={`${BASE}/status-lookup`}>Refund Status Lookup</Link></td><td>Show each return's status, amount, dates, history, and next step, from our own data</td></tr>
            <tr><td><Link to={`${BASE}/status-lookup/identity`}>Identity Verification</Link></td><td>Show none of it until the person has proven who they are</td></tr>
            <tr><td><Link to={`${BASE}/status-lookup/states`}>Status States</Link></td><td>One clear meaning for every state a return can be in, and what to do in each</td></tr>
            <tr><td><Link to={`${BASE}/notifications`}>Notifications</Link></td><td>Tell taxpayers when something changes, so they don't have to keep checking</td></tr>
            <tr><td><Link to="/architecture/prediction">Refund Time Prediction</Link></td><td>Estimate when a refund will arrive until the agency sets a date</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Out of scope</h2>
        <ul className="crosses">
          <li>Preparing, filing, or amending returns. The demo has a small filing flow only to create returns to track.</li>
          <li>Changing a refund's amount or bank account.</li>
          <li>Paying a balance due.</li>
          <li>Prior tax years, except a refund still in flight when the new season opens.</li>
          <li>Guaranteeing a payment date. Only the agency sets one.</li>
        </ul>
      </section>

      <GuideContents />
    </>
  )
}

const LOOKUP_GROUPS = [
  {
    title: 'Seeing a refund',
    rows: [
      ['Every return appears', 'The federal return and each state return have their own status for the tax year', 'demo'],
      ['Progress is clear at a glance', 'A timeline shows the steps, with the current one marked', 'demo', `${BASE}/status-lookup/states`],
      ['The amount is the real one', 'The filed amount until the agency reports its own, then both when they differ', 'demo'],
      ['The payment date is shown', 'Once approved: the expected date and the last 4 digits of the bank account', 'demo'],
      ['An estimate fills the gap', 'Until there\'s a payment date, a date range labeled as an estimate', 'planned', '/architecture/prediction'],
      ['History is available', 'Every status change, with when it happened and what it means', 'demo'],
      ['A balance due is shown too', 'Returns with no refund show the balance the agency reports; paying it happens elsewhere', 'demo'],
      ['Stragglers aren\'t hidden', 'A prior-year refund still in flight appears alongside the new return', 'planned', '/operations/peak-season/extension-deadline'],
    ],
  },
  {
    title: 'Trusting the answer',
    rows: [
      ['Freshness is visible', 'While a return is in progress, the page says when we last checked and when we\'ll check next', 'demo'],
      ['Reads never wait on an agency', 'Every status read is answered from our database', 'demo', '/architecture/components/gateway'],
      ['An agency outage doesn\'t break the page', 'The last known status still appears, with when it was checked', 'demo', '/architecture/batch-sync/failures'],
      ['The agency stays the source of truth', 'Status changes come only from the agency; reading a status changes nothing', 'demo', '/architecture/batch-sync'],
      ['Taxpayers and support agree', 'Support agents see the same status, amounts, and history as the taxpayer', 'planned', '/security/identity-access/agents'],
    ],
  },
  {
    title: 'When there\'s a problem',
    rows: [
      ['The next step is stated', 'When the agency needs something, the page says what, using the agency\'s message', 'demo', `${BASE}/status-lookup/states`],
      ['Adjustments are explained', 'A changed refund shows the new amount, the claimed amount, and the agency\'s reason', 'demo', `${BASE}/status-lookup/states`],
      ['Phishing is called out', 'Action needed reminds taxpayers that we never ask for personal details by email or text', 'demo'],
      ['Help for every status', 'Each status offers next steps and agency contact links', 'planned'],
      ['Late refunds are flagged', 'A refund past the agency\'s normal time says when to contact the agency', 'planned'],
    ],
  },
  {
    title: 'Everyone can use it',
    rows: [
      ['Works on a phone', 'Every task can be finished at phone width, since most taxpayers check from one', 'planned'],
      ['Works with assistive technology', 'WCAG 2.2 AA, including status changes announced to screen readers', 'planned'],
      ['Plain language', 'Status messages explain what happened and what to do, without tax jargon', 'planned'],
    ],
  },
]

function StatusLookup() {
  return (
    <>
      <Header
        title="Refund Status Lookup"
        lede="The core of the service: a signed-in taxpayer sees where each refund is, when it should arrive, and what to do if something's wrong."
      />

      <section>
        <h2>The journey</h2>
        <ol className="timeline">
          <li><strong>Sign in</strong><span>Proven identity first. See <Link to={`${BASE}/status-lookup/identity`}>Identity Verification</Link>.</span></li>
          <li><strong>See every return</strong><span>Federal and state, each with its own status and amount.</span></li>
          <li><strong>Understand where it is</strong><span>The current step, the expected date or an estimate, and when the status was last checked.</span></li>
          <li><strong>Act if needed</strong><span>If the agency needs something, or the refund changed, the page says what happened and what to do next.</span></li>
          <li><strong>Stop checking</strong><span>A <Link to={`${BASE}/notifications`}>notification</Link> brings them back when something changes.</span></li>
        </ol>
        <p><Demo /> marks requirements the demo meets today. <Planned /> marks what production adds.</p>
      </section>

      <Groups groups={LOOKUP_GROUPS} />

      <section>
        <h2>Decision: answer from our own data</h2>
        <p>
          A read could call the agency live, which sounds fresher. We don't, because agencies are slow, rate limited, and
          sometimes down, exactly when traffic peaks. Instead, the <Link to="/architecture/batch-sync">batch sync</Link>{' '}
          keeps our copy current, and the page says how recent it is. A status can be a little old, which we show
          honestly. It can't be wrong, and the page can't go down because an agency did.
        </p>
      </section>

      <GuideContents />
    </>
  )
}

const IDENTITY_GROUPS = [
  {
    title: 'Signing in',
    rows: [
      ['Sign in before seeing anything', 'Every status endpoint needs a valid session', 'demo', '/security/identity-access'],
      ['Failures reveal nothing', 'A wrong email, wrong password, and locked account get the same message in the same time', 'demo', '/security/threat-model/attack-surfaces/enumeration'],
      ['Sessions end', 'After 30 minutes without use, or at once on sign-out', 'demo', '/security/identity-access'],
      ['A second factor', 'Passkeys first, then authenticator apps, with SMS as a last resort', 'planned', '/security/identity-access/taxpayer'],
      ['Step up for sensitive changes', 'A fresh second factor before changing contact details or sign-in methods', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
  {
    title: 'Proving who they are',
    rows: [
      ['A return belongs to its account', 'An account sees only the returns filed from it', 'demo', '/security/identity-access'],
      ['No lookup by SSN', 'No feature accepts a tax ID to find a return, so the service can\'t be used to test stolen identities', 'demo', '/security/identity-access/taxpayer'],
      ['Proofed before refund details', 'Identity proofed to NIST IAL2 and matched to the return before any refund detail appears', 'planned', '/security/identity-access/taxpayer'],
      ['A fallback for everyone', 'Supervised proofing for taxpayers without a supported ID or smartphone', 'planned', '/security/identity-access/taxpayer'],
      ['Joint filers each prove themselves', 'A spouse has their own proofed account, linked by the filer\'s invitation', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
  {
    title: 'Keeping it theirs',
    rows: [
      ['Recovery is as strong as sign-in', 'Re-proofing and a waiting period, never an email link alone', 'planned', '/security/identity-access/taxpayer'],
      ['Taxpayers hear about changes', 'Each new device and security change alerts the contacts on file before the change', 'planned', `${BASE}/notifications`],
      ['"This wasn\'t me" works', 'One link ends every session and freezes changes', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
  {
    title: 'When identity is in doubt',
    rows: [
      ['Suspected fraud is held', 'A return paying into another taxpayer\'s bank account with near-identical figures stops before transmission', 'demo', '/security/abuse-prevention'],
      ['The taxpayer is told', 'The return shows Action needed, with what to do next', 'demo', `${BASE}/status-lookup/states`],
      ['Release needs verification', 'An admin releases a held return after identity verification, and the release is audited', 'demo', '/demo/admin-console'],
      ['Agency checks stay with the agency', 'When an agency needs identity verification, the page explains and links to its process. We can\'t clear it', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
]

function IdentityVerification() {
  return (
    <>
      <Header
        title="Identity Verification"
        lede="Nothing about a refund is shown until the person has proven who they are. These are the requirements; Taxpayer Identity explains the design."
      />

      <blockquote className="callout">
        The service must never tell anyone anything about a taxpayer unless they have proven they are that taxpayer, or
        are staff with a recorded reason to look.
      </blockquote>

      <section>
        <h2>Decision: a signed-in account, not an SSN lookup</h2>
        <p>
          The IRS's Where's My Refund asks for an SSN, a filing status, and the exact refund amount, because it has to
          work for anyone without signing in. We don't: the customer filed through our product. Sign-in replaces facts that identity
          thieves can buy, and it means the service never accepts a tax ID from anyone. The cost is one more sign-in, which
          passkeys and remembered devices keep short.
        </p>
        <p><Demo /> marks requirements the demo meets today. <Planned /> marks what production adds.</p>
      </section>

      <Groups groups={IDENTITY_GROUPS} />

      <section>
        <h2>Support agents and preparers</h2>
        <p>
          The same rule applies to anyone else who can see a refund, but what grants access differs. Agents need an active
          case; preparers need the taxpayer's own grant. See <Link to="/security/identity-access/agents">Support
          Agents</Link> and <Link to="/security/identity-access/preparers">Preparers</Link>.
        </p>
      </section>
    </>
  )
}

function StatusStates() {
  return (
    <>
      <Header
        title="Status States"
        lede="Every state a return can be in, what it means, and what the taxpayer should do. The diagram matches the demo's code."
      />

      <section>
        <h2>The state machine</h2>
        <StatusDiagram />
      </section>

      <section>
        <h2>What each state means</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>State</th><th>Meaning</th><th>What the taxpayer should do</th><th>Final?</th></tr>
          </thead>
          <tbody>
            <tr><td>Received</td><td>We have the return, and it hasn't reached the agency yet</td><td>Nothing</td><td>No</td></tr>
            <tr><td>Processing</td><td>The agency has the return</td><td>Nothing. Don't file again</td><td>No</td></tr>
            <tr><td>Action needed</td><td>We or the agency need something before it can continue</td><td>Follow the instructions shown, or in the mailed letter</td><td>No</td></tr>
            <tr><td>Approved</td><td>The agency approved the refund and set a payment date</td><td>Nothing. Watch for the deposit</td><td>No</td></tr>
            <tr><td>Refund sent</td><td>Paid as filed</td><td>Allow up to 5 days for the bank to post it</td><td>Yes</td></tr>
            <tr><td>Refund adjusted</td><td>Paid, for a different amount from the one claimed</td><td>Read the agency's reason, and respond to it if they disagree</td><td>Yes</td></tr>
            <tr><td>Accepted</td><td>No refund: the agency accepted the return</td><td>Pay any balance by the filing deadline</td><td>Yes</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Rules</h2>
        <ul className="checks">
          <li><Demo /> The agency owns the status. After transmission, every state change comes from what the agency reports. Our own states are Received and a hold by screening.</li>
          <li><Demo /> Each change adds a history entry in the same transaction, so the status and its history can't disagree.</li>
          <li><Demo /> A new amount or message with no status change still adds a history entry, so the taxpayer hears about it.</li>
          <li><Demo /> Refund sent, Refund adjusted, and Accepted are final, and those returns are never checked again.</li>
          <li><Demo /> An approved return isn't checked again until its payment date, the next point at which anything can change.</li>
          <li><Demo /> Refund adjusted takes the place of Refund sent, with the reason, so a smaller deposit doesn't look like a mistake.</li>
          <li><Demo /> The agency can skip a state, for example going straight to Refund sent. The page follows what it reports, and the diagram shows the usual paths.</li>
        </ul>
      </section>

      <section>
        <h2>From agency status to ours</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Agency reports</th><th>We show</th></tr>
          </thead>
          <tbody>
            <tr><td><code>received</code>, <code>processing</code></td><td>Processing. To a taxpayer, the agency receiving a return is already processing it</td></tr>
            <tr><td><code>approved</code>, <code>sent</code>, <code>adjusted</code>, <code>accepted</code></td><td>The same state</td></tr>
            <tr><td><code>action_required</code></td><td>Action needed</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Not modeled yet</h2>
        <p>Real refunds have outcomes the demo doesn't cover. Each needs a state or a variation before launch:</p>
        <table className="metrics compare">
          <thead>
            <tr><th>Situation</th><th>Why it matters</th><th>Likely handling</th></tr>
          </thead>
          <tbody>
            <tr><td>E-file rejected</td><td>The agency refuses the return, for example over a mismatched prior-year AGI. It never starts processing</td><td>A new Rejected state with the reason, and a path back to filing</td></tr>
            <tr><td>Deposit returned by the bank</td><td>Refund sent is final, so we'd never see the agency's follow-up</td><td>Keep checking for a period after sending, and show that a check is coming</td></tr>
            <tr><td>Paper check</td><td>The demo assumes direct deposit, and a check takes longer and can be lost</td><td>A delivery method on the return, with its own wording and timing</td></tr>
            <tr><td>Refund reduced to pay a debt</td><td>An offset looks like an adjustment, but is resolved somewhere else</td><td>Refund adjusted, with the offset's reason and who to contact</td></tr>
          </tbody>
        </table>
      </section>
    </>
  )
}

const NOTIFY_GROUPS = [
  {
    title: 'When to notify',
    rows: [
      ['Changes that matter', 'Approved with a date, Refund sent, Refund adjusted, Accepted with a balance, and Action needed', 'planned'],
      ['Not routine progress', 'No message for moving into Processing, or for a check that found nothing new', 'planned'],
      ['A slipping estimate', 'One message if the estimate moves materially later', 'planned', '/architecture/prediction'],
      ['Security alerts always send', 'New devices and security changes can\'t be turned off, and go to the contacts on file before the change', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
  {
    title: 'Channels and consent',
    rows: [
      ['Taxpayers choose', 'Push, email, or SMS, chosen per channel and changeable at any time', 'planned'],
      ['Opt-in for SMS', 'Text messages only with recorded consent, and STOP is honored', 'planned'],
      ['Quiet at night', 'Status messages wait for daytime in the taxpayer\'s time zone; security alerts don\'t', 'planned'],
    ],
  },
  {
    title: 'What a message may contain',
    rows: [
      ['No personal data', 'No amounts, dates, bank digits, or tax details: "Your refund status changed. Sign in to see it."', 'planned', '/security/data-protection/minimization'],
      ['Nothing to phish with', 'Messages never ask for credentials or personal details, and follow one recognizable format', 'planned', '/security/threat-model/attack-surfaces'],
      ['Links need sign-in', 'A link opens the app, and the status appears only after normal sign-in', 'planned', `${BASE}/status-lookup/identity`],
    ],
  },
  {
    title: 'Delivery',
    rows: [
      ['Every change is captured', 'A status and its history entry commit in one transaction, so a change can\'t be lost', 'demo', '/architecture/batch-sync'],
      ['Never before it\'s visible', 'A message goes out only after the new status can be read', 'planned'],
      ['Sent once', 'At most one message per change, per channel, even if a sender retries', 'planned'],
      ['Timely', '99% within 5 minutes of the change in normal running', 'planned'],
      ['Doesn\'t cause its own peak', 'Large batches are spread out, because each message brings a status read back', 'planned', '/technical-design/requirements/non-functional/capacity'],
      ['First to wait at peak', 'Notifications are delayed before anything else is shed', 'planned', '/operations/peak-season'],
    ],
  },
]

function Notifications() {
  return (
    <>
      <Header
        title="Notifications"
        lede="Tell taxpayers when something changes, so they stop checking. A message should bring them back to a signed-in page, not carry the news itself."
      />

      <p className="note">
        <strong>Demo status:</strong> the demo sends no notifications. The status history it writes is what a notification
        service would read from. The design lives in <Link to="/architecture/components/notification-service">Notification
        Service</Link>.
      </p>

      <section>
        <h2>Why it's worth building</h2>
        <ul className="points">
          <li><strong>Fewer repeat checks.</strong> A taxpayer who trusts they'll be told doesn't need to refresh every day, which lowers read load through the season.</li>
          <li><strong>Fewer support calls.</strong> Hearing about a problem early beats finding out when the money doesn't arrive.</li>
          <li><strong>A risk of its own.</strong> Refund messages are a favorite phishing lure, so anything we send must look nothing like one that asks for details.</li>
        </ul>
        <p><Demo /> marks requirements the demo meets today. <Planned /> marks what production adds.</p>
      </section>

      <Groups groups={NOTIFY_GROUPS} />
    </>
  )
}

export const functionalPages = {
  functional: Functional,
  'status-lookup': StatusLookup,
  identity: IdentityVerification,
  'status-states': StatusStates,
  notifications: Notifications,
}
