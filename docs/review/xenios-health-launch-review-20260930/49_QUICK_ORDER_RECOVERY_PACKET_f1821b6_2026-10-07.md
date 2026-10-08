# Quick Order recovery packet (coordinator local `f1821b6`): section 5C design, qualification proposal and next builder task

**A. Section 5C resolution: REVISION REQUIRED as design, with the protocol core compatible.** The
acquire-everything-before-the-first-guarded-write, head-last rule holds against the writers actually installed in
source at `3e82154`: the three real interleavings (overlapping lot release and expiry, multi-SKU reserve, referral
privacy deletion) are closed by pre-locking, finalize already obeys the rule, the readiness guards only try-lock, and
nothing the commit inserts after the head reaches a guarded relation. Three P2 corrections are required before any
guard, trigger-set, commit or helper body is drafted: the per-relation epoch table reinstates the open liveness defect
(whole-row scope on inventory lots and the identity family, with no rate or budget); the SECURITY DEFINER commit needs
an installer-checked precondition that the sessions-table owner, the provider-fence owner and the locking role are one
role with bypass rights, and must avoid the sessions function prefix; and the closed shape of the decision-inputs text
has no key list, version or canonical encoding. No P0 or P1. **Eligible under existing authority after this
disposition:** the currentness candidate's head-integrity extension (seeded head, no lazy insert, three foreign keys,
refusal triggers on its own tables, monotonic epoch). **Owner scope still required:** the inventory and referral writer
replacements, the Health configuration paths, the private commit-context seam with its protected `server/index.ts`
wiring, the guard set and the commit body. **Reserved for Samuel:** the Health pair content and applicability, product
and quantity and destination policy, and acceptance of the revocation ordering and its numeric budget.

**B. Qualification proposal: NOT YET SUFFICIENTLY SPECIFIED for an execution decision as a whole.** Two P1 defects
make groups unreachable by construction: the sixth G7 command (`verify-release-manifest.ts`) is listed without its
mandatory manifest argument and environment, may fetch from origin, and is not the protection gate whose expected
failure the plan says to preserve; and the stop rules never reconcile the 21 predicted reds in G3 to G5 with "only
after focused green", so G6 cannot start and G9 is blocked by G7's expected failure. The supervisor every group depends
on is absent and unproven. G1 is the best specified and becomes decidable once the supervisor exists, has a trivial
self-test, and the RED expected-failure names are bound; G2 follows; G3 to G5 need the two pending patches decided or
"focused green" redefined by name; G7 needs the command and snapshot fixed; G8 and G9 need harnesses and a named
browser route; the database category needs a checkout at or after `1631323` and Docker facts that are NOT PROVEN.

**C. Next builder assignment: one task is eligible now.** Extend the currentness candidate family (five files) with
the head-integrity preconditions listed in section 5, under the existing lease and `dc3329b`, for an exact-successor
delta review; the decision-inputs column waits for the key list. The qualification supervisor and manifest are the
independent task to run while that successor is under review.

Nothing here is executed, approved or installed; the window stays expired; automation stays paused. Lens output
archived as `hl12/49_recovery_packet_lens_findings.json`.

**What this review is.** The coordinator delivered three proposal files through Samuel and asked this session, the
existing reviewer, for three separate dispositions: the section 5C resolution (compatible as design, revision
required, or insufficient evidence), the qualification proposal (preparation still required and whether it is
specified enough for an execution decision), and one recommended next bounded task for the same builder. The files
were read from the coordinator's local repository with read-only Git commands; the commit is unpushed and the remote
coordinator tip is its parent. They are a proposal, not implementation, approval or execution evidence. Nothing was
executed: no tests, SQL, verifiers, builds, browser or server launches, resource sampling, installation, source edits,
deployment or customer actions. The five-minute automation remains paused. No reserved decision is made here: not
Health legal content, not quantity or product policy, not protected hashes or GATE-01, not database actions, not the
two pending patches, not the revocation budget. A compatible design is not a grant of source, installation or
execution authority.

Reviewer: this session. The two lenses and their verifiers ran under `claude-fable-5-1` (the session model at
launch); the record was finalised under `claude-opus-5-5` after the session model was switched on 2026-10-08. Ultracode
on; no effort level beyond what the environment reports is claimed.

## 1. Packet identity (verified)

