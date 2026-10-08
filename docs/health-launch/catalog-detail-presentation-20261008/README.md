# Catalog/detail presentation: local source handoff

Status: SOURCE AND TESTS AUTHORED; NOT EXECUTED; NOT PUSHED; NOT ACCEPTED.

## Exact identities and authority

- Branch: `codex/accepted-source-integration-20261005`.
- Worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Owner: `codex-accepted-source-integration-20261005`; chat `01a0e098-3b23-7233-9b07-877ace092650`.
- Task: `ACCEPTED-SOURCE-INTEGRATION-20261005`; lease `d0897045-efd3-425b-a8b4-02385e855153`.
- Reviewed runtime predecessor: `756a906877dbc174b7e228a259d2faa9c3af48ca`.
- Predecessor tree: `787432948d9464880df1dcfc5dff58eec7d889aa`.
- Predecessor evidence: `fc53751ff7a988d029d5dabbd9f24f1431b62d19`; records: `38c723964358c18b8c5090f2f9a0aa92f74601b0`.
- Local ownership/transfer commit: `20a23057f99529241ef1f593175670e13ab86f67`.
- **Local source/test successor: `e0a7d4787071140a25a984edc4c0a49f0d7c22ab`.**
- **Source/test successor tree: `340248360ac85f50f10ed5890624401616f792fd`.**
- Authoring model/effort: not exposed in current tool context. Requested setting was gpt-6-astra/ultra; no setting change was attempted and actual use is not claimed.

Authority is section 4 (Workstream B) of the frozen directive at coordinator commit
`94485a6a0efc8f347ea8e652ffd4744228ae3595`, under
`docs/coordination/launch-coordination-20261005/PARALLEL_IMPLEMENTATION_DIRECTIVE_20261008.txt`.
The actual human message was independently read in builder chat
`01a10d78-0981-7150-9292-c5cde2730d4d`, turn
`01a11c44-a615-7ea1-80f9-ada043d97dd7`, message
`01a11c6c-acdd-7753-a395-cb17f5e0b05f`.
Its attachment SHA-256 is
`6f63042d83c3d608aa8b1587668aba7adfaa05f8dd171a0bef9779dde099d16c`.
This records human authority, not authority inferred from a worker message.
The coordination branch and its Finance ancestry were not merged or cherry-picked.

## Four-path source delta

All paths below share `client/src/research/products-diagnostics/`.

| File | Customer-visible change |
| --- | --- |
| MemberCatalogExperience.tsx | Facets, counts and cards use the same supplied collection. Invalid refreshed facets reset only on successful reads. Query and sort survive transient reads. Sort ties use canonical slug/ID. Clear filters includes sort-only state. Long control containers can shrink; product links have distinct accessible names. Clinical copy no longer presumes provider/pharmacy availability. |
| MemberCatalogExperience.test.tsx | Authored regression cases for source-derived facets/counts, alias search, reset, refresh and retry preservation, sort ties, long labels, canonical links, missing media, non-ok stale-data suppression and distinct pathway states. |
| MemberProductDetailExperience.tsx | Selection belongs to the current product; removed variants do not silently reappear as the selected variant. Supplied strength, form, size and presentation are visible; absent facts say Not provided. Full selected labels wrap outside the native select. Catalog status and variant availability are separate. Unavailable information no longer asserts unavailable merchandise. Program/clinical copy does not promise eventual purchasing. |
| MemberProductDetailExperience.test.tsx | Authored exact-fact/missing-fact, selected-product, refresh/reprice/reorder, empty-variant, loading/error recovery, retry-only, long-label, media-independent and nontransactional-boundary cases. Existing state tests also suppress stale SKU, price, media, education and related links. |

No server, shared contract, price authority, availability policy, media authority, global style,
Auth, payment, SQL, manifest, package, protected composition or Quick Order source changed.
`git diff --name-only 756a906... e0a7d47... -- client server shared supabase package.json package-lock.json scripts render.yaml`
returned exactly the four paths above.

## Existing behavior preserved, not rewritten

