import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'

export default function AdminConsole() {
  return (
    <>
      <p className="eyebrow">Demo</p>
      <h1>Admin Console</h1>
      <p className="lede">
        Play the IRS and the California FTB: change the status of any taxpayer's return, and watch the change reach the
        taxpayer through a batch run.
      </p>

      <section>
        <h2>Why it exists</h2>
        <p>
          The IRS and the states don't offer an API for refund status. The demo's mock agencies stand in for them, and
          the admin console lets you decide what they say instead of waiting for their automatic timeline. That makes it
          easy to show any situation on demand: an approval, a payment date, a refund sent, or a request for more
          information.
        </p>
      </section>

      <section>
        <h2>Sign in</h2>
        <p>
          Open the portal (<a href="http://localhost:8090">localhost:8090</a> on Kubernetes,{' '}
          <a href="http://localhost:8088">localhost:8088</a> in Docker, <a href="http://localhost:5180">localhost:5180</a>{' '}
          in dev mode) and sign in as <code>demo-admin@interview.com</code>. The password is in{' '}
          <code>backend/internal/store/demo-users.json</code>. Admins go straight to the console at <code>/admin</code>.
        </p>
      </section>

      <section>
        <h2>Reading a return</h2>
        <table className="metrics">
          <thead>
            <tr><th>Column</th><th>Means</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Taxpayer sees (synced by batch)</td>
              <td>The status in our database: what the taxpayer's dashboard shows, with when we last checked the agency and when we'll check next.</td>
            </tr>
            <tr>
              <td>Agency has (live)</td>
              <td>What the mock agency says right now, and whether that's its <em>Automatic</em> timeline or <em>Set by admin</em>.</td>
            </tr>
            <tr>
              <td>Yellow note</td>
              <td>The two differ. The taxpayer will see the agency's status after the next batch run.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Actions</h2>
        <dl className="trouble">
          <dt>Set at agency</dt>
          <dd>
            Pins the return to a status at its agency: Received, Processing, Approved (with a payment date), Refund sent,
            Accepted (for returns with no refund), or Action required. Approved and Refund sent are only offered when
            there's a refund.
          </dd>
          <dt>Resume automatic</dt>
          <dd>Removes your override, so the agency goes back to its automatic timeline for that return.</dd>
          <dt>Check now</dt>
          <dd>
            Makes the return due immediately, so the very next batch run checks it. Setting or clearing a status does
            this for you. It also works on returns in a final status, which batch runs otherwise stop checking.
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
          <li>In one browser window, sign in as a taxpayer and file a Form 1040 with the sample W-2.</li>
          <li>In a private window, sign in as the admin. The new return is at the top of the list.</li>
          <li>
            Set it to <strong>Action required</strong>. The yellow note appears; within one batch run (15 seconds in
            Docker and dev mode, up to a minute on Kubernetes) the taxpayer's card changes to <em>Action needed</em>:
            "The IRS needs more information…"
          </li>
          <li>
            Set it to <strong>Approved</strong> with a payment date a week out. The taxpayer sees the approval and the
            expected deposit date.
          </li>
          <li>
            Set it to <strong>Refund sent</strong>. That's a final status, so batch runs stop checking it, until you
            change it again.
          </li>
          <li>
            Open Jaeger and find the <code>refund-api</code> trace for <code>PUT /api/admin/returns/…/agency-status</code>{' '}
            to see the call to the agency, then the next <code>refund-batch</code> run that picked up the change.
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
            action is written to <code>audit_log</code> with the admin's ID.
          </li>
          <li>
            The API forwards status changes to the mock agency's operator endpoints, using a separate key
            (<code>AGENCY_ADMIN_KEY</code>) that batch runs and the processor never hold.
          </li>
          <li>
            The mock agency stores overrides in its own <code>agency_mock</code> schema. Our own tables are never edited
            directly: the batch run reads the agency's new status and updates them, the same path a real change would
            take.
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
