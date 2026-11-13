import { Link } from 'react-router-dom'
import { GuideContents } from '../components/Guide.jsx'
import { Demo, Flowchart, Planned } from '../components/Flowchart.jsx'
import ServiceAuthDiagram from './ServiceAuthDiagram.jsx'

// The security model: an overview plus one page per area. Each page separates what the demo
// enforces today from what the production design adds.

function Page({ eyebrow = 'Security', title, lede, children, deeper = true }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
      {deeper && <GuideContents />}
    </>
  )
}

function Overview() {
  return (
    <Page
      title="Security"
      deeper={false}
      lede="A customer's account holds tax IDs, income, and bank details behind one sign-in. Security is the first design constraint for this service: every other decision is checked against it."
    >
      <section>
        <h2>Why security is paramount</h2>
        <ul className="points">
          <li>
            <strong>Account takeover pays.</strong> A taken-over account reveals income, filing details, and when a
            refund will land, which is everything a fraudster needs to phish the taxpayer or redirect future refunds.
          </li>
          <li>
            <strong>Refund fraud is organized.</strong> Rings file templated returns under stolen identities, route the
            refunds into a few bank accounts, and track them with the same status pages honest filers use.
          </li>
          <li>
            <strong>Attackers peak when we do.</strong> Credential stuffing and phishing surge in filing season,
            exactly when traffic is highest and there's pressure to relax controls to keep up.
          </li>
          <li>
            <strong>Trust is the product.</strong> One incident during filing season would push taxpayers back to the
            phone lines this service exists to relieve.
          </li>
        </ul>
        <blockquote className="callout">
          The service must never tell anyone anything about a taxpayer unless they have proven they are that
          taxpayer, or are staff with a recorded reason to look.
        </blockquote>
      </section>

      <section>
        <h2>What we protect</h2>
        <table className="metrics">
          <thead>
            <tr><th>Asset</th><th>Why it matters</th></tr>
          </thead>
          <tbody>
            <tr><td>Credentials and sessions</td><td>The key to everything else in the account.</td></tr>
            <tr><td>Return figures</td><td>Income, filing status, dependents, and the refund or balance due.</td></tr>
            <tr><td>Identifiers</td><td>Tax IDs and bank accounts. We keep only the last 4 digits, plus a keyed fingerprint of the bank account.</td></tr>
            <tr><td>Refund status and dates</td><td>Tell an attacker when money moves, which helps them time phishing and interception.</td></tr>
            <tr><td>Staff capabilities</td><td>Admins can change what agencies report in the demo, and support staff can see any account.</td></tr>
            <tr><td>Training data <Planned /></td><td>Status history for the refund-time model, which must never lead back to a person.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Trust boundaries</h2>
        <p>Controls are placed where data crosses from one level of trust to another:</p>
        <ol className="timeline">
          <li><strong>Internet → portal</strong><span>The only way in. TLS, security headers, bot and rate controls, request size limits.</span></li>
          <li><strong>Portal → API</strong><span>Every request is authenticated by session, and authorized against the signed-in user.</span></li>
          <li><strong>Services → Postgres</strong><span>Only pods labeled as database clients can connect; data at rest is encrypted.</span></li>
          <li><strong>Workers → agencies</strong><span>Per-agency credentials, separate keys for admin actions, network policy allowlists.</span></li>
          <li><strong>Production → ML environment</strong><span>Only consented, pseudonymized, coarse features cross, under a key that stays in production.</span></li>
        </ol>
      </section>

      <section>
        <h2>Security principles</h2>
        <div className="cards">
          <div className="card">
            <h3>Prove it, then least access</h3>
            <p>Strong sign-in once, then every query is scoped to that user's own returns.</p>
          </div>
          <div className="card">
            <h3>No oracle responses</h3>
            <p>A failed sign-in looks and takes the same whether the email exists, the password is wrong, or the account is locked.</p>
          </div>
          <div className="card">
            <h3>Least data</h3>
            <p>Never store what we can avoid: last 4 digits instead of full numbers, fingerprints instead of accounts.</p>
          </div>
          <div className="card">
            <h3>Read-only toward money</h3>
            <p>Nothing here can change a refund amount or bank account, so compromising it can't redirect a refund.</p>
          </div>
          <div className="card">
            <h3>Zero trust inside</h3>
            <p>Ingress is denied by default, and each service reaches only what it needs, with its own credentials.</p>
          </div>
          <div className="card">
            <h3>Assume breach</h3>
            <p>Audit staff actions, keep sessions revocable in one step, and practice the response before it's needed.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Top threats</h2>
        <table className="metrics">
          <thead>
            <tr><th>Threat</th><th>Impact</th><th>Primary mitigations</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Account takeover</td>
              <td>Full view of a taxpayer's return and refund timing</td>
              <td>Argon2id passwords, lockout, rate limits <Demo />; MFA, breached-password checks, new-device alerts <Planned /></td>
            </tr>
            <tr>
              <td>Account enumeration</td>
              <td>Confirms which stolen emails have accounts</td>
              <td>One failure message, and a dummy hash check so timing matches <Demo /></td>
            </tr>
            <tr>
              <td>Fraudulent filings</td>
              <td>Refunds paid to fraud rings under stolen identities</td>
              <td>pgvector near-duplicate screening by bank fingerprint, with a hold for identity verification <Demo /></td>
            </tr>
            <tr>
              <td>Web attacks (CSRF, XSS, clickjacking)</td>
              <td>Actions or reads performed as the victim</td>
              <td>SameSite=Strict cookies, a required request header, strict CSP, framing denied <Demo /></td>
            </tr>
            <tr>
              <td>Insider misuse</td>
              <td>Staff browsing or changing records without cause</td>
              <td>Admin role and audit log <Demo />; SSO with hardware keys, case-bound access, review <Planned /></td>
            </tr>
            <tr>
              <td>Data exposure</td>
              <td>Disclosure of taxpayer data from storage, logs, or backups</td>
              <td>Minimization, no bodies in logs <Demo />; TLS everywhere, KMS-managed encryption <Planned /></td>
            </tr>
            <tr>
              <td>Agency integration abuse</td>
              <td>Spoofed or tampered status, leaked credentials</td>
              <td>Scoped API keys, network allowlists <Demo />; mTLS and secret rotation <Planned /></td>
            </tr>
            <tr>
              <td>Training data re-identification <Planned /></td>
              <td>Model data leading back to a taxpayer</td>
              <td>Opt-in consent, keyed hashes, coarse features, a separate environment</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>In this section</h2>
        <ul className="child-links">
          <li><Link to="/security/threat-model">Threat Model</Link>: who attacks the system, and where</li>
          <li><Link to="/security/identity-access">Identity &amp; Access</Link>: taxpayers, staff, and services</li>
          <li><Link to="/security/data-protection">Data Protection</Link>: what we store, encryption, and retention</li>
          <li><Link to="/security/abuse-prevention">Abuse Prevention</Link>: rate limits, lockout, bots, and fraud screening</li>
          <li><Link to="/security/audit-response">Audit &amp; Incident Response</Link>: what's recorded and what happens next</li>
          <li><Link to="/security/compliance">Privacy &amp; Compliance</Link>: legal and policy obligations</li>
        </ul>
        <p>
          Throughout, <Demo /> marks controls the demo enforces today, and <Planned /> marks what the production design
          adds.
        </p>
      </section>
    </Page>
  )
}

function ThreatModel() {
  return (
    <Page
      title="Threat Model"
      lede="Who would attack this service, what they want, and where they'd try. Each control in the other pages traces back to a row here."
    >
      <section>
        <h2>Threat actors</h2>
        <table className="metrics">
          <thead>
            <tr><th>Actor</th><th>Goal</th><th>Typical methods</th></tr>
          </thead>
          <tbody>
            <tr><td>Credential stuffers</td><td>Take over accounts in bulk to resell or exploit</td><td>Leaked password lists, botnets, residential proxies</td></tr>
            <tr><td>Refund fraud rings</td><td>Get refunds paid to them under stolen identities</td><td>Templated returns, shared bank accounts, tracking their filings' status</td></tr>
            <tr><td>Phishers</td><td>Trick taxpayers into handing over credentials or bank details</td><td>Lookalike sites, fake "refund problem" emails and texts timed to the season</td></tr>
            <tr><td>Insiders</td><td>Curiosity, selling data, or helping a fraud ring</td><td>Misusing legitimate support or admin access</td></tr>
            <tr><td>Bulk data thieves</td><td>Steal the whole database</td><td>Exploiting a vulnerability, stolen cloud credentials, a compromised dependency or build</td></tr>
          </tbody>
        </table>
        <p>
          These are the main five. <Link to="/security/threat-model/actors">Threat Actors</Link> profiles ten, including
          someone close to the taxpayer, dishonest preparers, and supply-chain attackers, with what stops each one.
        </p>
      </section>

      <section>
        <h2>Attack surfaces</h2>
        <ul className="points">
          <li><strong>Sign-in and account recovery.</strong> The most attacked endpoints. Recovery is often weaker than sign-in, so it gets the same protections.</li>
          <li><strong>Taxpayer API.</strong> Reading returns, drafts, estimates, and filing. Every call must be scoped to the signed-in user.</li>
          <li><strong>Admin console.</strong> Powerful actions on any return, so it's an attractive target for insiders and stolen staff credentials.</li>
          <li><strong>Agency integrations.</strong> Credentials for the IRS and states, and status data we act on.</li>
          <li><strong>Data stores and backups.</strong> Postgres, its replicas and snapshots, and exports.</li>
          <li><strong>Logs and traces.</strong> Easy to forget, and a common place for personal data to leak.</li>
          <li><strong>Build and deploy pipeline.</strong> Images, dependencies, and the credentials that deploy them.</li>
          <li><strong>ML pipeline <Planned />.</strong> The event export, training data, and model registry.</li>
        </ul>
      </section>

      <section>
        <h2>STRIDE at each boundary</h2>
        <table className="metrics">
          <thead>
            <tr><th>Threat</th><th>Where it bites</th><th>Answer</th></tr>
          </thead>
          <tbody>
            <tr><td>Spoofing</td><td>Sign-in, agency calls</td><td>Strong passwords and MFA; per-agency credentials and mTLS</td></tr>
            <tr><td>Tampering</td><td>Status from agencies, admin overrides</td><td>Only workers write status; admin changes go through the agency and are audited</td></tr>
            <tr><td>Repudiation</td><td>Staff actions</td><td>Append-only audit log with who, what, when, and from where</td></tr>
            <tr><td>Information disclosure</td><td>API responses, logs, backups</td><td>Per-user scoping, masked identifiers, no bodies in logs, encryption at rest</td></tr>
            <tr><td>Denial of service</td><td>Peak season, lockout abuse</td><td>Edge rate limiting, autoscaling, and challenges instead of hard lockouts at scale</td></tr>
            <tr><td>Elevation of privilege</td><td>Admin API, pods</td><td>Role checks on every admin route; non-root, read-only pods with no service account token</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Assumptions and out of scope</h2>
        <ul className="crosses">
          <li>The agencies' own systems are secure; we defend against a spoofed agency, not a compromised IRS.</li>
          <li>A taxpayer's own device isn't compromised. We limit the damage with short sessions and alerts, but can't prevent it.</li>
          <li>Return preparation and e-file transmission security belong to the filing product. We cover them only where this service touches them.</li>
        </ul>
      </section>
    </Page>
  )
}

// [actor, skill and resources, likelihood in season, impact, priority]
const ACTOR_PRIORITIES = [
  ['Credential stuffers', 'Moderate, with cheap automation at huge scale', 'Certain', 'Many accounts at once', 'Highest'],
  ['Refund fraud rings', 'Organized and well funded', 'Certain', 'Stolen refunds, and victims\' real returns rejected', 'Highest'],
  ['Phishers and impersonators', 'Low to moderate', 'Certain', 'Credentials and bank details taken outside our systems', 'High'],
  ['Someone close to the taxpayer', 'Low skill, but knows the victim\'s personal details', 'Likely', 'Severe for one person: money, location, or control', 'High'],
  ['Insiders', 'Legitimate access', 'Likely', 'Records viewed or sold; fraud helped', 'High'],
  ['Dishonest or compromised preparers', 'Legitimate delegated access', 'Possible', 'Every client of that preparer', 'Medium'],
  ['Bulk data thieves and ransomware crews', 'High, organized', 'Possible', 'Everyone\'s data, or the service down at peak', 'High'],
  ['Supply-chain attackers', 'High', 'Unlikely, but rising', 'Code running inside the service', 'Medium'],
  ['Nation-state actors', 'Very high', 'Unlikely', 'Bulk data on citizens, quietly', 'Medium'],
  ['Opportunistic scanners', 'Low, automated', 'Constant', 'Low, if the basics are right', 'Low'],
]