| Item | Value |
| --- | --- |
| Repository and commit | `C:/Users/sboad/.codex/worktrees/3221/xenios-website`, local commit `f1821b661b7f7ae792c2ce4176addb2529a4b1ce` ("docs(coordination): consolidate recovery design and qualification proposals", 2026-10-07 13:37:13 -0500), parent `9d13a6f`, which is the remote tip of `codex/xenios-launch-coordination-20261005`; the commit is local and unpushed, as reported |
| Files received complete | `RECOVERY_5C_RESOLUTION_20261007.md` (149 lines, sha256-lf `c1fb9d05…`), `RECOVERY_QUALIFICATION_PROPOSAL_20261007.md` (101 lines, `aab7e6a3…`), `RECOVERY_DECISIONS_20261007.md` (21 lines, `fa713bd0…`), all under `docs/coordination/launch-coordination-20261005/` |
| Other files in the commit (read as context only) | `RECOVERY_CUSTOMER_JOURNEYS_20261007.md`, `RECOVERY_SPRINT_REQUEST_20261007.txt`, `RECOVERY_RECORDS_VERIFICATION_20261007.json`, `CLAUDE_DOC48_PUBLIC_TEXT_20261007.json`, `CLAUDE_DOC48_RETAINED_LENSES.json`, coordination state and sprint JSON, README |
| Application source the packet reviews against | `3e82154724ede74b7c5f361f280739eedd60db25` (tree `04958ec1…`); builder records `1631323`; my doc 48 at `7dde166…` |
| Authority | unchanged: Samuel's source-only approval `dc3329b` for packet `1d4f2c3`; section 5C held by docs 42, 46 and 48; this review confers none |

## 2. Source claims I verified before the lenses (inspected source at `3e82154`)

| Packet claim | Result |
| --- | --- |
| `research_reserve_inventory` (`20260727160000…:375`) locks and mutates per SKU | Holds: the body loops `for v_index in 1..cardinality(v_skus)`, takes shared advisory locks per product and variant, selects candidate lots `for update of l` with per-lot advisory locks, then inserts the reservation and its allocations before the next SKU; a multi-SKU reserve therefore mutates between lot-lock acquisitions, as section A states |
| Release (`:773`) and expiry (`:1226`) lock one lot then update it inside a loop | Holds (verified in doc 46 and again here: idempotency advisory, reservation rows `for update`, loop ordered by `lot_uuid`, lot `for update`, readiness advisory, `update public.research_inventory_lots`) |
| `research_finalize_inventory_reservations` exists and needs compatible ordering | Exists at `:1000`; its lock order was left to the lens |
| Readiness guards (`:166-373`) use advisory try-locks in `BEFORE` and `AFTER` triggers on quality documents, tests and products | Holds (`pg_try_advisory_xact_lock` at three sites; shared advisory locks at two) |
| `research_apply_inventory_movement` takes a child idempotency advisory lock | Holds, with anchor drift: the function is at `supabase/research-inventory-lot-coa-admin.sql:667` (packet says `:658`) and its advisory lock at `:720` (packet says `:727-745`); `research_lot_quality_ready` at `:485` is select-only as stated |
| Allocations reference reservation and lot; the identity trigger fires only on product, variant and SKU changes | Holds (`research_lot_reservation_allocations` references `research_lot_reservations` with cascade and `research_inventory_lots(lot_id)`; `research_inventory_lot_identity_serialization` is `before insert or update of product_id, variant_id, sku`) |
| Referral FK graph, transferred-account discovery, link revocation, deletes, finalize, guards, rollout text, partner cascades | All anchors resolve: bindings reference links and touches; transfers reference bindings, partners and links; events reference partners, links and touches (`20260904…:107-168`); transferred accounts gathered at `:247-258` and `:295-299`; the only permitted link update is the `revoked_at` transition (`:424-426`); `privacy_begin` deletes transfers, events, bindings (both generations), touches, links and idempotency rows at `:321-333`; `privacy_finalize` at `:341`; guards at `:370` and `:936`; the rollout text at `:98-111` describes begin, exact partner and member deletion, finalize; `supabase/research-partners.sql` carries ten `on delete cascade` references to partners and organisations |
| Rows the commit inserts carry no foreign key into a guarded relation | Holds for the canonical tables: lines, events and documents reference only `research_assisted_order_requests`; the companion references requests; the outbox base table has no foreign key to members or customers and its HL12 financial references are null for a Quick Order row. The only FK waits a commit can incur are on its own new request row |
| Session identity chain | `research_early_access_session_bindings` is created at `20260804120000…:126`; `customerRefFor` derives `eac_` plus a truncated hash of the customer id (`early-access-customer.ts:300-301`); `research_early_access_legal_bindings` (`20260809130000…:31`) binds `customer_ref` to `member_id`, an identity link as the packet says; the sessions function-shape guard requires `prosecdef`, `search_path=pg_catalog`, owner equality and `rolsuper or rolbypassrls` (`:680-683`); `revoke_session` is at `:570` |
| Qualification plan targets | Every test file in G2 to G5 exists; `run-check.mjs`, the evidence primitives, the three capture scripts, the six G7 scripts and `script/build.mjs` (which removes `dist`) exist; the proposed supervisor, the two harnesses and the manifest are absent, as the proposal says. The HTTP regression plan the proposal cites does not exist under `docs/health-launch/quick-order-20261005/`; it lives on the coordinator branch at `docs/coordination/launch-coordination-20261005/QUICK_ORDER_HTTP_REGRESSION_PLAN_fd023e8.json`. The RED runtime `f1e467f…` is present; the handler test is `server/research/health/quick-order/tests/handler.test.mjs` and the containment test sits beside it, matching docs 36 to 38 |

