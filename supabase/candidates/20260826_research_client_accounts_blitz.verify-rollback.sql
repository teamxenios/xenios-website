\set ON_ERROR_STOP on

do $verify_rollback$
begin
  if to_regclass('public.research_client_import_batches') is not null
     or to_regclass('public.research_client_import_staging') is not null
     or to_regclass('public.research_customer_product_interests') is not null
     or to_regclass('public.research_customer_account_invitations') is not null
     or to_regclass('public.research_customer_account_invitation_events') is not null
     or to_regclass('public.research_product_activation_overlay_audit') is not null
     or to_regprocedure('public.research_client_invitation_draft(text)') is not null
     or to_regprocedure('public.research_client_invitation_founder_approve(uuid,text)') is not null
     or to_regprocedure('public.research_client_invitation_transition(uuid,text)') is not null then
    raise exception 'candidate rollback left a table or sanctioned routine behind';
  end if;
  raise notice 'PASS rollback removed every candidate-owned table and sanctioned routine.';
end
$verify_rollback$;
