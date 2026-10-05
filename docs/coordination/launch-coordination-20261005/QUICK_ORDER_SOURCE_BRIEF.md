# Codex: Quick Order implementation plus existing website continuation

## Mission and ownership

Implement the extracted Quick Order package in `teamxenios/xenios-website` while continuing the existing website integration and release work. Quick Order is request intake, not payment checkout, paid membership, a subscription activation, or clinical approval.

Use the requested Codex model/effort if available. Report the actual setting; a prompt does not change it. Reuse the existing coordinator and independent Claude reviewer. Do not spawn a second coordinator, replace the existing integrator, or reopen completed source lanes.

The current integrator must finish its existing bounded smoke, evidence and handoff without Quick Order source changes. Its observed candidate is:
- Branch: `codex/accepted-source-integration-20261005`
- Source: `756a906877dbc174b7e228a259d2faa9c3af48ca`
- Tree: `787432948d9464880df1dcfc5dff58eec7d889aa`

This is a checkpoint to verify, not an instruction to reset to old bytes. The integrated candidate is not independently accepted merely because its individual inputs were accepted.

Locate an existing Quick Order task first. If none exists, create exactly one isolated Quick Order child task/worktree, suggested branch `codex/xenios-health-quick-order-20261005`. Start from the verified integration source, explicitly recording its pending acceptance. Do not write into the integrator's worktree or mutate the candidate under qualification. Reconcile any later accepted-base correction before Quick Order integration.

Parallel source development is permitted; qualification must use the actual available compute. Local worktrees are not independent CPU/RAM. Run at most one build, aggregate, browser-batch or database proof at a time on this host. A blocked launcher is BLOCKED, not RUNNING. Do not repeatedly create replacement sessions or delete volumes, worktrees, evidence or dependencies to make space.

## Read first and establish a usable implementation brief

Read `AGENTS.md`, `.xenios/MASTER_CORPUS.md` and its mandated current ownership/release records. Follow current instructions, not stale tasks quoted in old handoffs.

The full `quick-order` folder is already extracted locally. Use the attached folder/workspace reference or the coordinator's known extracted path. Do not ask Samuel to upload it again merely because an old sandbox link is unavailable. Read:
1. `README.md`
2. `docs/CODING_SESSION_PROMPT.md`
3. `docs/INTEGRATION.md`
4. `docs/ACCEPTANCE.md`
5. `docs/SOURCE_EVIDENCE.md` and `docs/TEST_SCOPE.md`
6. `integration/ports.d.ts`, `integration/QuickOrderPage.tsx`
7. `src/core.mjs`, `src/handler.mjs`, browser assets and tests.

Record the package version/hash, exact repo base, task/session ID, intended path leases and actual runtime. The package's `b0e818f...` reference is historical. Do not copy it over newer work.

Also read founder record `cd66f3c411e6164981295d81c2116e50343edc86`, the existing protected-file authorization and the current consolidated acceptance chain. Those preserve approved design and release boundaries. D/E-specific schema permission is not blanket Quick Order schema permission.

Produce a compact path/port map, then implement. Do not stop after a plan while non-blocked source work remains.

## Required outcome

Target customer path: `/health/quick-order`.
Target handler prefix supplied by the package: `/api/health/quick-order`.
These are intended routes, not live links.

A customer must be able to discover the current authorized Health-request catalog, choose exact variants/quantities, enter mandatory customer/referral/affiliation information, review it, and submit a durable request into the existing operator workflow. Only a confirmed authoritative write produces a reference. Validate the client success envelope and receipt identity as well as HTTP status; a 200/201 response with malformed or missing receipt fields is not success.

Preserve the package's required inputs and enum vocabulary:
- full legal name, valid email and US phone;
- US address including state/DC and ZIP; line 2 optional;
- billing-address choice and full separate billing address when different;
- explicit 18+ declaration, not an identity-verification claim;
- required referral-source category and source detail except for direct/no-referrer;
- optional declared referral code;
- required affiliation category and name when applicable, or explicit no affiliation;
- referral-information confirmation, published agreement versions and request acknowledgement;
- at least one permitted exact variant and canonical valid quantity.

