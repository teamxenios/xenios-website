-- Bounded, concurrent-worker-safe expiry drain for canonical inventory holds.
-- The existing expire command owns the inventory movement and audit semantics;
-- this function only claims eligible work and invokes that command atomically.

create or replace function public.research_sweep_expired_inventory_reservations(
  p_actor_id uuid,
  p_at timestamptz,
  p_limit integer default 50,
  p_run_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $sweep$
declare
  v_claimed_ids text[];
  v_member record;
  v_batch_result jsonb;
  v_batch_count integer := 0;
  v_idempotency_key text;
begin
  if p_actor_id is null
     or p_at is null
     or date_trunc('milliseconds', p_at) <> p_at
     or p_limit not between 1 and 100
     or char_length(coalesce(p_run_key, '')) not between 16 and 160
     or btrim(p_run_key) <> p_run_key then
    raise exception 'inventory reservation sweep rejected';
  end if;

  select array_agg(claimed.reservation_id order by claimed.reservation_id)
    into v_claimed_ids
    from (
      select r.reservation_id
        from public.research_lot_reservations r
       where r.status = 'held'
         and r.expires_at <= p_at
         and r.created_at <= p_at
         and r.updated_at <= p_at
       order by r.expires_at, r.reservation_id
       limit p_limit
       for update skip locked
    ) claimed;

  if coalesce(cardinality(v_claimed_ids), 0) = 0 then
    return jsonb_build_object(
      'action', 'expire_sweep',
      'claimedCount', 0,
      'memberBatchCount', 0,
      'reservationIds', '[]'::jsonb
    );
  end if;

  for v_member in
    select
      r.member_id,
      array_agg(r.reservation_id order by r.reservation_id) as reservation_ids
    from public.research_lot_reservations r
    where r.reservation_id = any(v_claimed_ids)
    group by r.member_id
    order by r.member_id
  loop
    v_idempotency_key := concat(
      'inventory-expiry-sweep:v1:',
      substr(encode(extensions.digest(
        concat_ws('|', p_run_key, v_member.member_id::text,
          to_jsonb(v_member.reservation_ids)::text),
        'sha256'
      ), 'hex'), 1, 48)
    );

    v_batch_result := public.research_expire_inventory_reservations(
      v_member.member_id,
      p_actor_id,
      v_member.reservation_ids,
      p_at,
      v_idempotency_key,
      'Expired inventory reservation sweeper'
    );
    if v_batch_result ->> 'action' <> 'expire' then
      raise exception 'inventory reservation sweep rejected';
    end if;
    v_batch_count := v_batch_count + 1;
  end loop;

  return jsonb_build_object(
    'action', 'expire_sweep',
    'claimedCount', cardinality(v_claimed_ids),
    'memberBatchCount', v_batch_count,
    'reservationIds', to_jsonb(v_claimed_ids)
  );
end;
$sweep$;

revoke all on function public.research_sweep_expired_inventory_reservations(
  uuid, timestamptz, integer, text
) from public, anon, authenticated, service_role;

grant execute on function public.research_sweep_expired_inventory_reservations(
  uuid, timestamptz, integer, text
) to service_role;
