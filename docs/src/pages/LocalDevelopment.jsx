import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'
import { GuideContents, GuideNav, Step } from '../components/Guide.jsx'

const VSCODE_LAUNCH = `{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend (API + processor)",
      "type": "go",
      "request": "launch",
      "mode": "auto",
      "program": "\${workspaceFolder}/backend/cmd/taxrefund",
      "args": ["all"],
      "env": { "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318" }
    }
  ]
}`

const NEAREST_SQL = `SELECT a.form, ua.email AS filed_by, ub.email AS closest_other_taxpayer,
       round((a.features <=> b.features)::numeric, 4) AS distance
FROM tax_returns a
JOIN users ua ON ua.id = a.user_id
CROSS JOIN LATERAL (
  SELECT r.user_id, r.features FROM tax_returns r
  WHERE r.user_id <> a.user_id AND r.jurisdiction = a.jurisdiction
  ORDER BY r.features <=> a.features
  LIMIT 1
) b
JOIN users ub ON ub.id = b.user_id;`

function Page({ title, lede, children }) {
  return (
    <>
      <p className="eyebrow">Local Development</p>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
      <GuideNav />
    </>
  )
}

function QuickStart() {
  return (
    <Page
      title="Local Development"
      lede="Work on the code with fast reloads and a debugger. The Go backend and the React portal run directly on your machine; only Postgres runs in Docker."
    >
      <p>
        Use <strong>dev mode</strong> while you change code, and{' '}
        <Link to="/demo/local-development/integration">integration mode</Link> to check the containers work together
        before you deploy. To run on Kubernetes, see <Link to="/demo/local-kubernetes">Local Kubernetes</Link>.
      </p>

      <div className="requirements">
        <strong>You need:</strong> Docker Desktop, Go 1.27+, Node.js 22+, make, and git. See{' '}
        <Link to="/demo/local-development/setup">Setup</Link> if you don't have them yet.
      </div>

      <h2>Quick start</h2>
      <Step n="1" title="Get the code and install dependencies">
        <CodeBlock>{`git clone https://github.com/<owner>/tax-refund-status.git
cd tax-refund-status
make install`}</CodeBlock>
      </Step>
      <Step n="2" title="Start dev mode">
        <CodeBlock>make dev</CodeBlock>
        <p>
          This starts Postgres and Jaeger in Docker, then the Go backend and the portal. Press <strong>Ctrl+C</strong> to
          stop.
        </p>
      </Step>
      <Step n="3" title="Open the portal">
        <p>
          Open <a href="http://localhost:5180">http://localhost:5180</a> and sign in as <code>tester00@test.com</code>{' '}
          with the password <code>test</code>; <code>admin@test.com</code> (same password) opens the{' '}
          <Link to="/demo/admin-console">admin console</Link>. Traces are at{' '}
          <a href="http://localhost:16686">http://localhost:16686</a>.
        </p>
      </Step>
      <Step n="4" title="Run the tests">
        <CodeBlock>make test</CodeBlock>
        <p>
          With dev mode running, <code>make smoke</code> also runs the end-to-end check.
        </p>
      </Step>

      <GuideContents />
    </Page>
  )
}

function Setup() {
  return (
    <Page title="Setup" lede="Install the tools and the project's dependencies. You only do this once.">
      <Step n="1" title="Install the prerequisites">
        <ul className="checks">
          <li>
            <strong>Docker Desktop</strong>, for Postgres and integration mode.
          </li>
          <li>
            <strong>Go 1.27 or later</strong>: <code>brew install go</code>, or download from go.dev.
          </li>
          <li>
            <strong>Node.js 22 or later</strong>: <code>brew install node</code>, or use nvm.
          </li>
          <li>
            <strong>make</strong> and <strong>git</strong>, from <code>xcode-select --install</code> on macOS.
          </li>
          <li>
            Optional: <strong>psql</strong> to look at the database, with <code>brew install libpq</code>.
          </li>
        </ul>
      </Step>

      <Step n="2" title="Get the code and install dependencies">
        <CodeBlock>{`git clone https://github.com/<owner>/tax-refund-status.git
cd tax-refund-status
make install`}</CodeBlock>
        <p>
          <code>make install</code> runs <code>npm install</code> for the portal and downloads the Go modules. Run every{' '}
          <code>make</code> command from the repository root; <code>make help</code> lists them all.
        </p>
      </Step>
    </Page>
  )
}

