# Track A migration: rollback and recovery notes

## Scope

This applies ONLY the private member platform (migrations 9-19). Commerce
(20-26) is NOT part of Track A and must not be applied here.

Tables created (15): research_agreement_acceptances, research_member_profile_sections, research_assessment_responses, research_blueprints, research_xenios30_plans, research_xenios90_plans, research_plan_change_requests, research_plan_documents, research_tracker_observations, research_private_media, research_media_access_log, research_media_retention_elections, research_member_questions, research_telegram_links, research_sla_events.
Migration 9 also adds the `billing_state` column to `research_members`.

## RLS posture (correct as-is)

Every table is RLS-enabled with zero policies. The server reaches these tables
only through the Supabase SERVICE ROLE, which bypasses RLS. No browser, anon, or
authenticated client role has database credentials or a policy, so a leaked
client token can read/write nothing. A public policy would be a REGRESSION.
Tenant isolation lives in the server (every query scoped by the authenticated
member id from the guard, never from a request body) and is covered by the
member A vs member B tests.

## Rollback

- Idempotent re-apply is the primary recovery: every statement is
  `create ... if not exists`, so re-running after a partial apply completes it.
- No destructive DDL, so a failed apply leaves existing data intact.
- Additive and inert: the member-platform tables gated on an optional provider
  (media storage = migration 17, Telegram = 18, Infinity/SLA = 19) exist but do
  nothing until that provider is enabled, so applying them early is safe.
- Code rollback is independent of schema: reverting the merge on `main` and
  redeploying the prior SHA needs no schema change, because the server reads
  every new table/column defensively (a missing one degrades to empty state).
- A true teardown (dropping the tables, removing the column) is a manual,
  reviewed decision, never a routine rollback.

## What this does NOT do

- Does NOT apply commerce (20-26).
- Does NOT enable any capability or flag.
- Does NOT touch secrets, RLS policies, or existing data.
