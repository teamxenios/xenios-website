# Product subscription intent source seam, 2026-10-05

Status: focused component/service checks, typecheck and bounded synthetic browser checks passed as qualified below; ready for independent Claude review. **Not a live or end-to-end buying path.** The mounted product page truthfully reports that an offer is unavailable; no real SKU, price version, payment method or partner activation was inferred.

## Identity and boundaries

- Session: `codex-product-subscription-intent-20261005`; task: `PRODUCT-SUBSCRIPTION-INTENT-20261005`.
- Branch: `codex/product-subscription-intent-20261005`.
- Worktree: `C:/Users/sboad/.codex/worktrees/5b21/xenios-website`.
- Verified base: `b0e818f0b3908b13c4181c5b6a59751c1505694b`, tree `e56e6406354ee8cc9dd1c600563df58409afdc34`; `origin/codex/xenios-health-launch-implementation-20260930` matched at startup. Core runtime source is `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0`.
- Final pushed source: `7806fb5939a69189e085739fad8cc832cfab201a`, tree `10d7d2534f155f5fccdeb7c3c15bfc450d379c5d`. Subsequent commits contain evidence/continuity only.
- Coordinator `01a103a8-5684-7272-89e5-3c42eefcd593` authorized this isolated source lane and then the exact `ProductPage.tsx` wrapper. D/E `01a10d08-cd8b-7431-80b7-a21677c11bb6` explicitly confirmed that wrapper unclaimed. Its member catalog/media/shared contracts and `MemberProductDetailExperience.tsx` remain untouched.
- Core's separate public `/partners` sign-in returnTo correction is not duplicated or merged here. Its source is `94e89be7c959087edfde4ebddf2f50fa5e02cc36`, tree `23b3284a5cfc667b5cdc0e35643f07e71c333268`; remote handoff tip `3f044f41b93d41c4ca40954eabd919dfb6ef0be4` was verified with `git ls-remote`. Report: `docs/health-launch/PARTNER_SIGNIN_RETURN_20261005.md` on `codex/xenios-partner-signin-return-20261005`. Core reports 205 focused synthetic tests, not browser/live login proof; independent review remains separate. Finance remains parked. No protection manifest, authority, SQL, server production source, or capability flag was changed.
- Production was not re-observed by this source lane. The base corpus's dated `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` observation is historical evidence, not a current readiness claim.

## Implemented slice

The existing `createSubscription` adapter is extended, not replaced. It sends only `sku`, `quantity`, `frequencyDays` and the presented `priceVersion`, preserving canonical auth and same-origin cookies. Extra runtime payment, identity, attribution, shipping and state fields cannot enter the request through this adapter. Success requires the canonical success envelope and a matching pending version-1 DTO with null charge/shipment dates. The returned object is projected explicitly so private extra fields cannot leak through.

`ProductSubscriptionCreate` reviews an exact server-supplied presentation snapshot, requires eligible/purchasable product metadata and a positive displayed price/version, supports the current shared quantity band (1–50 at this source) and 30/60/90 days, and resets review when selections change. The displayed subtotal is informational, not a final quote or verified price lock. It calls no payment, activation or renewal method. A valid response says pending request, not completed purchase. Explicit denials preserve the selections without displaying internal persistence details.

Creation currently lacks server-side idempotency. Double submission is blocked. Lost, unavailable, malformed or mismatched replies are outcome-unknown and lock resubmission for this component's lifetime. The guard survives token rotation and product metadata rerenders; private receipts and selections reset across principal/product scopes. An adversarial review found and corrected the initial keyed-remount retry hole. Navigation, reload, cross-tab duplication and a future page loading/refetch unmount still require a durable backend contract; this UI guard does not solve them.

The mounted `ProductPage.tsx` uses only the existing canonical member catalog. It has no authoritative subscription offer projection, so it supplies no offer and cannot POST. A visible price, cart selection, extra response field, historical membership record or image does not grant subscription eligibility. The unavailable panel mounts only on a resolved Research product detail, not a non-Research detail or failed product load.

## Exact source/test paths

- `client/src/research/adapters/commerce.ts`
- `client/src/research/adapters/product-subscription-create.test.ts`
- `client/src/research/product-subscriptions/ProductSubscriptionCreate.tsx`
- `client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx`
- `client/src/research/pages/member/ProductPage.tsx`
- `client/src/research/pages/member/ProductPage.subscription.test.tsx`
- `server/research/commerce/subscription-intent-journey.test.ts`

Other changes are this report, its evidence directory, the new session/task/lease entries, and its exact-SHA handoff. The delegated `subscription_boundary_tests` subagent wrote only the new service test; root owned the other edits. Partner/referral and adversarial subagents were read-only.

## Partner readiness matrix at the verified base

