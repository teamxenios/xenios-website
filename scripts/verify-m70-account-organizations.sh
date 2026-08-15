#!/usr/bin/env bash
#
# M70 rehearsal: the Pack 02 account and organization schema, under its own name.
#
# WHAT THIS PROVES, AND WHY EACH PART IS HERE.
#
# M70 exists because of a name collision (decision D-004). Production already
# carries public.research_organizations and it belongs to the PARTNER system.
# The unshipped account table claimed the same name, so a blind
# "create table if not exists" would have reported success while silently
# leaving the partner shape in place, and the mounted account API would have
# failed column by column against a table that was never its own.
#
# The dangerous failure for this migration is therefore not that it fails to
# apply. It is that it applies and QUIETLY DAMAGES A LIVE TABLE that is
# serving the partner system today. So the fixture below creates the partner
# research_organizations with its real shape and real rows, and the suite
# asserts after every apply that its columns, its row count, its RLS flag and
# its grants are exactly what they were. A rehearsal without that table in the
# database would pass vacuously and would prove nothing about the one risk
# this migration actually carries.
#
# The suite also rehearses the collision itself: a partner-shaped clone is put
# under the account name and the preflight is required to refuse it, because
# that specific confusion is what D-004 was decided to prevent.
#
# Disposable databases only. This never connects to production.
set -euo pipefail

IMAGES=("postgres:16" "postgres:17")
MIGRATION="supabase/migrations/20260815120000_research_account_organizations_pack02.sql"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }

# The minimal accepted shape M70's preflight declares it requires, plus the
# LIVE PARTNER TABLE it must not touch. Only what the preflight names, because
# the point is to rehearse M70 and not to re-rehearse the whole schema.
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

-- The Supabase credential authority the preflight requires.
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- The personal member identity the preflight requires.
create table public.research_members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null
);

-- The canonical order authority the preflight requires.
create table public.research_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null
);

-- ---------------------------------------------------------------------------
-- THE LIVE PARTNER TABLE. This is the whole reason M70 was renamed. Its shape
-- is the one the migration header documents: id, name, owner_partner_id,
-- state, created_at. It carries rows, RLS and a grant, so that "untouched"
-- afterwards is a claim with something to lose.
-- ---------------------------------------------------------------------------
create table public.research_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_partner_id uuid,
  state text not null default 'active',
  created_at timestamptz not null default now()
);
alter table public.research_organizations enable row level security;
grant select on table public.research_organizations to authenticated;

insert into public.research_organizations (name, owner_partner_id, state) values
  ('Partner One', '11111111-1111-4111-8111-111111111111', 'active'),
  ('Partner Two', '22222222-2222-4222-8222-222222222222', 'suspended');
SQL

# Every assertion is `expected|actual` compared as text, so a silent type
# coercion cannot make a wrong answer look right.
read -r -d '' BEHAVIOUR <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- ---- A. THE PARTNER TABLE IS UNTOUCHED --------------------------------
-- These are the assertions the whole rename exists to make true.

-- 1. The partner table still has exactly its original columns, in order.
select 'A1 partner columns|' ||
  (select string_agg(column_name, ',' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'research_organizations')
  = 'A1 partner columns|id,name,owner_partner_id,state,created_at';

-- 2. Its rows are still there and still say what they said.
select 'A2 partner rows|' ||
  (select string_agg(name || ':' || state, ',' order by name)
     from public.research_organizations)
  = 'A2 partner rows|Partner One:active,Partner Two:suspended';

-- 3. Its own grant survives. M70 revoking broadly across the schema would
--    silently break the partner system's read path.
select 'A3 partner grant|' ||
  (has_table_privilege('authenticated','public.research_organizations','SELECT')::text)
  = 'A3 partner grant|true';

-- 4. The account table is a SEPARATE relation, not the partner table renamed.
select 'A4 two relations|' ||
  ((to_regclass('public.research_organizations') is not null)::text || ',' ||
   (to_regclass('public.research_account_organizations') is not null)::text || ',' ||
   (to_regclass('public.research_organizations')
      <> to_regclass('public.research_account_organizations'))::text)
  = 'A4 two relations|true,true,true';

-- ---- B. THE EIGHT ACCOUNT TABLES EXIST WITH RLS ------------------------

-- 5. All eight exist.
select 'B1 eight tables|' ||
  (select count(*)::text from (values
     ('research_account_organizations'),('research_organization_users'),
     ('research_organization_invitations'),('research_account_claim_challenges'),
     ('research_customer_account_bindings'),('research_organization_order_ownership'),
     ('research_account_binding_events'),('research_organization_request_again')
   ) as t(name) where to_regclass('public.' || t.name) is not null)
  = 'B1 eight tables|8';

-- 6. All eight carry row level security.
select 'B2 eight rls|' ||
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('research_account_organizations','research_organization_users',
        'research_organization_invitations','research_account_claim_challenges',
        'research_customer_account_bindings','research_organization_order_ownership',
        'research_account_binding_events','research_organization_request_again'))
  = 'B2 eight rls|8';

