# Universal Access Release A — failure ledger

Status: reproduced on the current integrated candidate; no production mutation.

| # | File / test | Command | Base / candidate | Observed failure | Classification | Owner | Proposed correction / evidence |
|---:|---|---|---|---|---|---|---|
| 1 | `server/core-site-protection.test.ts` / protected seam baselines | `npm test -- --run server/core-site-protection.test.ts ... --reporter=dot` | `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` / `3e6121374b2ac4abcf69ca383e15581198716e02` | `server/index.ts` actual `sha256:f140...0f6c0` vs manifest `sha256:14ade...191c`; `server/research/index.ts` actual `sha256:729a...3ea8d` vs manifest `sha256:5c2e...4879e` | Intentional candidate seam changes, pending source-diff review; not a blind hash refresh | ASTRA-A (seam/runtime) | A must review the exact additive/referral and retired-membership diff, update the protected manifest with a dated rationale only if authorized, and rerun the seam gate. |
| 2 | `server/research/member-session-wall.test.ts` / bearer opens unlisted `GET /api/research/partner/me` | same | same / same | Received downstream `x-research-guard: member`; test expected the wall with no header | Intentional product-contract change: `/partner/me` is now an admitted member read | ASTRA-B (test) | Add `/partner/me` and `/partner/dashboard` to the exact admitted list; retain near-miss and no-bearer negatives. |
| 3 | `server/research/account-identity/b2b-sponsored-claim-sql.test.ts` / atomic activation provenance count | same | same / same | `membership.ts` has one `row.source_page === "b2b_buyer_sponsored_claim"`; test expected two | Stale assertion / inherited test drift; not safe for B to edit because the account-identity lease is held by another session | F7-PACK02 owner + ASTRA-A coordination | A/F7 owner must inspect the intended single call site and update the assertion or implementation with focused SQL evidence; no deletion or skip. |
| 4 | `server/research/e2e/account-membership-catalog.acceptance.test.ts` / approval returns 200 | same | same / same | Legacy `/api/admin/research/applications/:id/approve` returned `409 customer_approval_workflow_required` | Intentional no-membership contract change; paid approval writer is retired | ASTRA-B (test) + ASTRA-A (new handler integration) | Replace the old approval step with `POST /api/admin/research/access/approve-customer` using an authenticated admin JWT and isolated approved-customer authority; preserve separate negative coverage for retired paid activation. |
| 5 | `server/research/commerce/acceptance.test.ts` / partner self view | same | same / same | `GET /api/research/partner/me` returned `503 capability_disabled`, expected `200` | Harness/environment defect: partner portal flags are absent from the injected acceptance environment | ASTRA-B (test harness) | Enable only `AFFILIATE_SYSTEM_ENABLED=true` and `AFFILIATE_PORTAL_ENABLED=true` in the isolated acceptance env; rerun HTTP isolation assertions. |
| 6 | `server/research/commerce/acceptance.test.ts` / partner B isolation | same | same / same | partner self/dashboard returned `503 capability_disabled`, expected `404 partner_not_found` | Same isolated-harness flag defect; object-level negative remains required | ASTRA-B (test harness) | Same scoped env correction; retain the 404 and body/query-forgery assertions. |
| 7 | `server/research/commerce/acceptance.test.ts` / dashboard commission projection | same | same / same | dashboard returned `503 capability_disabled`, expected `200` | Same isolated-harness flag defect | ASTRA-B (test harness) | Same scoped env correction; rerun ledger aggregation and payout-hold assertions. |
| 8 | `server/research/commerce/production-wiring.test.ts` / disabled empty read shapes | same | same / same | `deps.partners.findByMemberId` threw `partner reads unavailable` instead of returning the documented empty `null` shape | Implementation defect in the disabled capability adapter; production-deps comments promise empty reads and no provider access | ASTRA-A (backend) | Make disabled own-partner reads return `null` / zero-safe shape without resolving a store; preserve explicit `503 capability_disabled` for mounted-but-unavailable HTTP surfaces. |
| 9 | `server/research/commerce/production-wiring.test.ts` / partner onboarding resolution | same | same / same | `findByMemberId` threw before the configured partner store was read | Test currently composes LIVE_ENV without the independently gated partner portal flags | ASTRA-B (test harness) and ASTRA-A review | Add the two portal flags to the state-3 fixture, then rerun. If the disabled state still throws, apply the backend correction in row 8. |
| 10 | `server/research/commerce/production-wiring.test.ts` / legal-name redaction | same | same / same | Same `partner reads unavailable` throw | Same state-3 fixture defect; redaction assertion never ran | ASTRA-B (test harness) | Same scoped state-3 flag correction; retain the no-PII assertions. |
| 11 | `server/research/commerce/production-wiring.test.ts` / durable dashboard links | same | same / same | Same `partner reads unavailable` throw | Same state-3 fixture defect; ledger test never ran | ASTRA-B (test harness) | Same scoped state-3 flag correction; retain ledger aggregate and link-store assertions. |
| 12 | `server/research/partners/portal-routes.test.ts` / client API route coverage | same | same / same | `PARTNER_API.self` (`/api/research/partner/me`) was omitted from the commerce-owned route set | Intentional route ownership change; `/partner/me` is mounted by commerce routes | ASTRA-B (test) | Add the admitted commerce-owned self path to the coverage set and keep exact route/method/auth tests. |

