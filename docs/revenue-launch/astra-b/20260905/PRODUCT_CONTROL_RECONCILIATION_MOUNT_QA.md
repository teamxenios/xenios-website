# Product Control source-reconciliation mount QA — 2026-09-05

## Scope

ASTRA-B mounted the existing read-only reconciliation adapter in the Products
Admin surface behind an explicit **Review source reconciliation** control. The
surface calls the server-owned
`/api/admin/research/products/revenue-launch/reconciliation` route only after
the operator opens it. An `AVAILABLE` response is rendered by the existing
`ReconciliationReviewContent` component; unavailable, denied, malformed, or
partial responses remain explicit and never become an empty successful review.

The panel displays source mappings, formulation exceptions, independent fact
states, and immutable lineage only. It has no approve, activate, publish,
price, purchase, fulfillment, or evidence-editing action. Product Control's
existing product and price reads remain unchanged when the review is closed.

## Changed paths

- `client/src/research/pages/adminx/ProductsAdmin.tsx`
- `client/src/research/pages/adminx/ProductsAdmin.test.tsx`

## Evidence

- Commit: `4c85065cc7be8dab369222a163b80ba8ab7318c1`
- Commit tree: `eba326426db3f491b4f7b3e94d00378789a2043e`
- Products Admin + reconciliation adapter/panel tests: **45/45 PASS**
- TypeScript `tsc --noEmit`: **PASS**
- `git diff --check`: **PASS**

The additional integration assertion covers an `AVAILABLE` projection: a
formulation `PENDING` fact and missing supplier/identity evidence render as
their server-supplied states, while the mounted controls contain no approve,
activate, or purchase action. The client wire validator also rejects a
confirmed fact paired with the wrong authority/kind, and rejects confirmed
identity evidence when the exact identity is absent. The resulting targeted
suite is **47/47 PASS**. These checks are recorded in commits
`0ebb6d76cdb5d974b5c283c5ec43330a18bb343e` and the follow-up validator slice.

The server projection and route remain ASTRA-A's authority. This client slice
does not claim that source facts, supplier confirmations, prices, or products
are approved or purchasable, and it performs no production mutation.

## Browser evidence boundary

After integration, a fresh synthetic production-shape run was attempted against
exact head `cd5500fe903e601fc967e536b08d2458e4304df9` using the pinned Node
`v20.19.0` and npm `10.8.2` toolchain. The required clean preview build stopped
before browser startup because its mandatory `npm ci --no-audit --no-fund`
could not unlink the locked native module
`node_modules/bufferutil/prebuilds/win32-x64/bufferutil.node` (`EPERM`, Windows
error `-4048`). No browser capture or journey pass is claimed; this remains an
environment/toolchain blocker, not product evidence. No production endpoint was
contacted and no mutation occurred.


## Superseding integration note — 2026-09-06

The Product Control mount and server reconciliation route are integrated in
candidate `b1fb9a5e64d90210b9b267214bb20fcc66e4b117` (tree
`68426af116445394a05ace33a1397eac96b4244e`). The focused reconciliation
suite is **59/59 PASS** (Products Admin/adapter/panel **47/47**; validator
**11/11**), and the account-portal UX correction is **105/105 PASS**. Fable's
narrow CDP helper regression is **5/5 PASS**; its browser capture on this exact
current tree is still pending after one host-saturation timeout. Browser
journey acceptance is **NOT CLAIMED** until the fresh capture emits a complete
signed evidence packet.

No production endpoint was mutated and no deployment, migration, account grant,
notification, payment, or shipment occurred.


## Browser capture checkpoint — candidate 42ab494

Fable's readiness-poll repair now lets the exact-tree capture reach all 20 states. The run is still **NOT CLAIMED** as acceptance because only the empty-orders fixture at widths 1440/390 has undeclared `partner_not_found` 404 telemetry; fixture2 intentionally has no partner relation. Fable is adding one exact expected-denial declaration with body/status/count matching and will rerun.


## Exact denial contract patch — candidate 1d46e06

The intentionally absent partner relation for fixture2 is represented as a separate, exact `partnerAbsenceEvidence` proof. The declaration is scoped to `orders|empty` and remains fail-closed on URL/status/body/count/resource drift. Integrated focused coverage is **54/54 PASS**; exact-tree browser recapture is pending.


## Cold-navigation blocker — exact 1d46e06 run

The exact browser capture passed the catalog and product-detail states, then failed before account capture on pending Document/Fetch/Font requests during sign-in. The output is partial and non-final. Fable is assessing a bounded prewarm fix; no production or Product Control mutation occurred.


## Final browser acceptance — 2026-09-06

Fable's sole-owned exact-tree capture is complete on `28e4b7802c84c01b4433040a36e622ce6bbf27de` (tree `17b204350602f8be22b6b722eddd5d5a1c421930`). The manifest at `C:\tmp\xenios-fable-synthetic-28e4b78-final-007\synthetic-journey-evidence.json` is 672,136 bytes (SHA-256 `6e123d7e1703117f262087e7f6949c5590ebeb2aabd2495d7e8c3023e56d9e8b`); its 40-file artifact inventory (20 PNG + 20 text) is SHA-256 `05e021f240db8c95e22370dca156da9ff950483db0ad6b8fbf42b653f475e377` with zero missing/extra/mismatch files.

All 20 captures completed: 16 `AUTOMATED_PASS` and four exact `AUTOMATED_PASS_WITH_NOTES` (two forged-reference denials and two no-partner denials), zero failures, all boundary assertions pass, zero truncated screenshots, and warmup PASS in 13,668 ms. The run is `completeWithExpectedDenialNotes=true`, `zeroUndeclaredFailures=true`, `externalMutations=0`, and `claimScope=UI_PRESENTATION_ONLY`; manual PII/PHI review remains explicitly pending by design.

This is synthetic local browser evidence, not production approval.