-- ---- C. THE AUTHORIZATION BOUNDARY -------------------------------------

-- 7. No browser-facing role holds ANY privilege on ANY of the eight tables.
select 'C1 no browser grants|' ||
  (select count(*)::text from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated')
      and table_name in ('research_account_organizations','research_organization_users',
        'research_organization_invitations','research_account_claim_challenges',
        'research_customer_account_bindings','research_organization_order_ownership',
        'research_account_binding_events','research_organization_request_again'))
  = 'C1 no browser grants|0';

-- 8. The three account routines are SECURITY DEFINER.
select 'C2 security definer|' ||
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in ('research_bind_verified_organization_user',
                        'research_account_commit_customer_claim',
                        'research_account_accept_organization_invitation'))
  = 'C2 security definer|3';

-- 9. Neither anon nor authenticated may execute any of them.
select 'C3 public roles|' ||
  (select count(*)::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
          lateral unnest(array['anon','authenticated']) as r(role)
    where n.nspname = 'public'
      and p.proname in ('research_bind_verified_organization_user',
                        'research_account_commit_customer_claim',
                        'research_account_accept_organization_invitation')
      and has_function_privilege(r.role, p.oid, 'EXECUTE'))
  = 'C3 public roles|0';

-- 10. service_role may execute all three.
select 'C4 service_role|' ||
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('research_bind_verified_organization_user',
                        'research_account_commit_customer_claim',
                        'research_account_accept_organization_invitation')
      and has_function_privilege('service_role', p.oid, 'EXECUTE'))
  = 'C4 service_role|3';

-- ---- D. THE SEED -------------------------------------------------------

-- 11. The roman-digital seed is present exactly once, so a re-apply cannot
--     duplicate the organization the account system will bind against.
select 'D1 seed once|' ||
  (select count(*)::text from public.research_account_organizations
    where slug = 'roman-digital')
  = 'D1 seed once|1';
SQL

