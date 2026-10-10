# Nonproduction operating profile (`9c4a9b5`) with steward finding (`29297c3`): implementation gate

**1. IMPLEMENTATION GATE: SATISFIED.** The frozen profile, together with the steward's finding, meets the
technical-acceptance prerequisite in your recorded decision 3 for writing the disabled 17+4 transaction slice. It is
accepted with explicit carried conditions. No profile revision is needed.

- **The eight gaps.** None of QOE-01 to QOE-08 needs a change outside the 17 paths, or any enforcement evidence,
  before coding. Each becomes a fail-closed condition in the disabled source, which refuses whenever its trusted proof
  is missing, or a later qualification or installation step.
- **The ruling inside this acceptance.** The proposed per-function timeout values are declined, so no operating
  number is compiled into source.
- **What remains before dispatch is procedural:**
  - record this acceptance;
  - confirm the current owners;
  - record the exclusive 17+4 lease;
  - resolve the HL12 question;
  - record the seal reading.

**2. EXECUTION AND OPERATION: UNPROVEN AND UNAUTHORIZED.** This acceptance is not timeout proof, measurement, a
deployed configuration, or permission to compile, test, run SQL, install, wire or deploy. Internally consistent
numbers are not measured behaviour, and a client abort is not proof of rollback.

No P0 or P1. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-NONPRODUCTION-PROFILE-TECHNICAL-REVIEW-20261010`
revision 1, registered at coordinator `56ffecf` and acknowledged at `0917a21`. Your direct submission reached this
session. The review run was interrupted when the previous session ended, and it was resumed from its last completed
step; no review was duplicated.

**Reviewed bindings**, recomputed from Git:

| Target | Commit | Blob | Raw SHA-256 |
| --- | --- | --- | --- |
| `NONPRODUCTION_OPERATING_PROFILE_20261010.md` (version `2026-10-10.r1`) | `9c4a9b5809162eab9b0669cb6a2f1f2516c06c67` (tree `d265a25b…`) | `1c8ac2c` | `a80eb2a6…` |
| `evidence/nonproduction-operating-profile-20261010.json` | same | `58e642e` | `82544bf5…` |
| `QUICK_ORDER_NONPRODUCTION_ENFORCEMENT_CHECK_20261010.md` (steward `01a0e098…`) | `29297c31fa0357ba186620e7e51425d5ce19badd` (tree `6d5d9032…`) | `8a91e94` | `6323b876…` |

**Controlling authority:** your decision 3 at `bfe7f27` (`DECISIONS_2_3_5_DIRECT_AUTHORITY_20261010.txt`, lines
29-52), and the stage clarification.

**Method.** Three read-only lenses, each with an adversarial verifier, then a completeness critic:
- the gap and stage map;
- the enforcement contract;
- profile completeness and safety.

**Disclosures.** Behaviour of PostgreSQL, PostgREST and Supabase is reasoned from documentation, NOT RUN.
`docs.postgrest.org` returned HTTP 429 to the lenses, so the PostgREST-specific timing rests on the steward's citation.
The agents reported read-only command-form deviations only. No file was written, and no other worktree was read.

Output is archived as `hl12/78_nonproduction_profile_gate_findings.json`.

## 1. Why the gate is satisfied

Your decision 3 requires four things before dispatch:
1. the complete proposed nonproduction profile from the builder;
2. the owner's check of enforcement points and transaction boundaries, done here by the designated steward;
3. my check of completeness, consistency and safety relationships;
4. the coordinator's record of all three.

It also requires missing or invalid values to keep refusing. It does not require enforcement evidence before dispatch;
runs need their own approvals. The accepted design agrees: r3 places the trusted total timeout at operational
admission, outside the 17 paths (r3 MD462-464; doc 73), and unproven writer order blocks only guard qualification and
installation (r3 MD1064).

**What the profile meets:**
- **Units and labels.** Every value has a unit, a class and a scope, and is labelled
  `PROPOSED_NONPRODUCTION_UNMEASURED`.
- **Rules and carried conditions.** The refusal rules are stated, and all 6 + 16 + 14 carried conditions from docs 73,
  75 and 76 are present.
- **Unknowns.** Unknown target, installer and deployment identities are explicit.
- **Relationships.** Every safety relationship holds by recomputation:
  - 250 < 1,000;
  - 1,000 < 4,000 < 5,000;
  - 6,000 = 5,000 + 1,000;
  - the writer gate of 7,000 is at least the whole intake hold of 6,000;
  - 15,000 < 20,000;
  - 21,000 = 20,000 + 1,000;
  - 8,000 = 7,000 + 1,000;
  - 8,000 = 1,000 + 6,000 + 1,000;
  - 24,000 = 1,000 + 21,000 + 2,000.

## 2. The eight gaps

Stages: **S1** before source dispatch; **S2** implementation acceptance condition; **S3** before qualification
execution; **S4** before installation or live operation.

| Gap | Controlling requirement | Severity | Established | Unproven | Smallest remedy and owner | Stage | Blocks dispatch? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **QOE-01** Class-to-connection route before BEGIN | r3 MD449-464; doc 73 section 4 row 3 | P3 for dispatch; P2 hard gate at S4, because on today's single route at least one class always refuses | One lazily created, shared `service_role` HTTP client (`server/supabase.ts:54@25858ad`); nothing mounts Quick Order; `server/db.ts` is not on the chain | Any route, pool, login role or armed value | **S2** (builder): the commit, guard, publish, activation and revoke functions validate effective settings against the carrier and refuse otherwise. They claim no pre-BEGIN arming. **S3/S4** (steward, coordinator, then your authority): route specification and qualification, using excluded seams | S2, S3, S4 | **No** |
| **QOE-02** Expected configuration digest | r3 MD420-429; R2-10 | P3 | Carrier name, location and trust rule; artifact absent, consumer not implemented | The artifact, its owner and delivery; a channel for the writer and admin paths; the digest chain | **S2** (builder, my ruling at source acceptance): for intake, a server-only constructor field that defaults to absent and refuses. For writer and admin, a named anchor inside the 17 paths, supplied at installation and effective before first publication. It is not a new settings table, a caller-set value, a writer edit or a compiled digest; absent refuses. The bindings record defines an acyclic digest preimage. **S4** (steward, coordinator): the artifact and its delivery | S2, S4 | **No** |
| **QOE-03** Whole-request deadline | r3 MD456-458, 472-487 | P3 | Handler order at `handler.mjs:125-161@25858ad`; the injected RPC carries no deadline | A trusted end-to-end deadline | **S2** (builder): SQL budgets come from `transaction_timestamp()`, never reset. The adapter's origin is captured at `session()` entry, not at commit. Loss after transmission is uncertain, with the same key. **S4** (coordinator): handler and transport scope | S2, S3, S4 | **No** |
| **QOE-04** Per-function timeout setting | r3 MD440-447, 671; decision 3 "no hard-coded numerical defaults" | P2 at S1, **closed by the ruling in section 3** | Installer-only timers; proposed 250 ms and 7,000 ms function values | Not applicable after the ruling | **S1** (me, here): the option is declined. **S2** (builder): every function's settings stay exactly `search_path=""`, and the effective `lock_timeout` is validated at entry against the carrier | S1 ruling, S2, S3, S4 | **No** |
| **QOE-05** Shared writer routes | r3 MD1062-1070; doc 73; R2-4; R2-12 | P3 for dispatch; hard precondition at S4 | Writer anchors in inventory, product and required-input code | Routes, prelocks and resets of every writer | **S2** (builder): the guard validates the writer profile before gate and head, including before publication, and the census rows are written, with no writer edits. **S4** (steward, coordinator, writer owners, you): every writer route carries a valid profile before any guard is installed, because installing first would refuse all material platform writes | S2, S3, S4 | **No** |
| **QOE-06** Private-session revoke | r3 MD555, 953, 976-982 | P3 | Revoke is a definer single-row UPDATE (`sessions.sql:570-595`) | Revoke delay while an intake holds the row | **S2** (builder): keep the row-11 contract, with no session edits. **S3** (steward): demonstrate the ordering. **S4** (the session owner, through the coordinator): bind a sufficient wait, or register the delay | S2, S3, S4 | **No** |
| **QOE-07** Measurements | Decision 3; r3 MD462-464; stage clarification | P3 | Targets recorded as unmeasured | All runtime behaviour | **S2** (builder): no measured claims. **S3**: exact-target qualification under separate approval. **S4**: admission | S3, S4 | **No** |
| **QOE-08** Target attestation | R2-17; r3 MD536-540 | P3 | Verifiers assert `^17\.11` against a floating image tag | Target build, owners, ACLs, pooling, retries, prepared transactions | **S2** (builder): version refusal in all four phases, and optionally refuse unless `max_prepared_transactions = 0`. **S3/S4** (steward, coordinator): sanitized target and installation attestation | S2, S3, S4 | **No** |

## 3. Numerical-policy ruling

This is my technical acceptance under your decision 3. It chooses and changes no value, and it is not your approval.

**The proposed numbers.** They are engineering proposals made under your delegated nonproduction authority, complete
and consistent. They are not measured results or production defaults.

**Where they may live.** Only in this frozen record, in the future owner-installed limits setting for the exact
nonproduction route, and in clearly labelled synthetic test fixtures. They must never appear in the source's
production paths as literals, defaults, fallbacks or function settings.

**The per-function timeout option is declined.** The proposed compiled `lock_timeout` (250 ms on commit, 7,000 ms on
guard, publish, activation and revoke) is not adopted. Every function's settings stay exactly `search_path=""`, as r3
MD446-447 requires. Waits are bounded by the route's effective `lock_timeout`, validated at function entry against the
limits setting. The reasons:
- **It would be policy in source.** A compiled value is policy in source (doc 73 CC-19).
- **It would become the installed value.** The same source runs at the snapshot, qualification and installation, so
  a compiled value would become a guessed production default.
- **It would defeat the readback check.** A function-level setting hides the outer value from readback, which would
  make the "effective limit exceeds approved" check self-referential.
- **Nothing is lost.** `lock_timeout` is consulted at every wait anyway.

**Relations in source, values from the setting.** The source encodes these relations, and the values come only from
validated setting fields:
- for every class, idle < statement < transaction;
- intake lock < deadlock timeout, checked only on positive values;
- writer gate >= intake transaction + cleanup;
- remaining budget at gate entry >= gate + reserve;
- each effective value is at most its field.

**The version pin** (17.11) is an admissibility identity, not operating policy (R2-17).

## 4. Enforcement contract (established against unknown)

| Element | Status |
| --- | --- |
| Login role (`session_user`) | **Unknown.** Not inferred |
| Request role | `service_role` by source intent only; the actual role mapping and settings are unknown. A readback under SECURITY DEFINER must be named (C-5) |
| Definer owner O | The requirement is defined (`intake.sql:341-345`); the actual OID and the owner login route are unknown |
| Client and HTTP timeout | **Absent** at S0. Any later deadline only stops the caller waiting. After transmission the outcome is uncertain, with the original key |
| Gateway and pool | Unknown; proposed only |
| `lock_timeout` | Per lock acquisition (55P03). A value validated at function entry governs the waits that follow inside the function |
| `statement_timeout` | Runs from command arrival (57014) and cannot be re-armed mid-statement |
| `transaction_timeout` (PostgreSQL 17) | Whole transaction, ending the session (25P04). Must be armed before BEGIN; prepared transactions are excluded |
| `idle_in_transaction_session_timeout` | Ends the session (25P03) |
| When settings take effect | Login-time database and role settings apply at connection start and are shared by the whole route. PostgREST's per-request role and hoisted function settings apply after BEGIN (steward citation; unverified because of HTTP 429). A function SET applies on entry and is restored on exit |
| Expiry, disconnect, uncertain commit | Expiry after transmission is OUTCOME_UNCERTAIN with the same key. A client abort is not rollback. Same-key replay recovers a committed request |

## 5. What remains before dispatch (S1, procedural)

**The coordinator:**
1. **Record this acceptance,** bound to the exact hashes above, with this ruling and the conditions in section 6.
2. **Record the actors:** builder `01a10d78`; steward `01a0e098` in the owner-check role, superseding the profile's
   "owner UNKNOWN" line without editing it; coordinator `01a103a8`; this reviewer; and you for the production profile
   and live reactivation. The installer, database-object owner, configuration-artifact owner and deployment identities
   stay UNKNOWN until S4.
3. **Confirm ownership:** each path's current owner, the exclusive lease of exactly the 17 source paths plus 4
   evidence paths, and HL12 for `quick-order-admin-readback.test.ts` and `quick-order-notifications.test.ts`.
4. **Record the seal reading:** one shared bindings record, as the 4 granted evidence paths require (R2-13).

**Then** dispatch the same builder under your decision 5. No profile revision is needed. Your Health and commercial
inputs are not a prerequisite for writing the disabled slice.

## 6. Implementation acceptance conditions (S2)

These are in addition to all 6 + 16 + 14 carried conditions. I check them when I accept the authored source.

- **C-1, numbers.** No timer, threshold, maximum, TimeZone or DateStyle literal appears in production paths. Function
  settings stay exactly `search_path=""`, with matching integrity, fingerprint and verifier inventories. Values come
  only from validated setting fields. R2-11's fixed UTC millisecond rendering stays in source.
- **C-2, admission.**
  - The commit, guard, publish, activation and revoke functions read the effective lock, statement, transaction, idle
    and deadlock settings with their units.
  - They refuse values that are absent, zero, negative, fractional, in an unsupported unit, overflowing or above the
    field.
  - They enforce the relations in section 3.
  - They require the transaction, idle and statement values to equal the catalog settings for the exact login role and
    database.
  - These are consistency checks only.
- **C-3, clocks.** Budgets come from `transaction_timestamp()`. There is no reset, and no catch or savepoint around
  source, witness, gate or head locks. The receipt lists the built-ins used.
- **C-4, digest.**
  - Intake uses a server-only constructor field that defaults to absent.
  - Writer and admin use a named anchor inside the 17 paths, as described in section 2 under QOE-02.
  - The digest preimage is acyclic and defined in the bindings record.
- **C-5, identity.** Name the login-role readback, the request-role readback (or explicit reliance on ACLs) and the
  owner OID equality. Unknown values refuse.
- **C-6, adapter.**
  - The origin is captured at `session()`.
  - A budget exhausted before transmission is a definite refusal with the same key.
  - After transmission, a deadline, abort, transport loss, a codeless error, 25P03 or 25P04 is OUTCOME_UNCERTAIN with
    the same key.
  - A false try-lock, and a confirmed-abort 55P03, 40P01 or 40001, map to the existing 503 with the same key. 57014
    maps there only if explicitly recorded with a control.
  - No automatic retry.
- **C-7, recovery.** The read-only same-key replay does not depend on the validity of the setting or the route.
- **C-8, guard.**
  - The writer profile is validated before gate and head, including before publication.
  - The R2-4 controls include a positive control through the test anchor.
  - The census rows are written.
  - No writer edits.
- **C-9, session.** Keep the row-11 order, FOR SHARE and the same-instant check. No session edits.
- **C-10, version.** Refusal in all four phases. An optional `max_prepared_transactions = 0` refusal.
- **C-11, fixtures.**
  - Synthetic private context, setting, anchor and deadline fixtures are injected by tests only.
  - Tests assert `productionReady: false` and `enabled: false`.
  - The production factory supplies nothing and still refuses.
- **C-12, boundary.**
  - **Files.** No edits to `handler.mjs`, `server/supabase.ts`, `server/index.ts`, `server/db.ts`,
    `production-deps.ts`, `supabase-repository.ts`, the writer files, the session SQL or adapter, or any other
    excluded path.
  - **Statements.** No plain SET, and no fake receipt.
  - **Claims.** No claim of pre-BEGIN arming, a route, a measurement or contract closure while QOE-01 to QOE-08 remain
    open.

## 7. Before qualification and before installation

**Before any qualification run (S3):**
- **Approvals.** A separate execution approval, plus your doc 68 and doc 72 qualification decisions.
- **Attestation.** A sanitized target attestation, covering the transaction-end policy and prepared transactions.
- **Exact-target qualification** of:
  - timers armed before BEGIN;
  - statement cancellation;
  - active and idle expiry;
  - disconnect and pool replacement;
  - rollback and lock release.
- **Census.** The writer census and lock-order proof.
- **Session ordering.** The session revoke ordering.
- **Refusals.** Refusal classification.

A client abort is never accepted as rollback proof.

**Before installation or live operation (S4):**
- **Identities and routes.**
  - A designated installer and artifact owner.
  - Distinct routes per class, or a reviewed amendment.
  - The configuration artifact and its delivery.
- **Guard prerequisites.**
  - Every writer route carries a valid profile before any guard is installed.
  - The session-revoke disposition.
  - Handler authority for the whole-request deadline.
- **The snapshot.** The frozen snapshot with the five real inputs, the census and publication.
- **Your approvals.** Your approval of the production profile and of any live reactivation.

No automatic reactivation or retry is authorized at any stage.
