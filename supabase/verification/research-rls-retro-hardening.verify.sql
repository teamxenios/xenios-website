\set ON_ERROR_STOP on

-- Disposable-database verifier for
-- migrations/20260729100000_research_rls_retro_hardening.sql.
--
-- Run after research-rls-retro-hardening-disposable-bootstrap.sql on a
-- disposable local PostgreSQL. The verifier applies the candidate itself
-- (twice, proving idempotency) and then proves, in order: the exposed
-- pre-candidate posture, forced RLS on every bootstrapped in-scope table,
-- zero browser-role table grants outside the two documented Care read
-- surfaces, preserved server-role authority, the absent-table no-op,
-- behavioral denial for the browser roles, effective default-privileges
-- revocation for newly created objects, the sole-policy invariant, and zero
-- data changes. Any failure raises an exception and, with ON_ERROR_STOP,
-- aborts the run; reaching the final PASS line means every check passed.

-- [1] Pre-candidate shape: every bootstrapped in-scope table exists with RLS
-- enabled but NOT forced, and the browser roles hold the simulated Supabase
-- default grants. This is the exposed old-generation posture.
do $$
declare
  bootstrapped constant text[] := array[
    'waitlist_signups', 'loi_submissions', 'calendly_bookings',
    'admin_notes', 'concept_gallery_items',
    'research_applications', 'research_application_events', 'research_members',
    'referral_programs', 'referral_identities', 'referral_attributions',
    'referral_rewards', 'member_credit_ledger',
    'research_agreement_acceptances', 'research_member_profile_sections',
    'research_assessment_responses', 'research_blueprints',
    'research_xenios30_plans', 'research_xenios90_plans',
    'research_plan_change_requests', 'research_plan_documents',
    'research_tracker_observations', 'research_private_media',
    'research_media_access_log', 'research_media_retention_elections',
    'research_member_questions', 'research_telegram_links',
    'research_sla_events',
    'research_fm_payment_methods', 'research_fm_payment_method_versions',
    'research_fm_bridge_settings', 'research_fm_bridge_audit_events',
    'research_fm_obligations', 'research_fm_obligation_events',
    'research_fm_membership_periods', 'research_fm_ledger',
    'research_fm_receipts', 'research_fm_identity_cases',
    'research_fm_identity_reviews', 'research_fm_identity_audit',
    'research_fm_document_versions', 'research_fm_document_signatures',
    'research_fm_bridge_checklist', 'research_fm_esign_templates',
    'research_fm_esign_requests', 'research_fm_esign_archive',
    'research_orders', 'research_order_lines', 'research_order_state_events',
    'research_carts', 'research_cart_lines', 'research_provider_webhook_events',
    'research_claims', 'research_refund_keys'
  ];
  t text;
  n integer;
begin
  foreach t in array bootstrapped loop
    if to_regclass('public.' || t) is null then
      raise exception 'bootstrap shape wrong: public.% is missing', t;
    end if;
    select count(*) into n
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t
       and c.relrowsecurity and not c.relforcerowsecurity;
    if n <> 1 then
      raise exception 'pre-candidate posture wrong for public.%: expected RLS enabled and not forced', t;
    end if;
    select count(*) into n
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
     where ns.nspname = 'public' and c.relname = t
       and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'));
    if n = 0 then
      raise exception 'pre-candidate posture wrong for public.%: expected simulated browser default grants', t;
    end if;
  end loop;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 2 then
    raise exception 'pre-candidate policy count wrong: expected the two Care read policies, found %', n;
  end if;
end;
$$;
\echo PASS [1] bootstrap reproduces the exposed old-generation posture

-- [2] Apply the candidate twice. The second run proves idempotency; both
-- runs skipping the never-bootstrapped listed tables proves the guard.
\ir ../migrations/20260729100000_research_rls_retro_hardening.sql
\ir ../migrations/20260729100000_research_rls_retro_hardening.sql
\echo PASS [2] candidate applied twice without error

