#!/usr/bin/env bash
# Disposable PG16/PG17 rehearsal for the quantity-50 release-authority chain.
# Refuses by default. This candidate was built under an explicit DO NOT APPLY
# M66 / DO NOT WRITE PRODUCTION AUTHORITY instruction.
set -uo pipefail

[ "${XENIOS_ALLOW_M66_DISPOSABLE_APPLY:-}" = "YES" ] &&
[ "${XENIOS_ALLOW_QTY50_AUTHORITY_REHEARSAL:-}" = "YES" ] || {
  echo "REFUSED: M66 and quantity-50 rehearsal are not authorized."
  exit 77
}

MAJOR="${1:-16}"
case "$MAJOR" in 16|17) ;; *) echo "PostgreSQL major must be 16 or 17"; exit 2;; esac
NAME="xeniosqty50candidatepg${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILES=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
  "supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
  "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
  "supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"
)
M66="supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql"
PRE="supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_PRECHECK.sql"
WRITE="supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_WRITE.sql"
POST="supabase/production/EA_QUANTITY_50_RELEASE_CANDIDATE_POSTCHECK.sql"
for f in "${FILES[@]}" "$M66" "$PRE" "$WRITE" "$POST"; do
  [ -f "$REPO_ROOT/$f" ] || { echo "missing $f"; exit 1; }
done

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "postgres:${MAJOR}-alpine" >/dev/null || exit 1
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || exit 1

psql_run() { docker exec -i "$NAME" psql -U postgres -d qty50 -v ON_ERROR_STOP=1 -q; }
psql_q() { docker exec -i "$NAME" psql -U postgres -d qty50 -t -A -c "$1"; }
psql_file() {
  local file="$1"; shift
  docker exec -i "$NAME" psql -U postgres -d qty50 -v ON_ERROR_STOP=1 -q "$@" < "$REPO_ROOT/$file"
}

docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c 'create database qty50' >/dev/null || exit 1
psql_run <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
for f in "${FILES[@]}"; do psql_file "$f" >/dev/null || exit 1; done

psql_run <<'SQL'
insert into public.research_early_access_releases
  (release_id,product_id,variant_id,status,recorded_at,record) values
('rel-a20','prod-a','var-a','approved','2026-08-11T12:00:00Z',jsonb_build_object(
 'releaseId','rel-a20','portal','private_early_access','productId','prod-a','variantId','var-a',
 'productVersion','ver-a','status','approved','approvedPriceCents',3350,'currency','USD',
 'waivedBlockers',jsonb_build_array('QUANTITY_LIMIT_MISSING'),'approvedQuantityLimit',20,
 'expiresAt',null,'actor','Samuel Boadu','reason','accepted quantity twenty fixture','recordedAt','2026-08-11T12:00:00.000Z')),
('rel-d20','prod-d','var-d','approved','2026-08-11T12:00:00Z',jsonb_build_object(
 'releaseId','rel-d20','portal','private_early_access','productId','prod-d','variantId','var-d',
 'productVersion','ver-d','status','approved','approvedPriceCents',9000,'currency','USD',
 'waivedBlockers',jsonb_build_array(),'approvedQuantityLimit',20,
 'expiresAt',null,'actor','Named Human','reason','prior approved fixture','recordedAt','2026-08-11T12:00:00.000Z')),
('rel-d-revoked','prod-d','var-d','revoked','2026-08-11T13:00:00Z',jsonb_build_object(
 'releaseId','rel-d-revoked','portal','private_early_access','productId','prod-d','variantId','var-d',
 'productVersion','ver-d','status','revoked','approvedPriceCents',0,'currency','',
 'waivedBlockers',jsonb_build_array(),'approvedQuantityLimit',0,
 'expiresAt',null,'actor','Named Human','reason','revoked fixture','recordedAt','2026-08-11T13:00:00.000Z'));

insert into public.research_early_access_cart_quotes
 (quote_id,customer_ref,intent_hash,quote_hash,record,quoted_at,expires_at)
values ('xeaq_qty50rehearse000001','eac_'||repeat('a',32),repeat('a',64),repeat('b',64),'{}',now(),now()+interval '1 hour');
insert into public.research_early_access_cart_checkouts
 (checkout_number,customer_ref,idempotency_key_hash,intent_hash,quote_id,payment_state,currency,subtotal_cents,discount_cents,shipping_cents,tax_cents,payable_total_cents,record,placed_at)
