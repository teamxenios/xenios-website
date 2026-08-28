#!/usr/bin/env bash
set -euo pipefail

# Pinned by digest: the rehearsal must never float to a different PostgreSQL
# image under the same tag.
readonly POSTGRES_IMAGE="postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20"
readonly CONTAINER_NAME="xr-assisted-order-audit-${$}-${RANDOM}"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly CANDIDATE="${REPO_ROOT}/supabase/candidates/20260828_research_assisted_order_audit_store.sql"
readonly PRECHECK="${REPO_ROOT}/supabase/candidates/20260828_research_assisted_order_audit_store_precheck.sql"
readonly POSTCHECK="${REPO_ROOT}/supabase/candidates/20260828_research_assisted_order_audit_store_postcheck.sql"

cleanup() {
  docker rm --force "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --detach --rm \
  --name "${CONTAINER_NAME}" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=xenios_audit_rehearsal \
  "${POSTGRES_IMAGE}" >/dev/null

ready=false
for _ in $(seq 1 60); do
  if docker exec "${CONTAINER_NAME}" pg_isready \
    --username postgres --dbname xenios_audit_rehearsal >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != "true" ]]; then
  echo "PostgreSQL did not become ready inside the bounded window." >&2
  exit 1
fi

psql_admin() {
  docker exec --interactive \
    "${CONTAINER_NAME}" \
    psql --username postgres --dbname xenios_audit_rehearsal \
    --set ON_ERROR_STOP=1 --no-psqlrc "$@"
}

psql_service() {
  docker exec --interactive \
    "${CONTAINER_NAME}" \
    psql --username service_role --dbname xenios_audit_rehearsal \
    --set ON_ERROR_STOP=1 --no-psqlrc "$@"
}

expect_admin_failure() {
  local label="$1"
  local statement="$2"
  if psql_admin --command "${statement}" >/dev/null 2>&1; then
    echo "Expected admin failure was accepted: ${label}" >&2
    exit 1
  fi
}

expect_service_failure() {
  local label="$1"
  local statement="$2"
  if psql_service --command "${statement}" >/dev/null 2>&1; then
    echo "Expected service-role failure was accepted: ${label}" >&2
    exit 1
  fi
}

psql_admin >/dev/null <<SQL
create role anon nologin;
create role authenticated nologin;
create role service_role login noinherit;
create schema extensions authorization postgres;
create extension pgcrypto with schema extensions;
create table public.research_assisted_order_requests (
  id uuid primary key,
  created_at timestamptz not null default clock_timestamp()
);
insert into public.research_assisted_order_requests (id)
values ('22222222-2222-4222-8222-222222222222');
SQL

psql_admin <"${PRECHECK}" >/dev/null
psql_admin <"${CANDIDATE}" >/dev/null
psql_admin <"${POSTCHECK}" >/dev/null

# The RPC boundary is service_role-only. There is no direct table read or
# mutation path, even for the application role.
expect_service_failure "direct select" \
  "select * from public.research_assisted_order_audit_events_v1;"
expect_service_failure "direct insert" \
  "insert into public.research_assisted_order_audit_events_v1(event_id) values ('99999999-9999-4999-8999-999999999999');"
expect_service_failure "internal validator execute" \
  "select public.research_assisted_order_audit_evidence_valid('assisted_order.document_download_authorized', '{}'::jsonb);"

psql_service --tuples-only --no-align >/dev/null <<'SQL'
select public.research_assisted_order_audit_authority();
SQL

readonly EVENT_ONE="jsonb_build_object(
  'eventId','11111111-1111-4111-8111-111111111111',
  'eventKey','assisted-order-audit:v1:11111111-1111-4111-8111-111111111111',
  'eventFingerprint',repeat('a',64),
  'eventType','assisted_order.submitted',
  'requestId','22222222-2222-4222-8222-222222222222',
  'actorType','member',
  'actorAlias','aa1:test-key:' || repeat('b',64),
  'evidence',jsonb_build_object(
    'lineCount',2,
    'workflowModes',jsonb_build_array('direct_order_request','request_pricing'),
    'requestFingerprint',repeat('c',64)
  ),
  'occurredAt','2026-08-28T11:34:56.789Z'
)"

psql_service --tuples-only --no-align >/dev/null <<SQL
select public.research_assisted_order_audit_append(
  'research_assisted_order_audit_v1',
  'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
  ${EVENT_ONE}
);
SQL

# Exact replay returns replayed and writes exactly one row.
readonly REPLAY_STATE="$(psql_service --tuples-only --no-align <<SQL
select public.research_assisted_order_audit_append(
  'research_assisted_order_audit_v1',
  'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
  ${EVENT_ONE}
) ->> 'state';
SQL
)"
if [[ "${REPLAY_STATE}" != "replayed" ]]; then
  echo "Exact event replay did not return replayed." >&2
  exit 1