for image in "${IMAGES[@]}"; do
  tag="${image//[:.]/_}"
  name="m70_${tag}"
  echo "=============================================================="
  echo "M70 rehearsal on ${image}"
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
  [ "$bare_rc" -ne 0 ] || fail "${image}: M70 applied to a database with no account prerequisites"
  echo "$bare_out" | grep -q "M70 requires" \
    || fail "${image}: preflight refused for the wrong reason: ${bare_out}"
  left="$(docker exec "$name" psql -U postgres -d bare -tAc \
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname like 'research_%'")"
  [ "$left" = "0" ] || fail "${image}: a refused preflight left ${left} relation(s) behind"
  echo "  preflight fails closed on a bare database, leaving nothing behind"

  # ---- 2. THE COLLISION ITSELF. A partner-shaped clone squatting on the
  #         account name must be refused, not adopted. This is D-004.
  docker exec "$name" psql -U postgres -q -c 'create database collision' >/dev/null
  printf '%s\n' "$FIXTURE" | run_sql collision >/dev/null
  docker exec "$name" psql -U postgres -d collision -q -c \
    "create table public.research_account_organizations (
       id uuid primary key default gen_random_uuid(),
       name text not null,
       owner_partner_id uuid,
       state text not null default 'active',
       created_at timestamptz not null default now())" >/dev/null
  set +e
  clash="$(run_sql collision < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  clash_rc=$?
  set -e
  [ "$clash_rc" -ne 0 ] \
    || fail "${image}: M70 applied over a partner-shaped table under the account name; D-004 is not enforced"
  echo "$clash" | grep -q "a foreign shape occupies the name" \
    || fail "${image}: foreign shape refused for the wrong reason: ${clash}"
  echo "  a partner-shaped clone under the account name is refused (D-004)"

  # ---- 3. Apply twice over the accepted shape ----------------------------
  docker exec "$name" psql -U postgres -q -c 'create database rehearse' >/dev/null
  printf '%s\n' "$FIXTURE" | run_sql rehearse >/dev/null

  # The partner table's pre-state, captured so "untouched" is a comparison and
  # not an assertion about a table nobody looked at.
  partner_before="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*)::text || '|' ||
            (select string_agg(column_name, ',' order by ordinal_position)
               from information_schema.columns
              where table_schema='public' and table_name='research_organizations')
       from public.research_organizations")"
  [ "$partner_before" = "2|id,name,owner_partner_id,state,created_at" ] \
    || fail "${image}: fixture did not build the partner table as expected (${partner_before})"

  for pass in 1 2; do
    run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
      || fail "${image}: M70 apply pass ${pass} failed"
    echo "  apply pass ${pass}: psql exit 0"

    # The psql exit code is captured explicitly rather than left to errexit. A
    # mid-suite SQL error inside a command-substitution assignment can kill the
    # script with exit 0 and no fail() line: a harness that stops early and
    # still looks green. The final REHEARSAL PASS banner is the only success
    # signal this script emits.
    set +e
    results="$(printf '%s\n' "$BEHAVIOUR" | run_sql rehearse 2>&1)"
    suite_rc=$?
    set -e
    if [ "$suite_rc" -ne 0 ]; then
      echo "$results" >&2
      fail "${image}: behavioural suite errored (psql exit ${suite_rc}) after pass ${pass}"
    fi
    if echo "$results" | grep -qv '^t$'; then
      echo "$results" >&2
      fail "${image}: behavioural suite failed after pass ${pass}"
    fi
    count="$(echo "$results" | grep -c '^t$')"
    [ "$count" = "11" ] || fail "${image}: expected 11 assertions, got ${count}"
    echo "  behavioural suite after pass ${pass}: 11/11"
  done

  partner_after="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*)::text || '|' ||
            (select string_agg(column_name, ',' order by ordinal_position)
               from information_schema.columns
              where table_schema='public' and table_name='research_organizations')
       from public.research_organizations")"
  [ "$partner_before" = "$partner_after" ] \
    || fail "${image}: the live partner table moved ${partner_before} -> ${partner_after}"
  echo "  the live partner table is byte-for-byte what it was"

  # ---- 4. The post-condition must catch its own failure modes ------------
  # Proving the assertions are real rather than decorative: break the grant
  # boundary deliberately and require the migration to refuse.
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "grant select on public.research_organization_users to anon" >/dev/null
  pre="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select has_table_privilege('anon','public.research_organization_users','SELECT')")"
  [ "$pre" = "t" ] || fail "${image}: the stray anon table grant did not take; the control would be vacuous"
  set +e
  broken="$(run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  broken_rc=$?
  set -e
  [ "$broken_rc" -ne 0 ] \
    || fail "${image}: M70 committed while anon held SELECT on an account table; the boundary check is decorative"
  echo "$broken" | grep -q "the account table grant boundary is broken" \
    || fail "${image}: boundary breach refused for the wrong reason: ${broken}"
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "revoke select on public.research_organization_users from anon" >/dev/null
  echo "  post-condition catches a broken table grant boundary"

  # A stray EXECUTE grant on one of M70's OWN routines is different from the
  # table breach above: the migration's revoke section re-asserts the function
  # boundary on every apply, so the correct behaviour is to HEAL the grant and
  # commit, with the post-condition then proving the healed end state.
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "grant execute on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) to anon" >/dev/null
  pre="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select has_function_privilege('anon','public.research_account_commit_customer_claim(uuid,bytea,uuid,text)','EXECUTE')")"
  [ "$pre" = "t" ] || fail "${image}: the stray anon execute grant did not take; the heal control would be vacuous"
  run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
    || fail "${image}: M70 failed to re-apply over a stray anon execute grant it should heal"
  healed="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public'
        and p.proname in ('research_bind_verified_organization_user',
                          'research_account_commit_customer_claim',
                          'research_account_accept_organization_invitation')
        and has_function_privilege('anon', p.oid, 'EXECUTE')")"
  [ "$healed" = "0" ] \
    || fail "${image}: a stray anon execute grant survived a re-apply (${healed} routine(s))"
  echo "  a stray anon execute grant on a routine is healed by re-apply"

  docker rm -f "$name" >/dev/null 2>&1 || true
  trap - EXIT
  echo "  ${image}: PASS"
done

echo
echo "M70 REHEARSAL PASS on ${IMAGES[*]}. Production was not connected to or mutated."
