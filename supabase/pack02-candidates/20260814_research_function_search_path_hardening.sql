-- CANDIDATE ONLY. DO NOT AUTO-APPLY. Lead-owned production apply after review.
--
-- Advisor finding: function_search_path_mutable (12 WARN). Every function below
-- runs SECURITY DEFINER or as a table trigger with a mutable search_path. Each
-- body references only public.-qualified tables and pg_catalog builtins
-- (proven by server/research/security/function-search-path-hardening.test.ts,
-- which also carries the negative control for that proof), so pinning the
-- search_path is a configuration-only change: prosrc is untouched, ACLs are
-- untouched, trigger wiring is untouched, and no statement in any body can
-- resolve differently afterward. An attacker able to create objects in a
-- schema earlier on a caller's search_path can no longer influence name
-- resolution inside these bodies.
--
-- Idempotent: re-applying re-sets the same configuration.

begin;

do $preflight$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.research_fm_history_is_append_only()',
    'public.research_fm_append_only()',
    'public.research_fm_identity_audit_is_append_only()',
    'public.research_fm_versions_guard()',
    'public.research_fm_versions_no_delete()',
    'public.research_fm_signature_requires_published()',
    'public.research_fm_signatures_append_only()',
    'public.research_fm_checklist_touch()',
    'public.research_fm_esign_touch_updated_at()',
    'public.research_ledger_is_append_only()',
    'public.research_reject_product_request_event_mutation()',
    'public.research_rate_limit_hit(text,integer,integer)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'search_path hardening preflight: % does not exist; refusing to guess',
        v_sig using errcode = '55000';
    end if;
  end loop;
end;
$preflight$;

alter function public.research_fm_history_is_append_only() set search_path = '';
alter function public.research_fm_append_only() set search_path = '';
alter function public.research_fm_identity_audit_is_append_only() set search_path = '';
alter function public.research_fm_versions_guard() set search_path = '';
alter function public.research_fm_versions_no_delete() set search_path = '';
alter function public.research_fm_signature_requires_published() set search_path = '';
alter function public.research_fm_signatures_append_only() set search_path = '';
alter function public.research_fm_checklist_touch() set search_path = '';
alter function public.research_fm_esign_touch_updated_at() set search_path = '';
alter function public.research_ledger_is_append_only() set search_path = '';
alter function public.research_reject_product_request_event_mutation() set search_path = '';
alter function public.research_rate_limit_hit(text,integer,integer) set search_path = '';

do $postcondition$
declare
  v_sig text;
  v_trigger_fn text;
begin
  -- Every altered function now carries a pinned search_path configuration.
  foreach v_sig in array array[
    'public.research_fm_history_is_append_only()',
    'public.research_fm_append_only()',
    'public.research_fm_identity_audit_is_append_only()',
    'public.research_fm_versions_guard()',
    'public.research_fm_versions_no_delete()',
    'public.research_fm_signature_requires_published()',
    'public.research_fm_signatures_append_only()',
    'public.research_fm_checklist_touch()',
    'public.research_fm_esign_touch_updated_at()',
    'public.research_ledger_is_append_only()',
    'public.research_reject_product_request_event_mutation()',
    'public.research_rate_limit_hit(text,integer,integer)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = to_regprocedure(v_sig)
        and exists (
          select 1 from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) c
          where c like 'search_path=%'
        )
    ) then
      raise exception 'search_path hardening postcondition: % is still mutable',
        v_sig using errcode = '55000';
    end if;
  end loop;

  -- Every trigger guard is still wired to at least one live trigger; ALTER
  -- FUNCTION cannot detach a trigger, so a failure here means the database
  -- was not in the shape this candidate was reviewed against.
  foreach v_trigger_fn in array array[
    'research_fm_history_is_append_only',
    'research_fm_append_only',
    'research_fm_identity_audit_is_append_only',
    'research_fm_versions_guard',
    'research_fm_versions_no_delete',
    'research_fm_signature_requires_published',
    'research_fm_signatures_append_only',
    'research_fm_checklist_touch',
    'research_fm_esign_touch_updated_at',
    'research_ledger_is_append_only',
    'research_reject_product_request_event_mutation'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_trigger_fn and not t.tgisinternal
    ) then
      raise exception 'search_path hardening postcondition: trigger guard % is wired to no trigger',
        v_trigger_fn using errcode = '55000';
    end if;
  end loop;
end;
$postcondition$;

commit;
