# Resource Hub Slice 1 — selective integration manifest against the live baseline

Live account/partner runtime: `ff3c496245739233b71e46f9e5d6e26af9d57017` (Render deploy
`dep-dafcm567bikc7382rhng`). Resource Hub branch: `fable/recruiter-resource-hub-20260906`.
Merge base of the two: `096d70c17c823fa6ad3fefc7a7d72f91edd54a39`.

This is the changed-file manifest A asked for. **No merge, rebase or deployment is
authorized by this document.** The branch must not be merged wholesale over ff3.

## Method

`git diff --name-status <merge-base> <candidate>` for the Resource Hub delta, and for each
file `git diff --quiet <merge-base> ff3c496 -- <file>` to detect whether the live release
also changed it since the merge base. A file both sides changed is an overlap that needs a
hand merge; a file only this branch changed can be applied as-is.

## Overlap with ff3 (both sides changed since the merge base)

| File | Resource Hub change | Live ff3 change | Integration action |
| --- | --- | --- | --- |
| `server/research/partners/portal-production.ts` | comment block only (the resources door no longer reads `approvedLibrary()`) | strict money handling, returned-row `member_id` recheck, timestamp handling, agreement/training/organization ownership (B's INT-1) | **Do not take the branch version.** Keep ff3's file; if wanted, re-apply the four-line comment on ff3's copy. Nothing functional in the hub depends on this file. |

## Files only the Resource Hub branch changed (apply as-is onto ff3)

Modified:

- `server/research/partners/portal-routes.ts` — resources door served by the hub; new download door; `resourceHub?` dependency (default resolver).
- `server/research/partners/portal-routes.test.ts` — pins 16 → 17, hub integration tests.
- `server/research/index.ts` — one registration line + three imports (Research seam).
- `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` — seam re-pin journal entry + hash for `server/research/index.ts`. **Recompute the hash on the combined tree**: ff3 may carry a different `server/research/index.ts` baseline, and the pin must match the file as merged.
- `server/release-control-plane.test.ts` — route census pin 418/427 → 424/433. **Re-measure on the combined tree**: ff3 may have added doors of its own since the merge base.
- `client/src/research/adapters/partner.ts`, `client/src/research/adminx-section.tsx`, `client/src/research/lib/routes.ts`, `client/src/research/pages/partners/Resources.tsx`, `client/src/research/ui/shells.tsx`, `client/src/research/ui/admin-shell.test.tsx` (nav links 29 → 30; re-measure if ff3 added admin nav entries).

Added (new files, no overlap possible):

- `shared/research/resource-hub/contract.ts`
- `server/research/resource-hub/{store,supabase-store,bytes-store,service,admin-routes,production}.ts` and their tests
- `client/src/research/resource-hub/{principal-bound.ts,principal-bound.test.tsx,partner-download-principal.test.tsx,admin-principal-isolation.test.tsx}`
- `client/src/research/adapters/resourceHubAdmin.ts`, `client/src/research/pages/adminx/ResourceHubAdmin.tsx` (+test), `client/src/research/pages/partners/Resources.test.tsx`
- `supabase/candidates/20260906120000_research_resource_library.sql` (NOT applied; promotion into `supabase/MIGRATIONS.md` / `MIGRATION_DAG.json` is a separate step)
- `scripts/preview-resource-hub.ts` (preview only), `docs/resource-hub/*`

## Compatibility requirements the combined candidate must keep from ff3

- Partner identity, principal and ownership scoping in `portal-production.ts` and the
  member guards; the hub reads partner identity only through `withPartner` and never adds
  a selector of its own.
- Strict money handling and returned-row rechecks (untouched by the hub).
- Agreement/training/organization ownership checks and truthful unavailable states.
- The research API wall: the hub adds no admission; under a locked gate the partner
  resource doors answer 401 like the other portal doors (see the locked-gate measurement in
  `SLICE_1_DESIGN.md`). Admitting them is a separate, bounded wall change.

## After integration

The combined tree needs its own qualification: typecheck, build, the focused suites listed
in the handoff, core-site protection (re-pinned hash), the route census (re-measured), and a
fresh browser pass. Evidence for this branch does not certify the combined build.
