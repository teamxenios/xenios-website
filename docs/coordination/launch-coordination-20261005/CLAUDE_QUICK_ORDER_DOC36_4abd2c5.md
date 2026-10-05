# Quick Order packet `4abd2c5` / `b353092`: bounded exact-source review

**Decision on the module source bytes: ACCEPT WITH EXPLICIT LIMITS**, as an isolated, unmounted, disabled,
fail-closed source delta. **Decision on `4abd2c5` as located: NOT INTEGRABLE** (protection gate FAIL, 14 out-of-zone
runtime files). **A1 mount patch `6481c2ad…`: REVISION REQUIRED, not approved as framed.** **A2 persistence
drafting: Samuel's decision**, decidable on this packet only with the binding conditions in section 7.

This is not production readiness, real-intake readiness, database compatibility, payment, provider, partner or
hosted-action approval. Nothing in this record is an approval Samuel has not given.

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` (the configured effort actually observed; no higher
setting is claimed). Six read-only lenses plus six adversarial verifiers ran as workflow `wf_e5644ec5-fc5`
(12 agents, 612 tool calls); every lens finding was independently re-derived by its verifier and **all 45 were
upheld** (2 P1, 14 P2, 29 P3 after verifier calibration), with four further verifier-added items. Full lens output:
`hl12/36_qo_lens_findings.json`. The exact bytes behind every claim I adopt below were spot-checked by me against
`git show 4abd2c5:<path>` before adoption.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source reviewed | `4abd2c5cd4bd039309b32b97b117a67fc6a4d292`, tree `3fb70d98dc354e6a6049744b5bb15b741d5ba50b` |
| Handoff / evidence commit | `b353092ad9e49f28a65451d188c636079e1df091`, tree `cbcb0214ed6be603ff31e4cb03f9ceb45f928b55`; changes no file under `client/`, `server/`, `shared/`, `supabase/`, `scripts/`, `package*.json` relative to `4abd2c5` |
| Branch and lineage | `codex/xenios-health-quick-order-20261005`; `756a906 → d8a0d3f → 3b0048d → 03a1044 → 4abd2c5 → b353092`, linear |
| Base | integration candidate `756a906877dbc174b7e228a259d2faa9c3af48ca` (SOURCE ACCEPT, doc 35; release qualification incomplete). `756a906` is an ancestor. |
| Coordinator request | `0cc0467a37c1d8b309f36369b14fe5216423fea1` on `codex/xenios-launch-coordination-20261005` (not an ancestor); its nine `QUICK_ORDER_*` copies are byte-identical to the `b353092` originals |
| New runtime files | 22 under `client/src/quick-order/` (7) and `server/health/quick-order/` (15). `shared/health/quick-order/` has **0 files** at `4abd2c5` (lease only). |
| Protected, manifest, SQL, ledger, DAG | **unchanged** between `756a906` and `b353092` (`git diff --name-only` over `supabase/`, `server/index.ts`, `client/src/App.tsx`, `shared/`, `server/research/`, `client/src/research/`, `client/src/lib/`, `server/static.ts`, `server/vite.ts`, `MIGRATIONS.md` is empty) |
| Mount patch (A1) | `docs/health-launch/quick-order-20261005/MOUNT_PROPOSAL.patch` at `b353092`, sha256-lf `6481c2ad2d4d2828e789cb2f2e24964705562cb782d70728b4152d78dc40a672`; six targets; every before-hash equals the current bytes at `4abd2c5` (and at `756a906`, same blobs); `git apply --check` passes on a scratchpad copy; the six after-hashes equal `evidence/mount-proposal-hashes.json` |
| Successor observed, **not reviewed here** | `f1e467f` (relocation into Research zones) `→ 7b23247 → c807f19` (branch tip at review time). The regenerated `MOUNT_PROPOSAL.patch` at `c807f19` hashes `c65d7e49…92af`; the `6481c2ad…` patch is preserved under `history/…_HELD.patch`. Reviewed as a delta in the next record. |

## 2. What I executed independently (read-only worktree `C:/xenios-wt/closeout-review`, detached at `4abd2c5`)

| Run | Result | Receipt |
| --- | --- | --- |
| `node --test` on `tests/core.test.mjs` + `tests/handler.test.mjs`, pinned Node 20.19.0 | **73 / 73 pass**, exit 0 | `hl12/36_claude-qo-nodetest-4abd2c5.out` |
| Vitest, the six Quick Order files, `--maxWorkers=1 --no-file-parallelism --cache=false` | **6 files, 116 / 116 pass**, exit 0 | `hl12/36_claude-qo-vitest-4abd2c5.out` |
| Protection gate, bounded `3eaa017..4abd2c5` | **FAIL**: 121 changed (37 allowed, 34 infrastructure, 3 seams reported, tests), **14 out-of-zone violations** (all Quick Order runtime files), hash mismatch on the three pending-approval Core files plus inherited `server/static.ts` | `hl12/36_claude-gate-4abd2c5.out` |
| Protection gate, default `origin/main..4abd2c5` | FAIL (inherited 26 out-of-zone paths plus the 14 new) | same file, second section |

My 189 is kept separate from the builder's receipts (73 + 111 at `3b0048d`; 10 at `4abd2c5`). The two counts
differ only because `containment.test.ts` grew from 5 to 10 tests between `3b0048d` and `4abd2c5`; no other runtime
file changed between those SHAs (blob identity checked). None of these runs is a full-App, typecheck, build, browser
or database proof.

## 3. The four decisive proofs the coordinator asked for

| Proof | Result | Basis |
| --- | --- | --- |
| Real adapters | **NOT PROVEN** | `production.ts` exists and is fail-closed (`productionReady:false`, `config.enabled:false`, `commit()` throws, `getExisting()` throws without the canonical extension), but no production composition binds `createQuickOrderCanonicalCatalog`; the `visibility` and `destinationEligibility` ports have no implementation; `approvedHealthAgreementPairs` is empty by construction; the shipped page transport sends cookies only, so the member branch of `production.session` is unreachable through it. |
| Durable request / evidence / idempotency | **NOT PROVEN** | No schema exists; `PERSISTENCE_PROPOSAL.md` is a proposal with four unresolved design points (section 7). Only fake-port handler tests exist, which the packet itself labels "without claiming database concurrency". |
| Operator readback | **NOT PROVEN** | `OperatorDeclarations.tsx` is imported by nothing outside its own test; no admin wiring exists; `getExisting` is "Missing in canonical repository" per the packet. |
| Actual route proof | **NOT PROVEN** | The patch is unapplied; no full-App run exists at any SHA. The 10 containment tests run against a miniature mirror of `server/index.ts`, not the real composition. Source analysis supports the exact-route and exact-redirect claims (`PUBLIC_DOCUMENT_REDIRECTS[rawPath]` is an exact key; wouter route is exact), but that is reading, not execution. |

## 4. What is confirmed at source (why the module bytes are acceptable in isolation)

- **Scope and reuse.** No second ledger, payment system, auth backend or public admin endpoint. The demo DOM
  package, its fixtures and its green/sticky/body-reset CSS were not transplanted. Body and e-mail never authenticate;
  `actorId` derives solely from the canonical viewer resolver; the handler re-parses `req.rawBody` and ignores
  `req.body`.
- **Fail-closed boundaries.** CSRF is HMAC-SHA256 over (actorId, session binding) with a 32-byte-minimum secret and a
  timing-safe compare; exact HTTPS `Origin` plus `sec-fetch-site`; actor-then-network rate limits with
  deny-on-failure and `unknown` denied; 64 KiB enforced on raw and upstream bodies; replay lookup precedes every
  new-write gate; `safeReceipt` refuses malformed success; non-`InputError` failures become a fixed 503; no demo terms
  can be served; no environment flag enables intake anywhere under `server/health/quick-order`.
- **Catalog truth.** Exact viewer passthrough; Health visibility applied before totals with `null`/non-boolean never
  granting; bounded complete 100-per-page scans, 24-per-page public pagination, visible-only totals; duplicate,
  identity, wrong-page, truncation, total-drift, content-drift and visibility-drift all rejected; provider, RUO, held,
  `availability_review` and `request_activation` rows never requestable (family floors for provider and
  non-merchandise from the same `pathway-authority.ts` sets the member lane uses); Care price nulled; zero price
  refused; unstated cap and absent destination authority fail closed; no private field in the projection.
- **UI fidelity at source.** Real `PublicShell`; CSS scoped to `.qo-root` with no body reset; black 4 px primary with
  1 px ink border; outlined secondaries; 3 px `#7C3AED` focus; teal only as a 3 px support rule; controls at or above
  44 px; focusable field-linked error summary; review invalidates on change; receipt copy says no payment, no
  prescription, no approval, no commission; no card, ID or medical field; no browser storage, beacon, console or
  `innerHTML`; `?ref=` only pre-fills an editable declared code after a regex gate and resolves no role.