## 3. Disposition A: section 5C resolution

**REVISION REQUIRED as design.** One read-only lens and one adversarial verifier re-derived every anchor in sections
A to D of `RECOVERY_5C_RESOLUTION_20261007.md` and tested the protocol against the installed writers; nothing was
refuted; three findings stand at P2, the rest at P3.

**What is compatible.** The transaction-wide rule (every contended relation, advisory, row, foreign-key, unique-key and
trigger-reached dependency acquired before the first guarded mutation; one install-seeded HELD head acquired last;
nothing new after the head) is sound against the writers installed in source:

- Reserve: pre-locking all candidate lots for all SKUs in UUID order and allocating in FEFO order afterwards is
  feasible with the same lock footprint as today, because the current query already locks every candidate lot with
  stock `FOR UPDATE` per SKU; the lot identity trigger fires only on product, variant and SKU changes, so quantity
  updates add no post-head lock. Release and expiry become one `… where id = any(lot_uuids) order by id for update`
  plus advisory locks in the same order before the existing per-lot loop.
- Finalize already locks everything before its first mutation and never writes a guarded relation, so it never takes
  the head; it needs no amendment unless reserve adopts an order other than `lot_uuid`.
- Privacy: pre-locking the discovered id arrays before the first delete closes interleaving 3; the partner identity
  guard refuses deletion while any link, touch, binding, transfer or event remains, so partner cascades cannot reach a
  guarded relation; the deferred finalize trigger reads only the cleanup work table.
- Readiness guards use advisory try-locks and plain selects only, so a readiness refusal is a refusal, not a wait.
- The commit's inserts reach no guarded relation: lines, events, documents and the companion reference only the new
  request row; the outbox has no foreign key to members; unique checks on `public_reference`, `idempotency_key_hash`
  and the companion actor and key can wait only on another intake, which holds the head in share mode, so no cycle.
- Writer census at `3e82154`: the only installed-in-source writers that violate the rule are reserve, release, expiry
  and `privacy_begin`; the lot and COA admin functions, product control centre, readiness functions, identity
  persistence, partner lifecycle, activation writers and the referral execute operations lock their rows (or perform a
  single guarded statement) before any head would be taken. Still unclassified: two candidates if installed (price
  tiers `20260905`, media and commerce decoupling `20261003`) and direct owner DML permitted by the referral guard.
- Interleaving 4 (link revocation versus privacy) is reachable only through direct owner DML: the canonical `revoke`
  operation and `privacy_begin` both serialise on advisory `(9042026, 1)` before any row lock.
- A pre-existing writer-versus-writer inversion exists today, independent of any head: reserve locks lots per SKU in
  FEFO order while release, expiry and finalize lock all their lots in `lot_uuid` order; PostgreSQL resolves it by
  aborting one transaction. The inventory replacement fixes this as well as the head inversion.

