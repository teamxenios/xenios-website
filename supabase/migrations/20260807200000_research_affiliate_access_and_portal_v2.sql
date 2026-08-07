-- Xenios Research affiliate access, portal, schedules, content and audit v2.
-- Extends the existing research_affiliate_* foundation. Creates no active affiliate,
-- no active customer code, no approved commission schedule, and no payout.

create extension if not exists pgcrypto;

alter table public.research_affiliate_partners
  add column if not exists affiliate_number text,
  add column if not exists legal_name text,
  add column if not exists business_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists segment text,
  add column if not exists relationship_lane text,
  add column if not exists parent_partner_id uuid references public.research_affiliate_partners(id),
  add column if not exists application_date timestamptz,
  add column if not exists approval_date timestamptz,
  add column if not exists activation_date timestamptz,
  add column if not exists pause_date timestamptz,
  add column if not exists termination_date timestamptz,
  add column if not exists assigned_owner text,
  add column if not exists notes text,
  add column if not exists lifecycle_state_v2 text not null default 'prospect'
    check (lifecycle_state_v2 in ('prospect','application_review','approved_pending_documents','testing','active','paused','terminated'));


create unique index if not exists research_affiliate_number_unique
  on public.research_affiliate_partners(affiliate_number)
  where affiliate_number is not null;


create or replace function public.research_affiliate_parent_one_level_guard()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_parent_parent uuid;
begin
  if new.parent_partner_id is null then return new; end if;
  if new.parent_partner_id = new.id then raise exception 'affiliate cannot parent itself'; end if;
  select parent_partner_id into v_parent_parent
    from public.research_affiliate_partners where id = new.parent_partner_id;
  if not found then raise exception 'parent affiliate not found'; end if;
  if v_parent_parent is not null then
    raise exception 'only one approved parent-affiliate level is permitted';
  end if;
  return new;
end $$;

drop trigger if exists research_affiliate_parent_one_level on public.research_affiliate_partners;
create trigger research_affiliate_parent_one_level
before insert or update of parent_partner_id on public.research_affiliate_partners
for each row execute function public.research_affiliate_parent_one_level_guard();

create table if not exists public.research_affiliate_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_email text not null,
  legal_name text not null,
  business_name text,
  phone text,
  requested_lane text,
  status text not null check (status in ('prospect','application_review','approved_pending_documents','rejected','withdrawn')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers)='object'),
  submitted_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.research_affiliate_user_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id) on delete cascade,
  auth_user_id uuid not null,
  role text not null check (role in ('owner','manager','viewer')),
  state text not null check (state in ('invited','active','paused','revoked')),
  invited_at timestamptz not null,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null,
  unique (affiliate_id, auth_user_id),
  unique (auth_user_id)
);

create table if not exists public.research_affiliate_agreements_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  agreement_kind text not null,
  version text not null,
  status text not null check (status in ('required','sent','signed','superseded','terminated')),
  evidence_ref text,
  signed_at timestamptz,
  effective_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null,
  unique (affiliate_id, agreement_kind, version)
);

create table if not exists public.research_affiliate_document_requirements (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  requirement_kind text not null check (requirement_kind in ('identity','business_verification','tax_form','payout_verification','privacy_acknowledgment','training','other')),
  status text not null check (status in ('missing','requested','received','verified','rejected','expired')),
  evidence_ref text,
  verified_by uuid,
  verified_at timestamptz,
  expires_at timestamptz,
  notes text,
  unique (affiliate_id, requirement_kind)
);

create table if not exists public.research_affiliate_commission_schedules_v2 (
  id uuid primary key default gen_random_uuid(),
  schedule_code text not null,
  version integer not null check (version > 0),
  state text not null check (state in ('draft','under_review','approved','active','paused','expired','replaced','archived')),
  first_order_rate_bps integer not null check (first_order_rate_bps between 0 and 10000),
  repeat_order_rate_bps integer not null check (repeat_order_rate_bps between 0 and 10000),
  parent_override_rate_bps integer check (parent_override_rate_bps is null or parent_override_rate_bps between 0 and 10000),
  attribution_window_days integer not null default 30 check (attribution_window_days between 0 and 365),
  hold_days integer not null default 30 check (hold_days between 0 and 365),
  minimum_payout_cents bigint not null default 10000 check (minimum_payout_cents >= 0),
  recurring_term_months integer check (recurring_term_months is null or recurring_term_months between 1 and 120),
  currency text not null default 'USD' check (currency='USD'),
  effective_at timestamptz,
  expires_at timestamptz,
  agreement_reference text,
  created_by uuid not null,
  created_at timestamptz not null,
  approved_by uuid,
  approved_at timestamptz,
  unique (schedule_code, version),
  check (state <> 'active' or (approved_by is not null and approved_at is not null and agreement_reference is not null))
);