- **Attribution authority.** Declared and trusted stay distinct; `reviewState` is only `direct_no_referrer` or
  `captured_unmatched`; `commissionState` pinned `not_authorized`; naming a gym, clinic or person is free text with no
  lookup or grant.
- **Unavailable page as mounted by A1.** `sessionKey={null}` renders only the heading and a `role="status"` notice
  inside the shell: no form, no fetch, no storage. The containment answers a non-echoing 503 before any parser,
  rawBody verifier, gate or auth.
- **Receipts.** Every log SHA-256, the 22-file source hash set, the 14 protected baselines, the package file hashes
  (27/27) and the NOT RUN disclosures re-derive from immutable Git objects.

## 5. P1 findings (exact paths, smallest repair)

| ID | Finding | Smallest repair |
| --- | --- | --- |
| **QO-P1-A** (lenses QO-MOUNT-02, QO-EV-01; my gate run) | All 14 non-test Quick Order runtime files at `4abd2c5` are outside every `allowedWriteZones.prefixes` entry of `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` and classify as gate **violation** (`scripts/acceptance/verify-core-site-protection.mjs` `classifyPath`). The manifest's own comment says a new surface is "deliberately NOT pre-approved". A "path lease" is coordination metadata, not a manifest amendment. A1 would bind the `server/index.ts` seam to one of these files. | Relocate into existing allowed zones (the builder's `f1e467f` does this; pending delta review). Do **not** widen the manifest to pass. Record an actual gate run in the packet. |
| **QO-P1-B** (QO-MOUNT-01, QO-EV-01) | A1 as framed ("six before/after pairs plus a path lease") omits that two targets are **HARD** `fileHashes` tripwires: `client/src/lib/tracking.ts` `258eda22… → 8d62f7a1…` and `client/src/lib/attribution.ts` `2c406d8a… → 6b1ab473…`, whose seam allowance covers only the exact `/health` gateway and `/r`. Applying it creates two **new** hard mismatches on top of inherited `static.ts`, and adds a second unreviewed delta to the already-off-baseline seams `client/src/App.tsx` (`1bc59371… → 44ac3e13…`) and `server/index.ts` (`ba5800e6… → 7f3c19cb…`), so a later GATE-01 re-cut could no longer be made to the HL-17 bytes alone. The packet never says any of this; `APPROVAL_MATRIX.md` says "Protected manifest successor: not requested here." This is a disclosure and sequencing gap, not concealment. | Regenerate the packet so Samuel sees four protected successors by class (two HARD pairs, two seam pairs) and is asked for the doc 30 style exact old-to-new pair approval, sequenced with his GATE-01 disposition; the protection owner then re-cuts in its own records-only commit. Already adopted by the coordinator as "REVISION REQUIRED AFTER SOURCE RELOCATION". |

