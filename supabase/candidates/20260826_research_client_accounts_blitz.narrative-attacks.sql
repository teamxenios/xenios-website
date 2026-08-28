\set ON_ERROR_STOP on
\pset pager off

select set_config('rehearsal.pass_number', :'rehearsal_pass', false);

delete from rehearsal.narrative_fixtures
where pass_number = :'rehearsal_pass'::integer;

-- One synthetic fixture family per pass. The generated values are invalid
-- external addresses and contain no real person data.
set role service_role;

insert into public.research_client_import_batches (
  batch_id,
  source_label,
  source_partner,
  relationship_owner,
  dry_run,
  total_rows,
  unique_people,
  report,
  created_by
) values (
  format('imp-narrative-pass-%s', :'rehearsal_pass'),
  format('Synthetic narrative pass %s', :'rehearsal_pass'),
  format('narrative_pass_%s', :'rehearsal_pass'),
  'Disposable harness',
  true,
  40,
  40,
  jsonb_build_object('synthetic', true, 'pass', :'rehearsal_pass'::integer),
  'disposable-harness'
);

insert into public.research_client_import_staging (
  staging_id,
  batch_id,
  source_name,
  normalized_name_key,
  interest_keys,
  raw_interests,
  unmapped_interests,
  source_partner,
  relationship_owner,
  consent_status,
  contact_email,
  us_state
)
select
  format(
    'imp-narrative-pass-%s-p%s',
    :'rehearsal_pass',
    lpad(fixture_number::text, 4, '0')
  ),
  format('imp-narrative-pass-%s', :'rehearsal_pass'),
  format('Synthetic Narrative %s %s', :'rehearsal_pass', fixture_number),
  format('synthetic-narrative-%s-%s', :'rehearsal_pass', fixture_number),
  array['synthetic-product'],
  array['Synthetic Product'],
  '{}'::text[],
  format('narrative_pass_%s', :'rehearsal_pass'),
  'Disposable harness',
  case when fixture_number = 3 then 'pending' else 'granted' end,
  case
    when fixture_number = 2 then null
    else format(
      'narrative-p%s-%s@example.invalid',
      :'rehearsal_pass',
      lpad(fixture_number::text, 4, '0')
    )
  end,
  'IL'
from generate_series(1, 40) fixture_number;

insert into rehearsal.narrative_fixtures (
  pass_number, fixture_key, staging_id, invitation_id
)
select
  :'rehearsal_pass'::integer,
  fixtures.fixture_key,
  format(
    'imp-narrative-pass-%s-p%s',
    :'rehearsal_pass',
    lpad(fixtures.fixture_number::text, 4, '0')
  ),
  public.research_client_invitation_draft(format(
    'imp-narrative-pass-%s-p%s',
    :'rehearsal_pass',
    lpad(fixtures.fixture_number::text, 4, '0')
  ))
from (values
  ('A6', 1),
  ('A10', 2),
  ('A11', 3),
  ('A7', 4),
  ('A8', 5),
  ('A9', 6),
  ('A12', 7),
  ('A13', 8),
  ('A14', 9),
  ('A15', 10),
  ('V2-1', 11),
  ('V2-2a', 12),
  ('V2-2b', 13),
  ('V2-2c', 14),
  ('V2-3a', 15),
  ('V2-3b', 16),
  ('V2-3c', 17),
  ('V2-3d', 18),
  ('V2-4', 19),
  ('V2-5', 20),
  ('V2-6a', 21),
  ('V2-6b', 22),
  ('V2-7', 23)
) fixtures(fixture_key, fixture_number);

-- -------------------------------------------------------------------------
-- Historical v1 denominator: exactly A1,A2,A4,A6-A15,A16a-e (18 rows).
-- -------------------------------------------------------------------------

set role anon;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A1',
  'narrative.A1.anon-staging-read',
  'select * from public.research_client_import_staging',
  '42501',
  'permission denied for table research_client_import_staging'
);

set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A2',
  'narrative.A2.service-direct-insert',
  format(
    'insert into public.research_customer_account_invitations(staging_id) values (%L)',
    format('imp-narrative-pass-%s-p0039', :'rehearsal_pass')
  ),
  '42501',
  'permission denied for table research_customer_account_invitations'
);

reset role;
reset request.jwt.claim.sub;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A4',
  'narrative.A4.owner-approved-birth',
  format(
    'insert into public.research_customer_account_invitations(staging_id, state) values (%L, %L)',
    format('imp-narrative-pass-%s-p0038', :'rehearsal_pass'),
    'founder_approved'
  ),
  'P0001',
  'an invitation is born draft; founder_approved is not a birth state'
);

