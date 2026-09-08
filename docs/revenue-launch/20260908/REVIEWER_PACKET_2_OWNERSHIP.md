# Reviewer packet 2 — integration ownership review

For an independent reviewer who is not Claude. Scope: the exact change
inventory `ff3c496245739233b71e46f9e5d6e26af9d57017 → 45f95dfe51ef0aa226b39413c1fbd02fc121ece8`
(190 files), judged against the trusted-base ownership policy and the reviews
that already exist for each area. The manifest mechanism records your
identity and time and binds them to hashes of this inventory; it cannot be
satisfied by a name alone, and Claude has not inserted one.

## The numbers you start from

Trusted base policy: `docs/coordination/FILE_OWNERSHIP.json` at `ff3c496`,
SHA-256 `67deb85b0a5eb3d48c58d7382502c7484674a620e41d1d8cd06995a417291fe3`,
48 rules. Against it: **167 `UNOWNED_FILE`, 0 `WRONG_LANE_OWNER`,
0 `OWNERSHIP_CONFLICT`**. Full path lists, grouped by area, in
`ownership-findings-ff3c496-45f95dfe.json`; the 23 paths the
`release-manager` lane already owns are listed there too. "Unowned" means the
base policy — written for single-lane pull requests — has no rule for the
path; it is not a defect count. Zero conflicts means no path is claimed by
two lanes, which is the one condition the mechanism refuses to reconcile.

Note for the record: all 63 commits in the range carry the machine's Git
author identity, so authorship fields do not tell you which lane wrote what.
Use the records below.

## Inventory by area, with what already reviewed it

| Area (unowned paths) | Commits | What changed | Existing review to check against |
| --- | --- | --- | --- |
| `server/research/resource-hub` (10) | `2e4fa80 e78ad91 1dabbd5 81d9f03 ee86766 6bef2a6` | Resource Hub service, stores, admin doors; PDF tokenizer scanner | B: `docs/reviews/astra-b/20260907/RESOURCE_HUB_RELEASE_CORRECTION_ACCEPTANCE.md` (scanner blob `8a66a45e…`, 80/80 + 15/15 controls); A's `docs/revenue-launch/20260907/RESOURCE_HUB_PDF_COMPATIBILITY.md` |
| `client/src/research/resource-hub` (4), `pages/adminx` (2) | `8f779d5 2aae885 1dabbd5 6bef2a6` | principal-bound operations, admin snapshot invalidation | B: same acceptance, rows `4f038410` (41/41) and rendered proof 14 steps / 45 captures |
| `server/research/index.ts`, `server/research/partners` (3), `shared/research` (3), `client/src/research/ui` (3) | `9b5e61b 6bef2a6` | locked-gate member admission and signed download door; auth return-to; partner shell | Claude's `docs/resource-hub/LOCKED_GATE_ADMISSION_NOTE.md` (19/19 probe) and B's `locked-gate-fa26224.json` (34/34) — **no independent review of `9b5e61b` itself is on file** |
| `client/src/research/pages/partners` (28), `recommendation` (6), `package.json` (+`qrcode-generator`, `jsqr`) | 17 commits incl. `6b57dae 879538a f103a7e 89187b8 83ecb3f 78ed78d 80902a0 4ab1df5 00dc439 28a9520 ba0970b` | partner page repairs; QR export | Claude's `QR_LINKS_WALKTHROUGH.md` (21/21) and `PARTNER_PAGES_SWEEP.md` (30/30, two 320 px findings) — **author-run, not independent**; B's earlier reviews under `docs/revenue-launch/astra-b/20260905/` predate these commits |
| `client/src/research/pages/member` (4), `account-portal` (9) | `e80c80d 6000270 0c0ee38 910a70f 5018013` | member and account-portal repairs | full suite only; **no rendered or independent review on file** |
| `server/research/e2e` (1), `scripts/revenue-launch` (3), `scripts/preview-resource-hub.ts` | `8d2195b 87ab355 bfa1d44 9ed2203 6c77c56 46782cd bf7b5fe` | new-account QA harness, rehearsal script, preview | B: preview rows `d95d2e4f`, `a19037d1`, `701fd585` in the 2026-09-07 acceptance |
| `scripts/acceptance` (3) | `62336a8` | reviewed-fixture registry loader, release-diff scan | `SYNTHETIC_CREDENTIAL_REVIEW_ACCEPTANCE.md`; node tests 8/8 |
| `supabase` (6) | `6bef2a6 9ed2203 6c77c56 33436c5 01ea702 46782cd` | Resource Hub migration, pre/postcheck, rollback, DAG | A's `RESOURCE_HUB_DATABASE_QUALIFICATION.md`; rehearsal 154/154 (`resource-hub-rehearsal-bf7b5fe.json`); force-RLS pg17/pg18 receipts |
| `docs/*`, `.xenios/*` (≈60) | many | records, handoffs, evidence | non-runtime; confirm none carries a secret or a real name (secret scan: 102 raw, all in test/preview files) |