## 6. P2 findings: conditions before intake, qualification or the A2 commit candidate

None blocks the two pending decisions by itself. Each cites the exact anchor at `4abd2c5` or `b353092`.

| ID | Lens IDs | Finding | Smallest repair |
| --- | --- | --- | --- |
| QO-P2-01 | mount verifier | `MOUNT_PROPOSAL.patch` edits two HARD privacy predicates, adds a route and a private-document entry, and carries **zero** test changes; every existing pin enumerates only the exact `/health` gateway (`tracking.test.ts:87-88`, `attribution.test.ts:33-35`, `shared/care/paths.test.ts:38-50`, `PwaLifecycle.test.tsx:74`, `App.routes.test.ts:27`, `raw-http-document-policy.test.ts:267-275`). A later re-cut would hash-lock bytes with no regression pin for the intake path. | Condition A1 on the same reviewed delta adding: `isHealthIntakePath` positive and negative cases (`/HEALTH/Quick-Order/`, `?ref=`, `//health/quick-order`, `/health/quick-order/x`, `%2F`), `trackingBlockedHere`/`documentPrivacyZone` and `isSensitiveAttributionLocation` cases, the `App.tsx` route pin, a resolver `registered_private_document` pin, and a `serveStatic`/vite direct-navigation 200 + `noindex` test. |
| QO-P2-02 | QO-MOUNT-03, UI verifier, QO-EV-05 | `client/src/pwa/PwaLifecycle.tsx:47-60` `isPwaInstallLocationAllowed` suppresses only `isHealthGatewayPath` (exact `/health`) and `SENSITIVE_ROOTS` (no `/health` entry), so the install pill (`position:fixed; bottom:1rem; z-index 2147483000`) stays eligible on `/health/quick-order`. Acquisition overlay, not a leak, on the A1 page; on an enabled intake page it would sit over the submit control at mobile widths. `PwaLifecycle.tsx` is HARD-pinned (`sha256:9594f398…`). | Before intake: add `isHealthIntakePath(pathname)` to the predicate and pin `/health/quick-order` false in `PwaLifecycle.test.tsx`; this needs its own exact old-to-new pair approval. Disclose the limitation in `APPROVAL_MATRIX.md` now. |
| QO-P2-03 | QO-MOUNT-04, P2-2, QO-EV-02 | `containment.ts:13-14` compares the literal `req.path` case-sensitively, while Express 5 routes case-insensitively and `handler.mjs:72,74` matches the WHATWG-normalized pathname. `POST /API/health/quick-order/requests`, `/api/health/x/../quick-order/requests` and `/api/health/quick-order\requests` bypass the boundary, are parsed by `express.json` (rawBody retained for the request) and get the `/api/{*rest}` 404. No sink exists today (logger redacts to `/api/[redacted]`), so parse-then-discard, not a leak; but it defeats the boundary's stated purpose and the legacy model it mirrors is an `app.post` route (case-insensitive). | Containment and handler must share **one** path derivation and predicate (WHATWG pathname, lower-cased or anchored case-insensitive, interior empty segments rejected). Add case, dot-segment, backslash and `%2e%2e` cases to `containment.test.ts` asserting the parser and verifier are not reached. Fixable in `containment.ts` plus its test; does not re-touch the six patch targets. |
| QO-P2-04 | P2-1 | `handler.mjs:70-71` throws a 400 `invalid_request` for any `originalUrl` starting with `//` or not `/`-prefixed **before** `:136 ownsPath()` decides namespace ownership, and the catch at `:205-206` sends the 400 instead of `next()`. Root-mounted as `INTEGRATION.md` prescribes, SPA document paths such as `//research/...` or absolute-form targets would get a Quick Order JSON 400. The sibling `createQuickOrderErrorHandler` at `:217` does it right (try/catch then `next`). The `//` refusal is load-bearing inside the namespace (`new URL('//evil.test/x', origin)` adopts the attacker host), so the fix must keep it there. | Derive ownership without throwing; `next()` for malformed targets outside the prefix; keep the 400 only inside it. Add tests: `//other` and an absolute-form target call `next()`; `//api/health/quick-order/requests` still refuses. |
| QO-P2-05 | P2-3 | `legal.ts:21-25` can only ever emit the published Research Use Policy pair `early_access_terms/v1` (any other kind or version returns `null`), whose text states materials are "not offered for human or veterinary use" (`policies-data.ts:27-28`). Quick Order refuses every RUO row and omits the RUO acknowledgment, so the pending "Health agreement applicability" decision has exactly one enabling option and it is the wrong document. Fail-closed today (`approvedHealthAgreementPairs` empty) and disclosed (`SOURCE_MAP.md:10`, `APPROVAL_MATRIX.md:17`). The linked URL sits behind `researchPageGate`; reachability for a Health customer is NOT PROVEN. | **Samuel: do not approve `early_access_terms/v1` as the Health pair.** Before intake: a real registry or document adapter for approved Health terms on a Health-reachable route, keeping `legal.ts`'s exact-pair plus published-bytes discipline, with tests proving the research-use pair is refused for Health even when listed. Record as an A2 dependency. |
| QO-P2-06 | CAT-01 | `catalog.ts:93-98` computes `requestable` as a pure negative filter; positive Health classification is delegated to the unbound `visibility` port, which the type comment describes as viewer authorization. Any master family outside the three provider, one non-merchandise and three upstream RUO sets would be requestable by default (`MASTER_OFFERING_FAMILIES` also holds `research_vials`, `blends`, `laboratory_supplies`, `diagnostics`, `quantum`, `programs`, `education_and_tracking`, `white_label_and_partners`). Against the committed member-safe dataset (424 rows) the filter leaves exactly 23 candidates (20 supplements, 3 topicals), all commerce-bound. The adapter also has no RUO family floor of its own (trusts `item.researchUseOnly`). | Before A2 drafting: an explicit positive Health-classification port consulted in projection and `resolveItem`, or rename and document `visibility` as classification plus authorization; add a fail-closed test that an unlisted family is not requestable without an explicit grant; persist the classification decision and its `sourceVersion` per line in the A2 candidate. |
| QO-P2-07 | UI-01 | No rendered evidence exists for the repo React page in the real shell: `QUALIFICATION.md:91-94` records browser, build and aggregate NOT RUN; `QuickOrderPage.test.tsx:8` mocks `PublicShell`; no test renders the default export; the vendor PNGs exercise the demo DOM package, not this code. | Before intake or qualification: the approved browser batch on an applied, session-bound successor with computed styles for `.qo-primary`, focus ring, 44 px minima, 320/390/768/1024/1440 widths, 200 %/400 % zoom, keyboard path under the sticky `.clarity-nav`, and a single header/main/footer. |
| QO-P2-08 | UI-02 | TypeScript was never compiled for the new `.ts`/`.tsx` (`QUALIFICATION.md:85-90`, resource-deferred with receipts at 820 and 1,642 MiB). Vitest strips types. A read-through found no obvious error; that is reading, not a run. | `tsc --noEmit` on the branch under the pinned toolchain once the memory threshold is met; attach the receipt before any mount or intake decision. |
| QO-P2-09 | A2-P1-1 (verifier: P2, conditions rather than blocks drafting) | `PERSISTENCE_PROPOSAL.md:13-17,68-72` names every new object `research_assisted_order_quick_order_*`. ADP01 fingerprints every function `proname like 'research_assisted_order_%'`; ADP-G1 (`20261001160730…sql:16-31`) extends that to relations, columns, constraints, indexes, triggers and policies matching `research_assisted_order_%` or `research_notification_outbox`, seals the fingerprint into the fence comment, and `research_assisted_order_provider_settlement_integrity()` (`:361-373`) raises `55000` on drift; `provider-journal.ts:211-219` converts that into `provider_journal_unavailable` before every reservation and journal, a platform-wide provider freeze. A `20261005` candidate sorts after G1, so the source-order collision is certain; hosted install state is NOT PROVEN (the Supabase MCP rejected its header this session; no query was run). | Binding naming condition on A2: name all new objects outside the `research_assisted_order_` prefix (for example `research_health_quick_order_*`) and add no triggers, columns or indexes to `research_notification_outbox`; **or** include an explicit ADP fence re-seal co-designed with the ADP owner. The disposable verifier must call the provider authority RPC after installing the candidate; name-only review will not show the freeze. |
| QO-P2-10 | A2-P2-1 | The proposal does not state which canonical `source` value Quick Order rows carry. `research_assisted_order_requests_source_chk` is `check (source = 'early_access_manual_order_bridge')` (bridge `:130-131`, never altered); status-recovery filters on the literal at four sites (`20260927203000…sql:110,148,242,300`); `contract.ts:8,369`, `supabase-repository.ts:197`, `ports.ts:118`, `memory-repository.ts:245` hard-code it. Reusing the literal makes Quick Order rows recoverable through the existing public-reference plus e-mail recovery flow (which mints a status delivery), a reader the proposal does not name; a new literal contradicts "existing canonical tables unchanged". | State the decision in the proposal. Recommended: reuse the literal, make the companion row the only discriminator, render "Quick Order (Health intake)" from the join in the operator reader, and disclose the recovery-flow consequence. |
| QO-P2-11 | A2-P2-2 | `CommitArguments.snapshots` (`ports.ts:36-42`) carry only `productId/variantId/quantity/workflowMode/unitPriceCents/catalogVersion/priceVersion`, while `research_assisted_order_lines` requires NOT NULL `product_name`, `customer_action_label`, `minimum_quantity`, `quantity_increment`, `authoritative_fingerprint` (bridge `:189-208`); `catalogVersion` is a `qo-v1:<sha256>` digest, "NOT a transactional version guard" (`catalog.ts:122-124`). The extension signature (`ports.ts:59-62`) has no slot for the server-derived `affiliate_attribution_ref` and `production.ts` wires no resolver, so rows would silently carry null trusted attribution despite the proposal's claim. Declared code vocabularies differ: Quick Order `^[A-Z0-9_-]{1,64}$` (`core.mjs:75-76`) versus the canonical CHECK `^[A-Z0-9][A-Z0-9._-]{1,39}$` (M75 `:67-70`); a raw 1..64 value aborts the RPC (customer told to retry; the identical `payloadHash` fails deterministically: a lost order). | Amend the proposal: the extension re-resolves every line through the canonical `catalog.resolveLine` inside the server and the RPC guards both canonical and `qo-v1` identities; extend the signature with the resolver-derived `verifiedAffiliateAttributionRef`; write the M75-sanitized value and state to the canonical columns and keep the raw string only in the companion as evidence, with the operator projection showing both. |
| QO-P2-12 | A2-P2-3 | "Reuse the existing outbox and retry dispatcher" is only partly true: `event_key` uniqueness gives insert-once idempotency, but the dispatcher returns `unknown template` for any key the four assisted-order renderers do not recognize (`outbox.ts:466-475`; `communications.ts:164,190,233,252`) and walks the backoff ladder to `failed_permanent`; the HL12 outbox guards pass a new row only with null financial FKs, non-reserved `event_key` and template shapes; status `held` is reserved for audited financial intents (liveness, not guard). | Specify: `event_key` `assisted-order:<canonicalRequestId>:quick-order-submitted:admin`, a new template key under the assisted-order renderer namespace, status `pending`, null financial FKs, payload limited to `publicReference` plus `adminPath`, inserted inside the commit RPC; list `server/research/assisted-order/communications.ts` as a disclosed existing-file dependency with its baseline hash. |
| QO-P2-13 | A2-P2-4 | Quick Order `actorId` is `member:<authUserId>` or `early_access:<earlyAccessCustomerRef>` (`production.ts:48-57`); canonical rows use `actor_member_id` (member row id) or a per-session sha256 (`express.ts:142-145,163-165`) and a globally unique `idempotency_key_hash` derived as `hash(email\0key)` (`service.ts:375-377`); status-recovery (`:244-247`) already uses the same prefixes over **different** id spaces. Early-access replay would be customer-ref scoped (broader than the session-bound canonical identity); an unnamespaced hash could collide with a legacy key. | State the mapping (memberId and session hash from the viewer, customerRef only in the companion); derive `idempotency_key_hash` as `hash('quick-order-v1\0'||actorId||'\0'||key)`; lock the companion actor/key first and treat a canonical 23505 as a conflict; declare that no status access token is minted. |
| QO-P2-14 | persistence verifier | The legacy submit refuses unless `submissionStanding.accepted(viewer)` is true (`service.ts:357-367`), which in production requires a live `earlyAccessSessionHash`, a non-empty `earlyAccessCustomerRef` and the durable `agreementGate.accepted(customerRef)` RPC (`production-deps.ts:104-118`). Quick Order's `production.ts:45-58` admits any member with memberId, authUserId, Bearer and the blanket `assisted_orders:submit` capability, without a customerRef or session hash, and the handler checks only body pairs against config. The proposal says the commit must "guard canonical actor/standing" but names no standing authority and the A2 path list has no standing port. | Before drafting: name the acceptance RPC/table and the required-pair source; state that viewers without a bound customerRef are refused (or justify admitting them); add a standing port to the Quick Order production wiring. |
| QO-P2-15 | persistence verifier | The proposal pins only the bridge and M75 as "source predecessor anchors", yet the triggers that fire on the exact rows the commit inserts come from five later migrations (`20260930193033` paid-hold on requests; `20260930202413`, `20261001062651` (also takes `FOR UPDATE` on the request row) and `20261001115512` on events; `20261001040351` and `20261001062651` on the outbox). With only two anchors the precheck either cannot see these guards or must treat them as unknown drift. | Enumerate the five files plus the ADP fence chain as reviewed predecessor anchors with hashes; make the postcheck assert exactly these triggers remain enabled after the candidate installs. |