function Run() {
  return (
    <Page title="Run Dev Mode" lede="Run Postgres, the Go backend, and the portal, together or one at a time.">
      <Step n="1" title="Start everything">
        <CodeBlock>make dev</CodeBlock>
        <p>
          This starts Postgres and Jaeger in Docker, waits for them, then runs the backend and the portal side by side in
          your terminal. Press <strong>Ctrl+C</strong> to stop both. Open{' '}
          <a href="http://localhost:5180">http://localhost:5180</a> and sign in as <code>tester00@test.com</code>–
          <code>tester09@test.com</code> (federal and California), <code>tester10@test.com</code>–
          <code>tester19@test.com</code> (federal and New York), or <code>admin@test.com</code>. The password for all of
          them is <code>test</code>.
        </p>
        <table className="metrics">
          <thead>
            <tr>
              <th>Process</th>
              <th>Address</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Portal (Vite)</td>
              <td>localhost:5180</td>
              <td>
                Hot reload. Proxies <code>/api</code> to the backend.
              </td>
            </tr>
            <tr>
              <td>Backend (Go)</td>
              <td>localhost:8080</td>
              <td>
                Runs <code>taxrefund all</code>: the API, processor, batch scheduler, and both agency mocks in one
                process.
              </td>
            </tr>
            <tr>
              <td>Mock IRS / California FTB / New York DTF</td>
              <td>localhost:9101 / 9102 / 9103</td>
              <td>Inside the backend process. Fail 5% of status calls on purpose.</td>
            </tr>
            <tr>
              <td>Jaeger</td>
              <td>localhost:16686</td>
              <td>Trace UI. The backend sends traces to localhost:4318.</td>
            </tr>
            <tr>
              <td>Postgres 17 + pgvector</td>
              <td>localhost:5432</td>
              <td>Docker container with a persistent volume</td>
            </tr>
          </tbody>
        </table>
        <p>
          On first start the backend creates the tables and the demo users. A filed return is sent to its agency within
          seconds; after that, batch runs every 15 seconds pick up status changes. In Jaeger, each in-process service
          shows up separately: <code>refund-api</code>, <code>refund-processor</code>, <code>refund-batch</code>,{' '}
          <code>agency-irs</code>, <code>agency-ca-ftb</code>, and <code>agency-ny-dtf</code>.
        </p>
      </Step>

      <Step n="2" title="Or run the pieces separately">
        <p>To restart one piece without the others, or to keep their logs apart, use three terminals:</p>
        <CodeBlock label="Terminal 1: Postgres and Jaeger">make dev-db</CodeBlock>
        <CodeBlock label="Terminal 2: Go backend">make dev-backend</CodeBlock>
        <CodeBlock label="Terminal 3: portal">make dev-frontend</CodeBlock>
        <p>
          Go doesn't reload on save. Press Ctrl+C in terminal 2 and run <code>make dev-backend</code> again after
          changing backend code. Portal changes show up in the browser right away.
        </p>
      </Step>
    </Page>
  )
}

