# Quick Order decision inputs `e90d464` / `5a49ef0`: bounded source review against doc 51 items 16-21

**SOURCE ACCEPT WITH LIMITS.** The successor implements the decision-input column, the pure validator and the
two-argument publish signature that doc 51 made eligible, exactly within the coordinator's recorded scope. Canonical
bytes are enforced by rebuilding the document from its parsed values and requiring byte equality with the raw text.
The digest binds the raw text. The envelope carries exactly six artifacts, one per kind. No legal, audience, region or
quantity policy is chosen.

Every head-integrity property accepted in doc 50 is byte-identical. The nineteen-trigger inventory is unchanged, the
reader stays unavailable, and every writer leaves the head held. Every hash claim recomputes. There is no P0, P1 or P2.
Twelve P3 items remain: two verifier cases that do not discriminate, and records precision. Everything is NOT RUN, and
this review authorises no qualification, installation or activation.

Reviewer: this session, `claude-opus-5-5`, ultracode on. Delivered through the coordinator-led queue (dispatch
`DOC51-DECISION-INPUT-REVIEW-20261008:r1`). Paused once at Samuel's instruction and resumed at his direct instruction
(acknowledged at `c2a78b7`); the run before the pause produced no result, so this record comes from the resumed run
only.

Method:
- three read-only lenses, each with an adversarial verifier: the validator; storage, publication and preserved
  invariants; the verifier, records and scope fidelity;
- a completeness check against Samuel's resume scope;
- my own read of the validator and publish function, plus my own recomputation of both definition hashes and the
  envelope-predicate diff.

The lenses read Git objects only. The builder's working tree, which holds its owner's uncommitted supervisor repair,
was not read. The subject was never executed or imported. Lens output archived as
`hl12/53_decision_inputs_lens_findings.json`.

## 1. Identity (verified)

| Item | Value |
| --- | --- |
| Source | `e90d464a2e2f81f6b30a02bfef2fd3ccbe35d9e7`, tree `bdb31ef330f59ddce89d53238107a3341e04dc86` ("feat(quick-order): bind canonical decision inputs to held revisions", 2026-10-08 10:43:58 -0500), parent `11a7900` (records-only; its five currentness files equal `f581b6b`, accepted in doc 50) |
| Delta | the five currentness paths (`.sql` 614 lines, precheck, postcheck, `rollback.md`, verifier 843 lines) plus the new `evidence/doc51-decision-input-bindings-20261008.json`; nothing under `server/`, `client/`, `shared/`, `scripts/` or `docs/phase2/` changed from `f581b6b` to `5a49ef0` |
| Records | `5a49ef043c43663c7a19c9b1c1b9988439062240` (builder HEAD), records-only: packet, source record, records JSON, receipt, registry files |
| Supervisor | `qualification-supervisor.mjs` and its manifest byte-identical at `90f4ebd`, `11a7900`, `e90d464` and `5a49ef0` |
| Scope record | coordinator `7b1e606`, `DOC51_CARRY_FORWARD_AND_DECISION_INPUT_SCOPE_20261008.md`, sha256 `655109ea…`, unchanged through coordinator `6a989d9` |
| Hashes (recomputed from Git objects) | definition `3ca2bab8…` (predecessor `cab02e54…`); receipt `bbffa669…`, 66 entries, 66 match, does not list itself; bindings `44b4f4a7…`, 55 of 55 at the subject and at base; packet `6ac2cc59…`, 7,321 bytes; 67 historical evidence blobs unchanged; triggers 8, 7 and 4 |

## 2. Contract prerequisite: satisfied

Doc 51 section 4 made the decision-input slice eligible once carry-forward items 16 to 21 were recorded. The scope
record at `7b1e606` records all 24 items. It was committed before the source (10:18 against 10:43), and the bindings
embed its hash, which can only be computed from its bytes. The builder assignment names exactly the five paths and the
bindings record. Samuel's source-only approval at `dc3329b` covers normalized decision inputs as revision content
(`1d4f2c3`, scope lines 136-141).

The 24 items, compared with doc 51 section 3:
- **Faithful:** 1, 2, 5, 6, 7, 8, 10 to 14, 16, 19, 20, 23 and 24.
- **Strengthened:** 3, 4, 15, 17, 18, 21 and 22.
- **Faithful but partial:** 9 (CF-11).
- No item changes doc 51's meaning, and none claims that doc 51 accepted a refinement it did not.

The disclosed refinements, judged:
- **Referral family OUT and the privacy-begin replacement removed (items 3, 5):** acceptable. Doc 51 offered this
  option, and the subject has no Quick Order referral consumer; attribution is self-declared only.
- **No new head for unchanged decisions (item 4):** acceptable. A change in scope membership still invalidates, and the
  exact-unit version answer is labelled a proposed engineering profile, not a policy.
