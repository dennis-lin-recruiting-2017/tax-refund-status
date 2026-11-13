import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'
import { GuideContents, GuideNav, Step } from '../components/Guide.jsx'

const CTX = 'kubectl --context docker-desktop -n tax-refund'

function Page({ title, lede, children }) {
  return (
    <>
      <p className="eyebrow">Local Kubernetes</p>
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
      title="Local Kubernetes"
      lede="Run the whole system on a Kubernetes cluster on your own machine: the portal, the Go API, the processor, batch status runs against mock IRS and California agencies, Postgres with pgvector, and Jaeger."
    >
      <p>
        This is the quickest way to see the real system. Everything is built inside Docker, so you don't need Go or
        Node installed. To change the code, use <Link to="/demo/local-development">Local Development</Link> instead.
      </p>

      <div className="requirements">
        <strong>You need:</strong> Docker Desktop with Kubernetes turned on, kubectl, make, and git. See{' '}
        <Link to="/demo/local-kubernetes/setup">Setup</Link> if you don't have them yet.
      </div>

      <h2>Quick start</h2>
      <Step n="1" title="Get the code">
        <CodeBlock>{`git clone https://github.com/<owner>/tax-refund-status.git
cd tax-refund-status`}</CodeBlock>
      </Step>
      <Step n="2" title="Deploy">
        <CodeBlock>make k8s-deploy</CodeBlock>
        <p>The first run takes a few minutes while base images download.</p>
      </Step>
      <Step n="3" title="Open the portal">
        <CodeBlock>make k8s-forward</CodeBlock>
        <p>
          Leave that running, open <a href="http://localhost:8090">http://localhost:8090</a>, and sign in as{' '}
          <code>tester00@test.com</code> with the password <code>test</code>. Sign in as <code>admin@test.com</code>{' '}
          (same password) for the <Link to="/demo/admin-console">admin console</Link>.
        </p>
      </Step>
      <Step n="4" title="Watch the traces">
        <CodeBlock>make k8s-jaeger</CodeBlock>
        <p>
          In another terminal. Then open <a href="http://localhost:16687">http://localhost:16687</a>.
        </p>
      </Step>
      <Step n="5" title="Remove it when you're done">
        <CodeBlock>make k8s-delete</CodeBlock>
      </Step>

      <GuideContents />
    </Page>
  )
}

function Setup() {
  return (
    <Page title="Setup" lede="Install the tools, turn on Kubernetes, and get the code. You only do this once.">
      <Step n="1" title="Install the prerequisites">
        <ul className="checks">
          <li>
            <strong>Docker Desktop</strong> with at least 4 GB of memory available (Settings → Resources).
          </li>
          <li>
            <strong>kubectl</strong>. Docker Desktop installs it, or use <code>brew install kubectl</code>.
          </li>
          <li>
            <strong>make</strong> and <strong>git</strong>. On macOS both come with the Xcode command line tools:{' '}
            <code>xcode-select --install</code>.
          </li>
        </ul>
      </Step>

      <Step n="2" title="Turn on Kubernetes in Docker Desktop">
        <p>
          Open Docker Desktop → <strong>Settings → Kubernetes</strong>, check <strong>Enable Kubernetes</strong>, and
          click <strong>Apply</strong>. Either cluster type (kind or kubeadm) works. Wait until the Kubernetes status in
          the footer turns green, then check the cluster responds:
        </p>
        <CodeBlock>kubectl --context docker-desktop get nodes</CodeBlock>
        <p>
          You should see one node with status <code>Ready</code>.
        </p>
      </Step>

      <Step n="3" title="Get the code">
        <CodeBlock>{`git clone https://github.com/<owner>/tax-refund-status.git
cd tax-refund-status`}</CodeBlock>
        <p>Run every command in this guide from the repository root.</p>
      </Step>
    </Page>
  )
}

