# Tax Refund Status

A system that lets taxpayers check the status of their most recent tax refund after filing, designed for ~40 million customers a season. This repo holds the design documentation and a working demo: a taxpayer signs in, files a sample federal Form 1040 and California Form 540, and watches each refund move through processing as batch runs check with the (mock) IRS and California FTB. Every service is traced with OpenTelemetry and Jaeger.

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
                                                    └──> agency-irs, agency-ca-ftb (mock agency APIs)
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

### Check it works

```bash
make smoke
```

Use `make smoke-integration` or `make k8s-smoke` for the other modes, and `make smoke-admin` (or `scripts/admin-smoke-test.sh <url>`) for the admin console. The script signs in, files both forms, checks the validation and security responses, waits for transmission and batch status runs, and confirms that a second taxpayer filing an identical return with the same bank account is held.

## The demo workflow

1. **Sign in** with a seeded demo account. Accounts are in [`backend/internal/store/demo-users.json`](backend/internal/store/demo-users.json).
2. **File Form 1040, then CA Form 540.** Use **Use sample W-2** to fill realistic numbers, **Review** to see the server-side calculation, then **Submit return**.
3. **Track status.** Within seconds the processor transmits each return to its agency (**Processing**). From then on, status comes from batch runs that ask the agency in bulk: **Approved**, then **Refund sent** (or **Accepted** when nothing is refunded). Each card shows when the agency was last checked.
4. **See fraud screening.** Sign in as the second demo user and file a CA 540 with the same figures and bank account. The processor's pgvector nearest-neighbour check holds it as **Action needed** before it's transmitted.
5. **Change a status yourself.** In a private window, sign in as `demo-admin@interview.com` (password in the same seed file). The admin console at `/admin` lets you play the IRS or California FTB: set any transmitted return to Processing, Approved (with a payment date), Refund sent, Accepted, or Action required, and release returns held by duplicate screening. The change is made at the mock agency; the taxpayer sees it after the next batch run.
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
