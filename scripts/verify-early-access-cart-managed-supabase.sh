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
M61="supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql"
M62="supabase/migrations/20260809130000_research_early_access_hardening.sql"
PREREQ=(
  "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql"
  "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql"
  "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql"
  "supabase/migrations/20260804123000_research_early_access_reservation_holds.sql"
)
for f in "${PREREQ[@]}" "$M58" "$M60" "$M61" "$M62"; do
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

echo "== applying migration 61, the duplicate guard =="
psql_run cartshape < "$REPO_ROOT/$M61" || { echo "FAILED migration 61"; exit 1; }
psql_run cartshape < "$REPO_ROOT/$M61" || { echo "FAILED migration 61 second apply"; exit 1; }
echo "   ok (applied twice)"

echo "== behavioural suite, so the digest calls actually EXECUTE =="
psql_run cartshape < "$REPO_ROOT/supabase/production/research-early-access-cart-completion-verification.sql" \
  || { echo "FAILED behavioural suite"; exit 1; }
echo "   ok (the invariant does not break the ordinary cart flow)"

echo "== applying migration 62, durable hardening =="
psql_run cartshape < "$REPO_ROOT/$M62" || { echo "FAILED migration 62"; exit 1; }
psql_run cartshape < "$REPO_ROOT/$M62" || { echo "FAILED migration 62 second apply"; exit 1; }
echo "   ok (applied twice)"

OLD_SETTLEMENT=$(psql_q cartshape "select has_function_privilege('service_role','public.research_early_access_commit_cart_settlement_m60_core(text,text,text,bigint,text,text,timestamptz)','execute');")
NEW_SETTLEMENT=$(psql_q cartshape "select has_function_privilege('service_role','public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)','execute');")
echo "   private M60 core callable by service_role : $OLD_SETTLEMENT (must be f)"
echo "   hardened settlement callable by service_role: $NEW_SETTLEMENT (must be t)"
[ "$OLD_SETTLEMENT" = "f" ] && [ "$NEW_SETTLEMENT" = "t" ] || { echo "FAILED: settlement privilege boundary"; exit 1; }

echo "== M62 durable invariant suite =="
psql_run cartshape < "$REPO_ROOT/supabase/verification/research-early-access-hardening.verify.sql" \
  || { echo "FAILED M62 durable invariant suite"; exit 1; }
echo "   ok"

echo "== M62 six-way settlement concurrency =="
for N in $(seq 1 6); do
  psql_q cartshape "select public.research_early_access_commit_cart_settlement(
    'XEC-M62CONCURRENT00000000','WIRE-M62-CONCURRENT','eaext.M62ConcurrentEvid01',
    12000,'USD','admin@example.com',true,true,'2000-01-01T00:00:00Z');" \
    > "/tmp/${NAME}-m62-settle-${N}.out" &
done
wait
M62_SETTLEMENTS=$(psql_q cartshape "select count(*) from public.research_early_access_cart_settlements s join public.research_early_access_cart_checkouts c on c.id=s.cart_checkout_id where c.checkout_number='XEC-M62CONCURRENT00000000';")
M62_RECEIPTS=$(psql_q cartshape "select count(*) from public.research_early_access_cart_receipts r join public.research_early_access_cart_checkouts c on c.id=r.cart_checkout_id where c.checkout_number='XEC-M62CONCURRENT00000000';")
M62_RELEASES=$(psql_q cartshape "select count(*) from public.research_early_access_cart_child_releases r join public.research_early_access_cart_checkouts c on c.id=r.cart_checkout_id where c.checkout_number='XEC-M62CONCURRENT00000000';")
M62_HARDENING=$(psql_q cartshape "select count(*) from public.research_early_access_cart_settlement_hardening h join public.research_early_access_cart_checkouts c on c.id=h.cart_checkout_id where c.checkout_number='XEC-M62CONCURRENT00000000';")
echo "   settlements=$M62_SETTLEMENTS receipts=$M62_RECEIPTS releases=$M62_RELEASES hardening=$M62_HARDENING (all must be 1)"
[ "$M62_SETTLEMENTS" = "1" ] && [ "$M62_RECEIPTS" = "1" ] && [ "$M62_RELEASES" = "1" ] && [ "$M62_HARDENING" = "1" ] \
  || { echo "FAILED: six-way settlement did not converge exactly once"; exit 1; }

