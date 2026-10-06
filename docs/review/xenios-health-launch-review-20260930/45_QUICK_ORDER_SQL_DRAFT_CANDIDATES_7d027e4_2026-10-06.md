# Quick Order SQL draft candidates `7d027e4` / `18bfbcd`: bounded source review (packet part A)

**SOURCE: REVISION REQUIRED for both candidate families on one shared P1; apart from that and two P2 in the intake
set, no source defect was found.** By reading, the intake readers and the currentness metadata candidates at `7d027e4`
are named outside the ADP fence, least-privilege by statement, faithful to the recorded 20-to-23-key wrapper contract,
held by construction for publication, and refuse to install, verify or roll back on drift. **But every one of the ten
files asserts, or depends on, a fourteen-row predecessor trigger inventory, and the migration bytes install nineteen
non-internal triggers on the three fenced relations; the exact full-outer-join and sorted-array comparisons would
refuse on any database that satisfies the candidates' own prerequisites, and neither verifier could get past its first
precheck.** The fourteen-row list originated in my doc 42 (QO-P2-15) and was adopted by the builder's contract at
`b75325a`; doc 42 §5a records the correction, and this record owns it. Two further P2 in the intake set: the psql
`\quit 2` stop branch exits 0, and the marker-discovery predicate can be satisfied by operator-supplied status-update
evidence, which would turn a legacy row into a permanent refusal and block its own rollback. The two strengthened test
files add 49 assertions, remove none, and address the doc 44 fixture-shape and timestamp findings with an explicitly
test-only model. Everything is NOT RUN; hosted database state is NOT PROVEN; nothing here installs, registers,
activates, or is Samuel's approval. Lens output archived as `hl12/45_sql_draft_lens_findings.json`.

**What this review is.** The coordinator's packet `QUICK_ORDER_SQL_DRAFT_REVIEW_HANDOFF_20261006.md` asked this
session, as the single original reviewer, for three separate bounded dispositions on the builder's successor. This
record is part A: the ten new SQL candidate and verifier files and the two strengthened test files at source
`7d027e4dff130214cb71954e2de548be5747cd0c`. Part B (the held section 5C design amendment) is doc 46; part C (the
four composition tests at `5fd2e4c`) is doc 47. Method: Git object reads at exact SHAs, hash recomputation, a full
read of both candidates and the contract by me, and five read-only lenses with adversarial verifiers (three of the
five cover part A). Nothing was executed: no SQL, psql, Docker, Node script, Vitest, typecheck, build, server,
browser, resource check or database connection. No file in any worktree other than this review branch was changed.
A review result is not Samuel's operational approval; nothing here installs, registers, activates or deploys.

## 1. Identity and authority (verified)

| Item | Value |
| --- | --- |
| Source | `7d027e4dff130214cb71954e2de548be5747cd0c`, tree `3819c5f4efed71bd12d5e759593e71c580d96cc3` ("feat(quick-order): draft canonical intake readers and bounded verifier", 2026-10-06 15:09:01 -0500) |
| Records | `18bfbcda7b1def56e10ac1b9ffe424bc1034f3cb`, tree `2cb0035966ab61bf88a4cbb98d5e426e20a6823d`; records-only above `7d027e4` (five `.xenios/` files, five docs) |
| Chain | `5fd2e4c` (composition tests, doc 47) → `1595b8d` (records) → `b75325a` (contract first: `REVIEW_CLEARED_WRAPPER_CONTRACT_20261006.md`, `evidence/review-cleared-draft-bindings-20261006.json`) → `e279cc6` (test refinement) → `00e12fb` (currentness drafts) → `7d027e4` (intake drafts plus the currentness rollback lock correction) → `18bfbcd`; each parent verified; `5fd2e4c` is an ancestor of `7d027e4`; the review branch is not |
| Runtime delta `5fd2e4c..7d027e4` | exactly twelve paths: the ten new files below and the two test files; nothing under `server/` or `shared/` or `client/` other than the two tests; no migration, manifest, protected or `.mjs` module of the Quick Order runtime |
| Authority | Samuel's source-only approval `dc3329b` for packet `1d4f2c3`; this reviewer's doc 42 section 5A (drafting permitted now) and 5B (wrapper after the detail contract is recorded); the contract was recorded at `b75325a` before either candidate was authored. Section 5C remains held (doc 46). No new approval and no execution authority exist |
| Lease | `.xenios/CODE_OWNERSHIP.json` at `18bfbcd` lists the ten new paths and the two test paths under the builder's lease |

