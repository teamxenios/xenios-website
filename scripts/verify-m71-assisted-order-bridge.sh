#!/usr/bin/env bash
#
# M71 rehearsal: the assisted-order intake bridge.
#
# WHAT THIS PROVES, AND WHY EACH PART IS HERE.
#
# The bridge stores what a customer asked for, what identity documents were
# requested, and how far Xenios has walked the request. None of that may be
# reachable from a browser. The migration states that boundary as RLS (enabled
# AND forced), zero policies, zero direct table grants for PUBLIC, anon,
# authenticated and service_role, and EXECUTE on eight security-definer
# routines granted to service_role alone.
#
# The dangerous failure is not a failed apply. It is an apply that reports
# success while leaving one of those four principals able to read the table
# directly, because then every promise above is decorative and a customer's
# identity-document trail is one leaked key away from being readable.
#
# So the suite spends most of its assertions on refusal, and every privilege
# assertion is made against all four principals rather than the two that are
# easy to remember. PUBLIC is checked through the ACL rather than through
# has_function_privilege, because a null proacl means the PostgreSQL default,
# which INCLUDES a PUBLIC execute grant: a check that skips null would call
# the most dangerous case clean.
#
# It also rehearses the one behaviour this migration deliberately does NOT
# share with its predecessors. M67 and M70 HEAL a stray grant on re-apply. This
# migration REFUSES, in both its preflight and its post-condition, because a
# direct table grant on customer identity data is evidence that something
# already went wrong and must be surfaced rather than quietly removed. The
# suite asserts the refusal, so a future edit that "fixes" it into a heal
# fails here.
#
# Disposable databases only. This never connects to production.
set -euo pipefail

IMAGES=("postgres:16" "postgres:17")
MIGRATION="supabase/migrations/20260815150000_research_assisted_order_bridge.sql"
BOOTSTRAP="supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Every assertion is `expected|actual` compared as text, so a silent type
# coercion cannot make a wrong answer look right.
read -r -d '' BEHAVIOUR <<'SQL' || true
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- ---- A. THE TABLE BOUNDARY --------------------------------------------

-- 1. All five tables carry RLS ENABLED and FORCED. Enabled alone would leave
--    the owner's ordinary sessions outside the posture.
select 'A1 rls forced|' ||
  (select count(*)::text from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity and c.relforcerowsecurity
      and c.relname in ('research_assisted_order_requests','research_assisted_order_lines',
        'research_assisted_order_events','research_assisted_order_access_tokens',
        'research_assisted_order_documents'))
  = 'A1 rls forced|5';

-- 2. ZERO direct table grants for all FOUR principals, PUBLIC included.
--    PUBLIC is grantee 0 in the ACL and has no pg_roles row.
select 'A2 zero table grants|' ||
  (select count(*)::text
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
     left join pg_catalog.pg_roles r on r.oid = acl.grantee
    where n.nspname = 'public'
      and c.relname in ('research_assisted_order_requests','research_assisted_order_lines',
        'research_assisted_order_events','research_assisted_order_access_tokens',
        'research_assisted_order_documents')
      and (acl.grantee = 0 or r.rolname in ('anon','authenticated','service_role')))
  = 'A2 zero table grants|0';

-- 3. ZERO policies. With zero grants and zero policies the definer routines
--    are the only path in. A policy here would be a second, softer door.
select 'A3 zero policies|' ||
  (select count(*)::text from pg_catalog.pg_policy p
    where p.polrelid in (
      'public.research_assisted_order_requests'::regclass,
      'public.research_assisted_order_lines'::regclass,
      'public.research_assisted_order_events'::regclass,
      'public.research_assisted_order_access_tokens'::regclass,
      'public.research_assisted_order_documents'::regclass))
  = 'A3 zero policies|0';

-- 4. THE DIRECT-READ REFUSAL, exercised rather than inferred. service_role
--    holds no SELECT on any of the five.
select 'A4 no service_role select|' ||
  (select string_agg(has_table_privilege('service_role','public.'||t.name,'SELECT')::text, ','
                     order by t.name)
     from (values ('research_assisted_order_access_tokens'),('research_assisted_order_documents'),
                  ('research_assisted_order_events'),('research_assisted_order_lines'),
                  ('research_assisted_order_requests')) as t(name))
  = 'A4 no service_role select|false,false,false,false,false';