values ('XEC-E1703CC63BBE89E6839E24C1','eac_'||repeat('a',32),repeat('c',64),repeat('a',64),
 'xeaq_qty50rehearse000001','awaiting_payment','USD',3350,0,0,0,3350,'{}',now());
SQL

history_hash() { psql_q "select md5(coalesce(string_agg(release_id||'|'||product_id||'|'||variant_id||'|'||status||'|'||recorded_at::text||'|'||record::text,E'\\n' order by release_id),'')) from public.research_early_access_releases where not starts_with(release_id,'rel_ea_qty50_')"; }
target_count() { psql_q "with latest as (select distinct on(product_id,variant_id) product_id,variant_id,release_id,status,record from public.research_early_access_releases order by product_id,variant_id,recorded_at desc,release_id desc) select count(*) from latest where status='approved' and (record->>'approvedQuantityLimit')::integer=20"; }
target_hash() { psql_q "with latest as (select distinct on(product_id,variant_id) product_id,variant_id,release_id,status,record from public.research_early_access_releases order by product_id,variant_id,recorded_at desc,release_id desc) select md5(coalesce(string_agg(product_id||'|'||variant_id||'|'||release_id,E'\\n' order by product_id,variant_id),'')) from latest where status='approved' and (record->>'approvedQuantityLimit')::integer=20"; }
founder_hash() { psql_q "select md5(jsonb_build_object('checkout',(select to_jsonb(c) from public.research_early_access_cart_checkouts c where c.checkout_number='XEC-E1703CC63BBE89E6839E24C1'),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.line_index) from public.research_early_access_cart_items i join public.research_early_access_cart_checkouts c on c.id=i.cart_checkout_id where c.checkout_number='XEC-E1703CC63BBE89E6839E24C1'),'[]'::jsonb),'invoice',(select to_jsonb(v) from public.research_early_access_cart_invoices v join public.research_early_access_cart_checkouts c on c.id=v.cart_checkout_id where c.checkout_number='XEC-E1703CC63BBE89E6839E24C1'))::text)"; }
run_write() {
  psql_file "$WRITE" \
    -v "decision_actor=QA Named Human" \
    -v "decision_reason=Disposable quantity fifty authority rehearsal only; not production authority." \
    -v "expected_target_count=$1" \
    -v "expected_target_set_md5=$2" \
    -v "expected_historical_release_md5=$3" \
    -v "expected_founder_checkout_md5=$4"
}

HIST="$(history_hash)"; TCOUNT="$(target_count)"; TARGETS="$(target_hash)"; FOUNDER="$(founder_hash)"
[ "$TCOUNT" = "1" ] || { echo "FAIL expected one 20->50 target, got $TCOUNT"; exit 1; }
BASE_ROWS="$(psql_q 'select count(*) from public.research_early_access_releases')"

# M66 absent: exact write exit must be nonzero and row count unchanged.
set +e; run_write "$TCOUNT" "$TARGETS" "$HIST" "$FOUNDER" >/tmp/qty50-m66-absent.txt 2>&1; RC=$?; set -e
[ "$RC" -ne 0 ] || { echo "FAIL write passed without M66"; exit 1; }
[ "$(psql_q 'select count(*) from public.research_early_access_releases')" = "$BASE_ROWS" ] || exit 1

psql_file "$M66" >/dev/null || exit 1

# An unexpected current approved limit (19) must fail closed. Neutralize it by
# appending a later revoked row; history stays append-only and is then bound by
# the valid precheck hashes.
psql_run <<'SQL'
insert into public.research_early_access_releases
  (release_id,product_id,variant_id,status,recorded_at,record) values
('rel-x19','prod-x','var-x','approved','2026-08-11T14:00:00Z',jsonb_build_object(
 'releaseId','rel-x19','portal','private_early_access','productId','prod-x','variantId','var-x',
 'productVersion','ver-x','status','approved','approvedPriceCents',1000,'currency','USD',
 'waivedBlockers',jsonb_build_array(),'approvedQuantityLimit',19,
 'expiresAt',null,'actor','QA Human','reason','unexpected predecessor fixture','recordedAt','2026-08-11T14:00:00.000Z'));
