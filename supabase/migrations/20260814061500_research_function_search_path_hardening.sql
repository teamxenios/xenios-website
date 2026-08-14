-- DRAFT — research_function_search_path_hardening
-- Remediates advisor WARN function_search_path_mutable on 12 functions.
-- Staged by lead 2026-08-14; APPLY ONLY after the adversarial verification workflow
-- approves (wf_fc4178d9). Evidence: all 12 bodies pulled from live prod; the only two
-- that touch tables (research_fm_signature_requires_published, research_rate_limit_hit)
-- fully qualify public.* references; the rest are raise-only/touch-only trigger guards
-- using pg_catalog built-ins, which resolve regardless of search_path.
-- proconfig representation verified empirically on live bridge functions: search_path=""
-- Rollback: alter function ... reset search_path (each), which restores mutable default.

begin;

alter function public.research_fm_append_only() set search_path = '';
alter function public.research_fm_checklist_touch() set search_path = '';
alter function public.research_fm_esign_touch_updated_at() set search_path = '';
alter function public.research_fm_history_is_append_only() set search_path = '';
alter function public.research_fm_identity_audit_is_append_only() set search_path = '';
alter function public.research_fm_signature_requires_published() set search_path = '';
alter function public.research_fm_signatures_append_only() set search_path = '';
alter function public.research_fm_versions_guard() set search_path = '';
alter function public.research_fm_versions_no_delete() set search_path = '';
alter function public.research_ledger_is_append_only() set search_path = '';
alter function public.research_reject_product_request_event_mutation() set search_path = '';
alter function public.research_rate_limit_hit(text, integer, integer) set search_path = '';

-- Post-condition: every one of the 12 now pins search_path (empty), proven from pg_proc.
do $harden_check$
declare
  v_name text;
  v_missing text := '';
begin
  foreach v_name in array array[
    'research_fm_append_only','research_fm_checklist_touch','research_fm_esign_touch_updated_at',
    'research_fm_history_is_append_only','research_fm_identity_audit_is_append_only',
    'research_fm_signature_requires_published','research_fm_signatures_append_only',
    'research_fm_versions_guard','research_fm_versions_no_delete','research_ledger_is_append_only',
    'research_reject_product_request_event_mutation','research_rate_limit_hit'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
        and p.proconfig @> array['search_path=""']
    ) then
      v_missing := v_missing || ' ' || v_name;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'search_path hardening post-condition failed for:%', v_missing
      using errcode = '55000';
  end if;
end;
$harden_check$;

commit;
