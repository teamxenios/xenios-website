#!/usr/bin/env bash
# REHEARSAL for the Early Access release-authority quantity write.
#
#   ./scripts/rehearse-ea-quantity-20-release-authority.sh 16
#   ./scripts/rehearse-ea-quantity-20-release-authority.sh 17
#
# WHY THIS EXISTS.
#
# EA_QUANTITY_20_RELEASE_AUTHORITY_WRITE.sql will eventually run against the
# production release ledger. Handing a reviewer a file that has never been
# executed anywhere is handing them an untested migration with a nicer name. This
# runs the precheck, the write and the postcheck end to end against a THROWAWAY
# container seeded to look like production: releases at the old ceiling of three,
# one revoked unit, and one unit already at twenty.
#
# IT TOUCHES NOTHING REAL. Everything happens inside a container this script
# creates and deletes.
#
# WHAT IT PROVES (the Final Review adversarial matrix, A through H).
#
#   A  current limit = 3        -> append a new release at 20
#   B  current limit = 20       -> append nothing
#   C  current limit = 25       -> append nothing, preserve 25 EXACTLY (no downgrade)
#   D  current unit revoked     -> append nothing, stays revoked
#   E  M65 absent               -> WRITE aborts, zero new release rows
#   F  old 1-3 band present     -> WRITE aborts, zero new release rows
#   G  M65 installed            -> WRITE allowed to proceed
#   H  rerun                    -> zero duplicate append
#
# plus: history preserved (append, never update), and price, currency,
# productVersion, waivers and expiry carried forward unchanged.
set -uo pipefail
MAJOR="${1:-16}"
NAME="xeniosqty20rehearse${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

COMMERCE="supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
IDENTITY="supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
CART="supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
# M60 and M61 are applied too, so the rehearsal database has the SAME checkout
# shape production does, `disposition` included. Without them the precheck's
# last read runs against a table that predates M61 and the rehearsal would be
# proving the write against a database nobody actually has.
COMPLETION="supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
DUPGUARD="supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
# M65 itself, because cases E, F and G turn on whether it has been applied.
M65="supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"
PRECHECK="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_PRECHECK.sql"
WRITE="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_WRITE.sql"
POSTCHECK="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_POSTCHECK.sql"

for f in "$IDENTITY" "$COMMERCE" "$CART" "$COMPLETION" "$DUPGUARD" "$M65" "$PRECHECK" "$WRITE" "$POSTCHECK"; do
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