## 7. The two pending source decisions (information for Samuel; nothing recorded as approved)

### A1: apply `MOUNT_PROPOSAL.patch` `6481c2ad…` (now HELD by the coordinator)

- **Technically coherent and, as an unavailable page, privacy-correct.** No path was found by which the mounted page or
  the root containment collects, retains, logs or leaks customer data. The `tracking.ts`/`attribution.ts` hunks are
  **load-bearing**, not cosmetic: at `4abd2c5` before the patch, `/health/quick-order` is a public zone for the Meta
  Pixel (`tracking.ts:35-44` blocks only `/research`, `/r`, `/care`, exact `/health` and recovery hashes), so a visit to
  `/health/quick-order?ref=CODE` with a pixel id configured would send the full href including the declared code to a
  third party. The six hunks must be applied together; the `App.tsx` hunk alone would have been a P1.
- **Must not be approved as framed** (QO-P1-B). The regenerated packet should present four protected successors by
  class, sequence with GATE-01, and carry the regression pins in QO-P2-01. After relocation the import paths in the
  `App.tsx` and `server/index.ts` hunks change, so the `6481c2ad…` bytes are superseded regardless; the successor's
  `c65d7e49…` patch is reviewed in the next record.
- Smaller items to carry: the Suspense fallback differs from every sibling route (`<div aria-busy>` versus
  `container-x` with 96 px top padding; cosmetic shift); the private registration is an inline `addPrivate` rather than
  a `KNOWN_NOINDEX_EXACT_PATHS` entry (identical classification; reviewability); contained hits are not logged (same
  as the two existing pre-parser containments; a deliberate decision, not an accident, is all that is asked); the
  intake document carries no CSP (helmet already sends `Referrer-Policy: no-referrer`); the packet's node tests are
  outside the vitest include and `npm run check` never type-checks `.mjs`, so a later aggregate run must not be read
  as covering them.

