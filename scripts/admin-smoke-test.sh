#!/usr/bin/env bash
# End-to-end check of the admin console API: access control, changing a return's status at the
# mock agency and watching the batch sync it, resuming the automatic timeline, and releasing a
# return held by duplicate screening.
#
# Usage: scripts/admin-smoke-test.sh [base-url]   (default http://localhost:8080)
set -euo pipefail

BASE="${1:-http://localhost:8080}"
SEED="$(dirname "$0")/../backend/internal/store/demo-users.json"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
H=(-H 'Content-Type: application/json' -H 'X-Requested-With: fetch')

creds() { python3 -c "import json; u=[u for u in json.load(open('$SEED')) if u.get('role','taxpayer')=='$1'][$2]; print(json.dumps({'email':u['email'],'password':u['password']}))"; }
call() { local jar=$1; shift; curl -sS -b "$TMP/$jar" -c "$TMP/$jar" "${H[@]}" "$@"; }
code() { local jar=$1; shift; curl -sS -o /dev/null -w '%{http_code}' -b "$TMP/$jar" -c "$TMP/$jar" "${H[@]}" "$@"; }
check() { if [[ "$2" == "$3" ]]; then echo "  ok   $1"; else echo "  FAIL $1 (got $2, want $3)"; exit 1; fi; }
field() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(eval("d" + sys.argv[1]))' "$1"; }
row() { call admin "$BASE/api/admin/returns?q=$1" | python3 -c "import json,sys; r=[r for r in json.load(sys.stdin)['returns'] if r['form']=='$2']; print(json.dumps(r[0]) if r else '{}')"; }
wait_for() { # wait_for <description> <email> <form> <python condition on r>
  for i in $(seq 1 60); do
    r="$(row "$2" "$3")"
    if python3 -c "import json,sys; r=json.loads(sys.argv[1]); sys.exit(0 if ($4) else 1)" "$r" 2>/dev/null; then
      echo "  ok   $1 (${i}x2s)"; return 0; fi
    sleep 2
  done
  echo "  FAIL $1"; echo "$r"; exit 1
}

F='{"filingStatus":"single","wages":64000,"withholding":7900,"interest":0,"itemizedDeductions":0,"dependents":0,"routingNumber":"110000000","accountNumber":"000444555666"}'
T1=$(creds taxpayer 0 | field "['email']"); T2=$(creds taxpayer 1 | field "['email']")

echo "Access control"
check "taxpayer login" "$(code t1 -X POST -d "$(creds taxpayer 0)" "$BASE/api/auth/login")" 200
check "taxpayer can't use admin API" "$(code t1 "$BASE/api/admin/returns")" 403
check "anonymous can't use admin API" "$(code anon "$BASE/api/admin/returns")" 401
check "admin login" "$(code admin -X POST -d "$(creds admin 0)" "$BASE/api/auth/login")" 200
check "admin role reported" "$(call admin "$BASE/api/auth/me" | field "['role']")" admin

# Both taxpayers file with the same bank account, so clear each one's returns up front: taxpayer 2's
# return from an earlier run would otherwise get taxpayer 1's return held as its duplicate.
check "taxpayer 2 login" "$(code t2 -X POST -d "$(creds taxpayer 1)" "$BASE/api/auth/login")" 200
code t1 -X DELETE "$BASE/api/returns" >/dev/null
code t2 -X DELETE "$BASE/api/returns" >/dev/null