**P2 corrections required before any body is drafted.**

| ID | Correction |
| --- | --- |
| 5C-1 epoch scope and liveness (table D) | "Complete row" scope on `research_inventory_lots` makes every reserve, release, expiry and adjustment across all commerce flows advance the single global epoch and refuse every in-flight intake; "complete row" on members, partners and customers, and INSERT-advancing on acceptances, grants and legal bindings, makes every onboarding step do the same. This is doc 46 S-M2 and B-4 restated as policy ("deliberately allows some unrelated actors to cause refusals") with no rate and no budget. Smallest correction: state the liveness case for the inventory family first and whether the intake's own `FOR SHARE` on exact lot rows makes quantity-column advancement redundant; narrow members to the columns the decision readers consume (`id`, `auth_user_id`, `email`, `status`, plus the audience source fields) and partners to the state, verification, tax, payout, certification, activation and member fields the referral availability check reads; put `research_early_access_referral_grants` OUT unless a Quick Order decision reader is named (none exists at `3e82154`); keep INSERT advancing where absence is a decision input (affiliate bindings, transfer events); state expected onboarding, inventory and intake rates and the refusal budget the measurement must meet; add the missing reader census for shipping regions, product media and launch controls before any predicate is authored. |
| 5C-2 definer ownership precondition | The intake slice gates installation on the owner of `research_assisted_order_provider_fence` with `rolsuper` or `rolbypassrls`; the sessions source forces row security with zero policies, revokes every table privilege and binds its four functions to the sessions owner; `SELECT … FOR SHARE` needs UPDATE privilege. A single `SECURITY DEFINER` commit satisfies both only if the sessions-table owner, the fence owner and the locking role coincide and that role has bypass rights, and the packet forbids the alternative grants. Hosted ownership is NOT PROVEN. Smallest correction: write the precondition into section C, make the installer precheck refuse otherwise, record the ownership facts as hosted precheck items, and add that the commit must not take the `research_private_early_access_` prefix, which the sessions install guard refuses for any function other than its own four. |
| 5C-3 decision-inputs shape | Section B names content classes for `normalized_decision_inputs` but no `schemaVersion` literal, key list, type bounds, canonical encoding (key order, whitespace, UTF-8 normalisation) or the rule relating the stored text's digest to the envelope artifact. No validator or digest check can be drafted. Smallest correction: enumerate the shape before any body; state that Samuel's reserved values populate keys, not the shape. |

**P3 corrections, to carry into the next records delta.** The prelock set for the privacy transaction must be every
foreign-key child of both deleted parents from `pg_constraint` (cascade, restrict and no action; RI checks take
`FOR KEY SHARE`), not cascade children only; `research_partners.member_id` has no foreign key, so "member cascade
dependencies" do not exist on that side. The writer table the delta must carry needs a column for unique indexes hit by
post-head inserts, and two uncontended post-head acquisitions should be pre-acquired or recorded as classified: the
child idempotency advisory lock in `research_apply_inventory_movement` (`:720`) and the unlocked touch read that `bind`
references at `20260904…:873`. Reserve's "stale or missing facts roll back the whole operation" is stricter than today
(zero or non-allocatable candidates are skipped; only an insufficient total refuses) and should be stated as "drop
candidates that no longer qualify, refuse only when insufficient". The recipient bound of 254 differs from the accepted
companion CHECK of 3 to 320; say which governs. The budget (hold at most 2,000 ms, lock timeout 250 ms, statement
timeout 1,500 ms, rollback allowance 500 ms) is internally consistent as a target but must state that an intake refuses
whenever a guarded writer holds the head mid-transaction and that writers queue behind an intake's share lock for its
full hold unless given their own policy; the numbers are not approved here. Four anchors drift: `research_apply_inventory_movement`
is at `research-inventory-lot-coa-admin.sql:667` with its advisory lock at `:720` (the packet's `:727-745` is the
unlocked replay read); reserve is `:375-771` with its SKU loop at `:522-739`; the `revoked_at` allowance is
`20260904…:422-424`; the sessions `rolsuper or rolbypassrls` predicate is `:683` (`:680` is `prosecdef`). The
`server/index.ts` wiring in section E item 4 is a protected seam already off its recorded baseline (manifest
`:447-451`, `:1255`; off since `3562c03`, doc 41), so it is a protected-change review item under GATE-01, separate from
the `express.ts` seam scope; `root-composition.test.ts` is hash-bound and accepted with limits, not "frozen".

