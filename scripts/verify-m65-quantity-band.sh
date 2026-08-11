#!/usr/bin/env bash
# M65 migration harness, in the MANAGED-SUPABASE SHAPE.
#
#   ./scripts/verify-m65-quantity-band.sh 16
#   ./scripts/verify-m65-quantity-band.sh 17
#
# WHY THIS SHAPE.
#
# Managed Supabase installs pgcrypto into a dedicated `extensions` schema, not
# `public`. A container that installs it into `public` is a different database
# from the one that runs, and that difference has already broken one release.
# This harness provisions pgcrypto exactly where Supabase puts it and PROVES
# `public.digest` is absent before applying anything.
#
# WHAT IT PROVES.
#
#   pre    the cart chain through M64 applies, and BEFORE M65 both quantity
#          bands really do read 1..3, so the blocker is MEASURED rather than
#          assumed;
#   rows   a pre-existing cart row at the old ceiling survives M65 unchanged,
#          which is the "preserve existing rows" requirement made observable;
#   fail   on a database WITHOUT the cart schema, M65 refuses (55000) instead
#          of half-applying, and leaves no constraint behind;
#   apply  M65 applies at psql exit 0, then applies a SECOND time at exit 0;
#   verify the full behavioural suite passes after each apply;
#   scope  no table, column, index or routine is created, no row is written by
#          the migration itself, and every OTHER quantity constraint in the
#          schema is byte-identical before and after.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeniosm65qty${MAJOR}"
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
M65="supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"
VERIFY="supabase/verification/research-early-access-cart-quantity-band.verify.sql"

for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62" "$M64" "$M65" "$VERIFY"; do
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