function Debugging() {
  return (
    <Page title="Debugging" lede="The backend is one Go program, so any Go debugger works.">
      <p>
        Start Postgres and Jaeger with <code>make dev-db</code>, then launch <code>backend/cmd/taxrefund</code> with the
        argument <code>all</code>. Dev mode has built-in defaults, so the only variable worth setting is{' '}
        <code>OTEL_EXPORTER_OTLP_ENDPOINT</code>, to send traces to Jaeger. Keep <code>make dev-frontend</code> running to
        use the portal against the debugger.
      </p>

      <Step title="VS Code">
        <p>
          Install the Go extension, then add this to <code>.vscode/launch.json</code> and press F5:
        </p>
        <CodeBlock label=".vscode/launch.json">{VSCODE_LAUNCH}</CodeBlock>
      </Step>

      <Step title="GoLand">
        <p>
          Create a <strong>Go Build</strong> run configuration for the package <code>taxrefund/cmd/taxrefund</code>, with
          program arguments <code>all</code> and the working directory set to <code>backend</code>.
        </p>
      </Step>

      <Step title="Debug one part">
        <p>To debug one part on its own, use a different argument instead of <code>all</code>:</p>
        <table className="metrics">
          <thead>
            <tr><th>Argument</th><th>Runs</th></tr>
          </thead>
          <tbody>
            <tr><td><code>serve</code></td><td>The API</td></tr>
            <tr><td><code>process</code></td><td>Duplicate screening and transmission to the agencies</td></tr>
            <tr><td><code>batch-run federal</code></td><td>One batch status run for one jurisdiction, then exits. Good for stepping through a run.</td></tr>
            <tr><td><code>batch-schedule</code></td><td>Batch runs every <code>BATCH_INTERVAL_SECONDS</code></td></tr>
            <tr><td><code>agency</code></td><td>One mock agency (<code>AGENCY=irs</code>, <code>ca-ftb</code>, or <code>ny-dtf</code>, on <code>AGENCY_ADDR</code>)</td></tr>
          </tbody>
        </table>
        <p>
          When you run parts separately, the agency mocks must be running too, for example with{' '}
          <code>AGENCY=irs AGENCY_ADDR=:9101 go run ./cmd/taxrefund agency</code>.
        </p>
      </Step>

      <Step title="Debug the portal">
        <p>
          Vite serves source maps, so you can set breakpoints in your browser's developer tools against the original{' '}
          <code>.jsx</code> files. The Network tab shows every <code>/api</code> call and its response.
        </p>
      </Step>
    </Page>
  )
}

function Testing() {
  return (
    <Page title="Testing" lede="Unit tests for the backend, and an end-to-end check of the whole flow.">
      <Step title="Unit tests">
        <CodeBlock label="Tax math, auth, validation, similarity, batch scheduling, agency mock">make test</CodeBlock>
      </Step>
      <Step title="End-to-end smoke test">
        <CodeBlock label="Against the running dev backend">make smoke</CodeBlock>
        <p>
          The smoke test signs in as both demo users, files both forms, checks the security responses, waits for the
          returns to be transmitted and updated by batch runs, and confirms the duplicate return is held. It resets
          those users' returns first.
        </p>
        <p>
          The same script runs against the other modes: <code>make smoke-integration</code> for Docker and{' '}
          <code>make k8s-smoke</code> for Kubernetes.
        </p>
      </Step>
      <Step title="Admin console">
        <CodeBlock label="Access control, status changes at the agency, releasing holds">make smoke-admin</CodeBlock>
        <p>
          Signs in as a taxpayer and the admin, changes a return's status at the mock agency, waits for batch runs to
          sync each change, and releases a return held by duplicate screening. Pass another address with{' '}
          <code>scripts/admin-smoke-test.sh http://localhost:8088</code>.
        </p>
      </Step>
    </Page>
  )
}

function Integration() {
  return (
    <Page
      title="Integration Mode"
      lede="Run the same containers Kubernetes uses, in Docker Compose, before you deploy."
    >
      <p>
        Integration mode runs nginx serving the built portal; the API, processor, batch scheduler, and two agency mocks
        as separate containers; Postgres; and Jaeger. No Go or Node toolchain is used; everything is built in Docker.
      </p>
      <Step n="1" title="Start the stack">
        <CodeBlock>make up</CodeBlock>
        <p>
          Open <a href="http://localhost:8088">http://localhost:8088</a>. Jaeger is at{' '}
          <a href="http://localhost:16686">http://localhost:16686</a>.
        </p>
      </Step>
      <Step n="2" title="Check it">
        <CodeBlock label="End-to-end check through nginx">make smoke-integration</CodeBlock>
        <CodeBlock label="Follow logs">make logs</CodeBlock>
      </Step>
      <Step n="3" title="Stop it">
        <CodeBlock label="Stop (keeps data)">make down</CodeBlock>
        <CodeBlock label="Stop and delete the database volume">make clean</CodeBlock>
      </Step>
      <div className="note">
        <strong>One mode at a time.</strong> Dev and integration modes share the same Postgres container and data. Stop
        one before starting the other, or both processors will advance the same returns.
      </div>
    </Page>
  )
}