### A2: permit drafting the persistence candidate, verifier and modules (source-only)

- The proposed shape (request-ID-keyed append-only companion, server-derived actor/key unique, service-only replay
  reader, one RPC transaction writing request, lines, event, companion, receipt and outbox row, forced RLS,
  service_role-only EXECUTE) is the same RPC-only pattern the bridge already uses and is INSERT-compatible with every
  later guard I could read: a `submitted` request insert meets only the paid-hold guard (returns NEW for non-paid);
  every ADP/HL12 guard on requests is BEFORE UPDATE; the three BEFORE INSERT guards on events pass a `submitted`
  event; the two outbox guards pass an ordinary row with null financial FKs.
- **If Samuel grants drafting, these are binding conditions** (each is a P2 above): naming outside the ADP fingerprint
  prefix or a co-designed re-seal (QO-P2-09); the canonical `source` decision (QO-P2-10); the commit contract
  re-resolving lines and carrying trusted attribution, with the declared-code vocabularies reconciled (QO-P2-11); the
  outbox specification (QO-P2-12); the identity and idempotency mapping (QO-P2-13); a named standing authority
  (QO-P2-14); the complete predecessor-anchor set (QO-P2-15); a Health legal document path (QO-P2-05); a positive
  Health classification decision (QO-P2-06); a disposable verifier that calls the provider authority RPC after install.