| Requirement | Source result and evidence | Limit |
| --- | --- | --- |
| Sign in using canonical Auth | Existing guard resolves member identity; `commerce/routes.ts:604–645` selects the existing partner. | Core owns the separate public entry-link returnTo correction. No real login/account creation here. |
| Owned dashboard independently of commerce | `commerce/production-deps.ts:1706–1716` overlays `createOwnPartnerReads`; missing/unavailable partner are distinguished. | Requires configured durable partner storage and an existing relationship. |
| Inactive/non-partner response | `pages/partners/Dashboard.tsx:61–72` gives lifecycle-specific next actions; referral tools require active state at 206–212. | No self-activation or new gym-owner role. |
| Link/code/QR and reporting | Existing owned reads and `pages/partners/Links.tsx` issue/revoke/copy/QR paths recheck eligibility. | No new reporting authority or payout permission. |
| Disclosure/agreements remain gated | `referral-v1-routes.ts:125–142` uses the guarded subject and closed body. Candidate referral SQL around 537–560 checks lifecycle/clearance/certification; `partners.ts:758` checks activation requirements. | Share reads trust canonical lifecycle markers, not a fresh agreement join on every read. Managed SQL proof was not rerun. |

## Referral readiness matrix at the verified base

| Requirement | Source result and evidence | Limit |
| --- | --- | --- |
| Landing capture and auth survival | `partners/referral-v1-routes.ts:162–202` captures the winning durable touch; `members.ts:330` invokes guarded binding; `referral-v1-attribution.ts:52–61` reads canonical account ownership across devices. | A same-origin cookie in a subscription POST alone proves no subscription attribution. |
| Self/unknown/revoked referral refusal | Route tests cover unknown/revoked links; attribution tests cover self-referral and conflicting cookies. | The bounded route tests use a mocked store. |
| Idempotence | Link issue/revoke tests reuse retry keys; concurrent durable capture/binding checks exist in `referral-v1-database.test.ts:101`. | No new database/concurrency run in this lane; do not equate client retry-key reuse with durable deduplication. |
| Assisted request attribution | `assisted-order/http.ts:266–283` resolves server authority; `service.ts:645–646` ignores browser attribution. | Existing request/order lineage only. |
| Product subscription attribution | **Missing** from `subscription-transition-contract.ts`, subscription row mappings and production create adapter. | Requires canonical binding-revision lineage captured durably with intent creation. |
| No price/eligibility authority from referral | Closed referral body and server resolution remain unchanged; new subscription POST has no referral or amount field. | No new composed subscription attribution proof. |
| Care and money | Commission schedule ledger tests reject Care revenue and exclude Care basis from mixed settlement; referral routes reject money fields; ledger refuses missing canonical order projection. | Separate domain guarantees, not a composed Care capture → every-ledger proof. Capture/binding alone does not create a paid commission or payout. |

## Product subscription readiness matrix

| Step | Status |
| --- | --- |
| Real eligible SKU / exact offered plan | Owner choice outstanding; no product invented. |
| Mounted authoritative eligible offer and price version | Missing canonical read projection. Actual page remains unavailable. |
| Exact variant review + quantity/frequency | Implemented reusable component; exercised only with explicit synthetic offer fixtures. |
| Canonical create request | Existing endpoint/adapter reused; request and response boundaries hardened. |
| Production intent persistence | Refused by `purchaseExpansionPersistenceAvailable`, enabled only under explicit test wiring in production composition. |
| Test-only pending intent | Canonical service proof checks pending state, null schedules/references, ownership, refusal and no payment operation. |
| Payment/activation | Unavailable; no client activation or payment method. Current service activation lacks independent finality/agreement qualification and must remain dark. |
| Renewal | Production reference resolver returns null, inventory is empty and no production `evaluateRenewal` caller was found. |
| Full referral → paid recurring product journey | **Not ready and not claimed.** |

## Smallest next source slices and owning seams

