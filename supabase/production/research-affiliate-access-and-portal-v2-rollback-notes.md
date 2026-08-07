# Rollback: research_affiliate_access_and_portal_v2

Migration: `supabase/migrations/20260807200000_research_affiliate_access_and_portal_v2.sql`
State: NOT applied to production. Every affiliate flag ships false.

## What it adds

Twenty additive tables for the affiliate access-code, application,
attribution, commission-schedule, content and audit foundation. Each new
table either carries a `_v2` suffix or a name that did not previously exist,
verified against the tables created by
`20260728020000_research_affiliate_professional_operations.sql`:

Pre-existing, untouched: `research_affiliate_partners`,
`research_affiliate_links`, `research_affiliate_attribution_events`,
`research_affiliate_commission_events`, `research_affiliate_statements`,
`research_affiliate_statement_items`.

Added here: `research_affiliate_access_codes`,
`research_affiliate_code_attempts`, `research_affiliate_applications`,
`research_affiliate_document_requirements`,
`research_affiliate_customer_relationships`,
`research_affiliate_manual_attribution_requests`,
`research_affiliate_schedule_assignments`, `research_affiliate_user_links`,
and the `_v2` set (agreements, attribution_sessions, audit_events, campaigns,
commission_adjustments, commission_schedules, content_assets,
content_assignments, notifications, order_attributions, referral_links,
support_requests).

It depends on `research_affiliate_professional_operations` because it
references `public.research_affiliate_partners`.

## The rollback

**1. Leave every flag false. This is the rollback.**

`AFFILIATE_SYSTEM_ENABLED`, `AFFILIATE_PORTAL_ENABLED`,
`AFFILIATE_CODES_ENABLED` and `AFFILIATE_CODE_UNLOCKS_EARLY_ACCESS` all ship
`false`, and no route in this successor reads these tables. The schema is
inert until a named human turns a flag on.

**2. The commission schedule cannot pay anyone regardless.**

`AFFILIATE_DRAFT_COMMISSION_SCHEDULE` ships in state `draft`, and
`calculateAffiliateCommission` returns null for any schedule that is not
`active`. Rolling back the flags is therefore sufficient to guarantee no
accrual; there is no state in which this migration alone moves money.

**3. Only if the schema itself must go**

Confirm `select count(*) from public.research_affiliate_access_codes;` and
`select count(*) from public.research_affiliate_applications;` are zero
first. A non-zero count means a real partner was invited or applied, and the
correct action is to resolve that relationship rather than drop the record of
it. Drop the added tables in reverse dependency order, leaving every
pre-existing `research_affiliate_*` table from migration 20260728020000 in
place.

## Evidence

Applied twice against a disposable PostgreSQL 16 container, after the base
production schema and every preceding migration including its
`research_affiliate_professional_operations` dependency, with
`ON_ERROR_STOP=1`. The second pass produced no new failure, and all twenty
added tables were present alongside the six pre-existing affiliate tables
with no name collision.
