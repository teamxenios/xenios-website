# KAN-31 PR #316: exact catalog-card selection (the Doc 236 correction)

**CHANGES REQUIRED at exact head `3cd042b7d5bb78e85487e8b9d42bbd811fed22a9`** (base `fa4292e4`, branch
`codex/kan31-bounded-network-fifo-20261017`, option (b) from KAN-31 comment 10151).

- **The driver correction is right,** and the real `8efa9a9e` bundle confirms it.
- **The required real-browser rehearsal fails** at the next step, "Continue to contact", because its synthetic API
  fixture does not reproduce the state that enables that button.
- **Two files changed.** Only `hosted-browser.UNAPPLIED.mjs` and `hosted-browser.offline.test.mjs`.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Driver change: correct

All Doc 236 corrections are met:

- **Search response (item 4).** `matchesCatalogSearch` accepts only `GET …/request-intents/catalog` with
  `search`=term, `page=1`, `pageSize=24` and no `family`. This matches the app exactly
  (`request-intent-api.ts:86–88`; `RequestIntentForm.tsx:93` uses `pageSize: 24`). The response must contain exactly
  the planned `productId`/`variantId` with the exact name and specification.
- **Exact match (item 1).** The card is selected by an exact `h2` (level 2) and an exact-text `<p>` specification.
  The `hasText` substring match is gone.
- **Bounded wait (item 2).** `expect(card).toHaveCount(1)` within a per-item budget of
  `min(5000, requestTimeoutMs, run deadline, expiresAt)`. The `expect` comes from the pinned tool bundle's
  `playwright/test.mjs`, hash-checked (`1deb2656…`), with no new package.
- **Diagnostics (item 3).** On failure the driver records `uiVariantObservedCount` and up to 5 sanitized cards
  (`heading` and `specification` only). At most 6 diagnostics are kept, and it always fails `EXACT_UI_VARIANT`.
- **Main guard.** The CLI admission block now runs only when the file is invoked directly, so the tests can import the
  helpers. The existing spawned-driver scenario tests still pass in CI, so direct invocation still runs full admission.
  That rules out a silent no-op.
- **Unit controls.** Five new ones pass: a delayed or unrelated response; a render after the response; a longer decoy
  specification; absent or duplicate cards (refused, with diagnostics); and a wrong product or variant in the response
  (refused).

## Rehearsal (offline CI `39047330332`, real `8efa9a9e` client, pinned Chromium, loopback synthetic API)

- **What passed:**
  - Both searches were issued (`5-Amino-1MQ`, `5-Amino-1Mq`).
  - **Both exact cards were selected and quantities set,** with a same-name, longer-specification decoy present.
  - The FIFO peak was 8, with 0 off-origin requests, 0 POSTs, and the browser and server closed.
  - This answers the Doc 236 failure directly.
- **What failed (test 16):** `locator.click: Timeout 30000ms exceeded` on `Continue to contact`, which resolved to
  `<button disabled …>`.
  - In the app (`RequestIntentForm.tsx:237`) that button is disabled when
    `!selected.size || !config || !storage || !continuationEnabled`.
  - Selection succeeded, so the cause is `config` (the response is not accepted by `parseAssistedOrderConfig`) or
    `continuationEnabled`. In the standalone route, `continuationEnabled` is `standing` =
    `loadEarlyAccessAgreementState().kind === 'accepted'`, which parses `GET /api/research/early-access/agreements`
    strictly.
  - The fixture's synthetic `/config` and `/agreements` bodies are hand-written, so one of them does not match what
    the app's parsers require.
- **Other jobs:** build, typecheck and test pass (run `39047333863`). The `diagnostic` job fails because of test 16.

## Required correction (Core, fixture only; no driver change needed)

1. **Make the synthetic `/agreements` and `/request-intents/config` bodies satisfy the app's own parsers**
   (`loadEarlyAccessAgreementState`/`singleRequiredAgreement`, `parseAssistedOrderConfig`). Preferably copy the field
   shapes from the app's own unit fixtures at `8efa9a9e`, not new guesses.
2. **Before clicking Continue, assert the page is ready.** There must be no `role=status` "Complete the existing access
   and agreement requirements…" message and no `role=alert`, and Continue must be enabled within at most 5 s. Otherwise
   fail with the visible status and alert text recorded. A disabled button then names its cause instead of showing a
   30 s timeout.
3. **Re-run the rehearsal to `PASS_SUBMIT_BOUNDARY_NO_REQUEST_POST`:** contact validation, "Review your request",
   5 acknowledgments, Submit enabled, 0 request-intent POSTs.

## Recommended (not blocking)

**Bound the hosted driver's later clicks too.** In `populate()`, the Continue, Review and Submit steps still use
Playwright's default 30 s click timeout. Use a bounded "enabled" assertion with a named code (for example
`CONTINUE_NOT_ENABLED`) and the same status and alert diagnostics. If real staging ever disables the button, the
evidence will then say why.

## Next

1. Core fixes the fixture within cycle 2 of 2.
2. I re-review the exact new head and its rehearsal.
3. Merge.
4. A new baseline for the new `main`.
5. Samuel's new single-run approval.

NOT LIVE. No SQL. No production.