function Deploy() {
  return (
    <Page title="Deploy & Access" lede="Build the images, deploy them, and open the portal.">
      <Step n="1" title="Deploy">
        <CodeBlock>make k8s-deploy</CodeBlock>
        <p>The first run takes a few minutes while base images download. This command:</p>
        <ol>
          <li>
            Builds the <code>tax-refund-backend</code> and <code>tax-refund-frontend</code> images with a unique
            timestamp tag. A cluster won't pick up a rebuilt image under a tag it already has, so every deploy gets a
            new one.
          </li>
          <li>
            Writes a small kustomize overlay to <code>build/k8s/</code> that points at that tag, and applies it with
            the manifests in <code>kubernetes/</code>.
          </li>
          <li>
            Waits until Postgres, Jaeger, the two agency mocks, the backend, the processor, and the frontend are all
            ready. The batch CronJobs start on the next minute.
          </li>
        </ol>
        <p>
          Everything goes into the <code>tax-refund</code> namespace. Check on it at any time:
        </p>
        <CodeBlock>make k8s-status</CodeBlock>
      </Step>

      <Step n="2" title="Open the portal">
        <p>Forward the portal to your machine. This keeps running in the terminal, so leave it open:</p>
        <CodeBlock>make k8s-forward</CodeBlock>
        <p>
          Then open <a href="http://localhost:8090">http://localhost:8090</a>.
        </p>
        <div className="note">
          <strong>Redeployed?</strong> A port-forward is attached to one pod, so it stops when that pod is replaced.
          Run <code>make k8s-forward</code> again.
        </div>
      </Step>

      <Step n="3" title="Open Jaeger">
        <p>In a second terminal, forward the Jaeger UI:</p>
        <CodeBlock>make k8s-jaeger</CodeBlock>
        <p>
          Then open <a href="http://localhost:16687">http://localhost:16687</a>. It uses 16687 so it doesn't clash with
          the Docker Jaeger on 16686.
        </p>
      </Step>

      <Step n="4" title="Deploy again after a change">
        <p>
          Run <code>make k8s-deploy</code> again. It builds new images with a new tag and rolls them out one pod at a
          time. Your data in Postgres is kept.
        </p>
      </Step>
    </Page>
  )
}

function Workflow() {
  return (
    <Page title="Try the Workflow" lede="Walk through what a taxpayer does, and see the fraud screening work.">
      <ol className="points">
        <li>
          <strong>Sign in</strong> with the password <code>test</code> as <code>tester00@test.com</code> through{' '}
          <code>tester09@test.com</code> (federal and California) or <code>tester10@test.com</code> through{' '}
          <code>tester19@test.com</code> (federal and New York). tester08, tester09, and tester18 file in both states;
          tester20 to tester22 live or work in states with no income tax.
          Each tester's forms are pre-filled and ready to submit.
        </li>
        <li>
          <strong>File Form 1040.</strong> It opens pre-filled with the tester's W-2 and bank account. Click{' '}
          <strong>Review</strong> to see the server's calculation, then <strong>Submit return</strong>.
        </li>
        <li>
          <strong>File each state return</strong> the same way: CA Form 540 or NY Form IT-201 for a resident, CA 540NR or
          NY IT-203 for a part-year resident or nonresident. File those first: the resident return claims a credit for
          the tax they charge.
        </li>
        <li>
          <strong>Watch the status.</strong> Within seconds the return is sent to the agency (<em>Processing</em>). After
          that, every change comes from a batch run, once a minute: <em>Approved</em> after about a minute, then{' '}
          <em>Refund sent</em>. The card shows when the agency was last checked, and the dashboard updates by itself.
        </li>
        <li>
          <strong>Trigger fraud screening.</strong> Sign in as another tester in the same state and, before submitting,
          type in the first tester's W-2 figures and bank account. A near-identical return with the same bank account
          means the pgvector similarity check holds it as <strong>Action needed</strong> before it's ever sent to the
          agency.
        </li>
        <li>
          <strong>Start over</strong> with <strong>Reset demo returns</strong> at the bottom of the dashboard.
        </li>
        <li>
          <strong>Change a status yourself.</strong> In a private window, sign in as{' '}
          <code>admin@test.com</code> and use the <Link to="/demo/admin-console">admin console</Link> to set
          any return to Approved, Refund sent, Refund adjusted, or Action required at its agency.
        </li>
        <li>
          <strong>Follow it in Jaeger.</strong> With <code>make k8s-jaeger</code> running, open{' '}
          <a href="http://localhost:16687">localhost:16687</a>, choose <code>refund-batch</code>, and click{' '}
          <strong>Find Traces</strong>. Open a run with status changes to see the agency call, any retries, and the
          database writes.
        </li>
      </ol>

      <section>
        <h2>Check it end to end</h2>
        <p>
          With <code>make k8s-forward</code> running, this script signs in, files both forms, checks the security
          responses, waits for processing, and confirms the duplicate is flagged:
        </p>
        <CodeBlock>make k8s-smoke</CodeBlock>
        <p>It resets both demo users' returns before it starts.</p>
      </section>
    </Page>
  )
}