1. **Create idempotency and atomic currentness persistence:** extend `server/research/commerce/subscriptions.ts`, `persistence/subscriptions-store.ts` and `subscription-transition-contract.ts` with an intent command scoped to member/exact variant/price version and a durable key/result. Canonical activation/price checks and write must share the transaction/CAS boundary. A separately owned candidate and local disposable proof are needed; no managed apply is authorized. Keep the production seam false until qualification.
2. **Current price and offer projection:** coordinate D/E's `shared/research/member-catalog.ts` and catalog projection/service with the commerce owner. Expose subscription eligibility only from approved canonical data plus an exact buyer/variant price version. Existing `CatalogProduct.subscriptionEligible` is metadata; the legacy adapter currently sets it false. Do not derive it from cart/media/readiness or serialize an invented `priceVersion`. Create currently accepts a nonempty string and copies it without current-price comparison; that is not a verified price contract.
3. **Canonical referral intent lineage:** coordinate the referral owner to resolve the authenticated account binding and snapshot its revision in the same durable create command. Extend the canonical subscription persistence path; never accept browser partner/referral ownership. Prove self/referral denials, idempotent capture, immutable winning attribution and no money effect before adding any order/renewal commission bridge.
4. **Enrollment/activation finality:** Finance owner must qualify current agreements and independent payment authority before `activate()` can schedule anything. The service's current actor/currentness checks are not sufficient payment proof. Do not send typed references, invoke activation from the client, or enable renewal. F1 remains open.
5. **Actual page wiring and composed synthetic browser journey:** after the accepted offer/create contract, feed the exact selected variant to this component and keep its attempt guard mounted through product refetches. Integrate Core's accepted partner returnTo handoff and accepted D/E media separately through the coordinator. Then prove referral/login/selection/pending/payment refusal on composed source, followed by independent Claude review.
6. **Quantity policy reconciliation:** `PERSISTENT_CART_QUANTITY_MAX` currently imports the effective 50-unit cap from `shared/research/early-access-quantity.ts`; the separate policy constant is 100. This source uses 50, matching `MAX_SUBSCRIPTION_QUANTITY`, and visibly states that limit. The historical migration comment is not fresh production evidence. The quantity/persistence owner must qualify the actual durable chain and align the effective band before offering 100; this lane changed no shared limit or schema.

## Owner/external decisions

- Which real SKU/variant(s) are subscription-eligible and live; any real lower quantity limit.
- Actual commercial price/version and plan terms. Historical membership prices are not authority.
- Which existing partner/gym, if any, should be activated through the governed lifecycle.
- Current commission schedule/payout terms if not already governed. No percentage or policy invented here.
- Payment provider, independently verifiable finality, activation and renewal workflows.
- Separate paid membership is excluded by the existing founder removal decision; a new explicit business decision would be needed to reintroduce any such offer.
- Existing exact protected-hash approval and GATE-01 remain outside this lane.

## Qualification evidence

All runs used `C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe` (v20.19.0). Existing dependencies were reused through a junction to worktree `65aa`; both lockfiles have SHA-256 `d3083edc542cd123d839611dfd0b214fcd03ee5c04fa89323da73bbe37c332c8`. No installation. The coordinator handed off one serialized slot after D/E; it was released after preview cleanup.

| Run | Exact provenance | Result |
| --- | --- | --- |
| `focused-run1` | `5d658a24f9a37b82d9674d806ce343da48787247`, tree `37d7a76a833d3df0a8e0026619b88bd5e5a145c2`; only new evidence wrapper untracked at start. 17 named files, one worker, no file parallelism. | **396 PASS / 3 FAIL / 0 SKIP**, exit 1, 52.570 s wrapper / 50.00 s Vitest. Three new success fixtures incorrectly requested 100 against the current effective cap of 50. The component correctly refused; other 16 files passed (377 tests). Initial failed receipt is preserved. |
| `corrected-ui-run2` | Same committed head, corrected form tests and visible quantity-band label in working tree; subsequently committed unchanged in `7806fb5`. | **23 PASS / 0 FAIL / 0 SKIP**, one file, exit 0, 2.49 s Vitest. Shared limit used for successful maximum; 51 and 100 are explicitly refused. |
| `typecheck-run1` | Clean source `7806fb5939a69189e085739fad8cc832cfab201a`, tree `10d7d2534f155f5fccdeb7c3c15bfc450d379c5d`; `tsc --noEmit --incremental false`. | **PASS**, exit 0, 105.273 s. Nonincremental mode avoids writing the shared dependency cache. |
| `browser-preview-run1` | Same `7806fb5` source/tree. Only evidence files untracked. Tiny esbuild fixture bundle, not a production application build. Chrome via supported browser controls against loopback port 60673. | Pending, persistence denial, lost reply, actual unavailable ProductPage and no-offer observations passed. Process subsequently stopped deliberately by verified PID; wrapper exit `4294967295` records forced cleanup, not a test-pass exit. |

The successful test coverage is **377 unchanged-suite passes plus 23 corrected-form passes**, across 17 unique files. This is split-run evidence, not a fabricated single 400-pass aggregate. No full suite, database race suite, managed qualification or production build was run. `git diff --check` and corpus validation passed. `invariants.json` records identical Navbar/Footer/index.css/protection-manifest hashes against the frozen base; this does not repair inherited protection or GATE-01 findings.

Full commands, source/tree/start status, timing, exit codes and raw-log hashes are in the run JSON files under `docs/health-launch/evidence/product-subscription-intent-20261005/`; the matching raw `.log` files are retained. Initial focused log SHA-256: `526e9f01702070e088a27acd2214c5220f9cae4b971d790cc5ef07d6759abb5f`.

### Synthetic browser limits and observations

