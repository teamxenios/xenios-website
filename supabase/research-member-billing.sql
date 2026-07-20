-- xenios research member billing state (ACCOUNT-EMAIL-SYSTEMS-001).
-- Run once in the Supabase SQL Editor. Safe to re-run. NOT YET RUN: the code
-- ships tolerant of this migration being absent (a missing billing_state
-- column reads as 'not_started' / verified-legacy for already-active members).
--
-- 1. Widens research_members.status with the dunning/cancellation states the
--    membership lifecycle needs (past_due, cancelled). No existing rows change.
-- 2. Adds billing_state, tracked SEPARATELY from membership status: a single
--    generic "active" cannot represent dunning, refunds, or disputes.

alter table public.research_members
  drop constraint if exists research_members_status_check;
alter table public.research_members
  add constraint research_members_status_check
  check (status in ('pending_activation','active','past_due','paused','cancelled','closed'));

alter table public.research_members
  add column if not exists billing_state text not null default 'not_started'
  check (billing_state in ('not_started','activation_pending','subscription_pending',
                           'active','past_due','cancelled','refunded','disputed'));

-- Members activated through the admin-verified interim flow (both payment
-- references attested) are billing-verified by definition of that flow.
update public.research_members set billing_state = 'active'
  where status = 'active' and billing_state = 'not_started';