set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A6',
  'narrative.A6.draft-to-queued',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A6'),
    'queued'
  ),
  'P0001',
  'invitation transition draft -> queued is not in the state machine'
);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A7',
  'narrative.A7.non-admin-approval',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A7'),
    'wave-a7'
  ),
  'P0001',
  'authenticated actor 22222222-2222-4222-8222-222222222222 is not a currently-active super_admin'
);

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A8',
  'narrative.A8.revoked-admin-approval',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A8'),
    'wave-a8'
  ),
  'P0001',
  'authenticated actor 33333333-3333-4333-8333-333333333333 is not a currently-active super_admin'
);

-- A9 is the exact historical owner update with caller-supplied actor text.
-- The current guard must stop at the absent authenticated actor, not accept
-- the text and not fail later for a different reason.
reset role;
reset request.jwt.claim.sub;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A9',
  'narrative.A9.unauthenticated-actor-text',
  format(
    'update public.research_customer_account_invitations set state = %L, approved_wave = %L, approved_by = %L where invitation_id = %L::uuid',
    'founder_approved',
    'wave-a9',
    'Samuel',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A9')
  ),
  'P0001',
  'founder approval requires an authenticated auth.uid()'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A10',
  'narrative.A10.missing-contact',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A10'),
    'wave-a10'
  ),
  'P0001',
  format(
    'staged person imp-narrative-pass-%s-p0002 has no contact information; enrichment precedes approval',
    :'rehearsal_pass'
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A11',
  'narrative.A11.pending-consent',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A11'),
    'wave-a11'
  ),
  'P0001',
  format(
    'staged person imp-narrative-pass-%s-p0003 has consent_status pending; only granted consent can be approved',
    :'rehearsal_pass'
  )
);

set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A12',
  'narrative.A12.second-history',
  format(
    'select public.research_client_invitation_draft(%L)',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A12')
  ),
  '23505',
  'duplicate key value violates unique constraint "research_customer_account_invitations_one_history"'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.research_client_invitation_founder_approve(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A13'),
  'wave-a13'
);

set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A13',
  'narrative.A13.approved-to-sent',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A13'),
    'sent'
  ),
  'P0001',
  'invitation transition founder_approved -> sent is not in the state machine'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.research_client_invitation_founder_approve(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A14'),
  'wave-a14'
);
set role service_role;
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A14'),
  'queued'
);
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A14'),
  'sent'
);

reset role;
select rehearsal.assert_attack_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A14',
  'narrative.A14.accepted-unrepresentable',
  (
    select count(*) = 2
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (c.relname = 'research_customer_account_invitations'
          and con.conname = 'research_customer_account_invitations_state_check')
        or
        (c.relname = 'research_customer_account_invitation_events'
          and con.conname = 'research_customer_account_invitation_events_next_state_check')
      )
      and pg_get_constraintdef(con.oid) not like '%accepted%'
  ),
  'accepted is absent from both persisted state CHECK vocabularies'
);
set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A14',
  'narrative.A14.sent-to-queued',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A14'),
    'queued'
  ),
  'P0001',
  'invitation transition sent -> queued is not in the state machine'
);

reset role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A15',
  'narrative.A15.owner-delete-invitation',
  format(
    'delete from public.research_customer_account_invitations where invitation_id = %L::uuid',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A15')
  ),
  'P0001',
  format(
    'invitations are history: revoke or expire %s, never delete it',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'A15')
  )
);

set role service_role;
insert into public.research_product_activation_overlay_audit (
  group_id, event, detail, recorded_by
) values (
  format('Q-2026-08-28-%s', lpad(:'rehearsal_pass', 2, '0')),
  'hold_recorded',
  jsonb_build_object('synthetic', true, 'pass', :'rehearsal_pass'::integer),
  'disposable-harness'
) returning audit_id as narrative_audit_id \gset

select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A16a',
  'narrative.A16a.service-audit-update',
  format(
    'update public.research_product_activation_overlay_audit set recorded_by = %L where audit_id = %s',
    'forged', :'narrative_audit_id'
  ),
  '42501',
  'permission denied for table research_product_activation_overlay_audit'
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A16b',
  'narrative.A16b.service-audit-delete',
  format(
    'delete from public.research_product_activation_overlay_audit where audit_id = %s',
    :'narrative_audit_id'
  ),
  '42501',
  'permission denied for table research_product_activation_overlay_audit'
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A16c',
  'narrative.A16c.service-audit-nextval',
  $$select nextval('public.research_product_activation_overlay_audit_audit_id_seq')$$,
  '42501',
  'permission denied for sequence research_product_activation_overlay_audit_audit_id_seq'
);

