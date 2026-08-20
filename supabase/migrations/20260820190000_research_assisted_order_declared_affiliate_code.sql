-- M75: the customer-typed affiliate code on the assisted-order request.
--
-- ADDITIVE AND BACKWARD COMPATIBLE, deliberately, because it is designed to be
-- applied BEFORE the runtime that writes the new fields. The columns are
-- nullable, the submit routine reads two new OPTIONAL json keys, and a caller
-- that sends neither behaves exactly as it does today. That is what makes the
-- safe order possible: migrate first, keep serving on the old runtime, then
-- deploy.
--
-- WHY A SEPARATE COLUMN RATHER THAN REUSING affiliate_attribution_ref.
-- That column holds SERVER-VERIFIED attribution derived from a signed referral
-- cookie, and the application refuses a browser-supplied value for it on
-- purpose: the browser must not choose which partner an order pays. A typed
-- code is a CLAIM. Storing a claim in the proven field would hand away exactly
-- the property that refusal protects, and no later reader could tell the two
-- apart. Two facts, two columns, and only a human moves a claim to "matched".
--
-- Requires: M71 (research_assisted_order_bridge), applied to production
-- 2026-08-19 as managed migration 20260819203614 and verified present before
-- this migration was written.

begin;
set local lock_timeout = '5s';

do $m75_preflight$
begin
  if to_regclass('public.research_assisted_order_requests') is null then
    raise exception 'M75 requires M71; public.research_assisted_order_requests is absent'
      using errcode = '55000';
  end if;
  if to_regprocedure('public.research_assisted_order_submit(jsonb)') is null then
    raise exception 'M75 requires the M71 submit routine'
      using errcode = '55000';
  end if;
  -- The same fail-closed check M71 makes. On a database without the Supabase
  -- role set the revokes below would bind to nothing, so the boundary would
  -- exist only as intent and this migration would report success having secured
  -- nothing.
  if not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'M75 requires the Supabase role set (service_role, anon, authenticated)'
      using errcode = '55000';
  end if;
end
$m75_preflight$;

-- ---------------------------------------------------------------------------
-- The two columns. Nullable, so every existing row stays valid and readable.
-- ---------------------------------------------------------------------------
alter table public.research_assisted_order_requests
  add column if not exists declared_affiliate_code text,
  add column if not exists declared_affiliate_code_state text;

do $m75_constraints$
begin
  -- The exact shape the application normalizes to. A row that fails this is a
  -- writer bug, never a customer mistake: malformed input is dropped upstream
  -- AND sanitized in the routine below, so this can only fire on a path that
  -- bypassed both.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_shape'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_shape
      check (
        declared_affiliate_code is null
        or declared_affiliate_code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_state'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_state
      check (
        declared_affiliate_code_state is null
        or declared_affiliate_code_state in (
          'not_provided', 'captured_unmatched', 'matched_manual', 'invalid_ignored'
        )
      );
  end if;

  -- A state that names a code must HAVE one, and a state that names none must
  -- not. Without this, "matched_manual" with a null code would read to an
  -- operator as a matched affiliate with no way to see which.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_assisted_order_requests_declared_code_agreement'
  ) then
    alter table public.research_assisted_order_requests
      add constraint research_assisted_order_requests_declared_code_agreement
      check (
        declared_affiliate_code_state is null
        or (declared_affiliate_code_state in ('captured_unmatched', 'matched_manual'))
           = (declared_affiliate_code is not null)
      );
  end if;
end
$m75_constraints$;

comment on column public.research_assisted_order_requests.declared_affiliate_code is
  'An affiliate code the CUSTOMER TYPED. A claim, never attribution: it grants nothing, changes no price, pathway, payment, permission or ownership, and stays unmatched until a human matches it. The server-verified attribution is affiliate_attribution_ref; the two must never be merged.';

