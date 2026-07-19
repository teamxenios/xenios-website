-- xenios research referral fraud controls (V3 section 71).
-- Run once in the Supabase SQL Editor AFTER research-referrals.sql.
-- Safe to re-run (if-not-exists everywhere).
--
-- Adds: an append-only referral event audit trail, the fraud review queue,
-- the applicant IP on attributions (household correlation), uniqueness
-- guarantees (one active identity per owner, one attribution per application),
-- and durable cross-instance rate limiting via one atomic function.

-- 1. Append-only referral audit trail (the referral analogue of
--    research_application_events). Every attribution transition, qualification
--    attempt, fraud flag, and reviewer action writes one row. Never updated.
create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid references public.referral_attributions(id),
  reward_id uuid references public.referral_rewards(id),
  identity_id uuid references public.referral_identities(id),
  fraud_flag_id uuid,
  event_type text not null,
  actor_type text not null check (actor_type in ('system','admin')),
  actor_id text,
  reason text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists referral_events_attribution_idx on public.referral_events (attribution_id);
create index if not exists referral_events_created_idx on public.referral_events (created_at desc);

-- 2. The fraud review queue. Signals FLAG for human review; they never
--    auto-penalize (the household rule). Reviewer actions live in code and
--    each one requires an audit reason.
create table if not exists public.referral_fraud_flags (
  id uuid primary key default gen_random_uuid(),
  reason text not null check (reason in (
    'possible-self-referral',
    'duplicate-payment-instrument',
    'unusual-velocity',
    'multiple-accounts',
    'refund-pattern',
    'chargeback',
    'shared-device-pattern',
    'repeated-household',
    'suspicious-source',
    'manual-report'
  )),
  status text not null default 'open' check (status in (
    'open', 'information-requested', 'escalated', 'resolved'
  )),
  attribution_id uuid references public.referral_attributions(id),
  identity_id uuid references public.referral_identities(id),
  application_id uuid references public.research_applications(id),
  detail text,
  resolution_action text check (resolution_action in (
    'clear', 'hold', 'disqualify', 'reverse-reward',
    'suspend-referrer', 'request-information', 'escalate'
  )),
  resolution_reason text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referral_fraud_flags_status_idx on public.referral_fraud_flags (status, created_at desc);
create index if not exists referral_fraud_flags_attribution_idx on public.referral_fraud_flags (attribution_id);

-- 3. Applicant IP on the attribution (compared against the referrer's own
--    application IP to flag repeated-household patterns for review).
alter table public.referral_attributions
  add column if not exists applicant_ip text;

-- 4. Uniqueness the code previously only assumed: one ACTIVE referral identity
--    per owner, one attribution per application.
create unique index if not exists referral_identities_owner_active_uq
  on public.referral_identities (owner_type, owner_id) where status = 'active';
create unique index if not exists referral_attributions_application_uq
  on public.referral_attributions (application_id) where application_id is not null;

-- 5. Durable rate limiting (V3 section 71: an in-memory map is insufficient
--    across instances). One atomic fixed-window counter; the server calls
--    research_rate_limit_hit and gets back "allowed?". Expired windows are
--    swept opportunistically so the table stays tiny.
create table if not exists public.research_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hits integer not null
);

create or replace function public.research_rate_limit_hit(
  p_key text, p_window_seconds integer, p_max_hits integer
) returns boolean
language plpgsql
as $$
declare
  allowed boolean;
begin
  insert into public.research_rate_limits as rl (key, window_started_at, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case
          when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
          then 1 else rl.hits + 1 end,
        window_started_at = case
          when rl.window_started_at < now() - make_interval(secs => p_window_seconds)
          then now() else rl.window_started_at end
  returning rl.hits <= p_max_hits into allowed;

  delete from public.research_rate_limits
   where window_started_at < now() - interval '1 day' and key <> p_key;

  return allowed;
end $$;

-- Service role only, like every research table: RLS on, zero public policies.
alter table public.referral_events      enable row level security;
alter table public.referral_fraud_flags enable row level security;
alter table public.research_rate_limits enable row level security;
