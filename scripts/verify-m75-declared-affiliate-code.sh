#!/usr/bin/env bash
# M75 apply-twice rehearsal on disposable PostgreSQL 16 and 17.
#
# Behavioural, not syntactic. Each engine gets a throwaway container, the M71
# bridge is applied first (M75's declared predecessor), then M75 is applied
# TWICE, and the behavioural suite runs after EACH apply. A second apply that
# changes an answer is a failure, not a no-op.
#
# Requires a running Docker daemon. If the daemon is unavailable this script
# exits non-zero rather than reporting success: a rehearsal must never be marked
# green from SQL syntax alone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT/supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql"
M71="$ROOT/supabase/migrations/20260815150000_research_assisted_order_bridge.sql"
M75="$ROOT/supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql"
VERIFY="$ROOT/supabase/verification/research-assisted-order-declared-affiliate-code.verify.sql"

for f in "$BOOTSTRAP" "$M71" "$M75" "$VERIFY"; do
  [ -f "$f" ] || { echo "missing required file: $f" >&2; exit 2; }
done

if ! docker info >/dev/null 2>&1; then
  echo "FAIL: the Docker daemon is not reachable, so no rehearsal was performed." >&2
  echo "      Do not record this migration as rehearsed." >&2
  exit 3
fi

run_engine() {
  local tag="$1"
  local name="xenios-m75-rehearsal-${tag//./-}"
  echo "=== PostgreSQL ${tag} ==="

  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres "postgres:${tag}" >/dev/null

  # Wait for readiness rather than sleeping a guessed interval.
  for _ in $(seq 1 60); do
    if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 \
    || { echo "postgres:${tag} never became ready" >&2; docker rm -f "$name" >/dev/null; exit 4; }

  psql_run() {
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
  }

  # The managed-Supabase shape: the role set must exist, or the revokes in both
  # migrations bind to nothing and the boundary exists only as intent.
  psql_run -c "do \$\$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end \$\$;" >/dev/null

  psql_run < "$BOOTSTRAP" >/dev/null
  psql_run < "$M71" >/dev/null
  echo "  M71 applied"

  echo "  --- M75 apply 1 ---"
  psql_run < "$M75" >/dev/null
  psql_run < "$VERIFY"

  echo "  --- M75 apply 2 (must be a no-op that keeps every answer) ---"
  psql_run < "$M75" >/dev/null
  # Clear the rows the first verification wrote so the second run asserts on its
  # own inserts rather than colliding with them.
  psql_run -c "truncate public.research_assisted_order_requests cascade;" >/dev/null
  psql_run < "$VERIFY"

  echo "  PostgreSQL ${tag}: PASS"
  docker rm -f "$name" >/dev/null
}

run_engine "16"
run_engine "17"

echo
echo "M75 rehearsal PASS on PostgreSQL 16 and 17, applied twice, behavioural suite green after each apply."
