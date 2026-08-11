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
# WHAT IT PROVES.
#
#   syntax    all three files parse and run on PG16 and PG17;
#   effect    every APPROVED unit ends at a ceiling of twenty;
#   append    history is preserved, nothing is updated in place;
#   carry     price, currency, productVersion, waivers and expiry are unchanged;
#   revoked   a revoked unit is NOT resurrected and NOT widened;
#   noop      a unit already at twenty gets no second release;
#   rerun     running the write twice appends nothing the second time.
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
PRECHECK="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_PRECHECK.sql"
WRITE="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_WRITE.sql"
POSTCHECK="supabase/production/EA_QUANTITY_20_RELEASE_AUTHORITY_POSTCHECK.sql"

for f in "$IDENTITY" "$COMMERCE" "$CART" "$COMPLETION" "$DUPGUARD" "$PRECHECK" "$WRITE" "$POSTCHECK"; do
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
  'recordedAt','2026-08-05T10:00:00.000Z'));
SQL
BEFORE_ROWS="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
[ "$BEFORE_ROWS" = "5" ] || { echo "FAILED: seeded $BEFORE_ROWS rows, expected 5"; exit 1; }
pass "seeded $BEFORE_ROWS ledger rows across 4 units (2 to widen, 1 already at 20, 1 revoked)"

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

C_COUNT="$(psql_q qty20 "select count(*) from public.research_early_access_releases where product_id='prod-c';")"
[ "$C_COUNT" = "1" ] && pass "the unit already at 20 got no second release" || fail "prod-c has $C_COUNT rows"

D_STATUS="$(psql_q qty20 "select status from public.research_early_access_releases where product_id='prod-d' order by recorded_at desc, release_id desc limit 1;")"
[ "$D_STATUS" = "revoked" ] && pass "the revoked unit is still revoked" || fail "prod-d is now $D_STATUS"

HIST="$(psql_q qty20 "select count(*) from public.research_early_access_releases where release_id not like 'rel_ea_qty20_%';")"
[ "$HIST" = "5" ] && pass "all 5 historical rows preserved (append, not update)" || fail "history is now $HIST rows"

TOTAL="$(psql_q qty20 "select count(*) from public.research_early_access_releases;")"
[ "$TOTAL" = "7" ] && pass "ledger is 5 historical + 2 appended = 7 (re-run appended nothing)" || fail "ledger has $TOTAL rows, expected 7"

step "result"
if [ "$FAILED" -eq 0 ]; then
  echo "RELEASE AUTHORITY WRITE REHEARSED OK on PostgreSQL ${MAJOR}"
else
  echo "RELEASE AUTHORITY REHEARSAL FAILED on PostgreSQL ${MAJOR}"
fi
exit "$FAILED"
