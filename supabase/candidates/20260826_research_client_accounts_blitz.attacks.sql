\set ON_ERROR_STOP on
\pset pager off

select set_config('rehearsal.pass_number', :'rehearsal_pass', false);

-- Synthetic setup through the exact service_role surface.
set role service_role;

insert into public.research_client_import_batches (
  batch_id, source_label, source_partner, relationship_owner, dry_run,
  total_rows, unique_people, report, created_by
) values (
  'imp-rehearsal-2026', 'Synthetic rehearsal', 'synthetic_partner',
  'Disposable harness', true, 5, 5,
  '{"synthetic":true,"people":5}'::jsonb, 'disposable-harness'
);

insert into public.research_client_import_staging (
  staging_id, batch_id, source_name, normalized_name_key, interest_keys,
  raw_interests, unmapped_interests, source_partner, relationship_owner,
  consent_status, contact_email, us_state
) values
  (
    'imp-rehearsal-2026-p0001', 'imp-rehearsal-2026', 'Synthetic Ready',
    'synthetic-ready', array['test-product'], array['Test Product'], '{}',
    'synthetic_partner', 'Disposable harness', 'granted',
    'ready@example.invalid', 'IL'
  ),
  (
    'imp-rehearsal-2026-p0002', 'imp-rehearsal-2026', 'Synthetic No Contact',
    'synthetic-no-contact', '{}', '{}', '{}', 'synthetic_partner',
    'Disposable harness', 'granted', null, 'IL'
  ),
  (
    'imp-rehearsal-2026-p0003', 'imp-rehearsal-2026', 'Synthetic No Consent',
    'synthetic-no-consent', '{}', '{}', '{}', 'synthetic_partner',
    'Disposable harness', 'pending', 'pending@example.invalid', 'IL'
  ),
  (
    'imp-rehearsal-2026-p0004', 'imp-rehearsal-2026', 'Synthetic Authority',
    'synthetic-authority', '{}', '{}', '{}', 'synthetic_partner',
    'Disposable harness', 'granted', 'authority@example.invalid', 'IL'
  ),
  (
    'imp-rehearsal-2026-p0005', 'imp-rehearsal-2026', 'Synthetic Spare',
    'synthetic-spare', '{}', '{}', '{}', 'synthetic_partner',
    'Disposable harness', 'granted', 'spare@example.invalid', 'IL'
  );

select public.research_client_invitation_draft('imp-rehearsal-2026-p0001') as invitation_p1 \gset
select public.research_client_invitation_draft('imp-rehearsal-2026-p0002') as invitation_p2 \gset
select public.research_client_invitation_draft('imp-rehearsal-2026-p0003') as invitation_p3 \gset
select public.research_client_invitation_draft('imp-rehearsal-2026-p0004') as invitation_p4 \gset

-- A01-A10: effective privilege and sanctioned-door boundaries.
set role anon;
select rehearsal.expect_failure(
  'A01 anon cannot read staging',
  'select * from public.research_client_import_staging',
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A02 anon cannot call draft door',
  $$select public.research_client_invitation_draft('imp-rehearsal-2026-p0005')$$,
  '%permission denied%'
);

set role authenticated;
select rehearsal.expect_failure(
  'A03 authenticated cannot read invitation projection',
  'select * from public.research_customer_account_invitations',
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A04 authenticated cannot call system transition door',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    :'invitation_p1', 'queued'
  ),
  '%permission denied%'
);

set role service_role;
select rehearsal.expect_failure(
  'A05 service cannot insert invitation directly',
  $$insert into public.research_customer_account_invitations(staging_id) values ('imp-rehearsal-2026-p0005')$$,
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A06 service cannot update invitation directly',
  format(
    'update public.research_customer_account_invitations set state = %L where invitation_id = %L::uuid',
    'queued', :'invitation_p1'
  ),
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A07 service cannot insert invitation event directly',
  format(
    'insert into public.research_customer_account_invitation_events(invitation_id, transition_sequence, next_state, actor_database_role) values (%L::uuid, 99, %L, %L)',
    :'invitation_p1', 'draft', 'forged'
  ),
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A08 service cannot update invitation event directly',
  $$update public.research_customer_account_invitation_events set actor_database_role = 'forged'$$,
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A09 service cannot use invitation-event identity sequence',
  $$select nextval('public.research_customer_account_invitation_events_event_id_seq')$$,
  '%permission denied%'
);
select rehearsal.expect_failure(
  'A10 service cannot call authenticated founder approval door',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p1', 'wave-spoof'
  ),
  '%permission denied%'
);