echo "== ONE ACTIVE CHECKOUT PER QUOTE, enforced by the database =="
IDX=$(psql_q cartshape "select count(*) from pg_indexes where indexname='research_ea_cart_checkout_active_quote_uidx';")
echo "   partial unique index present : $IDX (must be 1)"
[ "$IDX" = "1" ] || { echo "FAILED: the invariant index was not created"; exit 1; }

# The production incident, at the level Node cannot fake: two rows, one quote,
# different idempotency keys. The second INSERT must be refused by Postgres
# itself. Exit status is the verdict; parsing psql notices is how a probe ends
# up reading a CONTEXT line and calling a refusal a pass.
ins_quote() {
  psql_run "$1" <<SQL
insert into public.research_early_access_cart_quotes(
  quote_id, customer_ref, intent_hash, quote_hash, record, quoted_at, expires_at)
values ('$2','$3',repeat('b',64),repeat('f',64),'{}'::jsonb, now(), now() + interval '1 day')
on conflict (quote_id) do nothing;
SQL
}

ins_checkout() {
  psql_run "$1" <<SQL
insert into public.research_early_access_cart_checkouts(
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
  payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
  tax_cents, payable_total_cents, record, placed_at)
values ('$2','eac_11111111111111111111111111111111','$3',repeat('b',64),'$4',
  'awaiting_payment','USD',100,0,0,0,100,'{}'::jsonb, now());
SQL
}

ins_quote cartshape 'xeaq_invariantquote000000' 'eac_11111111111111111111111111111111' || { echo 'FAILED to seed the quote'; exit 1; }
ins_checkout cartshape 'XEC-INVARIANTAAAAAAAAAAAAAAA' "$(printf 'a%.0s' $(seq 64))" 'xeaq_invariantquote000000'   || { echo "FAILED: the FIRST active checkout was refused"; exit 1; }
if ins_checkout cartshape 'XEC-INVARIANTBBBBBBBBBBBBBBB' "$(printf 'c%.0s' $(seq 64))" 'xeaq_invariantquote000000' 2>/dev/null; then
  echo "FAILED: the database allowed two active checkouts for one quote"
  exit 1
fi
ACTIVE=$(psql_q cartshape "select count(*) from public.research_early_access_cart_checkouts where quote_id='xeaq_invariantquote000000' and disposition is null;")
echo "   active checkouts for one quote after two attempts : $ACTIVE (must be 1)"
[ "$ACTIVE" = "1" ] || { echo "FAILED: the invariant did not hold"; exit 1; }

echo "== a SUPERSEDED checkout is financially inert =="
ins_quote cartshape 'xeaq_supersededquote00000' 'eac_22222222222222222222222222222222' || { echo 'FAILED to seed the superseded quote'; exit 1; }
psql_run cartshape <<'SQL' || { echo "FAILED to set up the superseded fixture"; exit 1; }
insert into public.research_early_access_cart_checkouts(
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
  payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
  tax_cents, payable_total_cents, record, placed_at,
  disposition, superseded_by, disposition_actor, disposition_at)
values ('XEC-SUPERSEDEDAAAAAAAAAAAAAA','eac_22222222222222222222222222222222',repeat('d',64),repeat('e',64),'xeaq_supersededquote00000',
  'awaiting_payment','USD',100,0,0,0,100,'{}'::jsonb, now(),
  'duplicate_superseded','XEC-INVARIANTAAAAAAAAAAAAAAA','test:harness', now());