Twelve files at `7d027e4`, sha256-lf recomputed by me (all LF, zero CR bytes):

| Path | Lines | sha256-lf |
| --- | --- | --- |
| `supabase/candidates/20261005_research_health_quick_order_intake.sql` | 491 | `f8583f98…` |
| `…intake.precheck.sql` | 160 | `ec9e2b6a…` |
| `…intake.postcheck.sql` | 160 | `d52bb9c9…` |
| `…intake.rollback.md` | 212 | `43648668…` |
| `supabase/verification/research_health_quick_order_local.mjs` | 367 | `25bd0861…` |
| `supabase/candidates/20261006_research_health_quick_order_currentness.sql` | 304 | `d7c2c4fb…` |
| `…currentness.precheck.sql` | 116 | `0679f3b0…` |
| `…currentness.postcheck.sql` | 117 | `a66916aa…` |
| `…currentness.rollback.md` | 142 | `61b06afc…` |
| `supabase/verification/research_health_quick_order_currentness_local.mjs` | 401 | `277f14a6…` |
| `server/research/assisted-order/quick-order-admin-readback.test.ts` | 564 | `10b11bb8…` |
| `server/research/assisted-order/quick-order-notifications.test.ts` | 395 | `9db77c5c…` |

## 2. Retained file evidence (independently recomputed)

| Record | Result |
| --- | --- |
| `evidence/sql-intake-source-receipt-7d027e4.json` at `18bfbcd` | 66 `{path, sha256lf}` entries; all 66 equal my sha256-lf of `git show 7d027e4:<path>` |
| `evidence/sql-currentness-source-receipt-7d027e4.json` at `18bfbcd` | 66 entries; all 66 equal |
| `evidence/review-cleared-draft-bindings-20261006.json` at `b75325a` | 55 hashed path bindings; all 55 equal the Git blobs at their stated commits |
| `evidence/sql-candidate-source-7d027e4.json` at `18bfbcd` | 57 hashed pairs; 55 equal at `7d027e4`; the remaining two are the two receipts themselves, which exist only from `18bfbcd` and hash there to the recorded `07ee084a…` and `3fd581b4…` |
| Handoff "raw CRLF SHA256" for the two receipts (`b449ce33…`, `a18927bf…`) | **not verifiable from retained evidence**: Git holds LF blobs and the coordinator's copies under worktree 3221 are also LF (zero CR bytes), so those digests describe the builder's working-copy bytes only. Producer-reported, not a discrepancy in content |
| Union of receipt paths | 71 distinct, as the coordinator states (producer-reported count, consistent with the two 66-entry lists sharing 61 paths) |

These are file-identity facts. They say nothing about whether any SQL parses, installs or behaves.

## 3. What I read in the candidates (inspected source)