-- A11-A15: approval authority is auth.uid(), never a caller-supplied id.
set role authenticated;
reset request.jwt.claim.sub;
select rehearsal.expect_failure(
  'A11 missing auth uid cannot approve',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p4', 'wave-auth'
  ),
  '%requires an authenticated auth.uid()%'
);

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select rehearsal.expect_failure(
  'A12 non-admin authenticated user cannot approve',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p4', 'wave-auth'
  ),
  '%not a currently-active super_admin%'
);

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select rehearsal.expect_failure(
  'A13 revoked administrator cannot approve',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p4', 'wave-auth'
  ),
  '%not a currently-active super_admin%'
);

set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select rehearsal.expect_failure(
  'A14 expired administrator cannot approve',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p4', 'wave-auth'
  ),
  '%not a currently-active super_admin%'
);

set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select rehearsal.expect_failure(
  'A15 legacy caller-supplied approver signature is absent',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L, %L::uuid, %L)',
    :'invitation_p4', 'founder_approved',
    '11111111-1111-4111-8111-111111111111', 'wave-spoof'
  ),
  '%does not exist%'
);

-- A16-A23: drafts/lifecycle cannot carry contradictory truth.
reset role;
reset request.jwt.claim.sub;
select rehearsal.expect_failure(
  'A16 draft insert cannot carry approved wave',
  $$insert into public.research_customer_account_invitations(staging_id, approved_wave) values ('imp-rehearsal-2026-p0005', 'wave-partial')$$,
  '%carries no approval bundle%'
);
select rehearsal.expect_failure(
  'A17 draft insert cannot carry partial approval fields',
  $$insert into public.research_customer_account_invitations(staging_id, approved_by) values ('imp-rehearsal-2026-p0005', '11111111-1111-4111-8111-111111111111')$$,
  '%carries no approval bundle%'
);
select rehearsal.expect_failure(
  'A18 invitation cannot be born founder approved',
  $$insert into public.research_customer_account_invitations(staging_id, state) values ('imp-rehearsal-2026-p0005', 'founder_approved')$$,
  '%born draft%'
);
select rehearsal.expect_failure(
  'A19 draft cannot be decorated by same-state update',
  format(
    'update public.research_customer_account_invitations set approved_wave = %L where invitation_id = %L::uuid',
    'wave-partial', :'invitation_p1'
  ),
  '%same-state mutation is prohibited%'
);

set role service_role;
select rehearsal.expect_failure(
  'A20 draft cannot skip approval and queue',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    :'invitation_p4', 'queued'
  ),
  '%not in the state machine%'
);
select rehearsal.expect_failure(
  'A21 accepted is not an available system transition',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    :'invitation_p4', 'accepted'
  ),
  '%does not accept state accepted%'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select rehearsal.expect_failure(
  'A22 approval refuses missing contact authority',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p2', 'wave-ready'
  ),
  '%has no contact information%'
);
select rehearsal.expect_failure(
  'A23 approval refuses pending consent',
  format(
    'select public.research_client_invitation_founder_approve(%L::uuid, %L)',
    :'invitation_p3', 'wave-ready'
  ),
  '%only granted consent%'
);

-- A24-A26: cross-batch and account-binding uniqueness is fail closed.
reset role;
reset request.jwt.claim.sub;
insert into public.research_client_import_batches (
  batch_id, source_label, source_partner, relationship_owner, dry_run,
  total_rows, unique_people, report, created_by
) values (
  'imp-rehearsal-2027', 'Synthetic second batch', 'synthetic_partner',
  'Disposable harness', true, 1, 1, '{"synthetic":true}'::jsonb,
  'disposable-harness'
);
select rehearsal.expect_failure(
  'A24 same partner identity cannot repeat across batches',
  $$insert into public.research_client_import_staging(
      staging_id,batch_id,source_name,normalized_name_key,source_partner,
      relationship_owner,consent_status,contact_email
    ) values (
      'imp-rehearsal-2027-p0001','imp-rehearsal-2027','Synthetic Ready',
      'synthetic-ready','synthetic_partner','Disposable harness','granted',
      'duplicate@example.invalid'
    )$$,
  '%duplicate key%'
);