insert into public.research_affiliate_commission_schedules_v2(
  id,schedule_code,version,state,first_order_rate_bps,repeat_order_rate_bps,
  parent_override_rate_bps,attribution_window_days,hold_days,minimum_payout_cents,
  recurring_term_months,currency,created_by,created_at
) values (
  '00000000-0000-4000-8000-000000000201','EA-DEFAULT-DRAFT',1,'draft',
  2000,1500,null,30,30,10000,null,'USD',
  '00000000-0000-4000-8000-000000000001','2026-08-07T00:00:00Z'
) on conflict (schedule_code,version) do nothing;

create table if not exists public.research_affiliate_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  schedule_id uuid not null references public.research_affiliate_commission_schedules_v2(id),
  state text not null check (state in ('assigned','active','paused','ended')),
  assigned_at timestamptz not null,
  activated_at timestamptz,
  ended_at timestamptz,
  assigned_by uuid not null,
  unique (affiliate_id, schedule_id)
);

create unique index if not exists research_affiliate_one_active_schedule
  on public.research_affiliate_schedule_assignments(affiliate_id)
  where state='active';

create table if not exists public.research_affiliate_campaigns_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.research_affiliate_partners(id),
  campaign_code text not null unique,
  display_name text not null,
  state text not null check (state in ('draft','testing','active','paused','expired','archived')),
  starts_at timestamptz,
  expires_at timestamptz,
  public_offer_id text,
  product_matrix jsonb not null default '[]'::jsonb check (jsonb_typeof(product_matrix)='array'),
  created_by uuid not null,
  created_at timestamptz not null
);

