# Ownership reconciliation - release-manifest verifier vs integration candidate 679564fc

Generated 2026-08-29 by the Claude Lead from `CONTROL/EVIDENCE/gates-679564fc-lf/13-release-manifest-x12-from-worktree.txt` (verifier run inside the pinned container; manifest lane `release-manager`).

## What the verifier checks and why it fails

`scripts/acceptance/verify-release-manifest.ts` reads the ownership policy from the TRUSTED BASE commit (`3daa3f4a:docs/coordination/FILE_OWNERSHIP.json`: 48 exact-file `write` rules naming 421 file patterns, written for single-lane pull requests). Every file in the candidate diff must match exactly one rule and that rule's lane must equal the manifest lane. The base policy predates this program entirely. The candidate changes 583 files: 100 match a base rule (80 `release-manager`, 20 other lanes), 483 match none.

Nothing inside the candidate can change this outcome: the policy is read from the base commit, so a re-baselined `FILE_OWNERSHIP.json` in the candidate tree only takes effect once the candidate itself becomes the production base. This is a governance decision, not a defect to fix in code, and it was NOT bypassed: no allowlist was widened, no rule spoofed, the manifest lane is the integrator's real role.

## Are these ownership violations?

No file outside the reviewed write zones changed without record. The core-site protection gate independently classifies every changed file (247 allowed Research/Care, 112 infrastructure, 194 test files, 3 seams with re-pinned baselines, 27 reviewed global-shell files listed for founder review), and `CONTROL/CLAUDE_INTEGRATION_LEDGER.json` records the provenance of every integrated path. The unowned files fall into the zones below.

### 483 UNOWNED_FILE by zone

| Zone | Files | Meaning |
| --- | --- | --- |
| `client/src/research/` | 178 | Research client (allowed write zone of the core-site protection manifest) |
| `server/research/` | 122 | Research server (allowed write zone) |
| `docs/review/` | 40 | Review packet (this program) |
| `client/` | 28 | Other client files (global zone - reviewed) |
| `scripts/evidence/` | 19 | Evidence tooling (helper A11Y-EVIDENCE; host-run, never bundled) |
| `shared/research/` | 16 | Research shared contracts (allowed write zone) |
| `.xenios/` | 15 | Continuity corpus (infrastructure per the protection manifest) |
| `docs/research-launch/` | 12 | Release documents (this program + prior lineage) |
| `client/src/care/` | 10 | Care client (allowed write zone) |
| `server/` | 10 | Other server files (global zone - reviewed, listed by the core-site gate) |
| `scripts/` | 6 | Other scripts (rehearsal / verification tooling) |
| `docs/research/` | 5 | Research documentation |
| `server/care/` | 5 | Care server (allowed write zone) |
| `supabase/candidates/` | 4 | Unapplied candidate migrations (FUTURE MIGRATION REQUIRED) |
| `shared/care/` | 3 | Care shared contracts (allowed write zone) |
| `config/research/` | 2 | Research runtime configuration (write zone added at ea4e294) |
| `docs/coordination/` | 2 | Coordination JSON / markdown |
| `shared/` | 2 | Other shared files |
| `client/public/research/` | 1 | Research public assets (write zone added at ea4e294) |
| `docs/care/` | 1 | Care documentation |
| `e2e/` | 1 | Test harness (infrastructure) |
| `(root)` | 1 | root-level file: tsconfig.json (hotfix lineage ES2022 target, reviewed global change) |

### 20 WRONG_LANE_OWNER (owned at the base by a lane other than release-manager)

| Base lane | Files |
| --- | --- |
| `research-application-ui-completion` | `client/src/research/pages/Apply.tsx`, `client/src/research/pages/Gateway.catalog-guard.test.tsx`, `client/src/research/pages/Gateway.tsx`, `client/src/research/pages/PolicyPage.tsx`, `client/src/research/pages/Support.tsx`, `client/src/research/pages/public-access-flow.test.tsx` |
| `v3-products-diagnostics-checkin` | `client/src/research/products-diagnostics/MemberCatalogExperience.test.tsx`, `client/src/research/products-diagnostics/MemberCatalogExperience.tsx`, `client/src/research/products-diagnostics/MemberProductDetailExperience.test.tsx`, `client/src/research/products-diagnostics/MemberProductDetailExperience.tsx`, `server/research/commerce/production-wiring.test.ts` |
| `care-tebra-security` | `server/care/review-detail.test.ts`, `server/care/tebra-fallback.test.ts`, `server/care/tebra-scheduling.test.ts`, `server/care/tebra-scheduling.ts` |
| `wave2-inventory-lot-coa` | `server/research/inventory-admin/production.test.ts`, `server/research/inventory-admin/production.ts`, `server/research/inventory-admin/routes.test.ts`, `server/research/inventory-admin/routes.ts`, `shared/research/inventory-admin.ts` |

All 20 were integrated by content from the admitted lanes (Lane 03 catalog / products-diagnostics, Lane 05 Care/Tebra, Lane 08 inventory admin, the public application UI); the base assigns them to historical lanes that no longer exist as sessions. An integration RC necessarily touches files of every admitted lane.

## Proposed safe re-baseline (takes effect at the next production base)

1. Add ONE rule to `docs/coordination/FILE_OWNERSHIP.json`: id `OWNER-RM-INTEGRATION-RC-20260828`, lane `release-manager`, mode `write`, patterns = the exact list of the 483 files (exact-file style, no globs, so no `OWNERSHIP_CONFLICT` with existing rules), with a dated rationale pointing at this document and the RC.
2. For the 20 other-lane files either retire the four historical lanes' rules (`wave2-inventory-lot-coa`, `v3-products-diagnostics-checkin`, `research-application-ui-completion`, `care-tebra-security`) and re-home the files under the integration rule, or keep per-lane accountability and accept `WRONG_LANE_OWNER` as the standing result for integration manifests.
3. Do NOT widen the core-site protection manifest; it is a separate gate and stays as is.

The proposed rule is generated alongside this document (`XENIOS_RESEARCH_OWNERSHIP_REBASELINE_PROPOSAL_2026-08-28.json`) and is NOT applied.

## Smallest approval statement

> I accept the disclosed ownership-policy result for RC 679564fc (483 unowned + 20 other-lane files, all within the reviewed zones above) and authorize the release-manager ownership re-baseline in `docs/coordination/FILE_OWNERSHIP.json` per `XENIOS_RESEARCH_OWNERSHIP_RECONCILIATION_2026-08-28.md`, to take effect at the next production base.

Until that statement is given, the release-manifest verifier's ownership check is reported as FAIL-by-policy in every document; nothing else in the manifest fails (schema, identity, exact file inventory, routes, tests).
