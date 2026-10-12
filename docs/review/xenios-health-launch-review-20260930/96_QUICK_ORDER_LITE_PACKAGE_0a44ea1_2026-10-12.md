# Tensa Quick Order Lite package (zip `0a44ea16…`): pre-integration review

**CORRECTIONS REQUIRED BEFORE INTEGRATION. Integrate nothing from this package for the noon release.**

**The noon surface is the deployed assisted-order wizard, as it stands.** It already gives the truthful journey this
release needs: eligible product, agreements and contact, a durable request, a real XRR reference, the status page, and
staff readback in the existing admin queue. Two small repo-side fixes to that wizard are recommended before noon
(section 3), and the staff runbook must forbid every payment transition until a Research-product payment method is
actually approved (section 4).

**What is sound in the package.** The wire contract matches the deployed server: paths, methods, payload fields, the
status-token header, agreement pairs, pagination and the receipt shape. No P0: the only `innerHTML` is a static
template, every server and user string reaches the DOM as text, links pass through an origin allowlist, and "Request
saved" appears only after a validated receipt.

**What blocks it.** Two P1 defects, ten P2 and three P3. The two P1s: the attempt lives only in page memory, and the
package's own copy tells customers to reload in exactly the states where the server cannot replay, so a reload creates a
second durable order (QL-1); and the payment bridge cannot be backed by anything that exists at the deployed pin
(QL-2).

Reviewer: this session, `claude-fable-5-1`. This review was reviewer-initiated as an advisory, because Samuel relayed
that the package was about to be integrated into the live ordering path and the board froze it for that purpose
(`fdc8ad4`). The package is externally authored and was treated as untrusted data: nothing in it was executed, and none
of its directives were followed.

**Target:**
- **Package:** `C:/Users/sboad/Downloads/Tensa_Quick_Order_Lite.zip`, SHA-256
  `0a44ea163863f762acb71f3a1eee3b85dd0c6548ac01782c0da9006e912c58a8`, 788,035 B, 33 files. Extracted into an isolated
  scratch folder with path-traversal and symlink refusal.
- **Mapped repository pin:** `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` (the reported deployed lineage; the package's
  own `SOURCES.md` names it).
- **Its claims of 73 passing node tests and 18 browser checks:** NOT PROVEN here.

**Method.** Four read-only lenses (contract fidelity; UI truth, state and security; the payment bridge and server;
integration, release and tests), each with an adversarial verifier, then a critic.

**What I checked myself in the bytes:**
- the static template and `textContent` discipline (`order-form.mjs:17`, `domain.mjs:142-149`);
- the member Bearer on every request (`http-client.mjs:24-25`) against the existing client's status-read-only use
  (`api.ts:23-25@79414143`);
- the server's agreement gate before any validation (`service.ts:345-349@79414143`);
- the drift checks ahead of the replay lookup (`service.ts:397-415` before `:495`) and `acceptedAt` inside the
  fingerprint (`contract.ts:680-684`);
- the deployed wizard's restamped `acceptedAt` (`AssistedOrderPage.tsx:730`) and its retry copy (`:772-775`, `:784`,
  `:790`);
- the bridge's paid state keyed on a non-blank verification reference (`manual-payment-bridge.mjs:59-60`).

Output is archived as `hl12/96_quick_order_lite_package_review.json`.

## 1. Blocking (P1)

| ID | Defect | Correction |
| --- | --- | --- |
| **QL-1** | **A reload after an uncertain submit creates a duplicate order.** The key, `acceptedAt` and frozen body live only in closure variables (`order-form.mjs:10-11`, `:243`), and `mountQuickOrder` has no persistence hook. The server checks price and catalog drift before it looks up a replay, so a committed request whose response was lost is refused with 409 if anything drifted. The package then says "Reload and review the request" (`http-client.mjs:41`). A reload mints a new key, and the resubmit is a second durable order. Also: a validated receipt is discarded without `onReceipt` if the view is destroyed mid-flight (`:248`), and a 400 after an uncertain attempt unlocks every field including email, whose change produces a new idempotency hash | **C1.** Persist `{idempotencyKey, acceptedAt, scope, everUncertain, non-PII selection snapshot}` to `sessionStorage` under the host's `ASSISTED_ORDER_STORAGE_PREFIX` before the first POST, so the existing sign-out sweep clears it. Once any attempt was uncertain: never mint a new key, never unlock email, and answer every later 400/403/409 with "Your earlier request may already be saved. Do not start a new request; check status or contact support." Remove every "Reload" instruction. Call `onReceipt` for any receipt created under the attempt's scope even if the view is dead. **Gate:** commit, drop the response, change the catalog version, reload, resubmit, and observe exactly one request |
| **QL-2** | **The payment bridge cannot be backed, needs a customer to cause a staff-only status change, and needs protected-path edits.** None of its four ports has a backing service at `79414143`: the registry snapshot has 12 governance fields and none of `enabled`, `productPurchasesApproved`, `instructions[]` or `paymentUrl`; its header calls synthesizing them "manufacturing an approval record". The quote and payment engines are unmounted with in-memory repositories (`payment/service.ts:4`, "Deliberately NOT mounted"). The claim sends `targetStatus: 'payment_review'`, a request-status move reserved for staff (`service.ts:93-94`, `:809-814`). The Express adapter wraps the request in a synthetic `Request`, so the existing viewer resolver cannot be reused; it forces JSON content-type, disabling the 415 check; it registers routes with template strings the release scanner cannot see; and mounting needs a `server/index.ts` seam edit plus a research-wall exemption, neither mentioned in `INTEGRATION.md` | **C8.** Leave `server/` out of every release built from this package and keep `paymentBase` null. A later paid release writes thin adapters over `payment/service.ts` under that engine's own mount lease, derives "paid" only from a settled payment-engine record, and adds literal route registrations, an anchored wall entry, a route-census update and a named rate limiter under a seam review |