function Database() {
  return (
    <Page title="Database" lede="Connect to Postgres and see what the system stores.">
      <CodeBlock>psql postgres://taxrefund:taxrefund@localhost:5432/taxrefund</CodeBlock>
      <table className="metrics">
        <thead>
          <tr>
            <th>Table</th>
            <th>Holds</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>users</code>
            </td>
            <td>Accounts, password hashes, lockout state. Only the last 4 digits of the tax ID.</td>
          </tr>
          <tr>
            <td>
              <code>tax_returns</code>
            </td>
            <td>Each return, its calculation, status, and feature vector</td>
          </tr>
          <tr>
            <td>
              <code>return_events</code>
            </td>
            <td>Status history shown on the dashboard</td>
          </tr>
          <tr>
            <td>
              <code>sessions</code>
            </td>
            <td>Hashed session tokens and expiry times</td>
          </tr>
          <tr>
            <td>
              <code>audit_log</code>
            </td>
            <td>Sign-ins, failures, filings, and resets</td>
          </tr>
          <tr>
            <td>
              <code>batch_runs</code>
            </td>
            <td>One row per batch run and shard: outcome, counts, and trace ID</td>
          </tr>
        </tbody>
      </table>

      <section>
        <h2>See the batch runs</h2>
        <CodeBlock>{`SELECT id, jurisdiction, status, returns_checked, status_changes, chunks_failed, trace_id
FROM batch_runs ORDER BY id DESC LIMIT 10;`}</CodeBlock>
        <p>
          Paste a <code>trace_id</code> into Jaeger's search box to open that run. Each in-flight return's{' '}
          <code>last_checked_at</code> and <code>next_check_at</code> show the schedule at work.
        </p>
      </section>

      <section>
        <h2>See the duplicate check</h2>
        <p>This query finds each return's closest return from another taxpayer, the same way the processor does:</p>
        <CodeBlock>{NEAREST_SQL}</CodeBlock>
        <p>
          A distance under <code>SIMILARITY_THRESHOLD</code> (default 0.02) is what sends a return to Action needed.
        </p>
      </section>
    </Page>
  )
}

function Changes() {
  return (
    <Page title="Common Changes" lede="Where to make the changes you're most likely to need.">
      <dl className="trouble">
        <dt>Change the database schema</dt>
        <dd>
          Add a new file such as <code>002_add_column.sql</code> to <code>backend/internal/store/migrations/</code>.
          Migrations run in file-name order on the next backend start, each exactly once. Don't edit files that have
          already been applied.
        </dd>
        <dt>Add a demo user</dt>
        <dd>
          Add an entry to <code>backend/internal/store/demo-users.json</code> and restart the backend. Set{' '}
          <code>"role": "admin"</code> for another admin. Demo accounts are updated to match the file, including
          passwords, every time the backend starts.
        </dd>
        <dt>Change the tax math</dt>
        <dd>
          Edit <code>backend/internal/tax/</code> and update <code>tax_test.go</code>. The portal shows whatever the
          server calculates.
        </dd>
        <dt>Change the portal</dt>
        <dd>
          Pages are in <code>frontend/src/pages/</code> and the API client is <code>frontend/src/api.js</code>. Changes
          show up in the browser as soon as you save.
        </dd>
        <dt>Start with an empty database</dt>
        <dd>
          Run <code>make reset-db</code>. It wipes every table and re-seeds the demo accounts, while dev mode or the
          Docker stack keeps running. To clear just one tester's returns, use <strong>Reset demo returns</strong> in the
          portal.
        </dd>
      </dl>
    </Page>
  )
}

