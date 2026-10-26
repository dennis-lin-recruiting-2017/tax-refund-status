#!/usr/bin/env bash
# End-to-end API check: login, file a 1040 and a CA 540, watch them get transmitted to the
# agencies and updated by batch status runs, and confirm that an identical return from a second
# taxpayer is held by the pgvector similarity check.
#
# Usage: scripts/smoke-test.sh [base-url]   (default http://localhost:8080; use :5173 or :8088 too)
set -euo pipefail

BASE="${1:-http://localhost:8080}"
SEED="$(dirname "$0")/../backend/internal/store/demo-users.json"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')

user() { python3 -c "import json,sys; u=json.load(open('$SEED'))[$1]; print(json.dumps({'email':u['email'],'password':u['password']}))"; }
call() { local jar=$1; shift; curl -sS -b "$TMP/$jar" -c "$TMP/$jar" "${H[@]}" "$@"; }
code() { local jar=$1; shift; curl -sS -o /dev/null -w '%{http_code}' -b "$TMP/$jar" -c "$TMP/$jar" "${H[@]}" "$@"; }
check() { if [[ "$2" == "$3" ]]; then echo "  ok   $1"; else echo "  FAIL $1 (got $2, want $3)"; exit 1; fi; }
statuses() { call "$1" "$BASE/api/returns" | python3 -c "import json,sys; print(' '.join(r['form']+'='+r['status'] for r in json.load(sys.stdin)['returns']))"; }

F1040='{"filingStatus":"single","wages":72000,"withholding":8500,"interest":120,"itemizedDeductions":0,"dependents":0,"routingNumber":"110000000","accountNumber":"000123456789"}'
F540='{"filingStatus":"single","wages":72000,"withholding":2900,"interest":120,"itemizedDeductions":0,"dependents":0,"routingNumber":"110000000","accountNumber":"000123456789"}'

echo "Security checks"
check "POST without X-Requested-With is rejected" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/auth/login")" 403
check "returns require a session" "$(code anon "$BASE/api/returns")" 401
check "wrong password is rejected" "$(code anon -X POST -d '{"email":"alex@example.test","password":"nope"}' "$BASE/api/auth/login")" 401
check "unknown email gets the same response" "$(code anon -X POST -d '{"email":"nobody@example.test","password":"nope"}' "$BASE/api/auth/login")" 401

echo "Taxpayer 1 files"
check "login" "$(code a -X POST -d "$(user 0)" "$BASE/api/auth/login")" 200
code a -X DELETE "$BASE/api/returns" >/dev/null
check "estimate 1040" "$(code a -X POST -d "$F1040" "$BASE/api/returns/1040/estimate")" 200
check "submit 1040" "$(code a -X POST -d "$F1040" "$BASE/api/returns/1040")" 201
check "submit CA 540" "$(code a -X POST -d "$F540" "$BASE/api/returns/540")" 201
check "duplicate 1040 is refused" "$(code a -X POST -d "$F1040" "$BASE/api/returns/1040")" 409
check "bad routing number is refused" "$(code a -X POST -d "${F1040/110000000/110000001}" "$BASE/api/returns/1040")" 422
echo "  statuses: $(statuses a)"

echo "Taxpayer 2 files an identical CA return (same figures, same bank account)"
check "login" "$(code b -X POST -d "$(user 1)" "$BASE/api/auth/login")" 200
code b -X DELETE "$BASE/api/returns" >/dev/null
check "submit CA 540" "$(code b -X POST -d "$F540" "$BASE/api/returns/540")" 201

echo "Waiting for transmission and batch status runs (up to 4 minutes)..."
last=""
for i in $(seq 1 120); do
  sleep 2
  a="$(statuses a)"; b="$(statuses b)"
  now="taxpayer 1: $a | taxpayer 2: $b"
  [[ "$now" != "$last" ]] && echo "  [$((i * 2))s] $now" && last="$now"
  [[ "$a" == *"1040=sent"* && "$b" == *"action_needed"* ]] && break
done
[[ "$b" == *"action_needed"* ]] && echo "  ok   near-duplicate flagged for identity verification" || { echo "  FAIL duplicate not flagged"; exit 1; }
[[ "$a" == *"1040=sent"* ]] && echo "  ok   1040 refund reached sent" || { echo "  FAIL 1040 did not reach sent"; exit 1; }
check "logout" "$(code a -X POST "$BASE/api/auth/logout")" 204
check "session is gone after logout" "$(code a "$BASE/api/returns")" 401
echo "All checks passed."