- **ASCII-only v1 text (item 18):** acceptable as a v1 contract. Every current agreement and offering identifier is
  ASCII, and a non-ASCII identifier needs a reviewed schema change. The 64-character cap is narrower than the existing
  grammar (CF-9).
- **Recipient pattern (item 22):** a strict subset of the companion CHECK. A trailing newline cannot pass in PostgreSQL
  or JavaScript as written. Cross-runtime equivalence is NOT RUN.

## 3. What the source does (inspected source)

**Closed schema and canonical bytes.**
- Every object level requires exactly its keys: top level, artifacts, each artifact reference, agreements, offer
  rules, quantity, price and destination.
- The validator rebuilds the document in the record's key order and accepts only if the raw bytes equal the rebuild
  (`.sql:335`). It renders strings through the JSON encoder, which escapes only quote and backslash in the admitted
  range, and integers from checked decimal text. It never serialises or hashes a JSONB value.
- So duplicate keys, alternate escapes, exponent or fraction spellings, whitespace, a BOM, a trailing newline and
  reordered keys all refuse. The lenses traced each case by hand.
- The 8 MiB ceiling is checked before parsing (`.sql:160-161`).

**Types, bounds, nullability, sets.**
- Agreement text is printable ASCII, 1 to 64 characters, with no leading or trailing space.
- Identifiers are 1 to 200 visible ASCII characters, and an `unbound:` prefix refuses on all three identity fields.
- Integers fall between 1 and 100,000, with minimum at most maximum.
- Every set and reference array is distinct and strictly increasing by unsigned bytes, with collation never involved.
  Bounds: agreements 1 to 30, with a duplicate kind refused at any version; offer rules 1 to 50,000, with a repeated
  pair or offering id refused; workflow 1 to 2; audiences 1 to 5; regions 1 to 51; references 1 to 32, each a member
  of the envelope's lists.
- `request_pricing` is required in both directions.
- `configurationVersion` must equal the configuration artifact's hash. Revision, source and effectivity must equal the
  envelope, and every refusal path returns false, never null.

**Artifacts and acyclic construction.**
- The envelope must hold exactly six artifacts and all six kinds, so each kind appears once, at byte-distinct paths.
- The five decision references must equal their envelope entries, and the SHA-256 of the raw decision text must equal
  the sole `normalized_decision_inputs` digest.
- Neither the decision text nor the check needs its own digest, the bundle digest or the delivery commit.

**Reserved policy untouched.**
- No agreement kind, version, legal artifact or applicability value is hard-coded.
- The audience values equal the application's five customer audiences, with no admin, and nothing infers
  `private_early_access`.
- The 51 regions equal the application's list.
- Quantity bounds are format ceilings, not policy.

**Storage, validator and signature.**
- `decision_inputs_text` is `text NOT NULL`, and the row check requires the validator `IS TRUE`.
- The validator is immutable, security invoker and has an empty search path.
- Only `publish_revision(jsonb,text)` exists. The one-argument form is gone, and the verifier asserts its absence after
  install, re-apply, reinstall and drift.
- Publish validates both inputs before taking the lock.
- An identical replay keeps the row and leaves the head held. A different publication under the same revision id
  raises a conflict.

**Fingerprint, pre/postcheck, rollback.**
- The fingerprint namespace covers the new function and signature, and the fingerprint block is byte-identical to
  `f581b6b`. It emits names and deparsed text, not object ids.
- Pre/postcheck assert the column, the check, the validator's properties and the absence of the old overload.
- Pristine rollback still refuses retained history and drops the new function.

**Verifier.**
- 182 negative decision fixtures and the positive cases are authored. Their canonical bytes agree with the SQL for
  every admitted input.
- Expected error codes and messages match the SQL.
- No `f581b6b` case was removed. The held list, arguments, exit codes and receipt confinement are unchanged.

## 4. Preserved properties (verified against `f581b6b`)

- The head is seeded HELD at install, with no lazy insert, and a missing head refuses.
- Revisions are immutable; `writer_epoch` is monotonic; the three RESTRICT foreign keys and the deletion and truncation
  refusals are unchanged.
- Pristine rollback is unchanged, and the nineteen non-internal triggers (8, 7 and 4) are byte-identical in the
  candidate, precheck and postcheck.
- `read_current_authority` still returns a constant unavailable.
- Nothing held was introduced: no writer guard, no submission commit, no definer function, no new grant, no adapter, no
  protected wiring and no path to an active head.
- The doc 50 precision items carried here are HI-1 (one verifier truncate case), HI-2 and HI-7 (wording), and HI-3 and
  HI-4 (comments inside the hashed install text). None changes behaviour.

## 5. Findings (all P3, verified)