**Intake readers (`20261005_…intake.sql`).** One `begin … commit` wrapping a single `DO` block with
`lock_timeout 5s`, `statement_timeout 30s`, `search_path ''`. The install text creates: `_intake_closed(jsonb,text[])`
(immutable SQL, exact key-set equality), `_intake_valid(uuid,text,timestamptz,jsonb,jsonb,jsonb)` (declared immutable
plpgsql; validates the `attribution-v1` snapshot, the `quick-order-v1` receipt and a 1 to 100 element array of
`quick-order-health-classification-v1` entries, with `exception when others then return false`), the table
`research_health_quick_order_intakes` (PK and FK `on delete restrict` to the canonical requests table, unique
`(actor_scope, key_hash)`, CHECKs for actor scope, key hash, acknowledgement, recipient shape and the evidence
validator; RLS enabled and forced; all privileges revoked from `public, anon, authenticated, service_role`; no
policy), `_admin_detail(uuid)` and `_replay(text,text)` (both `stable security definer`, granted to `service_role`
only). The wrapper (:140-272) calls the unchanged `research_assisted_order_admin_get`, closed-checks its 20 keys,
requires `requests.source` equal to the bridge literal (which the bridge CHECK already guarantees for every row),
appends `source`, `declaredAffiliateCode` and `coalesce(declared_affiliate_code_state,'not_provided')`, returns the
legacy envelope with `submittedEvent: null` and `enrichment: null` and the canonical `createdAt` JSON untouched when
no companion, marker or obligation exists, and otherwise requires exactly one marker event, exactly one obligation and
a valid companion, re-runs the validator on the stored row, binds payload hash to `requests.request_fingerprint`,
requires `created_at`, `occurred_at` and `received_at` equal and millisecond-exact before rendering `createdAt` as
`YYYY-MM-DDTHH24:MI:SS.MSZ`, re-derives the subtotal and completeness from the retained canonical lines, requires a
bijection between lines and classification entries, and emits `observation.state = 'observed'` always. Discovery of
the marker does not depend on the companion (`evidence ? 'intakeKind' or evidence ? 'payloadHash'`); I found no
canonical writer of either key in migrations, candidates or server code at `7d027e4`, so a legacy row cannot be
misread as corruption by that predicate. The gate requires read committed, a superuser or RLS-bypassing role that
owns `research_assisted_order_provider_fence`, the three Supabase roles, `extensions.digest`, the canonical admin
reader and the provider integrity function, and the absence of `_commit` and `_guard_source_write`; it calls the
provider integrity function and compares the provider fingerprint before and after; it asserts the fourteen named
predecessor triggers with exact `O`/`A` states through a full outer join; absent installs, exact verifies the seal
(`QO_INTAKE_READERS_V1:<definition sha>:<catalog sha>`), partial or drifted raises with no repair. The precheck is
the same gate ending in `rollback`; the postcheck differs only in treating absence as failure.

**Currentness (`20261006_…currentness.sql`).** Two tables (`_authority_revisions` with an immutable publication
CHECK; `_authority_head` singleton with `writer_epoch`, `state in ('held','active')` and consistency CHECKs, no FK and
no triggers by design), five functions, all `security invoker` and revoked from every role so that only the owner can
call them: `_currentness_valid_publication` (closed nine-key envelope, six required artifact kinds including
`health_legal` and `normalized_decision_inputs`, opaque reference ids, millisecond-Z effectivity), `_currentness_integrity`
(owner, seal, ACL drift), `_publish_revision` (records or re-checks an immutable revision, then always sets the head to
`held` with no active revision and advances the epoch, including after a manual change), `_revoke_revision` (holds),
and `_read_current_authority`, which returns a constant `unavailable` object independent of any row, so a manually
activated head cannot become usable authority. The install gate calls the provider integrity function and compares
the provider fingerprint before and after, compares the fourteen triggers as sorted JSON arrays, computes the seal
`RHQOC_HELD_V1:<definition sha>:<catalog sha>` with the fingerprint function created after the install text, and on
reapply requires the exact seal. The rollback at `7d027e4` adds an `access exclusive` lock on both tables before the
retained-history check (the correction over `00e12fb`).

**Tests.** The readback test now builds the canonical fixture from the literal 20-key shape of the bridge producer,
models the 23-key wrapper in a function labelled as a test-only model of the contract, refuses raw passthrough for
legacy and Quick Order rows, refuses missing and unexpected canonical keys, requires the stored source rather than
fabricating it, renders offset and fractional timestamps losslessly and refuses sub-millisecond digits for the three
identity instants and unequal instants, preserves legacy timestamp JSON including microseconds, exercises the customer
upload-URL path through the real service and repository (available, missing wrapper, not owner), and renames the
admission case to say it tests the fixture's own door. The notifications test binds the exported template constant,
asserts the stored row (`event_type assisted_order.submitted`, `template_key`, `recipient`, closed three-key payload)
and refuses a payload carrying the canonical `source`. Nothing was removed; the malformed-payload retry behaviour
(doc 44 RB-F10) is deliberately left as it is in the frozen runtime.

