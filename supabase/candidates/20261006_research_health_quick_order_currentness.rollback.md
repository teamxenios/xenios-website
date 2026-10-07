# Currentness candidate rollback draft

SOURCE ONLY. Not executed, registered or qualified. A future installation or
rollback needs its own exact-source action authority; this document grants none.

This candidate adds two tables and six owner-only functions. It creates no role,
trigger (including an FK trigger), public table grant, active seed, writer guard
or commit RPC. Revisions are immutable through its callable surface. A table
owner or superuser can bypass those restrictions; this is not an administrator
tamper-resistance claim.

The future verifier requires these arguments in this order (this is invocation
documentation, not execution authority): `--allow-disposable-currentness`,
`--receipt <path>`, `--receipt-sha256 <64 lowercase hex>`,
`--source-commit <40 lowercase hex>`. The receipt must be a regular source record
directly in the owned `docs/health-launch/quick-order-20261005/evidence/` directory.
Its externally supplied digest covers its raw bytes. Its exact JSON keys are
`schemaVersion`, `sourceCommit`, and `files`; schemaVersion is
`quick-order-currentness-source-receipt-v1`. Each file entry has exactly `path`
and `sha256lf`. File digests cover UTF-8 bytes with CRLF normalized to LF, retaining
all other whitespace. No receipt includes its own hash. The receipt is produced
after a source commit, and each consumed file must match both that commit and
the checkout. Historical predecessor bindings are separately checked at their
recorded `base`; amended tests use their final source hashes in the receipt.

The exact required path set is the deduplicated union of:

- All 55 `inventory[].path` entries in
  `docs/health-launch/quick-order-20261005/evidence/review-599-repair-bindings-20261007.json`,
  plus that JSON file itself.
- These five currentness candidate/precheck/postcheck/rollback/verifier files.
- Every literal entry of the verifier's `BASELINE_SQL` array. Besides paths
  already in the 55-entry inventory, those are the disposable bridge bootstrap,
  `20260930191323_research_assisted_order_quote_payment_guard.sql`,
  `20260930205725_research_assisted_order_quote_access_finance_bound.sql`,
  `20261001040349_research_assisted_order_quote_audit_store.sql`, and
  `20261001044200_research_assisted_order_quote_history_reissue.sql` (the four SQL
  files are under `supabase/migrations/`; the bootstrap is under
  `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql`).

The verifier creates `extensions`/`pgcrypto` only in its own empty, no-network
container. The existing bridge bootstrap supplies three synthetic NOLOGIN roles;
the later notification source's extension creation is `IF NOT EXISTS`. It uses
actual canonical migrations and integrity RPCs, without changing their bytes.
No existing container is reused. A unique name and ownership label are recorded
before launch; cleanup removes only a container verified against both. A missing
ID after interrupted creation cannot authorize an unverified removal. Unresolved
cleanup is reported as a failure with the synthetic invocation identity.

Publication records hashes and references, retains `held`, and does not attest
that the referenced files exist or are applicable. `read_current_authority()`
always reports unavailable, including with a manually active head. The reserved
writer epoch is not proof of coordinated writers in this slice.

Before a future rollback, bind all source files in
`docs/health-launch/quick-order-20261005/evidence/review-599-repair-bindings-20261007.json`
and separately bind these five new currentness files. The four added historical
sources are the evidence-corrections and history-immutability migrations, the
notification-outbox source and the registered status-recovery migration. Their
bindings and the exact nineteen O/A trigger states (requests 8, events 7,
outbox 4) must remain unchanged.

The pre/postchecks require session setting
`research_health_quick_order.currentness_definition`: SHA256 of the UTF-8
candidate's `$currentness_install$` contents followed by its
`$currentness_fingerprint$` contents, preserving the enclosed leading/trailing
whitespace and normalizing CRLF to LF. Compute this from the reviewed source,
never from a database comment. The companion verifier contains that extraction.

