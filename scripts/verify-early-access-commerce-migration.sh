#!/usr/bin/env bash
# Verify the Early Access durable-persistence migrations against a REAL
# PostgreSQL, for both supported majors:
#
#   ./scripts/verify-early-access-commerce-migration.sh 16
#   ./scripts/verify-early-access-commerce-migration.sh 17
#
# What this proves, on a disposable container:
#   1. The session-spine SQL and the three commerce migrations apply cleanly,
#      TWICE, with ON_ERROR_STOP (idempotence is a hard requirement).
#   2. Data written between the first and second apply SURVIVES the re-apply
#      (additive means additive).
#   3. The full behavioral suite (early-access-durable-commerce.pg.test.ts)
#      passes against the real SQL through the real adapters: exactly-once
#      settlement under concurrency, single-use tokens, append-only money,
#      RLS denial for every browser role, reservation-expiry admin
#      exceptions, and restart survival on a second connection pool.
set -euo pipefail
MAJOR="${1:-16}"
NAME="xf5eacommerce${MAJOR}"
PORT="$((54300 + MAJOR))"

SESSION_SQL="supabase/research-private-early-access-sessions.sql"
MIGRATIONS=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql"
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql"
  "supabase/migrations/20260804130000_research_early_access_unit_holds.sql"
  "supabase/migrations/20260804140000_research_early_access_settled_transaction_refs.sql"
  "supabase/migrations/20260804150000_research_early_access_proof_bucket_privacy.sql"
  "supabase/migrations/20260804160000_research_early_access_strength_registry_mirror.sql"
)
for f in "$SESSION_SQL" "${MIGRATIONS[@]}"; do
  [ -f "$f" ] || { echo "missing $f (run from the repository root)"; exit 1; }
done

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --rm --name "$NAME" -p "${PORT}:5432" \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify "postgres:${MAJOR}" >/dev/null
# The postgres image starts a TEMPORARY server during initdb and shuts it
# down before the real one comes up, and pg_isready can answer during that
# window. Require a real query to succeed twice, two seconds apart, so the
# script never speaks to the throwaway server.
for _ in $(seq 1 60); do
  if docker exec "$NAME" psql -U postgres -d verify -qtAc "select 1" >/dev/null 2>&1; then
    sleep 2
    docker exec "$NAME" psql -U postgres -d verify -qtAc "select 1" >/dev/null 2>&1 && break
  fi
  sleep 2
done

q() { docker exec -i "$NAME" psql -U postgres -d verify -qtA "$@"; }

# Supabase's roles exist in production; create them so grants and denials are real.
q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin;" >/dev/null

echo "PostgreSQL ${MAJOR}: first apply (session spine + three commerce migrations)"
for f in "$SESSION_SQL" "${MIGRATIONS[@]}"; do
  docker exec -i "$NAME" psql -U postgres -d verify -q -v ON_ERROR_STOP=1 < "$f" >/dev/null
done
echo "  PASS  first apply"

# A durable fact written between applies must survive the second apply.
q -c "select public.research_early_access_customer_insert('{\"id\":\"apply-twice-probe\",\"normalizedEmail\":\"probe@example.com\",\"status\":\"INVITED\",\"email\":\"probe@example.com\",\"audience\":\"PRIVATE_EARLY_ACCESS\"}'::jsonb);" >/dev/null

echo "PostgreSQL ${MAJOR}: second apply (must be a no-op, never an error)"
for f in "$SESSION_SQL" "${MIGRATIONS[@]}"; do
  docker exec -i "$NAME" psql -U postgres -d verify -q -v ON_ERROR_STOP=1 < "$f" >/dev/null
done
echo "  PASS  second apply"

SURVIVED="$(q -c "select count(*) from public.research_early_access_customers where id = 'apply-twice-probe';")"
if [ "$SURVIVED" = "1" ]; then
  echo "  PASS  data written between applies survives the re-apply"
else
  echo "  FAIL  data written between applies was lost (count=$SURVIVED)"
  exit 1
fi

echo "PostgreSQL ${MAJOR}: behavioral suite through the real adapters"
XENIOS_TEST_PG_URL="postgresql://postgres:verify@localhost:${PORT}/verify" \
  npx vitest run server/research/early-access/persistence/early-access-durable-commerce.pg.test.ts

echo "PostgreSQL ${MAJOR}: ALL CHECKS PASSED"
