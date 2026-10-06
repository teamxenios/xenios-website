# Quick Order shared readback and notification source `9118a82` / `4669493`: bounded delta review

**SOURCE: ACCEPT WITH LIMITS** for `9118a82633e9f10637764c896ce2a6e53ad1e3eb` as the exact application of the approved
six-file patch `b7427650…`, the recorded UI amendment `6f5d9013…`, a three-line RPC constant and two new synthetic test
files, nothing else. **One inherited P1 and five P2 items bound its use.** The reader cutover reaches four call sites,
including the customer document flows, and must not deploy before the wrapper RPC is installed and qualified; the
wrapper's `detail` must carry the three keys the decoder requires, or the decoder must drop them (S4-F0, doc 43);
`createdAt` must be rendered in millisecond ISO Z form; four provider-journal cases are predicted red until Samuel
decides the fixture path; the authored "unauthenticated refused" case proves the fixture's own door, not production
admission. All tests are authored and **NOT RUN**. Nothing here activates intake, installs SQL or approves a release.

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` as reported. Method: Git-object reads, independent hashing,
a scratch application of the approved patch to the predecessor blobs, comparison of the candidate against that
result, and one adversarial verifier agent over the parts that are new relative to the approved patch (the UI
amendment, the RPC constant, the two new integration tests, the existing-test impact). The approved five-file patch
body itself is assessed in doc 42 by the supplemental shared-edits lens. No test, build or process was executed.

## 1. Identity and authority (verified)

| Item | Value |
| --- | --- |
| Source | `9118a82633e9f10637764c896ce2a6e53ad1e3eb`, tree `5142b61564921cbe892099c8ef55896935508fa9` ("feat(quick-order): wire proposed admin readback and notification") |
| Records | `4669493ba48c2afbdfb844813cfc066442ddd78d` (handoff, `SHARED_INTEGRATION_SOURCE_20261006.md`, `evidence/shared-integration-source-9118a82.json`); runtime identical to `9118a82` |
| Predecessor | `e7e3d44` (runtime `10208fe`, the S4 decoder reviewed in doc 43); `ac36e60` and `fd023e8` unchanged beneath |
| Authority | Samuel's source-only approval of packet `1d4f2c3`, recorded at `dc3329b` (18:29:11Z); the approved six-file patch `b7427650…`; the coordinator-directed UI amendment `6f5d9013…` recorded at `95858ba` as within the approved paths; the review request to this context at `1243ca9` |
| Changed paths | the six patch targets; two new tests `server/research/assisted-order/quick-order-admin-readback.test.ts` and `quick-order-notifications.test.ts`; three lines in `server/research/assisted-order/quick-order-repository.ts`; own records. Nothing under `supabase/`, `docs/phase2/`, `client/src/pwa/`, `client/src/components/`, `server/index.ts`, `client/src/App.tsx`, `server/research/health/quick-order/` or `client/src/research/quick-order/` |

## 2. Byte identity against the approved patch (independent)

Applying `b7427650…` to the `ac36e60` blobs in a scratch repository and comparing with `9118a82`:

| File | Result |
| --- | --- |
| `shared/research/assisted-order/contract.ts` | identical: adds `quickOrder?: QuickOrderAdminProjection \| null` to `AssistedOrderAdminDetail` and the type import |
| `server/research/assisted-order/supabase-repository.ts` | identical: `getAdmin` now calls `QUICK_ORDER_ADMIN_DETAIL_RPC`, decodes the envelope with `decodeQuickOrderAdminEnvelope`, returns null only for an absent request, and composes `decodeAdminDetail(envelope.detail)` with `quickOrder` |
| `server/research/assisted-order/service.ts` | identical: `updateStatus` preserves `current.quickOrder.intake` and marks the observation `stale` after the legacy update |
| `server/research/assisted-order/communications.ts` | identical: one strict renderer for `research.assisted_order.quick_order.submitted.admin.v1` with a closed three-key payload, UUID and `XRR` pattern checks, a fixed `SITE_ORIGIN` constant (`https://xeniostechnology.com`, not environment-derived) and a body of reference plus internal link only |
| `client/src/research/assisted-order/AdminAssistedOrderDetail.tsx` | patch result **plus** amendment `6f5d9013…`: the canonical affiliate block is no longer hidden for Quick Order rows; it is relabelled "Current affiliate status" / "Recorded affiliate code", and one sentence states that the declaration review state was recorded at submission while later code matching appears under the current status. Before and after hashes equal the coordinator's amendment record. |
| `client/src/research/assisted-order/AdminAssistedOrderSession.test.tsx` | patch result **plus** the amendment: the `admin-affiliate` block is now expected present, and two cases assert `matched_manual` and `invalid_ignored` shown separately from the immutable `captured_unmatched` submission state |
| `server/research/assisted-order/quick-order-repository.ts` | three added lines exporting `QUICK_ORDER_ADMIN_DETAIL_RPC = "research_health_quick_order_admin_detail"` with a comment that a missing RPC must never fall back |