Run the exact precheck before the rollback block below, with that setting bound.
It independently compares definitions, ownership, table/column ACLs, RLS,
constraints, indexes, rules, triggers and policies against the installed seal.
It calls the actual `research_assisted_order_provider_settlement_integrity()`
and requires the exact nineteen canonical triggers and their O/A states.

If any revision or head history exists, this destructive rollback **refuses**.
Use the owner-only revoke function to keep an existing published revision held;
retain every revision and head record for a separately reviewed retention or
recovery plan. Do not delete rows to make the empty-install rollback pass. No
request, receipt, intake, outbox, canonical table or historical SQL is changed.

For an exact empty installation only:

```sql
-- CURRENTNESS_EMPTY_ROLLBACK_BEGIN
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path='';
do $empty_currentness_rollback$
declare expected_definition text := current_setting('research_health_quick_order.currentness_definition',true);
  predecessor text;
begin
  if expected_definition is null or expected_definition !~ '^[0-9a-f]{64}$' then
    raise exception 'Reviewed currentness definition binding required' using errcode='55000'; end if;
  perform public.research_assisted_order_provider_settlement_integrity();
  predecessor := public.research_assisted_order_provider_schema_fingerprint();
  perform public.research_health_quick_order_currentness_integrity();
  -- Serialize against publish/revoke before testing retained history. A row
  -- committed while this lock waited must be visible to the following check;
  -- do not let DROP become the first lock after an earlier empty observation.
  lock table public.research_health_quick_order_authority_head,
    public.research_health_quick_order_authority_revisions in access exclusive mode;
  if obj_description('public.research_health_quick_order_authority_head'::regclass,'pg_class')
    is distinct from 'RHQOC_HELD_V1:'||expected_definition||':'||
      public.research_health_quick_order_currentness_schema_fingerprint() then
    raise exception 'Quick Order currentness definition drift' using errcode='55000'; end if;
  if exists(select 1 from public.research_health_quick_order_authority_revisions)
    or exists(select 1 from public.research_health_quick_order_authority_head) then
    raise exception 'Retained currentness evidence prevents destructive rollback' using errcode='55000'; end if;
  perform set_config('research_health_quick_order.rollback_predecessor',predecessor,true);
end
$empty_currentness_rollback$;
drop function public.research_health_quick_order_publish_revision(jsonb);
drop function public.research_health_quick_order_revoke_revision(uuid,text);
drop function public.research_health_quick_order_read_current_authority();
drop function public.research_health_quick_order_currentness_integrity();
drop table public.research_health_quick_order_authority_head;
drop table public.research_health_quick_order_authority_revisions;
drop function public.research_health_quick_order_currentness_valid_publication(jsonb);
drop function public.research_health_quick_order_currentness_schema_fingerprint();
do $after_currentness_rollback$
begin
  perform public.research_assisted_order_provider_settlement_integrity();
  if current_setting('research_health_quick_order.rollback_predecessor') is distinct from
    public.research_assisted_order_provider_schema_fingerprint() then
    raise exception 'Canonical fence changed during rollback' using errcode='55000'; end if;
end
$after_currentness_rollback$;
commit;
-- CURRENTNESS_EMPTY_ROLLBACK_END
```

Run the exact precheck again to check the unchanged canonical trigger/fence
inventory. It permits absence but does not require the absent state. The verifier
separately requires zero `pg_proc` and `pg_class` rows matching its function and
relation predicates; it does not enumerate all eight named objects or separately
assert absence of `pg_type` leftovers. It also compares the complete canonical
schema fingerprint across install, reapply and rollback. No `CASCADE`, schema
reset, fingerprint resealing, canonical grant repair or guard replacement is
permitted.

Atomic commit, source-writer currentness, competing writers, revocation ordering,
expiry while waiting, and liveness are **HELD / NOT IMPLEMENTED**. A successful
empty-install rollback or held-publication check does not qualify them, managed
Supabase, production Auth, real notifications, live intake or deployment.