SQL
for TBL in cart_settlements cart_child_releases cart_receipts cart_supplier_outbox cart_external_proofs; do
  if psql_run cartshape <<SQL 2>/dev/null
insert into public.research_early_access_${TBL}(cart_checkout_id)
select id from public.research_early_access_cart_checkouts
 where checkout_number='XEC-SUPERSEDEDAAAAAAAAAAAAAA';
SQL
  then
    echo "FAILED: ${TBL} accepted a row for a superseded checkout"
    exit 1
  fi
  echo "   ${TBL} against a superseded checkout : refused"
done

if psql_run cartshape <<'SQL' 2>/dev/null
update public.research_early_access_cart_checkouts
   set payment_state='payment_verified'
 where checkout_number='XEC-SUPERSEDEDAAAAAAAAAAAAAA';
SQL
then
  echo "FAILED: a superseded checkout could still be marked paid"
  exit 1
fi
echo "   payment state of a superseded checkout : frozen"

echo "== the HISTORICAL remediation, against the real production shape =="
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database cartdup;" || exit 1
psql_run cartdup <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
for f in "${PREREQ[@]}"; do psql_run cartdup < "$REPO_ROOT/$f" || exit 1; done
psql_run cartdup < "$REPO_ROOT/$M58" || exit 1
psql_run cartdup < "$REPO_ROOT/$M60" || exit 1

# The two rows exactly as production holds them: one quote, one intent, one
# customer, two keys, both awaiting payment.
ins_quote cartdup 'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf' 'eac_d80e62ad2039e515b943d4d7cb6c2e32' || exit 1
psql_run cartdup <<'SQL' || { echo "FAILED to seed the production duplicate pair"; exit 1; }
insert into public.research_early_access_cart_checkouts(
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
  payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
  tax_cents, payable_total_cents, record, placed_at)
values
  ('XEC-063A962A0053A65324F21E7F','eac_d80e62ad2039e515b943d4d7cb6c2e32',
   '99ceb03499139cc440c15538b505991e559fbf47683b115fc1cdbd276821e7ef',
   'ab417268ae5a639368fa20ae42c767e8b0aec8c48ce61abc93842fb8abfbeb10',
   'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf','awaiting_payment','USD',10350,0,0,0,10350,
   '{}'::jsonb,'2026-08-09 00:44:48.273+00'),
  ('XEC-E1703CC63BBE89E6839E24C1','eac_d80e62ad2039e515b943d4d7cb6c2e32',
   'bb38d3d0c2d0e2f35f24a8760dff7cd9e216e86c3fd0af3c455d8c090b3a5d12',
   'ab417268ae5a639368fa20ae42c767e8b0aec8c48ce61abc93842fb8abfbeb10',
   'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf','awaiting_payment','USD',10350,0,0,0,10350,
   '{}'::jsonb,'2026-08-09 00:45:48.379+00');
SQL
echo "   seeded both production rows"

psql_run cartdup < "$REPO_ROOT/$M61" || { echo "FAILED migration 61 against the duplicate pair"; exit 1; }
psql_run cartdup < "$REPO_ROOT/$M61" || { echo "FAILED migration 61 second apply over its own remediation"; exit 1; }

