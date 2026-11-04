#!/usr/bin/env bash
# Re-initialize the whole database: empty every table (returns, sessions, audit log, batch runs,
# the mock agencies' overrides), apply any new migrations, and re-seed the demo accounts from
# backend/internal/store/demo-users.json.
#
# Tables are emptied rather than dropped so running services keep working: dropping the schema
# would recreate pgvector's type under a new ID that open database connections still have cached.
#
# Usage:
#   scripts/reset-db.sh          Docker/dev Postgres on localhost (make dev, make up)
#   scripts/reset-db.sh k8s      Kubernetes (K8S_CONTEXT, default docker-desktop)
#   add -y to skip the confirmation
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=local
YES=no
for arg in "$@"; do
  case "$arg" in
    local | k8s) TARGET=$arg ;;
    -y | --yes) YES=yes ;;
    *) echo "usage: $0 [local|k8s] [-y]" >&2; exit 2 ;;
  esac
done

K8S_CONTEXT=${K8S_CONTEXT:-docker-desktop}
K8S_NS=${K8S_NS:-tax-refund}
PORT=${POSTGRES_PORT:-5432}
DB_URL=${DATABASE_URL:-postgres://taxrefund:taxrefund@localhost:$PORT/taxrefund?sslmode=disable}
WIPE="SET client_min_messages = warning;
DO \$\$ DECLARE tables text; BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
    FROM pg_tables WHERE schemaname IN ('public', 'agency_mock') AND tablename <> 'schema_migrations';
  IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE'; END IF;
END \$\$;"

if [[ $YES != yes ]]; then
  where="local Postgres (localhost:$PORT)"; [[ $TARGET == k8s ]] && where="Kubernetes ($K8S_CONTEXT/$K8S_NS)"
  read -r -p "Delete ALL data in the $where database and re-seed it? [y/N] " answer
  [[ $answer == [yY]* ]] || { echo "Cancelled."; exit 1; }
fi

if [[ $TARGET == k8s ]]; then
  K="kubectl --context $K8S_CONTEXT -n $K8S_NS"
  echo "Emptying every table..."
  $K exec postgres-0 -- psql -q -U taxrefund -d taxrefund -v ON_ERROR_STOP=1 -c "$WIPE"
  echo "Re-seeding demo accounts (backend init container)..."
  $K rollout restart deploy/backend
  $K rollout status deploy/backend --timeout=180s
  echo "Done. Everyone is signed out; sign in again with any demo account."
  exit 0
fi

echo "Emptying every table..."
if command -v psql >/dev/null && psql "$DB_URL" -qtAc 'select 1' >/dev/null 2>&1; then
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -c "$WIPE"
else
  docker compose exec -T postgres psql -q -U taxrefund -d taxrefund -v ON_ERROR_STOP=1 -c "$WIPE"
fi

echo "Applying migrations and re-seeding demo accounts..."
if command -v go >/dev/null; then
  (cd backend && APP_ENV=dev DATABASE_URL="$DB_URL" go run ./cmd/taxrefund migrate)
else
  docker compose restart backend # the API migrates and seeds when it starts
fi
echo "Done. Everyone is signed out; sign in again with any demo account."
