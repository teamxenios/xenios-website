-- Xenios Research Early Access: the settled-awaiting-fulfillment queue read.
-- Candidate only. Register in the canonical migration DAG after founder review.
-- This migration creates no table, no policy, and no public/anon execution
-- path: it adds ONE read-only security-definer function over rows the
-- deployed commerce persistence migration (20260804121000) already holds,
-- following the M67 family's function-privilege pattern (service_role and
-- nobody else).
--
-- WHY THIS EXISTS. The operator lane can list orders under payment REVIEW
-- (awaitingReview) and can read ONE order's dispatch trail by number, but no
-- deployed read answers the launch question "which orders has a human taken
-- money for that nobody has shipped". Until this function exists the admin
-- route answers a NAMED 503 rather than inventing an empty queue, because a
-- fabricated "nothing to ship" is exactly how a paid order sits unshipped
-- with every screen looking clean.
--
-- ROLLBACK / CONTAINMENT: drop function
-- public.research_early_access_settled_awaiting_fulfillment(); nothing is
-- written by this migration, no table or grant changes, so the drop
-- restores the previous state exactly (the admin route returns to its
-- named 503).
--
-- INNER-JOIN SEMANTICS, stated deliberately: the reads join order_lines
-- and money_snapshots with INNER joins, so a settled order missing either
-- row would be silently absent from this queue. The deployed placement
-- commit (20260804121000) writes placement, lines, and money atomically,
-- so such a row should be unreachable; if operations ever suspects a
-- settled order is missing here, compare this queue against the payment
-- queue by order number before trusting the empty answer.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Every payment_verified placement with no recorded fulfillment, oldest
-- settlement first. The projection mirrors the server's
-- EarlyAccessSettledAwaitingFulfillmentRow field for field: durable columns
-- only (never a jsonb path that could drift from them), integer cents only,
-- and deliberately NO address and NO contact - this is a queue, and the
-- supplier packet read is the one surface that carries the address.
create or replace function public.research_early_access_settled_awaiting_fulfillment()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $settled_awaiting_fulfillment$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'orderNumber', s.order_number,
        'settledAt', s.settled_at,
        'sku', l.sku,
        'quantity', l.quantity,
        'payableTotalCents', m.payable_total_cents,
        'currency', m.currency,
        'trackingCount', coalesce(t.tracking_count, 0),
        'dispatchEventCount', coalesce(d.event_count, 0)
      )
      order by s.settled_at, s.order_number
    ),
    '[]'::jsonb
  )
  from public.research_early_access_settlements s
  join public.research_early_access_placements p
    on p.order_number = s.order_number
   and p.payment_state = 'payment_verified'
  join public.research_early_access_order_lines l
    on l.order_number = s.order_number
  join public.research_early_access_money_snapshots m
    on m.order_number = s.order_number
  left join public.research_early_access_fulfillments f
    on f.order_number = s.order_number
  left join lateral (
    select count(*)::integer as tracking_count
    from public.research_early_access_tracking tr
    where tr.order_number = s.order_number
  ) t on true
  left join lateral (
    select count(*)::integer as event_count
    from public.research_early_access_dispatch_events de
    where de.order_number = s.order_number
  ) d on true
  where f.order_number is null;
$settled_awaiting_fulfillment$;

comment on function public.research_early_access_settled_awaiting_fulfillment() is
  'Early Access operator queue: every settled (payment_verified) order with no recorded fulfillment, oldest settlement first. Read-only; service_role execute only.';

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else (the M67 family pattern)
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text := 'public.research_early_access_settled_awaiting_fulfillment()';
begin
  execute pg_catalog.format('revoke all on function %s from public', v_signature);
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
  end if;
end
$function_grants$;

commit;
