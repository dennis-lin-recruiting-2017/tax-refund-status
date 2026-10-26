# Dev mode:          make dev           (Postgres in Docker; Go backend and Vite run natively)
# Integration mode:  make up            (everything in Docker Compose)
# Kubernetes:        make k8s-deploy    (Docker Desktop's cluster by default)

SHELL := /bin/bash
K8S_CONTEXT ?= docker-desktop
K8S_NS      ?= tax-refund
KUBECTL      = kubectl --context $(K8S_CONTEXT)
# Unique per build: a cluster node won't refresh a tag it already has, so ":dev" would go stale.
# Computed once (:=), so the build and the deploy use the same tag.
ifndef TAG
TAG         := $(shell date +%Y%m%d%H%M%S)
endif
OVERLAY      = build/k8s
# Command that copies local images into the cluster, for clusters that can't see Docker's
# images (Docker Desktop can). e.g. K8S_LOAD="kind load docker-image" or "minikube image load"
K8S_LOAD    ?=

.PHONY: help dev dev-db dev-backend dev-frontend install test smoke smoke-admin smoke-integration \
        up down logs clean images k8s-deploy k8s-status k8s-forward k8s-jaeger k8s-batch k8s-smoke k8s-delete

help:
	@grep -E '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

# ---------- dev mode ----------

install: ## Install frontend and Go dependencies
	cd frontend && npm install
	cd backend && go mod download

dev-db: ## Start Postgres (localhost:5432) and Jaeger (UI localhost:16686) in Docker
	docker compose up -d --wait postgres jaeger

dev-backend: ## Run the Go backend natively: API :8080, processor, batch runs, agency mocks
	cd backend && APP_ENV=dev OTEL_EXPORTER_OTLP_ENDPOINT=$${OTEL_EXPORTER_OTLP_ENDPOINT-http://localhost:4318} go run ./cmd/taxrefund all

dev-frontend: ## Run the Vite dev server on :5180 (proxies /api to :8080)
	cd frontend && npm run dev

dev: dev-db ## Postgres + Jaeger + backend + frontend; open http://localhost:5180
	@$(MAKE) -j2 --no-print-directory dev-backend dev-frontend

test: ## Go unit tests
	cd backend && go test ./...

smoke: ## End-to-end API checks against the dev backend
	scripts/smoke-test.sh http://localhost:8080

smoke-admin: ## Admin console API checks against the dev backend
	scripts/admin-smoke-test.sh http://localhost:8080

# ---------- integration mode ----------

up: ## Build and run the full stack in Docker; portal :8088, Jaeger :16686
	docker compose up --build -d --wait

down: ## Stop the Docker stack (keeps the database volume)
	docker compose down

logs: ## Follow Docker stack logs
	docker compose logs -f backend processor batch agency-irs agency-ca-ftb frontend

smoke-integration: ## End-to-end API checks through nginx in Docker
	scripts/smoke-test.sh http://localhost:8088

clean: ## Stop the Docker stack and delete the database volume
	docker compose down -v

# ---------- kubernetes ----------

images: ## Build the backend and frontend images, tagged $$TAG
	docker build -t tax-refund-backend:$(TAG) backend
	docker build -t tax-refund-frontend:$(TAG) frontend

k8s-deploy: images ## Build images and deploy to Kubernetes ($(K8S_CONTEXT)) in namespace $(K8S_NS)
	$(if $(K8S_LOAD),$(K8S_LOAD) tax-refund-backend:$(TAG) tax-refund-frontend:$(TAG))
	@mkdir -p $(OVERLAY)
	@printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../../kubernetes]\nimages:\n  - {name: tax-refund-backend, newTag: "$(TAG)"}\n  - {name: tax-refund-frontend, newTag: "$(TAG)"}\n' > $(OVERLAY)/kustomization.yaml
	$(KUBECTL) apply -k $(OVERLAY)
	$(KUBECTL) -n $(K8S_NS) rollout status statefulset/postgres --timeout=180s
	$(KUBECTL) -n $(K8S_NS) rollout status deploy/jaeger deploy/agency-irs deploy/agency-ca-ftb deploy/backend deploy/processor deploy/frontend --timeout=180s

k8s-status: ## Show pods and services
	$(KUBECTL) -n $(K8S_NS) get pods,svc,pvc

k8s-forward: ## Forward the portal to http://localhost:8090
	$(KUBECTL) -n $(K8S_NS) port-forward svc/frontend 8090:80

k8s-jaeger: ## Forward the Jaeger UI to http://localhost:16687
	$(KUBECTL) -n $(K8S_NS) port-forward svc/jaeger 16687:16686

k8s-batch: ## Show recent batch runs (CronJob history and the batch_runs table)
	$(KUBECTL) -n $(K8S_NS) get cronjobs,jobs
	$(KUBECTL) -n $(K8S_NS) exec postgres-0 -- psql -U taxrefund -c "SELECT id, jurisdiction, shard_index || '/' || shard_count AS shard, status, returns_checked AS checked, status_changes AS changed, chunks_failed, to_char(started_at, 'HH24:MI:SS') AS started, trace_id FROM batch_runs ORDER BY id DESC LIMIT 12;"

k8s-smoke: ## End-to-end API checks through the port-forward
	scripts/smoke-test.sh http://localhost:8090

k8s-delete: ## Delete the namespace and everything in it
	$(KUBECTL) delete namespace $(K8S_NS) --ignore-not-found
