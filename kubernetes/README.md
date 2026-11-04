# Kubernetes

Kustomize manifests that run the full stack in the `tax-refund` namespace.

```bash
make k8s-deploy
```

```bash
make k8s-forward
```

Then open http://localhost:8090. For traces, run `make k8s-jaeger` and open http://localhost:16687. `make k8s-deploy` builds both images with a unique timestamp tag and applies a generated overlay (`build/k8s/`, gitignored) that points at that tag. Unique tags matter: a cluster node won't pick up a rebuilt image under a tag it already has.

Defaults to Docker Desktop's built-in cluster, which can run locally built images. For another cluster, push the images to a registry it can pull from and set `K8S_CONTEXT=...`.

## What gets deployed

| Workload | Replicas | Notes |
| --- | --- | --- |
| `postgres` StatefulSet | 1 | `pgvector/pgvector:pg17`, 1 Gi PVC |
| `backend` Deployment | 2 | `taxrefund serve`. An init container runs `taxrefund migrate` (advisory-locked, so concurrent pods are safe). |
| `processor` Deployment | 2 | `taxrefund process`: duplicate screening, then transmission to the agency. Leases and `SKIP LOCKED` mean replicas never transmit the same return. |
| `batch-federal`, `batch-ca`, `batch-ny` CronJobs | 2 shards per run | `taxrefund batch-run <jurisdiction>` every minute as an Indexed Job; each pod checks its hash shard. `concurrencyPolicy: Forbid`. |
| `agency-irs`, `agency-ca-ftb`, `agency-ny-dtf` Deployments | 1 each | Mock agency APIs (`taxrefund agency`) |
| `jaeger` Deployment | 1 | Jaeger 2 all-in-one, in-memory; receives OTLP on 4318 |
| `frontend` Deployment | 2 | nginx serving the portal and proxying `/api` to the `backend` Service |

## Hardening

- The namespace enforces the **restricted** Pod Security Standard. Every container runs as non-root with a read-only root filesystem, with all capabilities dropped, no privilege escalation, and the `RuntimeDefault` seccomp profile.
- **NetworkPolicies:** default-deny ingress, then only frontend → backend:8080; backend, processor, and batch → postgres:5432; processor and batch → agencies:9100; any pod → jaeger:4318.
- No service account tokens are mounted. Resource requests and memory limits are set on every container.
- Readiness probes on `/api/readyz` keep the backend out of rotation until it can reach the database.

## Demo secrets

`kustomization.yaml` generates `app-secrets` from literal values, so the demo runs out of the box. A real deployment would source them from a secret manager (External Secrets, Sealed Secrets, Vault) and set `COOKIE_SECURE=true` behind a TLS ingress.

## Useful commands

```bash
make k8s-status
```

```bash
make k8s-batch
```

```bash
make k8s-jaeger
```

```bash
kubectl --context docker-desktop -n tax-refund logs -l app.kubernetes.io/name=processor -f
```

```bash
make k8s-delete
```