create table if not exists public.research_affiliate_access_codes (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  campaign_id uuid references public.research_affiliate_campaigns_v2(id),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  masked_prefix text not null,
  last_four text not null check (length(last_four)=4),
  status text not null check (status in ('draft','testing','active','paused','revoked','expired')),
  access_mode text not null check (access_mode in ('attribution_only','unlock_early_access')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  maximum_uses integer check (maximum_uses is null or maximum_uses > 0),
  successful_uses integer not null default 0 check (successful_uses >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null,
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  check (status <> 'revoked' or (revoked_by is not null and revoked_at is not null and revocation_reason is not null))
);

create unique index if not exists research_affiliate_active_code_collision
  on public.research_affiliate_access_codes(code_hash)
  where status in ('testing','active');

create table if not exists public.research_affiliate_code_attempts (
  id uuid primary key default gen_random_uuid(),
  code_id uuid references public.research_affiliate_access_codes(id),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  success boolean not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);
create index if not exists research_affiliate_code_attempt_rate_idx
  on public.research_affiliate_code_attempts(ip_hash, occurred_at desc);

create table if not exists public.research_affiliate_referral_links_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  campaign_id uuid references public.research_affiliate_campaigns_v2(id),
  public_token_hash text not null unique check (public_token_hash ~ '^[a-f0-9]{64}$'),
  masked_token text not null,
  destination_path text not null check (destination_path like '/%' and destination_path not like '//%'),
  state text not null check (state in ('testing','active','paused','revoked','expired')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null
);

create table if not exists public.research_affiliate_attribution_sessions_v2 (
  id uuid primary key default gen_random_uuid(),
  opaque_token_hash text not null unique check (opaque_token_hash ~ '^[a-f0-9]{64}$'),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  code_id uuid references public.research_affiliate_access_codes(id),
  link_id uuid references public.research_affiliate_referral_links_v2(id),
  campaign_id uuid references public.research_affiliate_campaigns_v2(id),
  method text not null check (method in ('explicit_code','referral_link','attribution_session','assisted_sale','house')),
  source_page text,
  first_touch_at timestamptz not null,
  last_touch_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null check (state in ('active','consumed','expired','revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.research_affiliate_customer_relationships (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  customer_scope_hash text not null check (customer_scope_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('active','paused','ended','disputed')),
  first_eligible_order_id text,
  first_eligible_order_at timestamptz,
  recurring_expires_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (affiliate_id, customer_scope_hash)
);

create table if not exists public.research_affiliate_order_attributions_v2 (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  affiliate_id uuid references public.research_affiliate_partners(id),
  relationship_id uuid references public.research_affiliate_customer_relationships(id),
  code_id uuid references public.research_affiliate_access_codes(id),
  campaign_id uuid references public.research_affiliate_campaigns_v2(id),
  attribution_method text not null check (attribution_method in ('explicit_code','referral_link','attribution_session','assisted_sale','house','unattributed')),
  attributed_at timestamptz not null,
  attribution_expires_at timestamptz,
  schedule_id uuid references public.research_affiliate_commission_schedules_v2(id),
  schedule_version integer,
  public_offer_id text,
  source_page text,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_by uuid not null
);

create table if not exists public.research_affiliate_commission_adjustments_v2 (
  id uuid primary key default gen_random_uuid(),
  commission_event_id uuid not null references public.research_affiliate_commission_events(id),
  adjustment_kind text not null check (adjustment_kind in ('refund','partial_refund','chargeback','fraud','manual_correction','dispute_hold','release_hold')),
  amount_cents bigint not null,
  reason text not null,
  evidence_ref text,
  prior_adjustment_id uuid references public.research_affiliate_commission_adjustments_v2(id),
  created_by uuid not null,
  created_at timestamptz not null
);

create table if not exists public.research_affiliate_content_assets_v2 (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null,
  version integer not null check (version > 0),
  state text not null check (state in ('draft','review','approved','assigned','published','expired','takedown_required','archived')),
  audience text not null,
  channel text not null,
  offer_id text,
  relationship_lane text,
  approved_at timestamptz,
  expires_at timestamptz,
  required_disclosure text,
  cta text,
  body jsonb not null check (jsonb_typeof(body)='object'),
  published_url text,
  archive_ref text,
  created_by uuid not null,
  created_at timestamptz not null,
  unique (asset_code, version),
  check (state not in ('approved','assigned','published') or approved_at is not null)
);

create table if not exists public.research_affiliate_content_assignments_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  asset_id uuid not null references public.research_affiliate_content_assets_v2(id),
  state text not null check (state in ('assigned','acknowledged','published','expired','takedown_required','removed')),
  assigned_at timestamptz not null,
  acknowledged_at timestamptz,
  published_at timestamptz,
  screenshot_ref text,
  monitoring_state text,
  unique (affiliate_id, asset_id)
);

create table if not exists public.research_affiliate_notifications_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  kind text not null,
  subject text not null,
  body text not null,
  state text not null check (state in ('queued','sent','read','failed','archived')),
  created_at timestamptz not null,
  sent_at timestamptz,
  read_at timestamptz
);

create table if not exists public.research_affiliate_support_requests_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.research_affiliate_partners(id),
  kind text not null,
  subject text not null,
  body text not null,
  state text not null check (state in ('open','in_progress','waiting','resolved','closed')),
  assigned_owner text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.research_affiliate_manual_attribution_requests (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  original_affiliate_id uuid references public.research_affiliate_partners(id),
  requested_affiliate_id uuid references public.research_affiliate_partners(id),
  reason text not null,
  evidence_ref text not null,
  state text not null check (state in ('requested','approved','denied','cancelled')),
  requested_by uuid not null,
  requested_at timestamptz not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text
);

create table if not exists public.research_affiliate_audit_events_v2 (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.research_affiliate_partners(id),
  event_type text not null,
  actor_id uuid,
  actor_role text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null
);

-- Append-only financial/security evidence.
create or replace function public.research_affiliate_v2_immutable()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'affiliate v2 evidence is immutable' using errcode='55000'; end $$;

do $$ declare v_table text; begin
  foreach v_table in array array[
    'research_affiliate_code_attempts',
    'research_affiliate_order_attributions_v2',
    'research_affiliate_commission_adjustments_v2',
    'research_affiliate_audit_events_v2'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table||'_immutable', v_table);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_affiliate_v2_immutable()', v_table||'_immutable', v_table);
  end loop;
end $$;

-- Portal snapshot: authenticated affiliate user sees only their own masked operational data.
create or replace function public.research_affiliate_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_auth uuid; v_affiliate uuid; v_partner public.research_affiliate_partners%rowtype;
begin
  v_auth := auth.uid();
  if v_auth is null then raise exception 'authentication required' using errcode='42501'; end if;
  select affiliate_id into v_affiliate from public.research_affiliate_user_links
   where auth_user_id=v_auth and state='active';
  if v_affiliate is null then raise exception 'affiliate access denied' using errcode='42501'; end if;
  select * into v_partner from public.research_affiliate_partners where id=v_affiliate;
  return jsonb_build_object(
    'affiliateId',v_partner.id,
    'affiliateNumber',v_partner.affiliate_number,
    'displayName',v_partner.display_name,
    'state',v_partner.lifecycle_state_v2,
    'relationshipLane',v_partner.relationship_lane,
    'codes',coalesce((select jsonb_agg(jsonb_build_object(
      'codeId',c.id,'maskedPrefix',c.masked_prefix,'lastFour',c.last_four,
      'status',c.status,'startsAt',c.starts_at,'expiresAt',c.expires_at,
      'successfulUses',c.successful_uses,'maximumUses',c.maximum_uses
    ) order by c.created_at desc) from public.research_affiliate_access_codes c where c.affiliate_id=v_affiliate),'[]'::jsonb),
    'statements',coalesce((select jsonb_agg(jsonb_build_object(
      'statementId',s.id,'periodStart',s.period_start,'periodEnd',s.period_end,
      'currency',s.currency,'payableCents',s.payable_cents,'state',s.state,'issuedAt',s.issued_at
    ) order by s.period_end desc) from public.research_affiliate_statements s where s.partner_id=v_affiliate),'[]'::jsonb)
  );
end $$;


-- Atomic service-role code consume. The server HMACs the raw code and supplies only
-- the hash plus a separately generated opaque attribution-token hash.
create or replace function public.research_affiliate_validate_code_hash(
  p_code_hash text,
  p_ip_hash text,
  p_attribution_token_hash text,
  p_at timestamptz,
  p_attribution_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare v_code public.research_affiliate_access_codes%rowtype; v_partner public.research_affiliate_partners%rowtype; v_session uuid;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
     or p_attribution_token_hash !~ '^[a-f0-9]{64}$'
     or p_attribution_expires_at <= p_at
  then raise exception 'invalid code validation request' using errcode='22023'; end if;

  select * into v_code from public.research_affiliate_access_codes
   where code_hash=p_code_hash for update;
  if not found then
    insert into public.research_affiliate_code_attempts(code_id,ip_hash,success,occurred_at)
      values(null,p_ip_hash,false,p_at);
    return jsonb_build_object('valid',false);
  end if;
  select * into v_partner from public.research_affiliate_partners where id=v_code.affiliate_id;
  if v_code.status not in ('testing','active')
     or v_partner.lifecycle_state_v2 not in ('testing','active')
     or v_code.starts_at > p_at
     or (v_code.expires_at is not null and v_code.expires_at <= p_at)
     or (v_code.maximum_uses is not null and v_code.successful_uses >= v_code.maximum_uses)
  then
    update public.research_affiliate_access_codes set failed_attempts=failed_attempts+1 where id=v_code.id;
    insert into public.research_affiliate_code_attempts(code_id,ip_hash,success,occurred_at)
      values(v_code.id,p_ip_hash,false,p_at);
    return jsonb_build_object('valid',false);
  end if;

  update public.research_affiliate_access_codes
    set successful_uses=successful_uses+1,last_used_at=p_at where id=v_code.id;
  insert into public.research_affiliate_code_attempts(code_id,ip_hash,success,occurred_at)
    values(v_code.id,p_ip_hash,true,p_at);
  insert into public.research_affiliate_attribution_sessions_v2(
    opaque_token_hash,affiliate_id,code_id,campaign_id,method,source_page,
    first_touch_at,last_touch_at,expires_at,state
  ) values (
    p_attribution_token_hash,v_code.affiliate_id,v_code.id,v_code.campaign_id,
    'explicit_code',null,p_at,p_at,p_attribution_expires_at,'active'
  ) returning id into v_session;

  return jsonb_build_object(
    'valid',true,
    'affiliateId',v_code.affiliate_id,
    'codeId',v_code.id,
    'campaignId',v_code.campaign_id,
    'publicDisplayName',case when v_partner.lifecycle_state_v2='active' then v_partner.display_name else null end,
    'accessMode',v_code.access_mode,
    'attributionSessionId',v_session,
    'supportState',v_code.status
  );
end $$;

revoke all on function public.research_affiliate_validate_code_hash(text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.research_affiliate_validate_code_hash(text,text,text,timestamptz,timestamptz) to service_role;

-- Forced RLS and least privilege. Server uses service_role; portal uses only the reviewed function.
do $$ declare v_table text; begin
  foreach v_table in array array[
    'research_affiliate_applications','research_affiliate_user_links','research_affiliate_agreements_v2',
    'research_affiliate_document_requirements','research_affiliate_commission_schedules_v2',
    'research_affiliate_schedule_assignments','research_affiliate_campaigns_v2',
    'research_affiliate_access_codes','research_affiliate_code_attempts',
    'research_affiliate_referral_links_v2','research_affiliate_attribution_sessions_v2',
    'research_affiliate_customer_relationships','research_affiliate_order_attributions_v2',
    'research_affiliate_commission_adjustments_v2','research_affiliate_content_assets_v2',
    'research_affiliate_content_assignments_v2','research_affiliate_notifications_v2',
    'research_affiliate_support_requests_v2','research_affiliate_manual_attribution_requests',
    'research_affiliate_audit_events_v2'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
  end loop;
end $$;

revoke all on function public.research_affiliate_portal_snapshot() from public, anon;
grant execute on function public.research_affiliate_portal_snapshot() to authenticated;

comment on function public.research_affiliate_portal_snapshot() is
  'Own-affiliate masked portal snapshot. Exposes no customer PII, supplier costs, admin notes, code hash, or raw code.';
