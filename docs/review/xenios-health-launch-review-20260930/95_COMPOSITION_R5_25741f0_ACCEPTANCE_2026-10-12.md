# Transaction composition revision 5 (`25741f0` / `dacc90c`): acceptance

**ACCEPTED WITH NAMED LIMITS. The composition is accepted at source `25741f0`. Finalization may proceed in the doc 94
section 3 order.**

Revision 5 implements the doc 94 ruling exactly and introduces no regression:
- **R4C-1 (the P2).** The commit shadow session now expects the exact 55000 refusal "Quick Order source-column
  descriptor drift", attributes the failure output (all four typed probes present; no intake-owned or unknown innermost
  caller), asserts unchanged effects, and makes the no-domain twin the successful commit (`[1,1,1,1,1]`) followed by a
  replay with no new effects (`mjs:1427-1456@25741f0`, which I read myself). The attribution rule is byte-unchanged.
  No false pass exists: a shadowed commit that succeeded fails the first `sqlFailure` assertion and the twin's
  `replayed:false`; a different 55000 fails both the substring and the anchored regex; the message occurs once at runtime
  (`currentness.sql:624`), and the commit has no EXCEPTION block to remap it.
- **R4C-2.** The committed receipt's `sourceCommit`/`sourceTree` are asserted equal to the dependency header, with
  one-value negatives and positive twins for those and for the definition, `currentnessDefinition`, `reviewCommit` and
  status (`mjs:196-242`). The "accepted currentness source tree" label is corrected.
- **R4C-3.** The descriptor gate regex accepts the `pg_catalog.text` spelling and now matches precheck/postcheck `:10`,
  with a negative per spelling; `GIT_NO_LAZY_FETCH=1` is applied to every git child.
- **R4C-4 to R4C-7.** Corrected in the verifier comment and in all four records. **R4C-8** is coordinator-owned and
  reported as reconciled at `58a7892a`; it was not counted toward acceptance.
- **Scope.** The only code path changed since `38915cf4` is the intake verifier (+160/−31). The transaction source, the
  currentness family, the adapter and the client paths are byte-identical to the bytes doc 87 accepted.

No P0, P1 or P2. Nothing was executed.

Reviewer: this session, `claude-fable-5-1`. Board task `QUICK-ORDER-DISABLED-INTEGRATION-SOURCE-REVIEW-20261011`
revision 5, acknowledged at `a2c443d`. Controlling review: doc 94 (`4ab2fe6`).

**Target:**
- **Source:** `25741f0b5fdff6320214227a896c2b6320c1fb9a` (tree `0c5a2b11…`).
- **Records:** `dacc90cf93a89da375689d6ebbacaf3d3b5a685d`; handoff `2d15b9932ed7ccc55b727ca398354741e851c5cf`.
- **Receipts bind:** `54ffba10459efe0e191428b86a2c913e56c5f829` (tree `45531814…`, confirmed).

**Pin re-confirmation (mine).** All 102 `sha256lf` pins in both receipts at `2d15b99` were recomputed against
`54ffba10`: zero mismatches, identical across receipts. Exactly two rows changed against revision 4 (the verifier and
the shared bindings record). The five currentness pins (`d44974d1…`, `91ab412b…`, `78534251…`, `8de55983…`,
`6c47b308…`) and the definition `8b631a83…` are unchanged. The shared bindings record (blob `25c99622`) remains one
acyclic record.

**Method.** Two read-only lenses (the verifier diff against the ruling; records and envelope readiness), each with an
adversarial verifier, then a critic. Output is archived as `hl12/95_composition_r5_narrow_check.json`.

## 1. Finalization: GO, in this order

This record is the acceptance the records were waiting for. Each step below is a records-only change performed by the
builder under the existing evidence lease. No further review is needed if each matches its envelope byte for byte; I
will spot-check the diffs when they are registered. A mismatch fails closed in the accepted verifiers.

**Step 1. Currentness receipt finalization successor.**
- **Base:** blob `9178947cd345fb503ed356d9f45c8402e2c51899` (183,668 B, raw `b085b12e…`), identical at `57c5aa5` and
  `2d15b99`.
- **Exactly three changes:**
  1. `sourceAcceptance.status` → `SOURCE_ACCEPT_WITH_LIMITS`;
  2. `sourceAcceptance.reviewCommit` → `29ccf647aa0dc332b334f4dd9c62f6396a85282b` (doc 82);
  3. one new key under the existing `disclosures` object. It cites doc 82 for the acceptance, docs 87/94 and this doc 95
     (commit SHA as pushed) for the binding confirmation, declares the embedded PENDING/NON_FINAL strings superseded,
     and (per R5C-6) names the correction-map identity holding the archived narrative: commit `dacc90c`, blob
     `d01de5e2`, 1,538,019 B.