-- [3] Forced RLS: every bootstrapped in-scope table is now enabled AND
-- forced, and the three Care tables remain forced as their own script left
-- them.
do $$
declare
  hardened constant text[] := array[
    'waitlist_signups', 'loi_submissions', 'calendly_bookings',
    'admin_notes', 'concept_gallery_items',
    'research_applications', 'research_application_events', 'research_members',
    'referral_programs', 'referral_identities', 'referral_attributions',
    'referral_rewards', 'member_credit_ledger',
    'research_agreement_acceptances', 'research_member_profile_sections',
    'research_assessment_responses', 'research_blueprints',
    'research_xenios30_plans', 'research_xenios90_plans',
    'research_plan_change_requests', 'research_plan_documents',
    'research_tracker_observations', 'research_private_media',
    'research_media_access_log', 'research_media_retention_elections',
    'research_member_questions', 'research_telegram_links',
    'research_sla_events',
    'research_fm_payment_methods', 'research_fm_payment_method_versions',
    'research_fm_bridge_settings', 'research_fm_bridge_audit_events',
    'research_fm_obligations', 'research_fm_obligation_events',
    'research_fm_membership_periods', 'research_fm_ledger',
    'research_fm_receipts', 'research_fm_identity_cases',
    'research_fm_identity_reviews', 'research_fm_identity_audit',
    'research_fm_document_versions', 'research_fm_document_signatures',
    'research_fm_bridge_checklist', 'research_fm_esign_templates',
    'research_fm_esign_requests', 'research_fm_esign_archive',
    'research_orders', 'research_order_lines', 'research_order_state_events',
    'research_carts', 'research_cart_lines', 'research_provider_webhook_events',
    'research_claims', 'research_refund_keys',
    'care_capabilities', 'care_role_assignments', 'care_access_audit'
  ];
  t text;
  n integer;
begin
  foreach t in array hardened loop
    select count(*) into n
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = t
       and c.relrowsecurity and c.relforcerowsecurity;
    if n <> 1 then
      raise exception 'public.% is not enabled+forced after the candidate', t;
    end if;
  end loop;
end;
$$;
\echo PASS [3] RLS is enabled and forced on every bootstrapped in-scope table

-- [4] Zero browser-role table grants in schema public outside the two
-- documented Care read surfaces, which must both survive intact.
do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and (a.grantee = 0
          or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
     and not (a.privilege_type = 'SELECT'
              and a.grantee = (select oid from pg_roles where rolname = 'authenticated')
              and c.relname in ('care_role_assignments', 'care_access_audit'));
  if n <> 0 then
    raise exception '% browser-role table grants remain outside the Care read surfaces', n;
  end if;
  select count(*) into n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and c.relname in ('care_role_assignments', 'care_access_audit')
     and a.privilege_type = 'SELECT'
     and a.grantee = (select oid from pg_roles where rolname = 'authenticated');
  if n <> 2 then
    raise exception 'Care read surfaces damaged: expected 2 authenticated SELECT grants, found %', n;
  end if;
end;
$$;
\echo PASS [4] zero browser table grants outside the two Care read surfaces

-- [5] Server-role authority preserved: the candidate must not touch the
-- server role. Every bootstrapped in-scope table keeps all seven table
-- privileges the simulated defaults granted it.
do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and c.relname in (
       'waitlist_signups', 'loi_submissions', 'calendly_bookings',
       'admin_notes', 'concept_gallery_items',
       'research_applications', 'research_application_events', 'research_members',
       'referral_programs', 'referral_identities', 'referral_attributions',
       'referral_rewards', 'member_credit_ledger',
       'research_agreement_acceptances', 'research_member_profile_sections',
       'research_assessment_responses', 'research_blueprints',
       'research_xenios30_plans', 'research_xenios90_plans',
       'research_plan_change_requests', 'research_plan_documents',
       'research_tracker_observations', 'research_private_media',
       'research_media_access_log', 'research_media_retention_elections',
       'research_member_questions', 'research_telegram_links',
       'research_sla_events',
       'research_fm_payment_methods', 'research_fm_payment_method_versions',
       'research_fm_bridge_settings', 'research_fm_bridge_audit_events',
       'research_fm_obligations', 'research_fm_obligation_events',
       'research_fm_membership_periods', 'research_fm_ledger',
       'research_fm_receipts', 'research_fm_identity_cases',
       'research_fm_identity_reviews', 'research_fm_identity_audit',
       'research_fm_document_versions', 'research_fm_document_signatures',
       'research_fm_bridge_checklist', 'research_fm_esign_templates',
       'research_fm_esign_requests', 'research_fm_esign_archive',
       'research_orders', 'research_order_lines', 'research_order_state_events',
       'research_carts', 'research_cart_lines', 'research_provider_webhook_events',
       'research_claims', 'research_refund_keys'
     )
     and a.grantee = (select oid from pg_roles where rolname = 'service_role');
  if n <> 54 * 7 then
    raise exception 'server-role grants changed: expected % privileges across 54 tables, found %', 54 * 7, n;
  end if;
end;
$$;
\echo PASS [5] server-role authority is untouched (54 tables x 7 privileges)

-- [6] Absent-table no-op: these tables are enumerated by the candidate but
-- were deliberately never bootstrapped. Reaching this point after two full
-- applies proves the to_regclass guard skipped them cleanly, and they must
-- still not exist.
do $$
declare
  absent constant text[] := array[
    'research_fm_agreement_email_candidates',
    'research_product_subscriptions', 'research_fulfillment_orders',
    'research_partners', 'research_commission_ledger',
    'research_order_shipments', 'research_notification_outbox',
    'research_consent_events', 'referral_events',
    'research_idempotency_keys', 'research_lot_excursion_events',
    'research_lot_shipments'
  ];
  t text;
begin
  foreach t in array absent loop
    if to_regclass('public.' || t) is not null then
      raise exception 'absent-table check wrong: public.% unexpectedly exists', t;
    end if;
  end loop;
end;
$$;
\echo PASS [6] every never-bootstrapped listed table no-opped cleanly

-- [7] Behavioral denial: the browser roles can no longer read a hardened
-- table (privilege revoked, not merely row-filtered), while the documented
-- Care read surface still answers an authenticated SELECT.
do $$
begin
  begin
    set role anon;
    perform count(*) from public.waitlist_signups;
    reset role;
    raise exception 'anon can still read public.waitlist_signups';
  exception
    when insufficient_privilege then reset role;
  end;
  begin
    set role authenticated;
    perform count(*) from public.research_members;
    reset role;
    raise exception 'authenticated can still read public.research_members';
  exception
    when insufficient_privilege then reset role;
  end;
  set role authenticated;
  perform count(*) from public.care_role_assignments;
  reset role;
end;
$$;
\echo PASS [7] browser roles denied on hardened tables; Care read surface intact

-- [8] Default-privileges revocation is effective going forward: a table, a
-- sequence, and a function created AFTER the candidate receive no
-- anon/authenticated grants, while the server role still receives its
-- default table grants. (PostgreSQL's built-in PUBLIC execute default on
-- functions is out of scope here and documented in the rollback notes.)
create table public.rls_hardening_probe_after (id integer primary key);
create sequence public.rls_hardening_probe_seq;
create function public.rls_hardening_probe_fn() returns integer
language sql
as $$ select 1 $$;

do $$
declare
  n integer;
begin
  select count(*) into n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and c.relname in ('rls_hardening_probe_after', 'rls_hardening_probe_seq')
     and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'));
  if n <> 0 then
    raise exception 'new objects still inherit % browser default grants', n;
  end if;
  select count(*) into n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and p.proname = 'rls_hardening_probe_fn'
     and a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'));
  if n <> 0 then
    raise exception 'new functions still inherit % explicit browser default grants', n;
  end if;
  select count(*) into n
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) a
   where ns.nspname = 'public'
     and c.relname = 'rls_hardening_probe_after'
     and a.grantee = (select oid from pg_roles where rolname = 'service_role');
  if n <> 7 then
    raise exception 'server-role default grants were damaged: expected 7 on the probe table, found %', n;
  end if;
