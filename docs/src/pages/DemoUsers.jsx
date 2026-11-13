import { Link } from 'react-router-dom'
// The backend's own seed file, so this list always matches the accounts the demo creates.
import seed from '../../../backend/internal/store/demo-users.json'

const STATE_NAMES = { CA: 'California', NY: 'New York', FL: 'Florida', TX: 'Texas', WA: 'Washington' }
const FORM_STATE = { 540: 'CA', '540NR': 'CA', 'IT-201': 'NY', 'IT-203': 'NY' }
const RESIDENCY = { part_year: 'part-year resident', nonresident: 'nonresident' }
const ROLE_LABELS = { admin: 'Admin', support: 'Support' }

// Where an account lives and works. Mirrors store.DemoUser.Filings: "states" wins, a single "state"
// means a full resident of it, and neither means a California resident.
function filings(u) {
  if (u.states) return u.states
  return [{ state: u.state || 'CA', residency: 'resident' }]
}

// The state returns an account files, from its pre-filled forms. A backend test keeps the drafts and
// the account's states in step.
function filedIn(u) {
  return Object.keys(u.drafts ?? {})
    .filter((form) => FORM_STATE[form])
    .map((form) => ({ state: FORM_STATE[form], form }))
}

const ROWS = seed.map((u) => {
  const states = filings(u)
  return {
    email: u.email,
    name: u.fullName,
    role: u.role || 'taxpayer',
    home: states.find((f) => f.residency === 'resident'),
    others: states.filter((f) => f.residency !== 'resident'),
    filed: filedIn(u),
  }
})

const taxpayers = ROWS.filter((r) => r.role === 'taxpayer').length

export default function DemoUsers() {
  return (
    <>
      <p className="eyebrow">Demo</p>
      <h1>Demo Users</h1>
      <p className="lede">
        The accounts the demo creates when it starts, in both <Link to="/demo/local-development">local development</Link>{' '}
        and <Link to="/demo/local-kubernetes">Kubernetes</Link>: {taxpayers} taxpayers and {ROWS.length - taxpayers} staff
        accounts. The password for every one is <code>test</code>.
      </p>

      <p className="note">
        <strong>These are the running demo's accounts,</strong> on <code>test.com</code>. The in-browser mock on the{' '}
        <Link to="/demo">Demo</Link> page has its own sample accounts, on <code>demo.test</code>. This list is read from{' '}
        <code>backend/internal/store/demo-users.json</code>, so it always matches what the demo seeds.
      </p>

      <section>
        <h2>Accounts</h2>
        <p>Every taxpayer also files the federal 1040. "States filed in" lists their state returns, with the form each uses.</p>
        <div className="table-scroll">
          <table className="metrics demo-users">
            <thead>
              <tr><th>User</th><th>State of residence</th><th>States filed in</th></tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.email}>
                  <td>
                    <span className="mono">{r.email}</span>
                    {ROLE_LABELS[r.role] && <span className="state done role-tag">{ROLE_LABELS[r.role]}</span>}
                  </td>
                  <td>
                    {r.role !== 'taxpayer' ? (
                      <span className="muted">—</span>
                    ) : (
                      <>
                        {r.home ? STATE_NAMES[r.home.state] : <span className="muted">None</span>}
                        {r.others.map((f) => (
                          <span key={f.state} className="sub">
                            {r.home
                              ? `Also ${RESIDENCY[f.residency]} of ${STATE_NAMES[f.state]}`
                              : `${RESIDENCY[f.residency][0].toUpperCase()}${RESIDENCY[f.residency].slice(1)} of ${STATE_NAMES[f.state]}`}
                          </span>
                        ))}
                      </>
                    )}
                  </td>
                  <td>
                    {r.role !== 'taxpayer' ? (
                      <span className="muted">Files nothing</span>
                    ) : r.filed.length ? (
                      r.filed.map((f) => (
                        <span key={f.form} className="filed">
                          {STATE_NAMES[f.state]} <span className="muted">({f.form})</span>
                        </span>
                      ))
                    ) : (
                      <span className="muted">Federal only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Good accounts to start with</h2>
        <ul className="points">
          <li><strong>One state:</strong> <code>tester00@test.com</code> (California) or <code>tester10@test.com</code> (New York).</li>
          <li><strong>Two states:</strong> <code>tester08</code> lives in California and worked in New York; <code>tester09</code> moved between them during the year.</li>
          <li><strong>No state income tax:</strong> <code>tester22</code> lives in Florida and worked in Texas, so files only the 1040.</li>
          <li><strong>Staff:</strong> <code>admin@test.com</code> opens the <Link to="/demo/admin-console">Admin Console</Link>; <code>support01@test.com</code> opens the read-only taxpayer list for support agents. It shows a return only while its taxpayer has chosen <strong>Give support access</strong> on that return, for 5 minutes at a time, with a countdown on both sides and every grant in an access log. <strong>View return</strong> opens a shared return in full, read-only, and <strong>End access</strong> lets the agent give it up early.</li>
          <li><strong>Color schemes:</strong> each role starts in its own scheme, so you can tell at a glance whose view you're in: taxpayers Sunset, support Ocean, admins Graphite. The picker at the top, once signed in, also offers Evergreen and Plum, and a pick is saved to the account. Signed-out pages are always Evergreen.</li>
        </ul>
        <p>
          To add or change an account, edit the seed file and restart the backend. See{' '}
          <Link to="/demo/local-development/changes">Common Changes</Link>.
        </p>
      </section>
    </>
  )
}