Direct/no-referrer and no-affiliation are valid explicit answers. Do not force invented source names, apartment numbers or referral codes. Do not add mandatory marketing consent, card fields, government-ID upload or medical-history narrative.

## Preserve the approved premium UI

Use the actual Xenios Health public shell and its approved design tokens. The package is a functional starting point, not a newly approved visual system.

Do not import its green primary buttons, large rounded panels, duplicate `xenios / health` site header, demo body reset or unrelated font/focus defaults as final site design. Preserve useful form structure while adopting the current typography, spacing, black rectangular primary CTA, restrained outlined secondary, purple focus and supporting teal. Keep admin styles unchanged.

Prefer the supplied React wrapper and isolated component if they integrate cleanly. Port to native components only where required; preserve the validation/request contracts and test behavior. Do not rebuild the whole website or introduce a new framework.

Design a clear catalog -> details/referral -> review -> receipt journey. Use visible required labels, appropriate autocomplete, conditional-field semantics, focusable error summary, field-level errors, loading/empty/unavailable states and a mobile order summary that does not obscure controls. Changing selections after review requires re-review.

Keep personal form values in memory only as specified. Do not add localStorage/sessionStorage persistence. Explain loss on refresh/close; a secure draft system is a separate feature. Test unmount/remount and stale async responses without double handlers or cross-account data retention.

If approved ProductMedia is reused, use only authoritative optional descriptors and the established truthful fallback. No new renders, invented packaging or imagery-based eligibility. Real image delivery must not become a prerequisite for this form's source implementation.

## Canonical catalog and requestability

Bind the existing authorized master-offerings/assisted-order catalog. Do not import a CSV, historical catalog, hardcoded price book or demo rows as production data.

The package pages exact variants in groups of 24. Offering counts are not variant counts. Implement every page and search result with accurate viewer-authorized totals; prove completeness against the current canonical snapshot. Do not assert all historical 423 targets belong in this Health form. Do not expose restricted identities or counts to prove completeness.

Preserve separate direct request, provider request, request-pricing, request-activation and unavailable states. The package explicitly prohibits held and research-use-only rows from submission through this Health form. Display them only where the canonical visibility policy permits; otherwise exclude them entirely. Do not relabel Research goods as Health goods to widen the catalog.

Unknown classification or missing authority must fail closed. Care interest is provider routing, not a medication purchase. Do not disclose Care medication prices through this projection. Unknown prices stay pending, never fabricated as zero. Known subtotals are estimates, not accepted quotes.

Re-read product/variant identity, current price/catalog versions, minimum/maximum/increment, state/serviceability and allowed pathway at submission AND the decisive transaction/version-guard boundary. The package's default quantity maximum is not authority to raise existing caps. Use the actual canonical limits, including 50 where applicable; never globally change them to 100.

Do not weaken any required non-image authority. Media optionality must not become a bypass around MC-01's still-unapplied database compatibility requirements.

## Implement the real ports, not interfaces alone

Use `integration/ports.d.ts` as the explicit adapter contract. For every port, report the actual existing service/function and remaining qualification:

- `session`: existing authenticated account or already-authorized server-issued guest session; stable actor and session-bound CSRF. Email/body actor IDs are not authentication. No new auth backend or automatically issued partner role.
- `config`: current published, versioned legal/form acknowledgements with readable approved documents. Missing/invalid terms disable new requests. Never ship `demo_terms`.
- `listCatalog`: canonical authorized variant pagination and allowlisted public fields. No supplier costs, margins, private quality packets or hidden Product Control fields.
- `resolveItem`: exact current actor/item/destination authority. Shipping state is not proof of a patient's encounter location.
- `takeRateLimit`: existing shared/distributed limiter and trusted proxy/IP semantics, not the demo Map.
- `getExisting`: durable same-actor/same-key receipt lookup. No cross-account lookup, public enumeration or leaking status tokens.
- `commit`: existing canonical assisted-order request plus exact snapshots, structured declared evidence, legal acceptance and durable idempotency under one transaction or equivalent proven boundary.