-- ---- B. THE ROUTINE BOUNDARY -------------------------------------------

-- 5. The eight service_role RPCs exist, are SECURITY DEFINER, and
--    service_role may execute all eight.
select 'B1 eight rpcs|' ||
  (select count(*)::text from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and p.proname in ('research_assisted_order_submit','research_assisted_order_status',
        'research_assisted_order_admin_get','research_assisted_order_admin_list',
        'research_assisted_order_set_status','research_assisted_order_document_create',
        'research_assisted_order_document_complete','research_assisted_order_document_get'))
  = 'B1 eight rpcs|8';

-- 6. Neither anon nor authenticated may execute ANY assisted-order routine,
--    RPC or internal helper.
select 'B2 no browser execute|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace,
          lateral unnest(array['anon','authenticated']) as r(role)
    where n.nspname='public' and p.proname like 'research_assisted_order%'
      and has_function_privilege(r.role, p.oid, 'EXECUTE'))
  = 'B2 no browser execute|0';

-- 7. PUBLIC may execute NO assisted-order routine. Read from the ACL with the
--    default expanded, because a null proacl means PUBLIC EXECUTE is granted.
select 'B3 no public execute|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(
       coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
    where n.nspname='public' and p.proname like 'research_assisted_order%'
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
  = 'B3 no public execute|0';

-- 8. The internal helpers are reachable by NO client role at all.
select 'B4 internals sealed|' ||
  (select count(*)::text
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace,
          lateral unnest(array['anon','authenticated','service_role']) as r(role)
    where n.nspname='public'
      and p.proname in ('research_assisted_order_line_json','research_assisted_order_lines_json',
        'research_assisted_order_timeline_json','research_assisted_order_documents_json',
        'research_assisted_order_admin_json','research_assisted_order_events_block_mutation')
      and has_function_privilege(r.role, p.oid, 'EXECUTE'))
  = 'B4 internals sealed|0';

-- ---- C. THE APPEND-ONLY EVENT LOG --------------------------------------

-- 9. The append-only trigger is present on the events table.
select 'C1 append-only trigger|' ||
  (select count(*)::text from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.research_assisted_order_events'::regclass
      and t.tgname = 'research_assisted_order_events_append_only'
      and not t.tgisinternal)
  = 'C1 append-only trigger|1';

-- 10. And it actually refuses. A trigger that exists but permits the write is
--     the failure this asserts against, so both refusals are exercised against
--     a REAL event row rather than inferred from the trigger definition.
--
--     The row is deliberately left behind: the events table is append-only, so
--     the probe cannot clean up after itself, and a probe that could delete
--     its own evidence would be proving the opposite of the invariant. The
--     seeded request uses a reserved probe reference so it is recognisable.
do $probe$
declare
  v_request uuid := '00000000-0000-4000-8000-0000000b0be0'::uuid;
  v_event uuid;
  v_allowed boolean := false;
begin
  insert into public.research_assisted_order_requests(
    id, public_reference, idempotency_key_hash, request_fingerprint,
    early_access_session_hash, normalized_email, full_legal_name, mobile_phone,
    shipping_address, billing_address, age_confirmed, source
  ) values (
    v_request, 'XRR-20260815-0B0BE00000', 'probe-key-hash', 'probe-fingerprint',
    'probe-session-hash', 'probe@example.com', 'Probe Row', '+10000000000',
    '{"line1":"1 Probe Way","city":"Probe","region":"TX","postalCode":"00000","countryCode":"US"}'::jsonb,
    '{"line1":"1 Probe Way","city":"Probe","region":"TX","postalCode":"00000","countryCode":"US"}'::jsonb,
    true, 'early_access_manual_order_bridge'
  ) on conflict (id) do nothing;

  insert into public.research_assisted_order_events(request_id, status, actor_type)
  values (v_request, 'submitted', 'system') returning id into v_event;

  begin
    update public.research_assisted_order_events set status = 'paid' where id = v_event;
    v_allowed := true;
  exception when others then
    null;
  end;
  if v_allowed then
    raise exception 'append-only UPDATE was permitted on the event log';
  end if;

  begin
    delete from public.research_assisted_order_events where id = v_event;
    v_allowed := true;
  exception when others then
    null;
  end;
  if v_allowed then
    raise exception 'append-only DELETE was permitted on the event log';
  end if;