- **What A2 as written does not cover**: the disclosed existing shared files (baselines in
  `evidence/proposal-baselines.json`, including `communications.ts`, `express.ts` and the attribution resolver wiring
  the design would need); any SQL execution (a local disposable run needs its own host and slot check); the
  currentness/revision authority object, which the proposal calls "intentionally unresolved" and lists no path for,
  so the `_commit` body cannot reach a reviewable state under A2 alone (recommend: grant replay-reader, companion and
  verifier drafting plus a design note, and require a separate exact proposal for the revision authority before the
  commit RPC body is drafted); and the D/E source-only schema grant (doc 31 section 2 is D/E-specific and does not
  extend to Quick Order SQL). Everything stays unregistered and unapplied; no managed migration or hosted mutation is
  authorized by anything here.
- Estimate and band facts for the drafter: `requests_total_chk` and `lines_estimate_chk` need a 0 known subtotal
  mapped to null and `line_estimate_cents` computed in SQL; `lines_price_pending_chk` requires null unit price for
  `request_pricing`, which `core.mjs:126-130` does not null; the real callbacks emit `maximumQuantity = 100`
  (`EARLY_ACCESS_POLICY_MAX_QUANTITY`), not the 50 every Quick Order fixture uses, and the "effective cap 50" in docs 33
  and 35 belongs to the subscription ProductPage lane; the handler's commit snapshot drops the band, so the candidate
  must re-resolve the authority inside its lock. Samuel still has to confirm 100 versus 50 for Health intake.

