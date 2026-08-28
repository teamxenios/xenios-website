\set ON_ERROR_STOP on
\pset pager off

select set_config('rehearsal.pass_number', :'rehearsal_pass', false);
select rehearsal.capture_public_state(
  format('rollback-pass-%s', current_setting('rehearsal.pass_number'))
);

do $verify_rollback$
declare
  rollback_label text := format(
    'rollback-pass-%s', current_setting('rehearsal.pass_number')
  );
  expected_tables constant text[] := array[
    'research_client_import_batches',
    'research_client_import_staging',
    'research_customer_account_invitation_events',
    'research_customer_account_invitations',
    'research_customer_product_interests',
    'research_product_activation_overlay_audit'
  ];
  expected_sequences constant text[] := array[
    'research_customer_account_invitation_events_event_id_seq',
    'research_product_activation_overlay_audit_audit_id_seq'
  ];
  expected_routines constant text[] := array[
    'research_client_accounts_append_only',
    'research_client_import_staging_freeze',
    'research_client_import_staging_touch',
    'research_client_invitation_draft',
    'research_client_invitation_event_append_only',
    'research_client_invitation_evidence_hash',
    'research_client_invitation_founder_approve',
    'research_client_invitation_guard',
    'research_client_invitation_record_event',
    'research_client_invitation_transition'
  ];
  expected_triggers constant text[] := array[
    'research_client_import_staging_freeze',
    'research_client_import_staging_touch',
    'research_client_invitation_events_no_rewrite',
    'research_client_invitation_guard',
    'research_client_invitation_record_event',
    'research_product_activation_overlay_audit_no_rewrite'
  ];
  object_name text;
  surviving_delta text;
begin
  if not exists (select 1 from rehearsal.first_apply_delta) then
    raise exception 'rollback verification has no captured first-apply delta';
  end if;

  foreach object_name in array expected_tables loop
    if to_regclass(format('public.%I', object_name)) is not null then
      raise exception 'rollback left candidate table public.% behind', object_name;
    end if;
  end loop;

  foreach object_name in array expected_sequences loop
    if to_regclass(format('public.%I', object_name)) is not null then
      raise exception 'rollback left identity sequence public.% behind', object_name;
    end if;
  end loop;

  if (select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any(expected_routines)) <> 0 then
    raise exception 'rollback left one of the exact ten candidate routines behind';
  end if;

  if (select count(*)
      from pg_trigger trigger_row
      where not trigger_row.tgisinternal
        and trigger_row.tgname = any(expected_triggers)) <> 0 then
    raise exception 'rollback left one of the exact six candidate triggers behind';
  end if;

  if exists (
    select 1
    from pg_type type_row
    join pg_namespace n on n.oid = type_row.typnamespace
    where n.nspname = 'public'
      and type_row.typtype = 'c'
      and type_row.typname = any(expected_tables)
  ) then
    raise exception 'rollback left a candidate table row type behind';
  end if;

  if exists (
    select 1
    from pg_policy policy
    join pg_class c on c.oid = policy.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(expected_tables)
  ) then
    raise exception 'rollback left a candidate policy behind';
  end if;

  -- This delta-driven check covers every explicit and implicit index, every
  -- constraint, all six row types, both sequences, all six triggers, all ten
  -- routines (three doors + seven helpers), tables, columns, and any future
  -- policy that a candidate revision might accidentally add.
  select format('%s %s', delta.object_kind, delta.object_identity)
    into surviving_delta
  from rehearsal.first_apply_delta delta
  join rehearsal.public_catalog_inventory rollback_catalog
    on rollback_catalog.capture_label = rollback_label
   and rollback_catalog.object_kind = delta.object_kind
   and rollback_catalog.object_identity = delta.object_identity
   and rollback_catalog.definition = delta.definition
  order by delta.object_kind, delta.object_identity
  limit 1;

  if surviving_delta is not null then
    raise exception 'rollback left captured candidate delta object % behind',
      surviving_delta;
  end if;
end
$verify_rollback$;

select rehearsal.assert_public_state_equal(
  'baseline',
  format('rollback-pass-%s', :'rehearsal_pass')
);

select rehearsal.record_phase(
  :'rehearsal_pass'::integer,
  'rollback',
  jsonb_build_object(
    'baselineCatalogRestored', true,
    'baselineDataRestored', true,
    'capturedDeltaAbsent', true,
    'tablesAbsent', 6,
    'routinesAbsent', 10,
    'triggersAbsent', 6,
    'identitySequencesAbsent', 2,
    'policiesCreatedByCandidate', 0
  )
);

select format(
  'PASS rollback pass %s: exact public catalog/data baseline restored and the complete captured delta is absent.',
  :'rehearsal_pass'
) as rehearsal_result;