end
$probe$;
select 'C2 append-only enforced|ok' = 'C2 append-only enforced|ok';
SQL

for image in "${IMAGES[@]}"; do
  tag="${image//[:.]/_}"
  name="m71_${tag}"
  echo "=============================================================="
  echo "M71 rehearsal on ${image}"
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

  # ---- 1. The preflight must FAIL CLOSED without the Supabase role set ----
  # This is the boundary-exists-only-as-intent case: without those roles the
  # revokes bind to nothing, so the migration must refuse rather than report a
  # boundary it did not actually establish.
  docker exec "$name" psql -U postgres -q -c 'create database bare' >/dev/null
  set +e
  bare_out="$(run_sql bare < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  bare_rc=$?
  set -e
  [ "$bare_rc" -ne 0 ] || fail "${image}: the bridge applied without the Supabase role set"
  echo "$bare_out" | grep -q "requires the Supabase role set" \
    || fail "${image}: preflight refused for the wrong reason: ${bare_out}"
  left="$(docker exec "$name" psql -U postgres -d bare -tAc \
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname like 'research_assisted_order%'")"
  [ "$left" = "0" ] || fail "${image}: a refused preflight left ${left} relation(s) behind"
  echo "  preflight fails closed without the Supabase roles, leaving nothing behind"

  # ---- 2. Apply twice over the bootstrapped shape ------------------------
  docker exec "$name" psql -U postgres -q -c 'create database rehearse' >/dev/null
  run_sql rehearse < "${REPO_ROOT}/${BOOTSTRAP}" >/dev/null

  for pass in 1 2; do
    run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
      || fail "${image}: bridge apply pass ${pass} failed"
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
    # Ten emitted assertions: A1-A4 (table boundary), B1-B4 (routine boundary),
    # C1 (the append-only trigger exists) and C2. C2 is a tautology on purpose:
    # the DO block above it raises on either permitted write, so reaching C2 at
    # all is the proof, and the comparison exists only to emit a row.
    [ "$count" = "10" ] || fail "${image}: expected 10 assertions, got ${count}"
    echo "  behavioural suite after pass ${pass}: 10/10"
  done

  # ---- 3. A direct table grant must be REFUSED, not healed ---------------
  # This migration deliberately differs from M67 and M70. Those heal a stray
  # grant on re-apply. This one refuses, in the preflight AND again in the
  # post-condition, because a direct grant on customer identity data is
  # evidence that something already went wrong and must be surfaced. If a
  # future edit turns this into a heal, this assertion is what catches it.
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "grant select on public.research_assisted_order_documents to authenticated" >/dev/null
  pre="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select has_table_privilege('authenticated','public.research_assisted_order_documents','SELECT')")"
  [ "$pre" = "t" ] || fail "${image}: the stray grant did not take; the control would be vacuous"
  set +e
  broken="$(run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" 2>&1)"
  broken_rc=$?
  set -e
  [ "$broken_rc" -ne 0 ] \
    || fail "${image}: the bridge re-applied over a direct grant on identity documents; the boundary is decorative"
  echo "$broken" | grep -q "the revoke boundary is broken" \
    || fail "${image}: grant breach refused for the wrong reason: ${broken}"
  still="$(docker exec "$name" psql -U postgres -d rehearse -tAc \
    "select has_table_privilege('authenticated','public.research_assisted_order_documents','SELECT')")"
  [ "$still" = "t" ] \
    || fail "${image}: the refused apply silently removed the grant; it must surface the breach, not hide it"
  docker exec "$name" psql -U postgres -d rehearse -q -c \
    "revoke select on public.research_assisted_order_documents from authenticated" >/dev/null
  echo "  a direct table grant is refused and left visible, not silently healed"

  # The migration must still apply cleanly once the breach is genuinely fixed,
  # otherwise the refusal above would be a trap with no way out.
  run_sql rehearse < "${REPO_ROOT}/${MIGRATION}" >/dev/null \
    || fail "${image}: the bridge failed to re-apply after the grant breach was corrected"
  echo "  and applies cleanly again once the breach is corrected"

  docker rm -f "$name" >/dev/null 2>&1 || true
  trap - EXIT
  echo "  ${image}: PASS"
done

echo
echo "M71 REHEARSAL PASS on ${IMAGES[*]}. Production was not connected to or mutated."