reset role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A16d',
  'narrative.A16d.owner-audit-update',
  format(
    'update public.research_product_activation_overlay_audit set recorded_by = %L where audit_id = %s',
    'forged', :'narrative_audit_id'
  ),
  'P0001',
  format(
    'audit table research_product_activation_overlay_audit is append only. Record a new row that references the original instead of UPDATE on row %s.',
    :'narrative_audit_id'
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v1',
  'A16e',
  'narrative.A16e.owner-audit-delete',
  format(
    'delete from public.research_product_activation_overlay_audit where audit_id = %s',
    :'narrative_audit_id'
  ),
  'P0001',
  format(
    'audit table research_product_activation_overlay_audit is append only. Record a new row that references the original instead of DELETE on row %s.',
    :'narrative_audit_id'
  )
);

-- -------------------------------------------------------------------------
-- v2 denominator: exactly V2-1,V2-2a/b/c,V2-3a/b/c/d,V2-4,V2-5,V2-6a/b.
-- V2-7 is executed too, but is explicitly additional and uncounted.
-- -------------------------------------------------------------------------

set role service_role;
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-1'),
  'revoked'
);
reset role;
select rehearsal.assert_attack_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-1',
  'narrative.V2-1.draft-revoked-null-bundle',
  (
    select state = 'revoked'
      and approved_wave is null
      and approved_by is null
      and approved_at is null
      and approved_snapshot_hash is null
      and approved_row_version is null
    from public.research_customer_account_invitations
    where invitation_id = (
      select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-1'
    )
  ),
  'draft to revoked succeeds with the complete approval bundle null'
);

-- Approve every v2 fixture that needs a live snapshot with the real
-- authenticated active-super-admin door.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.research_client_invitation_founder_approve(
  fixture.invitation_id,
  format('wave-%s', lower(fixture.fixture_key))
)
from rehearsal.narrative_fixtures fixture
where fixture.pass_number = :'rehearsal_pass'::integer
  and fixture.fixture_key in (
    'V2-2a', 'V2-2b', 'V2-2c',
    'V2-3a', 'V2-3b', 'V2-3c', 'V2-3d',
    'V2-4', 'V2-5', 'V2-6b', 'V2-7'
  )
order by fixture.fixture_key;

reset role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-2a',
  'narrative.V2-2a.mutate-consent',
  format(
    'update public.research_client_import_staging set consent_status = %L where staging_id = %L',
    'declined',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2a')
  ),
  'P0001',
  format(
    'staging row %s carries a live approved invitation; approved evidence is immutable — revoke the invitation before editing',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2a')
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-2b',
  'narrative.V2-2b.mutate-email',
  format(
    'update public.research_client_import_staging set contact_email = %L where staging_id = %L',
    format('mutated-v2-2b-pass-%s@example.invalid', :'rehearsal_pass'),
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2b')
  ),
  'P0001',
  format(
    'staging row %s carries a live approved invitation; approved evidence is immutable — revoke the invitation before editing',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2b')
  )
);

-- V2-2c proves the snapshot wall independently of the freeze trigger. The
-- trigger is re-enabled before this test can be considered complete.
alter table public.research_client_import_staging
  disable trigger research_client_import_staging_freeze;
update public.research_client_import_staging
set contact_email = format('trigger-bypass-pass-%s@example.invalid', :'rehearsal_pass')
where staging_id = (
  select staging_id from rehearsal.narrative_fixtures
  where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2c'
);
set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-2c',
  'narrative.V2-2c.trigger-bypass-snapshot-mismatch',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2c'),
    'queued'
  ),
  'P0001',
  format(
    'invitation %s approved evidence has changed since approval (snapshot mismatch); revoke and reconcile before any future invitation',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-2c')
  )
);
reset role;
alter table public.research_client_import_staging
  enable trigger research_client_import_staging_freeze;
select rehearsal.assert_true(
  'V2-2c freeze trigger finishes enabled',
  (select t.tgenabled = 'O'
   from pg_trigger t
   where t.tgrelid = 'public.research_client_import_staging'::regclass
     and t.tgname = 'research_client_import_staging_freeze')
);

