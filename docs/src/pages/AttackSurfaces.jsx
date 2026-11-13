import { Link } from 'react-router-dom'
import { GuideContents } from '../components/Guide.jsx'
import { Demo, Planned } from '../components/Flowchart.jsx'

// Attack surfaces: an overview of every place an attacker can touch the system, and one page each for the three
// surfaces that matter most in filing season.

function Header({ title, lede }) {
  return (
    <>
      <p className="eyebrow">Threat Model</p>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </>
  )
}

function AttackSurfaces() {
  return (
    <>
      <Header
        title="Attack Surfaces"
        lede="Every place an attacker can touch the system, what they'd try there, and where the defenses are written up. The entry points listed are the demo's real ones."
      />

      <section>
        <h2>The surfaces</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Surface</th><th>Entry points</th><th>Main threats</th><th>Defenses</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Sign-in</td>
              <td><code>POST /api/auth/login</code></td>
              <td>Credential stuffing, account enumeration, locking victims out</td>
              <td><Link to="/security/threat-model/attack-surfaces/enumeration">Enumeration &amp; Credential Stuffing</Link></td>
            </tr>
            <tr>
              <td>Taxpayer API</td>
              <td><code>GET /api/returns</code>, <code>/api/drafts/&#123;form&#125;</code>, <code>POST /api/returns/&#123;form&#125;</code> and its estimate</td>
              <td>Reading someone else's data, automated fraudulent filing</td>
              <td>Every query is scoped to the session's user, and there are no return IDs in taxpayer URLs to guess. See <Link to="/security/threat-model/attack-surfaces/bots">Bots &amp; Automated Abuse</Link>.</td>
            </tr>
            <tr>
              <td>Admin console</td>
              <td><code>/api/admin/*</code>: search, status override, check now, release a held return</td>
              <td>Insiders, stolen staff credentials</td>
              <td><Link to="/security/threat-model/attack-surfaces/insider">Insider Access</Link></td>
            </tr>
            <tr>
              <td>Agency integrations</td>
              <td>Outbound calls with an API key and an admin key</td>
              <td>Stolen credentials, spoofed responses</td>
              <td><Link to="/security/service-auth">Service-to-Service Auth</Link></td>
            </tr>
            <tr>
              <td>Data stores and backups</td>
              <td>Postgres, replicas, snapshots, exports</td>
              <td>Bulk theft</td>
              <td><Link to="/security/data-protection">Data Protection</Link></td>
            </tr>
            <tr>
              <td>Logs and traces</td>
              <td>JSON logs, Jaeger</td>
              <td>Personal data leaking into telemetry</td>
              <td><Link to="/security/monitoring">Security Monitoring</Link> and <Link to="/operations/tracing">Distributed Tracing</Link></td>
            </tr>
            <tr>
              <td>Build and deploy</td>
              <td>Base images, Go and npm dependencies, deploy credentials</td>
              <td>A compromised dependency or image</td>
              <td><Planned /> Pinned dependencies and base images, dependency review, signed images, and deploy credentials scoped to one environment</td>
            </tr>
            <tr>
              <td>ML pipeline <Planned /></td>
              <td>Event export, training data, model registry</td>
              <td>Training data leaking, a tampered model</td>
              <td><Link to="/architecture/prediction">Refund Time Prediction</Link></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Surfaces we don't own</h2>
        <p>
          Phishing happens outside our systems: lookalike domains and "problem with your refund" texts timed to the season.
          We can't patch it, but we can make it pay less. We never ask for a password or code by email or text. Passkeys
          won't work on a lookalike domain. Our sending domains enforce DMARC, and a takedown service watches for lookalikes.
        </p>
      </section>

      <section>
        <h2>Kept small on purpose</h2>
        <ul className="checks">
          <li><Demo /> No self sign-up and no password reset, so neither can leak which emails have accounts. Both are designed in <Link to="/security/identity-access/taxpayer">Taxpayer Identity</Link>.</li>
          <li><Demo /> Taxpayer URLs carry no return or user IDs, so there's nothing to change in a URL to reach someone else's data.</li>
          <li><Demo /> Only the portal is reachable from outside the cluster.</li>
          <li><Planned /> Remove demo-only endpoints before production: <code>DELETE /api/returns</code>, which lets a taxpayer reset their own returns, and the agency status override.</li>
        </ul>
      </section>

      <GuideContents />
    </>
  )
}

function Enumeration() {
  return (
    <>
      <Header
        title="Enumeration & Credential Stuffing"
        lede="The two attacks on sign-in that matter most in filing season: finding out who has an account, and trying leaked passwords against them at scale."
      />

      <section>
        <h2>How the attacks work</h2>
        <ul className="points">
          <li><strong>Enumeration.</strong> Learn which emails have accounts from anything that answers differently: an error message, a slower response, "email already registered," or a reset flow. The list feeds targeted phishing.</li>
          <li><strong>Credential stuffing.</strong> Replay email and password pairs leaked from other sites, spread across residential proxies so each address only tries a few.</li>
          <li><strong>Password spraying.</strong> Try one or two common passwords against many accounts, staying under per-account limits.</li>
          <li><strong>Lockout abuse.</strong> Fail on purpose to lock a known taxpayer out, at the moment they need to check their refund.</li>
        </ul>
      </section>

      <section>
        <h2>Closing every enumeration channel</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Channel</th><th>How it could leak</th><th>Our answer</th></tr>
          </thead>
          <tbody>
            <tr><td>Sign-in errors</td><td>"Wrong password" vs. "no such user"</td><td><Demo /> One message for every failure, including a locked account</td></tr>
            <tr><td>Response time</td><td>Unknown emails answer faster than real ones</td><td><Demo /> Unknown emails are checked against a dummy Argon2id hash, so both take as long</td></tr>
            <tr><td>Sign-up</td><td>"This email is already registered"</td><td><Planned /> "Check your email" either way; the email says what happened</td></tr>
            <tr><td>Recovery</td><td>"We sent a link" only for real accounts</td><td><Planned /> The same response either way; anything sent goes only to contacts on file</td></tr>
            <tr><td>Preparer invitations</td><td>An invitation that fails for unknown taxpayers</td><td><Planned /> A pending invitation looks the same whether or not the person exists</td></tr>
            <tr><td>Support calls</td><td>"Yes, I see an account for that email"</td><td><Planned /> Agents confirm nothing until the caller is verified through their account</td></tr>
            <tr><td>Record IDs</td><td>Sequential IDs that can be counted</td><td><Demo /> Random UUIDs, and none at all in taxpayer URLs</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Stopping credential stuffing</h2>
        <ul className="checks">
          <li><Demo /> A per-client limit of 10 sign-in attempts every 5 minutes, then 429 with Retry-After.</li>
          <li><Demo /> A per-account lockout: 5 failures lock the account for 15 minutes, however many addresses they come from.</li>
          <li><Demo /> Every sign-in and failed attempt is written to the audit log with the IP address.</li>
          <li><Demo /> The client's address is found by reading <code>X-Forwarded-For</code> from the right and skipping only proxies listed in <code>TRUSTED_PROXIES</code>. Entries a client writes itself are ignored, and a load balancer in front of nginx doesn't make every client look like the balancer.</li>
          <li><Planned /> Passkeys and second factors, so a leaked password alone opens nothing.</li>
          <li><Planned /> Check passwords against known breaches at sign-up and sign-in, with a k-anonymity range query.</li>
          <li><Planned /> Rate limits and bot management at the edge, using device and network reputation as well as the address.</li>
          <li><Planned /> Detection on the patterns, not single requests: the failure ratio across all accounts, many accounts from one device or network, and successes from addresses that mostly fail. See <Link to="/security/monitoring">Security Monitoring</Link>.</li>
          <li><Planned /> Tell the owner about every sign-in from a new device, with a "This wasn't me" link.</li>
        </ul>
      </section>

      <section>
        <h2>Gaps in the demo</h2>
        <ul className="points">
          <li><strong>The rate limiter is per pod and in memory.</strong> With two API replicas an attacker gets twice the attempts, and a restart resets the count.</li>
          <li><strong>Lockout can be abused.</strong> Anyone who knows a taxpayer's email can lock them out for 15 minutes. At scale, progressive delays and a challenge replace the hard lockout.</li>
          <li><strong>Failed attempts don't record the account.</strong> That keeps emails out of the audit log, but hides spraying patterns. A keyed hash of the email would show them without storing the address.</li>
        </ul>
        <p>
          The limits themselves are covered in <Link to="/security/abuse-prevention/rate-limiting">Rate Limiting &amp; Lockout</Link>.
        </p>
      </section>
    </>
  )
}

function Bots() {
  return (
    <>
      <Header
        title="Bots & Automated Abuse"
        lede="Automated traffic peaks with filing season. Some of it is ours, some is harmless, and some is trying to take over accounts, file fraudulent returns, or run up our costs."
      />

      <section>
        <h2>What bots try here</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Abuse</th><th>What they want</th><th>Defense</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Credential stuffing</td>
              <td>Accounts to exploit or resell</td>
              <td>See <Link to="/security/threat-model/attack-surfaces/enumeration">Enumeration &amp; Credential Stuffing</Link></td>
            </tr>
            <tr>
              <td>Automated fraudulent filing</td>
              <td>Templated returns under stolen identities, paid into a few accounts</td>
              <td><Demo /> Before transmission, the processor looks for other taxpayers' returns paying the same bank fingerprint, and near-identical figures with pgvector, then holds matches for identity verification. <Planned /> Device and filing-velocity signals in a fraud service.</td>
            </tr>
            <tr>
              <td>Status polling by fraud rings</td>
              <td>Tracking which stolen-identity filings got paid</td>
              <td><Demo /> Status needs a signed-in account; nothing is public. <Planned /> Unusual read rates per account and per device are flagged.</td>
            </tr>
            <tr>
              <td>Fake accounts</td>
              <td>Accounts to file from, once sign-up exists</td>
              <td><Planned /> Refund details stay hidden until proofing, plus limits per device and network, and disposable-email checks</td>
            </tr>
            <tr>
              <td>SMS pumping</td>
              <td>Triggering one-time codes to premium-rate numbers the attacker profits from</td>
              <td><Planned /> Passkeys and authenticator apps first, send limits per number and country, and the SMS provider's fraud controls</td>
            </tr>
            <tr>
              <td>Exhausting resources at peak</td>
              <td>Slowing the service when it's busiest</td>
              <td><Demo /> Request bodies capped at 32 KB by the portal and 16 KB by the API, and strict input validation. <Planned /> Edge limits, autoscaling, and the shedding order in <Link to="/operations/peak-season">Peak Season Readiness</Link></td>
            </tr>
            <tr>
              <td>Scraping</td>
              <td>Personal data</td>
              <td><Demo /> Everything personal is behind sign-in, and API responses are marked <code>Cache-Control: no-store</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Telling bots from people</h2>
        <ul className="checks">
          <li><Planned /> Score each request on device, network reputation, behavior, and velocity at the edge, and challenge only when the score is high, so most taxpayers never see one.</li>
          <li><Planned /> Challenges must have an accessible alternative. Blocking screen readers or other assistive technology would shut out the people the service is meant to help.</li>
          <li><Planned /> Prefer invisible signals and rate limits over puzzles. A challenge is a speed bump, not a wall.</li>
        </ul>
      </section>

      <section>
        <h2>Bots we want</h2>
        <p>
          Our own synthetic checks sign in with dedicated test accounts and are allowlisted by credential, not address.
          Search engines may crawl marketing pages only; the app itself is never indexed. Bot defenses are covered in more
          depth in <Link to="/security/abuse-prevention/bot-defense">Bot Defense</Link>.
        </p>
      </section>
    </>
  )
}

function Insider() {
  return (
    <>
      <Header
        title="Insider Access"
        lede="People we trust with access: support agents, admins, engineers, and contractors. Most misuse is curiosity; the dangerous cases are selling data or helping a fraud ring. Stolen staff credentials look exactly the same."
      />

      <section>
        <h2>What an admin can do in the demo</h2>
        <table className="metrics compare">
          <thead>
            <tr><th>Action</th><th>Risk</th><th>Today</th><th>Proposed</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Search every taxpayer by name or email, and see their name, email, last four of the tax ID, and state</td>
              <td>Snooping on relatives, coworkers, or public figures</td>
              <td><Demo /> Admin role checked on every request. Every search, with its text, and every return shown is audited, once per admin every 15 minutes</td>
              <td>Open a record only from a case, masked by default</td>
            </tr>
            <tr>
              <td>Override a return's agency status</td>
              <td>Showing a fake "refund sent," or hiding fraud</td>
              <td><Demo /> Audited with the admin, IP address, and details</td>
              <td>Demo only. Production has no such power, because the agency owns the status</td>
            </tr>
            <tr>
              <td>Release a return held as a possible identity theft</td>
              <td>Letting a fraud ring's filing through</td>
              <td><Demo /> Audited, but one admin can do it alone</td>
              <td>Two-person approval, only after a recorded identity verification, and an alert on every release</td>
            </tr>
            <tr>
              <td>Check a return with its agency now</td>
              <td>Low</td>
              <td><Demo /> Audited</td>
              <td>No change</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Controls</h2>
        <ul className="checks">
          <li><Planned /> Least privilege by job, with access to a taxpayer opened per case and expiring on its own. See <Link to="/security/identity-access/agents">Support Agents</Link>.</li>
          <li><Planned /> Four-eyes approval for anything that changes a taxpayer's outcome, such as releasing a held return.</li>
          <li><Planned /> A watchlist of sensitive records, such as employees and public figures, where any access alerts security.</li>
          <li><Planned /> Engineers have no access to production data by default. Break-glass access needs approval, expires, and is recorded.</li>
          <li><Planned /> An append-only, hash-chained audit log that the people it records can't change.</li>
          <li><Planned /> Quarterly access reviews, and removal within minutes when someone leaves or changes jobs.</li>
        </ul>
      </section>

      <section>
        <h2>Detection</h2>
        <p>
          Insider misuse is caught by patterns: records opened without a case, out of hours, or in bulk; searches for names
          rather than case numbers; and releases or overrides clustered on one admin. These are alert rules in{' '}
          <Link to="/security/monitoring">Security Monitoring</Link>. Preparers have delegated access too, with their own
          controls in <Link to="/security/identity-access/preparers">Preparers</Link>.
        </p>
      </section>
    </>
  )
}

export const attackSurfacePages = {
  'attack-surfaces': AttackSurfaces,
  enumeration: Enumeration,
  bots: Bots,
  insider: Insider,
}