## 3. Facts that bound this candidate's use

- **Reader cutover.** `getAdmin` no longer calls `research_assisted_order_admin_get`; it calls the proposed
  `research_health_quick_order_admin_detail`, which exists in no migration or candidate at `9118a82`, and an RPC error is
  an error, never a legacy fallback. Any deployment containing this commit before that RPC is installed and qualified
  would break the existing operator detail page for every assisted order. The builder's note states the same
  prohibition. This is the single most important limit of the delta. The cutover is wider than the records say:
  `repository.getAdmin` is called from `adminDetail` (`service.ts:817`), from `updateStatus` through `adminDetail`
  (`:841`), from `createDocumentUpload` (`:969`, after the `read_own` check) and from `completeDocumentUpload`
  (`:1084`), so the customer document flow and status updates are cutover-dependent too, and every such call now runs
  the envelope decoder. No runtime TypeScript caller of `research_assisted_order_admin_get` remains at `9118a82`.
- **Fixture shape.** Both new fixtures (the readback test at `:54-64` and the proposed provider-journal fixture) build
  `detail` from the 23-key TypeScript type, including `source`, `declaredAffiliateCode` and
  `declaredAffiliateCodeState`. The canonical `research_assisted_order_admin_json` emits 20 keys and none of those
  three (doc 43 S4-F0), so the authored tests cannot detect a wrapper that passes the canonical JSON through.
- **Admission.** The readback test's 401 comes from its own `admission` middleware (`:143-149`); production admission
  is `requireSupabaseAdmin`, which the test never composes. The case proves door ordering inside the fixture, nothing
  about the product's admission.
- **Existing test impact.** The only existing test that stubs the old RPC is
  `server/research/assisted-order/provider-journal-http.test.ts:214`; its four provider-hold cases would reach the stub's
  unexpected-RPC branch before their financial assertions. The proposed fixture patch `8396609…` (coordinator `95858ba`,
  unapplied, outside the approved paths) changes only the synthetic legacy stub to the new wrapper name and wraps the
  same legacy detail in explicit null evidence; its removed lines are stub data only and its 13 added lines keep every
  409 and no-effect assertion. Applying it is a test-only scope decision for Samuel.
- **New tests** are authored, NOT RUN: the readback test composes the real route table, express handler, service and
  Supabase repository over a synthetic RPC client (7 cases: unauthenticated refused, `read_all` before RPC, legacy null
  preserved, absent request → not found, path-ID binding, immutable intake across a status mutation with stale
  observation); the notifications test drives the real renderer and dispatcher with synthetic storage and transport
  (7 cases: reference-only body independent of `SITE_URL`, no customer or unknown-version template, legacy renderers
  unchanged, stable event key as idempotency, stale-claim reclaim, double-tick claim guard). Neither imports network,
  filesystem or environment.
