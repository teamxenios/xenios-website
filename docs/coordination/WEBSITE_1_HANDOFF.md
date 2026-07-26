# Website 1 Handoff — Assessment and Trainer Plan Intake

- Branch: `feature/research-live-assessment-and-plan-intake`
- Starting branch head: `57c48ef45c9824e6ac9d68a39f33acf9fd659108`
- Production/base main: `48cb57250c1ec54fe8714e59fa1071a9eb27f867`
- Final SHA: to be filled after commit/rebase
- Status: production-ready candidate pending Website 2 integration

## Completed

- Server-published six-section `initial-v2` plus separate monthly check-in.
- Active-member read/save/submit authorization, server autosave, optimistic revision, UTC-cycle binding, idempotent locked submission, and v1 compatibility.
- Fail-closed health-data collection requiring explicit production flag and counsel-approved immutable XR-MEM-012.
- Displayed-hash acceptance and historical withdrawal, including closed/paused privacy-rights access without reopening other member content.
- No browser-persistent health draft; hidden conditional answers use deletion tombstones.
- v2-aware deterministic recommendation logic with safety review.
- Durable Blueprint generation retry with one Blueprint per submitted response.
- Atomic publish/supersede RPC with one current Blueprint and one active monthly plan draft.
- Minimum-necessary reviewer queue/detail/action page and audit evidence.
- Member-home dominant actions for Assessment, human review, Blueprint acknowledgment, and monthly check-in.

## Migration

- File: `supabase/research-assessment-v2.sql`
- Additive/idempotent; production application is Website 2 only.
- Adds response revision/cycle, reviewer assignment, source Blueprint linkage, append-only review audit, partial unique invariants, and service-role-only publish RPC.
- Dry run: `node scripts/assessment-v2-dryrun.mjs` — 28/28.
- Apply order: after canonical assessment, Blueprint, and plan tables; before application deployment enables the new code.
- Post-apply verification: columns/constraints/indexes, forced RLS, grants, RPC execution only for service role, zero duplicates, schema reload if PostgREST does not observe the RPC.
- Rollback: disable Assessment capability/flag first; restore prior Render SHA; retain additive columns/audit history. Do not drop populated tables or rewrite submitted responses.

## Website 2 shared wiring

1. Add a lazy import for `client/src/research/pages/adminx/BlueprintReview.tsx`.
2. Register an authorized admin route such as `/admin/research/blueprint-review` in `client/src/research/adminx-section.tsx`.
3. Add the canonical route constant in `client/src/research/lib/routes.ts`.
4. Add one restrained admin navigation entry only after the route is operational.
5. Confirm the existing `registerMemberPlatformApi` remains registered; no second server registrar is needed.

## Environment

- `RESEARCH_HEALTH_DATA_ENABLED`: must remain false/unset until XR-MEM-012 is counsel-approved, published, effective, nonempty, and hash-valid.
- Existing Supabase server variables remain required. No secret value belongs in Git, issues, or chat.

## Validation

- Typecheck: pass.
- Focused candidate: 339 tests pass before final edge variants; affected final suites also pass.
- Full suite: 3,159 tests pass.
- Migration dry run: 28/28 pass.
- Build: pass.
- Local signed-out browser smoke: pass at 1440px and true 320px device emulation, with no horizontal overflow.
- Independent UX/security review: READY.
- Independent backend review: READY.
- Independent legal/privacy review: READY.

## External blocker

XR-MEM-012 is intentionally still a draft without approved content. Until approval and explicit configuration exist, the live Assessment must show a truthful unavailable/pending state and store no health-adjacent answers.