function Operate() {
  return (
    <Page title="Operate & Configure" lede="What's running, how to watch it, and how to change its settings.">
      <section>
        <h2>What's running</h2>
        <table className="metrics">
          <thead>
            <tr>
              <th>Workload</th>
              <th>Replicas</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>frontend</td>
              <td>2</td>
              <td>
                nginx serving the portal and proxying <code>/api</code> to the backend
              </td>
            </tr>
            <tr>
              <td>backend</td>
              <td>2</td>
              <td>Go API. An init container applies database migrations first.</td>
            </tr>
            <tr>
              <td>processor</td>
              <td>2</td>
              <td>Screens new returns for duplicates and transmits them to the agencies</td>
            </tr>
            <tr>
              <td>batch-federal, batch-ca (CronJobs)</td>
              <td>2 shards per run</td>
              <td>Every minute, check due returns with the agency in bulk and store the answers</td>
            </tr>
            <tr>
              <td>agency-irs, agency-ca-ftb, agency-ny-dtf</td>
              <td>1 each</td>
              <td>Mock agency e-file and status APIs. They fail 5% of status calls on purpose.</td>
            </tr>
            <tr>
              <td>jaeger</td>
              <td>1</td>
              <td>Collects traces from every service. In-memory, so traces reset on restart.</td>
            </tr>
            <tr>
              <td>postgres</td>
              <td>1</td>
              <td>Postgres 17 with pgvector, on a 1 Gi volume</td>
            </tr>
          </tbody>
        </table>
        <p>
          Every pod meets the Kubernetes <em>restricted</em> Pod Security Standard: non-root, read-only file system, no
          added capabilities. Network policies only allow frontend → backend → Postgres, processor and batch →
          agencies, and every pod → Jaeger.
        </p>
      </section>

      <section>
        <h2>Batch runs</h2>
        <p>See the recent CronJob runs and what each one did:</p>
        <CodeBlock>make k8s-batch</CodeBlock>
        <p>
          The table shows each run's shard, how many returns it checked and changed, failed chunks, and its trace ID.
          Paste a trace ID into Jaeger's search box to open that run. To start a run now instead of waiting:
        </p>
        <CodeBlock>{`${CTX} create job --from=cronjob/batch-federal batch-federal-manual`}</CodeBlock>
      </section>

      <section>
        <h2>Watch it work</h2>
        <CodeBlock label="Processor logs, including flagged duplicates">
          {`${CTX} logs -l app.kubernetes.io/name=processor -f`}
        </CodeBlock>
        <CodeBlock label="API request logs, with trace IDs">{`${CTX} logs -l app.kubernetes.io/name=backend -f`}</CodeBlock>
        <CodeBlock label="Batch run logs">{`${CTX} logs -l app.kubernetes.io/name=batch --tail=20`}</CodeBlock>
        <CodeBlock label="Query the database">
          {`${CTX} exec -it postgres-0 -- \\
  psql -U taxrefund -c "SELECT form, status, status_reason FROM tax_returns ORDER BY submitted_at;"`}
        </CodeBlock>
      </section>

      <section>
        <h2>Change settings</h2>
        <p>
          Runtime settings live in <code>kubernetes/kustomization.yaml</code> under <code>configMapGenerator</code>, for
          example <code>RECHECK_INTERVAL_SECONDS</code>, <code>AGENCY_RPS</code>, and <code>BATCH_WORKERS</code>. The
          batch schedule and shard count are in <code>kubernetes/batch.yaml</code>: change <code>schedule</code>, and
          keep <code>completions</code>, <code>parallelism</code>, and <code>BATCH_SHARDS</code> equal. Run{' '}
          <code>make k8s-deploy</code> again to apply.
        </p>
        <div className="note">
          <strong>Demo secrets.</strong> The database password and the key used to fingerprint bank accounts are written
          into <code>kustomization.yaml</code> so the demo runs out of the box. A real cluster gets them from a secret
          manager, and runs behind HTTPS with <code>COOKIE_SECURE=true</code>.
        </div>
      </section>
    </Page>
  )
}