// Each profile: who, what they want, how they'd go after this service, what stops them, how we'd notice.
const ACTOR_PROFILES = [
  {
    name: 'Credential stuffers',
    wants: 'Working sign-ins, to resell or to use themselves. Tax accounts are valuable because they lead to refunds and identity data.',
    how: 'Replay passwords leaked from other sites against our sign-in, spread across botnets and residential proxies so each address makes only a few attempts.',
    stop: [['Per-IP, per-account, and per-password limits, and lockout an attacker can\'t turn against the owner', '/security/abuse-prevention/rate-limiting'], ['Edge bot defense and breached-password checks', '/security/abuse-prevention/bot-defense'], ['Passkeys and second factors, so a password alone opens nothing', '/security/identity-access/taxpayer']],
    notice: 'Failure rates and lockouts spiking, many accounts failing from few sources, and success rates that are oddly low for real people.',
  },
  {
    name: 'Refund fraud rings',
    wants: 'Refunds paid to accounts they control, under stolen identities, filed before the real taxpayer files.',
    how: 'File templated returns early in the season, route many refunds to the same few bank accounts, and use the status service to see which filings got through.',
    stop: [['Duplicate screening on bank fingerprints and near-identical figures, holding matches before they\'re sent', '/security/abuse-prevention'], ['Nothing in this service can change a refund amount or bank account', '/security'], ['Identity proofing before a return is filed', '/security/identity-access/taxpayer']],
    notice: 'Many returns into one bank fingerprint, filing velocity per device or network, and accounts that check status unusually often.',
  },
  {
    name: 'Phishers and impersonators',
    wants: 'Credentials and bank details, taken on sites and channels they control.',
    how: 'Lookalike domains and "there\'s a problem with your refund" emails and texts, timed to refund release dates and the April deadline.',
    stop: [['Notifications that say only that something changed, with no links asking for anything, so ours can\'t be used as a template', '/technical-design/functional/notifications'], ['Passkeys, which can\'t be phished onto a lookalike site', '/security/identity-access/taxpayer']],
    notice: 'Brand monitoring for lookalike domains (taken down quickly), DMARC reports of spoofed mail, and support calls about messages we didn\'t send.',
  },
  {
    name: 'Someone close to the taxpayer',
    wants: 'An ex-partner, a family member, or a housemate who wants to see the refund amount, where it\'s going, or where the taxpayer now lives, or to control the money.',
    how: 'They know the taxpayer\'s tax ID, date of birth, and history, which defeats knowledge-based questions, and they may have used the taxpayer\'s devices.',
    stop: [['No knowledge-based questions anywhere; passkeys and second factors instead', '/security/identity-access/taxpayer'], ['Alerts for new devices, a list of active sessions, and sign out everywhere', '/security/identity-access/taxpayer'], ['Support sees a return only when the taxpayer shares it from inside their own account', '/security/identity-access/agents']],
    notice: 'Sign-ins from a new device in an unusual pattern, and recovery attempts the owner didn\'t start. Support is trained to recognize callers who aren\'t the taxpayer.',
  },
  {
    name: 'Insiders',
    wants: 'Usually curiosity. Sometimes money: selling records, or helping a fraud ring by releasing held returns.',
    how: 'Misuse legitimate support or admin access, often looking up people they know or browsing in bulk.',
    stop: [['Support sees a return only while its taxpayer shares it, 5 minutes at a time; every view audited', '/security/threat-model/attack-surfaces/insider'], ['Two people to release a held return', '/security/threat-model/attack-surfaces/insider'], ['No person can decrypt return figures in production', '/security/data-protection/encryption']],
    notice: 'Views without a case, out of hours, or in bulk; searches for names rather than case work; releases clustered on one admin.',
  },
  {
    name: 'Dishonest or compromised preparers',
    wants: 'Their clients\' refunds, or their clients\' data, or an attacker who has taken over the preparer\'s account wants the same.',
    how: 'Use delegated access to many clients at once, sometimes from a firm whose own security is weak.',
    stop: [['Verified PTIN and EFIN, client grants per taxpayer that the taxpayer can revoke, and MFA for preparers', '/security/identity-access/preparers']],
    notice: 'A preparer touching far more clients than usual, or from new locations; clients revoking grants.',
  },
  {
    name: 'Bulk data thieves and ransomware crews',
    wants: 'The whole database to sell, or the service held hostage when downtime costs the most.',
    how: 'Exploit a vulnerability, steal cloud or database credentials, or move sideways from another compromised system.',
    stop: [['Minimal data: last 4 digits only, no full bank numbers, figures encrypted per taxpayer', '/security/data-protection/minimization'], ['Workload identity, deny-by-default networking, and per-service credentials', '/security/service-auth'], ['Keys in a separate account, and backups that ransomware can\'t reach', '/security/data-protection/encryption']],
    notice: 'Unusual KMS decrypt volume, large reads or exports, new egress destinations, and access from unexpected identities.',
  },
  {
    name: 'Supply-chain attackers',
    wants: 'Code running inside the service, through a dependency, a base image, or the build.',
    how: 'Publish a malicious package version, compromise a maintainer, or steal the credentials that deploy.',
    stop: [['Pinned and reviewed dependencies, signed images built in isolated CI, and deploy credentials that can\'t be used outside the pipeline', '/security/service-auth']],
    notice: 'Unexpected dependency changes in review, images without valid signatures blocked at deploy, and new outbound connections from pods.',
  },
  {
    name: 'Nation-state actors',
    wants: 'Data on millions of people for intelligence, taken quietly and kept for years.',
    how: 'Patient, skilled intrusion: zero-days, supply chains, and long dwell time.',
    stop: [['We don\'t claim to defeat them. The same controls raise the cost, minimal data limits what there is to take, and monitoring shortens how long they go unseen.', '/security/monitoring']],
    notice: 'The same detection as above, plus threat intelligence shared through industry groups, the IRS, and government partners.',
  },
  {
    name: 'Opportunistic scanners',
    wants: 'Any easy way in: a known vulnerability, an exposed admin page, a default password.',
    how: 'Automated scans of the whole internet.',
    stop: [['Patching on a schedule, one public entry point, no exposed admin surfaces, and an edge firewall', '/security/threat-model/attack-surfaces']],
    notice: 'Edge logs. Mostly noise, which is the point: they find nothing.',
  },
]

