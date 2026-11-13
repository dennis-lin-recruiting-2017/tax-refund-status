# Backend

A single Go binary, `taxrefund`, with subcommands:

| Command | What it runs |
| --- | --- |
| `serve` | JSON API on `:8080`. Runs migrations first unless `MIGRATE_ON_START=false`. |
| `process` | Screens new returns with the pgvector duplicate check, then transmits them to their agency. |
| `batch-run [jurisdiction]` | One batch status run (all jurisdictions if none given), then exits. Used by the Kubernetes CronJobs. |
| `batch-schedule` | Batch runs every `BATCH_INTERVAL_SECONDS`. Used by dev mode and Docker Compose. |
| `agency` | A mock tax agency API: `AGENCY=irs`, `ca-ftb`, or `ny-dtf`, on `AGENCY_ADDR`. |
| `migrate` | Applies migrations and seeds demo users, then exits. Used as a Kubernetes init container. |
| `all` | Everything above in one process, including both agency mocks (`:9101`, `:9102`). The default; handy for debugging. |
| `healthcheck [agency]` | Exits 0 if the local API (or agency mock) answers. The distroless image has no curl. |

```bash
go run ./cmd/taxrefund all
```

```bash
go test ./...
```

## Code map

```
cmd/taxrefund/        entry point and subcommands
internal/config/      environment configuration
internal/store/       pgx pool (traced), embedded SQL migrations, demo user seed
internal/auth/        Argon2id passwords, lockout, server-side sessions, rate limiting
internal/api/         HTTP handlers and middleware
internal/tax/         simplified Form 1040 (2025), CA 540/540NR, and NY IT-201/IT-203 calculators
internal/embedding/   return → 16-dim feature vector for similarity search
internal/processor/   duplicate screening and transmission to agencies
internal/batch/       batch status runs: claiming, sharding, scheduling policy
internal/agency/      agency client: bulk status, rate limiting, retries
internal/agencymock/  stateless mock agency API
internal/telemetry/   OpenTelemetry setup (OTLP to Jaeger)
```

## API

All routes are under `/api`. Every non-GET request must send `X-Requested-With: fetch`.

| Method and path | Purpose |
| --- | --- |
| `POST /auth/login` | `{email, password}`. Sets the `sid` session cookie. |
| `POST /auth/logout` | Ends the session. |
| `GET /auth/me` | The signed-in user. |
| `GET /returns` | The user's returns, each with its status history and calculation. |
| `GET /drafts/{form}` | A demo account's pre-filled form (from the seed file), ready to submit. |
| `POST /returns/{form}/estimate` | Calculates without saving. `form` is `1040`, `540`, `540NR`, `IT-201`, or `IT-203`; a state form must match the user's residency there. |
| `POST /returns/{form}` | Files the return. Returns 409 if one is already filed for that state and year, or if a resident return is filed before the user's part-year and nonresident returns. |
| `DELETE /returns` | Deletes the user's returns (demo reset). |
| `GET /admin/returns?q=` | Admin: newest 100 returns with taxpayer, our status, and the agency's live status. |
| `PUT /admin/returns/{id}/agency-status` | Admin: `{status, paymentDate, refundAmount, amountOwed, message}` set at the mock agency, then synced to the taxpayer immediately. |
| `DELETE /admin/returns/{id}/agency-status` | Admin: back to the agency's automatic timeline. |
| `POST /admin/returns/{id}/check-now` | Admin: check the return with its agency now. |
| `POST /admin/returns/{id}/release` | Admin: clear a duplicate-screening hold; the processor transmits without re-screening. |
| `GET /healthz`, `GET /readyz` | Liveness, and readiness (checks the database). |

## Security choices

- **Passwords:** Argon2id with OWASP parameters. Unknown emails are verified against a dummy hash so timing doesn't reveal which accounts exist. Every failure returns the same message.
- **Lockout:** 5 failed logins lock an account for 15 minutes. Logins are also rate-limited per IP.
- **Sessions:** random 256-bit tokens. Only their SHA-256 hash is stored. The cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, with a 30-minute sliding expiry.
- **CSRF:** SameSite cookies plus a required custom header, which forces a CORS preflight that the API never approves.
- **Data minimization:** no full tax IDs anywhere. Bank numbers are never stored; only the last 4 digits and a keyed HMAC fingerprint (`BANK_HMAC_KEY`), which the duplicate check uses.
- **Logs and storage:** request bodies are never logged. Sign-ins, failures, filings, resets, and every admin action go to `audit_log`.
- **Admin:** `/api/admin/*` requires a session whose user has the `admin` role. Admins change statuses at the mock agency (with a separate `AGENCY_ADMIN_KEY` that batch and processor never hold), never in our tables directly.
- **Database access:** parameterized queries only. Request bodies are limited to 16 KB and unknown JSON fields are rejected.

## Batch status sync

Agencies own refund status, so the backend asks them, in bulk, on a schedule:

