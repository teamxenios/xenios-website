begin;
set local lock_timeout = '5s';

-- The staff workflow view shows one word for each request's latest customer
-- notice (workflow_projection, through workflow_customer_notice). Until now
-- that word came from the outbox job alone, and the outbox marks a job 'sent'
-- when the provider accepts it. A notice the receiving server later took, or
-- one that bounced, therefore still read 'provider_accepted'.
--
-- This replaces only workflow_customer_notice. For a job the provider
-- accepted, it now also reads the provider's signed reports for that notice
-- (customer_notice_receipt_evidence, matched through the notice's own stored
-- provider message id when read):
--
--   delivered    -> delivered_to_server  the receiving server took it
--   bounced      -> failed               the provider reported a bounce
--   conflicting  -> delivery_unknown     both were reported; staff reconcile
--   anything else -> provider_accepted   no report, an acceptance report, or
--                                        a stored id that cannot be attributed
--
-- It returns the same seven fixed words as before, never an address, a
-- provider id or bounce text, and it changes no job: a bounced notice stays
-- 'sent' in the outbox, so nothing resends it. Delivered to a server is not
-- read by the customer. Every other outbox status reads exactly as before.
create or replace function request_intent_private.workflow_customer_notice(p_request_id uuid, p_event_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  job_id uuid;
  job_status text;
  job_error text;
  evidence text;
begin
  if p_request_id is null or p_event_id is null or not exists (
    select 1 from request_intent_private.workflow_notice_intents i
    where i.event_id = p_event_id and i.request_id = p_request_id
  ) then
    return 'unavailable';
  end if;
  select o.id, o.status, o.last_error_summary into job_id, job_status, job_error
  from public.research_notification_outbox o
  where o.event_key = 'ea-request-customer-' || p_event_id::text;
  if not found then return 'unavailable'; end if;
  if job_status = 'delivered' then return 'delivered_to_server'; end if;
  if job_status = 'sent' then
    evidence := request_intent_private.customer_notice_receipt_evidence(p_request_id, p_event_id);
    if evidence = 'delivered' then return 'delivered_to_server'; end if;
    if evidence = 'bounced' then return 'failed'; end if;
    if evidence = 'conflicting' then return 'delivery_unknown'; end if;
    return 'provider_accepted';
  end if;
  if job_status in ('pending', 'processing', 'failed_retryable') then return 'pending'; end if;
  if job_status = 'cancelled' then return 'suppressed'; end if;
  -- A job that stopped after a send whose result was never confirmed may have
  -- been delivered. That is unknown, not failed.
  if exists (
    select 1 from public.research_notification_attempts a
    where a.outbox_id = job_id and a.outcome = 'failed'
      and (a.error_summary = 'Customer notice send had no confirmed result.'
        or a.error_summary like '%stale processing%')
  ) then
    return 'delivery_unknown';
  end if;
  if coalesce(job_error, '') like 'Not sent:%' then return 'suppressed'; end if;
  return 'failed';
end;
$$;

-- Unchanged access: callable only from the workflow's definer functions.
revoke all on function request_intent_private.workflow_customer_notice(uuid, uuid)
  from public, anon, authenticated, service_role;
commit;
