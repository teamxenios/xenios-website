# Doc56 affected sets: historical receipts, not new runs

Current correction `8f080a08af06aa16e7aaf80add1a1b25e0cfae41` is NOT RUN. This file records affected coverage,
not execution authorization or a runnable qualification manifest. No application/test process was started.

## Exact historical receipt binding

Both start/result receipts below remain at evidence `fc53751ff7a988d029d5dabbd9f24f1431b62d19` and records
`38c723964358c18b8c5090f2f9a0aa92f74601b0`, under
`docs/health-launch/accepted-source-integration-20261005/evidence/`.
Both bind source `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree
`787432948d9464880df1dcfc5dff58eec7d889aa`, with clean start/end. These are not results for the B successor.

| Receipt prefix | Historical result | Exit | Raw log SHA-256 |
| --- | --- | --- | --- |
| `integration-subscription17-run1` | 17 files; 401 passed, 0 failed, 0 skipped | 0 | `83473aa973cfeba5823f35d3943eed0cee2faf5be122fa24bd304d7e87b6f1e0` |
| `integration-affected-run1` | 36 files; 626 passed, 0 failed, 0 skipped | 0 | `eec4390c03ff5e71931491b0485a81c5892a3a854508aeab9f4688b7999c7950` |

Start times: subscription `2026-10-05T18:24:55.671Z`; affected `2026-10-05T18:26:56.073Z`.
Recorded Node `v20.19.0`, npm `10.8.2`; no current runtime version claim. Historical provenance is sampled,
not continuous. The summary-only logs do not retain case-level results; the affected log also contains JSDOM
`Window's scrollTo()` not-implemented messages. No historical failed, skipped, deferred or interrupted run is relabelled.

The complete command arrays are authoritative in the two `-start.json` and `-result.json` records. Their shared
invocation envelope is the following executable, arguments and trailing flags, in order:

```text
C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe
node_modules/vitest/vitest.mjs
run
[the corresponding ordered file set below]
--maxWorkers=1
--no-file-parallelism
```

CWD: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
Dataset recorded: `C:\Users\sboad\.codex\worktrees\b22f\xenios-website\server\research\master-offerings\data\member-safe-master-offerings.generated.json`.
Backslash display is normalized here; the original JSON arrays retain their exact encoded strings.
No command is being proposed for immediate execution. Future execution must bind the then-reviewed source
and include proper per-case reporting; old receipts and an expired execution window cannot authorize it.

## Subscription set: all 17 files in recorded order

```text
client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx
client/src/research/adapters/product-subscription-create.test.ts
client/src/research/pages/member/ProductPage.subscription.test.tsx
server/research/commerce/subscription-intent-journey.test.ts
client/src/research/adapters/commerce.test.ts
client/src/research/pages/member/product-subscribe.test.tsx
client/src/research/pages/member/subscriptions.test.tsx
server/research/commerce/subscriptions.test.ts
server/research/partners/own-reads.test.ts
server/research/partner-access-wall.test.ts
server/research/partners/referral-v1-routes.test.ts
server/research/partners/referral-v1-production.test.ts
server/research/partners/referral-v1-attribution.test.ts
client/src/research/pages/partners/Dashboard.test.tsx
client/src/research/pages/partners/Links.test.tsx
server/research/partners/commission-schedules/ledger.test.ts
server/research/partners/partners.test.ts
```

`pages/member/product-subscribe.test.tsx` is affected through the mounted ProductPage/detail component.
Its unchanged line 117 requires `This product is not available.` and no purchase/subscription controls.
Its unchanged line 183 requires the same title and line 184 excludes `Substituted Product` after a slug mismatch.
This foreign path is not edited or leased by B. The correction restores its expected title, without claiming an executed pass.

## Affected integration set: all 36 files in recorded order

```text
client/src/clarity/AccountAuthorityPages.test.tsx
client/src/clarity/pages.test.tsx
client/src/clarity/partner-sign-in.test.tsx
client/src/clarity/premium-shell.test.tsx
client/src/clarity/public-surfaces.test.tsx
client/src/research/adapters/cartProductSelection.test.ts
client/src/research/adapters/memberCatalog.test.ts
client/src/research/adapters/product-subscription-create.test.ts
client/src/research/assisted-order/AdminAssistedOrderSession.test.tsx
client/src/research/assisted-order/assisted-order-accessibility.test.ts
client/src/research/assisted-order/assisted-order-premium.test.tsx
client/src/research/assisted-order/AssistedOrderPage.test.tsx
client/src/research/core-member-denial.test.tsx
client/src/research/early-access/EarlyAccessProductCard.test.tsx
client/src/research/pages/member/ProductPage.subscription.test.tsx
client/src/research/pages/sign-in.test.tsx
client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx
client/src/research/products-diagnostics/MemberCatalogExperience.test.tsx
client/src/research/products-diagnostics/MemberProductDetailExperience.test.tsx
client/src/research/products-diagnostics/product-media-surfaces.test.tsx
client/src/research/products-diagnostics/RequiredInputState.test.tsx
client/src/research/ui/ProductMedia.test.tsx
server/research/assisted-order/production-catalog.test.ts
server/research/catalog/member-catalog-projection.test.ts
server/research/catalog/member-catalog-service.test.ts
server/research/catalog/product-control-reader.test.ts
server/research/catalog/product-media-schema.test.ts
server/research/commerce/cart-product-selection.test.ts
server/research/commerce/persistence/persistent-cart.test.ts
server/research/commerce/subscription-intent-journey.test.ts
server/research/master-offerings/direct-commerce-selections.test.ts
server/research/master-offerings/early-access-catalog-coverage.test.ts
server/research/master-offerings/pathway-authority.test.ts
server/research/products-diagnostics/product-admin-production.test.ts
shared/research/auth-return-to.test.ts
shared/research/product-media.test.ts
```

## Nonadditive overlap

Exactly these four files occur in both sets:

```text
client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx
client/src/research/adapters/product-subscription-create.test.ts
client/src/research/pages/member/ProductPage.subscription.test.tsx
server/research/commerce/subscription-intent-journey.test.ts
```

17 + 36 - 4 = **49 unique files**, not 53. Historical test counts 401 and 626 are **not additive**.
Doc35's corrected union matches the 49 entries of `focused-source-bindings.json` at `38c7239`.
The two B component tests are in the 36-file set; the foreign route assertions are in the 17-file set.
Doc56 additionally requests Products/ProductPage route qualification and browser/accessibility work under
fresh authority, not only these lists. None was run for this correction.
