# Product subscription PS-R4 wording `e6d7dd1`: bounded source review

**SOURCE ACCEPT WITH LIMITS.** The successor removes the word "yet" from exactly the three unavailable messages in the
product subscription form and updates the one existing expectation, as assigned. It is a partial PS-R4 correction:
whether the placeholder card may appear before an offer exists stays an owner decision. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Delivered through the coordinator-led queue (board `assignment4`, review
order `PSR4_WORDING_QUEUED`). Method: identity from the board and the coordinator checkpoint
`PSR4_WORDING_COORDINATOR_CHECKPOINT_20261008.json` at coordinator `6a989d9`; read-only Git object reads in the owner's
checkout; a direct read by this reviewer with no lens, because the delta is four lines. The subject was never executed
or imported.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `e6d7dd10045289594d91a6a086ba592348d7edb8`, tree `7cb1521f5466dce0c226eda1126c49ed958000cd` ("fix: remove implied subscription availability timing", 2026-10-08 09:41:03 -0500), parent `1fe97f54b72e943c85c5dfbccbc355fe5f72c517` |
| Records | `95283ce83fdedf4dbeb84f131aed16008e6f3c5f`, records-only: the handoff and three `.xenios` registry files |
| Owner checkout | `C:/Users/sboad/.codex/worktrees/5b21/xenios-website`, branch `codex/product-subscription-intent-20261005`, at `95283ce`, clean |
| Delta | exactly two paths from `1fe97f5` to `95283ce` outside `.xenios/` |
| Hashes (sha256-lf, recomputed, equal to the checkpoint) | `ProductPage.subscription.test.tsx` `d3d985b2…` to `5e238986…`; `ProductSubscriptionCreate.tsx` `a242b3d6…` to `32c64891…` |
| Controlling finding | PS-R4 in this reviewer's subscription acceptance, coordinator copy `CLAUDE_SUBSCRIPTION_ACCEPTANCE.txt:55`: placeholder card and "yet" wording on live member product pages (P2) |

## 2. What changed (inspected source)

- `ProductSubscriptionCreate.tsx:43`: the denial for `commerce_disabled` and `capability_disabled` now reads "Product
  subscription requests are not available. Your selections remain here; no subscription was created by this attempt."
- `ProductSubscriptionCreate.tsx:142`: the offer-absent status now reads "A subscription offer is not available for
  this product."
- `ProductSubscriptionCreate.tsx:143`: the commerce-closed status now reads "Product subscription requests are not
  open."
- `ProductPage.subscription.test.tsx:44`: the existing expectation drops "yet".

No guard, card visibility, offer handling, quantity, retry, payment, activation, server, shared or protected byte
changed. No "yet" remains in `ProductSubscriptionCreate.tsx`.

## 3. Findings

- **P3 PSR4-1: the corrected wording is not pinned by any test.** The updated expectation asserts the substring "A
  subscription offer is not available for this product", which the old text also contains.
  `ProductSubscriptionCreate.test.tsx:69` asserts "A subscription offer is not available", which also matches both. No
  test asserts the other two messages. A regression to the old wording would still pass. Smallest fix: include the
  closing period in the same expectation ("...for this product."), which stays inside "update the existing
  expectation". Pinning the other two messages would need new tests and therefore the owner's scope.
- **Tests NOT RUN.** The changed expectation has not been observed passing.

Observation outside this delta, not a defect in it: the same "not ... yet" pattern appears in many other
customer-facing strings. A read-only search at `e6d7dd1` found at least twenty, across Care clinician review, the
early-access catalog and ordering, the full catalog and price list, order history, membership applications, the
referral program, the cart, checkout, the assessment consent and Blueprint. Whether each one implies an unsupported
promise is a copy-policy question for Samuel. This review does not extend PS-R4 to them.

## 4. Disposition

- Subject: `e6d7dd10045289594d91a6a086ba592348d7edb8` (tree `7cb1521f…`), records `95283ce`.
- **SOURCE ACCEPT WITH LIMITS** as a partial PS-R4 correction. No P0, P1 or P2.
- **What it unlocks:** the wording change may travel with the subscription candidate under the integration conditions
  already recorded in the subscription acceptance, including the focused Vitest re-run at the integrated commit. It
  does not close PS-R4.
- **What stays held:** the placeholder-card decision (Samuel or the owner); PS-R1 to PS-R3 and PS-R5 to PS-R7,
  unchanged; every owner decision listed in the subscription acceptance; tests NOT RUN; local only, with no push
  authority; production NOT READY.
- **Smallest next action:** PSR4-1 by the same owner when convenient, in the same expectation. It does not block.