select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-3a',
  'narrative.V2-3a.mutate-approver',
  format(
    'update public.research_customer_account_invitations set approved_by = %L where invitation_id = %L::uuid',
    '22222222-2222-4222-8222-222222222222',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3a')
  ),
  'P0001',
  format(
    'invitation %s approval bundle is immutable',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3a')
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-3b',
  'narrative.V2-3b.mutate-approved-at',
  format(
    'update public.research_customer_account_invitations set approved_at = approved_at + interval %L where invitation_id = %L::uuid',
    '1 second',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3b')
  ),
  'P0001',
  format(
    'invitation %s approval bundle is immutable',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3b')
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-3c',
  'narrative.V2-3c.mutate-hash',
  format(
    'update public.research_customer_account_invitations set approved_snapshot_hash = repeat(%L, 64) where invitation_id = %L::uuid',
    '0',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3c')
  ),
  'P0001',
  format(
    'invitation %s approval bundle is immutable',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3c')
  )
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-3d',
  'narrative.V2-3d.repoint-staging',
  format(
    'update public.research_customer_account_invitations set staging_id = %L where invitation_id = %L::uuid',
    format('imp-narrative-pass-%s-p0024', :'rehearsal_pass'),
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3d')
  ),
  'P0001',
  format(
    'invitation %s identity and birth timestamp are immutable',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-3d')
  )
);

select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-4',
  'narrative.V2-4.delete-approved-staging',
  format(
    'delete from public.research_client_import_staging where staging_id = %L',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-4')
  ),
  '23503',
  'update or delete on table "research_client_import_staging" violates foreign key constraint "research_customer_account_invitations_staging_id_fkey" on table "research_customer_account_invitations"'
);

set role service_role;
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-5'),
  'queued'
);
reset role;
update public.research_prelaunch_role_assignments
set revoked_at = statement_timestamp(),
    revoked_by = 'disposable-harness',
    revocation_reason = 'synthetic v2-5 rehearsal'
where auth_user_id = '11111111-1111-4111-8111-111111111111'
  and role = 'super_admin'
  and revoked_at is null;
set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-5',
  'narrative.V2-5.revoked-approver-before-sent',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-5'),
    'sent'
  ),
  'P0001',
  format(
    'the approving principal for invitation %s is no longer an active super_admin; revoke and reconcile before any future invitation',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-5')
  )
);
reset role;
update public.research_prelaunch_role_assignments
set revoked_at = null,
    revoked_by = null,
    revocation_reason = null
where auth_user_id = '11111111-1111-4111-8111-111111111111'
  and role = 'super_admin';

set role service_role;
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-6a'),
  'revoked'
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-6a',
  'narrative.V2-6a.queue-after-revoked',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-6a'),
    'queued'
  ),
  'P0001',
  'invitation transition revoked -> queued is not in the state machine'
);
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-6b',
  'narrative.V2-6b.sent-without-queued',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-6b'),
    'sent'
  ),
  'P0001',
  'invitation transition founder_approved -> sent is not in the state machine'
);

-- V2-7 was once described as a positive path. It is not counted in the v2
-- denominator and is no longer legal: revoked is terminal and one staged
-- identity owns one immutable invitation history.
select public.research_client_invitation_transition(
  (select invitation_id from rehearsal.narrative_fixtures
    where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-7'),
  'revoked'
);
reset role;
update public.research_client_import_staging
set contact_email = format('v2-7-edited-pass-%s@example.invalid', :'rehearsal_pass')
where staging_id = (
  select staging_id from rehearsal.narrative_fixtures
  where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-7'
);
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-7',
  'narrative.V2-7.reapprove-revoked-refused',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    (select invitation_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-7'),
    'wave-v2-7'
  ),
  'P0001',
  'invitation transition revoked -> founder_approved is not in the state machine'
);
set role service_role;
select rehearsal.expect_refusal_record(
  :'rehearsal_pass'::integer,
  'v2',
  'V2-7',
  'narrative.V2-7.second-history-refused',
  format(
    'select public.research_client_invitation_draft(%L)',
    (select staging_id from rehearsal.narrative_fixtures
      where pass_number = :'rehearsal_pass'::integer and fixture_key = 'V2-7')
  ),
  '23505',
  'duplicate key value violates unique constraint "research_customer_account_invitations_one_history"'
);

reset role;
reset request.jwt.claim.sub;
select rehearsal.assert_attack_coverage(:'rehearsal_pass'::integer);
select rehearsal.record_phase(
  :'rehearsal_pass'::integer,
  'narrative-attacks',
  jsonb_build_object(
    'countedHistoricalV1', 18,
    'countedHistoricalV2', 12,
    'additionalHistoricalPositives', 1,
    'executableResults', (
      select count(*) from rehearsal.attack_results
      where pass_number = :'rehearsal_pass'::integer
    ),
    'refusedExecutions', (
      select count(*) from rehearsal.attack_results
      where pass_number = :'rehearsal_pass'::integer
        and disposition = 'refused'
    ),
    'assertedExecutions', (
      select count(*) from rehearsal.attack_results
      where pass_number = :'rehearsal_pass'::integer
        and disposition = 'asserted'
    )
  )
);

select format(
  'PASS narrative attacks pass %s: exact 18 + 12 historical denominator, V2-7 additional, all mapped executions complete.',
  :'rehearsal_pass'
) as rehearsal_result;