1. `process` transmits each new return to its agency and stores the submission ID, with the return due for its first check.
2. Each batch run (one per jurisdiction and shard) claims due returns in chunks of up to 100 with a lease and `FOR UPDATE SKIP LOCKED`, calls the agency's bulk status endpoint, and stores each status with its next due time (`next_check_at`). Final statuses are never checked again; approved refunds wait for their payment date.
3. Every run writes a `batch_runs` row with its outcome and trace ID.

Agency calls are rate-limited per agency (`AGENCY_RPS`, split across shards) and retried on 429/5xx with backoff, honouring `Retry-After`. A run stops early after 5 failed chunks. The design, with sizing for 40M customers, is on the docs site under **Architecture → Batch Status Sync**.

## Tracing

Set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://localhost:4318`) to export OpenTelemetry traces. Each command reports as its own service (`refund-api`, `refund-processor`, `refund-batch`, `agency-irs`, `agency-ca-ftb`), and trace context flows to the agencies through the `traceparent` header. Database spans include SQL text but never parameter values.

## Duplicate screening with pgvector

Fraud rings file templated returns under stolen identities and route the refunds into one bank account. Each return is stored with a 16-dimension unit vector describing its figures (income, withholding, filing status, dependents, tax, refund) and a keyed HMAC fingerprint of its bank account. When the processor picks up a new return, it looks only at *other* taxpayers' returns paying into the *same* account, and asks pgvector for the closest one:

```sql
SELECT features <=> $1 FROM tax_returns
WHERE user_id <> $2 AND jurisdiction = $3 AND bank_fingerprint = $4
ORDER BY features <=> $1 LIMIT 1;
```

If the cosine distance is below `SIMILARITY_THRESHOLD` (default 0.02), the return goes to **Action needed** for identity verification and is not transmitted.

The bank account is an exact match rather than part of the vector on purpose. Hashed account bytes are effectively random, so mixing them into the vector let two *different* accounts land close together, and honest filers with similar incomes were held as duplicates. `internal/api/demo_drafts_test.go` guards the demo accounts against this, and `internal/embedding/embedding_test.go` checks that templated figures are close and different households are far apart.

Returns are claimed with a lease and `FOR UPDATE SKIP LOCKED`, so any number of processor replicas can run.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `dev` | `dev` allows built-in defaults for the two secrets below. |
| `DATABASE_URL` | dev: `postgres://taxrefund:taxrefund@localhost:5432/taxrefund` | Required outside dev. |
| `BANK_HMAC_KEY` | dev: built-in | Required outside dev; 16+ bytes. |
| `ADDR` | `:8080` | |
| `SESSION_TTL_MINUTES` | `30` | |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `TRUSTED_PROXIES` | loopback and private ranges | Comma-separated CIDRs whose `X-Forwarded-For` entries are believed when finding the client's address for sign-in rate limits and the audit log. In production, list only your load balancers and the portal's pods. |
| `MIGRATE_ON_START` | `true` | |
| `SEED_DEMO_USERS` | `true` | |
| `PROCESSOR_INTERVAL_MS` | `2000` | How often the processor looks for new returns. |
| `SIMILARITY_THRESHOLD` | `0.02` | Cosine distance. |
| `SUBMIT_RPS` | `10` | Transmissions per second to each agency, shared by every processor replica. |
| `BATCH_INTERVAL_SECONDS` | `15` | Time between runs for `batch-schedule`. |
| `BATCH_CHUNK_SIZE` | `100` | Submission IDs per agency request (max 100). |
| `BATCH_WORKERS` | `4` | Concurrent chunks per shard. |
| `BATCH_SHARDS` / `BATCH_SHARD_INDEX` | `1` / `0` | Index falls back to `JOB_COMPLETION_INDEX` (Kubernetes Indexed Jobs). |
| `BATCH_LEASE_SECONDS` | `120` | How long a claimed chunk is reserved. |
| `RECHECK_INTERVAL_SECONDS` | `10` | How soon an in-flight return is due again. Hours in production. |
| `AGENCY_IRS_URL`, `AGENCY_CA_FTB_URL`, `AGENCY_NY_DTF_URL` | dev: `localhost:9101`, `:9102`, `:9103` | Required outside dev. |
| `AGENCY_API_KEY` | dev: built-in | Required outside dev. |
| `AGENCY_ADMIN_KEY` | dev: built-in | Mock agency operator endpoints (admin console). |
| `AGENCY_RPS` | `20` | Per agency, divided across shards. |
| `AGENCY`, `AGENCY_ADDR` | `irs`, `:9100` | Mock agency identity and listen address. With `DATABASE_URL` set, the mock keeps admin overrides in the `agency_mock` schema. |
| `AGENCY_PROCESS_AFTER_SECONDS` / `_APPROVE_AFTER_` / `_SEND_AFTER_` | `5` / `20` / `45` | Mock agency timing after transmission. |
| `AGENCY_ERROR_RATE` | `0.05` | Fraction of mock status calls that fail with 503. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Turns on tracing. |
| `TRACE_SAMPLE_RATIO` | `1` | Fraction of new traces kept. |