function OtherClusters() {
  return (
    <Page title="Other Clusters" lede="Run on kind or minikube instead of Docker Desktop's built-in cluster.">
      <p>
        Docker Desktop's cluster can run images you build locally. Other clusters need the images copied in, which{' '}
        <code>K8S_LOAD</code> does right after the build:
      </p>
      <CodeBlock label="kind">make k8s-deploy K8S_CONTEXT=kind-kind K8S_LOAD="kind load docker-image"</CodeBlock>
      <CodeBlock label="minikube">make k8s-deploy K8S_CONTEXT=minikube K8S_LOAD="minikube image load"</CodeBlock>
      <p>
        Pass the same <code>K8S_CONTEXT</code> to <code>make k8s-forward</code>, <code>make k8s-status</code>, and{' '}
        <code>make k8s-delete</code>. Find your context name with{' '}
        <code>kubectl config get-contexts</code>.
      </p>
      <p>
        For a remote cluster, push both images to a registry the cluster can pull from, and point the{' '}
        <code>images</code> section of <code>kubernetes/kustomization.yaml</code> at it.
      </p>
    </Page>
  )
}

function Troubleshooting() {
  return (
    <Page title="Troubleshooting" lede="Fixes for the problems you're most likely to hit.">
      <dl className="trouble">
        <dt>
          Pods stuck in <code>ErrImageNeverPull</code> or <code>ImagePullBackOff</code>
        </dt>
        <dd>
          The cluster can't see your local images. On Docker Desktop, make sure the context is{' '}
          <code>docker-desktop</code>. On other clusters, set <code>K8S_LOAD</code> as shown in{' '}
          <Link to="/demo/local-kubernetes/other-clusters">Other Clusters</Link>.
        </dd>
        <dt>
          Pods stuck in <code>Pending</code>
        </dt>
        <dd>
          Usually not enough memory. Give Docker Desktop more under Settings → Resources, and see why with{' '}
          <code>{CTX} describe pod &lt;name&gt;</code>.
        </dd>
        <dt>
          <code>make k8s-forward</code> says the address is already in use
        </dt>
        <dd>
          Something else is using port 8090. Forward to another port instead:{' '}
          <code>{CTX} port-forward svc/frontend 9090:80</code>.
        </dd>
        <dt>The portal stopped responding after a deploy</dt>
        <dd>
          The port-forward was attached to a pod that has been replaced. Stop it and run <code>make k8s-forward</code>{' '}
          again.
        </dd>
        <dt>Sign-in says to wait 15 minutes</dt>
        <dd>
          Five wrong passwords lock an account for 15 minutes. Wait it out, or start fresh with{' '}
          <code>make k8s-delete</code> and <code>make k8s-deploy</code>.
        </dd>
        <dt>Returns stay in Processing</dt>
        <dd>
          The batch runs aren't succeeding. Run <code>make k8s-batch</code>: if jobs show <em>Failed</em>, read a pod's
          logs with <code>{CTX} logs -l app.kubernetes.io/name=batch --tail=50</code>. A run marked{' '}
          <em>partial</em> hit agency errors and will retry on the next run.
        </dd>
        <dt>A few failed batch jobs right after a deploy</dt>
        <dd>
          Runs that started during the rollout can fail; the next minute's run picks up their work. Kubernetes keeps
          the last three failed jobs for inspection.
        </dd>
        <dt>Jaeger shows no traces</dt>
        <dd>
          Traces arrive a few seconds after a span ends. Check the jaeger pod is running with{' '}
          <code>make k8s-status</code>. Jaeger keeps traces in memory, so they're gone after it restarts.
        </dd>
      </dl>
    </Page>
  )
}

function Cleanup() {
  return (
    <Page title="Clean Up" lede="Remove the deployment and free up disk space.">
      <Step title="Remove the deployment">
        <p>This deletes the namespace and everything in it, including the database volume:</p>
        <CodeBlock>make k8s-delete</CodeBlock>
      </Step>
      <Step title="Remove old images">
        <p>
          Each deploy leaves a tagged image on your machine. List them, then remove the ones you no longer need with{' '}
          <code>docker image rm &lt;name&gt;:&lt;tag&gt;</code>, or delete them from Docker Desktop's Images tab:
        </p>
        <CodeBlock>docker image ls 'tax-refund-*'</CodeBlock>
      </Step>
      <Step title="Turn off Kubernetes (optional)">
        <p>
          To free the memory Kubernetes uses, uncheck <strong>Enable Kubernetes</strong> in Docker Desktop → Settings →
          Kubernetes.
        </p>
      </Step>
    </Page>
  )
}

export const localKubernetesPages = {
  'local-kubernetes': QuickStart,
  'k8s-setup': Setup,
  'k8s-deploy': Deploy,
  'k8s-workflow': Workflow,
  'k8s-operate': Operate,
  'k8s-other-clusters': OtherClusters,
  'k8s-troubleshooting': Troubleshooting,
  'k8s-cleanup': Cleanup,
}