**Verifier cases that do not discriminate (fix before a qualification run relies on them):**
- **CF-1.** The oversized-input case is whitespace only, so it would refuse even without the ceiling, and key order is
  tested only at the top level. Add an otherwise valid canonical document just over and at the ceiling, and a fixture
  that swaps one nested key pair.
- **CF-2.** The repeated-path and 33-reference envelope fixtures reuse decision text bound to the original envelope, so
  they refuse at the decision references first. Removing the path-distinctness or 32-reference check would leave the
  verifier green. Build each altered envelope's decision from that envelope and bind it.

Both change only the verifier, so the bindings and receipt re-pin and the definition hash does not change.

**Records precision:**
- **CF-3.** The decision-text byte-difference conflict cannot be reached. Because the publication binds the text's
  digest, the same publication with different text refuses as invalid (22023), not as a conflict (23505). The refusal
  holds, but item 17 and the packet overstate the conflict path. Keep the check and say so in `rollback.md` and the
  next packet.
- **CF-4.** The coordinator checkpoint names only HI-1, HI-2 and HI-7. The subject also carries HI-3 and HI-4, which the
  builder packet discloses.
- **CF-5.** The subject tightens `valid_publication`, which doc 50 accepted: exactly six artifacts instead of 6 to 32,
  and byte-increasing envelope references instead of distinct ones. Item 18 requires this, but neither `rollback.md`
  nor the packet says that an accepted predicate changed.
- **CF-8.** The new header comment at `.sql:4-6` has the HI-7 missing-space typo again and calls exact function names
  "prefixes". It sits outside the hashed blocks.
- **CF-12.** The packet says only five paths changed "from `f581b6b`". That is true only against parent `11a7900`. It
  also describes the supervisor's status from before doc 52.

**Determinism argument (record it; optional source change at the next definition change):**
- **CF-6.** The validator is labelled immutable but calls built-ins that PostgreSQL marks stable: the encoding
  conversion, the JSON encoder and the timestamp input and format functions. It is deterministic for every admitted
  input, because timestamps carry a `Z` suffix, dates are ISO, no locale fields are used and ordering is bytewise. The
  inherited `'\.'` literals assume `standard_conforming_strings` is on, and fail closed otherwise.
- **CF-7.** The catch-all exception handlers fail closed but turn a defect into an ordinary refusal. Type names are
  unqualified under the empty search path. Because the function is owner-only and invoker, the effect is self-inflicted
  at worst.

**Limits of the scope record (coordinator records, no SQL change):**
- **CF-9.** Agreement kind and version are capped at 64 characters, while the existing grammar allows 128 and the
  reader 100. Record that a longer identifier needs a reviewed schema change.
- **CF-10.** The 8 MiB ceiling admits only about 22,000 minimal offer rules, not 50,000. Restore the frozen proposal's
  qualifier that these are parser bounds, not capacity.
- **CF-11.** Item 9 does not list the census artifact's keys, order or types, so the reader-census digest preimage is
  undefined. The validator checks only the hash format. Define it before any real digest is filled in.

## 6. Disposition

- Subject: `e90d464a2e2f81f6b30a02bfef2fd3ccbe35d9e7` (tree `bdb31ef3…`), records `5a49ef0`.
- Contract prerequisite: **satisfied.**
- **SOURCE ACCEPT WITH LIMITS** for the decision-input slice. No P0, P1 or P2.
- **What it unlocks:** `e90d464` becomes the accepted currentness source, replacing `f581b6b`, for any future
  qualification or installation proposal. A proposal still needs:
  - the CF-1 and CF-2 verifier corrections;
  - a supervisor manifest that pins this source and its receipt, because the manifest at `90f4ebd` pins `f581b6b`;
  - Samuel's fresh execution window under doc 52 section 6.
- **What stays held:**
  - all execution, including qualification, SQL, verifiers and database installation;
  - publication activation; the reader stays unavailable;
  - the held 5C writer guard, commit and definer bodies;
  - every Health legal pair and its configuration path, the audience subset, regions, quantity, destination,
    revocation and writer-lock policy;
  - protected hashes and GATE-01; push and deployment.

  Synthetic fixtures are not operational authority.
- **Doc 52 is unchanged:** the supervisor stays SOURCE REVISION REQUIRED, and its repair does not wait on this review.
- **Smallest next action:**
  - Builder, one records-and-verifier successor, sequenced after the supervisor repair it is doing now: CF-1 and CF-2,
    CF-3, CF-5 and CF-6 wording in `rollback.md`, CF-8 header wording, and CF-12 in the next packet. Then re-pin the
    bindings and receipt, and return the exact successor here. If the definition is touched for CF-6 or CF-7, the
    definition hash re-pins too.
  - Coordinator, in its own records: CF-4, CF-9, CF-10 and CF-11.
