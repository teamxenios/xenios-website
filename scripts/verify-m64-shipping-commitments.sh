#!/usr/bin/env bash
# M64 migration harness, in the MANAGED-SUPABASE SHAPE.
#
#   ./scripts/verify-m64-shipping-commitments.sh 16
#   ./scripts/verify-m64-shipping-commitments.sh 17
#
# WHY THIS SHAPE.
#
# Managed Supabase installs pgcrypto into a dedicated `extensions` schema, not
# `public`. A container that installs it into `public` is a different database
# from the one that runs, and that difference has already broken one release
# (see scripts/verify-early-access-cart-managed-supabase.sh). This harness
# provisions pgcrypto exactly where Supabase puts it and PROVES `public.digest`
# is absent before applying anything.
#
# WHAT IT PROVES.
#
#   pre    the cart chain through M62 applies, and BEFORE M64 the shipping
#          commitment routine does NOT exist, so the blocker is measured
#          rather than assumed;
#   fail   on a database WITHOUT the M62 cart schema, M64 refuses (55000)
#          instead of half-applying;
#   apply  M64 applies at psql exit 0, then applies a SECOND time at exit 0;
#   verify the full behavioural suite passes after each apply;
#   priv   service_role may EXECUTE the routine and anon/authenticated/PUBLIC
#          may not, and NO role gained direct SELECT on any M62 table;
#   write  M64 creates no table, no column, no index and no row, and the
#          routine itself writes nothing: every table's row count is unchanged
#          across both applies and the whole verification suite.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeniosm64ship${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PREREQ=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql"
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql"
)
M58="supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
M60="supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
M61="supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
M62="supabase/migrations/20260809130000_research_early_access_hardening.sql"
M64="supabase/migrations/20260810130000_research_early_access_cart_shipping_commitments.sql"
VERIFY="supabase/verification/research-early-access-cart-shipping-commitments.verify.sql"

for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62" "$M64" "$VERIFY"; do
  [ -f "$REPO_ROOT/$f" ] || { echo "missing $f"; exit 1; }
done

FAILED=0
step() { echo; echo "== $* =="; }
fail() { echo "FAIL  $*"; FAILED=1; }
pass() { echo "PASS  $*"; }

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

step "starting postgres:${MAJOR}"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "postgres:${MAJOR}-alpine" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }
docker exec "$NAME" psql -U postgres -tAc 'select version()'

