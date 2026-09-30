-- Temporary fail-closed HL-12 boundary. A free-text verification id is not
-- an accepted quote, observed amount or authorized verification record. Until
-- the full financial authority is mounted, no new paid status or downstream
-- transition from a historical paid label may be asserted in this bridge.
-- A successor migration must replace this trigger only when durable SQL and
-- mounted application payment verification are qualified together.

create or replace function public.research_assisted_order_paid_hold_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      raise exception using errcode = 'P0001',
        message = 'Assisted order financial authority is not ready.',
        detail = 'ASSISTED_ORDER_FINANCIAL_AUTHORITY_NOT_READY';
    end if;
    return new;
  end if;

  if new.status = 'paid' and old.status <> 'paid' then
    raise exception using errcode = 'P0001',
      message = 'Assisted order financial authority is not ready.',
      detail = 'ASSISTED_ORDER_FINANCIAL_AUTHORITY_NOT_READY';
  end if;
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception using errcode = 'P0001',
      message = 'Historical paid labels cannot establish fulfillment or reversal eligibility.',
      detail = 'ASSISTED_ORDER_FINANCIAL_AUTHORITY_NOT_READY';
  end if;
  return new;
end
$guard$;

drop trigger if exists research_assisted_order_paid_hold on public.research_assisted_order_requests;
create trigger research_assisted_order_paid_hold
before insert or update of status on public.research_assisted_order_requests
for each row execute function public.research_assisted_order_paid_hold_guard();

revoke all on function public.research_assisted_order_paid_hold_guard()
from public, anon, authenticated, service_role;
