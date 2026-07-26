\set ON_ERROR_STOP on

begin;

do $verify$
declare
  v_direct public.research_required_inputs;
  v_secret public.research_required_inputs;
  v_readiness jsonb;
  v_input_audit uuid;
  v_launch_audit uuid;
begin
  select * into v_direct
  from public.research_define_required_input(
    jsonb_build_object(
      'key', 'products.variant.retail_price',
      'domain', 'products',
      'label', 'RETAIL PRICE REQUIRED',
      'description', 'Approved price for the exact product variant.',
      'whyRequired', 'Commerce cannot publish without an approved price.',
      'recordType', 'product_variant',
      'recordId', null,
      'fieldPath', 'pricing.retail',
      'blockingLevel', 'blocks_transaction',
      'responsibleRole', 'product_admin',
      'verificationMethod', 'Product administrator review.',
      'evidenceRequired', jsonb_build_array('Approved price record', 'Effective date'),
      'entryMode', 'direct',
      'publicLaunchImpact', 'Product commerce remains unavailable.',
      'nextAction', 'Enter and approve the price.',
      'adminEntryHref', '/admin/research/products'
    ),
    'release@example.test',
    '2026-07-26T01:00:00Z'
  );

  select * into v_secret
  from public.research_define_required_input(
    jsonb_build_object(
      'key', 'products.payment.credentials',
      'domain', 'products',
      'label', 'PAYMENT CREDENTIAL CONFIGURATION REQUIRED',
      'description', 'Approved payment-provider configuration.',
      'whyRequired', 'Checkout cannot send a transaction without reviewed configuration.',
      'recordType', 'environment_configuration',
      'recordId', null,
      'fieldPath', 'payments.credentials',
      'blockingLevel', 'blocks_public_launch',
      'responsibleRole', 'super_admin',
      'verificationMethod', 'Presence and provider account review without revealing a value.',
      'evidenceRequired', jsonb_build_array('Configuration name', 'Provider approval'),
      'entryMode', 'external_secret',
      'publicLaunchImpact', 'Checkout remains unavailable.',
      'nextAction', 'Configure and verify the approved payment credential.',
      'adminEntryHref', '/admin/research/required-inputs'
    ),
    'release@example.test',
    '2026-07-26T01:01:00Z'
  );

  begin
    perform public.research_transition_required_input(
      v_secret.id, 1, 'entered', 'release@example.test',
      'Credential attempted with a raw value.', '"must-not-store"'::jsonb,
      'PAYMENT_PROVIDER_KEY', '2026-07-26T01:02:00Z'
    );
    raise exception 'raw external secret value was accepted';
  exception
    when others then
      if sqlerrm not like '%secret_value_forbidden%' then raise; end if;
  end;

  select * into v_direct
  from public.research_transition_required_input(
    v_direct.id, 1, 'entered', 'product@example.test',
    'Approved price record entered.', '"149.00 USD"'::jsonb, null,
    '2026-07-26T01:03:00Z'
  );
  select * into v_direct
  from public.research_transition_required_input(
    v_direct.id, 2, 'under_review', 'reviewer@example.test',
    'Price and effective date are under review.', null, null,
    '2026-07-26T01:04:00Z'
  );
  select * into v_direct
  from public.research_transition_required_input(
    v_direct.id, 3, 'verified', 'reviewer@example.test',
    'Price record and effective date verified.', null, null,
    '2026-07-26T01:05:00Z'
  );

  v_readiness := public.research_set_readiness_manifest(
    'products', 0, 1, repeat('a', 64), 2, true,
    'release@example.test', 'Reviewed products readiness manifest.',
    '2026-07-26T01:06:00Z'
  );
  if (v_readiness->>'blockingInputCount')::integer <> 1 then
    raise exception 'expected one blocking input';
  end if;

  perform public.research_transition_launch_status(
    'products', 1, 'internal_review', 'release@example.test',
    'Software and manifest entered internal review.', '2026-07-26T01:07:00Z'
  );
  perform public.research_transition_launch_status(
    'products', 2, 'ready_for_real_data', 'release@example.test',
    'Internal review completed.', '2026-07-26T01:08:00Z'
  );
  perform public.research_transition_launch_status(
    'products', 3, 'real_data_entered', 'release@example.test',
    'Reviewed product price entered.', '2026-07-26T01:09:00Z'
  );
  perform public.research_transition_launch_status(
    'products', 4, 'release_review', 'release@example.test',
    'Release candidate entered final review.', '2026-07-26T01:10:00Z'
  );

  begin
    perform public.research_transition_launch_status(
      'products', 5, 'public_enabled', 'release@example.test',
      'Attempted before every blocking fact passed.', '2026-07-26T01:11:00Z'
    );
    raise exception 'public enablement bypassed a blocking input';
  exception
    when others then
      if sqlerrm not like '%readiness_blocked%' then raise; end if;
  end;

  select * into v_secret
  from public.research_transition_required_input(
    v_secret.id, 1, 'entered', 'release@example.test',
    'Approved configuration name entered without exposing its value.',
    null, 'PAYMENT_PROVIDER_KEY', '2026-07-26T01:12:00Z'
  );
  select * into v_secret
  from public.research_transition_required_input(
    v_secret.id, 2, 'under_review', 'release@example.test',
    'Configuration applicability entered independent review.',
    null, null, '2026-07-26T01:12:30Z'
  );
  select * into v_secret
  from public.research_transition_required_input(
    v_secret.id, 3, 'not_applicable', 'reviewer@example.test',
    'Payment credentials are not applicable to this non-transaction release.',
    null, null, '2026-07-26T01:13:00Z'
  );

  v_readiness := public.research_transition_launch_status(
    'products', 5, 'public_enabled', 'release@example.test',
    'Every manifest-bound blocking input passed review.',
    '2026-07-26T01:14:00Z'
  );
  if v_readiness->>'launchStatus' <> 'public_enabled'
     or (v_readiness->>'blockingInputCount')::integer <> 0 then
    raise exception 'validated public transition did not complete';
  end if;

  select id into v_input_audit
  from public.research_required_input_audit
  order by occurred_at
  limit 1;
  begin
    update public.research_required_input_audit
    set reason = 'Mutation must fail.'
    where id = v_input_audit;
    raise exception 'required-input audit update was accepted';
  exception
    when sqlstate '55000' then null;
  end;

  select id into v_launch_audit
  from public.research_domain_launch_audit
  order by occurred_at
  limit 1;
  begin
    delete from public.research_domain_launch_audit where id = v_launch_audit;
    raise exception 'launch audit delete was accepted';
  exception
    when sqlstate '55000' then null;
  end;

  if exists (
    select 1
    from public.research_required_inputs
    where entry_mode = 'external_secret' and entered_value is not null
  ) then
    raise exception 'external secret value persisted';
  end if;
end
$verify$;

rollback;

do $rollback$
begin
  if (select count(*) from public.research_required_inputs) <> 0
     or (select count(*) from public.research_required_input_audit) <> 0
     or (select count(*) from public.research_domain_launch_controls) <> 0
     or (select count(*) from public.research_domain_launch_audit) <> 0 then
    raise exception 'lifecycle fixtures survived rollback';
  end if;
end
$rollback$;

select
  count(*) filter (where relrowsecurity) as rls_enabled,
  count(*) filter (where relforcerowsecurity) as rls_forced
from pg_class
where oid in (
  'public.research_required_inputs'::regclass,
  'public.research_required_input_audit'::regclass,
  'public.research_domain_launch_controls'::regclass,
  'public.research_domain_launch_audit'::regclass
);

select count(*) as browser_table_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'research_required_inputs',
    'research_required_input_audit',
    'research_domain_launch_controls',
    'research_domain_launch_audit'
  )
  and grantee in ('anon', 'authenticated');

select count(*) as browser_function_grants
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'research_define_required_input',
    'research_transition_required_input',
    'research_domain_readiness',
    'research_set_readiness_manifest',
    'research_transition_launch_status'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC');
