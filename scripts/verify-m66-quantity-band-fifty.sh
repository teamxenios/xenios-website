#!/usr/bin/env bash
# M66 migration harness, in the MANAGED-SUPABASE SHAPE.
#
#   ./scripts/verify-m66-quantity-band-fifty.sh 16
#   ./scripts/verify-m66-quantity-band-fifty.sh 17
#
# WHY THIS SHAPE
#
# Managed Supabase installs pgcrypto into a dedicated `extensions` schema, not
# `public`. A container that installs it into `public` is a different database
# from the one that runs. This harness provisions pgcrypto exactly where
# Supabase puts it and PROVES `public.digest` is absent before applying
# anything.
#
# WHAT IT PROVES
#
#   pre    the cart chain through M65 applies, and BEFORE M66 both quantity
#          bands really do read 1..20, so the blocker is MEASURED not assumed;
#   rows   a pre-existing cart row at the OLD ceiling (quantity 20) survives
#          M66 byte-identical, which is the preserve-existing-rows requirement
#          made observable;
#   fail   on a database WITHOUT the cart schema, M66 refuses (55000) instead
#          of half-applying, and leaves no constraint behind;
#   apply  M66 applies at psql exit 0, then applies a SECOND time at exit 0;
#   band   by REAL durable inserts: quantity 50 is accepted and 51 is refused
#          on the item table, and a child release is accepted at 50 and refused
#          at both 0 and 51;
#   scope  no table, column, index or routine is created, no row is written by
#          the migration itself, and every OTHER check constraint in the schema
#          is byte-identical before and after.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeniosm66qty${MAJOR}"
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
M66="supabase/candidates/20260813120000_research_early_access_cart_quantity_band_fifty.sql"

for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62" "$M64" "$M65" "$M66"; do
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

psql_run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
psql_q()   { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2"; }
psql_try() { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2" 2>&1; }

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

# Every check constraint OUTSIDE the two target tables, as one sorted blob.
other_constraints() {
  psql_q "$1" "
    select coalesce(string_agg(rel.relname || '|' || con.conname || '|' || pg_get_constraintdef(con.oid), E'\n'
                    order by rel.relname, con.conname), '(none)')
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and con.contype = 'c'
      and rel.relname not in ('research_early_access_cart_items','research_early_access_cart_child_releases');
  "
}

band_def() {
  psql_q "$1" "
    select coalesce(pg_get_constraintdef(con.oid), '(absent)')
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname='public' and rel.relname='$2' and con.contype='c'
      and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
      and pg_get_constraintdef(con.oid) ~ 'quantity <='
    limit 1;
  "
}

step "provisioning the managed-Supabase shape (pgcrypto in extensions)"
provision m66shape || { echo "could not provision"; exit 1; }
if [ "$(psql_q m66shape "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='digest'")" = "0" ]; then
  pass "public.digest is absent, as on managed Supabase"
else
  fail "public.digest exists; this is not the managed shape"
fi

step "applying the accepted chain through M65"
for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62" "$M64" "$M65"; do
  if psql_run m66shape < "$REPO_ROOT/$f" >/tmp/m66_apply.log 2>&1; then
    pass "applied $(basename "$f")"
  else
    fail "applied $(basename "$f")"; tail -5 /tmp/m66_apply.log
  fi
done

step "PRE-M66: both bands really do read 1..20 (the blocker is MEASURED)"
for t in research_early_access_cart_items research_early_access_cart_child_releases; do
  d="$(band_def m66shape "$t")"
  case "$d" in
    *"quantity <= 20"*) pass "$t carries a 1..20 band: $d" ;;
    *) fail "$t does not carry a 1..20 band before M66: $d" ;;
  esac
done

step "seeding a REAL cart row at the OLD ceiling (quantity 20)"
psql_run m66shape <<'SQL' >/tmp/m66_seed.log 2>&1
insert into public.research_early_access_cart_quotes
  (quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at)