set role service_role;
select rehearsal.expect_failure(
  'A25 one identity cannot receive a second invitation history',
  $$select public.research_client_invitation_draft('imp-rehearsal-2026-p0001')$$,
  '%duplicate key%'
);
select rehearsal.expect_failure(
  'A26 interests reject an arbitrary non-member uuid',
  $$insert into public.research_customer_product_interests(member_id, interest_key, display_label) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test-product', 'Test Product')$$,
  '%foreign key%'
);
insert into public.research_customer_product_interests (
  member_id, interest_key, display_label
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test-product', 'Test Product'
);
select rehearsal.assert_true(
  'P00 valid product interest is anchored to a real member',
  exists (
    select 1 from public.research_customer_product_interests
     where member_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  )
);

-- Positive authoritative path: authenticated active admin approval, then
-- service-only queue/sent/expiry. No acceptance claim exists in this schema.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.research_client_invitation_founder_approve(
  :'invitation_p1'::uuid,
  'wave-authoritative'
);

reset role;
select rehearsal.assert_true(
  'P01 approval identity equals authenticated auth.uid',
  (select approved_by = '11111111-1111-4111-8111-111111111111'
     from public.research_customer_account_invitations
    where invitation_id = :'invitation_p1'::uuid)
);
select rehearsal.assert_true(
  'P02 canonical evidence hash includes exact approved wave',
  (select
      i.approved_snapshot_hash = public.research_client_invitation_evidence_hash(s, i.approved_wave)
      and i.approved_snapshot_hash <> public.research_client_invitation_evidence_hash(s, 'different-wave')
     from public.research_customer_account_invitations i
     join public.research_client_import_staging s on s.staging_id = i.staging_id
    where i.invitation_id = :'invitation_p1'::uuid)
);

-- A28-A34: approved evidence and both histories are immutable.
select rehearsal.expect_failure(
  'A28 approved wave is immutable',
  format(
    'update public.research_customer_account_invitations set approved_wave = %L where invitation_id = %L::uuid',
    'wave-swapped', :'invitation_p1'
  ),
  '%approval bundle is immutable%'
);
select rehearsal.expect_failure(
  'A29 approved hash is immutable',
  format(
    'update public.research_customer_account_invitations set approved_snapshot_hash = repeat(%L, 64) where invitation_id = %L::uuid',
    '0', :'invitation_p1'
  ),
  '%approval bundle is immutable%'
);
select rehearsal.expect_failure(
  'A30 approved staging evidence is frozen',
  $$update public.research_client_import_staging set contact_email = 'mutated@example.invalid' where staging_id = 'imp-rehearsal-2026-p0001'$$,
  '%approved evidence is immutable%'
);
select rehearsal.expect_failure(
  'A31 owner cannot delete invitation history',
  format(
    'delete from public.research_customer_account_invitations where invitation_id = %L::uuid',
    :'invitation_p1'
  ),
  '%never delete%'
);
select rehearsal.expect_failure(
  'A32 owner cannot update invitation event history',
  format(
    'update public.research_customer_account_invitation_events set actor_database_role = %L where invitation_id = %L::uuid',
    'forged', :'invitation_p1'
  ),
  '%append only%'
);
select rehearsal.expect_failure(
  'A33 owner cannot delete invitation event history',
  format(
    'delete from public.research_customer_account_invitation_events where invitation_id = %L::uuid',
    :'invitation_p1'
  ),
  '%append only%'
);

set role service_role;
select public.research_client_invitation_transition(:'invitation_p1'::uuid, 'queued');
select public.research_client_invitation_transition(:'invitation_p1'::uuid, 'sent');
select rehearsal.expect_failure(
  'A34 even a sent invitation cannot claim accepted without account binding',
  format(
    'select public.research_client_invitation_transition(%L::uuid, %L)',
    :'invitation_p1', 'accepted'
  ),
  '%does not accept state accepted%'
);
select public.research_client_invitation_transition(:'invitation_p1'::uuid, 'expired');

reset role;
select rehearsal.assert_true(
  'P03 invitation event ledger is gap-free and complete',
  (select array_agg(transition_sequence order by transition_sequence) = array[1,2,3,4,5]
          and array_agg(next_state order by transition_sequence)
                = array['draft','founder_approved','queued','sent','expired']
     from public.research_customer_account_invitation_events
    where invitation_id = :'invitation_p1'::uuid)
);
select rehearsal.assert_true(
  'P04 staging exposes no manufactured account_status column',
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'research_client_import_staging'
       and column_name = 'account_status'
  )
);