echo "Change a return's status at the agency"
check "taxpayer files a 1040" "$(code t1 -X POST -d "$F" "$BASE/api/returns/1040")" 201
wait_for "return transmitted" "$T1" 1040 "r['submissionId'] and r['status']=='processing'"
ID=$(row "$T1" 1040 | field "['id']")
check "Action required without a message is refused" "$(code admin -X PUT -d '{"status":"action_required"}' "$BASE/api/admin/returns/$ID/agency-status")" 422
check "admin sets Action required with a message" "$(code admin -X PUT -d '{"status":"action_required","message":"Send copies of your W-2 forms."}' "$BASE/api/admin/returns/$ID/agency-status")" 200
check "agency reports it as set by admin" "$(row "$T1" 1040 | field "['agencyStatus']['manual']")" True
check "taxpayer sees Action needed immediately" "$(call t1 "$BASE/api/returns" | field "['returns'][0]['status']")" action_needed
check "taxpayer sees the agency's message" "$(call t1 "$BASE/api/returns" | field "['returns'][0]['events'][-1]['note']")" "The IRS needs more information: Send copies of your W-2 forms."
check "Approved without a payment date is refused" "$(code admin -X PUT -d '{"status":"approved"}' "$BASE/api/admin/returns/$ID/agency-status")" 422
check "admin approves the refund as filed" "$(code admin -X PUT -d '{"status":"approved","paymentDate":"2026-11-02"}' "$BASE/api/admin/returns/$ID/agency-status")" 200
CLAIM=$(row "$T1" 1040 | field "['refund']")
check "taxpayer sees the refund as filed immediately" "$(call t1 "$BASE/api/returns" | field "['returns'][0]['agencyRefund']")" "$CLAIM"
check "taxpayer sees the payment date" "$(call t1 "$BASE/api/returns" | field "['returns'][0]['expectedPaymentDate']")" 2026-11-02
check "Refund adjusted without a reason is refused" "$(code admin -X PUT -d '{"status":"adjusted","refundAmount":321,"paymentDate":"2026-10-30"}' "$BASE/api/admin/returns/$ID/agency-status")" 422
check "Refund adjusted to the amount as filed is refused" "$(code admin -X PUT -d "{\"status\":\"adjusted\",\"refundAmount\":$CLAIM,\"paymentDate\":\"2026-10-30\",\"message\":\"We corrected a math error on your return.\"}" "$BASE/api/admin/returns/$ID/agency-status")" 422
check "a windfall refund is refused" "$(code admin -X PUT -d '{"status":"adjusted","refundAmount":999999,"paymentDate":"2026-10-30","message":"We found a credit you are eligible for."}' "$BASE/api/admin/returns/$ID/agency-status")" 422
check "admin sends an adjusted refund with a reason" "$(code admin -X PUT -d '{"status":"adjusted","refundAmount":321,"paymentDate":"2026-10-30","message":"We corrected a math error on your return."}' "$BASE/api/admin/returns/$ID/agency-status")" 200
wait_for "Refund adjusted is final" "$T1" 1040 "r['status']=='adjusted' and r['nextCheckAt'] is None and r['agencyRefund']==321"
check "taxpayer sees amount and reason" "$(call t1 "$BASE/api/returns" | field "['returns'][0]['events'][-1]['note']")" "The IRS adjusted your refund to \$321 and sent it by direct deposit. We corrected a math error on your return."
check "admin sets Refund sent" "$(code admin -X PUT -d '{"status":"sent","paymentDate":"2026-10-30"}' "$BASE/api/admin/returns/$ID/agency-status")" 200
wait_for "Refund sent is the amount as filed" "$T1" 1040 "r['status']=='sent' and r['agencyRefund']==$CLAIM"
check "admin moves it back to Processing" "$(code admin -X PUT -d '{"status":"processing"}' "$BASE/api/admin/returns/$ID/agency-status")" 200
wait_for "a final return is re-synced after an admin change" "$T1" 1040 "r['status']=='processing'"
check "invalid status refused" "$(code admin -X PUT -d '{"status":"accepted"}' "$BASE/api/admin/returns/$ID/agency-status")" 422
check "resume automatic" "$(code admin -X DELETE "$BASE/api/admin/returns/$ID/agency-status")" 200
check "agency back on automatic" "$(row "$T1" 1040 | field "['agencyStatus']['manual']")" False
check "check now" "$(code admin -X POST "$BASE/api/admin/returns/$ID/check-now")" 200

echo "Release a return held by duplicate screening"
check "taxpayer 2 files the same 1040 (same bank account)" "$(code t2 -X POST -d "$F" "$BASE/api/returns/1040")" 201
wait_for "held by duplicate screening" "$T2" 1040 "r['held']"
ID2=$(row "$T2" 1040 | field "['id']")
check "setting an agency status on a held return is refused" "$(code admin -X PUT -d '{"status":"approved"}' "$BASE/api/admin/returns/$ID2/agency-status")" 409
check "admin releases it" "$(code admin -X POST "$BASE/api/admin/returns/$ID2/release")" 200
wait_for "released return is transmitted" "$T2" 1040 "r['submissionId'] and r['status']=='processing' and r['identityVerified']"
check "releasing twice is refused" "$(code admin -X POST "$BASE/api/admin/returns/$ID2/release")" 409
echo "All admin checks passed."