Do not fabricate a successful production adapter by using memory, a local JSON file, a public spreadsheet or ordinary email. `productionReady: true` is not evidence. Keep real submission disabled until bindings and required qualification are genuinely complete.

## Durable persistence and operator continuation

Extend the existing request model or its governed companion metadata record. Do not create a second order ledger, parallel CRM, checkout, payment system or outbox.

Persist the source category/detail, declared code, affiliation kind/detail, customer confirmation, timestamp, schema version, actor linkage and canonical request linkage. Preserve canonical normalization without losing required evidence. `declaredAffiliateCode` alone cannot hold all this data; neither can free-form notes.

The request, evidence, snapshots and actor-scoped idempotency result must commit atomically. Revalidate current legal/catalog/quantity/pathway authority within that boundary. Handle two concurrent workers, exact retries, changed payload under the same key, transaction rollback, process restart, and response loss after commit.

Never mint a new idempotency key automatically to retry an unknown outcome. Preserve same-key recovery for that attempt. Do not claim cross-refresh or cross-tab protection from a component-lifetime guard. If a browser loses its recovery reference, use the authorized account/request recovery path or show an honest unresolved outcome, not guaranteed resubmission safety.

Successful prior receipts should remain recoverable after price/catalog changes without allowing a new stale request. Do not return a reference until durable persistence is confirmed and the canonical record is accessible through the authorized operator reader.

Use the existing outbox/notification mechanism where supported, atomically recording the obligation with the request. Notification transport failure must not erase a stored request or create a duplicate. Tests use an isolated fake transport; no real email/SMS or supplier action.

In the existing operator detail/queue, show request reference, customer/contact, exact variants/quantities, per-line workflow, pending-price state, declared source/affiliation, attribution-review state and next action. Preserve existing staff access controls. Default notification/log output contains only a non-sensitive reference and approved internal link, not personal details or Care-interest data.

## Attribution is not commission authority

Keep customer-declared evidence distinct from trusted attribution. A `?ref=` code is a declaration to confirm, not partner authentication or a payable commission.

Use an existing verified referral token/account binding only through its canonical service. Preserve disagreements between declared and trusted sources for authorized review; do not silently overwrite either. Naming a gym, person or clinic grants them no order, personal or clinical visibility.

No self-activation, commission percentage, commission accrual, payout, Care compensation rule or partner grant is introduced by this form. Preserve existing Care/Research compensation boundaries. Referral capture here does not close the separate subscription-referral-lineage blocker.

## HTTP, routing, privacy and protected paths

Route intent is clear, but exact protected-file authority still applies. Inspect the gate and leases before editing `App.tsx`, composition roots, static serving, manifests or indirect dependencies of protected behavior.

Use an authorized extension point if one exists. Otherwise prepare the exact minimal mount diff, starting hashes, regression tests and approval request. Continue unprotected adapters/component/tests while that protected slice awaits authority. Do not bypass protection by moving the same behavior change to an unwatched file.

Mount the exact Wouter route before any broader `/health` redirect. This adds one page, not a new Health microsite. Do not change Access Hub/GATE-01 incidentally.

The supplied handler matches full request paths. Mount it at the application root after the established auth/session and bounded JSON handling, before the SPA fallback. Do not mount under a stripped Express prefix without a tested path adapter. Preserve existing unrelated request limits; enforce this module's 64 KiB bound without breaking other endpoints.

Retain exact configured-origin/CSRF checks, trusted session cookies, safe JSON errors, no-store responses and server input limits. Test raw and upstream-parsed bodies. Feature-disabled, unauthenticated and malformed requests must produce the intended JSON/status, never an HTML fallback success.