## Reproduction result

Fresh run on the current integrated branch:

```text
Test Files  7 failed (7)
Tests       12 failed | 401 passed (413)
```

This ledger is a review artifact only. It does not authorize migrations, configuration changes, deployment, price activation, live approvals, communications, payment, or shipment.

## Closure update — integrated candidate 2026-09-05

The current integrated candidate is `5d2fa0b850807ad792a3a97b598106d5326895ca` (tree `f39589a4af6bfc0e4681079579305b931d5192e7`), with ASTRA-B's reviewed partner-copy commit as this candidate's final runtime delta (source `bb40cddd366394028ee58114dc002b516f031f35`). The original twelve rows were rechecked against this source:

- Rows 1, 2, and 4–12 are closed by the protected-seam review/repin, scoped fixture and route corrections, truthful disabled partner reads, UUID-compatible partner creation, the approved-customer e2e replacement, and focused negative coverage.
- The focused integrated closure command covered 8 files and **426/426 tests passed**. The release-control-plane rerun passed **51 tests with 1 intentional skip**. The UUID-aware production-wiring file passed **68/68**, and the approved-customer e2e passed **2/2**.
- The corrected F7 assertion now matches the single centralized sponsored-B2B guard in `membership.ts`; the focused account-identity file passes **13/13** with no skip or waiver. The stale `claude-opus5-main` lease was explicitly reclaimed under the founder's scoped repair authorization and released after the correction; `F7-PACK02-RENAME` remains ready for a future migration-owner slice.
- The complete frozen-source run (`npm test -- --reporter=dot --testTimeout=60000`, validation source `d20b41726b5aa33bc380dc02678f157ed041aeaf`, observed 2026-09-05 18:33:19–18:40:43 local) finished **875 passed files, 5 skipped; 13,496 passed tests, 59 skipped; zero failures** in **444.03 seconds**. This run includes the runtime candidate `5d2fa0b850807ad792a3a97b598106d5326895ca` and the records-only/F7 assertion correction on top.
- Production customer-approval, partner-lifecycle, and Referral V1 authorities remain absent; candidate migrations and configuration remain unapplied. No deployment, live grant, notification, price activation, payment, or shipment occurred.

This closure update is evidence only and does not authorize migrations, configuration changes, deployment, price activation, live approvals, communications, payment, or shipment.

## Reconciliation route and Product Control mount — 2026-09-06

The deferred presentation is now mounted through the existing Product Control
surface. A's server projection and guarded route are in `1a3d778`; B's client
mount is in runtime candidate `9d066b18aabf8b6abc18f1b8ea73e11b22e0a1fb`
(tree `ff698f0be242d2fa4d5b1315807858d397f852f5`). The route is
`GET /api/admin/research/products/revenue-launch/reconciliation`, and the
operator must explicitly open **Review source reconciliation**. The review is
read-only and keeps unavailable, denied, malformed, and partial states
visible; it grants no source approval, price activation, purchase, fulfillment,
or evidence-writing authority.

- Server projection/route plus Product Control mount focused tests: **55/55 PASS** (Products Admin/adapter/panel **45/45**).
- Route census: **427 registrations across 418 call sites**, PASS.
- Complete suite at validation head `feffd8fad6033b8743c81302de351e1915912e40`
  (tree `f4a39bdca6c6d72fd8e78a47e2330ce1fd691f09`): **876 passed files, 5
  skipped; 13,502 passed tests, 59 skipped; zero failures** in **488.03
  seconds**.
- Clean detached browser journey remains **NOT CLAIMED** because Windows
  `EPERM/EBUSY` blocked mandatory native-module installation; synthetic
  referral boundary checks remain **12/12**.