psql_run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
psql_q()   { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2"; }

step "provisioning the managed-Supabase shape"
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database qty20;" >/dev/null
psql_run qty20 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL

for f in "$IDENTITY" "$COMMERCE" "$CART" "$COMPLETION" "$DUPGUARD"; do
  psql_run qty20 < "$REPO_ROOT/$f" >/dev/null || { echo "FAILED $f"; exit 1; }
  echo "   ok $(basename "$f")"
done

step "seeding a ledger shaped like production"
# Four units:
#   A, B  approved at the OLD ceiling of 3   -> must be widened
#   C     approved already at 20             -> must be left alone
#   D     approved then REVOKED              -> must NOT be widened or resurrected
psql_run qty20 <<'SQL' >/dev/null || { echo "FAILED to seed"; exit 1; }
insert into public.research_early_access_releases (release_id, product_id, variant_id, status, recorded_at, record) values
('rel-first-a','prod-a','var-a','approved','2026-08-04T22:00:00Z', jsonb_build_object(
  'releaseId','rel-first-a','portal','private_early_access','productId','prod-a','variantId','var-a',
  'productVersion','ver-a-001','status','approved','approvedPriceCents',3350,'currency','USD',
  'waivedBlockers', jsonb_build_array('QUANTITY_LIMIT_MISSING','IMAGE_PENDING'),
  'approvedQuantityLimit',3,'expiresAt',null,'actor','Samuel Boadu','reason','first release',
  'recordedAt','2026-08-04T22:00:00.000Z')),
('rel-first-b','prod-b','var-b','approved','2026-08-04T22:00:00Z', jsonb_build_object(
  'releaseId','rel-first-b','portal','private_early_access','productId','prod-b','variantId','var-b',
  'productVersion','ver-b-001','status','approved','approvedPriceCents',10075,'currency','USD',
  'waivedBlockers', jsonb_build_array('QUANTITY_LIMIT_MISSING'),
  'approvedQuantityLimit',3,'expiresAt','2027-01-01T00:00:00.000Z','actor','Samuel Boadu','reason','first release',
  'recordedAt','2026-08-04T22:00:00.000Z')),
('rel-first-c','prod-c','var-c','approved','2026-08-04T22:00:00Z', jsonb_build_object(
  'releaseId','rel-first-c','portal','private_early_access','productId','prod-c','variantId','var-c',
  'productVersion','ver-c-001','status','approved','approvedPriceCents',5000,'currency','USD',
  'waivedBlockers', jsonb_build_array('QUANTITY_LIMIT_MISSING'),
  'approvedQuantityLimit',20,'expiresAt',null,'actor','Samuel Boadu','reason','already widened',
  'recordedAt','2026-08-04T22:00:00.000Z')),
('rel-first-d','prod-d','var-d','approved','2026-08-04T22:00:00Z', jsonb_build_object(
  'releaseId','rel-first-d','portal','private_early_access','productId','prod-d','variantId','var-d',
  'productVersion','ver-d-001','status','approved','approvedPriceCents',7000,'currency','USD',
  'waivedBlockers', jsonb_build_array('QUANTITY_LIMIT_MISSING'),
  'approvedQuantityLimit',3,'expiresAt',null,'actor','Samuel Boadu','reason','first release',
  'recordedAt','2026-08-04T22:00:00.000Z')),
('rel-revoke-d','prod-d','var-d','revoked','2026-08-05T10:00:00Z', jsonb_build_object(
  'releaseId','rel-revoke-d','portal','private_early_access','productId','prod-d','variantId','var-d',
  'productVersion','ver-d-001','status','revoked','approvedPriceCents',7000,'currency','USD',
  'waivedBlockers', jsonb_build_array(),
  'approvedQuantityLimit',0,'expiresAt',null,'actor','Samuel Boadu','reason','withdrawn',
  'recordedAt','2026-08-05T10:00:00.000Z')),
-- CASE C: a founder approval ALREADY ABOVE twenty. The whole point of the O-2
-- correction: this must be left at 25, not rewritten down to 20.
('rel-first-e','prod-e','var-e','approved','2026-08-04T22:00:00Z', jsonb_build_object(
  'releaseId','rel-first-e','portal','private_early_access','productId','prod-e','variantId','var-e',
  'productVersion','ver-e-001','status','approved','approvedPriceCents',9000,'currency','USD',
  'waivedBlockers', jsonb_build_array('QUANTITY_LIMIT_MISSING'),
  'approvedQuantityLimit',25,'expiresAt',null,'actor','Samuel Boadu','reason','approved above the round band',
  'recordedAt','2026-08-04T22:00:00.000Z'));
SQL
BEFORE_ROWS="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
[ "$BEFORE_ROWS" = "6" ] || { echo "FAILED: seeded $BEFORE_ROWS rows, expected 6"; exit 1; }
pass "seeded $BEFORE_ROWS ledger rows across 5 units (2 to widen, 1 at 20, 1 at 25, 1 revoked)"

# The postcheck asserts the founder checkout exists, so the rehearsal provides
# one. It is never read or written by the release-authority work.
psql_run qty20 <<'SQL' >/dev/null || { echo "FAILED to seed the checkout"; exit 1; }
insert into public.research_early_access_cart_quotes
  (quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at)
values ('xeaq_rehearse0000000001','eac_'||repeat('a',32),repeat('a',64),repeat('e',64),'{}'::jsonb, now(), now()+interval '1 hour');
insert into public.research_early_access_cart_checkouts
  (checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id, payment_state,
   currency, subtotal_cents, discount_cents, shipping_cents, tax_cents, payable_total_cents, record, placed_at)
values ('XEC-E1703CC63BBE89E6839E24C1','eac_'||repeat('a',32),repeat('f',64),repeat('a',64),
        'xeaq_rehearse0000000001','awaiting_payment','USD',3350,0,0,0,3350,'{}'::jsonb, now());
SQL

# ===========================================================================
# CASE E: M65 IS ABSENT. The write must ABORT before appending anything.
# ===========================================================================
# This is the O-1 blocker made structural. At this point in the script M65 has
# deliberately NOT been applied, so both tables still carry the 1..3 band. If
# the write were to proceed here it would raise the founder ceiling to twenty
# on a database that physically cannot store a cart item of twenty, and the
# failure would land on a customer who has already been quoted.
step "CASE E: M65 absent -> WRITE must abort with zero appends"
E_BEFORE="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
E_OUT="$(psql_run qty20 < "$REPO_ROOT/$WRITE" 2>&1)"
E_RC=$?
E_AFTER="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
if [ "$E_RC" -ne 0 ] && echo "$E_OUT" | grep -q "M65 is NOT installed"; then
  pass "the write refused on a pre-M65 database, naming M65"
else
  fail "the write did NOT fail closed pre-M65 (rc=$E_RC): $E_OUT"
fi
[ "$E_AFTER" = "$E_BEFORE" ] \
  && pass "zero release rows appended by the refused write (still $E_AFTER)" \
  || fail "the refused write appended rows: $E_BEFORE -> $E_AFTER"

# ===========================================================================
# CASE G: M65 INSTALLED. The write is now permitted to proceed.
# ===========================================================================
step "CASE G: applying M65"
psql_run qty20 < "$REPO_ROOT/$M65" >/dev/null || { echo "FAILED to apply M65"; exit 1; }
pass "M65 applied; both tables now carry the 1..20 band"

# ===========================================================================
# CASE F: THE OLD 1-3 BAND IS STILL PRESENT ON A TABLE.
# ===========================================================================
# A half-migrated database: M65's canonical band exists, but a 1..3 constraint
# survives alongside it (a restored snapshot, a partial apply, a hand-added
# constraint). The narrower one still wins at insert time, so the write must
# refuse rather than trust the presence of the new band alone.
step "CASE F: a surviving 1-3 band -> WRITE must abort with zero appends"
psql_run qty20 <<'SQL' >/dev/null || { echo "FAILED to add the stray band"; exit 1; }
alter table public.research_early_access_cart_items
  add constraint research_ea_cart_items_stray_legacy_band check (quantity >= 1 and quantity <= 3);
SQL
F_BEFORE="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
F_OUT="$(psql_run qty20 < "$REPO_ROOT/$WRITE" 2>&1)"
F_RC=$?
F_AFTER="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
if [ "$F_RC" -ne 0 ] && echo "$F_OUT" | grep -q "still carries a 1..3 quantity band"; then
  pass "the write refused while a 1..3 band survived"
else
  fail "the write did NOT fail closed with a stray 1..3 band (rc=$F_RC): $F_OUT"
fi
[ "$F_AFTER" = "$F_BEFORE" ] \
  && pass "zero release rows appended by the refused write (still $F_AFTER)" \
  || fail "the refused write appended rows: $F_BEFORE -> $F_AFTER"
psql_run qty20 <<'SQL' >/dev/null || { echo "FAILED to drop the stray band"; exit 1; }
alter table public.research_early_access_cart_items
  drop constraint research_ea_cart_items_stray_legacy_band;
SQL
pass "stray band removed; the database is cleanly post-M65 again"

step "PRECHECK (must be read-only and must report 2 units to widen)"
psql_run qty20 < "$REPO_ROOT/$PRECHECK" > /tmp/qty20-precheck.txt 2>&1 \
  && pass "precheck ran at exit 0" || fail "precheck failed"
AFTER_PRECHECK_ROWS="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
[ "$AFTER_PRECHECK_ROWS" = "$BEFORE_ROWS" ] \
  && pass "precheck wrote nothing (still $AFTER_PRECHECK_ROWS rows)" \
  || fail "precheck CHANGED the ledger: $BEFORE_ROWS -> $AFTER_PRECHECK_ROWS"
grep -q "prod-a" /tmp/qty20-precheck.txt && grep -q "prod-b" /tmp/qty20-precheck.txt \
  && pass "precheck named both units that need widening" \
  || fail "precheck did not name the write set"

step "WRITE"
psql_run qty20 < "$REPO_ROOT/$WRITE" 2>&1 | grep -E "NOTICE|ERROR" || true
psql_run qty20 < "$REPO_ROOT/$WRITE" >/dev/null 2>&1
# (the line above is the RE-RUN; the first invocation already applied it)

step "POSTCHECK"
psql_run qty20 < "$REPO_ROOT/$POSTCHECK" > /tmp/qty20-postcheck.txt 2>&1
POST_RC=$?
grep -E "^(NOTICE:  PASS|ERROR|FAIL)" /tmp/qty20-postcheck.txt || true
if [ "$POST_RC" -eq 0 ] && ! grep -qE "^(ERROR|FAIL)" /tmp/qty20-postcheck.txt; then
  pass "postcheck green"
else
  fail "postcheck failed"
fi

step "the effects, checked independently of the postcheck's own assertions"
A_LIMIT="$(psql_q qty20 "select (record->>'approvedQuantityLimit') from public.research_early_access_releases where product_id='prod-a' order by recorded_at desc, release_id desc limit 1;")"
B_LIMIT="$(psql_q qty20 "select (record->>'approvedQuantityLimit') from public.research_early_access_releases where product_id='prod-b' order by recorded_at desc, release_id desc limit 1;")"
[ "$A_LIMIT" = "20" ] && pass "prod-a now resolves to 20" || fail "prod-a resolves to $A_LIMIT"
[ "$B_LIMIT" = "20" ] && pass "prod-b now resolves to 20" || fail "prod-b resolves to $B_LIMIT"

B_PRICE="$(psql_q qty20 "select (record->>'approvedPriceCents') from public.research_early_access_releases where product_id='prod-b' order by recorded_at desc, release_id desc limit 1;")"
B_VER="$(psql_q qty20 "select (record->>'productVersion') from public.research_early_access_releases where product_id='prod-b' order by recorded_at desc, release_id desc limit 1;")"
B_EXP="$(psql_q qty20 "select (record->>'expiresAt') from public.research_early_access_releases where product_id='prod-b' order by recorded_at desc, release_id desc limit 1;")"
[ "$B_PRICE" = "10075" ] && pass "prod-b price carried forward unchanged" || fail "prod-b price became $B_PRICE"
[ "$B_VER" = "ver-b-001" ] && pass "prod-b productVersion carried forward (cannot make it stale)" || fail "prod-b version became $B_VER"
[ "$B_EXP" = "2027-01-01T00:00:00.000Z" ] && pass "prod-b expiry carried forward" || fail "prod-b expiry became $B_EXP"

# CASE B: already at exactly 20.
C_COUNT="$(psql_q qty20 "select count(*) from public.research_early_access_releases where product_id='prod-c';")"
[ "$C_COUNT" = "1" ] && pass "the unit already at 20 got no second release" || fail "prod-c has $C_COUNT rows"

# CASE D: revoked.
D_STATUS="$(psql_q qty20 "select status from public.research_early_access_releases where product_id='prod-d' order by recorded_at desc, release_id desc limit 1;")"
[ "$D_STATUS" = "revoked" ] && pass "the revoked unit is still revoked" || fail "prod-d is now $D_STATUS"

# CASE C: ALREADY ABOVE 20. THE O-2 REGRESSION GUARD.
# Under the rejected `<> 20` predicate this unit was a target and would have
# been rewritten DOWN to 20. It must now be untouched, at exactly 25, with no
# second release row.
E_COUNT="$(psql_q qty20 "select count(*) from public.research_early_access_releases where product_id='prod-e';")"
E_LIMIT="$(psql_q qty20 "select (record->>'approvedQuantityLimit') from public.research_early_access_releases where product_id='prod-e' order by recorded_at desc, release_id desc limit 1;")"
[ "$E_COUNT" = "1" ] && pass "the unit approved at 25 got NO second release" || fail "prod-e has $E_COUNT rows"
[ "$E_LIMIT" = "25" ] && pass "the unit approved at 25 is PRESERVED at 25, not downgraded" || fail "prod-e was rewritten to $E_LIMIT"

HIST="$(psql_q qty20 "select count(*) from public.research_early_access_releases where release_id not like 'rel_ea_qty20_%';")"
[ "$HIST" = "6" ] && pass "all 6 historical rows preserved (append, not update)" || fail "history is now $HIST rows"

TOTAL="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
[ "$TOTAL" = "8" ] && pass "ledger is 6 historical + 2 appended = 8 (re-run appended nothing)" || fail "ledger has $TOTAL rows, expected 8"

step "result"
if [ "$FAILED" -eq 0 ]; then
  echo "RELEASE AUTHORITY WRITE REHEARSED OK on PostgreSQL ${MAJOR}"
else
  echo "RELEASE AUTHORITY REHEARSAL FAILED on PostgreSQL ${MAJOR}"
fi
exit "$FAILED"
