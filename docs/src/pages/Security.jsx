import { Link } from 'react-router-dom'

export default function Security() {
  return (
    <>
      <p className="eyebrow">Security</p>
      <h1>Security</h1>
      <p className="lede">
        Security is the first design constraint for this service, not a feature added later. Every other
        decision in this design is checked against it.
      </p>

      <section>
        <h2>Why security is paramount</h2>
        <p>
          A refund status lookup looks harmless: it's read-only and shows a status, not a full tax return. But
          it sits on top of some of the most sensitive data a person has, and it's open to anyone on the
          internet during the weeks when attackers are most active.
        </p>
        <ul className="points">
          <li>
            <strong>It's an identity oracle.</strong> If the endpoint answers differently for "wrong details"
            and "no return filed", attackers can use it to confirm whether a stolen identity has filed, and
            to find out which stolen records are still worth using.
          </li>
          <li>
            <strong>It leaks financial signals.</strong> Refund amounts, payment dates, and payment methods
            help attackers time and target phishing, account takeover, and intercepting checks.
          </li>
          <li>
            <strong>It's a target for fraud rings.</strong> Refund fraud is organized and well funded.
            Fraudsters who file returns with stolen identities use status lookups to track their fraudulent
            refunds.
          </li>
          <li>
            <strong>Trust is the product.</strong> One incident during filing season would undermine
            confidence in the service and push taxpayers back to the phone lines it's meant to relieve.
          </li>
        </ul>
        <blockquote className="callout">
          The service must never become a way to learn anything about a taxpayer that the person asking
          couldn't already prove they know.
        </blockquote>
      </section>

      <section>
        <h2>Security principles</h2>
        <div className="cards">
          <div className="card">
            <h3>No oracle responses</h3>
            <p>Every failed lookup returns the same message, in the same time, whatever the cause.</p>
          </div>
          <div className="card">
            <h3>Least data</h3>
            <p>Collect, store, and return only what's needed to answer the status question.</p>
          </div>
          <div className="card">
            <h3>Defense in depth</h3>
            <p>Edge, gateway, service, and data layers each enforce their own controls.</p>
          </div>
          <div className="card">
            <h3>Zero trust inside</h3>
            <p>Services authenticate each other, and no network location is trusted by default.</p>
          </div>
          <div className="card">
            <h3>Read-only by design</h3>
            <p>The service can't change refund data, so compromising it can't redirect money.</p>
          </div>
          <div className="card">
            <h3>Assume breach</h3>
            <p>Audit everything, limit what a stolen credential can do, and plan for detection and response.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Top threats</h2>
        <table className="metrics">
          <thead>
            <tr><th>Threat</th><th>Impact</th><th>Primary mitigation</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Identity enumeration</td>
              <td>Confirms stolen identities and filing activity</td>
              <td>Uniform responses, multi-factor matching, per-identity lockout</td>
            </tr>
            <tr>
              <td>Credential stuffing &amp; bots</td>
              <td>Mass lookups, degraded availability</td>
              <td>Rate limits by IP, device, and identity; bot detection at the edge</td>
            </tr>
            <tr>
              <td>Data exposure in transit or at rest</td>
              <td>Disclosure of taxpayer data</td>
              <td>TLS everywhere, encryption at rest with managed keys, tokenized identifiers</td>
            </tr>
            <tr>
              <td>Insider misuse</td>
              <td>Agents browsing records without cause</td>
              <td>Case-bound access, least privilege, immutable audit with review</td>
            </tr>
            <tr>
              <td>Phishing &amp; lookalike sites</td>
              <td>Taxpayers handing details to attackers</td>
              <td>Single official domain, notifications that never contain links asking for data</td>
            </tr>
            <tr>
              <td>Upstream compromise</td>
              <td>Tampered or leaked status data</td>
              <td>Mutual TLS, signed messages, read-only replicas, narrowly scoped credentials</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Baseline requirements</h2>
        <ul className="checks">
          <li>Lookups require several facts only the filer should know: tax ID, filing status, and the exact refund amount.</li>
          <li>Failed attempts are limited by identity as well as by client, so spreading an attack across many IP addresses doesn't help.</li>
          <li>Tax IDs are never logged in plaintext and never appear in URLs, analytics, or error messages.</li>
          <li>Responses show the minimum: no full tax IDs, names, addresses, or bank account numbers.</li>
          <li>Every lookup by staff or preparers is tied to an authorized case or client, and is audited.</li>
          <li>All data is encrypted in transit and at rest, with keys in a managed key service and rotated on a schedule.</li>
          <li>Security controls stay enforced during peak load; they're never turned off to recover capacity.</li>
        </ul>
      </section>

      <section>
        <h2>In this section</h2>
        <ul className="child-links">
          <li><Link to="/security/threat-model">Threat Model</Link>: who attacks the system, and where</li>
          <li><Link to="/security/identity-access">Identity &amp; Access</Link>: verifying taxpayers, staff, and services</li>
          <li><Link to="/security/data-protection">Data Protection</Link>: encryption, minimization, and retention</li>
          <li><Link to="/security/abuse-prevention">Abuse Prevention</Link>: rate limiting, lockout, and bot defense</li>
          <li><Link to="/security/audit-response">Audit &amp; Incident Response</Link>: detection and what happens next</li>
          <li><Link to="/security/compliance">Privacy &amp; Compliance</Link>: legal and policy obligations</li>
        </ul>
        <p>
          The <Link to="/demo">Demo</Link> shows several of these controls in action: uniform error messages,
          masked identifiers, and lockout after repeated failures.
        </p>
      </section>
    </>
  )
}
