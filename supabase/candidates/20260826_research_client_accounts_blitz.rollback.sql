\set ON_ERROR_STOP on

-- Candidate-only rollback for a disposable rehearsal or an explicitly
-- authorized pre-production rollback. It intentionally does not use CASCADE:
-- an unexpected external dependency must stop the rollback for review.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists research_client_invitation_record_event
  on public.research_customer_account_invitations;
drop trigger if exists research_client_invitation_guard
  on public.research_customer_account_invitations;
drop trigger if exists research_client_invitation_events_no_rewrite
  on public.research_customer_account_invitation_events;
drop trigger if exists research_client_import_staging_freeze
  on public.research_client_import_staging;
drop trigger if exists research_client_import_staging_touch
  on public.research_client_import_staging;
drop trigger if exists research_product_activation_overlay_audit_no_rewrite
  on public.research_product_activation_overlay_audit;

drop function if exists public.research_client_invitation_transition(uuid, text);
drop function if exists public.research_client_invitation_founder_approve(uuid, text);
drop function if exists public.research_client_invitation_draft(text);
drop function if exists public.research_client_invitation_record_event();
drop function if exists public.research_client_invitation_event_append_only();
drop function if exists public.research_client_invitation_guard();
drop function if exists public.research_client_import_staging_freeze();
drop function if exists public.research_client_import_staging_touch();
drop function if exists public.research_client_invitation_evidence_hash(
  public.research_client_import_staging,
  text
);
drop function if exists public.research_client_accounts_append_only();

drop table if exists public.research_customer_account_invitation_events;
drop table if exists public.research_customer_account_invitations;
drop table if exists public.research_customer_product_interests;
drop table if exists public.research_client_import_staging;
drop table if exists public.research_client_import_batches;
drop table if exists public.research_product_activation_overlay_audit;

commit;