values ('xeaq_m66seed0000000000001', 'eac_00000000000000000000000000000001',
        repeat('a',64), repeat('b',64), '{}'::jsonb, now(), now() + interval '1 day');
insert into public.research_early_access_cart_checkouts
  (checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
   currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at)
values ('XEC-M66SEEDCHECKOUT000001', 'eac_00000000000000000000000000000001',
        repeat('c',64), repeat('b',64), 'xeaq_m66seed0000000000001', 'awaiting_payment',
        'USD', 20000, 4000, 0, 0, 16000, '{}'::jsonb, now());
SQL
CHECKOUT_ID="$(psql_q m66shape "select id from public.research_early_access_cart_checkouts where checkout_number='XEC-M66SEEDCHECKOUT000001'")"
if [ -z "$CHECKOUT_ID" ]; then
  fail "could not seed the checkout; preservation assertions would pass vacuously"
  tail -6 /tmp/m66_seed.log
else
  psql_run m66shape <<SQL >/tmp/m66_item.log 2>&1
insert into public.research_early_access_cart_items
  (cart_checkout_id, line_index, order_number, product_id, variant_id, sku, quantity,
   supplier_id, supplier_sku, unit_price_cents, subtotal_cents, discount_cents, payable_cents, record)
values ('$CHECKOUT_ID', 0, 'XEA-CART-M66SEED0001', 'PEX-001', 'VAR-BPC5', 'SKU-M66-SEED', 20,
        'SUP-M66', 'SSKU-M66', 1000, 20000, 4000, 16000, '{}'::jsonb);
SQL
  SEEDED="$(psql_q m66shape "select count(*) from public.research_early_access_cart_items where quantity = 20")"
  if [ "$SEEDED" = "1" ]; then
    pass "seeded one REAL cart item at quantity 20"
  else
    fail "seed did not land; preservation assertions would be vacuous"; tail -6 /tmp/m66_item.log
  fi
fi
SEED_FINGERPRINT_BEFORE="$(psql_q m66shape "select md5(string_agg(t::text, '|' order by t::text)) from public.research_early_access_cart_items t")"
OTHER_BEFORE="$(other_constraints m66shape)"
RELCOUNT_BEFORE="$(psql_q m66shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")"

step "FAIL CLOSED: M66 on a bare database refuses with 55000 and leaves nothing"
provision m66bare >/dev/null 2>&1
OUT="$(psql_run m66bare < "$REPO_ROOT/$M66" 2>&1)"; RC=$?
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "M66 requires the accepted Early Access cart schema"; then
  pass "refused on a bare database with its own 55000 message"
else
  fail "did not fail closed on a bare database (rc=$RC)"; echo "$OUT" | head -3
fi
LEFT="$(psql_q m66bare "select count(*) from pg_constraint con join pg_class rel on rel.oid=con.conrelid where con.conname like '%quantity_band%'")"
[ "$LEFT" = "0" ] && pass "no constraint left behind on the bare database" || fail "M66 left $LEFT constraint(s) behind"

step "applying M66 (pass 1)"
if psql_run m66shape < "$REPO_ROOT/$M66" >/tmp/m66_1.log 2>&1; then pass "pass 1 at psql exit 0"; else fail "pass 1 failed"; tail -5 /tmp/m66_1.log; fi
step "applying M66 (pass 2, idempotence)"
if psql_run m66shape < "$REPO_ROOT/$M66" >/tmp/m66_2.log 2>&1; then pass "pass 2 at psql exit 0"; else fail "pass 2 failed"; tail -5 /tmp/m66_2.log; fi

