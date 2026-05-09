#!/usr/bin/env bash
# End-to-end smoke test against the running backend on :4000.
# Usage: bash server/scripts/smoke.sh
set -euo pipefail

BASE=http://localhost:4000

step() { echo; echo "=== $* ==="; }

step "create broadcast (with payment gate)"
RESP=$(curl -sS -X POST "$BASE/api/broadcasts" \
  -H 'Content-Type: application/json' \
  -d '{"ownerUserId":"final","title":"Smoke","paymentRequired":true,"priceUsd":3}')
echo "$RESP" | head -c 200; echo
ID=$(node -p "JSON.parse(process.argv[1]).id" "$RESP")
TOKEN=$(node -p "JSON.parse(process.argv[1]).ownerToken" "$RESP")
echo "id=$ID"

step "start broadcast"
curl -sS -X POST "$BASE/api/broadcasts/$ID/start" \
  -H "Authorization: Bearer $TOKEN" --max-time 30 | head -c 300; echo

step "viewer w/o payment (expect 402)"
curl -sS -X POST "$BASE/api/broadcasts/$ID/viewers/join" \
  -H 'Content-Type: application/json' \
  -d '{"viewerId":"v2","displayName":"V2"}' | head -c 200; echo

step "create payment intent"
INTENT=$(curl -sS -X POST "$BASE/api/broadcasts/$ID/payment/intent" \
  -H 'Content-Type: application/json' \
  -d '{"userId":"viewer1"}')
echo "$INTENT" | head -c 200; echo
INTID=$(node -p "JSON.parse(process.argv[1]).id" "$INTENT")

step "confirm payment"
curl -sS -X POST "$BASE/api/broadcasts/$ID/payment/confirm" \
  -H 'Content-Type: application/json' \
  -d "{\"intentId\":\"$INTID\",\"code\":\"PAY\"}" | head -c 300; echo

step "viewer joins (paid)"
curl -sS -X POST "$BASE/api/broadcasts/$ID/viewers/join" \
  -H 'Content-Type: application/json' \
  -d "{\"viewerId\":\"viewer1\",\"displayName\":\"V1\",\"paymentIntentId\":\"$INTID\"}" | head -c 400; echo

step "stats"
curl -sS "$BASE/api/broadcasts/$ID/stats" | head -c 400; echo

step "private toggle"
curl -sS -X POST "$BASE/api/broadcasts/$ID/private" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"isPrivate":true}' | head -c 400; echo

step "cohost token"
curl -sS -X POST "$BASE/api/broadcasts/$ID/participant-token" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId":"cohost1","displayName":"CoHost 1"}' --max-time 30 | head -c 400; echo

step "cleanup"
curl -sS -X DELETE "$BASE/api/broadcasts/$ID" \
  -H "Authorization: Bearer $TOKEN" --max-time 90 -w 'HTTP %{http_code}\n'