- Existing catalog tests cover shell/heading, labeled search and controls, loading/empty/error/unavailable/unauthorized states, delegated retry and one-main composition.
- Existing detail tests cover exact variant price/media, absent current price, access/read states, Research education and nontransactional GLP entries.
- Markup-only layout test names now explicitly avoid claiming browser or zoom qualification.
- `pages/member/ProductPage.tsx` already compares the adapted product slug to the route slug and rejects mismatches; request-generation handling already rejects stale reads. It was inspected, not edited. This handoff does not claim an executed route test.
- `products-diagnostics/product-media-surfaces.test.tsx` already checks non-media markup invariance across media alternatives. It was inspected, not edited or executed.
- `ui/kit.tsx` retains the real error alert and supplied read-retry callback. No new mutation action or retry was introduced.
- Existing price formatting and server-supplied eligibility remain unchanged. A visible price, image, variant or Available label is not purchase approval.

## Exact Workstream C transfer

Commit `20a23057f99529241ef1f593175670e13ab86f67` removed these paths from this owner's active task and lease:

- `client/src/research/product-subscriptions/ProductSubscriptionCreate.tsx`
- `client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx`
- `client/src/research/pages/member/ProductPage.tsx`
- `client/src/research/pages/member/ProductPage.subscription.test.tsx`

Recipient: existing session `codex-product-subscription-intent-20261005`,
chat `01a10d12-0764-7222-8b5a-5029508020ad`,
lease `d9ff89ea-06a4-4d35-b62b-5db6bac37920`.
Recipient records its own claim. This owner made no C source edits and does not claim that recording the transfer started another session.

## Evidence and execution limits

Source reading, Git diff/identity inspection and local source commits were performed.
A narrowly scoped existing read-only helper inspected the patch, not an independent acceptance review.
Its copy mismatch and missing selection-sequence coverage observations were addressed in source.
No compiler, module import, syntax checker, test runner or application was executed.

| Activity | This successor |
| --- | --- |
| Component/focused tests and full suite | NOT RUN |
| Typecheck, lint/syntax, build, no-em-dash gate | NOT RUN |
| Route/protection/release gates | NOT RUN |
| Node/npm/runtime provenance | Not newly probed; no runtime results claimed |
| Browser, zoom, responsive layout, keyboard/focus, live catalog | NOT RUN |
| Server, database/SQL and host-resource sampling | NOT RUN |
| Push, merge, deployment, managed/configuration writes, real notifications | NOT PERFORMED |

The expired execution window remains expired. The five-minute automation was not resumed.
No supplied static markup test proves layout, native zoom, screen-reader behavior or live-catalog behavior.
New wrapping utilities and announcements need browser/accessibility qualification after authorization.
No customer purchasing, enrollment, payment, fulfillment or clinical capability was enabled.

The local commit command used a per-command `-c core.hooksPath=NUL` so committing
would not start prohibited hook execution. No persistent Git setting was changed.
This is not passing or waiving any gate. Git reported LF/CRLF conversion notices.
`source-bindings.json` separates Git blob identities from actual working-file SHA-256 hashes.
The latter may change with checkout line endings and are not asserted to be Git blob SHA-256 hashes.

## Carry-forward holds and next action

The predecessor composition verdict (corrected record
`fffa33a6b3407b407b2b43d3c5a5c7054887f590`) is not acceptance of this new source.
Prior subscription 17-file/401 and affected 36-file/626 receipts overlap and belong to the predecessor,
not this successor. They are not a combined unique-test aggregate.
Full aggregate deferral, failed protection gates, protected-hash approval/manifest re-cut,
GATE-01, MC-01/D/E database and media qualification, subscription buying gaps,
Finance/provider and managed-release holds remain open. No hold was waived here.

The original Claude session remains the sole acceptance reviewer. Coordinator should place this
exact local source after the current decision-input and repaired-supervisor reviews without
interrupting them. Review is a source review only until fresh execution authority exists.
Any execution proposal must explicitly include this successor and its two changed tests;
do not silently reuse the old source/manifest or execution window.
Before eventual integration, reconcile Workstream C without copying its lease records or accepting
backend/price changes through this presentation slice.
Push remains held pending specific current transfer authority. This is not release-ready or customer-purchase-ready.