## 8. Source-safe integration versus real intake readiness

| Question | Answer |
| --- | --- |
| Can `4abd2c5` be integrated as located? | **No.** Gate FAIL on 14 out-of-zone runtime files. |
| Can the module bytes be integrated after relocation? | **Pending the delta review** of `f1e467f..c807f19`: relocation purity (renames only, import rewrites only), the regenerated patch's before-hashes against current bytes, the four-class disclosure, and a passing bounded gate. |
| Is real customer intake ready? | **NOT READY.** Real adapters, durable persistence, operator readback and route proof are all NOT PROVEN; the legal pair, Health classification, visibility, destination authority and standing authority are unbound; typecheck, build, browser and database proofs do not exist. |
| Is anything live affected? | **No.** Production (`79414143…` per the packet) is untouched; nothing is mounted; the adapter cannot be enabled by any flag; the package demo and fixtures are not mounted. |

## 9. Exact protected, schema and hosted approvals still missing

- Samuel's exact old-to-new pair approval for the three Core files (Navbar `e37a5b94… → 6cdfbb0f…`, Footer
  `25da700f… → 420b45dc…`, index.css `70d3302a… → b475a8ee…`), and the protection owner's manifest re-cut after it.
- Samuel's GATE-01 / Access Hub disposition (`static.ts` HARD mismatch; `App.tsx`, `server/index.ts`,
  `server/research/index.ts` seams).
- For Quick Order: the four protected successors a regenerated A1 would create (two HARD, two seam), each as an exact
  pair; a later HARD pair for `PwaLifecycle.tsx`; the zone question is answered by relocation, not by amendment.