**Eligibility.** Within existing authority (`dc3329b` for packet `1d4f2c3`, doc 42 §5A, this disposition): the
currentness candidate's head-integrity extension on the enumerated authority objects, namely an install-seeded HELD
head in the install transaction, removal of the lazy head insert with `publish_revision` refusing an absent head, three
`ON DELETE RESTRICT` foreign keys from the head's revision references, `BEFORE UPDATE OR DELETE OR TRUNCATE` refusal on
revisions and `BEFORE DELETE OR TRUNCATE` refusal on the head, and a monotonic-epoch trigger, with the seal,
fingerprint, pre and postcheck, rollback and verifier updated. The basis, verified in the approved scope text: packet
`1d4f2c3` (`QUICK_ORDER_SUPPLEMENTAL_SCOPE_20261006.md:136-141`) specifies the head with a "monotonic `writer_epoch`"
and the revisions as "immutable schema-versioned publication", lists exactly the five currentness files among the
approved paths, and at `:52` already anticipates triggers under the `research_health_quick_order_` prefix; its only
trigger prohibition (`:229`) concerns installing source-write guards on the 23 relations. Doc 42 §5C held the
writer-guard function and trigger set on those relations and the commit body, nothing else. The trigger-free shape of
the drafted candidate (its header at `:3` and `:148-149`) was the builder's slice choice, not an approval limit.
**Correction to my own record:** doc 42 §5a item 2 says "doc 42 §5A permitted exactly that trigger-free slice"; that
wording is imprecise. §5A permitted the named authority objects; it did not limit them to a trigger-free form. The
design lens (finding F5, kept at P3 by its verifier) read that sentence as an approval boundary and asked for a scope
delta for Samuel; on the scope text above I do not agree that a new approval is needed, and I record the disagreement
here so the coordinator can see both readings. If the coordinator or Samuel reads the approval more narrowly, the cost
is a one-line scope confirmation, not a new design question. The decision-inputs column and validator are also inside
the approved revision content ("normalized decision inputs", `:139-140`) but wait for the key list in 5C-3.
Requiring an owner scope decision: the inventory replacement candidates (reserve, release, expiry, with finalize
confirmed compatible as-is), the referral `privacy_begin` replacement, the Health six-path proposal, the private
commit-context seam in `express.ts` with its new test, the `server/index.ts` wiring (protected-change review), the
`root-composition.test.ts` amendment, the guard function and trigger set, and the commit body. Reserved for Samuel:
the Health legal kind, version, content and applicability; positive product and variant, quantity, audience and
destination policy; acceptance of the "first lock wins" revocation ordering and its numeric budget (I accept the
ordering as a design direction subject to the budget being measured, not approved).

## 4. Disposition B: qualification proposal

**NOT YET SUFFICIENTLY SPECIFIED for an execution decision as a whole; G1 and G2 are close.** This review starts no
window, reserves no group, authorises no probe and permits no execution; database verification stays a separately
authorised category.