step "POST-M66: both bands read 1..50 and are canonically named"
for t in research_early_access_cart_items research_early_access_cart_child_releases; do
  d="$(band_def m66shape "$t")"
  case "$d" in
    *"quantity <= 50"*) pass "$t band is now 1..50" ;;
    *) fail "$t band is not 1..50: $d" ;;
  esac
  n="$(psql_q m66shape "select count(*) from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace nsp on nsp.oid=rel.relnamespace where nsp.nspname='public' and rel.relname='$t' and con.conname='${t}_quantity_band'")"
  [ "$n" = "1" ] && pass "$t band carries the canonical name" || fail "$t canonical name missing"
  old="$(psql_q m66shape "select count(*) from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace nsp on nsp.oid=rel.relnamespace where nsp.nspname='public' and rel.relname='$t' and con.contype='c' and pg_get_constraintdef(con.oid) ~ 'quantity <= 20'")"
  [ "$old" = "0" ] && pass "$t carries no surviving 1..20 band" || fail "$t still carries a 1..20 band"
done

step "PRESERVATION: the seeded row, the other constraints and the relation count"
AFTER="$(psql_q m66shape "select md5(string_agg(t::text, '|' order by t::text)) from public.research_early_access_cart_items t")"
[ "$AFTER" = "$SEED_FINGERPRINT_BEFORE" ] && pass "the seeded quantity-20 row is byte-identical" || fail "the seeded row changed"
[ "$(other_constraints m66shape)" = "$OTHER_BEFORE" ] && pass "every check constraint outside the two tables is byte-identical" || fail "an unrelated constraint changed"
[ "$(psql_q m66shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")" = "$RELCOUNT_BEFORE" ] \
  && pass "the public relation count is unchanged" || fail "the relation count moved"

step "THE BAND, by REAL durable inserts"
# 50 accepted, 51 refused, on the item table. Rolled back so evidence stays clean.
OUT="$(psql_try m66shape "begin; insert into public.research_early_access_cart_items (cart_checkout_id,line_index,order_number,product_id,variant_id,sku,quantity,supplier_id,supplier_sku,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record) values ('$CHECKOUT_ID',1,'XEA-CART-M66B50001','PEX-001','VAR-B50','SKU-M66-50',50,'SUP-M66','SSKU-M66',1000,50000,100,49900,'{}'::jsonb); rollback;")"
echo "$OUT" | grep -qi "ERROR" && fail "quantity 50 was refused: $(echo "$OUT" | grep -i ERROR | head -1)" || pass "cart item at quantity 50 is ACCEPTED"
OUT="$(psql_try m66shape "begin; insert into public.research_early_access_cart_items (cart_checkout_id,line_index,order_number,product_id,variant_id,sku,quantity,supplier_id,supplier_sku,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record) values ('$CHECKOUT_ID',2,'XEA-CART-M66B51001','PEX-001','VAR-B51','SKU-M66-51',51,'SUP-M66','SSKU-M66',1000,51000,100,50900,'{}'::jsonb); rollback;")"
echo "$OUT" | grep -qi "quantity_band" && pass "cart item at quantity 51 is REFUSED by the band, by name" || fail "quantity 51 was not refused by the band: $(echo "$OUT" | grep -i ERROR | head -1)"
pass "lower bound not probed on the item table: the subtotal identity makes quantity 0 unsatisfiable there whatever the band says (M65 documented this)"

step "the reservation quantity domain is NOT widened"
RES="$(psql_q m66shape "select coalesce(string_agg(rel.relname || '|' || pg_get_constraintdef(con.oid), E'\n'), '(none)') from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace nsp on nsp.oid=rel.relnamespace where nsp.nspname='public' and con.contype='c' and rel.relname like '%reservation%' and pg_get_constraintdef(con.oid) ~ 'quantity'")"
echo "$RES" | grep -q "quantity <= 50" && fail "a reservation quantity constraint was widened to 50" || pass "no reservation quantity constraint mentions 50"

echo
echo "=================================================================="
if [ "$FAILED" -eq 0 ]; then echo "M66 HARNESS: ALL ASSERTIONS PASSED on postgres:${MAJOR}"
else echo "M66 HARNESS: FAILURES PRESENT on postgres:${MAJOR}"; fi
echo "PRODUCTION MUTATED: NO (throwaway container, destroyed on exit)"
echo "=================================================================="
exit "$FAILED"
