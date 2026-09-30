-- HL-26 forward correction for the assisted-order bridge. M71 raised 40001
-- for deterministic compare-and-set misses. PostgREST retries that SQLSTATE
-- even after the precondition can never become true. Only those two refusals
-- become non-retryable P0001 with stable details; genuine engine serialization
-- failures retain 40001. All other M71 transition and evidence rules remain.
-- This source-only candidate does NOT complete HL-12 payment integrity.

create or replace function public.research_assisted_order_set_status(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id text,
  p_actor_type text,
  p_customer_message text default null,
  p_internal_note text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $status$
declare
  v_updated integer;
  v_allowed text[];
  v_evidence_field text;
begin
  v_allowed := case p_expected_status
    when 'submitted' then array['reviewing', 'cancelled']
    when 'reviewing' then array['waiting_on_customer', 'identity_requested', 'agreements_pending', 'payment_pending', 'cancelled']
    when 'waiting_on_customer' then array['reviewing', 'cancelled']
    when 'identity_requested' then array['identity_received', 'cancelled']
    when 'identity_received' then array['reviewing', 'agreements_pending', 'cancelled']
    when 'agreements_pending' then array['agreements_complete', 'cancelled']
    when 'agreements_complete' then array['payment_pending', 'cancelled']
    when 'payment_pending' then array['payment_review', 'cancelled']
    when 'payment_review' then array['paid', 'payment_pending', 'cancelled']
    when 'paid' then array['supplier_processing', 'cancelled']
    when 'supplier_processing' then array['shipped', 'cancelled']
    when 'shipped' then array['delivered']
    when 'delivered' then array['closed']
    when 'closed' then array[]::text[]
    when 'cancelled' then array[]::text[]
    else null
  end;

  if v_allowed is null or p_new_status <> all(v_allowed) then
    raise exception using errcode = '23514',
      message = pg_catalog.format(
        'assisted order transition %s -> %s is not allowed',
        p_expected_status, p_new_status);
  end if;

  v_evidence_field := case p_new_status
    when 'agreements_complete' then 'agreementAttestationId'
    when 'paid' then 'paymentVerificationId'
    when 'supplier_processing' then 'supplierAssignmentId'
    when 'shipped' then 'trackingId'
    when 'cancelled' then 'cancellationReason'
    else null
  end;

  if v_evidence_field is not null
     and nullif(btrim(coalesce(p_evidence ->> v_evidence_field, '')), '') is null then
    raise exception using errcode = '23514',
      message = pg_catalog.format(
        'assisted order status %s requires evidence field %s',
        p_new_status, v_evidence_field);
  end if;

  update public.research_assisted_order_requests
  set status = p_new_status,
      updated_at = p_occurred_at
  where id = p_request_id
    and status = p_expected_status;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = 'P0001',
      message = 'Assisted order status changed concurrently.',
      detail = 'ASSISTED_ORDER_STALE_STATUS';
  end if;

  insert into public.research_assisted_order_events (
    request_id, status, actor_type, actor_id, customer_message,
    internal_note, evidence, occurred_at
  ) values (
    p_request_id, p_new_status, p_actor_type, p_actor_id,
    nullif(btrim(p_customer_message), ''), nullif(btrim(p_internal_note), ''),
    coalesce(p_evidence, '{}'::jsonb), p_occurred_at
  );

  return public.research_assisted_order_admin_json(p_request_id);
end
$status$;

create or replace function public.research_assisted_order_document_complete(
  p_request_id uuid,
  p_document_id uuid,
  p_object_path text,
  p_uploaded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $document$
declare
  v_document public.research_assisted_order_documents%rowtype;
begin
  update public.research_assisted_order_documents
  set status = 'uploaded',
      uploaded_at = p_uploaded_at
  where id = p_document_id
    and request_id = p_request_id
    and object_path = p_object_path
    and status = 'upload_pending'
  returning * into v_document;

  if not found then
    raise exception using errcode = 'P0001',
      message = 'Assisted order document is not pending.',
      detail = 'ASSISTED_ORDER_DOCUMENT_NOT_PENDING';
  end if;

  return pg_catalog.jsonb_build_object(
    'documentId', v_document.id,
    'documentType', v_document.document_type,
    'side', v_document.side,
    'fileName', v_document.file_name,
    'status', v_document.status,
    'uploadedAt', v_document.uploaded_at
  );
end
$document$;

-- Revoke default PUBLIC function privileges and preserve M71's sole
-- service-role execution authority. Direct anon/authenticated RPCs stay shut.
revoke all on function public.research_assisted_order_set_status(
  uuid, text, text, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_assisted_order_document_complete(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_assisted_order_set_status(
  uuid, text, text, text, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.research_assisted_order_document_complete(
  uuid, uuid, text, timestamptz
) to service_role;