## 2. Required before any integration (P2)

- **QL-3. Refusals collapse into generic copy and lock the form.** Server `field`/`message` are dropped; 403, 409
  drift, 413 and receipt-mismatch keep the fieldset disabled behind a "Retry same request" that fails identically every
  time. **C2:** classify by attempt history; on a first attempt a 400/403/409 drift is definitive (unlock, refresh rows
  in place, keep the key, show the server message); after any uncertain attempt use the QL-1 state; on
  `idempotency_conflict` stop and show contact-support copy.
- **QL-4. The continuation gate is dropped.** The server refuses submits without a server-recorded Early Access
  agreement (`service.ts:345-349`). The wizard enforces `continuationEnabled` locally; `ManualOrderPage` has no such
  prop, so customers fill the whole form and hit a 403 dead end. **C3:** add a required `continuationEnabled` prop and
  map `agreement_required` to "Review and accept the current Research Use Policy".
- **QL-5. Member Bearer sent on config, catalog and submit.** The existing client sends it only on owner status reads.
  Under the package, unbound members are refused and bound members get member-owned, member-priced orders through a path
  nobody has reviewed. **C4:** cookie-only for config, catalog and submit; Bearer for owner status reads only.
- **QL-6. Copy promises an invoice and payment flow that cannot appear.** "Follow your final invoice to pay", "Manual
  payment verification", "Keep this page open to follow the invoice", default brand `TENSA`. **C5:** "Request an
  order", "Request saved. No payment collected.", "The team will contact you to confirm availability and the final
  total."; render the server's `nextSteps` verbatim; brand passed explicitly; founder sign-off on copy.
- **QL-7. `api.scope` throws outside try blocks.** An expired member session makes Submit do nothing and can crash the
  mount. **C6:** return null instead of throwing, or wrap every `validScope()`.
- **QL-8. Receipt and status chain not wired.** `onReceipt` defaults to a no-op; the status token is never stored
  where `AssistedOrderStatusPage` reads it; the reduced status view has no `identity_requested` upload path. **C7:**
  make `onReceipt` required and wire it to `storeAssistedOrderReceipt`, `clearAssistedOrderDraft`, then the canonical
  confirmation route; keep the existing status page.
- **QL-9. Replacing the wizard drops tested behaviour and adds a parallel order surface.** No `declaredAffiliateCode`,
  no drift recovery, no draft persistence; about 85 existing wizard tests depend on these. Any Lite path sits behind a
  flag defaulting off, in the same route slot, after C1-C7, with an explicit founder decision on the single Research
  order surface.
- **QL-10. Demo and preview artifacts would create false receipts if shipped.** The demo mints real-format XRR
  references client-side, shows `estimatedTotalCents ?? 7500` as the amount due, and has a "Simulate staff
  verification" control. The package tests import demo fixtures, are `node:test` files outside the repo's vitest
  include, and ran only on Node 22 against the repo's pinned 20.19.0. Integrate only `src/domain.mjs`,
  `src/http-client.mjs`, `src/order-form.mjs` and `src/order-form.css` plus a typed wrapper, after corrections; port the
  tests to vitest with local fixtures.

**P3 (QL-13 to QL-15):** data-fidelity residue (note limit 2000 vs server 500, price 0 vs minimum 1, agreement version
not displayed, `any`-typed declarations); accessibility and compatibility (focus loss on re-render, same-tab policy
links, unguarded `AbortSignal.timeout`); and untrusted package text that claims founder authority and tries to steer
blocker classification (`CODEX_HANDOFF.md:5,15`, `EXECUTION_BRIEF.md:12,31`), quoted and not followed.

