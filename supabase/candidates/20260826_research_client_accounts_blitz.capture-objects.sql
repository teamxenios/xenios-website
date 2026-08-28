\set ON_ERROR_STOP on
\pset pager off

-- `rehearsal_pass` is supplied by the runner. Keep it in a session setting so
-- PL/pgSQL blocks can consume it without duplicating pass-specific SQL.
select set_config('rehearsal.pass_number', :'rehearsal_pass', false);

select rehearsal.capture_public_state(
  format('apply-pass-%s', current_setting('rehearsal.pass_number'))
);

do $capture_candidate_delta$
declare
  pass_number integer := current_setting('rehearsal.pass_number')::integer;
  target_capture_label text := format('apply-pass-%s', pass_number);
  mismatch text;
begin
  -- Applying this additive candidate may not rewrite any baseline object.
  select format('%s %s', object_kind, object_identity)
    into mismatch
  from (
    select object_kind, object_identity, definition
    from rehearsal.public_catalog_inventory inventory
    where inventory.capture_label = 'baseline'
    except
    select object_kind, object_identity, definition
    from rehearsal.public_catalog_inventory inventory
    where inventory.capture_label = target_capture_label
  ) missing_or_changed
  order by object_kind, object_identity
  limit 1;

  if mismatch is not null then
    raise exception 'candidate apply changed or removed baseline object %', mismatch;
  end if;

  if pass_number = 1 then
    delete from rehearsal.first_apply_delta;
    insert into rehearsal.first_apply_delta (
      object_kind, object_identity, definition
    )
    select object_kind, object_identity, definition
    from rehearsal.public_catalog_inventory inventory
    where inventory.capture_label = target_capture_label
    except
    select object_kind, object_identity, definition
    from rehearsal.public_catalog_inventory inventory
    where inventory.capture_label = 'baseline';
  else
    select format('%s %s', object_kind, object_identity)
      into mismatch
    from (
      (
        select object_kind, object_identity, definition
        from rehearsal.public_catalog_inventory inventory
        where inventory.capture_label = target_capture_label
        except
        select object_kind, object_identity, definition
        from rehearsal.public_catalog_inventory inventory
        where inventory.capture_label = 'baseline'
        except
        select object_kind, object_identity, definition
        from rehearsal.first_apply_delta
      )
      union all
      (
        select object_kind, object_identity, definition
        from rehearsal.first_apply_delta
        except
        (
          select object_kind, object_identity, definition
          from rehearsal.public_catalog_inventory inventory
          where inventory.capture_label = target_capture_label
          except
          select object_kind, object_identity, definition
          from rehearsal.public_catalog_inventory inventory
          where inventory.capture_label = 'baseline'
        )
      )
    ) delta_difference
    order by object_kind, object_identity
    limit 1;

    if mismatch is not null then
      raise exception 'pass 2 logical-object delta differs from pass 1 at %', mismatch;
    end if;
  end if;
end
$capture_candidate_delta$;

do $validate_candidate_delta_shape$
declare
  expected_tables constant text[] := array[
    'public.research_client_import_batches',
    'public.research_client_import_staging',
    'public.research_customer_account_invitation_events',
    'public.research_customer_account_invitations',
    'public.research_customer_product_interests',
    'public.research_product_activation_overlay_audit'
  ];
  expected_sequences constant text[] := array[
    'public.research_customer_account_invitation_events_event_id_seq',
    'public.research_product_activation_overlay_audit_audit_id_seq'
  ];
  expected_triggers constant text[] := array[
    'public.research_client_import_staging.research_client_import_staging_freeze',
    'public.research_client_import_staging.research_client_import_staging_touch',
    'public.research_customer_account_invitation_events.research_client_invitation_events_no_rewrite',
    'public.research_customer_account_invitations.research_client_invitation_guard',
    'public.research_customer_account_invitations.research_client_invitation_record_event',
    'public.research_product_activation_overlay_audit.research_product_activation_overlay_audit_no_rewrite'
  ];
  expected_row_types constant text[] := array[
    'public.research_client_import_batches',
    'public.research_client_import_staging',
    'public.research_customer_account_invitation_events',
    'public.research_customer_account_invitations',
    'public.research_customer_product_interests',
    'public.research_product_activation_overlay_audit'
  ];
  actual text[];
begin
  select array_agg(object_identity order by object_identity)
    into actual
  from rehearsal.first_apply_delta
  where object_kind = 'table';
  if actual is distinct from expected_tables then
    raise exception 'first-apply table delta is not the exact six-table set: %', actual;
  end if;

  select array_agg(object_identity order by object_identity)
    into actual
  from rehearsal.first_apply_delta
  where object_kind = 'sequence';
  if actual is distinct from expected_sequences then
    raise exception 'first-apply sequence delta is not the exact two-sequence set: %', actual;
  end if;

  select array_agg(object_identity order by object_identity)
    into actual
  from rehearsal.first_apply_delta
  where object_kind = 'trigger';
  if actual is distinct from expected_triggers then
    raise exception 'first-apply trigger delta is not the exact six-trigger set: %', actual;
  end if;

  select array_agg(object_identity order by object_identity)
    into actual
  from rehearsal.first_apply_delta
  where object_kind = 'row_type';
  if actual is distinct from expected_row_types then
    raise exception 'first-apply row-type delta is not the exact six-row-type set: %', actual;
  end if;

  if (select count(*) from rehearsal.first_apply_delta where object_kind = 'function') <> 10 then
    raise exception 'first-apply function delta is not exactly ten routines';
  end if;
  if (select count(*) from rehearsal.first_apply_delta where object_kind = 'index') <> 11 then
    raise exception 'first-apply index delta is not exactly eleven explicit+implicit indexes';
  end if;
  if not exists (
    select 1 from rehearsal.first_apply_delta
    where object_kind = 'index'
      and object_identity = 'public.research_client_import_staging_batch_idx'
  ) or not exists (
    select 1 from rehearsal.first_apply_delta
    where object_kind = 'index'
      and object_identity = 'public.research_customer_account_invitations_one_history'
  ) or not exists (
    select 1 from rehearsal.first_apply_delta
    where object_kind = 'index'
      and object_identity = 'public.research_client_import_batches_pkey'
  ) then
    raise exception 'first-apply index delta does not include explicit and implicit indexes';
  end if;
  if not exists (
    select 1 from rehearsal.first_apply_delta where object_kind = 'constraint'
  ) then
    raise exception 'first-apply delta did not capture constraints';
  end if;
  if exists (
    select 1 from rehearsal.first_apply_delta where object_kind = 'policy'
  ) then
    raise exception 'candidate unexpectedly created a policy; zero-policy forced RLS is required';
  end if;

  if (select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
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
        )) <> 10 then
    raise exception 'candidate routine set is not the exact three doors plus seven helpers';
  end if;
end
$validate_candidate_delta_shape$;

select rehearsal.record_phase(
  :'rehearsal_pass'::integer,
  'object-capture',
  jsonb_build_object(
    'logicalObjects', (select count(*) from rehearsal.first_apply_delta),
    'countsByKind', (
      select jsonb_object_agg(object_kind, object_count order by object_kind)
      from (
        select object_kind, count(*) as object_count
        from rehearsal.first_apply_delta
        group by object_kind
      ) counted
    )
  )
);

select format(
  'PASS object capture pass %s: first-apply delta is complete and logically identical.',
  :'rehearsal_pass'
) as rehearsal_result;