DISP=$(psql_q cartdup "select disposition||'|'||superseded_by from public.research_early_access_cart_checkouts where checkout_number='XEC-063A962A0053A65324F21E7F';")
KEPT=$(psql_q cartdup "select coalesce(disposition,'active') from public.research_early_access_cart_checkouts where checkout_number='XEC-E1703CC63BBE89E6839E24C1';")
ROWS=$(psql_q cartdup "select count(*) from public.research_early_access_cart_checkouts;")
EVT=$(psql_q cartdup "select count(*) from public.research_early_access_cart_events where event_type='checkout_superseded';")
echo "   duplicate  : $DISP (must be duplicate_superseded|XEC-E1703CC63BBE89E6839E24C1)"
echo "   canonical  : $KEPT (must be 'active')"
echo "   rows kept  : $ROWS (must be 2, nothing deleted)"
echo "   audit event: $EVT (must be 1, and exactly 1 after applying twice)"
[ "$DISP" = "duplicate_superseded|XEC-E1703CC63BBE89E6839E24C1" ] || { echo "FAILED remediation"; exit 1; }
[ "$KEPT" = "active" ] || { echo "FAILED: the canonical order was dispositioned"; exit 1; }
[ "$ROWS" = "2" ] || { echo "FAILED: history was destroyed"; exit 1; }
[ "$EVT" = "1" ] || { echo "FAILED: the audit event is missing or duplicated"; exit 1; }

echo "== M62 founder compatibility binds the exact retained checkout only =="
psql_run cartdup < "$REPO_ROOT/$M62" || { echo "FAILED M62 over the real founder fixture"; exit 1; }
FOUNDER_BIND=$(psql_q cartdup "select public.research_early_access_record_legal_binding(jsonb_build_object(
  'customerRef','eac_d80e62ad2039e515b943d4d7cb6c2e32',
  'memberId','44444444-4444-4444-4444-444444444444',
  'establishedBy','admin_attested','verifiedAt','2026-08-09T12:10:00Z',
  'attestedBy','founder:samuel-boadu','aliasRefs',jsonb_build_array()
))->>'recorded';")
FAKE_BIND=$(psql_q cartdup "select public.research_early_access_record_legal_binding(jsonb_build_object(
  'customerRef','eac_99999999999999999999999999999999',
  'memberId','55555555-5555-5555-5555-555555555555',
  'establishedBy','admin_attested','verifiedAt','2026-08-09T12:10:00Z',
  'attestedBy','founder:samuel-boadu','aliasRefs',jsonb_build_array()
))->>'reason';")
echo "   exact founder binding recorded : $FOUNDER_BIND (must be true)"
echo "   generic admin attestation      : $FAKE_BIND (must be admin_attestation_not_allowed)"
[ "$FOUNDER_BIND" = "true" ] && [ "$FAKE_BIND" = "admin_attestation_not_allowed" ] \
  || { echo "FAILED: founder compatibility scope widened or refused the founder"; exit 1; }

# Fail-closed: the same migration must ABORT rather than guess when the world
# does not match what it was designed against.
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database cartdrift;" || exit 1
psql_run cartdrift <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
for f in "${PREREQ[@]}"; do psql_run cartdrift < "$REPO_ROOT/$f" || exit 1; done
psql_run cartdrift < "$REPO_ROOT/$M58" || exit 1
psql_run cartdrift < "$REPO_ROOT/$M60" || exit 1
ins_quote cartdrift 'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf' 'eac_d80e62ad2039e515b943d4d7cb6c2e32' || exit 1
psql_run cartdrift <<'SQL' || exit 1
insert into public.research_early_access_cart_checkouts(
  checkout_number, customer_ref, idempotency_key_hash, intent_hash, quote_id,
  payment_state, currency, subtotal_cents, discount_cents, shipping_cents,
  tax_cents, payable_total_cents, record, placed_at)
values
  ('XEC-063A962A0053A65324F21E7F','eac_d80e62ad2039e515b943d4d7cb6c2e32',
   '99ceb03499139cc440c15538b505991e559fbf47683b115fc1cdbd276821e7ef',
   'ab417268ae5a639368fa20ae42c767e8b0aec8c48ce61abc93842fb8abfbeb10',
   'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf','payment_verified','USD',10350,0,0,0,10350,
   '{}'::jsonb,'2026-08-09 00:44:48.273+00'),
  ('XEC-E1703CC63BBE89E6839E24C1','eac_d80e62ad2039e515b943d4d7cb6c2e32',
   'bb38d3d0c2d0e2f35f24a8760dff7cd9e216e86c3fd0af3c455d8c090b3a5d12',
   'ab417268ae5a639368fa20ae42c767e8b0aec8c48ce61abc93842fb8abfbeb10',
   'xeaq_ySe0AU3Ibw2MEnls0vPhjSXf','awaiting_payment','USD',10350,0,0,0,10350,
   '{}'::jsonb,'2026-08-09 00:45:48.379+00');