- **Frozen:** all 102 pins, the header (`54ffba10`/`45531814`), both definitions, the exact 11 top-level keys, the
  `sourceAcceptance` key set `{reviewCommit, status}`, and every existing `disclosures` key and value. Size stays at or
  under 262,144 B (78,476 B of headroom).
- **Result:** satisfies the accepted currentness verifier's deep check (`264e6af:2073-2082`).

**Step 2. Intake currentness dependency seal FINAL**, after the step 1 blob is committed. From intake blob `d3441396`
(196,833 B), change exactly:
- `currentnessDependency.status` → `SOURCE_ACCEPT_WITH_LIMITS`;
- `currentnessDependency.reviewCommit` → `29ccf647…`;
- `currentnessDependency.sealStatus` → `FINAL_CURRENTNESS_DEPENDENCY_ONLY`;
- `currentnessDependency.receipt.{commit, recordsCommit, gitBlob, rawSha256, sha256lf, bytes}` → the finalized blob's
  identity.

`sourceCommit`/`sourceTree` (`54ffba10`/`45531814`) and `definitionSha256` (`8b631a83`) stay unchanged. This is exactly
what the intake verifier's gates require (`mjs:296-316`, `:196-211@25741f0`).

**Step 3. Intake source seal**, separately and last. The intake receipt's own `sourceAcceptance` goes from
`{PENDING, null}` to `{SOURCE_ACCEPT_WITH_LIMITS, <the commit SHA of this doc 95 on the review branch>}`. It changes no
pin, keeps the 11 top-level keys and the `sourceAcceptance` key set, stays under the intake cap, and must follow step 2.

**Source acceptance is not qualification or readiness to activate.** Nothing here authorizes tests, SQL, installation,
a push of owner payloads, integration or deployment.

## 2. Named limits (P3; none blocking)

**Records precision (R5-RECORDS-PRECISION; builder, at the next records touch):**
- **R5C-1.** The "five pins enforce accepted identity" wording is true of the receipts and the sibling currentness
  verifier; the intake verifier itself byte-enforces three of the five plus the definition recompute. Reword, or load
  the remaining two at the next verifier touch.
- **R5C-2.** `GIT_NO_LAZY_FETCH` is honoured only by Git ≥ 2.44. Record that precondition or the full-clone alternative;
  optionally assert `git --version` at the next touch.
- **R5C-3.** Historical r4-era strings survive inside archived map blocks without per-string `supersededBy` pointers.
  The governing envelope carriers are clean.
- **R5C-4.** The handoff reports `"whitespace": "PASS"` without naming the check. Label it (`git diff --check` over the
  records diff) or drop it.
- **R5C-5.** The map's R4C-6 `intakeDeltaComparedTo` field records the r5 base rather than the r4 correction it
  evidences. The intake receipt itself is correct.
- **R5C-6.** The receipts' pointers to the archived narrative are unpinned. Cured inside the one permitted new
  `disclosures` key (step 1 above).

**Execution carries (R5-EXECUTION-CARRY; S3):**
- **R5C-7.** The intake verifier's null-seal gates cover precheck/postcheck `:10` and `currentness.sql:2124`, not
  `integrity()`'s own seal at `:600`; a partial TC-21 binding fails closed, and the sibling currentness verifier already
  refuses it. Bind all three sites in one re-seal at TC-21.
- **R5C-8.** Attainability of the exact descriptor-drift expectation is reasoned, NOT RUN; the first disposable run under
  the bound descriptor confirms it.

**Carried unchanged:** CANONICAL-CS-2 (the verifier's 25-name set is authoritative; canonical owner),
TC1-CANDIDATE-WRAPPER, INTEGRITY-ONLY-STRICT, DECODER-CANONICAL-CHECK-PARITY, CONFIGURATION-422, TC9-MEMORY-RETENTION,
ROUTE-CONTROL-SOURCE-TEXT, NOTICE-CONTEXT-FORMAT, COMMIT-POST-GATE-SHADOW, PAGE-RETRY-BRANCHES (new S3 carry from
R4C-7), TC-17 partial, TC-18, TC-20 to TC-28 as staged. **Optional items not selected** (allowed): the timestamptz-only
commit shadow session, the required canonical `documents_json` event, `supersededBy` pointers at the old XV-1/TC3
strings, and the `acceptedCodeSource^{tree}` check.

## 3. What comes next

1. **Builder:** steps 1 to 3 above, registered as one records packet. I spot-check the three diffs.
2. **You or the coordinator:** the TC-25 protected-change disposition for `App.tsx` `b5cc8edc` remains open and is
   needed before this line is integrated or qualified.
3. **S3 qualification**, under its own approval, on the current transaction: durable save, same-key concurrency and
   recovery, conflict refusal, rollback, authorized readback and unauthorized denial, with the TC-21 descriptor binding
   and re-seal (which changes `8b631a83` and forces all three seals again) and the R3C-7 manifest rebind.
