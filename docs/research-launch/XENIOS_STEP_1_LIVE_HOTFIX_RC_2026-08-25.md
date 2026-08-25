# Xenios Research — Step 1 live hotfix RC

Date: 2026-08-25

Production deploy: **not performed**

## Release identity

- Original prompt baseline: `5c23225fd3223c64ab2851fa31bf44969e7b702c`
- Reconciled live-code base approved for this lane: `df16b3639fbe49f39aee744d0823d01474580026`
- Branch: `hotfix/xenios-research-live-ux-performance-20260825`
- Verified implementation SHA: `6d6755313694e4d7d06ae66e078db6e6b457cfb7` (origin verified)
- Frozen deploy SHA: assigned by the final browser-gate commit and reported after origin verification; this document deliberately does not self-reference its own commit.
- Production, catalog data, pricing, payment, email, and database state were not mutated.

## Customer experience corrected

- Search, canonical Family, and customer Action filters compose before pagination.
- The customer UI no longer presents a Channel filter; the supported API parameter is still applied before pagination for compatible callers.
- Loading, empty, and recoverable error states are explicit and stale requests are aborted.
- Product cards keep the canonical action: `Add to order request`, `Request Order`, `Continue through Care`, or unavailable/held.
- The reviewed formulation hold remains fail-closed even when public copy no longer contains an internal marker.
- Quantities use the authoritative per-variant `1–100` ceiling and preserve stricter product-specific limits.
- Selection refreshes retain canonical product/variant identity and clear stale or unauthorized rows.
- Customer-scoped assisted-order state is cleared on logout and definitive unauthentication, while unrelated browser storage and outage-resumable drafts are preserved.
- Upstream status and document-provider failures are mapped to customer-safe copy.

## Authorization and integrity corrections

- Assisted-order submission now requires durable, server-recorded Early Access agreement standing before parsing or writing the request.
- A signed but revoked Early Access cookie cannot supply submission authority.
- A member can use Early Access standing only when the live Early Access customer's opaque `customerRef` is durably bound by the deployed M62 legal-binding directory to that exact authenticated `research_members.id`.
- Missing binding infrastructure, missing bindings, mismatched member IDs, revoked sessions, and binding-read failures all fail closed; email is never used as the cross-system authorization join.
- Member-only, anonymous, mismatched member/customer, revoked-cookie, and forged-agreement submissions fail before repository or outbox writes.
- Early-Access-only and matching member-plus-Early-Access submissions remain supported.
- Synthetic unbound catalog identities remain unpriced and request-only on submit, and are rejected after a reviewed Product Control binding replaces them.
- Canonical direct-purchase refusal policy is reused instead of a second local family allow-list.
- The current one-variant-per-offering pagination invariant now fails closed if the canonical topology changes.

## Validation

- Changed-file regression set after the final binding correction: **256 passed across 18 files** with one worker and no skips.
- Binding-specific regression set: **27/27** across the mounted HTTP journey and the three production-shaped pricing/viewer fixtures.
- Core-site seam protection: **32/32**; `server/index.ts` is re-hashed with an explicit minimum-diff authorization note.
- TypeScript: `tsc --noEmit -p tsconfig.json` — **pass**.
- Production build: `node script/build.mjs` with exact Node 20.19.0 — **pass**.
- Local production boot smoke with dummy, unreachable Supabase configuration — **pass/fail-closed**:
  - `/api/health` — `200`
  - `/` — `200`
  - `/research` — `503` while Research configuration is absent
  - `/api/research/early-access/assisted-orders/config` — `503` while the bridge/configuration is absent
- Full logical suite: **10,488 passed, 43 intentionally skipped** across **712 passing and 4 skipped files**. The main single-worker run excluded three repository scanners to avoid the previously observed contention timeouts (**10,469 passed, 43 skipped**); all three excluded files then passed in isolation (**19/19**).
- Independent authorization re-review: **no P0/P1 findings** after production-shaped M62 binding correction.
- Production boot smoke was rerun after the final correction and build with Node 20.19.0; the expected status matrix above passed.
- Final real-browser gate: **pass** at 1440, 1024, 768, 430, 390, 375, 360, and 320 CSS-pixel viewport widths. Every width reported document width equal to client width with no horizontally clipped interactive control.
- 200% gate: **pass** using a 1440×900 physical-browser equivalent (720×450 CSS pixels at DPR 2). Products, contact/shipping, review, all five applicable acknowledgments, and confirmation stayed within the 705-pixel scrollbar-adjusted client width with no horizontal overflow.
- Browser interaction proof: Search returned the two Wellness fixtures; Family=Research returned two fixtures; Family=Research plus Action=Request Order returned one exact fixture; Action=Care returned one exact `Continue through Care` link to `/care`; prices rendered as `$33.50`, `$99.00`, or truthful `Price on request`.
- Browser order proof: `Request Order` selected at quantity 1, an attempted 101 clamped to the authoritative 100 ceiling, the contact/shipping form and agreements completed, and the local in-memory door returned an `XRR-20260825-*` confirmation. No external provider or production state was touched.
- Browser sign-out proof: the page locked immediately; re-unlock presented a fresh unchecked agreement, no selected assisted-order item, and disabled continuation. Existing storage-isolation tests separately prove unrelated browser storage is preserved.
- Preview-composition proof: the test-only Step 1 harness refuses `NODE_ENV=production`, uses the real Early Access session/logout and assisted-order descriptor/service seams, and sends no database, storage, email, or provider traffic.
- Standalone release-gate suite repair: **53/53 passed** after supplying the server-enforced standing port that the older e2e harness had not adopted.