-- A35-A38: activation audit and sequence remain immutable/closed.
set role service_role;
insert into public.research_product_activation_overlay_audit (
  group_id, event, detail, recorded_by
) values (
  'GRP-0001', 'hold_recorded', '{"synthetic":true}'::jsonb,
  'disposable-harness'
);
select rehearsal.expect_failure(
  'A35 service cannot use activation-audit identity sequence',
  $$select nextval('public.research_product_activation_overlay_audit_audit_id_seq')$$,
  '%permission denied%'
);

reset role;
select rehearsal.expect_failure(
  'A36 owner cannot update activation audit history',
  $$update public.research_product_activation_overlay_audit set recorded_by = 'forged' where group_id = 'GRP-0001'$$,
  '%append only%'
);
select rehearsal.expect_failure(
  'A37 owner cannot delete activation audit history',
  $$delete from public.research_product_activation_overlay_audit where group_id = 'GRP-0001'$$,
  '%append only%'
);
select rehearsal.expect_failure(
  'A38 owner cannot write accepted directly',
  format(
    'update public.research_customer_account_invitations set state = %L where invitation_id = %L::uuid',
    'accepted', :'invitation_p1'
  ),
  '%not in the state machine%'
);

-- Exact effective ACL and forced-RLS checks (the default PUBLIC EXECUTE ACL is
-- expanded through acldefault so a null proacl cannot hide leakage).
select rehearsal.assert_true(
  'P05 all six candidate tables use forced RLS',
  (select count(*) = 6
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'research_client_import_batches',
        'research_client_import_staging',
        'research_customer_product_interests',
        'research_customer_account_invitations',
        'research_customer_account_invitation_events',
        'research_product_activation_overlay_audit'
      )
      and c.relrowsecurity
      and c.relforcerowsecurity)
);
select rehearsal.assert_true(
  'P06 no candidate routine retains default PUBLIC execute',
  not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     where n.nspname = 'public'
       and p.proname like 'research_client_%'
       and x.grantee = 0
       and x.privilege_type = 'EXECUTE'
  )
);
select rehearsal.assert_true(
  'P07 authenticated can execute only founder approval sanctioned door',
  has_function_privilege(
    'authenticated',
    'public.research_client_invitation_founder_approve(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.research_client_invitation_draft(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.research_client_invitation_transition(uuid,text)',
    'EXECUTE'
  )
);
select rehearsal.assert_true(
  'P08 service can execute only draft/system-transition sanctioned doors',
  has_function_privilege(
    'service_role', 'public.research_client_invitation_draft(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.research_client_invitation_transition(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.research_client_invitation_founder_approve(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.research_client_invitation_evidence_hash(public.research_client_import_staging,text)',
    'EXECUTE'
  )
);
select rehearsal.assert_true(
  'P09 service invitation tables are select-only',
  has_table_privilege(
    'service_role', 'public.research_customer_account_invitations', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'public.research_customer_account_invitations', 'INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role', 'public.research_customer_account_invitation_events', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'public.research_customer_account_invitation_events', 'INSERT,UPDATE,DELETE'
  )
);
select rehearsal.assert_true(
  'P10 hostile default table ACLs collapse to the exact service matrix',
  (select array_agg(
      grantee || ':' || table_name || ':' || privilege_type
      order by table_name, privilege_type
    ) = array[
      'service_role:research_client_import_batches:INSERT',
      'service_role:research_client_import_batches:SELECT',
      'service_role:research_client_import_staging:INSERT',
      'service_role:research_client_import_staging:SELECT',
      'service_role:research_client_import_staging:UPDATE',
      'service_role:research_customer_account_invitation_events:SELECT',
      'service_role:research_customer_account_invitations:SELECT',
      'service_role:research_customer_product_interests:DELETE',
      'service_role:research_customer_product_interests:INSERT',
      'service_role:research_customer_product_interests:SELECT',
      'service_role:research_customer_product_interests:UPDATE',
      'service_role:research_product_activation_overlay_audit:INSERT',
      'service_role:research_product_activation_overlay_audit:SELECT'
    ]::text[]
   from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in (
      'research_client_import_batches',
      'research_client_import_staging',
      'research_customer_product_interests',
      'research_customer_account_invitations',
      'research_customer_account_invitation_events',
      'research_product_activation_overlay_audit'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role'))
);

reset role;
reset request.jwt.claim.sub;
select rehearsal.record_phase(
  :'rehearsal_pass'::integer,
  'broad-attacks',
  jsonb_build_object('refusedAttacks', 37, 'positiveInvariants', 11)
);

select 'PASS attack battery: 37 attacks refused; 11 positive invariants proved.' as rehearsal_result;
