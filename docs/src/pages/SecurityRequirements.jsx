import { Link } from 'react-router-dom'
import { Demo, Planned } from '../components/Flowchart.jsx'

// Each requirement is stated so it can be tested, with where the design meets it and whether the demo
// enforces it today. The Security section explains the how; this page is the list we'd sign off against.
const GROUPS = [
  {
    title: 'Access',
    rows: [
      ['A taxpayer sees only their own returns', 'Every query is scoped to the signed-in user\'s own returns', 'demo', '/security/identity-access'],
      ['Sessions end on their own', 'A session expires after 30 minutes without use, and can be revoked server-side in one step', 'demo', '/security/identity-access'],
      ['Taxpayers decide when support can look', 'Support sees a return only during a 5-minute window its taxpayer grants for that return; either side can end it early; grants, revocations, and views are audited, and agents see each taxpayer\'s recent grants and who ended them', 'demo', '/security/identity-access/agents'],
      ['Staff need a reason to look', 'Support staff open a record only through a case, and every view is recorded against it', 'planned', '/security/identity-access/agents'],
      ['Strong sign-in for staff', 'Staff sign in through company SSO with phishing-resistant MFA (hardware keys or passkeys)', 'planned', '/security/identity-access/agents'],
      ['MFA for taxpayers', 'Offered to every taxpayer, and required on a new device or before sensitive changes', 'planned', '/security/identity-access/taxpayer'],
    ],
  },
  {
    title: 'Sign-in abuse',
    rows: [
      ['Failures reveal nothing', 'A wrong email, wrong password, and locked account return the same message in the same time', 'demo', '/security/threat-model/attack-surfaces/enumeration'],
      ['Guessing is throttled', 'At most 10 attempts per client every 5 minutes, and 5 failures lock an account for 15 minutes', 'demo', '/security/abuse-prevention'],
      ['Limits hold across replicas', 'Rate limits are enforced in a shared store or at the edge, not per pod', 'planned', '/security/abuse-prevention'],
      ['Limits use the real client address', 'X-Forwarded-For is believed only from configured proxies, so clients can\'t forge their address', 'demo', '/security/threat-model/attack-surfaces/enumeration'],
    ],
  },
  {
    title: 'Data',
    rows: [
      ['Store the least we can', 'Tax IDs and bank accounts kept as last 4 digits only, plus a keyed fingerprint of the bank account', 'demo', '/security/data-protection'],
      ['Passwords and tokens never stored readable', 'Passwords hashed with Argon2id; session tokens stored as SHA-256 hashes', 'demo', '/security/data-protection'],
      ['Encrypted in transit', 'TLS 1.2 or later at the edge, and mutual TLS between services', 'planned', '/security/service-auth'],
      ['Encrypted at rest', 'Storage, backups, and return figures encrypted under keys held in a managed key service', 'planned', '/security/data-protection/encryption'],
      ['Nothing personal in logs', 'Request logs never contain request or response bodies', 'demo', '/security/data-protection/minimization'],
      ['Nothing personal in traces', 'Span attributes come from an allowlist', 'planned', '/security/data-protection/minimization'],
      ['Deleted on schedule', 'Each kind of data has a retention period, and closed accounts are removed once it ends', 'planned', '/security/data-protection/minimization'],
    ],
  },
  {
    title: 'Money',
    rows: [
      ['Can\'t redirect a refund', 'Nothing in this service can change a refund amount or bank account', 'demo', '/security'],
      ['Suspected fraud is held', 'Returns paying into another taxpayer\'s bank account with near-identical figures are held before transmission', 'demo', '/security/abuse-prevention'],
      ['Releasing a hold takes two people', 'A held return is released only with a second admin\'s approval', 'planned', '/security/threat-model/attack-surfaces/insider'],
    ],
  },
  {
    title: 'Services',
    rows: [
      ['Deny by default inside', 'Each workload accepts connections only from the workloads that need it', 'demo', '/security/service-auth'],
      ['Separate credentials per service', 'Each workload has its own identity and secrets, so one compromise doesn\'t expose the rest', 'planned', '/security/service-auth'],
      ['Outbound calls are allowlisted', 'Workloads reach only the agencies and services they need', 'planned', '/security/service-auth'],
    ],
  },
  {
    title: 'Detection and response',
    rows: [
      ['Staff actions are audited', 'Every admin change, search, and return shown is recorded with who, when, and from where', 'demo', '/security/audit-response'],
      ['The audit log can\'t be quietly changed', 'Append-only, copied to write-once storage, hash-chained', 'planned', '/security/audit-response'],
      ['Attacks are noticed', 'Alerts for credential stuffing, lockout spikes, and unusual staff access reach on-call within minutes', 'planned', '/security/monitoring'],
      ['Breaches are reported on time', 'The IRS, affected states, taxpayers, and regulators notified within the deadlines that apply', 'planned', '/security/audit-response'],
    ],
  },
]

export default function SecurityRequirements() {
  return (
    <>
      <p className="eyebrow">Requirements</p>
      <h1>Security</h1>
      <p className="lede">
        What the service must guarantee to keep taxpayer data private and refunds out of fraudsters' hands. Each
        requirement is stated so it can be tested; the <Link to="/security">Security</Link> section explains how.
      </p>

      <blockquote className="callout">
        The service must never tell anyone anything about a taxpayer unless they have proven they are that taxpayer,
        or are staff with a recorded reason to look.
      </blockquote>

      <p>
        <Demo /> marks requirements the demo enforces today. <Planned /> marks what production adds.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <table className="metrics">
            <thead>
              <tr><th>Requirement</th><th>Measure</th><th>Status</th></tr>
            </thead>
            <tbody>
              {g.rows.map(([req, measure, status, to]) => (
                <tr key={req}>
                  <td><Link to={to}>{req}</Link></td>
                  <td>{measure}</td>
                  <td>{status === 'demo' ? <Demo /> : <Planned />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section>
        <h2>Under peak load</h2>
        <p>
          Every requirement holds through filing season. Capacity comes from scaling out, never from relaxing a
          control (see <Link to="/technical-design/non-functional/capacity">Capacity Estimates</Link>).
        </p>
      </section>
    </>
  )
}