## 4. Lens findings (verified)

Three lenses (intake readers; currentness; verifier and tests), each with an adversarial verifier; six agents, every
finding re-derived from Git objects; one severity lowered (A2-F1, P2 to P3) and one finding added at P2 by a verifier;
nothing refuted. Prefix `A1` intake SQL, `A2` currentness, `A3` verifier and tests, `V` verifier addition.

| ID | Sev | Finding (verified) | Smallest correction |
| --- | --- | --- | --- |
| A1-F1 | **P1** | The predecessor trigger inventory asserts 14 rows (intake `.sql:349-363` and `:459-473`; intake precheck and postcheck `:51-65` and `:130-144`; intake `rollback.md:83-97`; currentness `.sql:18-33` compared at `:263-269`; currentness precheck and postcheck `:71-82`; the currentness rollback requires the precheck first and states "the exact fourteen" at `:60`, `:73`; the currentness verifier's `TRIGGERS` constant `:41-56`; the intake verifier's pass label "all 14 trigger states" `:287`). The migration bytes at `7d027e4` install 19: `20261001115512…:474-484` loops over six relations including `research_assisted_order_events` and `research_assisted_order_requests`, creating `adp03_evidence_truncate` (ENABLE ALWAYS, `:477`) and `adp03_evidence_immutable` (ENABLE ALWAYS, `:483`) on both; `20261001062651…:373-378` creates `hl12_disposition_no_truncate` (ordinary) on events; no later statement drops or re-enables them; `20261001160730` creates no trigger. Correct census: requests 8, events 7, outbox 4. The full outer join (`is distinct from` on `enabled`) and the sorted-array `is distinct from` both yield a difference for any extra actual row, so install, precheck, postcheck and rollback would all raise 55000, and both verifiers would stop at their first precheck, on any database that satisfies the gate (which requires the `20261001115512` integrity function). Fail-closed; no fence or seal damage; behaviour inferred from source, untested. | Add the five rows with their states to every expected list in all ten files, re-pin the ten hashes, both definition hashes, both receipts and the bindings; amend the `b75325a` contract table and the `18bfbcd` status text; the disposable verifier must then prove the inventory against a fully migrated database. |
| V-A1-1 | **P2** | Marker discovery is injectable through an existing canonical writer: the admin status route passes `request.body` with a type cast (`http.ts:380`), the service stores `evidence: input.evidence ?? {}` (`service.ts:882`), the repository forwards it to `research_assisted_order_set_status`, which stores it on the events row constrained only by the bridge's `jsonb_typeof = 'object'` CHECK. A status-update body carrying `evidence: {"payloadHash": "x"}` or an `intakeKind` key satisfies the wrapper's predicate (`evidence ? 'intakeKind' or evidence ? 'payloadHash'`, `:158-159`, not restricted to `status = 'submitted'`), so `marked = 1` with no companion: the legacy branch is skipped and `:185` raises 55000 on every read, all four dependent service paths return 500 for that request, the event cannot be removed (`events_append_only`, ENABLE ALWAYS), and `rollback.md:154` then refuses forever. `allowedTransitions` never targets `submitted`. Operator-caused, but permanent. | Scope both discovery predicates to `status = 'submitted'` and to an exact closed evidence key set; mirror in the rollback's retained-evidence query; add a verifier case with an injected key on a non-submitted event. |
| A1-F2 | **P2** | The STOP branch for a missing `qo_intake_definition_sha256` uses `\quit 2` in the intake precheck, postcheck and rollback (`:6-10`, `:6-10`, `:37-41`); psql's `\quit` takes no argument, ignores the extra token with a warning and exits 0, so automation wrapping these scripts reads a missing external hash as success. The verifier always supplies the variable, so only operator or automation runs are affected. Stated from psql source knowledge, not executed. | Replace with a statement that fails under `ON_ERROR_STOP` (a `DO` block raising 55000, exit 3) in all three files and re-pin. |
| A2-F1 | P3 (lowered from P2) | The currentness head's three revision references have no foreign key, revision rows are mutable under owner DML, and `writer_epoch` may be manually decremented; "immutable revisions" holds only through the callable surface. The candidate, rollback and status record disclose this, doc 42 §5A permitted exactly this trigger-free slice, and no consumer exists, so it is a record-wording gap (contract `b75325a:208`, doc 42 §4) carried as a §5C precondition for any reader (doc 46 B-8). | Add to the pre and postcheck an assertion that every non-null head reference exists in revisions; qualify every record statement of immutability. |
| A1-F3 / A2-F2 | P3 | `_intake_valid` and `_currentness_valid_publication` are declared IMMUTABLE while calling STABLE operations (`to_char`, `text::timestamptz`, `date_trunc`); deterministic in practice because the regexes pin ISO millisecond Z forms, and CHECK constraints do not require IMMUTABLE, but the label is not honest. The verifier adds a stronger non-determinism point: `[[:cntrl:]]` (`:53`, `:99`, `:128`) is libc-dependent (musl in the verifier's `postgres:17-alpine` image versus glibc on hosted PostgreSQL classify different code points), so identical bytes could pass storage on one host and fail with 23514 on another; the verifier's ASCII-only fixtures cannot reveal it. | Label STABLE or document the determinism argument; replace the POSIX class with an explicit code-point range matching `core.mjs:27`. |
| A1-F4 | P3 | Wrapper refusals (55000) and malformed identity (22023) reach the operator as a generic 500 "assisted_order_unavailable", indistinguishable from an outage; `fail()` maps only 23505, named `P0001` details and 40001. The provider-journal path I cited in the lens brief does not exist at `7d027e4` (it is `payment/provider-journal.ts`, which never routes `getAdmin` errors); no 55000 literal exists in server TypeScript. | Optional: raise with a stable `detail` token so `fail()` can map evidence refusals distinctly; keep 500 until reviewed. |
| A1-F5 | P3 | Storage checks diverge from `core.mjs` harmlessly: the validator admits `declaredAffiliateCode ""`, which core never emits (and `nullif` maps it to null for the projection); `[[:cntrl:]]` is wider than core's class, so an input core accepts could fail the companion CHECK at the held commit. | Drop the `""` branch or note the widening; see A1-F3 for the class. |
| A1-F6 | P3 | The intake pre and postcheck omit the candidate's role-existence and `to_regprocedure` gates, set no `lock_timeout`, and none of the scripts guards `research_assisted_order_provider_schema_fingerprint()` by `to_regprocedure`, so an absent predecessor surfaces as 42883 or 42704 rather than the scripted 55000. Fail-closed either way. | Mirror the gates and add `set local lock_timeout='5s'` to the read-only scripts. |
| V-A1-2 | P3 | Creating the companion FK takes `ShareRowExclusiveLock` on `research_assisted_order_requests`, and `DROP TABLE` in the rollback removes the FK's internal RI triggers under `AccessExclusiveLock` on that table; both are bounded by `lock_timeout 5s` and fail as a whole transaction, but neither `rollback.md:14-33` nor the contract discloses them. | Disclose in the rollback and the contract. |
| A2-F3 / V-A2-3 | P3 | Rollback prose says re-running the precheck "requires the absent state" and that the verifier "asserts all eight named objects are absent"; the precheck tolerates absence and asserts nothing in that case, and the verifier checks predicate counts (and never `pg_type` leftovers). | Add a GUC-gated expectation to the precheck or correct the prose. |
| A2-F4 / A3-F2 | P3 | Both verifiers resolve `postgres:17-alpine` from the local tag at run time (run by inspected Id, `--pull=never`, server version pinned to 17.11) without an expected digest; the intake verifier's source line omits the image and container ids that the currentness verifier prints. | Pin an expected image digest in the source or receipt; print both ids. |
| A2-F5 | P3 | The inventory records `sha256Raw` and `lineEndings: CRLF` for both receipts; the committed blobs are LF and their raw digests equal the recorded `sha256lf` (`07ee084a…`, `3fd581b4…`); the CRLF digests (`b449ce33…`, `a18927bf…`) are the LF-to-CRLF transforms, verified by recomputation. The verifiers pin raw on-disk bytes, so the correct `--receipt-sha256` depends on checkout line endings; a mismatch refuses, never passes. The handoff labels them "raw CRLF SHA256" explicitly. | Relabel as "committed blob (LF)" and "CRLF checkout", or hash LF-normalised receipt bytes in the verifiers. |
| A2-F6 | P3 | The currentness install gate requires only the fence owner (no superuser or `BYPASSRLS`, read-committed or role pre-checks, unlike the intake gate); read committed is still enforced transitively through the provider integrity call; RLS is enabled but not forced because every function is `SECURITY INVOKER`; a missing role would fail at the revoke with 42704. Undocumented asymmetry, not an escalation. | One source comment. |
| A2-F7 / V-A2-1 | P3 | The currentness verifier's manual-active-head case runs inside a rolled-back transaction and proves only `read_current_authority`'s constancy; the postcheck's "must remain held" refusal is never exercised against a committed active head; the rollback refusal is exercised serially, not against a concurrent publish; and every statement runs as the container superuser, so the owner-only gates, the owner-bypasses-RLS reasoning and non-superuser revokes are never exercised (role denials are tested only via `set role`). | Add a committed-active-head case, list concurrent rollback versus publish under omitted, and either label "owner is the container superuser" or bootstrap a non-superuser owner. |
| A2-F8 | P3 | A second SIGINT or SIGTERM during cleanup terminates the process before the owned container is removed (`process.once` handlers); `--rm` removes the container only when its main process exits. Untested. | Idempotent guard; document the owner label for orphan identification. |
| V-A2-2 | P3 | Doc 42 §5A named five currentness objects; the candidate installs eight, adding `_currentness_valid_publication`, `_currentness_integrity` and `_currentness_schema_fingerprint`. The status record discloses "six owner-only functions". I confirm the three as pre and postcheck infrastructure within §5A's intent; no defect in them was found. | None. |
| A3-F1 | P3 | The intake verifier has no independent trigger-inventory assertion; its pass label claims one; the assertion lives in the scripts it executes and indirectly in the fence fingerprint. | Add the `TRIGGERS` constant and a `pg_trigger` query to `boundary()`, as the currentness verifier does. |
| A3-F3 | P3 | Doc 44 E-F8 (legacy row reads explicit null from `getAdmin` but undefined from `updateStatus`) is neither addressed by the test delta nor listed among the status record's residuals; doc 42's request to cover `updateStatus` and both document paths with a legacy envelope and an absent wrapper is only partly met (upload-URL path only; no `completeDocumentUpload` case; the only PATCH case uses the enriched envelope). | Add the three cases or record E-F8 and the uncovered paths as residual. |
| A3-F4 | P3 | The test-only timestamp model accepts offset and variable-fraction forms for `snapshotAt`, whereas the companion CHECK requires the stored `receivedAt` string to already be the exact millisecond Z form; no assertion depends on the permissive branch. | Restrict the model or add a one-line comment. |
| A3-F5 | P3 | Per-check stdout lines carry the literal token `PASS` without the held list; the COMPLETE line and the exit code govern. | Rename the token or append `HELD_NOT_IMPLEMENTED`. |
| A3-F6 | P3 | The intake verifier grants `service_role` outbox table privileges before the ADP fence is installed, so its rehearsal fence seal binds a different outbox `relacl` than the currentness verifier's baseline; neither is shown to equal the hosted ACL. | Document the difference and that the disposable outbox ACL is a rehearsal assumption. |
| V-A3-1 | P3 | Exit code precision: every recorded failure ends in a top-level throw, which Node exits with code 1 regardless of the earlier `exitCode = 2`; only bounded completion exits 2; no path exits 0, so the HELD guarantee stands. No staged case exercises the partial-install branches. Refusals are discriminated by SQLSTATE only, and `admin_detail` raises 55000 at seven sites, so the malformed cases cannot tell which guard fired. | Say "non-zero"; add a partial-install case; match a message token per refusal. |

Discrepancies between records and bytes, recorded: the fourteen-row claim appears in the contract (`b75325a:153-179`),
the status record (`18bfbcd:42-43`), the handoff (`:52-53`, `:64`), the currentness rollback (`:60`, `:73`) and doc 42
QO-P2-15; doc 44 RB-F2 recommended rendering `createdAt` with millisecond truncation, and the later contract chose to
refuse non-zero sub-millisecond digits instead, which the candidate implements (superseded recommendation, not drift);
the handoff attributes the trigger-state assertion to "both future verifiers" while the intake verifier delegates it to
the scripts; the test files never use the phrase "round-trip" but state the substance in their headers.

## 5. Checklist against the packet's questions

| Packet question | Result (inspected source unless stated) |
| --- | --- |
| Naming and fence compatibility | PASS: every object under `research_health_quick_order_`; intake fingerprint uses an exact `left()` prefix, currentness uses escaped `LIKE`; no grant, comment, index, policy or trigger on any fenced relation or function; the companion FK's RI triggers are internal and excluded by the fence's `not tgisinternal` and `conrelid` predicates; the provider fingerprint is compared before and after in all four scripts. |
| Least privilege | PASS at source: intake table revoked from all roles with RLS enabled and forced and no policy; only `_admin_detail` and `_replay` granted to `service_role`, both `security definer` with `search_path ''`; currentness functions all `security invoker`, revoked from every role, owner-only by construction; ACL matrices assert no non-owner grantee; owner bypass disclosed in every file. |
| Validation helpers | PASS with P3 labels (A1-F3, A2-F2, A1-F5). |
| Absent, exact, drifted object handling and reapply | PASS in logic (absent installs; exact verifies the seal; partial or drifted raises with no repair; shape and ACL checks re-run on reapply), **blocked in practice by A1-F1**. |
| Rollback retained-evidence safeguards | PASS in logic (external definition hash required; access-exclusive locks before the retained-history checks; refusal of any companion row or Quick Order event or outbox evidence; RESTRICT drops; no CASCADE; absence and fingerprint rechecks), with V-A1-1 (an injected marker blocks it) and V-A1-2 (locks undisclosed). |
| Provider integrity and the 14 exact trigger-state checks | **FAIL as drafted**: the correct set is 19 (A1-F1). The 14 named rows are individually correct in name and state. |
| FK triggers distinguished from the forbidden writer-guard set | PASS: the only triggers the slice creates are PostgreSQL-internal RI triggers; the install gate refuses if `_commit` or `_guard_source_write` exists. |
| Source-derived trigger identities are not a hosted census | Stated in the contract and rollback; hosted state NOT PROVEN. |
| Privileged-owner bypass limits | Explicit in both candidates, both rollbacks and the status record. |
| Wrapper implements the 20-to-23-key contract for every canonical request | PASS: 20 keys closed-checked, three appended from the row, `source` required equal to the bridge literal (every canonical row satisfies the bridge CHECK), declared code preserved nullable, state coalesced; decoder key-walk equal list by list (envelope 5, detail 23, marker 5, enrichment 4, companion 3, intake 12, receipt 6, obligation 3, payload 3, observation 4, notification 4, lines 20, statuses 8). |
| Timestamp precision without losing identity | PASS: `created_at`, `occurred_at` and `received_at` must be equal and millisecond-exact or the wrapper refuses; rendered as millisecond Z; legacy `createdAt` JSON passed through unchanged. |
| Retained attribution evidence mapped exactly | PASS against the contract table: twelve intake keys from the validated `attribution-v1` snapshot, `""` to null, `receivedAt` to `confirmedAt`, `requestAcknowledged` from the stored column, estimate from the stored receipt. |
| Explicit legacy null; never wire-level `stale` | PASS: `submittedEvent: null` and `enrichment: null`; observation literal `observed`. |
| Refuses missing or inconsistent companion, marker, receipt, outbox or line evidence | PASS as a matrix (peer-missing, event shape, outbox row, retained lines, bijection with classifications), with V-A1-1 on the discovery predicate. |
| Test-only adapter and synthetic fixtures are not SQL round-trip or admission evidence | Stated in both test headers and the status record; the admission case is renamed to say it tests the fixture's door. |
| Classification display not silently closed | PASS: classifications validated and cross-checked but never projected; the omission is recorded in the contract, rollback and status. |
| Currentness publication and revocation held; read-current unavailable including a manually active head | PASS at source; the manual-active case is exercised only inside a rolled-back transaction (A2-F7). |
| No active Health seed, writer guard, commit body or runtime module | PASS: `git grep` finds the five currentness names only in the five files, the bindings and the registries; guard and commit names appear only as absence checks. |
| Verifier refuses to call omitted coverage a pass | PASS: HELD lists printed; exit never 0 (V-A3-1 precision). |
| Timeouts and interruption distinct from expected refusals | PASS: `timedOut`, `interrupted`, `stopped`, output overflow and SQLSTATE are separately asserted. |
| Source-receipt pinning and exact bytes | PASS: 66 and 66 entries recomputed equal; raw digest depends on checkout line endings (A2-F5). |
| Bootstrap dependencies | Recorded: bridge, M75, status recovery, the HL12 and ADP chain through the fence, the outbox SQL; the sessions source, early-access identity, referral V1 and touch candidates are not loaded, which the reader slice does not need. |
| Cleanup ownership restrictions | PASS: invocation-specific name and label, Id compared before removal, refusal when launch is uncertain (A2-F8 on a second signal). |

## 6. Not proven

Any execution of any candidate, script or verifier (install, reapply, drift, seal, rollback, inventory evaluation,
`relation_count = 3`, `aclexplode` outputs, `proconfig` string form, `obj_description` round trip, lock and statement
timeouts, Docker isolation and cleanup, exit codes); hosted database state (the extra triggers, the fence owner, role
attributes, `pgcrypto` placement, default privileges, migration history); catalog fingerprint determinism across
PostgreSQL versions; psql's behaviour for `\quit 2` (stated from source knowledge); validator determinism under
non-default `DateStyle`, `TimeZone` and ctype; whether any hosted legacy row satisfies the marker or obligation
predicates; end-to-end decoder acceptance of real wrapper output; both test files under Vitest; type-check of the test
literals; the concurrency property the rollback-lock correction targets; all HELD items (atomic commit, standing
admission, source-write guards, currentness activation, competing writers, liveness, real notification).

## 7. Disposition A in the prompt 03 form

- Subject: ten new files and two strengthened tests at `7d027e4` (tree `3819c5f4…`), records `18bfbcd`.
- **SOURCE: REVISION REQUIRED** for the intake family (candidate, precheck, postcheck, rollback, verifier) on A1-F1
  (P1), V-A1-1 (P2) and A1-F2 (P2); **REVISION REQUIRED** for the currentness family on A1-F1 alone (its share of the
  fourteen-row list in the candidate, precheck, postcheck, rollback prose and verifier constant). No other P1 or P2.
  The two test files: **ACCEPT WITH LIMITS** (NOT RUN; A3-F3, A3-F4 as P3).
- P0: none. The P1 is fail-closed and damages nothing; it stops everything.
- Qualification: NOT RUN by anyone; nothing in this review changes that.
- Protected and schema authority: no migration registered, no manifest or protected file touched, no SQL executed;
  installation of anything needs its own action authority from Samuel.
- Release A: **no**. Release B: **no**.
- Smallest next action for the builder, unexecuted: correct the inventory to 19 rows in all ten files, scope the
  discovery predicates to `status = 'submitted'` with a closed key set, replace `\quit 2`, re-pin the hashes, receipts,
  definition hashes and bindings, amend the contract table and status text, and return the delta here. No rerun of
  anything to own a receipt.