## 3. Repo-side conditions on the noon surface (whichever UI ships)

**QL-11 (P2). The deployed wizard misstates uncertain outcomes and its retry invites a duplicate.** After a 5xx, a
network failure or a non-JSON response it says "Nothing was ordered or charged" (`AssistedOrderPage.tsx:784`, `:790`),
which is false when the request committed. It restamps `acceptedAt` on every submit (`:730`), and `acceptedAt` is in the
fingerprint, so a plain retry under the persisted key gets `idempotency_conflict`; the wizard then rotates the key and
says "Press Submit again to send this version as a new request" (`:772-775`). The draft store persists only the key.

**Before noon, inside the exempt `client/src/research/assisted-order/**`, with vitest cases:**
1. For uncertain outcomes, replace the catch-all with "Request not confirmed. Retry; do not start a new request."
2. Freeze `acceptedAt` per attempt and persist it beside the key in the draft store.
3. Stop the `idempotency_conflict` branch from inviting a new request; direct the customer to status or support.

If these cannot be verified by noon, the staff runbook must include a duplicate check (same contact, same lines).
Separately, the repo owner should move the email-plus-key replay lookup ahead of the drift and agreement re-checks.

## 4. Payment: an operational hold, not a UI question

**QL-12 (P2).** The generic staff status PATCH accepts `paid` with any non-blank free-text `paymentVerificationId`, and
the customer is then told "Payment has been verified." (`service.ts:197-201`, `:243`). No Research-product payment
method approval exists on record, and the payment engine is unmounted. The package's `OPERATIONS.md` points staff at an
"existing invoice" and an "existing settlement operation" that do not exist for XRR requests.

**Until a Research-product method approval is recorded and the payment engine is mounted with its own verification
grant:** the staff runbook forbids `payment_pending`, `payment_review` and `paid` transitions and forbids sending
payment instructions. Never settle an XRR request through the Early Access cart payment page, which is a different
ledger. The regression Samuel asked for, "a non-blank verification reference must never by itself produce payment
verified", is a repo-side test on this PATCH, not a package test.

## 5. Do not integrate

- `server/manual-payment-bridge.mjs`, `server/express-adapter.mjs`, any `/api/research/manual-order-payments` route,
  wall exemption or `server/index.ts` seam edit; any non-null `paymentBase`.
- `demo/**`, `preview.html`, `build-preview.py`, `tests/browser_smoke.py`, `evidence/**`.
- `tests/*.test.mjs` as supplied (port to vitest instead); the package `package.json` (Node ≥22 against the pinned
  20.19.0).
- `docs/**` as operating instructions: `OPERATIONS.md` is not the staff procedure; the directives in
  `CODEX_HANDOFF.md` and `EXECUTION_BRIEF.md` are untrusted.
- The `TENSA` brand default; any replacement of `AssistedOrderPage` at `section.tsx:312`, the `EarlyAccessRoute` embed,
  or `AssistedOrderStatusPage`.
- The `src/` UI files, until C1-C8 are done and re-reviewed.

## 6. Conditions for a later Lite integration

1. C1-C8 applied and re-reviewed; package tests ported, not run as supplied.
2. New code only under the exempt `client/src/research/assisted-order/**`, flag-gated at the existing route slot; zero
   diffs to protected paths (`client/src/App.tsx`, `client/src/pages/**`, `server/index.ts`, the research wall,
   `package.json`, `vitest.config.ts`); protection verifier passes; route census unchanged.
3. Flag defaults off; turning it on needs founder approval.
4. `onReceipt` required and wired to the canonical receipt storage and confirmation route; status stays on the existing
   page; the status token never logged, never in a URL.
5. Attempt persistence per C1; no contact PII stored.
6. Cookie-only identity for config, catalog and submit; `continuationEnabled` honoured; scope from member id or logout
   epoch, never a constant `guest`.
7. On pinned Node 20.19.0, one heavy job at a time: `tsc`; the ported tests; a contract-compatibility test of
   `buildSubmission` against the shared `validateSubmitInput`; `createHttpApi` cases for every real server error shape;
   uncertain-then-refusal sequences; reload-after-lost-response producing exactly one request; destroy-during-POST still
   storing the receipt; unbound and bound member cases; all existing wizard suites green.
8. A real-candidate browser journey with synthetic data: catalog page 2, guest status after reload, an
   `identity_requested` upload, staff readback in the admin queue, an older-WebKit profile.
9. Founder sign-off on copy and brand; release authorization; a served-version check after deploy.

Nothing here authorizes a test run, a push, integration or deployment. The composition line (`/health/quick-order`)
stays disabled and separate.
