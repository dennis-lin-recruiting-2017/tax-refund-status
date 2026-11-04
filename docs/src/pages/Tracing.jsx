import { Link } from 'react-router-dom'
import CodeBlock from '../components/CodeBlock.jsx'
import TracingDiagram from './TracingDiagram.jsx'

const SAMPLE_TRACE = `refund-batch   batch.run ca-ftb                            1129 ms  checked=1 changed=1 status=succeeded
refund-batch   ├─ INSERT batch_runs                            1 ms
refund-batch   ├─ UPDATE tax_returns (claim chunk)             2 ms
refund-batch   └─ batch.chunk                               1123 ms  chunk_size=1 status_changes=1
refund-batch      ├─ HTTP POST                                62 ms  503
agency-ca-ftb     │  └─ POST /v1/statuses/batch-get           62 ms  503 simulated_error=true
refund-batch      ├─ HTTP POST  (retry after Retry-After: 1s)  58 ms  200
agency-ca-ftb     │  └─ POST /v1/statuses/batch-get           58 ms  200 batch_size=1
refund-batch      ├─ BEGIN
refund-batch      ├─ batch: UPDATE, UPDATE, INSERT return_events
refund-batch      └─ COMMIT`

export default function Tracing() {
  return (
    <>
      <p className="eyebrow">Operations</p>
      <h1>Distributed Tracing</h1>
      <p className="lede">
        Every service reports OpenTelemetry traces to Jaeger, so one request or one batch run can be followed across the
        API, the workers, Postgres, and the agencies.
      </p>

      <section>
        <h2>How a trace is made</h2>
        <p>
          Follow one trace from the first span to finding it in Jaeger. Each step highlights the spans it creates in the
          waterfall under the diagram. Turn on <strong>Production pipeline</strong> to see the Collector added in front of
          Jaeger.
        </p>
        <TracingDiagram />
      </section>

      <section>
        <h2>What's traced</h2>
        <table className="metrics">
          <thead>
            <tr><th>Service</th><th>Spans</th></tr>
          </thead>
          <tbody>
            <tr><td><code>refund-api</code></td><td>Every API request (method and path), and its Postgres queries</td></tr>
            <tr><td><code>refund-processor</code></td><td>One trace per return transmitted: duplicate screening, the agency submit, the status update</td></tr>
            <tr><td><code>refund-batch</code></td><td>One trace per batch run: claims, each chunk, each agency call and retry, and the writes</td></tr>
            <tr><td><code>agency-irs</code>, <code>agency-ca-ftb</code>, <code>agency-ny-dtf</code></td><td>The agency's side of each call, joined to the caller's trace</td></tr>
          </tbody>
        </table>
        <p>
          Trace context travels between services in the W3C <code>traceparent</code> header, which the Go HTTP client
          and server instrumentation add and read automatically. That's how an agency's span appears inside the batch
          run that called it.
        </p>
      </section>

      <section>
        <h2>A batch run, end to end</h2>
        <p>
          A real trace from the demo. The California FTB mock failed the first status call, the client waited for the{' '}
          <code>Retry-After</code> second, and the retry succeeded, all inside one trace:
        </p>
        <CodeBlock label="Trace for one batch run">{SAMPLE_TRACE}</CodeBlock>
        <p>Useful span attributes for filtering in Jaeger's search:</p>
        <table className="metrics">
          <thead>
            <tr><th>Attribute</th><th>On</th><th>Use it to find</th></tr>
          </thead>
          <tbody>
            <tr><td><code>batch.status</code></td><td>batch.run</td><td><code>partial</code> or <code>failed</code> runs</td></tr>
            <tr><td><code>batch.run_id</code></td><td>batch.run</td><td>The trace for a <code>batch_runs</code> row</td></tr>
            <tr><td><code>batch.chunks_failed</code></td><td>batch.run</td><td>Runs that hit agency errors</td></tr>
            <tr><td><code>agency.simulated_error</code></td><td>agency spans</td><td>The mock's injected failures</td></tr>
            <tr><td><code>screening.flagged</code></td><td>processor.transmit</td><td>Returns held as near-duplicates</td></tr>
            <tr><td><code>error=true</code></td><td>any</td><td>Anything that failed</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>From a batch run to its trace</h2>
        <p>Each run stores its trace ID. Look it up, then paste it into the search box at the top of Jaeger:</p>
        <CodeBlock>{`SELECT id, jurisdiction, status, returns_checked, chunks_failed, trace_id
FROM batch_runs ORDER BY id DESC LIMIT 10;`}</CodeBlock>
        <p>
          API request logs include <code>trace_id</code> too, so a slow or failed request in the logs leads straight to its
          trace.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>Traces are designed to carry no taxpayer data:</p>
        <ul className="checks">
          <li>Database spans include the SQL text but never the parameter values.</li>
          <li>Request and response bodies are never recorded.</li>
          <li>Spans carry opaque IDs (return ID, submission ID, run ID), never names, tax IDs, amounts, or bank details.</li>
          <li>Health checks aren't traced.</li>
        </ul>
        <p>
          Jaeger still deserves the same access controls as logs: it shows which endpoints were called and when.
        </p>
      </section>

      <section>
        <h2>Open Jaeger</h2>
        <table className="metrics">
          <thead>
            <tr><th>Mode</th><th>Jaeger UI</th></tr>
          </thead>
          <tbody>
            <tr><td>Dev and integration (Docker)</td><td><a href="http://localhost:16686">localhost:16686</a></td></tr>
            <tr>
              <td>Local Kubernetes</td>
              <td>
                <code>make k8s-jaeger</code>, then <a href="http://localhost:16687">localhost:16687</a>
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Choose a service such as <code>refund-batch</code> and click <strong>Find Traces</strong>. See{' '}
          <Link to="/demo/local-kubernetes/operate">Operate &amp; Configure</Link> for more.
        </p>
      </section>

      <section>
        <h2>Configuration</h2>
        <table className="metrics">
          <thead>
            <tr><th>Variable</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr><td><code>OTEL_EXPORTER_OTLP_ENDPOINT</code></td><td>Where to send traces (OTLP over HTTP). Unset means tracing is off.</td></tr>
            <tr><td><code>TRACE_SAMPLE_RATIO</code></td><td>Fraction of new traces to keep, 0 to 1. Default 1 (keep all).</td></tr>
            <tr><td><code>OTEL_RESOURCE_ATTRIBUTES</code></td><td>Extra attributes on every span, such as <code>k8s.namespace.name=tax-refund</code></td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>In production</h2>
        <ul className="points">
          <li>
            <strong>Collector in front of Jaeger.</strong> Services send to an OpenTelemetry Collector, which batches,
            drops sensitive attributes as a second line of defence, and forwards to Jaeger.
          </li>
          <li>
            <strong>Tail sampling.</strong> Keep every trace with an error or high latency and every batch run, plus a few
            percent of ordinary requests. Keeping everything at peak would mean hundreds of millions of traces (see{' '}
            <Link to="/technical-design/requirements/non-functional/capacity">Capacity Estimates</Link>).
          </li>
          <li>
            <strong>Durable storage.</strong> Jaeger backed by OpenSearch or Cassandra with a retention period, instead of
            the demo's in-memory store, which loses traces on restart.
          </li>
          <li>
            <strong>Metrics and logs alongside.</strong> Traces explain one run; metrics (run duration, lookups per
            second, overdue returns) drive alerts. See <Link to="/operations/monitoring">Monitoring &amp; Alerting</Link>.
          </li>
        </ul>
      </section>
    </>
  )
}