Production authorities and candidate migrations remain absent. This update is
evidence only and does not authorize deployment, migration, price activation,
live approval, communication, payment, or shipment.


## Current closure checkpoint — integrated candidate b1fb9a5

The current runtime candidate is `b1fb9a5e64d90210b9b267214bb20fcc66e4b117`
(tree `68426af116445394a05ace33a1397eac96b4244e`). ASTRA-B's account copy
closure is integrated (**Membership, separated from Care.** and **Next billing
/ renewal**). Fable's CDP lazy-import repair is integrated; its focused
import-order/transport regression is **5/5 PASS**, and canonical evidence
checks are **28/28 PASS**. The route/Product Control reconciliation checks are
**59/59 PASS** (Products Admin/adapter/panel **47/47**; validator **11/11**),
with account-portal UX **105/105 PASS**.

The latest parallel full suite is recorded as a non-green observation under
host contention (**873 passed files, 2 failed, 5 skipped; 13,488 passed tests,
3 failed, 59 skipped; one worker-start error**). The two migration-DAG timeout
cases pass serially at 120 seconds (**2/2**) and the roster-privacy case passes
serially (**1/1**), so no assertion regression was reproduced. Fable's final
exact-current browser run remains pending; prior partial screenshots are
retained as diagnostic artifacts only and browser journey acceptance remains
**NOT CLAIMED**.

This ledger remains evidence only and does not authorize deployment, migration,
price activation, live approval, communication, payment, or shipment.


## Browser capture checkpoint — candidate 42ab494

The Chrome readiness retry is integrated at `42ab49475148df18b82927491ae7bfc86d94a42e`. Fable's clean exact-tree run emitted 20 captures (16 pass, 2 pass-with-notes, 2 fail) and a 40-file artifact inventory (`6375f764a0bd70f7ae39b4e95cad78a607478e2155970cdc2248d2ef57734747`). The only undeclared failures are the empty-orders fixture's intentional `partner_not_found` 404 at `/api/research/partner/me` for widths 1440 and 390. This is a narrow evidence declaration gap in the preview contract; it is not being generalized into a blanket 404 waiver. Fable's exact-declaration patch and rerun are pending, so browser journey acceptance stays **NOT CLAIMED**.


## Exact denial contract patch — candidate 1d46e06

The empty-orders `partner_not_found` 404 is confirmed intentional for fixture2 and is now declared only for that exact `orders|empty` state. Fable's runner and manifest patch is integrated at `1d46e068fecc4f1f555d7775fa5136f32406590f` / `d224ca1f273b7882f96d14be08a4ec95e6e5ba90`; focused tests pass **54/54**. A fresh capture is pending, so no browser acceptance is claimed yet.


## Cold-navigation blocker — exact 1d46e06 run

The exact-tree run reached the browser and passed catalog/product-detail (four captures), but stopped at first account sign-in because six Document/Fetch/Font requests did not become idle within the existing 8-second settle window. No final JSON envelope exists. Fable is investigating whether this is a reproducible preview prewarm issue; no timeout is being loosened and browser acceptance remains **NOT CLAIMED**.


## Final browser acceptance — 2026-09-06

Fable's sole-owned exact-tree capture is complete on `28e4b7802c84c01b4433040a36e622ce6bbf27de` (tree `17b204350602f8be22b6b722eddd5d5a1c421930`). The manifest at `C:\tmp\xenios-fable-synthetic-28e4b78-final-007\synthetic-journey-evidence.json` is 672,136 bytes (SHA-256 `6e123d7e1703117f262087e7f6949c5590ebeb2aabd2495d7e8c3023e56d9e8b`); its 40-file artifact inventory (20 PNG + 20 text) is SHA-256 `05e021f240db8c95e22370dca156da9ff950483db0ad6b8fbf42b653f475e377` with zero missing/extra/mismatch files.

All 20 captures completed: 16 `AUTOMATED_PASS` and four exact `AUTOMATED_PASS_WITH_NOTES` (two forged-reference denials and two no-partner denials), zero failures, all boundary assertions pass, zero truncated screenshots, and warmup PASS in 13,668 ms. The run is `completeWithExpectedDenialNotes=true`, `zeroUndeclaredFailures=true`, `externalMutations=0`, and `claimScope=UI_PRESENTATION_ONLY`; manual PII/PHI review remains explicitly pending by design.

This is synthetic local browser evidence, not production approval.