| ID | Sev | Defect (verified) | Smallest correction |
| --- | --- | --- | --- |
| Q-1 | **P1** | G7's sixth command, `scripts/acceptance/verify-release-manifest.ts`, requires a manifest path argument (usage and exit 2 otherwise), requires `XENIOS_EXPECTED_PRODUCTION_SHA` and `XENIOS_EXPECTED_HEAD_SHA` outside PR CI, and can `git fetch` from origin; it is not the protection gate (that is `scripts/acceptance/verify-core-site-protection.mjs`, which the plan does not list) whose expected FAIL the plan says to preserve. As written G7 fails by construction and blocks G9. | Replace the sixth command with the protection gate with its exact argv bound in the manifest and its expected FAIL predeclared as non-blocking; either drop `verify-release-manifest.ts` or bind its manifest path and both expected SHAs, pre-resolve them locally and treat any fetch as unexpected external traffic. Split G7 into artefact production (build, built em-dash check) that gates G9 and verdict commands that do not. |
| Q-2 | **P1** | The stop rules make G6 unreachable and G9 blocked on current source: 17 proposed-header cases (8 static, 8 Vite, 1 root) and 4 provider-fixture cases are predicted red, "focused green" is never defined, the only predeclared exception is the G1 RED, and "exit failure stops dependent later groups" combines with G7's expected FAIL. | Either require (not prefer) the `8392d243` and `8396609` decisions before the window, or define "focused green" as every non-predicted case passing with the failing set equal, by exact test name, to a predeclared list bound in the manifest. |
| Q-3 | P2 | No pre-window capacity gate: the last host sample was 1,205 MiB free, already below G1's floor; groups run in content order, not resource order; a refused admission consumes one of nine single attempts; the 4,096 MiB groups (G5, G7 build, G8, G9) sit last with no ordering rule, and the database floor ignores Docker Desktop memory. | Require one recorded host observation at or above the maximum floor of the groups being opened before the four-hour window starts; do not let a resource refusal consume a group (count attempts separately, cap nine); admit by ascending floor where dependencies allow. |
| Q-4 | P2 | The supervisor that gates every group is absent and the plan forbids any smoke run during preparation, so an unproven counter or deadline would consume the one mandatory HTTP attempt; the process ceilings (3 or 4 for G1, 6 for G5) equal or undercut the expected child set (Vitest main, esbuild service, forks worker, root child, tsx child). An existing in-repo supervisor (`server/research/commerce/qualification/qualification-supervisor.ts`, fork-based, discards output) is not named as inspected and unsuitable. | Add a non-heavy G0 (at most one minute, 512 MiB, three processes) that supervises trivial `node -e` children for exit 0, exit 1, deadline kill, stream separation and cap, child-tree capture and the refusal path, and measures the baseline child count of a one-file Vitest run; record it as the supervisor's acceptance before G1. Name the commerce supervisor as inspected. |
| Q-5 | P2 | The snapshot is undefined while G7 deletes `dist` relative to the working directory and Vite writes `dist/public` beside the config: "paths relative to the existing builder checkout" contradicts "never against a pre-existing preview"; an "owned output directory" is unattainable with the unmodified scripts, and a full checkout copy conflicts with the no-node_modules-junction rule. A preview process (PID 18936) was deliberately left running on 2026-10-05. | Define the snapshot as one named directory with cwd fixed to its root for every command, state how `node_modules` is reached, and add a pre-G7 admission check that nothing has files open under its `dist`. |
| Q-6 | P2 | G8 real Vite: `server/index.ts` selects `setupVite` when not in production and listens on `0.0.0.0`; `vite.config.ts` sets no `cacheDir`, so the dependency optimiser writes to `node_modules/.vite` in the shared junction on first request, which the HTTP correction rules forbid; neither the second all-interface listener nor the cache write is disclosed or owned by the cleanup rule. | The real-Vite harness must set an owned `cacheDir` (or disable discovery) bound in the manifest; disclose both `0.0.0.0` listeners in the G8 risk statement. |
| Q-7 | P2 | G1 RED has no predeclared expected-failure set by test name, so "only intended RED permits GREEN" is a judgement made during the run. The RED import graph is closed (both handler exports and the containment factory exist at `f1e467f`; fixtures identical), so RED cannot fail at import; the undeclared set concerns assertion failures. The handler test has 40 top-level tests, of which the seven-group pattern selects seven; the containment filter selects 25 owned and 11 unrelated rows. | Bind the exact RED expected-fail and expected-pass names for both commands in the manifest (derivable from doc 38 and the `fd023e8` diff) and have the supervisor compare observed sets; anything else is setup, import, resource or timeout and stops G1. |
| Q-8 | P2 | The two SQL receipts the database category names "at current source" do not exist at `3e82154`; they exist from `1631323` (and `7f8edd7`), and both verifiers require them physically inside the checkout's evidence directory as exact LF bytes (recomputed `f2f343b3…`, `51238583…`); the directory's `.gitattributes` does not cover JSON, so an autocrlf checkout rewrites them. Each receipt's 66 pins match `3e82154` blobs and none of those paths changed through `7f8edd7`. | State that the database category runs from a checkout at or after `1631323` whose source paths equal `3e82154`, with a pre-admission hash check of the on-disk receipt bytes; the verifiers also read `review-599-repair-bindings-20261007.json`, the base commit and `git show`, which the plan does not list. |
| Q-9 | P2 | The Vitest heap bound (`node --max-old-space-size=1024 node_modules/vitest/vitest.mjs run …`) bounds only the Vitest main process; installed Vitest 4.1.10 passes only `NODE_OPTIONS` to the forks worker that runs the tests, not the parent's heap flag (`run-check.mjs` used `NODE_OPTIONS`, which propagates). The table's "old-space 1024" overstates the bound for G2 to G5. | State `NODE_OPTIONS` (or `poolOptions.forks.execArgv`) in the manifest if the bound is meant for the worker. |
| Q-10 | P3 | The HTTP plan is cited by a file name that does not exist in the builder lane; the builder's file is `docs/health-launch/quick-order-20261005/evidence/http-regression-plan-fd023e8.json` (sha256 `51991abd…`), byte-identical to the coordinator-branch copy; all quoted identities match docs 36 to 38. | Cite the builder path and digest. |
| Q-11 | P3 | The 140-minute aggregate equals the sum of the nine ceilings and adds no bound; admission observations, scratch materialisation and receipt writing fall outside every ceiling; the 4 MiB per-stream cap aborts an over-verbose healthy run instead of truncating (the root test's own model records truncation with byte counts); the intake verifier exits 2 on completion, on interrupt and on unresolved cleanup, so the acceptance criteria must name the completion markers; the G9 browser route (Playwright-installed Chromium or `XR_EVIDENCE_CHROME`) is unnamed and headless Chromium is launched with a loopback-rejecting proxy flag whose bypass is a prediction; "no competing heavy jobs" has no predicate for Chromium, Docker or esbuild; "evidence folder for each approved run is unique" conflicts with the frozen plan's fixed scratch paths; the Decisions document's "scope commit" references for the two patches are coordinator-branch records commits, not builder source ancestors, and approval should name the Git blobs because the patches are not covered by the line-ending attributes either. | Record each in the manifest or the proposal text. |

**Preparation still required before an execution decision:** author and hash-bind the supervisor and manifest (and
allow the G0 self-test); author the real-Vite and built-browser harnesses or defer G8 and G9 to a second decision; bind
the RED expected-failure names; decide or defer the two pending patches and define "focused green"; fix the G7 command
list and define the snapshot; set the worker heap bound through `NODE_OPTIONS`; define the heavy-job predicate; obtain
one host observation at or above the floor of the groups being opened; name the Chromium route and the Docker context,
image id and server version for the database category. **Executability on current source:** G1 and G2 once the
supervisor exists; G3 to G5 executable but predicted red (4 and 17) until the patches are decided or the stop rule is
redefined; G6 after that redefinition; G7 after Q-1 and Q-5; G8 and G9 not yet; database category not yet (checkout,
Docker and image facts NOT PROVEN). Nothing in the plan violates the pinned-Node, no-install, pagefile or volume rules
on paper; the host-safety gaps are the cwd-relative `dist` deletion, the G8 cache write and the worker heap bound.

## 5. Disposition C: next builder assignment

**One task is eligible now: the currentness head-integrity extension.** It is the durable-persistence dependency the
submission milestone needs, it touches only files the builder already leases, and this record supplies the design
disposition that was missing.

| Item | Specification |
| --- | --- |
| Exact paths | `supabase/candidates/20261006_research_health_quick_order_currentness.sql`, `….precheck.sql`, `….postcheck.sql`, `….rollback.md`, `supabase/verification/research_health_quick_order_currentness_local.mjs`; plus re-pinned `docs/health-launch/quick-order-20261005/evidence/review-599-repair-bindings-20261007.json` successor and a new currentness source receipt. No other path. |
| Expected deliverable | One exact successor commit in which: the install transaction seeds the single HELD head row and the lazy insert in `publish_revision` (`:214`) is removed, with `publish_revision` and `revoke_revision` refusing an absent head; the three head references carry `ON DELETE RESTRICT` foreign keys to `revision_id`; `BEFORE UPDATE OR DELETE OR TRUNCATE` on `research_health_quick_order_authority_revisions` and `BEFORE DELETE OR TRUNCATE` on the head refuse with 55000; a `BEFORE UPDATE` trigger on the head refuses any `writer_epoch` decrease or reset; `read_current_authority` stays the constant unavailable object; the precheck and postcheck assert the head exists, is held, and every non-null reference resolves; the verifier adds cases for the seeded head, absent-head refusal of publish and revoke, each immutability refusal, epoch monotonicity, reapply with the seeded head present, and an empty rollback of a pristine install, and keeps the HELD list and exit codes. Candidate names stay under `research_health_quick_order_`. |
| Two source details the slice must handle | (1) The rollback refuses whenever any head row exists (`rollback.md:107-109` at `3e82154`); with a seeded head that refusal would block every rollback. It must instead refuse when any revision exists or the head differs from the pristine seed (epoch 0, `held`, all three references and the revoke reason null). The current drop order (head before revisions) already suits the new foreign keys. (2) The currentness fingerprint's trigger clause (`.sql:68`) has no `not tgisinternal` filter, unlike the intake fingerprint, so the foreign keys' internal RI triggers, whose names derive from OIDs, would enter the seal. Filter internal triggers in the fingerprint (the constraint clause already records the foreign keys by name) or record that the seal is per-database by design. |
| Acceptance criteria | Byte-level: every expected trigger list unchanged at nineteen rows; no change to the intake family; receipts recompute equal; definition hash and seal recomputed. Design: the four B-8 preconditions present and refusing; empty rollback still possible on a pristine install; no guard on any allowlisted relation; no commit body; no decision-inputs column yet. Review: bounded exact-successor delta review by this session. All behaviour NOT RUN until a qualification decision exists. |
| Prerequisite review or owner scope | Satisfied, on my reading of the approved scope text (section 3, Eligibility): `dc3329b` source-only approval for the enumerated authority objects and their monotonic and immutable design; doc 42 §5A drafting permission; this disposition for the B-8 preconditions and the seeded head. Required from the coordinator: a one-line records note assigning the task under the existing lease. Not required: a new question to Samuel, unless the coordinator adopts the narrower reading recorded in section 3. |
| Eligible now or blocked | **Eligible now.** The only part held back is `normalized_decision_inputs` (column, validator, digest rule), which waits for the key list in 5C-3. |

**Independent task to run while that successor is under review:** author and hash-bind the qualification supervisor
and manifest (`docs/health-launch/quick-order-20261005/qualification-supervisor.mjs`,
`evidence/qualification-manifest-<date>.json`) to the contract in section 4, including the G0 self-test definition, the
RED expected-failure names, the `NODE_OPTIONS` worker bound, the snapshot definition, the heavy-job predicate and the
corrected G7 command list. Source only; no run until a window is approved.

**Still blocked, and by what:** the commit body (5C-1 to 5C-3 corrections, the session seam scope, the Health
configuration path); the guard set (writer replacements under owner scope, 5C-1); the inventory and referral writer
replacements (owner scope); the Health six-path proposal (owner scope plus Samuel's pair); the `express.ts` seam and
`server/index.ts` wiring (owner scope plus protected-change review); the two pending patches (Samuel's existing
questions).

## 6. Lens findings (verified)

Two lenses with adversarial verifiers; four agents; every finding upheld; severities adjusted by the verifiers as
noted. Design lens: 3 P2 (5C-1 epoch scope, 5C-2 definer precondition, 5C-3 decision-inputs shape), 11 P3 (prelock set
from `pg_constraint`; the currentness extension needs a records note rather than existing-authority silence; writer
table with a unique-index column; anchor drift; interleaving 4 only via owner DML; finalize compatible as-is; recipient
bound; budget consequences; reserve stale-fact semantics; `server/index.ts` protected seam; pre-existing inventory
inversion). Verifier additions: grants have no reader; inventory lots dominate the churn; the sessions prefix
prohibition; `research_partners.member_id` has no foreign key; the reader census for shipping regions, media and launch
controls is incomplete. Qualification lens: 2 P1 (Q-1, Q-2), 6 P2 (Q-3 to Q-8), 6 P3; verifier addition Q-9 (worker
heap bound) and the corrections folded into Q-7 and Q-11. Not proven by anyone: hosted ownership and bypass rights of
every relation the commit would lock; which candidate writers are installed; any timing, rate or lock-wait figure; the
host's current capacity; presence of the pinned Node binary, `node_modules`, Docker, the image and a Chromium route;
the predicted reds themselves. No test, SQL, verifier, build, server, browser, probe, install or hosted action ran.