end;
$$;
\echo PASS [8] future objects no longer inherit browser grants; server defaults intact

-- [9] Sole-policy invariant: still exactly the two Care read policies, and
-- zero policies on any hardened table.
do $$
declare
  n integer;
begin
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 2 then
    raise exception 'policy count changed: expected 2, found %', n;
  end if;
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and policyname in ('care_security_roles_read', 'care_security_access_audit_read')
     and tablename in ('care_role_assignments', 'care_access_audit');
  if n <> 2 then
    raise exception 'the two Care read policies are not the ones present';
  end if;
end;
$$;
\echo PASS [9] sole-policy invariant holds (two Care read policies, nothing else)

-- [10] Zero data changes: both seeded rows are intact and alone.
do $$
declare
  n integer;
begin
  select count(*) into n from public.waitlist_signups;
  if n <> 1 then
    raise exception 'waitlist_signups row count changed: expected 1, found %', n;
  end if;
  if not exists (
    select 1 from public.waitlist_signups
     where id = '90000000-0000-4000-8000-000000000001'
       and name = 'RLS Hardening Probe'
       and email = 'rls-probe@xenios.test'
       and consent = true
       and status = 'New'
  ) then
    raise exception 'the seeded waitlist row was altered';
  end if;
  select count(*) into n from public.research_applications;
  if n <> 1 then
    raise exception 'research_applications row count changed: expected 1, found %', n;
  end if;
  if not exists (
    select 1 from public.research_applications
     where id = '90000000-0000-4000-8000-000000000002'
       and email = 'rls-probe-applicant@xenios.test'
       and first_name = 'Probe'
       and last_name = 'Applicant'
       and country = 'US'
       and status = 'submitted'
  ) then
    raise exception 'the seeded application row was altered';
  end if;
end;
$$;
\echo PASS [10] zero data changes (both seeded rows intact)

\echo PASS research-rls-retro-hardening: all 10 sections passed
