#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/.." && pwd -P)"
if command -v cygpath >/dev/null 2>&1; then
  docker_repo_root="$(cygpath -w "$repo_root")"
else
  docker_repo_root="$repo_root"
fi
# Git Bash otherwise rewrites container-internal /workspace paths into host
# paths before invoking docker.exe.
export MSYS_NO_PATHCONV=1

container="xr-webhook-atomic-verify-${BASHPID}-${RANDOM}"
scratch="$(mktemp -d)"
collision_output="$scratch/collision.out"
concurrent_a="$scratch/concurrent-a.out"
concurrent_b="$scratch/concurrent-b.out"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$collision_output" "$concurrent_a" "$concurrent_b"
  rmdir "$scratch" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1
docker image inspect postgres:16 >/dev/null

docker run --pull=never --rm -d \
  --name "$container" \
  --network none \
  --label xenios.verification=webhook-atomic \
  -e POSTGRES_PASSWORD=disposable-only \
  -e POSTGRES_DB=xr_atomic \
  --mount "type=bind,source=$docker_repo_root,target=/workspace,readonly" \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size=512m \
  postgres:16 >/dev/null

ready=0
for _attempt in $(seq 1 160); do
  if docker logs "$container" 2>&1 | grep -q "PostgreSQL init process complete" \
     && docker exec "$container" psql -X -Atq -U postgres -d xr_atomic \
          -c "select 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" != "1" ]]; then
  docker logs "$container" >&2
  echo "disposable Postgres did not become ready" >&2
  exit 1
fi

psql_file() {
  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d xr_atomic -f "$1"
}

psql_query() {
  docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d xr_atomic -c "$1"
}

psql_stdin() {
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d xr_atomic
}

assert_candidate_refuses() {
  local expected="$1"
  if psql_file /workspace/supabase/candidates/20260828_research_commerce_webhook_atomic_apply.sql \
       >"$collision_output" 2>&1; then
    echo "candidate unexpectedly accepted sentinel collision: $expected" >&2
    exit 1
  fi
  if ! grep -Fq "$expected" "$collision_output"; then
    echo "candidate failed without the expected collision refusal: $expected" >&2
    sed -n '1,120p' "$collision_output" >&2
    exit 1
  fi
}

psql_file /workspace/supabase/verification/research-commerce-webhook-atomic-apply-disposable-bootstrap.sql

# Every candidate-owned object name is collision-refusing. These sentinels are
# created one at a time; each failed candidate transaction must leave no schema
# residue before the sentinel is removed.
psql_stdin <<'SQL'
create function public.research_commerce_webhook_claim_and_apply_v1()
returns jsonb language sql as $$ select '{}'::jsonb $$;
SQL
assert_candidate_refuses "same-name routine collision"
psql_query "drop function public.research_commerce_webhook_claim_and_apply_v1()" >/dev/null

psql_stdin <<'SQL'
create function public.research_commerce_webhook_inbox_immutable()
returns trigger language plpgsql as $$ begin return new; end $$;
SQL
assert_candidate_refuses "same-name routine collision"
psql_query "drop function public.research_commerce_webhook_inbox_immutable()" >/dev/null

psql_stdin <<'SQL'
create function public.verification_sentinel_trigger()
returns trigger language plpgsql as $$ begin return new; end $$;
create trigger research_commerce_webhook_inbox_immutable
  before update on public.research_provider_webhook_events
  for each row execute function public.verification_sentinel_trigger();
SQL
assert_candidate_refuses "same-name trigger collision"
psql_query "drop trigger research_commerce_webhook_inbox_immutable on public.research_provider_webhook_events" >/dev/null
psql_query "drop function public.verification_sentinel_trigger()" >/dev/null

psql_query "alter table public.research_provider_webhook_events add constraint research_provider_webhook_events_atomic_bundle_check check (true)" >/dev/null
assert_candidate_refuses "same-name constraint collision"
psql_query "alter table public.research_provider_webhook_events drop constraint research_provider_webhook_events_atomic_bundle_check" >/dev/null

candidate_columns="$(psql_query "select count(*) from information_schema.columns where table_schema='public' and table_name='research_provider_webhook_events' and column_name like 'atomic_%' or table_schema='public' and table_name='research_provider_webhook_events' and column_name='payload_sha256'")"
if [[ "$candidate_columns" != "0" ]]; then
  echo "failed collision transaction leaked candidate columns" >&2
  exit 1
fi

psql_file /workspace/supabase/candidates/20260828_research_commerce_webhook_atomic_apply.sql
psql_file /workspace/supabase/verification/research-commerce-webhook-atomic-apply.verify.sql

# Force the winner to hold both the order and provider-event serialization
# boundary long enough for the second real database session to overlap.
psql_stdin <<'SQL'
insert into public.research_orders (
  id, state, payment_reference, last_idempotency_key, updated_at
) values (
  '77777777-7777-4777-8777-777777777777', 'approved',
  'pi_concurrent', 'admin-concurrent', now()
);
create function public.verification_delay_concurrent_capture()
returns trigger language plpgsql set search_path = pg_catalog
as $verification_delay_concurrent_capture$
begin
  if new.id = '77777777-7777-4777-8777-777777777777'::uuid
     and new.state = 'payment_captured' then
    perform pg_catalog.pg_sleep(1.25);
  end if;
  return new;
end
$verification_delay_concurrent_capture$;
create trigger verification_delay_concurrent_capture
  before update on public.research_orders
  for each row execute function public.verification_delay_concurrent_capture();
SQL

concurrent_sql="select public.research_commerce_webhook_claim_and_apply_v1('stripe','evt_concurrent','payment.captured',repeat('5',64),'2026-08-28T09:05:00Z','77777777-7777-4777-8777-777777777777','transition','payment_captured','pi_concurrent',null,null,null)->>'outcome'"
psql_query "$concurrent_sql" >"$concurrent_a" &
pid_a=$!
psql_query "$concurrent_sql" >"$concurrent_b" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

mapfile -t outcomes < <(sort "$concurrent_a" "$concurrent_b")
if [[ "${#outcomes[@]}" != "2" \
   || "${outcomes[0]}" != "applied" \
   || "${outcomes[1]}" != "duplicate" ]]; then
  echo "concurrent outcomes were not exactly applied + duplicate" >&2
  sed -n '1,20p' "$concurrent_a" "$concurrent_b" >&2
  exit 1
fi

concurrent_facts="$(psql_query "select count(*) || ':' || (select count(*) from public.research_order_state_events where order_id='77777777-7777-4777-8777-777777777777' and idempotency_key='evt_concurrent') || ':' || (select state from public.research_orders where id='77777777-7777-4777-8777-777777777777') || ':' || (select last_idempotency_key from public.research_orders where id='77777777-7777-4777-8777-777777777777') from public.research_provider_webhook_events where provider_name='stripe' and event_id='evt_concurrent'")"
if [[ "$concurrent_facts" != "1:1:payment_captured:admin-concurrent" ]]; then
  echo "concurrent transaction published incorrect facts: $concurrent_facts" >&2
  exit 1
fi

psql_query "drop trigger verification_delay_concurrent_capture on public.research_orders" >/dev/null
psql_query "drop function public.verification_delay_concurrent_capture()" >/dev/null

echo "webhook atomic candidate disposable verification passed: collisions, replay, digest conflict, non-claiming retry, payment/fulfillment/shipment facts, rollback, ACL, immutability, and two-session concurrency"
