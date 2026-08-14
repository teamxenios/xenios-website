#!/usr/bin/env bash
#
# M67 rehearsal: the Early Access member order-history read routines.
#
# WHAT THIS PROVES, AND WHY EACH PART IS HERE.
#
# M67 adds two read-only routines because two questions could not be asked at
# all: "which handles is this member bound to" and "which orders carry these
# handles". The dangerous failure for a migration like this is not that it
# fails to apply. It is that it applies and then answers TOO MUCH: an empty
# handle list that returns every order in the table would hand one customer
# everybody's history, and it would look like a working feature.
#
# So the behavioural suite spends most of its assertions on refusal, and the
# fixture deliberately contains a SECOND member's order, so that every
# "returns the right rows" assertion is also a "does not return the other
# member's row" assertion. A suite over a single-member table would pass
# vacuously.
#
# It also proves the migration does not move the boundary it exists to respect:
# service_role must still have no direct SELECT on either table afterwards.
#
# Disposable databases only. This never connects to production.
set -euo pipefail

IMAGES=("postgres:16" "postgres:17")
MIGRATION="supabase/migrations/20260813120000_research_early_access_member_order_history.sql"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }

# The minimal accepted shape M67 declares it requires. Only the tables and
# columns the preflight names, plus the roles and the revokes, because the
# point is to rehearse M67 and not to re-rehearse M62.
read -r -d '' FIXTURE <<'SQL' || true
create extension if not exists pgcrypto;

do $roles$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end
$roles$;

create table public.research_early_access_legal_bindings (
  id uuid primary key default gen_random_uuid(),
  customer_ref text not null unique check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  member_id uuid not null,
  established_by text not null check (established_by in ('verified_link','admin_attested')),
  verified_at timestamptz not null,
  attested_by text,
  alias_refs text[] not null default '{}'::text[],
  recorded_at timestamptz not null default clock_timestamp()
);
create unique index research_ea_legal_binding_member_customer_uidx
  on public.research_early_access_legal_bindings(member_id, customer_ref);

create table public.research_early_access_placements (
  order_number text primary key,
  customer_ref text not null,
  idempotency_key text not null unique,
  payment_state text not null,
  placed_at timestamptz not null,
  record jsonb not null
);

-- The boundary M67 must not move: exactly what M62 and the commerce
-- persistence migration do to their own tables.
do $revokes$
declare t text; r text;
begin
  foreach t in array array[
    'research_early_access_legal_bindings',
    'research_early_access_placements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public', t);
    foreach r in array array['anon','authenticated','service_role'] loop
      execute format('revoke all on table public.%I from %I', t, r);
    end loop;
  end loop;
end
$revokes$;

-- TWO members on purpose. Every positive assertion below is therefore also a
-- negative one about the other member.
insert into public.research_early_access_legal_bindings
  (customer_ref, member_id, established_by, verified_at, alias_refs)
values
  ('eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   '9f1b1d2c-8a4e-4c31-9b77-1c2d3e4f5a6b', 'verified_link', now(),
   array['eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']),
  ('eac_cccccccccccccccccccccccccccccccc',
   '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'verified_link', now(),
   '{}'::text[]);

insert into public.research_early_access_placements
  (order_number, customer_ref, idempotency_key, payment_state, placed_at, record)
values
  ('XEC-KRIS-PRIMARY', 'eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'k1',
   'payment_verified', '2026-08-01T00:00:00Z',
   '{"orderNumber":"XEC-KRIS-PRIMARY"}'::jsonb),
  ('XEC-KRIS-ALIAS', 'eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'k2',
   'payment_verified', '2026-08-02T00:00:00Z',
   '{"orderNumber":"XEC-KRIS-ALIAS"}'::jsonb),
  ('XEC-STRANGER', 'eac_cccccccccccccccccccccccccccccccc', 'k3',
   'payment_verified', '2026-08-03T00:00:00Z',
   '{"orderNumber":"XEC-STRANGER"}'::jsonb);
SQL

# Every assertion is `expected|actual` compared as text, so a silent type
# coercion cannot make a wrong answer look right.
read -r -d '' BEHAVIOUR <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- 1. A member with a primary handle and an alias resolves to BOTH, sorted,
--    and to nothing belonging to anyone else.
select 'A1 handles both|' ||
  (select public.research_early_access_legal_bindings_for_member(
     '9f1b1d2c-8a4e-4c31-9b77-1c2d3e4f5a6b')::text)
  = 'A1 handles both|["eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]';

