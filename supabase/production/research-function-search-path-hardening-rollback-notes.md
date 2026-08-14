# Rollback: research_function_search_path_hardening

The migration is configuration-only: it pins `search_path = ''` on twelve
functions (eleven trigger guards plus `research_rate_limit_hit`). It creates
nothing, writes no row, and changes no grant, so rollback is the symmetric
configuration reset:

```sql
alter function public.research_fm_append_only() reset search_path;
alter function public.research_fm_checklist_touch() reset search_path;
alter function public.research_fm_esign_touch_updated_at() reset search_path;
alter function public.research_fm_history_is_append_only() reset search_path;
alter function public.research_fm_identity_audit_is_append_only() reset search_path;
alter function public.research_fm_signature_requires_published() reset search_path;
alter function public.research_fm_signatures_append_only() reset search_path;
alter function public.research_fm_versions_guard() reset search_path;
alter function public.research_fm_versions_no_delete() reset search_path;
alter function public.research_ledger_is_append_only() reset search_path;
alter function public.research_reject_product_request_event_mutation() reset search_path;
alter function public.research_rate_limit_hit(text, integer, integer) reset search_path;
```

Resetting restores the pre-migration mutable default (the advisor WARN
returns). No data or behavior change in either direction: the only two bodies
that touch tables fully qualify `public.*`, and the rest resolve exclusively
through `pg_catalog` built-ins.

Apply evidence: first applied to production 2026-08-14 via Supabase MCP
(managed id 20260814060630) after three independent adversarial body reviews;
applied a SECOND time against production 2026-08-14 ~06:20Z by the lead
(configuration-idempotent ALTERs; second apply exited clean and the migration's
own twelve-function post-condition proved the pinned end state both times).