- Any Health legal pair (none exists; `early_access_terms/v1` should not be it).
- Any managed SQL registration or apply (none authorized; A2, if granted, is source-only and unapplied).
- Any hosted mutation, real intake, payment or provider activation, partner activation, imagery publication or
  production deployment (none).

## 10. Carried release holds and evidence still required (unchanged)

MC-01 runtime precondition chain; D/E candidate SQL unregistered with browser, delivered-bytes, canonical reader/writer,
Product Control ingestion and database qualification open; subscription's six real-buying blockers, PS-R2, PS-R3, and
the 100-versus-50 policy; Finance F1, refund/void/dispute, ADP-G2/G3/G4, LENS-01 adoption and the failed aggregate;
Core clean-checkout aggregate, native 200 % zoom, keyboard traversal and forced-colors; the integration candidate's
full aggregate (DEFERRED), exact-768 and CLS browser items. A Quick Order receipt is not a purchase, prescription,
shipment or paid commission.

## 11. One next bounded action for the existing owner

The relocation (`f1e467f`) already exists, so the owner's next slice should wait for my delta verdict on
`f1e467f..c807f19` and then be exactly this, in the leased directories only, with no protected file and no SQL:
unify the containment and handler path derivation and predicate with the case, dot-segment, backslash and `%2e%2e`
tests (QO-P2-03), fix the root-mount `next()` asymmetry with its two tests (QO-P2-04), and correct the packet's
disclosures (QO-P1-B four-class table, QO-P2-02 PWA limitation, the unreceipted 706 MiB figure, the lease statement
for the three shared registries, the runner split). No A2 drafting, no mount application and no further surface
until Samuel decides A2 and the regenerated A1 on the relocated bytes.

## 12. P3 items (recorded, not conditions)

Mount: QO-MOUNT-05 (contained hits unlogged), -06 (Suspense fallback), -07 (inline `addPrivate`), -08 (no CSP; the
Referrer-Policy half was refuted, helmet sends it). UI: UI-03 (invalidate clears every field error), -04 (default export
untested), -05 (container tokens), -06 (hardcoded border and error hex), -07 (44 px compact buttons versus Core
52/56/60/64 px `.btn`; a founder or Core decision, not a defect; should cover weight, size and hover), -08 (transport
identity as effect dependency), -09 (copy promises a request-history surface that does not exist), -10 (live region
wraps the whole list), -11 (`?ref=` parsed on the unavailable page), -12 (review and unresolved panels render
together). Catalog: CAT-02 (band 100 unstated), -03 (double scan builds 2×⌈N/100⌉ services and prices 848 rows per
request at N=424), -04 (destination refusal misreported as `catalog_changed`), -05 (`catalogVersion` is a constant file
path), -06 (`resolveItem` with null visibility throws rather than returning null; no price/priceVersion pairing check
in the adapter), plus the missing RUO family floor. HTTP: P3-1 (`ports` object mutable; "not flag-enablable" is a
composition fact), -2 (rate limiter mocked in its own tests), -3 (session resolution precedes any limiter; members
admitted without binding), -4 (default transport cookies-only). Persistence: A2-P3-1 (estimate CHECK mapping), -2
(revision authority outside the A2 path list). Evidence: QO-EV-02 (wording broader than the 10 tests), -03 (706 MiB
unreceipted), -04 (lease omits the three shared registries; `updatedAt` not bumped), -05 (PWA informational); dotted
`.precheck.sql` naming differs from the `_precheck.sql` convention. Evidence corrections adopted: the reconciliation
file holds one commerce hold (GRP-0422, RUO, unbound), not zero; the durable band check is the CHECK at bridge
`:212-217`; the client fetches `/catalog` on page change or search submit, not per keystroke; `MasterOfferingCatalogService`
filters GRP-0364 from every customer read, so the committed dataset presents 423 rows, not 424; `production.test.ts`
sits beside the modules, not under `tests/`.

## 13. Not proven, stated plainly

Full-App behaviour of any route; TypeScript compile of the new modules and of the patched imports; wouter and Express
case semantics (asserted from library source, not executed); real proxy normalization of `//`, dot segments and
backslashes; the canonical origin value (apex versus www); member transport binding; reachability of
`/research/policies/research-use` for a Health customer; live catalog totals and the real Health visibility,
destination and classification policies; hosted schema census and hosted absence of the candidate names; every
durable and concurrency property of the proposed design; whether the recorded test processes ran as self-reported
(immutable artifacts verified, not the runs); the 47-pass package baseline (copied from another chat, honestly
labelled). Where the packet says NOT RUN, I say NOT PROVEN, never PASS.