-- 2. The other member resolves ONLY to their own handle.
select 'A2 other member|' ||
  (select public.research_early_access_legal_bindings_for_member(
     '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')::text)
  = 'A2 other member|["eac_cccccccccccccccccccccccccccccccc"]';

-- 3. An unknown member resolves to an EMPTY array, not to null and not to
--    everyone. Null here would be read by the application as "no answer".
select 'A3 unknown member|' ||
  (select public.research_early_access_legal_bindings_for_member(
     '00000000-0000-4000-8000-000000000000')::text)
  = 'A3 unknown member|[]';

-- 4. THE CATASTROPHIC CASE. An empty handle array must return NOTHING. If this
--    ever returns every order, one customer sees the whole table.
select 'B1 empty array|' ||
  (select public.research_early_access_placements_for_customers(
     '{}'::text[])::text)
  = 'B1 empty array|[]';

-- 5. A null handle array must also return nothing.
select 'B2 null array|' ||
  (select public.research_early_access_placements_for_customers(
     null::text[])::text)
  = 'B2 null array|[]';

-- 6. One handle returns exactly that handle's order.
select 'B3 one handle|' ||
  (select jsonb_agg(x ->> 'orderNumber')::text
   from jsonb_array_elements(
     public.research_early_access_placements_for_customers(
       array['eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'])) as x)
  = 'B3 one handle|["XEC-KRIS-PRIMARY"]';

-- 7. Both handles return both orders, oldest first, and NOT the stranger's.
select 'B4 both handles|' ||
  (select jsonb_agg(x ->> 'orderNumber')::text
   from jsonb_array_elements(
     public.research_early_access_placements_for_customers(
       array['eac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
             'eac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'])) as x)
  = 'B4 both handles|["XEC-KRIS-PRIMARY", "XEC-KRIS-ALIAS"]';

-- 8. A handle that belongs to nobody returns nothing rather than falling back.
select 'B5 unknown handle|' ||
  (select public.research_early_access_placements_for_customers(
     array['eac_dddddddddddddddddddddddddddddddd'])::text)
  = 'B5 unknown handle|[]';

-- 9. The routines are STABLE, so neither can write.
--
-- Each of assertions 9 through 11 wraps its aggregate in a scalar subquery,
-- the same shape assertion 8 uses. Writing them as a bare aggregate with a
-- trailing comparison parses the "= 'label|expected'" into the WHERE clause,
-- which is a boolean type error at runtime: the suite then dies at assertion
-- 9 instead of reporting, which is exactly the "check that could not run"
-- failure mode this harness exists to refuse.
select 'C1 volatility|' ||
  (select string_agg(p.provolatile::text, ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('research_early_access_legal_bindings_for_member',
                        'research_early_access_placements_for_customers'))
  = 'C1 volatility|s,s';

-- 10. Neither anon nor authenticated may execute either routine.
select 'C2 public roles|' ||
  (select count(*)::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
          lateral unnest(array['anon','authenticated']) as r(role)
    where n.nspname = 'public'
      and p.proname in ('research_early_access_legal_bindings_for_member',
                        'research_early_access_placements_for_customers')
      and has_function_privilege(r.role, p.oid, 'EXECUTE'))
  = 'C2 public roles|0';

-- 11. service_role may execute both.
select 'C3 service_role|' ||
  (select count(*)::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('research_early_access_legal_bindings_for_member',
                        'research_early_access_placements_for_customers')
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))
  = 'C3 service_role|2';

-- 12. THE BOUNDARY. service_role still has no direct SELECT on either table.
select 'C4 boundary|' ||
  (has_table_privilege('service_role','public.research_early_access_legal_bindings','SELECT')::text
   || ',' ||
   has_table_privilege('service_role','public.research_early_access_placements','SELECT')::text)
  = 'C4 boundary|false,false';
SQL