comment on column public.research_assisted_order_requests.declared_affiliate_code_state is
  'not_provided | captured_unmatched | matched_manual | invalid_ignored. Only an operator may reach matched_manual; the submit routine refuses to write it.';

-- ---------------------------------------------------------------------------
-- The submit routine, REGENERATED from the definition running in production
-- (pg_get_functiondef, read 2026-08-20). Every existing property is preserved:
-- the same argument and return type, the same payload guards, the same line
-- count bounds, the same idempotency and fingerprint conflict, the same line
-- loop, the same event row, the same access token, the same returned receipt,
-- SECURITY DEFINER, and the pinned search_path. The ONLY differences are the
-- two added columns, the two added optional reads, and the sanitizing block.
--
-- SANITIZE, NEVER ABORT. A malformed code must not cost a customer their order.
-- If this routine passed junk straight through, the shape CHECK above would
-- abort the INSERT and the whole submission would fail, turning a typo in an
-- optional field into a lost order. The value is normalized to null here and
-- the state forced into agreement, so the CHECK can never be the thing a
-- customer meets.
-- ---------------------------------------------------------------------------
create or replace function public.research_assisted_order_submit(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_request_id uuid := (p_request ->> 'requestId')::uuid;
  v_existing public.research_assisted_order_requests%rowtype;
  v_line jsonb;
  v_line_count integer;
  v_inserted boolean := false;
  v_declared_code text;
  v_declared_state text;
begin
  if jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'assisted order payload must be an object';
  end if;
  if jsonb_typeof(p_request -> 'lines') <> 'array' then
    raise exception using errcode = '22023', message = 'assisted order lines must be an array';
  end if;
  v_line_count := jsonb_array_length(p_request -> 'lines');
  if v_line_count < 1 or v_line_count > 200 then
    raise exception using errcode = '22023', message = 'assisted order line count is invalid';
  end if;

  -- The declared affiliate code. Absent keys yield null and 'not_provided',
  -- which is exactly what the CURRENT production runtime produces, so this
  -- routine serves the existing client unchanged.
  -- UPPERCASE FIRST, then validate. The application normalizes case before it
  -- sends, but this routine must not depend on that: validating without
  -- normalizing means a caller that sends 'dana10' has a perfectly good code
  -- silently dropped as invalid, and the two layers would disagree about what a
  -- code is. Found by the managed-Supabase rehearsal, which submitted a
  -- lowercase code and watched it vanish.
  v_declared_code := upper(nullif(btrim(p_request ->> 'declaredAffiliateCode'), ''));
  v_declared_state := nullif(btrim(p_request ->> 'declaredAffiliateCodeState'), '');
  if v_declared_code is not null and v_declared_code !~ '^[A-Z0-9][A-Z0-9._-]{1,39}$' then
    v_declared_code := null;
    v_declared_state := 'invalid_ignored';
  end if;
  -- 'matched_manual' is an operator act and is deliberately NOT accepted from a
  -- payload, so no caller can submit an order that claims to be already matched.
  if v_declared_state is null
     or v_declared_state not in ('not_provided', 'captured_unmatched', 'invalid_ignored') then
    v_declared_state := case when v_declared_code is null then 'not_provided' else 'captured_unmatched' end;
  end if;
  if v_declared_code is null and v_declared_state = 'captured_unmatched' then
    v_declared_state := 'not_provided';
  end if;
  if v_declared_code is not null and v_declared_state in ('not_provided', 'invalid_ignored') then
    v_declared_state := 'captured_unmatched';
  end if;

  insert into public.research_assisted_order_requests (
    id,
    public_reference,
    idempotency_key_hash,
    request_fingerprint,
    actor_member_id,
    early_access_session_hash,
    normalized_email,
    full_legal_name,
    mobile_phone,
    organization_name,
    shipping_address,
    billing_address,
    age_confirmed,
    agreements,
    general_notes,
    affiliate_attribution_ref,
    declared_affiliate_code,
    declared_affiliate_code_state,
    estimated_total_cents,
    currency,
    source,
    status,
    created_at,
    updated_at
  ) values (
    v_request_id,
    p_request ->> 'publicReference',
    p_request ->> 'idempotencyKeyHash',
    p_request ->> 'requestFingerprint',
    nullif(p_request ->> 'actorMemberId', '')::uuid,
    nullif(p_request ->> 'earlyAccessSessionHash', ''),
    lower(btrim(p_request ->> 'normalizedEmail')),
    btrim(p_request ->> 'fullLegalName'),
    btrim(p_request ->> 'mobilePhone'),
    nullif(btrim(p_request ->> 'organizationName'), ''),
    p_request -> 'shippingAddress',
    p_request -> 'billingAddress',
    coalesce((p_request ->> 'ageConfirmed')::boolean, false),
    coalesce(p_request -> 'agreements', '[]'::jsonb),
    nullif(btrim(p_request ->> 'generalNotes'), ''),
    nullif(btrim(p_request ->> 'affiliateAttributionRef'), ''),
    v_declared_code,
    v_declared_state,
    nullif(p_request ->> 'estimatedTotalCents', '')::bigint,
    coalesce(p_request ->> 'currency', 'USD'),
    p_request ->> 'source',
    'submitted',
    coalesce((p_request ->> 'createdAt')::timestamptz, now()),
    coalesce((p_request ->> 'createdAt')::timestamptz, now())
  )
  on conflict (idempotency_key_hash) do nothing;

  get diagnostics v_line_count = row_count;
  v_inserted := v_line_count = 1;

  if v_inserted then
    for v_line in select * from jsonb_array_elements(p_request -> 'lines') loop
      insert into public.research_assisted_order_lines (
        id,
        request_id,
        product_id,
        variant_id,
        product_name,
        specification,
        format,
        pack_basis,
        quantity,
        minimum_quantity,
        maximum_quantity,
        quantity_increment,
        workflow_mode,
        customer_action_label,
        unit_price_cents,
        line_estimate_cents,
        currency,
        catalog_version,
        price_version,
        access_notice,
        research_use_only,
        authoritative_fingerprint,
        created_at
      ) values (
        (v_line ->> 'lineId')::uuid,
        v_request_id,
        v_line ->> 'productId',
        v_line ->> 'variantId',
        v_line ->> 'productName',
        nullif(v_line ->> 'specification', ''),
        nullif(v_line ->> 'format', ''),
        nullif(v_line ->> 'packBasis', ''),
        (v_line ->> 'quantity')::integer,
        (v_line ->> 'minimumQuantity')::integer,
        nullif(v_line ->> 'maximumQuantity', '')::integer,
        (v_line ->> 'quantityIncrement')::integer,
        v_line ->> 'workflowMode',
        v_line ->> 'customerActionLabel',
        nullif(v_line ->> 'unitPriceCents', '')::bigint,
        nullif(v_line ->> 'lineEstimateCents', '')::bigint,
        coalesce(v_line ->> 'currency', 'USD'),
        v_line ->> 'catalogVersion',
        nullif(v_line ->> 'priceVersion', ''),
        nullif(v_line ->> 'accessNotice', ''),
        coalesce((v_line ->> 'researchUseOnly')::boolean, false),
        v_line ->> 'authoritativeFingerprint',
        coalesce((p_request ->> 'createdAt')::timestamptz, now())
      );
    end loop;

    insert into public.research_assisted_order_events (
      request_id,
      status,
      actor_type,
      actor_id,
      customer_message,
      evidence,
      occurred_at
    ) values (
      v_request_id,
      'submitted',
      case when p_request ->> 'actorMemberId' is not null then 'member' else 'early_access_session' end,
      coalesce(p_request ->> 'actorMemberId', p_request ->> 'earlyAccessSessionHash'),
      'Your request has been received.',
      jsonb_build_object(
        'requestFingerprint', p_request ->> 'requestFingerprint',
        'lineCount', jsonb_array_length(p_request -> 'lines')
      ),
      coalesce((p_request ->> 'createdAt')::timestamptz, now())
    );
  else
    select * into strict v_existing
    from public.research_assisted_order_requests
    where idempotency_key_hash = p_request ->> 'idempotencyKeyHash'
    for update;

    if v_existing.request_fingerprint <> p_request ->> 'requestFingerprint' then
      raise exception using errcode = '23505', message = 'assisted order idempotency conflict';
    end if;
    v_request_id := v_existing.id;
  end if;

  insert into public.research_assisted_order_access_tokens (
    request_id,
    token_hash,
    created_at,
    expires_at
  ) values (
    v_request_id,
    p_request ->> 'statusTokenHash',
    now(),
    now() + interval '30 days'
  )
  on conflict (token_hash) do nothing;

  select * into strict v_existing
  from public.research_assisted_order_requests
  where id = v_request_id;

  return jsonb_build_object(
    'requestFingerprint', v_existing.request_fingerprint,
    'statusTokenHash', p_request ->> 'statusTokenHash',
    'receipt', jsonb_build_object(
      'requestId', v_existing.id,
      'publicReference', v_existing.public_reference,
      'createdAt', v_existing.created_at,
      'estimatedTotalCents', v_existing.estimated_total_cents,
      'lines', public.research_assisted_order_lines_json(v_existing.id)
    )
  );
end;
$function$;

-- The boundary, re-asserted. CREATE OR REPLACE preserves an existing ACL, but
-- managed Supabase grants EXECUTE to the client roles at CREATE time, and M71's
-- first production apply was REFUSED by exactly that gap. Stating it here means
-- the routine cannot come back reachable by a client role.
revoke all on function public.research_assisted_order_submit(jsonb)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_submit(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Transactional post-conditions. A half-applied state rolls the whole apply
-- back rather than reporting success.
-- ---------------------------------------------------------------------------
do $m75_postcheck$
declare
  v_missing integer;
  v_acl text;
begin
  select count(*) into v_missing
  from (values ('declared_affiliate_code'), ('declared_affiliate_code_state')) as needed(col)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'research_assisted_order_requests'
      and column_name = needed.col
  );
  if v_missing <> 0 then
    raise exception 'M75 postcheck: % declared-code column(s) missing', v_missing
      using errcode = '55000';
  end if;

  select count(*) into v_missing
  from (values
    ('research_assisted_order_requests_declared_code_shape'),
    ('research_assisted_order_requests_declared_code_state'),
    ('research_assisted_order_requests_declared_code_agreement')
  ) as needed(name)
  where not exists (select 1 from pg_constraint where conname = needed.name);
  if v_missing <> 0 then
    raise exception 'M75 postcheck: % declared-code constraint(s) missing', v_missing
      using errcode = '55000';
  end if;

  -- The routine must still be SECURITY DEFINER with a pinned search_path.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'research_assisted_order_submit'
      and p.prosecdef
      and array_to_string(p.proconfig, ',') like '%search_path=public%'
  ) then
    raise exception 'M75 postcheck: submit routine lost SECURITY DEFINER or its pinned search_path'
      using errcode = '55000';
  end if;

  -- No client role may execute it. Read straight from the ACL, including the
  -- PUBLIC pseudo-role, which is how the managed default-privilege gap shows up.
  select coalesce(array_to_string(p.proacl, ','), '') into v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'research_assisted_order_submit';
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' or v_acl like '%=X/%' then
    raise exception 'M75 postcheck: submit routine is reachable by a client role: %', v_acl
      using errcode = '55000';
  end if;

  -- Row level security on the requests table is untouched by this migration and
  -- must still be enabled AND forced.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'research_assisted_order_requests'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'M75 postcheck: row level security is not enabled and forced on the requests table'
      using errcode = '55000';
  end if;
end
$m75_postcheck$;

commit;