Areas marked **no independent review on file** are where your time goes.
What each one actually requires (Samuel, 2026-09-08):

| Uncovered area | Examine |
| --- | --- |
| Locked-gate admission (`9b5e61b`, `6bef2a6`: `server/research/index.ts`, `server/research/partners`, `shared/research`) | The permission boundary itself — `MEMBER_SESSION_READ_PATHS`, the `memberSessionRoute` shape with `canonicalUuid`, the `if (bearer && memberSessionRoute(...))` composition — and the downstream guards (`requireMember`, `withPartner`, audience checks) that the admitted path relies on. Claude's probe (`docs/resource-hub/LOCKED_GATE_ADMISSION_NOTE.md`, 19 rows) measures outcomes; you judge the boundary. |
| Partner / member / account-portal changes (17 + 3 + 2 commits) | The changed behaviour and the tests that changed with it (`git diff ff3c496..45f95dfe -- client/src/research/pages client/src/research/account-portal`), not the empty-state screenshots. `PARTNER_PAGES_SWEEP.md` proves rendering, nothing more. |
| QR export (`client/src/research/recommendation/qr-export.ts`, `Links.tsx`, `RecommendationPrintCard.tsx`; deps `qrcode-generator`, `jsqr`) | The implemented export and its account/lifecycle handling — `safeExportRecommendation` refusing revoked/expired links, the re-check before save and print, the principal-bound cancellation path — not only that the code decodes. |

Zero ownership conflicts does not substitute for reading these; nobody
approves their own implementation.

## What to do

1. Read `ownership-findings-ff3c496-45f95dfe.json` and confirm the 190-path
   inventory matches `git diff --name-only ff3c496..45f95dfe`.
2. For each area, open the referenced review and confirm it covers the
   commits listed; for the areas without one, read the diff
   (`git diff ff3c496..45f95dfe -- <area>`) and the tests that changed with
   it, and decide.
3. Recompute the counts if you wish:
   ```
   tsx docs/revenue-launch/20260908/build-rc-manifest.mts --inputs docs/revenue-launch/20260908/rc-inputs.json --reviewer "<your identity>" --reviewed-at <ISO> --out .
   ```
   (copy the `.mts` to the repository root first; its import is
   repo-relative). It writes the manifest and the review artifact with your
   identity. Then:
   ```
   git add docs/coordination/evidence/XENIOS_HEALTH_RC_2026-09-08.integration-ownership-review.json
   XENIOS_EXPECTED_PRODUCTION_SHA=ff3c496245739233b71e46f9e5d6e26af9d57017 XENIOS_EXPECTED_HEAD_SHA=45f95dfe51ef0aa226b39413c1fbd02fc121ece8 \
   tsx scripts/acceptance/verify-release-manifest.ts docs/coordination/release-manifests/XENIOS_HEALTH_RC_2026-09-08.json
   ```
   Expected: `Release manifest accepted`. A draft run with a placeholder
   identity already produced that line; **that proved the mechanism, not
   your acceptance**.
4. Record your acceptance or your exact findings in a short note beside this
   file, and commit the manifest and artifact only if you accept.

## What acceptance means and does not mean

It means the integrated inventory was examined by someone other than its
authors against the reviews above, and no ownership conflict exists. It does
not certify the privacy scan (separate input), the browser evidence's
completeness, or production readiness.