for image in "${IMAGES[@]}"; do
  tag="${image//[:.]/_}"
  name="m67_${tag}"
  echo "=============================================================="
  echo "M67 rehearsal on ${image}"
  echo "=============================================================="

  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -e POSTGRES_PASSWORD=rehearse "$image" >/dev/null
  trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

  for _ in $(seq 1 60); do
    if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 || fail "${image} never became ready"

  run_sql() {
    docker exec -i "$name" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -q
  }

  # ---- 1. The preflight must FAIL CLOSED on a bare database ---------------
  docker exec "$name" psql -U postgres -q -c 'create database bare' >/dev/null
  set +e
  bare_out="$(run_sql bare < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  bare_rc=$?
  set -e
  [ "$bare_rc" -ne 0 ] || fail "${image}: M67 applied to a database with no Early Access schema"
  echo "$bare_out" | grep -q "M67 requires" \
    || fail "${image}: preflight refused for the wrong reason: ${bare_out}"
  left="$(docker exec "$name" psql -U postgres -d bare -tAc \
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname like 'research_early_access%'")"
  [ "$left" = "0" ] || fail "${image}: a refused preflight left ${left} routine(s) behind"
  echo "  preflight fails closed on a bare database, leaving nothing behind"

  # ---- 2. Apply twice over the accepted shape ----------------------------
  docker exec "$name" psql -U postgres -q -c 'create database rehearse' >/dev/null
  printf '%s\n' "$FIXTURE" | run_sql rehearse >/dev/null

  before_rel="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public'")"
  before_rows="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from public.research_early_access_placements")"
  [ "$before_rows" = "3" ] || fail "${image}: fixture did not seed 3 placements (got ${before_rows})"

  for pass in 1 2; do
    run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
      || fail "${image}: M67 apply pass ${pass} failed"
    echo "  apply pass ${pass}: psql exit 0"

    results="$(printf '%s\n' "$BEHAVIOUR" | run_sql rehearse 2>&1)"
    if echo "$results" | grep -qv '^t$'; then
      echo "$results" >&2
      fail "${image}: behavioural suite failed after pass ${pass}"
    fi
    count="$(echo "$results" | grep -c '^t$')"
    [ "$count" = "12" ] || fail "${image}: expected 12 assertions, got ${count}"
    echo "  behavioural suite after pass ${pass}: 12/12"
  done

  after_rel="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public'")"
  after_rows="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from public.research_early_access_placements")"
  [ "$before_rel" = "$after_rel" ] \
    || fail "${image}: relation count moved ${before_rel} -> ${after_rel}; M67 creates no relation"
  [ "$before_rows" = "$after_rows" ] \
    || fail "${image}: placement rows moved ${before_rows} -> ${after_rows}; M67 writes nothing"
  echo "  no relation created, no row written"

  # ---- 3. The post-condition must catch its own failure modes ------------
  # Proving the assertions are real rather than decorative: break each
  # invariant deliberately and require the migration to refuse.
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "grant select on public.research_early_access_placements to service_role" >/dev/null
  set +e
  broken="$(run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  broken_rc=$?
  set -e
  [ "$broken_rc" -ne 0 ] \
    || fail "${image}: M67 committed while service_role had direct SELECT; the boundary check is decorative"
  echo "$broken" | grep -q "the revoke boundary is broken" \
    || fail "${image}: boundary breach refused for the wrong reason: ${broken}"
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "revoke select on public.research_early_access_placements from service_role" >/dev/null
  echo "  post-condition catches a broken revoke boundary"

  # A stray EXECUTE grant on one of M67's OWN routines is different from the
  # table breach above: the migration's revoke section re-asserts the function
  # boundary on every apply, so the correct behaviour is to HEAL the grant and
  # commit, with the post-condition then proving the healed end state. Requiring
  # an abort here would demand the migration refuse a breach it exists to
  # remove. So the assertion is: re-apply succeeds, and afterwards anon cannot
  # execute either routine.
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "grant execute on function public.research_early_access_placements_for_customers(text[]) to anon" >/dev/null
  run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
    || fail "${image}: M67 failed to re-apply over a stray anon execute grant it should heal"
  healed="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('research_early_access_legal_bindings_for_member',
                          'research_early_access_placements_for_customers')
        and has_function_privilege('anon', p.oid, 'EXECUTE')")"
  [ "$healed" = "0" ] \
    || fail "${image}: a stray anon execute grant survived a re-apply (${healed} routine(s))"
  echo "  a stray anon execute grant on a routine is healed by re-apply"

  docker rm -f "$name" >/dev/null 2>&1 || true
  trap - EXIT
  echo "  ${image}: PASS"
done

echo
echo "M67 REHEARSAL PASS on ${IMAGES[*]}. Production was not connected to or mutated."