function Configuration() {
  return (
    <Page title="Configuration" lede="The backend reads environment variables. These are the ones you're most likely to change.">
      <table className="metrics">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Dev default</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>BATCH_INTERVAL_SECONDS</code>
            </td>
            <td>15</td>
            <td>Time between batch runs</td>
          </tr>
          <tr>
            <td>
              <code>RECHECK_INTERVAL_SECONDS</code>
            </td>
            <td>10</td>
            <td>How soon an in-flight return is due again after a check</td>
          </tr>
          <tr>
            <td>
              <code>AGENCY_APPROVE_AFTER_SECONDS</code>, <code>AGENCY_SEND_AFTER_SECONDS</code>
            </td>
            <td>20, 45</td>
            <td>When the mock agencies approve and send a refund, after transmission</td>
          </tr>
          <tr>
            <td>
              <code>AGENCY_ERROR_RATE</code>
            </td>
            <td>0.05</td>
            <td>Fraction of mock status calls that fail, to exercise retries</td>
          </tr>
          <tr>
            <td>
              <code>OTEL_EXPORTER_OTLP_ENDPOINT</code>
            </td>
            <td>
              localhost:4318 with <code>make</code>
            </td>
            <td>Where traces go. Unset turns tracing off.</td>
          </tr>
          <tr>
            <td>
              <code>SIMILARITY_THRESHOLD</code>
            </td>
            <td>0.02</td>
            <td>Cosine distance that counts as a duplicate</td>
          </tr>
          <tr>
            <td>
              <code>SESSION_TTL_MINUTES</code>
            </td>
            <td>30</td>
            <td>Idle time before you're signed out</td>
          </tr>
          <tr>
            <td>
              <code>TRUSTED_PROXIES</code>
            </td>
            <td>Loopback and private ranges</td>
            <td>Proxies whose <code>X-Forwarded-For</code> entries are believed when finding the client's address</td>
          </tr>
          <tr>
            <td>
              <code>DATABASE_URL</code>
            </td>
            <td>localhost:5432</td>
            <td>Point the backend at a different Postgres</td>
          </tr>
          <tr>
            <td>
              <code>POSTGRES_PORT</code>
            </td>
            <td>5432</td>
            <td>
              Host port for the Postgres container (<code>make dev-db</code>, <code>make up</code>)
            </td>
          </tr>
          <tr>
            <td>
              <code>API_URL</code> (portal)
            </td>
            <td>localhost:8080</td>
            <td>
              Where Vite proxies <code>/api</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p>Set them for one command, for example:</p>
      <CodeBlock>AGENCY_ERROR_RATE=0.5 make dev-backend</CodeBlock>
      <p>
        The full list is in <code>backend/README.md</code>.
      </p>
    </Page>
  )
}

function Troubleshooting() {
  return (
    <Page title="Troubleshooting" lede="Fixes for the problems you're most likely to hit.">
      <dl className="trouble">
        <dt>Port 5432 is already in use</dt>
        <dd>
          Another Postgres is running. Stop it, or use a different port for both Postgres and the backend:{' '}
          <code>POSTGRES_PORT=55432 make dev-db</code>, then run the backend with{' '}
          <code>DATABASE_URL=postgres://taxrefund:taxrefund@localhost:55432/taxrefund?sslmode=disable</code>.
        </dd>
        <dt>Port 5180 or 8080 is already in use</dt>
        <dd>
          An earlier <code>make dev</code> may still be running. Find it with{' '}
          <code>lsof -nP -iTCP:5180 -sTCP:LISTEN</code> and stop it.
        </dd>
        <dt>Sign-in fails with "Request failed (502)" or similar</dt>
        <dd>
          The backend isn't reachable. Check that <code>curl localhost:8080/api/healthz</code> answers, and look at the
          backend's output for errors.
        </dd>
        <dt>Returns stay in Received</dt>
        <dd>
          The processor isn't running, or can't reach the agency mocks. <code>make dev-backend</code> runs both; with{' '}
          <code>taxrefund serve</code> alone, nothing transmits.
        </dd>
        <dt>Returns stay in Processing</dt>
        <dd>
          Batch runs aren't happening or are failing. Look for <code>batch run finished</code> lines in the backend
          output, or query <code>batch_runs</code>. A <em>partial</em> run hit agency errors and retries next time.
        </dd>
        <dt>Port 4318 or 16686 is already in use</dt>
        <dd>
          Another Jaeger or OpenTelemetry Collector is running. Stop it, or point the backend at it with{' '}
          <code>OTEL_EXPORTER_OTLP_ENDPOINT</code>.
        </dd>
        <dt>Sign-in says to wait 15 minutes</dt>
        <dd>
          Five wrong passwords lock an account for 15 minutes. Wait, or clear the lock in the database:{' '}
          <code>UPDATE users SET failed_logins = 0, locked_until = NULL;</code>
        </dd>
      </dl>
    </Page>
  )
}

export const localDevelopmentPages = {
  'local-development': QuickStart,
  'dev-setup': Setup,
  'dev-run': Run,
  'dev-debugging': Debugging,
  'dev-testing': Testing,
  'dev-integration': Integration,
  'dev-database': Database,
  'dev-changes': Changes,
  'dev-configuration': Configuration,
  'dev-troubleshooting': Troubleshooting,
}