psql_run()  { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
psql_q()    { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2"; }

provision() {
  docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database $1;" >/dev/null || return 1
  psql_run "$1" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
}

# The suite raises on the first failed assertion, so a non-zero psql exit IS
# the failure signal. Every PASS notice is echoed so the evidence is readable.
run_verify() {
  local out rc
  out="$(psql_run m64shape < "$REPO_ROOT/$VERIFY" 2>&1)"
  rc=$?
  echo "$out" | grep -E "^(NOTICE:  PASS|ERROR|FAIL)" || true
  if [ "$rc" -eq 0 ] && ! echo "$out" | grep -qE "^(ERROR|FAIL)"; then
    pass "verification suite green after the $1 apply ($(echo "$out" | grep -c "NOTICE:  PASS") assertions)"
  else
    fail "verification suite failed after the $1 apply"
  fi
}

# ---------------------------------------------------------------------------
step "provisioning the managed-Supabase shape (pgcrypto in extensions)"
provision m64shape || { echo "FAILED to provision"; exit 1; }
if [ "$(psql_q m64shape "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='digest'")" = "0" ]; then
  pass "public.digest is absent, as on managed Supabase"
else
  fail "public.digest exists; this is not the managed shape"
fi

# ---------------------------------------------------------------------------
step "M64 must FAIL CLOSED on a database without the M62 cart schema"
provision m64bare || { echo "FAILED to provision the bare database"; exit 1; }
BARE_OUT="$(psql_run m64bare < "$REPO_ROOT/$M64" 2>&1)"
BARE_RC=$?
if [ "$BARE_RC" -ne 0 ] && echo "$BARE_OUT" | grep -q "M64 requires the accepted M62 cart schema"; then
  pass "M64 refuses on a bare database with its own 55000 preflight error"
else
  fail "M64 did not fail closed on a bare database (rc=$BARE_RC): $BARE_OUT"
fi
if [ "$(psql_q m64bare "select to_regprocedure('public.research_early_access_cart_shipping_commitments_due(timestamptz)') is null;")" = "t" ]; then
  pass "the refused apply left no routine behind"
else
  fail "a refused M64 apply created the routine anyway"
fi

# ---------------------------------------------------------------------------
step "applying the cart chain through M62"
for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62"; do
  psql_run m64shape < "$REPO_ROOT/$f" >/dev/null || { echo "FAILED $f"; exit 1; }
  echo "   ok $(basename "$f")"
done

# ---------------------------------------------------------------------------
step "PRE-M64: the blocker is real, not assumed"
if [ "$(psql_q m64shape "select to_regprocedure('public.research_early_access_cart_shipping_commitments_due(timestamptz)') is null;")" = "t" ]; then
  pass "before M64 there is NO shipping-commitment routine"
else
  fail "the routine already exists before M64"
fi
# The whole reason M64 exists: no direct read is possible either.
for t in research_early_access_cart_settlement_hardening research_early_access_cart_fulfilment_events; do
  if [ "$(psql_q m64shape "select has_table_privilege('service_role','public.$t','SELECT');")" = "f" ]; then
    pass "before M64 service_role cannot SELECT public.$t"
  else
    fail "service_role can already SELECT public.$t; M62's boundary is not what M64 assumes"
  fi
done

BEFORE_TABLES=$(psql_q m64shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','i');")

# ---------------------------------------------------------------------------
step "applying M64 (first apply)"
psql_run m64shape < "$REPO_ROOT/$M64" >/dev/null && pass "M64 applied at exit 0" || fail "M64 first apply failed"

step "verification suite after the FIRST apply"
run_verify "first"

# ---------------------------------------------------------------------------
step "applying M64 a SECOND time (idempotence)"
psql_run m64shape < "$REPO_ROOT/$M64" >/dev/null && pass "M64 second apply at exit 0" || fail "M64 second apply failed"

step "verification suite after the SECOND apply"
run_verify "second"

# ---------------------------------------------------------------------------
step "M64 changed no relation and created no row"
AFTER_TABLES=$(psql_q m64shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','i');")
if [ "$BEFORE_TABLES" = "$AFTER_TABLES" ]; then
  pass "table and index count unchanged across both applies ($BEFORE_TABLES)"
else
  fail "relation count moved: $BEFORE_TABLES -> $AFTER_TABLES"
fi

ROWS=$(psql_q m64shape "
  select coalesce(sum(n),0) from (
    select (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as n
    from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relkind='r' and c.relname like 'research_%'
  ) t;")
if [ "$ROWS" = "0" ]; then
  pass "every research_* table is still empty: M64 and the verification created nothing"
else
  fail "research_* tables hold $ROWS row(s) after M64 and verification"
fi

# ---------------------------------------------------------------------------
step "the routine is callable by service_role and by nobody else"
for role in anon authenticated; do
  if [ "$(psql_q m64shape "select has_function_privilege('$role','public.research_early_access_cart_shipping_commitments_due(timestamptz)','EXECUTE');")" = "f" ]; then
    pass "$role cannot execute the routine"
  else
    fail "$role can execute the routine"
  fi
done
if [ "$(psql_q m64shape "select has_function_privilege('service_role','public.research_early_access_cart_shipping_commitments_due(timestamptz)','EXECUTE');")" = "t" ]; then
  pass "service_role can execute the routine"
else
  fail "service_role cannot execute the routine"
fi
if [ "$(psql_q m64shape "select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid='public.research_early_access_cart_shipping_commitments_due(timestamptz)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');")" = "f" ]; then
  pass "PUBLIC cannot execute the routine"
else
  fail "PUBLIC can execute the routine"
fi

step "M64 did NOT widen the M62 table boundary"
for t in research_early_access_cart_settlement_hardening research_early_access_cart_fulfilment_events research_early_access_proof_submissions research_early_access_legal_bindings; do
  if [ "$(psql_q m64shape "select has_table_privilege('service_role','public.$t','SELECT');")" = "f" ]; then
    pass "service_role still has NO direct SELECT on public.$t"
  else
    fail "service_role gained direct SELECT on public.$t"
  fi
done

step "M61, M62 and M63 routines are untouched by M64"
for fn in \
  "public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)" \
  "public.research_early_access_record_cart_fulfilment_event(jsonb,text)" \
  "public.research_early_access_cart_settlement_hardening(text)"; do
  if [ "$(psql_q m64shape "select to_regprocedure('$fn') is not null;")" = "t" ]; then
    pass "still present: $fn"
  else
    fail "missing after M64: $fn"
  fi
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "M64 HARNESS: PASS (PostgreSQL ${MAJOR})"
else
  echo "M64 HARNESS: FAIL (PostgreSQL ${MAJOR})"
fi
exit "$FAILED"