Render all customer-supplied text safely in customer and operator views. Exclude personal data, tokens, request payloads and Care-interest selections from analytics, request logs and screenshots. No production data in fixtures. No live request collection before the documented security/privacy/clinical and release checks are satisfied.

Any necessary persistence/schema extension is a narrow source proposal, not a managed migration authorization. Identify its exact candidate paths and current ownership; obtain missing source-edit permission where repository rules require it. Do not reuse the D/E-only schema authorization for expanded Quick Order attribution. No managed registration/apply or hosted data write is authorized by this prompt.

## Qualification and bounded delegation

Reuse at most three disjoint specialist assignments: (1) UI/validation, (2) canonical adapters/persistence, (3) tests/operator readback. Use read-only adversarial help as needed. One root owns integration; no concurrent writes to shared files. Claude remains independent acceptance owner.

Run the package's `npm test` and `npm run check` first without reinstalling needless dependencies. The reported 47 tests are baseline package evidence, not repository integration acceptance. Preserve original failed runs and record runtime/commands/source hashes.

Add repository tests for:
1. every required-field omission, direct/none choices, optional code/address line, separate billing and server-side tampering;
2. complete multi-page variant discovery, restrictive visibility, stale catalog/price/terms, quantity bands and Care/research-use-only refusal;
3. same-actor replay, different-actor denial, concurrent same-key requests, changed-payload conflict, rollback/restart and lost response;
4. declared versus trusted referral conflict, no commission/payout and no referrer data exposure;
5. request plus structured evidence readback through the actual authorized operator component/reader;
6. auth/guest policy, CSRF/origin, rate/body limits, mount prefix, direct refresh and SPA fallback ordering;
7. partial notification failure without duplicate request or false success;
8. preservation of accepted Core, partner-return, MC-01, D/E and subscription disabled-boundary behavior.

Commit the source before final qualification. Serialize focused tests, typecheck, production build, browser and any disposable database proof. A real database proof must exercise the canonical adapters/persistence, not the demo Map. Only run it in an authorized isolated environment. Keep existing and new schema candidates unregistered/unapplied to managed systems.

Capture the real application shell at 1440, 1024, 768, 390 and 320; cover selection, details, review, receipt, validation errors, unavailable authority and recovery. Include keyboard/error focus, 200% zoom where reliable, no overflow, sticky-summary clearance and no admin visual regression. Label synthetic sessions/catalog/transport explicitly. Package DOM/fixture screenshots are not full-App or live-auth proof.

A host failure is neither a pass nor automatically a source defect. Record the failing run; diagnose resource/environment causes and re-run controlled checks when feasible. Do not waive coverage because of the deadline.

## Handoff and continuation

Finish with exact source/tree, test/evidence/handoff commits, changed-path/port map, protected/schema approval matrix, catalog paging proof, synthetic canonical request plus operator readback, persistence/recovery evidence, browser captures and remaining blockers.

Use separate dispositions:
- Quick Order source review: READY or BLOCKED;
- managed nonproduction qualification: PASS, FAIL or NOT RUN;
- real customer intake: READY or NOT READY;
- live payment/subscription/clinical readiness: unchanged, not established here.

Route the packet to the existing Claude reviewer using the established authorized coordinator handoff loop. A queued message is not acknowledged review. After acceptance, the single integrator composes the Quick Order delta onto an accepted base and qualifies that new exact candidate. Do not reopen unrelated accepted lanes without a changed dependency or concrete regression.

Meanwhile, finish the original integration review and preserve the website's affiliate-login, media and subscription goals. Quick Order must not replace those goals or be counted as a paid buying path. Keep the six real-subscription buying blockers, protected-hash approvals, GATE-01 and applicable MC-01 database compatibility holds visible. Continue the next unblocked bounded task through its existing owner; ask Samuel only for a specific missing business/protected/hosted decision.

Do not publish the demo, accept real customer information, register/apply managed SQL, enable payment/provider capabilities, activate partners, change release baselines or deploy. A customer-shareable link is returned only after separate exact-action approval, qualified deployment and served-runtime/operator readback.
