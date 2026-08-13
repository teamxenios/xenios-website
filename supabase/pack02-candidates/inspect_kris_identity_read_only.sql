-- PACK 02 READ-ONLY OPERATOR AUDIT. DO NOT USE AS A MIGRATION OR SEED.
--
-- Purpose: locate candidate evidence for Kris without guessing an email or UID.
-- Run only through an authorized Supabase administrative SQL session. This
-- script creates no Auth user, invitation, alias, membership, binding,
-- credential, customer, application, order, function, table, policy, or grant.

begin isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

-- Result 1: candidate evidence. Names are locators, not identity proof. The
-- operator must reconcile one exact Auth UID and normalized email before using
-- either activation path. research_members has no last_name column; last-name
-- evidence comes from its canonical research_applications parent.
with candidate_evidence as (
  select
    'supabase_auth_metadata'::text as source,
    u.id as auth_user_id,
    lower(u.email) as normalized_email,
    null::uuid as member_id,
    null::uuid as application_id,
    null::text as early_access_customer_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'firstName'), ''),
      nullif(trim(split_part(coalesce(u.raw_user_meta_data ->> 'full_name', ''), ' ', 1)), '')
    ) as first_name,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'lastName'), '')
    ) as last_name,
    case when u.email_confirmed_at is null then 'email_unconfirmed' else 'email_confirmed' end as state,
    u.created_at
  from auth.users u
  where
    lower(trim(coalesce(u.raw_user_meta_data ->> 'first_name', ''))) = 'kris'
    or lower(trim(coalesce(u.raw_user_meta_data ->> 'firstName', ''))) = 'kris'
    or lower(trim(split_part(coalesce(u.raw_user_meta_data ->> 'full_name', ''), ' ', 1))) = 'kris'

  union all

  select
    'research_member'::text,
    m.auth_user_id,
    lower(m.email),
    m.id,
    m.application_id,
    null::text,
    m.first_name,
    a.last_name,
    m.status,
    m.created_at
  from public.research_members m
  left join public.research_applications a on a.id = m.application_id
  where lower(trim(coalesce(m.first_name, a.first_name, ''))) = 'kris'

  union all

  select
    'research_application'::text,
    m.auth_user_id,
    lower(a.email),
    m.id,
    a.id,
    null::text,
    a.first_name,
    a.last_name,
    a.status,
    a.created_at
  from public.research_applications a
  left join public.research_members m on m.application_id = a.id
  where lower(trim(a.first_name)) = 'kris'

  union all

  select
    'early_access_identity'::text,
    null::uuid,
    c.normalized_email,
    null::uuid,
    null::uuid,
    c.id,
    coalesce(c.record ->> 'firstName', c.record ->> 'first_name'),
    coalesce(c.record ->> 'lastName', c.record ->> 'last_name'),
    c.status,
    c.created_at
  from public.research_early_access_customers c
  where
    lower(trim(coalesce(c.record ->> 'firstName', c.record ->> 'first_name', ''))) = 'kris'
    or lower(c.record::text) like '%"kris"%'
)
select
  source,
  auth_user_id,
  normalized_email,
  member_id,
  application_id,
  early_access_customer_id,
  first_name,
  last_name,
  state,
  created_at
from candidate_evidence
order by normalized_email nulls last, auth_user_id nulls last, source, created_at;

-- Result 2: exact consistency evidence for every Auth candidate located by the
-- name search. It does not choose one. `ready_existing_attach` requires one
-- confirmed Auth row and one ACTIVE application on the same normalized email.
with candidate_auth_ids as (
  select u.id
  from auth.users u
  where
    lower(trim(coalesce(u.raw_user_meta_data ->> 'first_name', ''))) = 'kris'
    or lower(trim(coalesce(u.raw_user_meta_data ->> 'firstName', ''))) = 'kris'
    or lower(trim(split_part(coalesce(u.raw_user_meta_data ->> 'full_name', ''), ' ', 1))) = 'kris'
  union
  select m.auth_user_id
  from public.research_members m
  left join public.research_applications a on a.id = m.application_id
  where m.auth_user_id is not null
    and lower(trim(coalesce(m.first_name, a.first_name, ''))) = 'kris'
), auth_candidates as (
  select u.id, lower(u.email) as normalized_email, u.email_confirmed_at
  from auth.users u
  join candidate_auth_ids c on c.id = u.id
), reconciled as (
  select
    u.id as auth_user_id,
    u.normalized_email,
    u.email_confirmed_at,
    m.id as member_id,
    m.status as member_status,
    a.id as application_id,
    a.status as application_status,
    case
      when m.id is not null and (
        m.auth_user_id is distinct from u.id
        or lower(m.email) is distinct from u.normalized_email
      ) then 'blocked_member_identity_conflict'
      when a.id is not null and lower(a.email) is distinct from u.normalized_email
        then 'blocked_application_email_conflict'
      when u.email_confirmed_at is null then 'blocked_auth_email_unconfirmed'
      when m.id is not null and (
        m.application_id is distinct from a.id
        or m.status <> 'active'
        or a.status is distinct from 'active'
      ) then 'blocked_member_application_not_active_or_mismatched'
      when m.id is not null and m.status = 'active' and a.status = 'active'
        then 'existing_member_ready'
      when a.id is not null and a.status = 'active' then 'ready_existing_attach'
      when a.id is not null then 'blocked_application_not_active'
      else 'blocked_no_canonical_application'
    end as activation_disposition
  from auth_candidates u
  left join public.research_members m
    on m.auth_user_id = u.id or lower(m.email) = u.normalized_email
  left join public.research_applications a
    on a.id = m.application_id or lower(a.email) = u.normalized_email
)
select * from reconciled
order by normalized_email, auth_user_id, application_id nulls last;

-- Result 3: secure-invite eligibility evidence for name-located canonical
-- applications. `ready_secure_invite` means only that this query found no Auth
-- or member row for the exact normalized email; the operator must still use a
-- founder-confirmed email and the activation composition rechecks immediately
-- before inviting.
select
  a.id as application_id,
  lower(a.email) as normalized_email,
  a.status as application_status,
  u.id as auth_user_id,
  m.id as member_id,
  case
    when u.id is not null then 'blocked_existing_auth_requires_exact_uid'
    when m.id is not null then 'blocked_member_without_matching_auth'
    when a.status = 'active' then 'ready_secure_invite'
    else 'blocked_application_not_active'
  end as activation_disposition
from public.research_applications a
left join auth.users u on lower(u.email) = lower(a.email)
left join public.research_members m on m.application_id = a.id or lower(m.email) = lower(a.email)
where lower(trim(a.first_name)) = 'kris'
order by lower(a.email), a.id;

rollback;

-- Decision rule outside this script:
--   * exactly one proven Auth UID/email + active application -> existing path;
--   * no Auth row + one founder-confirmed email + active application -> invite path;
--   * zero application, inactive application, or multiple/conflicting candidates
--     -> stop for human reconciliation. Never infer from Roman Digital, a test
--     fixture, a partial name, or an email fragment.