No tests were skipped in the focused regression set. The 43 full-suite skips are the repository's intentional skip set, not newly disabled hotfix coverage.

## Files changed and why

### Assisted-order client

- `client/src/research/assisted-order/AssistedOrderPage.tsx` — composed filters, abortable requests, truthful states, stable selection, and accessible responsive controls.
- `client/src/research/assisted-order/AssistedOrderPage.test.tsx` — filter/pagination/state/responsive/CTA regressions.
- `client/src/research/assisted-order/AssistedOrderStatusPage.tsx` — customer-safe failure presentation.
- `client/src/research/assisted-order/SecureDocumentUpload.tsx` — customer-safe upload failures and accessible status behavior.
- `client/src/research/assisted-order/assisted-order.css` — focused responsive and state styling.
- `client/src/research/assisted-order/selection-refresh.ts` and `.test.ts` — canonical selection refresh and stale-row removal.
- `client/src/research/assisted-order/storage.ts` — customer-scoped cleanup with outage-safe persistence.
- `client/src/research/assisted-order/customer-safe-errors.ts` and `.test.ts` — allowlisted public error mapping.

### Early Access client

- `client/src/research/early-access/EarlyAccessRoute.tsx` — concurrent catalog loading, deterministic rechecks, logout/expiry cleanup, and agreement-gated continuation.
- `client/src/research/early-access/EarlyAccessAgreementSection.tsx` — clears stale blocking state after verification and acceptance.
- `client/src/research/early-access/EarlyAccessRoute.agreement.test.tsx` — mounted unverified → verified → required → accepted regression.
- `client/src/research/early-access/EarlyAccessRoute.logout.test.tsx` — customer-storage cleanup, expiry, outage, and unrelated-storage negatives.
- `client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx` — canonical storefront composition and CTA negatives.

### Assisted-order server and shared authority

- `server/research/assisted-order/express.ts` — canonical live-session resolution plus exact durable M62 `customer_ref → member_id` binding; no route-projection email is assumed or trusted.
- `server/research/assisted-order/ports.ts` — durable standing/viewer identity contract.
- `server/research/assisted-order/service.ts` and `.test.ts` — standing check before input parsing, persistence, or notification.
- `server/research/assisted-order/production.ts` — production composition requires the standing authority.
- `server/research/assisted-order/production-deps.ts` — canonical durable agreement adapter requiring a live actor-bound session.
- `server/research/assisted-order/production-wiring.test.ts` — fail-closed production dependency coverage.
- `server/research/assisted-order/production-catalog.ts` and `.test.ts` — filter-before-page, canonical pathway, reviewed holds, bounded resolution, synthetic identity, and topology invariants.
- `server/research/assisted-order/http.ts` and `http-e2e.test.ts` — structured Action validation, public refusal mapping, and mounted adversarial journeys.
- `shared/research/assisted-order/action-policy.ts` — consistent customer-facing pathway projection.
- `server/research/early-access/register.ts` and `server/index.ts` — expose the canonical live-session resolver and the existing legal-binding directory to the assisted-order composition root.
- `server/research/launch/manual-order-submit-negatives.test.ts` — manual-order fail-closed contract.
- `server/research/partners/assisted-order-attribution.test.ts` — referral attribution remains intact through the hardened submit path.

### Coordination evidence

- `.xenios/CODE_OWNERSHIP.json`, `.xenios/SESSION_REGISTRY.json`, `.xenios/sessions/codex-step1-live-hotfix-20260825.json`, and the two new `.xenios/messages/*` records — heartbeat and no-deploy handoff to the active Claude sessions.

### Final browser-gate infrastructure

- `scripts/preview-step1-hotfix.ts` — production-refusing, provider-free real-browser composition over the production SPA, real Early Access session/logout, and real assisted-order descriptor/service seams.
- `server/research/early-access/step1-preview-harness.test.ts` — session, acceptance, Search/Family/Action, 100/101 quantity, XRR submission, status, and revoked-session regression.
- `server/research/early-access/preview-harness.guard.test.ts` — pins the new harness's production refusal and absence from the production entry point.
- `e2e/harness/assisted-order-door.ts` — adopts the mandatory standing dependency and makes fixture filtering match the production filter-before-pagination contract.

## Remaining latency and release risk

- The safe local fixture cannot produce a truthful production latency number. The previous live measurements remain approximately 9.59 seconds to the catalog response and 10.80 seconds to the first product.
- The dominant production latency must be re-measured against the exact deployed SHA; this work reduces avoidable client serialization and repeats but does not fabricate a live result.
- The full catalog version is currently supplied by a stable composition identifier rather than a content digest. Stale synthetic identities and current authority are still revalidated at submit, but a future catalog-version improvement should use an authoritative dataset digest.
- Multi-variant offerings are deliberately rejected by this adapter until the canonical service provides variant-level pagination.
- No production smoke order was created. The complete order journey is proven through a local production-shaped browser composition only.
- The four older provisional images remain diagnostics and are not used as final proof. The final gate is the recorded real-browser viewport, DOM-bound control, overflow, and 200%-equivalent interaction matrix above.

## Deployment gate

Samuel must review and approve the exact frozen RC SHA reported after origin verification. Only the release owner may then merge/deploy, confirm the deployed SHA, run read-only health and route checks, complete an authorized founder order smoke, review logs, and use the existing flag-off rollback path if any invariant fails.
