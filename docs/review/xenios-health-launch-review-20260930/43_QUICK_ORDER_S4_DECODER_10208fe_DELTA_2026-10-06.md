# Quick Order S4 pure admin evidence decoder `10208fe` / `e7e3d44`: narrow delta review

**SOURCE: ACCEPT WITH LIMITS** for the three new-only files at `10208fea644f069f58ddeaa8993db4df5eb4469d` as a pure,
fail-closed, service-only projection and decoder with no client, RPC, storage, clock or authority. It is exactly the
three paths the coordinator assigned under the adopted S-4, nothing imports it yet, and its closed key sets, reference
pattern and review-state rule equal the canonical TypeScript contract. **One P1 wire-shape defect and two P2
integration items must be settled in the shared patch contract before this decoder is bound to a real reader:** the
decoder closes the canonical `detail` over 23 keys, but the canonical SQL emits 20, so a wrapper that passes the
canonical JSON through verbatim is refused for every row (S4-F0, found by the supplemental shared-edits lens in doc 42
and re-read by me). Tests are authored and **NOT RUN**. Decoding proves evidence consistency, never storage,
authenticity or atomicity; Release A remains **no**.

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` as reported. Method: full read of the two runtime files
and the test inventory, independent hashing, key-set and format comparison against the canonical contract and SQL,
and one adversarial verifier agent (read-only; 43 tool uses) that re-derived every claim and probed the decoder with
hostile shapes by reasoning and pure string or number experiments. No test, build or module execution.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `10208fea644f069f58ddeaa8993db4df5eb4469d`, tree `6e0a8003baa8743d243f06bf18c025f649a95152`, parent `c54f53f`; `ac36e60` is an ancestor |
| Records | `e7e3d446ff36a549f023dbc64f6fbb275e614125` (handoff, `S4_DECODER_CONTRACT_20261006.md`, `evidence/s4-decoder-*`); runtime identical to `10208fe` |
| Files | `shared/research/assisted-order/quick-order.ts` (49 lines, sha256-lf `3d2fbc4b…`), `server/research/assisted-order/quick-order-repository.ts` (162, `5a628e29…`), `server/research/assisted-order/quick-order-repository.test.ts` (661, `78aceede…`); all three equal the builder's `s4-decoder-source-10208fe.json`; nothing else changed under `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package.json` |
| Authority | S-4 new-only drafting under coordinator `60d593a`; the three paths assigned by `QUICK_ORDER_PURE_PROJECTION_ASSIGNMENT_20261006.txt` (`1d4f2c3`); lease extended for exactly those paths (`s4-decoder-lease-20261006.json`, no conflicts); all three sit in allowed zones |
| Imports | the shared contract constants, the new shared types (type-only) and `../health/quick-order/core.mjs` (`SOURCE_KINDS`, `AFFILIATIONS`, `text`), all declared in `core.d.mts`; no canonical service, repository, outbox, Supabase client, `fetch`, `process.env` or clock; nothing in the application imports the module |

## 2. What the decoder does (confirmed by both readings)

`decodeQuickOrderAdminEnvelope(value, expectedRequestId)` validates the expected lowercase UUID first, returns `null`
only for an explicit `null`, requires a closed five-key envelope at version `quick-order-admin-envelope-v1`, binds the
envelope, detail, marker, companion, receipt, obligation payload and observation to that UUID, treats legacy as
`submittedEvent: null` **and** `enrichment: null` (marker without enrichment or enrichment without marker is refused),
binds companion and receipt hashes to the submitted-event hash, binds `occurredAt` and `createdAt` to the intake
`confirmedAt`, recomputes the estimate from the canonical lines (1 to 100 unique product and variant pairs, bands with
the minimum as increment origin, `request_pricing` lines priced null, no zero unit price, safe-integer arithmetic,
`estimatedTotalCents` null exactly when no line is priced), restricts the declared code to `^[A-Z0-9_-]{1,64}$` and
derives the review state exactly as `core.mjs` does, validates the obligation key, template and closed payload,
validates the observation against the eight-status outbox vocabulary without inferring chronology, freezes new outputs
without mutating or freezing the input, and throws one fixed message that echoes no supplied value.

Independently confirmed equalities: the 23 `DETAIL_KEYS` equal `AssistedOrderAdminDetail` (`contract.ts:365-399` at
`ac36e60`) and the live producers `decodeAdminDetail` and the memory repository, **but not the canonical SQL wire
shape**, which emits 20 keys (S4-F0 below); the 20 `LINE_KEYS` equal
`AssistedOrderLineSnapshot` (`:204-225`); the `XRR-[0-9]{8}-[A-F0-9]{10}` pattern equals the bridge CHECK and the
generator in `defaults.ts`; the status vocabulary equals the `20261001040351` CHECK; the band, price-pending and total
rules equal the bridge constraints; the `.ts → .mjs` import follows the `containment.ts → paths.mjs` precedent under
`moduleResolution: bundler`. Tests: 22 `it` plus 25 `it.each` blocks expanding to several hundred cases; synthetic
fixtures only; no network or filesystem.

## 3. Findings

| ID | Sev | Finding | Smallest correction |
| --- | --- | --- | --- |
| S4-F0 | **P1** | `DETAIL_KEYS` (`quick-order-repository.ts:71`) closes `detail` over 23 keys including `source`, `declaredAffiliateCode` and `declaredAffiliateCodeState`, and `closed(envelope.detail, DETAIL_KEYS)` at `:131` runs before the legacy-null branch at `:136-138`. The canonical producer `research_assisted_order_admin_json` (`20260815150000…bridge.sql:489-510` at `ac36e60`) emits exactly 20 keys and none of those three; no later migration redefines it (`20260820190000` M75 adds the columns and parses submit input only). The TypeScript type has the three fields only because `decodeAdminDetail` synthesises them (`supabase-repository.ts:197`, `:211-220`). A wrapper RPC that returns the canonical JSON as `detail` is therefore refused for every row, legacy and Quick Order alike, and because the shared patch routes every `getAdmin` call through this decoder with no fallback, every operator read, status update and document upload would fail closed after cutover. The readback test at `9118a82` builds its fixture from the 23-key TypeScript type, so it cannot detect this. | Record the contract choice before the wrapper is drafted: the wrapper appends `source`, `declaredAffiliateCode` and `declaredAffiliateCodeState` from the row for every request (state defaulting to `not_provided`), or `DETAIL_KEYS` drops the three and the decoder lets `decodeAdminDetail` default them. Add a legacy fixture in the real 20-key wire shape to the readback test. |
| S4-F1 | **P2** | The strict timestamp form (`YYYY-MM-DDTHH:mm:ss.sssZ`) is applied to the canonical `detail.createdAt`, but the canonical producers pass `createdAt` through unchanged from the RPC JSON, where a `timestamptz` serialises with an offset and variable fraction digits; and the equality to `confirmedAt` holds only if the future commit stores `createdAt` at millisecond precision equal to the handler's `receivedAt`. Unreachable today (commit throws; legacy path never reaches the check). | Bind in the shared-patch contract: the commit writes `createdAt = receivedAt` in millisecond ISO form, and the wrapper re-serialises `detail.createdAt` losslessly before decoding (or the decoder compares instants for that one field). Add a test with the `+00:00` form documenting the choice. |
| S4-F2 | **P2** | `companion.intake` is a new 12-key `quick-order-v1` shape, not the `attribution-v1` snapshot that `core.mjs` already produces (`schemaVersion`, `declaredAffiliateCode`, nested `affiliation`, `receivedAt`, no `requestAcknowledged` or `estimate`). The projection from the stored snapshot to the intake shape is not written anywhere, so a verbatim snapshot is refused. | Add the mapping table to the S4 contract (declaredAffiliateCode → declaredCode with `''` → null; affiliation.kind/detail → affiliationKind/affiliationDetail; receivedAt → confirmedAt; requestAcknowledged from the input; estimate from core's estimate without `excludes`) so the commit and the reader bind one mapping. |
| S4-F3 | P3 | `nonnegative()` admits `-0` (safe integer, not less than zero) for `knownSubtotalCents` and `attemptCount`; JSON can carry it. | Refuse `Object.is(value, -0)` or normalise with `value + 0`. |
| S4-F4 | P3 | `detail.lines` is consumed through iteration, so the accessor and prototype hardening applied to records does not cover an array with an own iterator, a swapped prototype or index accessors; unreachable from JSON, reachable only from an in-process hostile wrapper. | Require the plain `Array.prototype`, iterate by index and check each index descriptor has a value. |
| S4-F5 | P3 | Zero-width, bidi-control and interior non-breaking characters pass, identically to `core.mjs text()`; a decoder-only change would refuse legitimately stored values. | None here; if wanted, change `core.mjs` first. |
| S4-F6 | P3 | Under a `Proxy` whose traps disagree, `object()` can throw a `TypeError` instead of the fixed error (no leak). | Guard the descriptor before reading it. |
| S4-F7 | P3 | `held` is accepted but unreachable for a Quick Order admin obligation (the HL12 guard returns early for non-payment rows) and `stale` collides in name with the outbox's stale-processing reclaim. | One comment in `quick-order.ts` distinguishing the observation `stale` from outbox reclaim. |
| S4-F8 | P3 | The file is named `*-repository.ts` but is a decoder, and several comments and the contract note drop spaces before digits. | Keep the top-of-file "no storage, no RPC" docblock; fix the typography. |
| S4-F9 | P3, adjacent | `core.mjs` nulls the price only for `provider_request` and `request_activation`, so a priced `request_pricing` catalog item would be snapshotted with a price that both the bridge CHECK and this decoder refuse; whether such an item exists is NOT PROVEN. | For the core owner, not this slice: null the price for `request_pricing` in the public projection or document that the catalog never prices such items. |

No P0. One P1 (S4-F0), a contract defect between this decoder and the SQL it will be bound to, not a defect in the
decoder's own fail-closed behaviour; the S4 contract note's claim of the "complete current canonical
`AssistedOrderAdminDetail` wire shape" is true of the type, not of the SQL. The verifier's two corrections to my own
wording are adopted above: the test count is 22 `it` plus 25 `it.each`, and the accessor hardening is universal for
records but not for the lines array.

## 4. Evidence classes and limits

Immutable: hashes, imports census, key-set and format equalities. Producer receipts verified: the three blob hashes
and the lease extension. Independently executed: none (pure reading plus string and number experiments outside the
repository). NOT PROVEN: the suite passing; esbuild and tsc resolution of the `.mjs` import at this path; exact
Postgres and PostgREST serialisation of `created_at`; existence of non-NFC catalog identifiers or priced
`request_pricing` items. Note that `tsconfig.json` excludes `**/*.test.ts`, so the test file is never type-checked.

## 5. Verdict in the prompt 03 form

Source and tree `10208fe` / `6e0a8003…`; scope three new files. **SOURCE: ACCEPT WITH LIMITS.** Conditions before
the shared-patch integration binds this contract: **S4-F0 (P1)**, S4-F1 and S4-F2. Qualification: NOT RUN. Protected
and schema authority: none touched. Release A: no; Release B: no. Smallest next action for the builder: record the
`detail` wire-shape choice (S4-F0) and the two P2 bindings in `S4_DECODER_CONTRACT_20261006.md` and the shared-patch
amendment, add a 20-key legacy fixture to the readback test, and fold S4-F3 into the next source slice; no rerun of
anything to own a receipt.
