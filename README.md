# Tax Refund Status

A system that lets taxpayers check the status of their most recent tax refund after filing, designed for ~40 million customers a season. This repo holds the design documentation and a working demo: a taxpayer signs in, files a federal Form 1040 and a California Form 540 or New York Form IT-201, and watches each refund move through processing as batch runs check with the (mock) IRS, California FTB, and New York DTF. Every service is traced with OpenTelemetry and Jaeger.

## Layout

| Directory | What's in it |
| --- | --- |
| [`docs/`](docs/) | The system design site: a React SPA published to GitHub Pages. |
| [`frontend/`](frontend/) | The taxpayer portal: React + Vite, served by nginx in containers. |
| [`backend/`](backend/) | One Go binary: the API, processor, batch status runs, and mock agencies. |
| [`kubernetes/`](kubernetes/) | Kustomize manifests for the full stack. |
| [`scripts/`](scripts/) | `smoke-test.sh`, an end-to-end API check that works against any mode. |

```
browser ──> frontend (nginx or Vite) ──/api──> API (Go: serve) ──────────> Postgres 17 + pgvector
                                               processor (Go: process) ──┤   screens new returns, transmits them
                                               batch runs (Go: batch-*) ─┘   poll agency status in bulk, on a schedule
                                                    │
                                                    └──> agency-irs, agency-ca-ftb, agency-ny-dtf (mock agency APIs)
all services ──OTLP──> Jaeger
```

## Run it

Requires Docker Desktop, Go 1.27+, and Node 22+. Run `make help` for every target. Step-by-step guides with troubleshooting are on the design site under **Demo → Local Kubernetes** and **Demo → Local Development**.

### Dev mode: native processes, easy debugging

Postgres runs in Docker; the Go backend and Vite run directly on your machine, so you can attach a debugger, use hot reload, and read logs in your terminal.

```bash
make install
```

```bash
make dev
```

Open http://localhost:5180, and Jaeger at http://localhost:16686. Or run the pieces separately in three terminals: `make dev-db` (Postgres and Jaeger), `make dev-backend`, `make dev-frontend`. In dev mode the backend runs `taxrefund all` (API, processor, batch scheduler, and both agency mocks in one process) with insecure local defaults (`APP_ENV=dev`).

To debug the backend in an IDE, run `./cmd/taxrefund` with the argument `all` from the `backend/` directory. No environment variables are needed in dev mode.

### Integration mode: everything in Docker

```bash
make up
```

Open http://localhost:8088, and Jaeger at http://localhost:16686. nginx serves the built portal and proxies `/api` to the backend; the processor, batch scheduler, and each agency mock run in their own containers, the same topology as Kubernetes. Use `make logs`, `make down`, or `make clean` (also deletes the database volume).

Dev and integration modes share the same Postgres container and volume, so stop one before running the other's processor.

### Kubernetes

Targets Docker Desktop's built-in cluster (`docker-desktop` context) by default:

```bash
make k8s-deploy
```

```bash
make k8s-forward
```

Open http://localhost:8090. For Jaeger, run `make k8s-jaeger` and open http://localhost:16687. Batch runs are CronJobs; `make k8s-batch` shows recent runs. See [kubernetes/README.md](kubernetes/README.md).

### Start over

```bash
make reset-db
```

Wipes every table (returns, sessions, audit log, admin overrides) and re-seeds the demo accounts. `make k8s-reset-db` does the same on Kubernetes. Both ask for confirmation; run `scripts/reset-db.sh [local|k8s] -y` to skip it.

### Check it works

```bash
make smoke
```

Use `make smoke-integration` or `make k8s-smoke` for the other modes, and `make smoke-admin` (or `scripts/admin-smoke-test.sh <url>`) for the admin console. The script signs in, files both forms, checks the validation and security responses, waits for transmission and batch status runs, and confirms that a second taxpayer filing an identical return with the same bank account is held.

## The demo workflow

1. **Sign in** as `tester00@test.com`–`tester09@test.com` (1040 + CA Form 540) or `tester10@test.com`–`tester19@test.com` (1040 + NY Form IT-201). Every demo account's password is `test`. Accounts are defined in [`backend/internal/store/demo-users.json`](backend/internal/store/demo-users.json) and updated to match it whenever the backend starts.
2. **File both returns.** Each tester's forms open pre-filled with their own W-2 and bank account: click **Review** to see the server-side calculation, then **Submit return**. tester05 and tester15 owe tax; everyone else gets a refund.
3. **Track status.** Within seconds the processor transmits each return to its agency (**Processing**). From then on, status comes from batch runs that ask the agency in bulk: **Approved**, then **Refund sent** (or **Accepted** when nothing is refunded). Each card shows when the agency was last checked.
4. **See fraud screening.** File a return, then sign in as another tester in the same state, replace their W-2 and bank details with the first tester's, and file. Another taxpayer's near-identical return paying into the same bank account is held as **Action needed**. Testers with similar incomes but their own accounts are never flagged. The processor's pgvector nearest-neighbour check holds it as **Action needed** before it's transmitted.
5. **Change a status yourself.** In a private window, sign in as `admin@test.com` (password `test`). The admin console at `/admin` lists every taxpayer who has filed and lets you play the IRS, California FTB, or New York DTF: set a return to Processing, Approved or Refund sent (with a refund amount and date), Accepted (with a balance due), or Action required (with a message), and release returns held by duplicate screening. **Randomize** fills in plausible amounts, dates, and messages. **Send to taxpayer** sets the status at the mock agency and syncs that return immediately, so the taxpayer sees it right away.
6. **Follow a batch run in Jaeger.** Pick the `refund-batch` service, open a run, and see the agency calls, retries, and database writes in one trace.
7. **Reset demo returns** at the bottom of the dashboard to file again.

Tax calculations are simplified illustrations, not tax advice. The IRS and states don't offer a refund status API; the mock agencies stand in for the partner feed this design assumes.

## Design docs

```bash
cd docs
npm install
npm run dev
```

Pushes to `main` that touch `docs/` publish the site through `.github/workflows/deploy.yml`. See [docs/README.md](docs/README.md).