fi

expect_service_failure "conflicting duplicate" \
  "select public.research_assisted_order_audit_append(
    'research_assisted_order_audit_v1',
    'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
    jsonb_set(${EVENT_ONE}, '{eventFingerprint}', to_jsonb(repeat('d',64)))
  );"

expect_service_failure "extra evidence key" \
  "select public.research_assisted_order_audit_append(
    'research_assisted_order_audit_v1',
    'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
    jsonb_set(${EVENT_ONE}, '{evidence,url}', to_jsonb('https://forbidden.example'::text), true)
  );"

# Two concurrent exact appends serialize on the event key and converge on one
# immutable row. Both calls are valid: one inserts and one replays.
readonly EVENT_TWO="jsonb_build_object(
  'eventId','55555555-5555-4555-8555-555555555555',
  'eventKey','assisted-order-audit:v1:55555555-5555-4555-8555-555555555555',
  'eventFingerprint',repeat('e',64),
  'eventType','assisted_order.document_download_authorized',
  'requestId','22222222-2222-4222-8222-222222222222',
  'actorType','admin',
  'actorAlias','aa1:test-key:' || repeat('f',64),
  'evidence',jsonb_build_object('documentId','33333333-3333-4333-8333-333333333333'),
  'occurredAt','2026-08-28T11:35:00.000Z'
)"
readonly CONCURRENT_SQL="select public.research_assisted_order_audit_append(
  'research_assisted_order_audit_v1',
  'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
  ${EVENT_TWO}
);"
psql_service --command "${CONCURRENT_SQL}" >/dev/null &
readonly first_pid=$!
psql_service --command "${CONCURRENT_SQL}" >/dev/null &
readonly second_pid=$!
wait "${first_pid}"
wait "${second_pid}"

readonly EVENT_TWO_COUNT="$(psql_admin --tuples-only --no-align --command \
  "select count(*) from public.research_assisted_order_audit_events_v1 where event_id='55555555-5555-4555-8555-555555555555';")"
if [[ "${EVENT_TWO_COUNT}" != "1" ]]; then
  echo "Concurrent exact replay did not converge on one row." >&2
  exit 1
fi

# A later failure in the caller's transaction rolls the append back entirely.
readonly EVENT_THREE="jsonb_build_object(
  'eventId','66666666-6666-4666-8666-666666666666',
  'eventKey','assisted-order-audit:v1:66666666-6666-4666-8666-666666666666',
  'eventFingerprint',repeat('1',64),
  'eventType','assisted_order.document_download_authorized',
  'requestId','22222222-2222-4222-8222-222222222222',
  'actorType','system',
  'actorAlias',null,
  'evidence',jsonb_build_object('documentId','77777777-7777-4777-8777-777777777777'),
  'occurredAt','2026-08-28T11:36:00.000Z'
)"
if psql_service >/dev/null 2>&1 <<SQL
begin;
select public.research_assisted_order_audit_append(
  'research_assisted_order_audit_v1',
  'research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694',
  ${EVENT_THREE}
);
select 1 / 0;
commit;
SQL
then
  echo "Forced rollback transaction unexpectedly committed." >&2
  exit 1
fi
readonly EVENT_THREE_COUNT="$(psql_admin --tuples-only --no-align --command \
  "select count(*) from public.research_assisted_order_audit_events_v1 where event_id='66666666-6666-4666-8666-666666666666';")"
if [[ "${EVENT_THREE_COUNT}" != "0" ]]; then
  echo "Forced rollback left an audit row behind." >&2
  exit 1
fi

# Even the table owner cannot rewrite or erase history without explicitly
# removing the immutable trigger as a separately reviewed migration.
expect_admin_failure "owner update" \
  "update public.research_assisted_order_audit_events_v1 set event_fingerprint=repeat('9',64);"
expect_admin_failure "owner delete" \
  "delete from public.research_assisted_order_audit_events_v1;"
expect_admin_failure "owner truncate" \
  "truncate public.research_assisted_order_audit_events_v1;"

# Idempotent DDL reapply retains rows and re-establishes the exact grants and
# triggers; the candidate remains UNAPPLIED outside this disposable container.
psql_admin <"${CANDIDATE}" >/dev/null
psql_admin <"${POSTCHECK}" >/dev/null

readonly FINAL_COUNT="$(psql_admin --tuples-only --no-align --command \
  "select count(*) from public.research_assisted_order_audit_events_v1;")"
if [[ "${FINAL_COUNT}" != "2" ]]; then
  echo "Reapply or immutability checks changed the durable row count." >&2
  exit 1
fi

echo "Assisted-order audit store rehearsal PASS: pinned PostgreSQL, authority, grants, RLS, concurrency, replay, conflict, rollback, immutability, and reapply."
