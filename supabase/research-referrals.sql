-- xenios research referrals (V3 sections 68-70). Run once in the Supabase SQL
-- Editor. Safe to re-run. RLS enabled, no public policies; server-only access.
-- The whole program is inert until RESEARCH_REFERRALS_ENABLED=true.

create extension if not exists "pgcrypto";

create table if not exists public.referral_programs (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null unique,
  name                        text not null,
  program_type                text not null default 'member'
                                check (program_type in ('member','ambassador','professional','internal')),
  enabled                     boolean not null default false,
  qualification_event         text not null default 'membership_activation',
  hold_days                   integer not null default 14,
  attribution_days            integer not null default 30,
  referrer_reward_type        text not null default 'credit'
                                check (referrer_reward_type in ('credit','commission','benefit','none')),
  referred_reward_type        text not null default 'none'
                                check (referred_reward_type in ('credit','discount','benefit','none')),
  referrer_reward_value_cents integer,
  referred_reward_value_cents integer,
  currency                    text not null default 'usd',
  terms_version               text not null default 'v1',
  starts_at                   timestamptz,
  ends_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.referral_identities (
  id                   uuid primary key default gen_random_uuid(),
  owner_type           text not null check (owner_type in ('applicant','member','ambassador','partner')),
  owner_id             uuid not null,
  owner_email          text not null,
  code                 text not null unique,
  public_display_mode  text not null default 'anonymous'
                         check (public_display_mode in ('anonymous','first-name','initials','custom')),
  public_display_value text,
  status               text not null default 'active' check (status in ('active','paused','revoked')),
  created_at           timestamptz not null default now(),
  rotated_at           timestamptz
);
create index if not exists referral_identities_owner_idx on public.referral_identities (owner_type, owner_id);

create table if not exists public.referral_attributions (
  id                      uuid primary key default gen_random_uuid(),
  referral_identity_id    uuid not null references public.referral_identities (id),
  program_id              uuid not null references public.referral_programs (id),
  anonymous_session_id    text,
  application_id          uuid,
  member_id               uuid,
  first_touch_at          timestamptz not null default now(),
  last_touch_at           timestamptz not null default now(),
  attribution_expires_at  timestamptz not null,
  source_channel          text,
  landing_path            text,
  status                  text not null default 'visited'
                            check (status in ('visited','application-started','application-submitted',
                                              'approved','activated','qualified','disqualified','expired')),
  disqualification_reason text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists referral_attributions_application_idx on public.referral_attributions (application_id);
create index if not exists referral_attributions_identity_idx on public.referral_attributions (referral_identity_id, created_at desc);

create table if not exists public.referral_rewards (
  id                   uuid primary key default gen_random_uuid(),
  attribution_id       uuid not null references public.referral_attributions (id),
  recipient_type       text not null check (recipient_type in ('referrer','referred')),
  recipient_member_id  uuid not null,
  reward_type          text not null check (reward_type in ('credit','benefit','commission')),
  value_cents          integer,
  currency             text,
  status               text not null default 'pending'
                         check (status in ('pending','held','available','redeemed','expired','reversed','cancelled')),
  idempotency_key      text not null unique,
  qualifies_at         timestamptz,
  available_at         timestamptz,
  expires_at           timestamptz,
  reversed_at          timestamptz,
  reversal_reason      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Append-only. Never update or delete rows; corrections are new entries.
create table if not exists public.member_credit_ledger (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null,
  entry_type          text not null
                        check (entry_type in ('referral-earned','milestone-earned','manual-adjustment',
                                              'purchase-redemption','expiration','reversal','refund-adjustment')),
  amount_cents        integer not null,
  currency            text not null default 'usd',
  referral_reward_id  uuid,
  order_id            text,
  balance_after_cents integer not null,
  reason              text not null,
  actor_type          text not null check (actor_type in ('system','admin','member')),
  actor_id            text,
  created_at          timestamptz not null default now()
);
create index if not exists member_credit_ledger_member_idx on public.member_credit_ledger (member_id, created_at);

alter table public.referral_programs     enable row level security;
alter table public.referral_identities   enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards      enable row level security;
alter table public.member_credit_ledger  enable row level security;