SQL
UNEXPECTED_ROWS="$(psql_q 'select count(*) from public.research_early_access_releases')"
set +e; psql_file "$PRE" >/tmp/qty50-unexpected19.txt 2>&1; RC=$?; set -e
[ "$RC" -ne 0 ] || { echo "FAIL precheck passed with unexpected approved limit 19"; exit 1; }
[ "$(psql_q 'select count(*) from public.research_early_access_releases')" = "$UNEXPECTED_ROWS" ] || exit 1
psql_run <<'SQL'
insert into public.research_early_access_releases
  (release_id,product_id,variant_id,status,recorded_at,record) values
('rel-x-revoked','prod-x','var-x','revoked','2026-08-11T15:00:00Z',jsonb_build_object(
 'releaseId','rel-x-revoked','portal','private_early_access','productId','prod-x','variantId','var-x',
 'productVersion','ver-x','status','revoked','approvedPriceCents',0,'currency','',
 'waivedBlockers',jsonb_build_array(),'approvedQuantityLimit',0,
 'expiresAt',null,'actor','QA Human','reason','neutralize unexpected predecessor fixture','recordedAt','2026-08-11T15:00:00.000Z'));
SQL
HIST="$(history_hash)"; TCOUNT="$(target_count)"; TARGETS="$(target_hash)"; FOUNDER="$(founder_hash)"
[ "$TCOUNT" = "1" ] || { echo "FAIL expected one exact 20->50 target after neutralization, got $TCOUNT"; exit 1; }
BASE_ROWS="$(psql_q 'select count(*) from public.research_early_access_releases')"
psql_file "$PRE" >/tmp/qty50-precheck.txt 2>&1 || { echo "FAIL precheck"; exit 1; }
[ "$(psql_q 'select count(*) from public.research_early_access_releases')" = "$BASE_ROWS" ] || { echo "FAIL precheck wrote"; exit 1; }

# A stray 1..49 band must block the write even though canonical M66 exists.
psql_run <<'SQL'
alter table public.research_early_access_cart_items
  add constraint research_ea_qty50_stray_band check (quantity >= 1 and quantity <= 49);
SQL
set +e; run_write "$TCOUNT" "$TARGETS" "$HIST" "$FOUNDER" >/tmp/qty50-stray.txt 2>&1; RC=$?; set -e
[ "$RC" -ne 0 ] || { echo "FAIL write passed with stray 1..49 band"; exit 1; }
[ "$(psql_q 'select count(*) from public.research_early_access_releases')" = "$BASE_ROWS" ] || exit 1
psql_q 'alter table public.research_early_access_cart_items drop constraint research_ea_qty50_stray_band' >/dev/null

# First authorized rehearsal apply: exact exit 0 and exact +1 delta.
run_write "$TCOUNT" "$TARGETS" "$HIST" "$FOUNDER" >/tmp/qty50-write-first.txt 2>&1 || { echo "FAIL first write"; exit 1; }
FIRST_ROWS="$(psql_q 'select count(*) from public.research_early_access_releases')"
[ "$FIRST_ROWS" -eq $((BASE_ROWS + 1)) ] || { echo "FAIL first delta $BASE_ROWS->$FIRST_ROWS"; exit 1; }
psql_file "$POST" -v "expected_historical_release_md5=$HIST" -v "expected_founder_checkout_md5=$FOUNDER" >/tmp/qty50-post.txt 2>&1 || { echo "FAIL postcheck"; exit 1; }

[ "$(psql_q "select record->>'approvedQuantityLimit' from public.research_early_access_releases where product_id='prod-a' order by recorded_at desc,release_id desc limit 1")" = "50" ] || exit 1
[ "$(psql_q "select status from public.research_early_access_releases where product_id='prod-d' order by recorded_at desc,release_id desc limit 1")" = "revoked" ] || exit 1

# Second apply: independently checked exit 0 and exact zero-row delta.
TCOUNT2="$(target_count)"; TARGETS2="$(target_hash)"
[ "$TCOUNT2" = "0" ] || { echo "FAIL rerun still has targets"; exit 1; }
run_write "$TCOUNT2" "$TARGETS2" "$HIST" "$FOUNDER" >/tmp/qty50-write-second.txt 2>&1 || { echo "FAIL second write"; exit 1; }
[ "$(psql_q 'select count(*) from public.research_early_access_releases')" = "$FIRST_ROWS" ] || { echo "FAIL rerun appended"; exit 1; }

echo "QUANTITY-50 RELEASE AUTHORITY REHEARSED OK on PostgreSQL $MAJOR"
