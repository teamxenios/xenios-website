#!/usr/bin/env bash
# THE MANAGED-SUPABASE SHAPE, WHICH IS THE ONE PRODUCTION ACTUALLY HAS.
#
#   ./scripts/verify-early-access-cart-managed-supabase.sh 16
#   ./scripts/verify-early-access-cart-managed-supabase.sh 17
#
# WHY THIS EXISTS.
#
# The Shape A and Shape B containers provisioned pgcrypto with a bare
# `create extension if not exists pgcrypto`, which installs it into `public`.
# Managed Supabase installs it into a dedicated `extensions` schema, so
# `public.digest` exists in the container and does NOT exist in production.
#
# Both cart migrations were written against the container. The consequence was
# not caught by any test:
#
#   * migration 60 FAILED to apply to production. Its
#     `cart_checkout_for_key` is `language sql`, whose body Postgres validates
#     at CREATE time, so the unresolvable `public.digest` was an immediate
#     error (SQLSTATE 42883).
#   * migration 58 APPLIED CLEANLY and is recorded as applied, because its
#     `public.digest` calls sit inside a plpgsql body, which is NOT resolved
#     at creation. Its `commit_cart_checkout` would therefore have thrown at
#     runtime on the FIRST customer checkout.
#
# A passing test suite said the opposite of the truth, because the environment
# it tested was not the environment that runs. So this shape provisions
# pgcrypto exactly where Supabase puts it, PROVES `public.digest` is absent
# before applying anything, and then exercises the real cart flow so the
# digest calls actually execute rather than merely compile.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeacartsupabase${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

M58="supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
M60="supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
PREREQ=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql"
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql"
)
for f in "${PREREQ[@]}" "$M58" "$M60"; do
  [ -f "$REPO_ROOT/$f" ] || { echo "missing $f"; exit 1; }
done

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "== starting postgres:${MAJOR} =="
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "postgres:${MAJOR}-alpine" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

psql_run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
psql_q()   { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2"; }

echo "== provisioning the MANAGED SUPABASE shape =="
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database cartshape;" || exit 1
psql_run cartshape <<'SQL'
-- Exactly how managed Supabase lays this out: the browser-facing roles, and
-- pgcrypto in its own schema rather than in public.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
[ $? -eq 0 ] || { echo "FAILED to provision the supabase shape"; exit 1; }

echo "== proving the shape BEFORE applying any cart migration =="
EXT=$(psql_q cartshape "select to_regprocedure('extensions.digest(bytea,text)') is not null;")
PUB=$(psql_q cartshape "select to_regprocedure('public.digest(bytea,text)') is null;")
echo "   extensions.digest present : $EXT   (must be t)"
echo "   public.digest ABSENT      : $PUB   (must be t)"
if [ "$EXT" != "t" ] || [ "$PUB" != "t" ]; then
  echo "REFUSING TO CONTINUE: this container does not reproduce managed Supabase."
  echo "A pass here would be meaningless, which is exactly how the original defect shipped."
  exit 1
fi

echo "== applying prerequisites =="
for f in "${PREREQ[@]}"; do
  psql_run cartshape < "$REPO_ROOT/$f" || { echo "FAILED $f"; exit 1; }
  echo "   ok $(basename "$f")"
done

echo "== applying migration 58 UNCHANGED (the immutable historical artifact) =="
psql_run cartshape < "$REPO_ROOT/$M58" || { echo "FAILED migration 58"; exit 1; }
echo "   ok (creates commit_cart_checkout carrying the historical public.digest)"

# The defect, demonstrated rather than asserted: 58's plpgsql body compiles
# happily and the function is unusable. This is the production state today.
BROKEN=$(psql_q cartshape "select pg_get_functiondef('public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure) like '%public.digest%';")
echo "   migration 58's function references public.digest : $BROKEN (expected t)"
[ "$BROKEN" = "t" ] || { echo "FAILED: expected migration 58 to carry the historical defect"; exit 1; }

echo "== applying CORRECTED migration 60 =="
psql_run cartshape < "$REPO_ROOT/$M60" || { echo "FAILED migration 60"; exit 1; }
echo "   ok"

echo "== applying BOTH again (idempotence) =="
psql_run cartshape < "$REPO_ROOT/$M58" || { echo "FAILED migration 58 second apply"; exit 1; }
psql_run cartshape < "$REPO_ROOT/$M60" || { echo "FAILED migration 60 second apply"; exit 1; }
echo "   ok"

echo "== proving migration 60 REPAIRED the migration 58 function =="
FIXED=$(psql_q cartshape "select pg_get_functiondef('public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure) like '%extensions.digest%';")
STILL=$(psql_q cartshape "select pg_get_functiondef('public.research_early_access_commit_cart_checkout(jsonb,jsonb,jsonb,text,timestamptz)'::regprocedure) like '%public.digest%';")
echo "   now uses extensions.digest : $FIXED (must be t)"
echo "   still uses public.digest   : $STILL (must be f)"
[ "$FIXED" = "t" ] && [ "$STILL" = "f" ] || { echo "FAILED: migration 60 did not repair the function"; exit 1; }

echo "== every migration-60 routine resolves pgcrypto correctly =="
BAD=$(psql_q cartshape "
  select coalesce(string_agg(p.proname, ', '), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname like '%cart%'
    and pg_get_functiondef(p.oid) like '%public.digest%';")
echo "   routines still referencing public.digest: '${BAD}' (must be empty)"
[ -z "$BAD" ] || { echo "FAILED: routines still reference public.digest"; exit 1; }

echo "== behavioural suite, so the digest calls actually EXECUTE =="
psql_run cartshape < "$REPO_ROOT/supabase/production/research-early-access-cart-completion-verification.sql" \
  || { echo "FAILED behavioural suite"; exit 1; }

echo
echo "MANAGED SUPABASE SHAPE: PASS (postgres ${MAJOR}, pgcrypto in extensions)"
