#!/usr/bin/env bash
# M66 1-50 candidate verifier for disposable PostgreSQL 16 and 17 only.
#
# This script intentionally refuses by default because the current build order
# says DO NOT APPLY M66. A later authorized release rehearsal must set:
#
#   XENIOS_ALLOW_M66_DISPOSABLE_APPLY=YES ./scripts/verify-m66-quantity-band-50.sh 16
#   XENIOS_ALLOW_M66_DISPOSABLE_APPLY=YES ./scripts/verify-m66-quantity-band-50.sh 17
set -uo pipefail

[ "${XENIOS_ALLOW_M66_DISPOSABLE_APPLY:-}" = "YES" ] || {
  echo "REFUSED: M66 apply is not authorized, even on a disposable database."
  exit 77
}

MAJOR="${1:-16}"
case "$MAJOR" in 16|17) ;; *) echo "PostgreSQL major must be 16 or 17"; exit 2;; esac

NAME="xeniosm66qty50pg${MAJOR}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREREQ=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql"
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql"
  "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql"
  "supabase/migrations/20260808100000_research_early_access_cart_completion.sql"
  "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
  "supabase/migrations/20260809130000_research_early_access_hardening.sql"
  "supabase/migrations/20260810130000_research_early_access_cart_shipping_commitments.sql"
  "supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"
)
M66="supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql"
VERIFY="supabase/verification/research-early-access-cart-quantity-band-50.verify.sql"

for f in "${PREREQ[@]}" "$M66" "$VERIFY"; do
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
docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }

psql_run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }
psql_q() { docker exec -i "$NAME" psql -U postgres -d "$1" -t -A -c "$2"; }
provision() {
  docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database $1" >/dev/null || return 1
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

echo "PostgreSQL evidence:"
docker exec "$NAME" psql -U postgres -tAc 'select version()'
echo "Image evidence: $(docker image inspect "postgres:${MAJOR}-alpine" --format '{{index .RepoDigests 0}}' 2>/dev/null || echo unavailable)"
echo "Candidate commit: $(git -C "$REPO_ROOT" rev-parse HEAD)"
sha256sum "$REPO_ROOT/$M66" "$REPO_ROOT/$VERIFY"

# Bare state must fail closed and leave no constraint behind.
provision m66bare || exit 1
set +e
BARE_OUT="$(psql_run m66bare < "$REPO_ROOT/$M66" 2>&1)"
BARE_RC=$?
set -e
[ "$BARE_RC" -ne 0 ] && echo "$BARE_OUT" | grep -q 'M66 requires canonical M65' || {
  echo "FAIL: bare M66 preflight did not fail closed"
  exit 1
}

provision m66shape || exit 1
for f in "${PREREQ[@]}"; do
  psql_run m66shape < "$REPO_ROOT/$f" >/dev/null || { echo "FAIL prerequisite $f"; exit 1; }
done

# Exact M65 state, including canonical names and validated definitions.
for t in research_early_access_cart_items research_early_access_cart_child_releases; do
  N="$(psql_q m66shape "
    select count(*) from pg_constraint con
    join pg_class rel on rel.oid=con.conrelid
    join pg_namespace nsp on nsp.oid=rel.relnamespace
    where nsp.nspname='public' and rel.relname='$t' and con.contype='c'
      and con.convalidated and con.conname='${t}_quantity_band'
      and regexp_replace(pg_get_expr(con.conbin,con.conrelid),'\\s+','','g')='((quantity>=1)AND(quantity<=20))';")"
  [ "$N" = "1" ] || { echo "FAIL: $t is not exact canonical M65"; exit 1; }
done

# A real quantity-20 item must survive byte-identically.
psql_run m66shape <<'SQL' >/dev/null || exit 1
insert into public.research_early_access_cart_quotes
  (quote_id,customer_ref,intent_hash,quote_hash,record,quoted_at,expires_at)
values ('xeaq_m66preserve00000001','eac_'||repeat('b',32),repeat('b',64),repeat('c',64),'{}',now(),now()+interval '1 hour');
insert into public.research_early_access_cart_checkouts
  (checkout_number,customer_ref,idempotency_key_hash,intent_hash,quote_id,payment_state,currency,subtotal_cents,discount_cents,shipping_cents,tax_cents,payable_total_cents,record,placed_at)
values ('XEC-M66PRESERVE000000001','eac_'||repeat('b',32),repeat('d',64),repeat('b',64),'xeaq_m66preserve00000001','awaiting_payment','USD',20000,0,0,0,20000,'{}',now());
insert into public.research_early_access_cart_items
  (cart_checkout_id,line_index,order_number,product_id,variant_id,sku,quantity,supplier_id,supplier_sku,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record)
select id,0,'XEA-CART-M66PRESERVE-01','prod-pre','var-pre','SKU-PRE',20,'sup-pre','SUPSKU-PRE',1000,20000,0,20000,'{}'
from public.research_early_access_cart_checkouts where checkout_number='XEC-M66PRESERVE000000001';
SQL
BEFORE_ROW="$(psql_q m66shape "select row_to_json(x)::text from (select quantity,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record from public.research_early_access_cart_items where order_number='XEA-CART-M66PRESERVE-01') x")"
[ -n "$BEFORE_ROW" ] || { echo "FAIL: preservation seed absent"; exit 1; }
BEFORE_RELATIONS="$(psql_q m66shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")"
BEFORE_OTHER="$(psql_q m66shape "select md5(coalesce(string_agg(rel.relname||'|'||con.conname||'|'||pg_get_constraintdef(con.oid),E'\\n' order by rel.relname,con.conname),'')) from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace nsp on nsp.oid=rel.relnamespace where nsp.nspname='public' and rel.relname not in ('research_early_access_cart_items','research_early_access_cart_child_releases')")"

psql_run m66shape < "$REPO_ROOT/$M66" >/dev/null || { echo "FAIL M66 first apply"; exit 1; }
psql_run m66shape < "$REPO_ROOT/$VERIFY" >/dev/null || { echo "FAIL M66 first verification"; exit 1; }
psql_run m66shape < "$REPO_ROOT/$M66" >/dev/null || { echo "FAIL M66 second apply"; exit 1; }
psql_run m66shape < "$REPO_ROOT/$VERIFY" >/dev/null || { echo "FAIL M66 second verification"; exit 1; }

AFTER_ROW="$(psql_q m66shape "select row_to_json(x)::text from (select quantity,unit_price_cents,subtotal_cents,discount_cents,payable_cents,record from public.research_early_access_cart_items where order_number='XEA-CART-M66PRESERVE-01') x")"
AFTER_RELATIONS="$(psql_q m66shape "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")"
AFTER_OTHER="$(psql_q m66shape "select md5(coalesce(string_agg(rel.relname||'|'||con.conname||'|'||pg_get_constraintdef(con.oid),E'\\n' order by rel.relname,con.conname),'')) from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace nsp on nsp.oid=rel.relnamespace where nsp.nspname='public' and rel.relname not in ('research_early_access_cart_items','research_early_access_cart_child_releases')")"

[ "$BEFORE_ROW" = "$AFTER_ROW" ] || { echo "FAIL: quantity-20 row changed"; exit 1; }
[ "$BEFORE_RELATIONS" = "$AFTER_RELATIONS" ] || { echo "FAIL: relation count changed"; exit 1; }
[ "$BEFORE_OTHER" = "$AFTER_OTHER" ] || { echo "FAIL: unrelated constraints changed"; exit 1; }
echo "M66 VERIFIED on PostgreSQL $MAJOR"
