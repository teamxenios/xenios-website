-- xenios research referral program seed (accepted decision: Give $10, Get $15).
-- Run once in the Supabase SQL Editor AFTER research-referrals.sql. Safe to
-- re-run (unique code, do-nothing on conflict). The program row being enabled
-- does NOTHING until RESEARCH_REFERRALS_ENABLED=true in the environment:
-- the env flag remains the single switch.

insert into public.referral_programs
  (code, name, program_type, enabled, qualification_event, hold_days,
   attribution_days, referrer_reward_type, referred_reward_type,
   referrer_reward_value_cents, referred_reward_value_cents, currency, terms_version)
values
  ('member-give10-get15', 'Member referrals: Give $10, Get $15', 'member', true,
   'membership_activation', 14, 30, 'credit', 'credit', 1500, 1000, 'usd', 'v1')
on conflict (code) do nothing;
