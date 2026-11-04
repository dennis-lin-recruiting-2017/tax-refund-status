import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'

export default function AdminConsole() {
  return (
    <>
      <p className="eyebrow">Demo</p>
      <h1>Admin Console</h1>
      <p className="lede">
        Play the IRS, the California FTB, or the New York DTF: change the status of any taxpayer's return, and watch the change reach the
        taxpayer through a batch run.
      </p>

      <section>
        <h2>Why it exists</h2>
        <p>
          The IRS and the states don't offer an API for refund status. The demo's mock agencies stand in for them, and
          the admin console lets you decide what they say instead of waiting for their automatic timeline. That makes it
          easy to show any situation on demand: an approval, a refund sent as filed, an adjusted refund, or a request for more
          information.
        </p>
      </section>

      <section>
        <h2>Sign in</h2>
        <p>
          Open the portal (<a href="http://localhost:8090">localhost:8090</a> on Kubernetes,{' '}
          <a href="http://localhost:8088">localhost:8088</a> in Docker, <a href="http://localhost:5180">localhost:5180</a>{' '}
          in dev mode) and sign in as <code>admin@test.com</code> with the password <code>test</code>. Admins
          go straight to the console at <code>/admin</code>.
        </p>
      </section>

      <section>
        <h2>Reading a return</h2>
        <p>
          The console lists every taxpayer who has sent in a return, newest activity first, with their federal and state
          returns underneath.
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Column</th><th>Means</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Taxpayer sees</td>
              <td>
                The status in our database, the amount if the agency set one, and the latest message: exactly what the
                taxpayer's dashboard shows. Also when we last checked the agency and when we'll check next.
              </td>
            </tr>
            <tr>
              <td>Agency has (live)</td>
              <td>
                What the mock agency says right now, including any refund amount, balance due, payment date, and message,
                and whether that's its <em>Automatic</em> timeline or <em>Set by admin</em>.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Sending a status</h2>
        <p>Choose a status, fill in what it needs, and click <strong>Send to taxpayer</strong>.</p>
        <table className="metrics">
          <thead>
            <tr><th>Status</th><th>Details sent to the taxpayer</th></tr>
          </thead>
          <tbody>
            <tr><td>Received, Processing</td><td>Optional message</td></tr>
            <tr><td>Approved</td><td>The refund as filed, with an expected payment date (required), optional message</td></tr>
            <tr><td>Refund sent</td><td>The refund as filed, deposited on a date (required), optional message</td></tr>
            <tr>
              <td>Refund adjusted</td>
              <td>
                A refund different from the claim, its deposit date, and why it changed (all required). Sending the
                amount as filed is refused: that's Refund sent.
              </td>
            </tr>
            <tr><td>Accepted (returns with no refund)</td><td>Balance due, optional message</td></tr>
            <tr><td>Action required</td><td>A message saying what the agency needs (required)</td></tr>
          </tbody>
        </table>
        <p>
          <strong>Send to taxpayer</strong> sets the status at the mock agency and immediately runs a status check for
          that one return, through the same code path as batch runs, so the taxpayer's dashboard updates right away.
          If that check can't run (say the agency mock is restarting), the return is left due and the next batch run
          delivers it.
        </p>
      </section>

      <section>
        <h2>Randomize</h2>
        <p>
          <strong>Randomize</strong> appears for statuses with details, and fills them with a plausible agency decision.
          Edit anything before sending.
        </p>
        <table className="metrics">
          <thead>
            <tr><th>Status</th><th>What it picks</th></tr>
          </thead>
          <tbody>
            <tr><td>Approved</td><td>A payment date 5–21 days from today.</td></tr>
            <tr><td>Refund sent</td><td>A deposit date 0–3 days ago.</td></tr>
            <tr>
              <td>Refund adjusted</td>
              <td>
                80–105% of the claim (never exactly the claim), with a matching reason (a math error, an offset for a
                past-due debt, an adjusted or newly found credit). Deposited 0–3 days ago.
              </td>
            </tr>
            <tr>
              <td>Accepted</td>
              <td>The balance as filed, up to 10% higher, with a reminder to pay by April 15.</td>
            </tr>
            <tr>
              <td>Action required</td>
              <td>
                One of several realistic requests: verify identity, send W-2 copies, confirm the bank account, document
                dependents, or resolve a duplicate return.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          The server enforces limits whatever the console sends: adjusted refunds between $1 and the larger of 150% of the claim
          or the claim plus $1,000; a balance due between $0 and the larger of twice the filed balance or $5,000 over
          it; messages of at most 500 characters, and at least 10 for Refund adjusted and Action required.
        </p>
      </section>

      <section>
        <h2>Other actions</h2>
        <dl className="trouble">
          <dt>Resume automatic</dt>
          <dd>Removes your override, so the agency goes back to its automatic timeline for that return.</dd>
          <dt>Check now</dt>
          <dd>
            Checks the return with its agency right away. It also works on returns in a final status, which batch runs
            otherwise stop checking.
          </dd>
          <dt>Identity verified: release and send</dt>
          <dd>
            Shown for returns our duplicate screening held before they were sent. It records that identity was verified,
            and the processor sends the return to the agency without screening it again.
          </dd>
        </dl>
      </section>

      <section>
        <h2>A walkthrough</h2>
        <ol className="points">
          <li>In one browser window, sign in as <code>tester00@test.com</code> and submit the pre-filled Form 1040.</li>
          <li>In a private window, sign in as <code>admin@test.com</code>. Tester 00 is at the top of the list.</li>
          <li>
            Choose <strong>Action required</strong>, click <strong>Randomize</strong>, then <strong>Send to
            taxpayer</strong>. Refresh the taxpayer's window: the card shows <em>Action needed</em> with the agency's
            request.
          </li>
          <li>
            Choose <strong>Approved</strong>, click <strong>Randomize</strong>, and send. The taxpayer sees their refund
            and the expected payment date.
          </li>
          <li>
            Choose <strong>Refund adjusted</strong>, click <strong>Randomize</strong>, and send. The taxpayer sees
            "Adjusted refund", what they claimed, and the reason. Choose <strong>Refund sent</strong> instead for a
            refund paid as filed. Both are final, so batch runs stop checking the return until you change it again.
          </li>
          <li>
            Open Jaeger and find the <code>refund-api</code> trace for <code>PUT /api/admin/returns/…/agency-status</code>:
            the call to the agency, then the <code>batch.check_one</code> sync that delivered it.
          </li>
        </ol>
        <div className="note">
          <strong>Use a separate window for the admin.</strong> Sessions are cookies, so signing in as the admin in the
          same browser window signs the taxpayer out.
        </div>
      </section>

      <section>
        <h2>How it's built</h2>
        <ul className="points">
          <li>
            The console calls admin endpoints on our API, which only accept users with the <code>admin</code> role. Every
            action is written to <code>audit_log</code> with the admin's ID, and so is every search and every return an
            admin is shown (<code>admin_view_returns</code>). The page refreshes every 5 seconds, so a view is logged
            once per admin every 15 minutes rather than on every refresh.
          </li>
          <li>
            The API forwards status changes to the mock agency's operator endpoints, using a separate key
            (<code>AGENCY_ADMIN_KEY</code>) that only the admin endpoints use. In the demo every workload still loads it
            from the shared secret; see <Link to="/security/service-auth">Service-to-Service Auth</Link>.
          </li>
          <li>
            The mock agency stores overrides in its own <code>agency_mock</code> schema. Our own tables are never edited
            directly: a status check reads the agency's new status, amount, and message and updates them, the same path
            a real change would take.
          </li>
        </ul>
        <CodeBlock label="Recent admin actions">{`SELECT a.action, u.email, a.detail, a.created_at
FROM audit_log a JOIN users u ON u.id = a.user_id
WHERE a.action LIKE 'admin_%'
ORDER BY a.id DESC LIMIT 20;`}</CodeBlock>
        <p>
          To check the whole flow from the command line, run <code>scripts/admin-smoke-test.sh</code> with the portal's
          address, for example <code>scripts/admin-smoke-test.sh http://localhost:8088</code>. See also{' '}
          <Link to="/architecture/batch-sync/agencies">Agency Integration</Link>.
        </p>
      </section>
    </>
  )
}