function ThreatActors() {
  return (
    <Page
      eyebrow="Threat Model"
      title="Threat Actors"
      deeper={false}
      lede="Who would attack a tax refund service, what each wants, how they'd go about it here, and what stops them. Refunds are money and returns are identity, so this service draws more than its share of attackers, mostly in the same weeks taxpayers need it most."
    >
      <section>
        <h2>Priorities</h2>
        <div className="table-scroll">
          <table className="metrics">
            <thead>
              <tr><th>Actor</th><th>Skill and resources</th><th>Likelihood in season</th><th>Impact</th><th>Priority</th></tr>
            </thead>
            <tbody>
              {ACTOR_PRIORITIES.map(([actor, skill, likely, impact, priority]) => (
                <tr key={actor}><td>{actor}</td><td>{skill}</td><td>{likely}</td><td>{impact}</td><td>{priority}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Priority weighs how likely an attack is in filing season against how much harm it does, and to how many people.
          The two highest are certain to happen at scale every season.
        </p>
      </section>

      <section>
        <h2>Profiles</h2>
        {ACTOR_PROFILES.map((a) => (
          <div key={a.name} className="actor">
            <h3>{a.name}</h3>
            <dl className="actor-facts">
              <dt>Wants</dt><dd>{a.wants}</dd>
              <dt>Here, they'd</dt><dd>{a.how}</dd>
              <dt>Stopped by</dt>
              <dd>
                <ul>
                  {a.stop.map(([text, to]) => <li key={text}><Link to={to}>{text}</Link></li>)}
                </ul>
              </dd>
              <dt>We notice</dt><dd>{a.notice}</dd>
            </dl>
          </div>
        ))}
      </section>

      <section>
        <h2>When they're busiest</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>When</th><th>Who</th><th>Why</th></tr>
          </thead>
          <tbody>
            <tr><td>Late January to February</td><td>Refund fraud rings</td><td>Filing before the real taxpayer is what makes identity fraud pay; the first refunds go out in these weeks.</td></tr>
            <tr><td>Refund release dates</td><td>Phishers, credential stuffers</td><td>Taxpayers are waiting for money and expect messages about it, so lures work best.</td></tr>
            <tr><td>The week before April 15</td><td>Everyone, especially bots</td><td>Attack traffic hides in the year's biggest legitimate peak.</td></tr>
            <tr><td>Off season</td><td>Bulk data thieves, supply-chain attackers</td><td>Patient attacks don't need the season; fewer people are watching closely.</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Why holding less helps</h2>
        <p>
          Most of these actors want one of three things: sign-ins, money, or data. This service can't move money, and it
          holds the least data that works: no full tax IDs, no full bank numbers, and return figures encrypted per taxpayer.
          A thief who gets the whole database gets far less than they came for, which makes this a worse target than one
          that holds everything. See <Link to="/security/data-protection/minimization">Minimization &amp; Retention</Link>.
          What's assumed out of scope is listed on the <Link to="/security/threat-model">Threat Model</Link> page.
        </p>
      </section>
    </Page>
  )
}

function IdentityAccess() {
  return (
    <Page
      title="Identity & Access"
      lede="How we know which person is asking, and what each kind of person is allowed to do: taxpayers, support staff, and preparers. How services identify themselves to each other is covered in Service-to-Service Auth."
    >
      <section>
        <h2>Taxpayers</h2>
        <ul className="checks">
          <li><Demo /> Email and password, with passwords hashed using Argon2id and a per-password salt.</li>
          <li><Demo /> Failures never say why. An unknown email is checked against a dummy hash, so it takes as long as a wrong password.</li>
          <li><Demo /> Every taxpayer query is scoped to the user ID from the session; the API never trusts a user or return ID sent by the client.</li>
          <li><Planned /> Multi-factor sign-in, preferring passkeys (WebAuthn), then authenticator apps, with SMS only as a fallback.</li>
          <li><Planned /> Risk-based checks: a new device, location, or impossible travel triggers a second factor and an email alert.</li>
          <li><Planned /> Account recovery as strong as sign-in: identity proofing and a waiting period with notification, never just an email link.</li>
        </ul>
      </section>

      <section>
        <h2>Sessions</h2>
        <ul className="checks">
          <li><Demo /> An opaque random token in a cookie that's HttpOnly, Secure, and SameSite=Strict.</li>
          <li><Demo /> Only a SHA-256 hash of the token is stored, so a database leak doesn't hand out live sessions.</li>
          <li><Demo /> Sessions expire after 30 minutes, and signing out deletes them. Because they're server-side, revoking every session is one statement.</li>
          <li><Demo /> State-changing requests need a custom header, which forces a CORS preflight that the API never approves. With SameSite=Strict, this blocks cross-site request forgery.</li>
        </ul>
      </section>

      <section>
        <h2>Staff</h2>
        <ul className="checks">
          <li><Demo /> Admin routes sit behind a role check on every request, separate from taxpayer access.</li>
          <li><Demo /> Every admin action is written to the audit log, with what changed.</li>
          <li><Planned /> Company SSO with phishing-resistant hardware keys, no shared accounts, and a separate admin hostname reachable only from the corporate network.</li>
          <li><Planned /> Support agents open a record only through a case or call, see masked data by default, and request elevation just in time, with a reason.</li>
          <li><Planned /> Access reviews every quarter, and automatic removal when someone changes role or leaves.</li>
        </ul>
      </section>

      <section>
        <h2>Side by side</h2>
        <table className="metrics compare">
          <thead>
            <tr><th></th><th>Taxpayer</th><th>Support agent</th><th>Preparer</th></tr>
          </thead>
          <tbody>
            <tr><td>Who vouches for the identity</td><td>Proofing vendor</td><td>HR, with a background check</td><td>Proofing vendor and the credentialing body</td></tr>
            <tr><td>Sign-in</td><td>Passkey, with fallbacks</td><td>Company SSO and a hardware key</td><td>Passkey or hardware key, no SMS</td></tr>
            <tr><td>What grants access to a return</td><td>Filing it from the account</td><td>An active case, masked by default</td><td>The taxpayer's scoped, expiring grant</td></tr>
            <tr><td>Who can see the access</td><td>Them</td><td>Audit log and reviewers</td><td>The taxpayer, plus the audit log</td></tr>
            <tr><td>How access ends</td><td>Account closed</td><td>HR event or failed review</td><td>Grant expires or is revoked, seat removed, or PTIN lapses</td></tr>
          </tbody>
        </table>
      </section>
    </Page>
  )
}

// Flowchart for establishing a taxpayer's identity.
const PROOF_NODES = {
  start: {
    kind: 'terminal', x: 30, y: 12, w: 220, h: 36, title: 'Signs up or files', kicker: 'Start',
    points: [[null, 'Most taxpayers arrive while filing, weeks before they check status. Proofing happens then, so a status check in peak season is just a fast sign-in.']],
  },
  acct: {
    kind: 'step', x: 30, y: 72, w: 220, h: 40, title: 'Create account', kicker: 'Enroll',
    points: [
      ['demo', 'Seeded accounts sign in with email and password.'],
      ['planned', 'Email and phone are verified with one-time codes before anything else is set up.'],
      ['planned', 'A verified phone gives an out-of-band channel for security alerts. It is not proof of identity on its own, because of SIM swaps.'],
    ],
  },
  passkey: {
    kind: 'step', x: 30, y: 136, w: 220, h: 40, title: 'Register passkey', kicker: 'Bind authenticators',
    points: [
      ['demo', 'Passwords are hashed with Argon2id and a per-password salt. Unknown emails are checked against a dummy hash, so timing reveals nothing.'],
      ['planned', 'Passkeys (WebAuthn) are the default. The browser binds them to our domain, so a look-alike site gets nothing it can replay.'],
      ['planned', 'Authenticator apps (TOTP) next. SMS or voice codes only as a fallback for taxpayers with nothing else, and never for staff.'],
      ['planned', 'Passwords follow 800-63B-4: at least 15 characters alone or 8 with a second factor, no composition rules or forced rotation, and a breached-password check using a k-anonymity range query.'],
      ['planned', "At least two authenticators plus single-use recovery codes stored as hashes, so a lost phone isn't a recovery event."],
    ],
  },
  filed: {
    kind: 'decision', cx: 140, cy: 230, rx: 100, ry: 32, title: 'Return filed here?', kicker: 'Ownership',
    points: [
      ['demo', 'A return belongs to the account that filed it. Reads are scoped to the session user ID, and there is no lookup by SSN.'],
      ['demo', "Only the last four digits of the tax ID are stored, so the account can't be mined for full SSNs."],
      ['planned', 'Never add a "check any SSN" lookup. Agency status APIs take SSN, filing status, and refund amount, so exposing that would make the service an oracle for stolen identities.'],
    ],
  },
  acctonly: {
    kind: 'neutral', x: 290, y: 210, w: 160, h: 40, title: 'Account only', kicker: 'Exception',
    points: [
      ['planned', 'The account works but shows no refund details.'],
      ['planned', "A spouse on a joint return gets their own account, is proofed separately, and is linked by the filer's invitation, never by typing the shared SSN."],
    ],
  },
  proofed: {
    kind: 'decision', cx: 140, cy: 330, rx: 92, ry: 32, title: 'Already proofed?', kicker: 'Proofing',
    points: [
      ['planned', 'Proofing to IAL2 happens once per person. Someone proofed last season, or for another return in this account, goes straight to matching.'],
      ['planned', 'Proofing is redone when it is older than policy allows, and after any account recovery.'],
    ],
  },
  idv: {
    kind: 'step', x: 30, y: 392, w: 220, h: 40, title: 'ID + selfie check', kicker: 'Proofing · primary evidence',
    points: [
      ['planned', 'A certified proofing vendor checks a government ID and a selfie liveness capture.'],
      ['planned', 'Credit-bureau knowledge questions are not used. The answers are widely breached, and 800-63-4 no longer allows them for proofing.'],
    ],
  },
  passed: {
    kind: 'decision', cx: 140, cy: 490, rx: 60, ry: 30, title: 'Passed?', kicker: 'Proofing',
    points: [['planned', 'A pass continues to matching. A fail or an inconclusive result goes to the fallback, never to a silent rejection.']],
  },
  supervised: {
    kind: 'step', x: 290, y: 470, w: 160, h: 40, title: 'Supervised proofing', kicker: 'Proofing · fallback',
    points: [
      ['planned', 'One self-service retry, then supervised remote (video) or in-person proofing.'],
      ['planned', "It serves taxpayers without a supported ID or smartphone, so proofing doesn't exclude them."],
    ],
  },
  passed2: {
    kind: 'decision', cx: 370, cy: 570, rx: 56, ry: 28, title: 'Passed?', kicker: 'Proofing · fallback',
    points: [['planned', 'A pass rejoins the main path at matching.']],
  },
  match: {
    kind: 'step', x: 30, y: 550, w: 220, h: 40, title: 'Match to return', kicker: 'Binding identity to the return',
    points: [
      ['planned', 'The proofed name and SSN must match the return, compared against the last four digits on file.'],
      ['planned', "Supporting signals: last year's AGI, which the IRS uses to sign e-filed returns, and a phone number the carrier matches to the name."],
      ['planned', 'Prior-year facts raise confidence but never pass alone. A preparer, or anyone with a copy of the return, knows them too.'],
    ],
  },
  notyet: {
    kind: 'danger', x: 290, y: 626, w: 160, h: 40, title: 'Not proofed yet', kicker: 'Exception',
    points: [
      ['planned', 'No refund details are shown until proofing succeeds.'],
      ['planned', "Support can help finish proofing, but can't skip it or vouch for the taxpayer."],
    ],
  },
  matches: {
    kind: 'decision', cx: 140, cy: 720, rx: 70, ry: 30, title: 'Matches?', kicker: 'Binding identity to the return',
    points: [['planned', "A proofed person who doesn't match the return they're claiming is a strong fraud signal, not a typo to retry."]],
  },
  fraud: {
    kind: 'danger', x: 290, y: 700, w: 160, h: 40, title: 'Fraud review', kicker: 'Exception',
    points: [
      ['planned', 'Access to the return is blocked, and the account goes to the fraud team.'],
      ['demo', "It works like the processor's duplicate-refund screening, which holds suspicious filings until an admin releases them."],
    ],
  },
  record: {
    kind: 'step', x: 30, y: 780, w: 220, h: 40, title: 'Record result', kicker: 'Protecting identity data',
    points: [
      ['demo', 'Stored identifiers are minimized: the last four of the tax ID and bank account, and an HMAC fingerprint of the account for duplicate screening.'],
      ['planned', 'Keep the verdict, assurance level, vendor reference, and date. Document images and selfies stay with the vendor under contract and are deleted on its schedule.'],
      ['planned', 'Contact details and authenticator records are encrypted at the field level, with keys in a KMS and access logged.'],
      ['planned', 'Every identity event (sign-in, step-up, change, recovery) is audit-logged with device and network, so a disputed takeover can be reconstructed.'],
    ],
  },
  done: {
    kind: 'success', x: 30, y: 850, w: 220, h: 36, title: 'Refund details unlocked', kicker: 'Done',
    points: [
      ['planned', 'The account is proofed to IAL2 and signs in at AAL2. Sensitive actions still step up, as described below.'],
      ['planned', "If the IRS or a state holds the return for its own identity check (for example IRS letter 5071C), we explain the letter and link to the agency's process. Our proofing can't release it."],
    ],
  },
}

const PROOF_EDGES = [
  { from: 'start', to: 'acct', d: 'M140 48 V72' },
  { from: 'acct', to: 'passkey', d: 'M140 112 V136' },
  { from: 'passkey', to: 'filed', d: 'M140 176 V198' },
  { from: 'filed', to: 'proofed', d: 'M140 262 V298', label: 'Yes', lx: 148, ly: 284 },
  { from: 'filed', to: 'acctonly', d: 'M240 230 H290', label: 'No', lx: 265, ly: 223, anchor: 'middle' },
  { from: 'proofed', to: 'idv', d: 'M140 362 V392', label: 'No', lx: 148, ly: 381 },
  { from: 'proofed', to: 'match', d: 'M48 330 H14 V570 H30', label: 'Yes', lx: 18, ly: 322 },
  { from: 'idv', to: 'passed', d: 'M140 432 V460' },
  { from: 'passed', to: 'match', d: 'M140 520 V550', label: 'Yes', lx: 148, ly: 539 },
  { from: 'passed', to: 'supervised', d: 'M200 490 H290', label: 'No', lx: 245, ly: 483, anchor: 'middle' },
  { from: 'supervised', to: 'passed2', d: 'M370 510 V542' },
  { from: 'passed2', to: 'match', d: 'M314 570 H250', label: 'Yes', lx: 282, ly: 563, anchor: 'middle' },
  { from: 'passed2', to: 'notyet', d: 'M370 598 V626', label: 'No', lx: 378, ly: 616 },
  { from: 'match', to: 'matches', d: 'M140 590 V690' },
  { from: 'matches', to: 'record', d: 'M140 750 V780', label: 'Yes', lx: 148, ly: 769 },
  { from: 'matches', to: 'fraud', d: 'M210 720 H290', label: 'No', lx: 250, ly: 713, anchor: 'middle' },
  { from: 'record', to: 'done', d: 'M140 820 V850' },
]

const PROOF_PATH = ['start', 'acct', 'passkey', 'filed', 'proofed', 'idv', 'passed', 'match', 'matches', 'record', 'done']

function TaxpayerIdentity() {
  return (
    <Page
      eyebrow="Identity & Access"
      title="Taxpayer Identity"
      deeper={false}
      lede="How an account comes to stand for a real taxpayer, and how we keep it that way: proofing at enrollment, phishing-resistant sign-in, step-up for risky actions, and recovery that is no weaker than sign-in."
    >
      <section>
        <h2>Two different questions</h2>
        <p>
          Identity work answers two questions that are easy to blur. <strong>Proofing</strong> asks, once, whether the
          person creating or claiming an account is the real taxpayer. <strong>Authentication</strong> asks, every time,
          whether the person signing in is the same one who was proofed. Most account takeovers exploit the seams between
          them: a weak recovery flow, a phone number changed without checks, or a sign-in that never needed proofing at all.
        </p>
        <p>
          We follow NIST SP 800-63-4 vocabulary: an <em>identity assurance level</em> (IAL) for proofing and an{' '}
          <em>authentication assurance level</em> (AAL) for sign-in. The target is IAL2 and AAL2 for any account that can
          see refund details, with AAL3-style hardware keys for staff.
        </p>
      </section>

      <section>
        <h2>The identity lifecycle</h2>
        <ol className="timeline">
          <li><strong>Enroll</strong><span>Create the account with a verified email and phone. Nothing about a return is visible yet.</span></li>
          <li><strong>Prove</strong><span>Establish that the account holder is the taxpayer named on the return, to IAL2, before showing any refund detail.</span></li>
          <li><strong>Bind</strong><span>Register at least two authenticators, ideally a passkey on each device plus recovery codes.</span></li>
          <li><strong>Authenticate</strong><span>Sign in with a phishing-resistant factor, stepping up for sensitive actions or risky context.</span></li>
          <li><strong>Monitor</strong><span>Watch sessions for takeover signals, and tell the taxpayer about every security change.</span></li>
          <li><strong>Recover</strong><span>Restore access by re-proofing, with a waiting period and notice to old contacts.</span></li>
          <li><strong>Retire</strong><span>Close the account, revoke authenticators and sessions, and delete per the retention schedule.</span></li>
        </ol>
      </section>

      <section>
        <h2>Establishing identity</h2>
        <p>
          An account is proofed to IAL2 and bound to the return before any refund detail appears. No single check
          decides: a vendor's ID and liveness check is the primary evidence, matched against the return and supported
          by other signals, with a supervised fallback so nobody is shut out.
        </p>
        <Flowchart
          id="idflow-taxpayer"
          nodes={PROOF_NODES}
          edges={PROOF_EDGES}
          path={PROOF_PATH}
          height={900}
          label="Flowchart for establishing a taxpayer's identity: enroll, register a passkey, prove identity with a vendor or a supervised fallback, match the identity to the return, then unlock refund details."
        />
      </section>

      <section>
        <h2>Step-up for sensitive actions</h2>
        <p>
          A signed-in session isn't permission for everything. Each action has an assurance it needs, and the API checks
          how recently and how strongly the session was authenticated before allowing it.
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Action</th><th>What it requires</th></tr>
          </thead>
          <tbody>
            <tr><td>See refund status and estimate</td><td>Proofed account, two-factor sign-in within the last 30 days on a remembered device</td></tr>
            <tr><td>See amounts, letters, and masked bank details</td><td>The same, plus no unresolved risk signal on the session</td></tr>
            <tr><td>Change email, phone, password, or authenticators</td><td>A second factor in the last 5 minutes, with notice sent to the old and new contacts</td></tr>
            <tr><td>Remove the last phishing-resistant factor</td><td>Fresh passkey or recovery code, and a 24-hour delay</td></tr>
            <tr><td>Recover a lost account</td><td>Re-proofing to IAL2 and a waiting period, described below</td></tr>
            <tr><td>Staff opening a taxpayer record</td><td>Company SSO with a hardware key, plus a case reference</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Protecting the identity in use</h2>
        <ul className="checks">
          <li><Demo /> Every sign-in issues a new random session token, so a token planted before sign-in is useless.</li>
          <li><Demo /> Tokens live in an HttpOnly, Secure, SameSite=Strict cookie, and only their SHA-256 hash is stored.</li>
          <li><Demo /> Sessions end after 30 minutes idle, and signing out deletes them on the server.</li>
          <li><Planned /> An absolute session lifetime, such as 12 hours, regardless of activity, and a new token whenever the session steps up.</li>
          <li><Planned /> Remembered devices tracked by a signed device cookie or passkey, so a new device always gets a second factor.</li>
          <li><Planned /> A "Devices and sessions" page where the taxpayer can see where they're signed in and sign out everywhere.</li>
        </ul>
      </section>

      <section>
        <h2>Detecting takeover</h2>
        <ul className="points">
          <li>
            <strong>Risk signals at sign-in.</strong> New device, new network or country, impossible travel, a password
            seen in a breach, or the IP behind a credential-stuffing burst. High risk triggers step-up; very high risk
            blocks and notifies.
          </li>
          <li>
            <strong>Risk signals after sign-in.</strong> A contact change followed quickly by an authenticator change,
            or many accounts touched from one device. These suspend sensitive actions until the owner confirms.
          </li>
          <li>
            <strong>Tell the owner, on every channel.</strong> Each sign-in from a new device and every security change
            sends an email and a push or SMS to the contacts that were on file <em>before</em> the change, with a
            "This wasn't me" link.
          </li>
          <li>
            <strong>"This wasn't me" is a kill switch.</strong> It revokes every session, freezes changes, and routes
            the account to recovery with re-proofing.
          </li>
        </ul>
      </section>

      <section>
        <h2>Recovery: no weaker than sign-in</h2>
        <p>
          Attackers rarely break a strong sign-in; they go around it through recovery. Recovery is designed as a
          sign-in of its own, at the same assurance.
        </p>
        <ul className="checks">
          <li><Planned /> Recover with a second registered passkey or a recovery code first. Neither needs support or a waiting period.</li>
          <li><Planned /> Without either, re-proof to IAL2 with the same vendor flow, matched against the original proofing record.</li>
          <li><Planned /> A waiting period, such as 72 hours, before new authenticators take effect, with notice to every old contact so a real owner can cancel it.</li>
          <li><Planned /> No security questions, and no recovery by email link alone. An email inbox is often the first thing an attacker owns.</li>
          <li><Planned /> Support agents can't reset authenticators. They can start the re-proofing flow, which keeps social engineering of the call center from becoming a bypass.</li>
        </ul>
      </section>

      <section>
        <h2>Trade-offs</h2>
        <ul className="points">
          <li>
            <strong>Friction at peak.</strong> Proofing and passkey enrollment happen when the taxpayer files, weeks
            before they check status, so filing-season status checks are a fast sign-in, not a proofing session.
          </li>
          <li>
            <strong>Inclusion.</strong> Not everyone has a smartphone or a current ID. SMS fallback and supervised
            proofing stay available, with tighter risk checks rather than a hard refusal.
          </li>
          <li>
            <strong>Waiting periods frustrate real owners.</strong> They are the price of making recovery useless to
            attackers. A real owner who still has any registered factor never waits.
          </li>
        </ul>
      </section>
    </Page>
  )
}

// Flowchart for establishing a support agent's identity: vouched for by HR, held in the company identity provider.
const AGENT_NODES = {
  hire: {
    kind: 'terminal', x: 30, y: 12, w: 220, h: 36, title: 'Hired or contracted', kicker: 'Start',
    points: [
      ['planned', 'Support agents are employees, or contractors at a support vendor. Either way they get an identity in our identity provider, so one set of controls covers everyone who can see taxpayer data.'],
      ['planned', 'Contractor accounts are sponsored by a named employee and expire with the contract.'],
    ],
  },
  vetting: {
    kind: 'step', x: 30, y: 72, w: 220, h: 40, title: 'Background check', kicker: 'Vetting',
    points: [
      ['planned', "HR verifies the person's identity documents at hiring (Form I-9) and runs a background check before any access to taxpayer data."],
      ['planned', 'Support vendors attest to equivalent checks under contract, and we audit them.'],
    ],
  },
  clear: {
    kind: 'decision', cx: 140, cy: 166, rx: 60, ry: 30, title: 'Clear?', kicker: 'Vetting',
    points: [['planned', 'Access is never granted "pending" a background check.']],
  },
  noacct: {
    kind: 'danger', x: 290, y: 146, w: 160, h: 40, title: 'No account', kicker: 'Exception',
    points: [['planned', 'No account is created, so there is nothing to revoke later.']],
  },
  provision: {
    kind: 'step', x: 30, y: 226, w: 220, h: 40, title: 'Account from HR', kicker: 'Provisioning',
    points: [
      ['demo', 'Admin accounts are seeded users with the admin role. They sign in through the same form as taxpayers.'],
      ['planned', 'Accounts are created only from the HR system, or the vendor roster for contractors, through SCIM provisioning. No self sign-up, and no hand-made accounts.'],
      ['planned', 'Company SSO, with one person per account. Staff never use taxpayer accounts, and taxpayer sign-in never grants staff access.'],
    ],
  },
  key: {
    kind: 'step', x: 30, y: 290, w: 220, h: 40, title: 'Enroll hardware key', kicker: 'Bind authenticators',
    points: [
      ['planned', 'A FIDO2 hardware security key, enrolled in person or over supervised video, where IT checks a government ID against the HR record.'],
      ['planned', 'No SMS or app codes for staff. A replacement key goes through the same supervised enrollment, which closes the help-desk reset loophole.'],
      ['planned', 'Taxpayer data is reachable only from managed devices that pass a posture check.'],
    ],
  },
  training: {
    kind: 'decision', cx: 140, cy: 384, rx: 86, ry: 32, title: 'Training done?', kicker: 'Readiness',
    points: [['planned', 'Privacy and security training comes first: §7216 disclosure rules, masking, and spotting social engineering on calls. It is renewed every year.']],
  },
  nodata: {
    kind: 'neutral', x: 290, y: 364, w: 160, h: 40, title: 'No data access', kicker: 'Exception',
    points: [['planned', 'The account works for email and internal tools, but has no role on taxpayer data until training is complete.']],
  },
  role: {
    kind: 'step', x: 30, y: 446, w: 220, h: 40, title: 'Role from job code', kicker: 'Authorization',
    points: [
      ['demo', 'Admin routes check the role on every request, separately from taxpayer access.'],
      ['planned', 'The role comes from the job code: agent, supervisor, fraud analyst, or admin, each with least privilege. Changing jobs removes the old role.'],
      ['planned', 'Admin tools on a separate hostname, reachable only from the corporate network.'],
    ],
  },
  caseview: {
    kind: 'step', x: 30, y: 510, w: 220, h: 40, title: 'Open case to view', kicker: 'Access to a taxpayer',
    points: [
      ['demo', 'Every admin action is written to the audit log.'],
      ['planned', 'An agent opens a record only from an active case or inbound call. Data is masked by default, and unmasking needs a reason and expires.'],
      ['planned', 'The caller is verified through their account, for example by approving a prompt in the signed-in app, never by reciting their SSN.'],
      ['planned', "Agents can't reset a taxpayer's sign-in methods. They can only start the taxpayer's re-proofing flow."],
    ],
  },
  review: {
    kind: 'step', x: 30, y: 574, w: 220, h: 40, title: 'Quarterly review', kicker: 'Recertification',
    points: [
      ['planned', 'Managers recertify each person\'s access every quarter, and unused privileges are removed.'],
      ['planned', 'Access logs are sampled for snooping, such as looking up relatives, coworkers, or public figures.'],
    ],
  },
  needed: {
    kind: 'decision', cx: 140, cy: 668, rx: 80, ry: 30, title: 'Still needed?', kicker: 'Recertification',
    points: [['planned', 'If yes, access continues and the next case goes through the same checks. If not, access ends.']],
  },
  offboard: {
    kind: 'terminal', x: 30, y: 728, w: 220, h: 36, title: 'Offboarded', kicker: 'Retire',
    points: [
      ['planned', 'A termination or role change in HR disables the account, revokes keys, and ends sessions within minutes.'],
      ['planned', 'Contractor accounts expire on their own at the end of the contract.'],
    ],
  },
}

const AGENT_EDGES = [
  { from: 'hire', to: 'vetting', d: 'M140 48 V72' },
  { from: 'vetting', to: 'clear', d: 'M140 112 V136' },
  { from: 'clear', to: 'provision', d: 'M140 196 V226', label: 'Yes', lx: 148, ly: 215 },
  { from: 'clear', to: 'noacct', d: 'M200 166 H290', label: 'No', lx: 245, ly: 159, anchor: 'middle' },
  { from: 'provision', to: 'key', d: 'M140 266 V290' },
  { from: 'key', to: 'training', d: 'M140 330 V352' },
  { from: 'training', to: 'role', d: 'M140 416 V446', label: 'Yes', lx: 148, ly: 435 },
  { from: 'training', to: 'nodata', d: 'M226 384 H290', label: 'No', lx: 258, ly: 377, anchor: 'middle' },
  { from: 'role', to: 'caseview', d: 'M140 486 V510' },
  { from: 'caseview', to: 'review', d: 'M140 550 V574' },
  { from: 'review', to: 'needed', d: 'M140 614 V638' },
  { from: 'needed', to: 'caseview', d: 'M60 668 H14 V530 H30', label: 'Yes', lx: 18, ly: 660 },
  { from: 'needed', to: 'offboard', d: 'M140 698 V728', label: 'No', lx: 148, ly: 717 },
]

const AGENT_PATH = ['hire', 'vetting', 'clear', 'provision', 'key', 'training', 'role', 'caseview', 'review', 'needed', 'offboard']

// Flowchart for establishing a preparer's identity: proofed like a taxpayer, credentialed, and granted access by each client.
const PREPARER_NODES = {
  signup: {
    kind: 'terminal', x: 30, y: 12, w: 220, h: 36, title: 'Pro sign-up', kicker: 'Start',
    points: [['planned', 'Preparers and their staff use a separate professional account, never a taxpayer account. A preparer who also files their own return has two identities that never mix.']],
  },
  proof: {
    kind: 'step', x: 30, y: 72, w: 220, h: 40, title: 'Proof to IAL2', kicker: 'Proofing',
    points: [
      ['planned', 'Each person is proofed to IAL2 with the same vendor flow as taxpayers, including the supervised fallback.'],
      ['planned', 'There are no firm-level identities. Every person in a firm is proofed on their own.'],
    ],
  },
  creds: {
    kind: 'step', x: 30, y: 136, w: 220, h: 40, title: 'Verify credentials', kicker: 'Professional standing',
    points: [
      ['planned', 'Every paid federal preparer must have a PTIN, renewed each year. We collect it with any professional credential: a CPA license, checked with the state board\'s public lookup, or enrolled agent or attorney status.'],
      ['planned', "Firms that e-file have an EFIN. We check it against the IRS e-file acceptance letter, with a manual review."],
      ['planned', 'Credentials show that someone is a legitimate preparer. They never, on their own, allow access to any taxpayer.'],
    ],
  },
  verified: {
    kind: 'decision', cx: 140, cy: 230, rx: 70, ry: 30, title: 'Verified?', kicker: 'Professional standing',
    points: [['planned', 'A credential that is missing, lapsed, or registered to a different name stops the flow.']],
  },
  manual: {
    kind: 'danger', x: 290, y: 210, w: 160, h: 40, title: 'Manual review', kicker: 'Exception',
    points: [
      ['planned', 'A trust and safety analyst reviews the case. The account has no access in the meantime.'],
      ['planned', 'Mismatches feed fraud detection, because stolen preparer credentials are a known route to refund fraud.'],
    ],
  },
  firm: {
    kind: 'step', x: 30, y: 290, w: 220, h: 40, title: 'Join or create firm', kicker: 'Organization',
    points: [
      ['planned', 'Creating a firm requires a verified EFIN or credential. The firm admin invites staff to named seats and can remove them instantly.'],
      ['planned', 'No shared logins. IRS Publication 4557 and the FTC Safeguards Rule both expect each user to have their own credentials.'],
    ],
  },
  mfa: {
    kind: 'step', x: 30, y: 354, w: 220, h: 40, title: 'Register security key', kicker: 'Bind authenticators',
    points: [
      ['planned', 'Phishing-resistant sign-in is mandatory: passkeys or hardware security keys, never SMS. The FTC Safeguards Rule requires multi-factor sign-in for anyone accessing customer information.'],
      ['planned', 'The firm attests that it keeps a written information security plan, as the IRS expects of preparers.'],
    ],
  },
  grant: {
    kind: 'step', x: 30, y: 418, w: 220, h: 40, title: 'Client grants access', kicker: 'Authorization',
    points: [
      ['planned', "Access comes from the taxpayer, not from the preparer's claim. Either the taxpayer consented when they signed a return the firm filed through our pro product, or they approve an invitation in their own account."],
      ['planned', 'Each grant is scoped: which returns, which tax year, read-only status, and an expiry such as the end of the season. The §7216 consent is recorded with it.'],
      ['planned', 'A preparer can never add a client by typing an SSN.'],
    ],
  },
  approved: {
    kind: 'decision', cx: 140, cy: 512, rx: 88, ry: 32, title: 'Client approved?', kicker: 'Authorization',
    points: [['planned', 'Without an active grant the preparer sees nothing, not even whether the taxpayer has an account.']],
  },
  noclient: {
    kind: 'neutral', x: 290, y: 492, w: 160, h: 40, title: 'No client data', kicker: 'Exception',
    points: [['planned', "A pending invitation looks the same whether or not the person exists, so invitations can't be used to discover accounts."]],
  },
  view: {
    kind: 'step', x: 30, y: 574, w: 220, h: 40, title: 'View client status', kicker: 'Access to a taxpayer',
    points: [
      ['planned', 'Read-only status and estimate for the granted returns, with bank details masked. There is no bulk export.'],
      ['planned', 'Every view is logged and shown to the taxpayer, for example "Your preparer viewed your refund status on Mar 3."'],
      ['planned', 'Anomaly detection flags bulk viewing, unusual hours, new devices, and clients outside the firm\'s usual set.'],
    ],
  },
  valid: {
    kind: 'decision', cx: 140, cy: 668, rx: 76, ry: 30, title: 'Still valid?', kicker: 'Continuous checks',
    points: [['planned', "Checked on every request: the grant hasn't expired or been revoked, the seat is active, the PTIN was renewed this year, and no risk signal is open."]],
  },
  ends: {
    kind: 'terminal', x: 30, y: 728, w: 220, h: 36, title: 'Access ends', kicker: 'Retire',
    points: [
      ['planned', 'Sessions are revoked, grants are closed, and the taxpayer is told.'],
      ['planned', 'If a firm may be compromised, its seats are frozen, affected taxpayers are notified, and we help the firm report it to the IRS through its Stakeholder Liaison, as IRS guidance asks.'],
    ],
  },
}

const PREPARER_EDGES = [
  { from: 'signup', to: 'proof', d: 'M140 48 V72' },
  { from: 'proof', to: 'creds', d: 'M140 112 V136' },
  { from: 'creds', to: 'verified', d: 'M140 176 V200' },
  { from: 'verified', to: 'firm', d: 'M140 260 V290', label: 'Yes', lx: 148, ly: 279 },
  { from: 'verified', to: 'manual', d: 'M210 230 H290', label: 'No', lx: 250, ly: 223, anchor: 'middle' },
  { from: 'firm', to: 'mfa', d: 'M140 330 V354' },
  { from: 'mfa', to: 'grant', d: 'M140 394 V418' },
  { from: 'grant', to: 'approved', d: 'M140 458 V480' },
  { from: 'approved', to: 'view', d: 'M140 544 V574', label: 'Yes', lx: 148, ly: 563 },
  { from: 'approved', to: 'noclient', d: 'M228 512 H290', label: 'No', lx: 259, ly: 505, anchor: 'middle' },
  { from: 'view', to: 'valid', d: 'M140 614 V638' },
  { from: 'valid', to: 'view', d: 'M64 668 H14 V594 H30', label: 'Yes', lx: 18, ly: 660 },
  { from: 'valid', to: 'ends', d: 'M140 698 V728', label: 'No', lx: 148, ly: 717 },
]

const PREPARER_PATH = ['signup', 'proof', 'creds', 'verified', 'firm', 'mfa', 'grant', 'approved', 'view', 'valid', 'ends']

function SupportAgents() {
  return (
    <Page
      eyebrow="Identity & Access"
      title="Support Agents"
      deeper={false}
      lede="How we establish the identity of the people we employ or contract to help taxpayers, and how they reach a taxpayer's record: HR vouches for who they are, a hardware key proves it at sign-in, and a case opens one record at a time."
    >
      <section>
        <h2>Establishing an agent's identity</h2>
        <p>
          Because we hire agents, <strong>HR vouches for who they are</strong> and the company identity provider holds
          their identity. The demo has one staff role: seeded admins who sign in like taxpayers and use the admin console.
          In production, every staff identity is tied to an HR record and a hardware key.
        </p>
        <Flowchart
          id="idflow-agent"
          nodes={AGENT_NODES}
          edges={AGENT_EDGES}
          path={AGENT_PATH}
          height={780}
          label="Flowchart for establishing a support agent's identity: hire, background check, account from HR, hardware key enrollment, training, role from job code, case-based access, quarterly review, and offboarding."
        />
      </section>

      <section>
        <h2>Guardrails</h2>
        <ul className="checks">
          <li><Demo /> Staff and taxpayer authorization are checked separately on every request, and every admin action is audited.</li>
          <li><Planned /> One person per account, with a hardware key. No shared logins.</li>
          <li><Planned /> No search for a taxpayer by SSN or name outside a case, so staff access can't be used for enumeration.</li>
          <li><Planned /> Read-only by default. Agents can't change a taxpayer's contact details, sign-in methods, or refund details.</li>
          <li><Planned /> Taxpayers are told when support opened their record.</li>
        </ul>
        <p>
          For tax professionals acting for their clients, see <Link to="/security/identity-access/preparers">Preparers</Link>.
        </p>
      </section>
    </Page>
  )
}

function Preparers() {
  return (
    <Page
      eyebrow="Identity & Access"
      title="Preparers"
      deeper={false}
      lede="How we establish the identity of tax professionals who file for their clients and want to follow those refunds: proofed like taxpayers, checked against their credentials, and allowed to see a return only when that taxpayer says so."
    >
      <section>
        <h2>Establishing a preparer's identity</h2>
        <p>
          A preparer proves three separate things: who they are, that they are a legitimate professional, and that
          this particular taxpayer wants them to see this particular return. None of the three implies the others, and
          the demo has no preparer accounts yet.
        </p>
        <Flowchart
          id="idflow-preparer"
          nodes={PREPARER_NODES}
          edges={PREPARER_EDGES}
          path={PREPARER_PATH}
          height={780}
          label="Flowchart for establishing a preparer's identity: proof to IAL2, verify credentials, join a firm, register a security key, get the client's grant, view status, and re-check validity until access ends."
        />
      </section>

      <section>
        <h2>Guardrails</h2>
        <ul className="checks">
          <li><Planned /> One person per seat, with phishing-resistant sign-in. No shared firm logins.</li>
          <li><Planned /> No client lookup by SSN or name. A return becomes visible only through the taxpayer's grant, so preparer accounts can't be used for enumeration.</li>
          <li><Planned /> Read-only. Preparers can't change a taxpayer's contact details, sign-in methods, or refund details.</li>
          <li><Planned /> Taxpayers see which preparers can view their returns and each time they did, and can revoke access at any time.</li>
        </ul>
        <p>
          For our own staff, see <Link to="/security/identity-access/agents">Support Agents</Link>.
        </p>
      </section>
    </Page>
  )
}

function ServiceAuth() {
  return (
    <Page
      title="Service-to-Service Auth"
      deeper={false}
      lede="How the portal, API, processor, batch jobs, database, and agency integrations prove who they are to each other. The model is zero trust: being inside the cluster earns a caller nothing."
    >
      <p className="note">
        <strong>Draft.</strong> This page describes where the design is heading and is open for review. "Today" and
        Demo describe what the Kubernetes manifests do now; everything else is proposed.
      </p>

      <section>
        <h2>Zero trust, applied to services</h2>
        <ul className="points">
          <li><strong>Identity, not location.</strong> A call is allowed because of who the caller is, proven cryptographically, not because of its IP address, namespace, or pod label.</li>
          <li><strong>Every call is authorized.</strong> Each connection is checked against an explicit list of who may call whom, for what.</li>
          <li><strong>Short-lived credentials.</strong> Certificates and database passwords expire in hours and rotate automatically, so a stolen one is worth little.</li>
          <li><strong>Assume breach.</strong> Each workload holds only what its own job needs, so taking over one pod doesn't hand over the rest.</li>
        </ul>
      </section>

      <section>
        <h2>Every connection, today and proposed</h2>
        <p>
          The services and the calls between them, matching the <Link to="/architecture/high-level">High-Level Design</Link>.
          Anything not drawn is denied. Use <strong>If compromised</strong> to see what each workload could reach if
          an attacker took it over, and switch between <strong>Today</strong> and <strong>Proposed</strong> to compare.
        </p>
        <ServiceAuthDiagram />
      </section>

      <section>
        <h2>Suggested order</h2>
        <ol>
          <li>Per-workload secrets and database roles. Cheap, and they shrink the blast radius most.</li>
          <li>Default-deny outbound traffic, with an egress allowlist.</li>
          <li>TLS to Postgres.</li>
          <li>Workload identity and mutual TLS everywhere.</li>
          <li>A secrets manager with short-lived, automatically rotated credentials.</li>
        </ol>
      </section>
    </Page>
  )
}

function DataProtection() {
  return (
    <Page
      title="Data Protection"
      lede="What we store, what we deliberately don't, and how what we keep is protected and eventually deleted."
    >
      <section>
        <h2>What we store</h2>
        <table className="metrics">
          <thead>
            <tr><th>Data</th><th>How it's kept</th></tr>
          </thead>
          <tbody>
            <tr><td>Password</td><td>Argon2id hash only <Demo /></td></tr>
            <tr><td>Session</td><td>SHA-256 hash of the token, with an expiry <Demo /></td></tr>
            <tr><td>Tax ID</td><td>Last 4 digits only <Demo /></td></tr>
            <tr><td>Bank account</td><td>Last 4 digits, plus a keyed HMAC-SHA256 fingerprint of routing and account number for duplicate screening. The full number is never stored <Demo /></td></tr>
            <tr><td>Return figures</td><td>Stored, because they're needed to show the return and its refund <Demo />; column-level encryption <Planned /></td></tr>
            <tr><td>Feature vector</td><td>Derived numbers for similarity search; it doesn't include the bank account <Demo /></td></tr>
            <tr><td>Status history</td><td>Status, date, and the agency's message <Demo /></td></tr>
            <tr><td>Audit log</td><td>Who did what, when, and from which IP address <Demo /></td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Encryption and keys</h2>
        <ul className="checks">
          <li><Demo /> The bank fingerprint key is a secret that must be at least 16 bytes outside development, so fingerprints can't be brute-forced from the database alone.</li>
          <li><Planned /> TLS 1.2 or later at the edge with HSTS, and mutual TLS inside the cluster. The local demo uses plain HTTP behind a port-forward.</li>
          <li><Planned /> Storage, backups, and snapshots encrypted with keys held in a managed key service (KMS), separate from the data.</li>
          <li><Planned /> Envelope encryption for return figures, so a database dump without KMS access is unreadable.</li>
          <li><Planned /> Scheduled key rotation, with access to keys logged and limited to the services that need them.</li>
        </ul>
      </section>

      <section>
        <h2>Minimization in practice</h2>
        <ul className="checks">
          <li><Demo /> Responses show only what the screen needs: last 4 digits, never full identifiers.</li>
          <li><Demo /> API responses are sent with Cache-Control: no-store, so shared or browser caches don't keep them.</li>
          <li><Demo /> Request logs record method, path, status, duration, and trace ID, never bodies. Errors shown to users never include internal details.</li>
          <li><Planned /> An allowlist for span attributes, so personal data can't drift into traces.</li>
          <li><Planned /> Production data never used in development or testing; the demo and test suites use synthetic accounts.</li>
        </ul>
      </section>

      <section>
        <h2>Retention</h2>
        <table className="metrics">
          <thead>
            <tr><th>Data</th><th>Kept for</th></tr>
          </thead>
          <tbody>
            <tr><td>Sessions</td><td>Until expiry (30 minutes idle) or sign-out</td></tr>
            <tr><td>Return figures</td><td>Until the refund settles, plus 18 months</td></tr>
            <tr><td>Status history</td><td>3 years</td></tr>
            <tr><td>Audit log</td><td>7 years, in write-once storage</td></tr>
            <tr><td>Training data <Planned /></td><td>3 seasons, then deleted; withdrawn consent removes it from future training</td></tr>
            <tr><td>Closed accounts</td><td>Anonymized after the required period; their data keys are destroyed, so backups can't be read either</td></tr>
          </tbody>
        </table>
        <p>
          Every kind of data, with why we hold it and how it's deleted, is in{' '}
          <Link to="/security/data-protection/minimization">Minimization &amp; Retention</Link>. Keys are in{' '}
          <Link to="/security/data-protection/encryption">Encryption &amp; Key Management</Link>.
        </p>
      </section>
    </Page>
  )
}

// [layer, protects against, mechanism, status]
const ENCRYPTION_LAYERS = [
  ['Browser to edge', 'Eavesdropping and tampering on the internet', 'TLS 1.2 or later (1.3 preferred) with HSTS and modern ciphers only', 'planned'],
  ['Between services', 'A compromised pod or node reading traffic', 'Mutual TLS from the service mesh, with short-lived workload certificates', 'planned'],
  ['Services to Postgres', 'Reading queries and results on the network', 'TLS with certificate verification (verify-full)', 'planned'],
  ['Disks, backups, and snapshots', 'A stolen disk, snapshot, or backup file', 'Storage encryption under a key in the managed key service (KMS)', 'planned'],
  ['Return figures', 'A database dump, an over-broad query, or a leaked replica', 'Envelope encryption of each return\'s figures, under a key per taxpayer per tax year', 'planned'],
  ['Bank account', 'Recovering the number from the database', 'Never stored. Last 4 digits, plus a keyed HMAC-SHA256 fingerprint for duplicate screening', 'demo'],
  ['Passwords and sessions', 'Signing in with values read from the database', 'Argon2id password hashes; sessions stored as SHA-256 hashes of the token', 'demo'],
  ['Secrets', 'Credentials read from config or the cluster', 'A secrets manager, delivered to each workload at runtime and never written to images or the repo', 'planned'],
]

// [key, protects, held in, who can use it, rotation]
const KEYS = [
  ['Root keys', 'The keys below', 'KMS, backed by hardware security modules; they never leave it', 'Only KMS itself, to wrap and unwrap', 'Yearly, automatically'],
  ['Return-data key-encryption key', 'Each taxpayer\'s data keys', 'KMS', 'The API and processor, to unwrap; nothing else', 'Yearly, and at once if compromise is suspected'],
  ['Data key, per taxpayer per tax year', 'That taxpayer\'s return figures for that year', 'Stored wrapped, beside the data; unwrapped only in memory', 'The API and processor, while serving that taxpayer', 'Never re-encrypted in place; destroyed to delete the data (crypto-shredding)'],
  ['Bank fingerprint key', 'The keyed fingerprints', 'The secrets manager', 'The API, to fingerprint new returns', 'A new key each tax year, since duplicate screening only compares within a season'],
  ['Backup key', 'Backups and snapshots', 'KMS, in a separate account from production', 'The backup service only', 'Yearly'],
  ['TLS and workload certificates', 'Traffic', 'Issued automatically', 'The workload they belong to', 'Edge: 90 days. Workloads: hours'],
  ['Database credentials', 'Postgres', 'Issued per workload by the secrets manager', 'One workload each', 'Short-lived, renewed automatically'],
  ['Agency credentials', 'Calls to each agency', 'The secrets manager', 'The processor and batch sync for that agency', 'On each agency\'s schedule, and at once after an incident'],
]

function Encryption() {
  return (
    <Page
      eyebrow="Data Protection"
      title="Encryption & Key Management"
      deeper={false}
      lede="What's encrypted, under which keys, who can use them, and what happens when a key has to change or is exposed. The aim: a copy of the data alone, a dump, a backup, or a stolen disk, is never enough to read a taxpayer's figures."
    >
      <section>
        <h2>Every layer</h2>
        <table className="metrics">
          <thead>
            <tr><th>Layer</th><th>Protects against</th><th>How</th><th>Status</th></tr>
          </thead>
          <tbody>
            {ENCRYPTION_LAYERS.map(([layer, against, how, status]) => (
              <tr key={layer}><td>{layer}</td><td>{against}</td><td>{how}</td><td>{status === 'demo' ? <Demo /> : <Planned />}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          Hashing is not encryption: the password hash, session hash, and bank fingerprint can't be turned back into the
          original, which is the point. Only return figures need to be read back, so only they are encrypted with keys we
          can use.
        </p>
      </section>

      <section>
        <h2>Envelope encryption for return figures</h2>
        <p>
          Storage encryption protects a stolen disk, but not a database dump or a query run with stolen credentials, because
          the database decrypts for anyone who can connect. Return figures get a second layer the database can't remove:
        </p>
        <ol>
          <li>Each taxpayer gets a data key per tax year (AES-256-GCM), generated by KMS.</li>
          <li>The figures (the return's inputs, the calculation, refund and balance amounts, and agency messages) are encrypted with it before they're written.</li>
          <li>The data key is stored beside the data, wrapped by the return-data key in KMS. Reading the figures takes the row and a KMS call that's allowed, logged, and can be cut off.</li>
        </ol>
        <table className="metrics compare">
          <thead>
            <tr><th>Encrypted</th><th>Left readable, and why</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Return inputs and calculation lines, refund and balance amounts (as filed and as the agency reports them), agency messages</td>
              <td>IDs, status, dates, form, and jurisdiction: the batch sync, the queues, and the status page query and index them. The last 4 digits and the fingerprint are already minimized. The duplicate-screening feature vector has to be readable for its similarity index; it holds no identifiers or bank details.</td>
            </tr>
          </tbody>
        </table>
        <ul className="points">
          <li>
            <strong>Fast enough for the read path.</strong> Unwrapped data keys are cached in memory for a few minutes, so a
            status read costs microseconds of decryption and a KMS call only on a cache miss.
          </li>
          <li>
            <strong>Status survives a KMS outage.</strong> Status and dates are readable, so the status page keeps
            answering while KMS is down; only the figures wait. That's the order the{' '}
            <Link to="/technical-design/non-functional/availability">Availability &amp; Latency</Link> requirements set.
          </li>
          <li>
            <strong>Deleting a key deletes the data.</strong> Destroying one taxpayer's data key for a year makes those
            figures unreadable everywhere at once, including in backups. See{' '}
            <Link to="/security/data-protection/minimization">Minimization &amp; Retention</Link>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Keys</h2>
        <table className="metrics">
          <thead>
            <tr><th>Key</th><th>Protects</th><th>Held in</th><th>Who can use it</th><th>Rotation</th></tr>
          </thead>
          <tbody>
            {KEYS.map(([key, protects, held, who, rotation]) => (
              <tr key={key}><td>{key}</td><td>{protects}</td><td>{held}</td><td>{who}</td><td>{rotation}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Who can use a key</h2>
        <ul className="checks">
          <li><Planned /> Each workload gets only the key operations it needs, through its own identity. The batch sync and the portal never decrypt figures.</li>
          <li><Planned /> No person has decrypt access in production. Break-glass access needs two people, expires within hours, and is audited.</li>
          <li><Planned /> Every KMS call is logged to the security monitoring system, and an unusual volume of decrypts, or decrypts from an unexpected identity, pages on-call. See <Link to="/security/monitoring">Security Monitoring</Link>.</li>
          <li><Planned /> Keys live in a separate cloud account from the data, so one compromised account isn't enough to read both.</li>
        </ul>
      </section>

      <section>
        <h2>Rotation</h2>
        <ul className="points">
          <li>
            <strong>Wrapping keys rotate cheaply.</strong> Rotating the return-data key means re-wrapping the small data keys,
            not re-encrypting the figures. Old versions stay able to unwrap until everything is re-wrapped, then are disabled.
          </li>
          <li>
            <strong>The fingerprint key can't be rotated in place,</strong> because the full bank numbers aren't kept to
            recompute fingerprints. Each tax year gets a new key, which also limits what a leaked key exposes to one season.
          </li>
          <li>
            <strong>Short-lived beats rotated.</strong> Certificates and database credentials are issued for hours, so there's
            little to rotate and a leaked one expires on its own.
          </li>
        </ul>
      </section>

      <section>
        <h2>If a key is exposed</h2>
        <ol className="timeline">
          <li><strong>Disable</strong><span>Disable the key version in KMS, or revoke the secret, so it stops working everywhere at once.</span></li>
          <li><strong>Replace</strong><span>Issue a new version, re-wrap what it protected, and redeploy the workloads that use it.</span></li>
          <li><strong>Scope</strong><span>Use the KMS log to find every use of the old key since the exposure could have started.</span></li>
          <li><strong>Respond</strong><span>Follow <Link to="/security/audit-response">Audit &amp; Incident Response</Link>, including notifying agencies, taxpayers, and regulators if data could have been read.</span></li>
        </ol>
      </section>

      <section>
        <h2>The demo today</h2>
        <ul className="checks">
          <li><Demo /> Passwords are Argon2id hashes and sessions are stored as SHA-256 hashes of the token.</li>
          <li><Demo /> Bank numbers are never stored: the last 4 digits and an HMAC-SHA256 fingerprint only. The fingerprint key must be at least 16 bytes outside development.</li>
          <li><Demo /> Secrets reach workloads as Kubernetes Secrets, not baked into images.</li>
          <li><Planned /> Gaps: plain HTTP behind a port-forward, an unencrypted Postgres connection (<code>sslmode=disable</code>), Kubernetes Secrets stored unencrypted in the cluster, no field-level encryption, and one fingerprint key for every season.</li>
        </ul>
      </section>
    </Page>
  )
}

// [data, why we hold it, what we keep, kept for, how it's deleted]
const INVENTORY = [
  ['Account: email and name', 'Signing in, and greeting the taxpayer', 'As given', 'While the account is open, then the records period', 'Anonymized when the account is closed and the period ends'],
  ['Password', 'Signing in', 'An Argon2id hash', 'Until changed or the account is closed', 'Replaced or deleted'],
  ['Sessions', 'Staying signed in', 'A SHA-256 hash of the token, with an expiry', '30 minutes idle, or until sign-out', 'Deleted at sign-out; expired ones are swept by the processor'],
  ['Tax ID', 'Showing which identity a return belongs to', 'The last 4 digits', 'With the account', 'With the account'],
  ['Bank account', 'Showing where the refund goes, and spotting duplicate filings', 'The last 4 digits, plus a keyed fingerprint. The full number goes from the filing product to the agency and never reaches this service', 'With the return; fingerprints are useful for one season', 'With the return; destroying the season\'s fingerprint key makes old fingerprints meaningless'],
  ['Return figures', 'Showing the return and its refund', 'The figures the screen and estimate need, encrypted per taxpayer per year', 'Until the refund settles, plus 18 months for amended returns and agency notices', 'The data key is destroyed, then the tax-year partition is dropped'],
  ['Status history and agency messages', 'Showing where a refund has been, and answering disputes', 'Status, date, and message', '3 years', 'Tax-year partitions dropped'],
  ['Duplicate-screening vector', 'Spotting near-identical returns in the same season', 'Coarse derived numbers, with no identifiers or bank details', 'The season, plus 90 days', 'Cleared from the return'],
  ['Support access grants', 'Proving when support could see a return, and who ended it', 'Return, times, and who ended it', 'With the audit log', 'With the audit log'],
  ['Audit log', 'Investigations, and evidence for audits', 'Who did what, when, and from where; never return figures', '7 years, in write-once storage', 'Expires from write-once storage'],
  ['Request logs and traces', 'Running and debugging the service', 'Method, path, status, timing, and trace ID; never bodies', 'Logs 30 days, traces 14 days', 'Expire in the log and trace stores'],
  ['Model training data', 'Training the refund-time model, with consent', 'Banded features and outcomes, keyed by a hash, never identifiers', '3 seasons', 'Deleted, and left out of the next training run as soon as consent is withdrawn'],
  ['Backups', 'Recovering from failures and mistakes', 'Encrypted copies of the database', '35 days', 'Age out; crypto-shredding covers them sooner'],
]

function Minimization() {
  return (
    <Page
      eyebrow="Data Protection"
      title="Minimization & Retention"
      deeper={false}
      lede="Collect only what a feature needs, keep it in the smallest form that works, and delete it when its reason ends, for real, including from backups. Data we don't hold can't leak."
    >
      <section>
        <h2>Principles</h2>
        <ul className="points">
          <li><strong>A reason for everything.</strong> Every field has a purpose: showing status, estimating the refund date, screening for fraud, supporting the taxpayer, or proving what happened. No purpose, no field.</li>
          <li><strong>The smallest form that works.</strong> Last 4 digits instead of a number, a keyed fingerprint instead of an account, bands instead of amounts, counts instead of contents.</li>
          <li><strong>Consent where the law asks for it.</strong> Training the model uses return information only with separate opt-in consent under §7216. See <Link to="/security/compliance">Privacy &amp; Compliance</Link>.</li>
          <li><strong>Shortest retention the rules allow.</strong> Each kind of data has a period, an owner, and a job that deletes it.</li>
        </ul>
      </section>

      <section>
        <h2>Inventory</h2>
        <div className="table-scroll">
          <table className="metrics">
            <thead>
              <tr><th>Data</th><th>Why we hold it</th><th>What we keep</th><th>Kept for</th><th>Deleted by</th></tr>
            </thead>
            <tbody>
              {INVENTORY.map(([data, why, keep, period, how]) => (
                <tr key={data}><td>{data}</td><td>{why}</td><td>{keep}</td><td>{period}</td><td>{how}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The periods are the design's starting point. Counsel sets the final ones against tax-record rules (for example,
          preparers keep a copy or list of returns for 3 years under IRC §6107), state law, and the product's records
          policy. The filing product, not this service, keeps the authoritative copy of each return.
        </p>
      </section>

      <section>
        <h2>How deletion works</h2>
        <ul className="points">
          <li>
            <strong>Whole seasons at once.</strong> Returns and status history are partitioned by tax year (see{' '}
            <Link to="/technical-design/non-functional/capacity">Capacity Estimates</Link>), so ending a season's retention
            drops a partition instead of deleting millions of rows one by one.
          </li>
          <li>
            <strong>Crypto-shredding for the rest.</strong> Destroying a taxpayer's data key for a year makes their figures
            unreadable in the database, its replicas, and every backup at the same moment, without waiting 35 days for the
            backups to age out. See <Link to="/security/data-protection/encryption">Encryption &amp; Key Management</Link>.
          </li>
          <li>
            <strong>Scheduled, and checked.</strong> Each retention job reports how much it deleted and alerts if it didn't run,
            so a silently broken job can't keep data for years.
          </li>
          <li>
            <strong>Legal holds win.</strong> A hold placed for an investigation or litigation suspends deletion for the named
            accounts only, and is recorded in the audit log with who placed it and why.
          </li>
        </ul>
      </section>

      <section>
        <h2>When a taxpayer asks</h2>
        <ol className="timeline">
          <li><strong>Verify</strong><span>The request comes from a signed-in, step-up-verified account, never from an email alone.</span></li>
          <li><strong>Export</strong><span>The taxpayer can download what we hold about them first.</span></li>
          <li><strong>Delete</strong><span>Sessions end, the account is anonymized, and data keys are destroyed for every year no rule requires us to keep.</span></li>
          <li><strong>Keep only what's required</strong><span>What a tax-record rule or legal hold requires stays, encrypted and untouched, until its period ends. The taxpayer is told what was kept and why.</span></li>
          <li><strong>Confirm</strong><span>The taxpayer gets a confirmation, and the request and its outcome go in the audit log.</span></li>
        </ol>
      </section>

      <section>
        <h2>Minimization in practice</h2>
        <ul className="checks">
          <li><Demo /> Screens and API responses show only what they need: last 4 digits, never full identifiers, and <code>Cache-Control: no-store</code>.</li>
          <li><Demo /> Support sees a return only while its taxpayer is sharing it, for 5 minutes at a time, and never sees a full tax ID or bank account.</li>
          <li><Demo /> Request logs never contain bodies, and audit entries never contain return figures.</li>
          <li><Demo /> Expired sessions are deleted, and the demo and its tests use synthetic accounts only.</li>
          <li><Planned /> Span attributes come from an allowlist, so personal data can't drift into traces.</li>
          <li><Planned /> Model features leave production only as bands and counts, with rare combinations rolled up. See <Link to="/architecture/prediction">Refund Time Prediction</Link>.</li>
          <li><Planned /> Retention jobs for returns, status history, the duplicate-screening vectors, and the audit log. The demo keeps them until a return is reset.</li>
        </ul>
      </section>
    </Page>
  )
}

// [where, counted by, limit, when exceeded, status]
const RATE_LIMITS = [
  ['Edge, every request', 'Client IP, and network reputation', 'About 300 requests a minute per IP; less from networks with a bad reputation', '429 with Retry-After, or a challenge', 'planned'],
  ['Sign-in, per client', 'Client IP, read through trusted proxies', '10 attempts every 5 minutes', '429 with Retry-After', 'demo'],
  ['Sign-in, per account', 'The account, however many IPs try it', '5 failures, then the lockout below', 'The same failure message as a wrong password', 'demo'],
  ['Password spraying', 'One password tried across many accounts', 'The same password against more than 20 accounts in an hour', 'Block the sources, and alert', 'planned'],
  ['Signed-in reads', 'Session', '120 a minute: several times what the portal\'s polling needs', '429; the portal backs off and keeps showing the last status', 'planned'],
  ['Filing a return', 'Account', '10 an hour', '429 with a plain message', 'planned'],
  ['Sharing with support', 'Account', '20 grants an hour', '429', 'planned'],
  ['Staff searches and views', 'Staff account', 'Set from each role\'s normal working pace', 'Slow down, and alert security: bulk viewing is the insider pattern', 'planned'],
]

function RateLimiting() {
  return (
    <Page
      eyebrow="Abuse Prevention"
      title="Rate Limiting & Lockout"
      deeper={false}
      lede="Slow down guessing and scraping enough to make them unprofitable, keep capacity for honest taxpayers, and never let an attacker lock a real taxpayer out of their own account."
    >
      <section>
        <h2>Goals</h2>
        <ul className="points">
          <li><strong>Make guessing slow.</strong> Credential stuffing works by volume. Limits per IP, per account, and per password take the volume away.</li>
          <li><strong>Don't become the attack.</strong> A lockout an attacker can trigger is a denial of service against our own taxpayers, so locking is the last step, not the first.</li>
          <li><strong>Reveal nothing.</strong> A locked account, a wrong password, and an unknown email look the same from outside.</li>
          <li><strong>Hold at peak.</strong> Limits are sized for filing season and never turned off to keep up. See <Link to="/technical-design/non-functional/availability">Availability &amp; Latency</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>Limits, layer by layer</h2>
        <div className="table-scroll">
          <table className="metrics">
            <thead>
              <tr><th>Where</th><th>Counted by</th><th>Limit</th><th>When exceeded</th><th>Status</th></tr>
            </thead>
            <tbody>
              {RATE_LIMITS.map(([where, by, limit, then, status]) => (
                <tr key={where}><td>{where}</td><td>{by}</td><td>{limit}</td><td>{then}</td><td>{status === 'demo' ? <Demo /> : <Planned />}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The numbers are starting points, set from last season's per-client traffic so honest use stays well under them,
          and tuned in load tests before each season. Each can change through configuration, without a deploy.
        </p>
      </section>

      <section>
        <h2>How the limiter works</h2>
        <ul className="points">
          <li>
            <strong>Token buckets in a shared store.</strong> Each key (an IP, an account, a session) has a bucket in Redis,
            updated atomically, so every replica sees the same count. A bucket allows short bursts, like a page loading
            several things at once, while capping the sustained rate.
          </li>
          <li>
            <strong>The real client address.</strong> Per-IP limits use the address behind our own proxies, reading{' '}
            <code>X-Forwarded-For</code> from the right through the trusted ones only, so a client can't pick a fresh
            address for each attempt. See <Link to="/security/threat-model/attack-surfaces/enumeration">Enumeration &amp; Credential Stuffing</Link>.
          </li>
          <li>
            <strong>If the shared store is down,</strong> each pod falls back to its own in-memory limits at a fraction of
            the shared limit. Protection gets coarser, but never switches off, and the status page keeps working. That's the
            trade the availability requirements ask for.
          </li>
          <li>
            <strong>Edge first.</strong> The edge drops floods before they reach us, so the application limits only see
            traffic that's already been filtered, and attacks don't spend our capacity.
          </li>
        </ul>
      </section>

      <section>
        <h2>Shared addresses</h2>
        <p>
          Campuses, offices, and mobile carriers put thousands of people behind one IP address, and filing deadlines bring
          them all at once. Per-IP limits alone would block them together. So:
        </p>
        <ul className="checks">
          <li><Planned /> A device that has signed in successfully before carries a signed device cookie, and is counted on its own instead of with its whole network.</li>
          <li><Planned /> Known carrier and campus ranges get higher per-IP limits, and lean on the per-account and per-password limits instead.</li>
          <li><Planned /> Past a limit, a shared address gets a challenge before a block, so a person can still get through. See <Link to="/security/abuse-prevention/bot-defense">Bot Defense</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>Lockout without locking people out</h2>
        <p>
          A hard lock after five failures stops guessing, but anyone who knows an email can lock its owner out on the
          busiest day of the year. The design escalates instead:
        </p>
        <ol className="timeline">
          <li><strong>Failures 1–3</strong><span>Nothing visible. The count resets on a successful sign-in, and decays after 24 hours.</span></li>
          <li><strong>Failures 4–5</strong><span>Each attempt waits a little longer (1, then 2 seconds), and a challenge appears for unrecognized devices.</span></li>
          <li><strong>After 5</strong><span>Unrecognized devices are locked out for 15 minutes. Devices that signed in before can still sign in, with a second factor. The attacker is stopped; the owner isn't.</span></li>
          <li><strong>Tell the owner</strong><span>The owner gets a notice that someone tried to sign in, telling them to sign in directly and change their password. It contains no link, so it can't be imitated by a phishing message.</span></li>
          <li><strong>Unlock</strong><span>Waiting out the 15 minutes, resetting the password, or signing in with a second factor on a recognized device.</span></li>
        </ol>
        <p>
          Through all of it, the response to a failed sign-in is the same message, in the same time, whether the email
          exists, the password is wrong, or the account is locked.
        </p>
      </section>

      <section>
        <h2>Watching it</h2>
        <ul className="checks">
          <li><Demo /> Failed sign-ins are audited with the client address.</li>
          <li><Planned /> Lockouts and rate-limit hits are recorded too, with the account and key hashed, so investigations can see what was targeted.</li>
          <li><Planned /> A spike in lockouts, or many accounts failing from few sources, pages on-call as credential stuffing. See <Link to="/security/monitoring">Security Monitoring</Link>.</li>
          <li><Planned /> Dashboards show 429s by endpoint against last season, so a limit that starts catching honest traffic is spotted and raised.</li>
        </ul>
      </section>

      <section>
        <h2>The demo today</h2>
        <ul className="checks">
          <li><Demo /> 10 sign-in attempts per client IP every 5 minutes, answered with 429 and <code>Retry-After</code>.</li>
          <li><Demo /> 5 failed attempts lock the account for 15 minutes, from any number of IPs; a successful sign-in resets the count.</li>
          <li><Demo /> A locked account gets the same message as a wrong password, and unknown emails take the same time, checked against a dummy hash.</li>
          <li><Planned /> Gaps: the limiter is in memory per pod with fixed windows, so each replica counts separately; only sign-in is limited; the lockout is a hard lock with no device awareness or owner notice; lockouts and rate-limit hits aren't audited.</li>
        </ul>
      </section>
    </Page>
  )
}

// [signal, examples, catches, privacy]
const BOT_SIGNALS = [
  ['Network', 'IP reputation, data-center and hosting ranges, known proxies and anonymizers', 'Cheap botnets and rented servers', 'Uses the address we already log; no new data'],
  ['Client fingerprint', 'TLS and HTTP/2 handshake fingerprints, header order, whether the browser environment is real', 'Scripts pretending to be browsers', 'A hash of how the client connects, not who the person is'],
  ['Behavior', 'Typing rhythm, pointer and touch movement, time to fill a form, the path through the pages', 'Automation that is fast, uniform, or skips steps', 'Summarized into a score in the browser session; raw movements aren\'t kept'],
  ['Velocity', 'Attempts per account, device, network, and password, over minutes and days', 'Stuffing, spraying, and bulk filing spread thin', 'Counters with short expiries'],
  ['Device history', 'A signed cookie on devices that signed in successfully before', 'Lets known devices through with less friction', 'A random ID, not a fingerprint; cleared by the user at will'],
  ['Credential intelligence', 'Passwords known from breaches, checked by a k-anonymity range query', 'Stuffing with leaked lists', 'The password never leaves us; only a short hash prefix is sent'],
  ['Tripwires', 'Hidden form fields, decoy endpoints, and canary accounts', 'Bots that fill or crawl everything', 'No personal data involved'],
]

// [level, when, what happens]
const BOT_RESPONSES = [
  ['Allow', 'Low risk: most traffic, and every known device', 'Nothing. The taxpayer never sees bot defense.'],
  ['Watch', 'Slightly unusual', 'Allowed, but tagged so later requests in the session are scored with that in mind.'],
  ['Slow', 'Suspicious, or a burst', 'Small added delays. Costs a person a second; costs a bot its throughput.'],
  ['Challenge', 'Likely automated', 'An invisible check first (proof-of-work or device attestation); an interactive, accessible one only if that fails.'],
  ['Block', 'Clearly automated, or a tripwire hit', 'Refused, with a generic response that doesn\'t say which signal tripped. Repeat sources may be slowed to a crawl instead of refused, which wastes their time.'],
]

// [flow, what bots try, defense, status]
const BOT_FLOWS = [
  ['Sign-in', 'Credential stuffing and password spraying', 'Risk scoring at the edge, the limits in Rate Limiting & Lockout, breached-password checks, and passkeys', 'planned'],
  ['Account recovery', 'The same, aimed at the weaker door', 'Recovery gets every sign-in protection, plus a notice to the owner and a cooling-off period before changes take effect', 'planned'],
  ['Sign-up', 'Fake accounts to file from', 'Scoring and limits per device and network, disposable-email checks, and refund details hidden until identity is proofed', 'planned'],
  ['One-time codes', 'SMS pumping to premium-rate numbers', 'Passkeys and authenticator apps first; send limits per number, prefix, and country; the SMS provider\'s fraud controls', 'planned'],
  ['Filing a return', 'Templated returns under stolen identities', 'Duplicate screening on bank fingerprints and near-identical figures, held before sending', 'demo'],
  ['Status reads', 'Fraud rings tracking which filings got paid', 'Sign-in required for everything; unusual read rates per account and device flagged', 'demo'],
]

function BotDefense() {
  return (
    <Page
      eyebrow="Abuse Prevention"
      title="Bot Defense"
      deeper={false}
      lede="Telling automated attacks from taxpayers, and making the attacks too slow and expensive to pay off, while nearly every real taxpayer never notices anything at all."
    >
      <section>
        <h2>Principles</h2>
        <ul className="points">
          <li><strong>Layers, not a wall.</strong> No single signal is reliable. The edge, risk scoring, rate limits, and fraud checks each catch what the others miss.</li>
          <li><strong>Invisible first.</strong> Signals and scoring cost a taxpayer nothing. Puzzles are the last resort, not the default.</li>
          <li><strong>Friction in proportion to risk.</strong> A known device signing in sees nothing; a new device from a botnet range sees a challenge.</li>
          <li><strong>Everyone can get through.</strong> Every challenge has an accessible path. Shutting out people who use assistive technology would fail the people this service is for.</li>
          <li><strong>On through the peak.</strong> Bot traffic hides in the April rush, so defenses are sized for it and never switched off to keep up.</li>
        </ul>
        <p>
          What bots try against this service is listed in{' '}
          <Link to="/security/threat-model/attack-surfaces/bots">Bots &amp; Automated Abuse</Link>. This page is how we stop them.
        </p>
      </section>

      <section>
        <h2>The pipeline</h2>
        <ol className="timeline">
          <li><strong>Edge filter</strong><span>The CDN and web application firewall drop floods, known-bad networks, and malformed requests before they reach us.</span></li>
          <li><strong>Risk score</strong><span>Bot management scores each sign-in, sign-up, and recovery request on the signals below, and passes the score to the app.</span></li>
          <li><strong>Response</strong><span>The score picks a step on the response ladder: allow, watch, slow, challenge, or block.</span></li>
          <li><strong>App limits</strong><span>Rate limits and lockout catch what scoring misses, counted per IP, per account, and per password. See <Link to="/security/abuse-prevention/rate-limiting">Rate Limiting &amp; Lockout</Link>.</span></li>
          <li><strong>Business checks</strong><span>Duplicate screening and fraud scoring catch automated filing that looked human all the way in.</span></li>
        </ol>
      </section>

      <section>
        <h2>Signals</h2>
        <div className="table-scroll">
          <table className="metrics">
            <thead>
              <tr><th>Signal</th><th>Examples</th><th>Catches</th><th>Privacy</th></tr>
            </thead>
            <tbody>
              {BOT_SIGNALS.map(([signal, examples, catches, privacy]) => (
                <tr key={signal}><td>{signal}</td><td>{examples}</td><td>{catches}</td><td>{privacy}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Signals are used only to tell people from bots: never for marketing, never sold, kept 90 days at most, and named
          in the privacy notice.
        </p>
      </section>

      <section>
        <h2>The response ladder</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Step</th><th>When</th><th>What happens</th></tr>
          </thead>
          <tbody>
            {BOT_RESPONSES.map(([step, when, what]) => (
              <tr key={step}><td>{step}</td><td>{when}</td><td>{what}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Challenges</h2>
        <ul className="points">
          <li><strong>Invisible checks first.</strong> A short proof-of-work, or a device attestation token from the browser or operating system, proves a real device without asking the person to do anything.</li>
          <li><strong>Interactive only if those fail,</strong> and always with an accessible alternative. WCAG 2.2's accessible authentication criterion rules out puzzles that depend on memory or transcription without another way through.</li>
          <li><strong>Passkeys skip the question.</strong> A passkey sign-in proves a real device and a real person in one step, so the more taxpayers use them, the fewer challenges anyone sees.</li>
          <li><strong>Proof-of-work under attack.</strong> During a stuffing campaign, sign-in can require a small computation from every new device: a fraction of a second for one person, a real cost for millions of attempts.</li>
        </ul>
      </section>

      <section>
        <h2>By flow</h2>
        <div className="table-scroll">
          <table className="metrics">
            <thead>
              <tr><th>Flow</th><th>What bots try</th><th>Defense</th><th>Status</th></tr>
            </thead>
            <tbody>
              {BOT_FLOWS.map(([flow, tries, defense, status]) => (
                <tr key={flow}><td>{flow}</td><td>{tries}</td><td>{defense}</td><td>{status === 'demo' ? <Demo /> : <Planned />}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Tripwires</h2>
        <ul className="points">
          <li><strong>Hidden fields.</strong> Form fields people can't see or reach. Anything that fills them is a bot.</li>
          <li><strong>Decoy endpoints.</strong> Paths no page links to, listed nowhere a person would look. A hit is a crawler or a scanner, and its source is blocked.</li>
          <li><strong>Canary accounts.</strong> Accounts that exist only to be watched. Any sign-in attempt means their credentials are circulating in a list, which tells us a campaign has started and which list it's using.</li>
        </ul>
      </section>

      <section>
        <h2>Peak season and outages</h2>
        <ul className="points">
          <li><strong>Under-attack mode.</strong> A pre-approved switch raises the challenge rate for new devices and turns on proof-of-work at sign-in. It's in the runbook, so on-call can turn it on in minutes without a deploy.</li>
          <li><strong>If the bot-defense vendor fails,</strong> traffic passes through unscored rather than being blocked, so the status page stays up, and the application's own rate limits and lockout carry the load. That follows the order in <Link to="/technical-design/non-functional/availability">Availability &amp; Latency</Link>.</li>
          <li><strong>Shared intelligence.</strong> Block lists and indicators are shared with the IRS, the states, and industry groups through the season, so a campaign seen elsewhere is blocked here before it starts.</li>
        </ul>
      </section>

      <section>
        <h2>Measuring the cost to people</h2>
        <ul className="checks">
          <li><Planned /> Challenge rate, solve rate, and abandoned sign-ins, compared with last season, so friction that creeps up is noticed.</li>
          <li><Planned /> The same, broken out for mobile carriers, campuses, and assistive technology, where false positives cluster.</li>
          <li><Planned /> Support contacts about being blocked, reviewed weekly in season.</li>
          <li><Planned /> Our own synthetic checks run through the real defenses, allowlisted by credential rather than address, so a defense that blocks real use shows up at once.</li>
        </ul>
      </section>

      <section>
        <h2>The demo today</h2>
        <ul className="checks">
          <li><Demo /> Everything personal is behind sign-in, and responses are marked <code>Cache-Control: no-store</code>.</li>
          <li><Demo /> Sign-in is rate limited per client and locked per account; request bodies are capped and inputs strictly validated.</li>
          <li><Demo /> Duplicate screening holds near-identical returns paying into the same bank fingerprint before they're sent.</li>
          <li><Planned /> Not in the demo: an edge, bot management, risk scoring, challenges, tripwires, and canary accounts.</li>
        </ul>
      </section>
    </Page>
  )
}

function AbusePrevention() {
  return (
    <Page
      title="Abuse Prevention"
      lede="Stopping automated attacks on sign-in and fraudulent filings, without locking out honest taxpayers at the busiest time of year."
    >
      <section>
        <h2>Sign-in protection</h2>
        <ul className="checks">
          <li><Demo /> Per-client rate limit: 10 sign-in attempts per IP address every 5 minutes.</li>
          <li><Demo /> Per-account lockout: 5 failed attempts lock the account for 15 minutes, however many IP addresses the attempts come from.</li>
          <li><Demo /> The same message for every failure, including a locked account, so lockout doesn't reveal that an account exists.</li>
          <li><Planned /> Rate limits in a shared store or at the edge. The demo's limiter is per pod, so each replica counts separately.</li>
          <li><Planned /> Progressive delays and a challenge instead of a hard lockout at scale, so attackers can't lock real taxpayers out on purpose. Notify the owner when it happens.</li>
          <li><Planned /> Check passwords against known breaches at sign-up and sign-in, using a k-anonymity range query so the password never leaves us.</li>
        </ul>
      </section>

      <section>
        <h2>Bots and automation</h2>
        <ul className="checks">
          <li><Demo /> Request bodies capped at 32 KB by the portal and 16 KB by the API, and strict input validation, including routing number checksums.</li>
          <li><Planned /> A web application firewall and bot management at the edge, using device and behavior signals.</li>
          <li><Planned /> Credential-stuffing detection: many accounts tried from one source, or one password tried across many accounts.</li>
          <li><Planned /> Challenges only when risk is high, so most taxpayers never see one.</li>
        </ul>
      </section>

      <section>
        <h2>Fraudulent filings</h2>
        <ul className="checks">
          <li><Demo /> Before transmission, the processor looks for other taxpayers' returns paying into the same bank fingerprint, and asks pgvector whether any have near-identical figures.</li>
          <li><Demo /> A match is held for identity verification instead of being sent, and only an admin can release it.</li>
          <li><Planned /> More signals, such as device, IP, and filing velocity, scored by a dedicated fraud service, with shared intelligence from the IRS and states.</li>
        </ul>
      </section>

      <section>
        <h2>Under peak load</h2>
        <p>
          Controls are sized for filing season and stay on through it. Rate limiting and bot defense run at the edge so
          they scale with traffic, and capacity is added by scaling out, never by turning a control off.
        </p>
      </section>
    </Page>
  )
}

function MonitoringPipeline() {
  const box = (title, detail, kind = '') => (
    <div className={`flow-box ${kind}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
  const arrow = <span className="flow-arrow" aria-hidden="true">→</span>
  return (
    <figure className="flow" aria-label="Security monitoring pipeline">
      <div className="flow-lane">
        <p className="flow-lane-label">From event to response, in minutes</p>
        <div className="flow-row">
          {box('Sources', 'Edge, sign-in events, request logs, audit log, traces, cluster and network logs')}
          {arrow}
          {box('Collect', 'Shipped off the pod at once, scrubbed of personal data, kept on write-once storage', 'store')}
          {arrow}
          {box('Detect', 'Rules and baselines in the SIEM, correlated by account, device, and trace ID')}
          {arrow}
          {box('Respond', 'Page on-call, run automatic containment, open an incident', 'external')}
        </div>
      </div>
    </figure>
  )
}

function SecurityMonitoring() {
  return (
    <Page
      title="Security Monitoring"
      deeper={false}
      lede="How we notice attacks and misuse while they're happening: what we collect, what we alert on, and who's watching. Everything is sized for filing season, when traffic and attackers peak together."
    >
      <MonitoringPipeline />

      <section>
        <h2>What we collect</h2>
        <ul className="checks">
          <li><Demo /> Structured JSON logs from every service: method, path, status, latency, and trace ID. Request bodies are never logged.</li>
          <li><Demo /> Admin actions in the audit log, with the admin, IP address, and details, plus every admin search and every return an admin is shown. A failed audit write is logged as an error.</li>
          <li><Demo /> Traces in Jaeger carry return IDs, jurisdiction, and form, never names, tax IDs, or bank details.</li>
          <li><Demo /> The processor logs a warning when it holds a near-duplicate return, and every batch run logs its outcome.</li>
          <li><Demo /> Sign-ins, failed sign-ins, and filed returns in the audit log, with the IP address. A failed attempt doesn't record which account was tried, and a lockout looks the same as a wrong password.</li>
          <li><Planned /> Richer sign-in events: the targeted account as a keyed hash, the device, and separate records for lockouts, rate-limit hits, step-ups, contact and authenticator changes, and session revocations.</li>
          <li><Planned /> Staff and preparer record views, with the case or client grant behind each one.</li>
          <li><Planned /> Edge firewall and bot management logs, Kubernetes API audit logs, network flow logs, and secrets manager and key management access logs.</li>
        </ul>
      </section>

      <section>
        <h2>What we never log</h2>
        <p>
          Full tax IDs, passwords, session tokens, bank account numbers, and request bodies stay out of every log and
          trace. The log pipeline also scrubs anything that looks like them, as a backstop. Logs are still sensitive, so
          only the security team can search them, and they're kept for a fixed period.
        </p>
      </section>

      <section>
        <h2>What we alert on</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Signal</th><th>Might mean</th><th>First response</th></tr>
          </thead>
          <tbody>
            <tr><td>Failed sign-ins or lockouts rising across many accounts</td><td>Credential stuffing</td><td>Challenge or block the sources at the edge</td></tr>
            <tr><td>Many accounts signing in from one device or network</td><td>An account-takeover ring</td><td>Step up those sessions and block the source</td></tr>
            <tr><td>A new device, then a contact or authenticator change soon after</td><td>Account takeover</td><td>Hold the change and alert the old contacts</td></tr>
            <tr><td>More returns held as near-duplicates, or many refunds to one bank fingerprint</td><td>A fraud ring filing</td><td>Hold the returns for fraud review</td></tr>
            <tr><td>Staff opening records without a case, out of hours, or in bulk</td><td>Insider snooping or stolen staff credentials</td><td>Page security and suspend the access</td></tr>
            <tr><td>A preparer viewing many clients, or clients outside their usual set</td><td>A compromised firm</td><td>Freeze the firm's seats</td></tr>
            <tr><td>Denied connections between services, or outbound traffic to unknown hosts</td><td>A compromised pod</td><td>Isolate the pod and rotate its credentials</td></tr>
            <tr><td>A secret read by an unexpected workload, or the agency admin key used outside the API</td><td>Credential theft</td><td>Rotate the credential</td></tr>
            <tr><td>Agency errors, or status changes the agency didn't send</td><td>An integration fault, or spoofed responses</td><td>Pause that agency's sync</td></tr>
            <tr><td>Audit write failures, or a log source going quiet</td><td>Tampering, or a broken pipeline</td><td>Page on-call</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Alerting and on-call</h2>
        <ul className="checks">
          <li><Planned /> Alerts compare rates and ratios with the same week last season, not fixed counts, because traffic multiplies through filing season.</li>
          <li><Planned /> Two tiers: pages for active attacks and anything touching taxpayer data, tickets for the rest. Every alert links to a runbook.</li>
          <li><Planned /> Security on-call around the clock during filing season, with a target time to acknowledge a page.</li>
          <li><Planned /> Detections kept as code, tested against replayed attack traffic, and reviewed monthly to retire noisy ones.</li>
        </ul>
      </section>

      <section>
        <h2>Protecting the monitoring itself</h2>
        <ul className="checks">
          <li><Planned /> Logs leave the pod immediately and land on write-once storage in a separate account that application engineers can't change.</li>
          <li><Planned /> The audit log is hash-chained, so a gap or an edit shows.</li>
          <li><Planned /> An alert fires when any log source stops sending, so an attacker can't go quiet by turning logging off.</li>
        </ul>
        <p>
          When an alert fires, <Link to="/security/audit-response">Audit &amp; Incident Response</Link> takes over. To
          follow a request across services in the demo, see <Link to="/operations/tracing">Distributed Tracing</Link>.
        </p>
      </section>
    </Page>
  )
}

function AuditResponse() {
  return (
    <Page
      title="Audit & Incident Response"
      deeper={false}
      lede="What's recorded so we can tell what happened, and what we do when something goes wrong."
    >
      <section>
        <h2>What's audited</h2>
        <ul className="checks">
          <li><Demo /> Every admin action: status overrides, clears, on-demand checks, and releasing held returns, with the details, the admin, and the IP address.</li>
          <li><Demo /> Sign-ins, failed sign-ins (with the IP address, not the account tried), filed returns, and return resets.</li>
          <li><Planned /> Lockouts, rate-limit hits, password and MFA changes, session revocations, and which account a failed attempt targeted.</li>
          <li><Demo /> Admin searches, with the search text, and every return each admin is shown. Repeats within 15 minutes aren't logged again, so the admin page's polling doesn't flood the log.</li>
          <li><Planned /> Every time staff view a taxpayer's record, and the case it was tied to.</li>
          <li><Planned /> An append-only log, copied to write-once storage and the security monitoring system (SIEM), with hash chaining so tampering shows.</li>
        </ul>
      </section>

      <section>
        <h2>Detection</h2>
        <p>
          What we watch for, and the alerts that start this process, are covered in{' '}
          <Link to="/security/monitoring">Security Monitoring</Link>.
        </p>
      </section>

      <section>
        <h2>Response</h2>
        <ol className="timeline">
          <li><strong>Triage</strong><span>On-call assigns a severity. Anything involving taxpayer data goes to the security lead and privacy counsel.</span></li>
          <li><strong>Contain</strong><span>Revoke sessions (one statement, since they're server-side), disable affected accounts or staff access, rotate keys and agency credentials, and block sources at the edge.</span></li>
          <li><strong>Investigate</strong><span>Use the audit log, request logs, and traces to establish what was accessed, by whom, and since when.</span></li>
          <li><strong>Recover</strong><span>Fix the cause, restore from clean backups if needed, and watch closely for recurrence.</span></li>
          <li><strong>Notify</strong><span>Report to the IRS and affected states as e-file providers must, and notify taxpayers and regulators within the deadlines that apply.</span></li>
          <li><strong>Learn</strong><span>A blameless review, with fixes tracked to completion and the runbook updated. Practice with game days before the season.</span></li>
        </ol>
      </section>
    </Page>
  )
}

function Compliance() {
  return (
    <Page
      title="Privacy & Compliance"
      deeper={false}
      lede="The obligations that shape this design. This is an engineering summary, not legal advice; counsel confirms the specifics."
    >
      <section>
        <h2>Obligations</h2>
        <table className="metrics">
          <thead>
            <tr><th>Rule</th><th>What it means here</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>IRC §7216 and its regulations</td>
              <td>Tax return information can't be used or disclosed beyond preparing the return without the taxpayer's consent. Using it to train the refund-time model needs explicit, separate opt-in consent.</td>
            </tr>
            <tr>
              <td>FTC Safeguards Rule (GLBA)</td>
              <td>A written security program with a responsible owner, risk assessments, MFA, encryption, regular testing, and notifying the FTC of qualifying breaches.</td>
            </tr>
            <tr>
              <td>IRS e-file and safeguarding guidance</td>
              <td>Publication 1345 rules for e-file providers, Publication 4557 safeguards, and reporting data theft to the IRS.</td>
            </tr>
            <tr>
              <td>State privacy and breach laws</td>
              <td>Rights to access and delete personal data (for example CCPA/CPRA), limits on sensitive data, and breach notification deadlines that vary by state.</td>
            </tr>
            <tr>
              <td>SOC 2 Type II</td>
              <td>Independent evidence, for partners and enterprise customers, that the controls on these pages operate over time.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Privacy commitments to taxpayers</h2>
        <ul className="checks">
          <li>We show a taxpayer only their own returns, and staff see them only with a recorded reason.</li>
          <li>Refund estimates are made for everyone; only taxpayers who opt in contribute to training, and they can withdraw.</li>
          <li>We never sell return information or use it for advertising.</li>
          <li>Taxpayers can see and export their data, and delete their account once retention rules allow.</li>
          <li>Notifications never include links that ask for credentials or bank details, so customers can tell them apart from phishing.</li>
        </ul>
      </section>
    </Page>
  )
}

export const securityPages = {
  security: Overview,
  'threat-model': ThreatModel,
  'threat-actors': ThreatActors,
  'identity-access': IdentityAccess,
  'taxpayer-verification': TaxpayerIdentity,
  'support-agents': SupportAgents,
  preparers: Preparers,
  'service-auth': ServiceAuth,
  'data-protection': DataProtection,
  encryption: Encryption,
  minimization: Minimization,
  'rate-limiting': RateLimiting,
  'bot-defense': BotDefense,
  'abuse-prevention': AbusePrevention,
  'security-monitoring': SecurityMonitoring,
  'audit-response': AuditResponse,
  compliance: Compliance,
}