SQL
if psql_run cartdrift < "$REPO_ROOT/$M61" >/dev/null 2>&1; then
  echo "FAILED: migration 61 dispositioned a duplicate that had already been PAID"
  exit 1
fi
DRIFT=$(psql_q cartdrift "select coalesce(disposition,'active') from public.research_early_access_cart_checkouts where checkout_number='XEC-063A962A0053A65324F21E7F';")
echo "   a PAID duplicate aborts the migration instead of being superseded : $DRIFT (must be 'active')"
[ "$DRIFT" = "active" ] || { echo "FAILED: a paid duplicate was dispositioned anyway"; exit 1; }

echo "== M62 canonical-identity drift aborts atomically instead of guessing =="
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database m62drift;" || exit 1
psql_run m62drift <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
SQL
for f in "${PREREQ[@]}"; do psql_run m62drift < "$REPO_ROOT/$f" || exit 1; done
psql_run m62drift < "$REPO_ROOT/$M58" || exit 1
psql_run m62drift < "$REPO_ROOT/$M60" || exit 1
psql_run m62drift < "$REPO_ROOT/$M61" || exit 1
ins_quote m62drift 'xeaq_m62drift00000000001' 'eac_77777777777777777777777777777777' || exit 1
ins_quote m62drift 'xeaq_m62drift00000000002' 'eac_88888888888888888888888888888888' || exit 1
ins_checkout m62drift 'XEC-M62DRIFTAAAAAAAAAAAAAA' "$(printf '7%.0s' $(seq 64))" 'xeaq_m62drift00000000001' || exit 1
ins_checkout m62drift 'XEC-M62DRIFTBBBBBBBBBBBBBB' "$(printf '8%.0s' $(seq 64))" 'xeaq_m62drift00000000002' || exit 1
psql_run m62drift <<'SQL' || exit 1
insert into public.research_early_access_cart_settlements(
  cart_checkout_id,external_transaction_id,reviewed_evidence_ref,verified_amount_cents,
  verified_currency,actor_id,record,settled_at
)
select id,'Ab C','eaext.drift0000000000001',100,'USD','drift:test','{}',clock_timestamp()
  from public.research_early_access_cart_checkouts where checkout_number='XEC-M62DRIFTAAAAAAAAAAAAAA';
insert into public.research_early_access_cart_settlements(
  cart_checkout_id,external_transaction_id,reviewed_evidence_ref,verified_amount_cents,
  verified_currency,actor_id,record,settled_at
)
select id,'  ab   c  ','eaext.drift0000000000002',100,'USD','drift:test','{}',clock_timestamp()
  from public.research_early_access_cart_checkouts where checkout_number='XEC-M62DRIFTBBBBBBBBBBBBBB';
SQL
if psql_run m62drift < "$REPO_ROOT/$M62" >/dev/null 2>&1; then
  echo "FAILED: M62 guessed through a pre-existing canonical transaction collision"
  exit 1
fi
M62_ROLLBACK=$(psql_q m62drift "select to_regclass('public.research_early_access_legal_bindings') is null and to_regprocedure('public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,timestamptz)') is not null;")
echo "   failed apply left no M62 tables and preserved M60 RPC: $M62_ROLLBACK (must be t)"
[ "$M62_ROLLBACK" = "t" ] || { echo "FAILED: M62 drift apply was not atomic"; exit 1; }

echo
echo "MANAGED SUPABASE SHAPE: PASS (postgres ${MAJOR}, pgcrypto in extensions, M62 durable hardening enforced)"
