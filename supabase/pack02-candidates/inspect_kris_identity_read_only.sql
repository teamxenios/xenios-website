-- PACK 02 READ-ONLY OPERATOR AUDIT. DO NOT USE AS A MIGRATION OR SEED.
-- Run only through an authorized Supabase administrative session. It creates
-- no Auth user, invitation, alias, membership, binding, credential, or order.

begin;
set transaction read only;

-- Auth is the credential authority. Name evidence in metadata is only a
-- candidate locator; a result still requires exact UID/email reconciliation.
select
  'auth.users'::text as source,
  id as auth_user_id,
  lower(email) as normalized_email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data
from auth.users
where lower(coalesce(raw_user_meta_data::text, '')) like '%kris%'
order by created_at;

-- Canonical member identity.
select
  'research_members'::text as source,
  m.auth_user_id,
  lower(m.email) as normalized_email,
  m.first_name,
  m.last_name,
  m.status,
  m.application_id
from public.research_members m
where lower(trim(m.first_name)) = 'kris'
order by m.created_at;

-- Prior invite/application evidence before member activation.
select
  'research_applications'::text as source,
  a.id as application_id,
  lower(a.email) as normalized_email,
  a.first_name,
  a.last_name,
  a.status,
  a.organization,
  a.created_at
from public.research_applications a
where lower(trim(a.first_name)) = 'kris'
order by a.created_at;

-- Existing Early Access identity. The canonical record is searched for name
-- evidence without assuming any email alias or creating a parallel mapping.
select
  'research_early_access_customers'::text as source,
  c.id as customer_ref,
  c.normalized_email,
  c.status,
  c.record,
  c.created_at
from public.research_early_access_customers c
where lower(c.record::text) like '%kris%'
order by c.created_at;

rollback;

-- After the reviewed Pack 02 schema exists, reconcile any discovered exact
-- Auth UID against research_organization_users, organization invitations,
-- and research_account_binding_events. Do not infer a binding from name only.