- Real `ProductSubscriptionCreate` → real canonical adapter → local HTTP → real `createSubscriptionService` with an in-memory repository. Only the fixture enables its persistence seam for pending/lost cases; the blocked scenario leaves it false. App boot, production composition and `.env` are never loaded. Auth supplies a conspicuously synthetic context; Supabase browser imports are replaced with throwing fixture stubs and the bundle rejects managed SDK input.
- Pending: exact synthetic SKU, quantity 2, frequency 60; displayed pending receipt, null charge/shipment dates, no payment capability. Controls disabled after save.
- Blocked: quantity 3, frequency 90; canonical `capability_disabled` refusal displayed without internal storage text. Selection retained; no additional record created.
- Lost reply: fixture saved one pending record then returned HTTP 503. UI showed outcome unknown and disabled resubmission. The inspection link showed the pending record through the canonical list reader. That inspection surface is explicitly a fixture, not the real subscription manager.
- Actual `ProductPage` mounted with a synthetic canonical member-detail response and no authoritative subscription offer. It rendered the unavailable panel with **zero create buttons**. The generic no-offer component likewise rendered no form.
- `browser-domain-proof.json`: exactly three browser POSTs (pending/blocked/lost), two pending records, all schedules null, empty event arrays, zero instrumented payment probes. Commission/payout integrations are absent (`not_connected`), not measured downstream ledger activity. No subscription referral attribution exists.
- `browser-*.txt` are captured DOM observations; PNGs show the pending, blocked, lost and mounted boundary states. A first full-page screenshot attempt timed out at 5 seconds; normal viewport captures succeeded. No width, native zoom, overflow, visual-fidelity or full App/auth/session qualification is claimed. Fixture CSS is deliberately separate from production styling.
- Browser tab closed. Verified pinned Node PID `62120` was the `browser-preview.mjs` listener on `127.0.0.1:60673`; it was stopped and the listener's absence verified. The temporary compiled fixture directory remains local and unused. No hosted connection or other process was stopped.

The complete gym-owner → referral → authenticated customer → attributed paid subscription journey remains **unproven and blocked** by the missing canonical offer/create/attribution/payment seams above. These component/domain proofs are not relabeled as that journey.

No live payment, payout or provider capability was enabled. No deployment, managed SQL apply, production/staging mutation, real account, partner grant/activation, charge, email, shipment or payout was performed.

## Exact-SHA continuation checkpoint

```text
[ACCOUNT SWITCH HANDOFF]
SESSION ID: codex-product-subscription-intent-20261005
MODEL: GPT-6 Astra (requested Ultra lane)
ROLE: isolated source worker; no integration/release authority
TASK: PRODUCT-SUBSCRIPTION-INTENT-20261005
BRANCH: codex/product-subscription-intent-20261005
WORKTREE: C:/Users/sboad/.codex/worktrees/5b21/xenios-website
BASE SHA: b0e818f0b3908b13c4181c5b6a59751c1505694b
FINAL PUSHED SOURCE SHA: 7806fb5939a69189e085739fad8cc832cfab201a
SOURCE TREE: 10d7d2534f155f5fccdeb7c3c15bfc450d379c5d
PUSHED EVIDENCE SHA: 03b72f8786905789066d5310039557bc2951b72a
EVIDENCE TREE: 47dc47c08f3dbf6cb555facecb2e8aff39946a06
SESSION STATE: handoff_ready; task qa; exact lease no longer active
DIRTY WORK: none after final continuity commit
TESTS: 377 unchanged-suite passes + 23 corrected-form passes; initial 396/3 failure retained
TYPECHECK: PASS at clean 7806fb5, nonincremental
BUILD: no production build; bounded synthetic fixture bundled
BROWSER: bounded pending/refusal/unknown/no-offer/actual ProductPage proof, not full journey
MIGRATION: none; no schema change or apply
PRODUCTION MUTATED: no
NEXT EXACT TASK: coordinator routes this exact source/evidence to existing Claude review; do not activate the form with invented offer data. Then assign the durable create idempotency/currentness slice before offer/referral/payment wiring.
NEXT FIRST COMMAND: git fetch origin codex/product-subscription-intent-20261005
FILES NOT TO DUPLICATE: seven source/test paths listed above; Core partner returnTo and D/E media remain separate accepted-handoff integration work
FOUNDER ACTION: existing SKU/price/partner/payment/quantity and protected release decisions above; no new blanket GO requested
```

Core owns the still-active global PROJECT_STATE/RELEASE_STATE/DECISIONS/BLOCKED_EXTERNAL/FOUNDER_ACTIONS lease. This worker did not overwrite those records; its task, session, exact-path lease and this handoff preserve the new truth for the coordinator to reconcile. All subagents finished; no local preview or test process remains active for this lane.