- **Qualification state.** G1 refused and spent; no reservation; five groups remain in the window ending 21:43:37Z.

## 4. Findings

One adversarial verifier agent (read-only, 44 tool uses; output archived as `hl12/44_readback_verifier_findings.json`)
re-derived 29 claims from Git objects and upheld them, refuted two of my working assumptions (the admission case and
the "admin-readback-only" framing, both folded into section 3), and returned the findings below. Upheld facts worth
naming: the runtime diff `e7e3d44..9118a82` is exactly nine paths; the records commit is records-only; the lease
evidence covers exactly the eight new paths and the S4 lease the ninth; the amendment, approved-patch and fixture-patch
hashes all match their records; the readback test composes the real repository, service, route table and Express
handler with only the RPC client and viewer resolver synthetic, and its missing-RPC case asserts exactly one RPC call
to the new name, so any fallback to the legacy reader would fail it; the notifications test renders through the real
renderer and dispatches through the real outbox module with synthetic storage and transport; `SITE_ORIGIN` is a
literal; every fixture recipient is under `example.invalid`; no runtime producer of the envelope, template or companion
exists, so nothing activates intake.

| ID | Sev | Finding (verified) | Smallest correction |
| --- | --- | --- | --- |
| RB-F1 | **P1** (inherited, doc 43 S4-F0) | The decoder's closed 23-key `detail` binding runs before the legacy early return, and the canonical producer emits 20 keys; a wrapper that embeds today's `research_assisted_order_admin_json` output as `detail` makes the new reader refuse every request with 500. Both new fixtures hand-build 23-key details. | Bind the wrapper SQL to emit exactly the decoder's key set (or amend the decoder, which needs its own approval); add a readback case built from the canonical 20-key shape so the mismatch is visible. |
| RB-F2 | P2 (doc 43 S4-F1 carried) | The shared patch passes `response.data` raw to the decoder; the enriched branch requires `createdAt` in millisecond ISO Z form equal to `intake.confirmedAt`, while the canonical producer renders a raw `timestamptz` (`'createdAt', request_row.created_at`, column `timestamptz`), which fails the pattern; the readback test sidesteps it with a hand-built value. Legacy rows are unaffected (they return before the check). | Wrapper SQL renders `createdAt` with the `to_char(date_trunc('milliseconds', …) at time zone 'UTC', …"Z"')` pattern already used at `20261001040351…:243` and `20261001062651…:190`; one readback case uses the producer's actual rendering. |
| RB-F3 | P2 (doc 43 S4-F2 carried) | No code maps core's `attribution-v1` snapshot to the companion intake key set; the readback test hand-builds `enrichment.companion`. | Write and approve the producer mapping before the wrapper is installed; add a decoder round-trip from a real snapshot. |
| RB-F4 | P2 | Reader cutover governs the customer document upload and completion flows and the admin download path as well as admin readback (section 3); neither new test nor the records name them. | Record the blast radius in the deployment gate; add at least one document-flow case to the readback suite. |
| RB-F5 | P2 | Four provider-hold regression cases in `provider-journal-http.test.ts:204-240` fail at `:233` (500 instead of 409) with the new reader, before their no-effect and financial assertions; the only fixture path (`8396609…`) is proposed, test-only, and outside the eight leased paths. The fixture satisfies the decoder's legacy rule exactly. | Samuel's decision on the one-path scope amendment: apply `8396609…` exactly (before-hash `8a8842d3…` verified) or accept four red cases as a known gate. |
| RB-F6 | P2 | The "rejects unauthenticated admission" case tests the fixture's own middleware; it would pass against a product with no admission at all. | Compose `requireSupabaseAdmin` with a stubbed verifier, or rename the case; do not count it as admission evidence. |
| RB-F7 | P3 | Two code values can legitimately appear under two labels: the immutable intake code (1 to 64 characters of `[A-Z0-9_-]`) and the canonical M75 code (`^[A-Z0-9][A-Z0-9._-]{1,39}$`) differ for one-character, over-40-character or dot-bearing codes; the amendment sentence explains review-state divergence only; the new UI case's second assertion (`:639`) checks the fixture object, not the DOM. | Extend the sentence to cover code normalisation, or head the intake block "As submitted"; replace the fixture assertion with a DOM assertion. |
| RB-F8 | P3 | `service.ts` and `supabase-repository.ts` are named in the 2026-10-01 protected-hash amendment handoff; their edits are inside the `dc3329b` approval, but the exact protected disposition is still pending (builder's `blockedOn`). New hashes `57ea0b02…` and `274493e5…` are recorded by the builder. | Recut the protected-hash register against `9118a82` under the `dc3329b` authority before qualification. |
| RB-F9 | P3 | The forged-replacement assertion in the intake-preserved case is discharged by `decodeAdminDetail`'s fixed key set, not by the service override; the override itself is still proven by the neighbouring assertion. | None; noted. |
| RB-F10 | P3 (= doc 42 E-F7) | A renderer refusal is retryable, so a permanently malformed Quick Order payload consumes six attempts (about seven hours) before `failed_permanent`. | Return null for a malformed payload in the renderer. |
| RB-F11 | P3 | Verification artefacts (`supabase/verification/…settlement_http.ts:54`, `scripts/verify-m71-assisted-order-bridge.sh:111`) enumerate only the old reader; the wrapper name appears in no existence check. | Add the wrapper to the post-install checks when its SQL is approved. |

Predicted impact on the existing suite (static reasoning, nothing executed): only the four provider-hold cases above
turn red. Unaffected, with the reason: the five "does not disguise other database errors" cases and all ADP-01
reservation cases in the same file call `updateStatus` or a stub service directly; `http-e2e.test.ts` uses the
in-memory repository and its Supabase instance only for `getFinancialState`; `service.test.ts`, the partner attribution
test, the financial-projection, member-history, supabase-repository and declared-code tests never reach `getAdmin` or
use the unchanged `decodeAdminDetail`; the production boot and wiring probes stop at `requireSupabaseAdmin` or return
`data: null`, which the new reader maps to null as the old one did; the pre-existing UI cases carry no `quickOrder`;
`communications.test.ts` sees a pure insertion.

## 5. Verdict in the prompt 03 form

- Source and tree: `9118a82` / `5142b615…`; records `4669493`; scope the six approved paths, one three-line constant
  and two new synthetic tests.
- **SOURCE: ACCEPT WITH LIMITS.** The candidate equals the approved patch plus the recorded amendment; the amendment
  restores fields the pre-patch page already rendered and adds no mutation. Limits: RB-F1 through RB-F6; tests NOT
  RUN; the reader cutover is unconditional and reaches four call sites; the wrapper RPC exists in no migration.
- P0: none. P1: RB-F1 (inherited wire-shape contract, owned by the S4 and wrapper contract, not by these bytes).
- Qualification gaps: the two new test files, the amended UI test, the four predicted-red provider-journal cases,
  typecheck of the test dependency literals, import-time side effects of the unmocked outbox imports, microtask
  ordering of the double-tick case.
- Protected and schema authority: no SQL, manifest or protected glob touched; the protected-hash register still names
  two of the edited files (RB-F8); no RPC installed or registered.
- Release A: **no**. Release B: **no**. Deployment gate: this commit must not reach any deployable branch before the
  wrapper RPC is installed and qualified with the `detail` contract (RB-F1) and `createdAt` rendering (RB-F2) settled.
- Smallest next action: builder records the wrapper `detail` and `createdAt` contract and the four call sites in
  `SHARED_INTEGRATION_SOURCE_20261006.md`; Samuel decides the provider-journal fixture path; no rerun of anything to
  own a receipt.