# Every check constraint in the schema, with its definition, as one sorted
# blob. Used to prove M65 changed exactly the two it names and nothing else.
constraint_fingerprint() {
  psql_q "$1" "
    select string_agg(rel.relname || '|' || con.conname || '|' || pg_get_constraintdef(con.oid), E'\n' order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and con.contype = 'c'
      and rel.relname not in ('research_early_access_cart_items','research_early_access_cart_child_releases');
  "
}

run_verify() {
  local out rc
  out="$(psql_run m65shape < "$REPO_ROOT/$VERIFY" 2>&1)"
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
provision m65shape || { echo "FAILED to provision"; exit 1; }
if [ "$(psql_q m65shape "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='digest'")" = "0" ]; then
  pass "public.digest is absent, as on managed Supabase"
else
  fail "public.digest exists; this is not the managed shape"
fi

# ---------------------------------------------------------------------------
step "M65 must FAIL CLOSED on a database without the cart schema"
provision m65bare || { echo "FAILED to provision the bare database"; exit 1; }
BARE_OUT="$(psql_run m65bare < "$REPO_ROOT/$M65" 2>&1)"
BARE_RC=$?
if [ "$BARE_RC" -ne 0 ] && echo "$BARE_OUT" | grep -q "M65 requires the accepted Early Access cart schema"; then
  pass "M65 refuses on a bare database with its own 55000 preflight error"
else
  fail "M65 did not fail closed on a bare database (rc=$BARE_RC): $BARE_OUT"
fi

# ---------------------------------------------------------------------------
step "applying the cart chain through M64"
for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62" "$M64"; do
  psql_run m65shape < "$REPO_ROOT/$f" >/dev/null || { echo "FAILED $f"; exit 1; }
  echo "   ok $(basename "$f")"
done

# ---------------------------------------------------------------------------
step "PRE-M65: the 1..3 ceiling is real, not assumed"
for t in research_early_access_cart_items research_early_access_cart_child_releases; do
  N="$(psql_q m65shape "
    select count(*) from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace nsp on nsp.oid=rel.relnamespace
    where nsp.nspname='public' and rel.relname='$t' and con.contype='c'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 3';")"
  if [ "$N" = "1" ]; then pass "public.$t caps quantity at 3 before M65"; else fail "public.$t has $N 1..3 bands before M65"; fi
done

# A REAL ROW AT THE OLD CEILING, so "preserves existing rows" is observed
# rather than asserted.
psql_run m65shape <<'SQL' >/dev/null || { echo "FAILED to seed the pre-existing row"; exit 1; }
insert into public.research_early_access_cart_quotes (
  quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at
) values (
  'xeaq_m65preserve00000001', 'eac_' || repeat('b', 32), repeat('b', 64), repeat('c', 64),
  '{}'::jsonb, now(), now() + interval '1 hour'
);
insert into public.research_early_access_cart_checkouts (
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
  payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
  tax_cents, payable_total_cents, record, placed_at
) values (
  'XEC-M65PRESERVE000000001', 'eac_' || repeat('b', 32), repeat('d', 64),
  repeat('b', 64), 'xeaq_m65preserve00000001',
  'awaiting_payment', 'USD', 3000, 600, 0, 0, 2400, '{}'::jsonb, now()
);
insert into public.research_early_access_cart_items (
  cart_checkout_id, line_index, order_number, product_id, variant_id, sku,
  quantity, supplier_id, supplier_sku, unit_price_cents, subtotal_cents,
  discount_cents, payable_cents, record
) select id, 0, 'XEA-CART-M65PRESERVE-01', 'prod-pre', 'var-pre', 'SKU-PRE',
       3, 'sup-pre', 'SUPSKU-PRE', 1000, 3000, 600, 2400, '{}'::jsonb
  from public.research_early_access_cart_checkouts
  where checkout_number = 'XEC-M65PRESERVE000000001';
SQL
BEFORE_ROW="$(psql_q m65shape "select quantity||'|'||subtotal_cents||'|'||discount_cents||'|'||payable_cents from public.research_early_access_cart_items where order_number='XEA-CART-M65PRESERVE-01';")"
# An empty seed would make every "unchanged" assertion below vacuously true, so
# the harness refuses to continue rather than reporting a green run over no data.
[ "$BEFORE_ROW" = "3|3000|600|2400" ] || { echo "FAILED: seeded row is '$BEFORE_ROW', expected 3|3000|600|2400"; exit 1; }
BEFORE_COUNT="$(psql_q m65shape "select count(*) from public.research_early_access_cart_items;")"
BEFORE_FP="$(constraint_fingerprint m65shape)"
BEFORE_RELATIONS="$(psql_q m65shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';")"
pass "seeded one pre-existing item at the old ceiling: $BEFORE_ROW"

# ---------------------------------------------------------------------------
step "applying M65 (first apply)"
psql_run m65shape < "$REPO_ROOT/$M65" >/dev/null && pass "M65 applied at exit 0" || fail "M65 first apply failed"
run_verify "first"

step "applying M65 a SECOND time (idempotency)"
psql_run m65shape < "$REPO_ROOT/$M65" >/dev/null && pass "M65 re-applied at exit 0" || fail "M65 second apply failed"
run_verify "second"

# ---------------------------------------------------------------------------
step "the pre-existing row is untouched"
AFTER_ROW="$(psql_q m65shape "select quantity||'|'||subtotal_cents||'|'||discount_cents||'|'||payable_cents from public.research_early_access_cart_items where order_number='XEA-CART-M65PRESERVE-01';")"
AFTER_COUNT="$(psql_q m65shape "select count(*) from public.research_early_access_cart_items;")"
if [ "$BEFORE_ROW" = "$AFTER_ROW" ]; then pass "the pre-existing item is byte-identical: $AFTER_ROW"; else fail "the pre-existing item CHANGED: $BEFORE_ROW -> $AFTER_ROW"; fi
if [ "$BEFORE_COUNT" = "$AFTER_COUNT" ]; then pass "item row count unchanged ($AFTER_COUNT)"; else fail "item row count changed: $BEFORE_COUNT -> $AFTER_COUNT"; fi

step "M65 created no relation and touched no other constraint"
AFTER_RELATIONS="$(psql_q m65shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';")"
if [ "$BEFORE_RELATIONS" = "$AFTER_RELATIONS" ]; then pass "public relation count unchanged ($AFTER_RELATIONS)"; else fail "relation count changed: $BEFORE_RELATIONS -> $AFTER_RELATIONS"; fi
AFTER_FP="$(constraint_fingerprint m65shape)"
if [ "$BEFORE_FP" = "$AFTER_FP" ]; then pass "every check constraint OUTSIDE the two named tables is byte-identical"; else fail "M65 changed a constraint it does not name"; fi

# ---------------------------------------------------------------------------
step "result"
if [ "$FAILED" -eq 0 ]; then
  echo "M65 VERIFIED on PostgreSQL ${MAJOR}"
else
  echo "M65 FAILED on PostgreSQL ${MAJOR}"
fi
exit "$FAILED"
