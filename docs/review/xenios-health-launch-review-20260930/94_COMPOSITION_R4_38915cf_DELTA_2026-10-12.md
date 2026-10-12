# Transaction composition revision 4 (`38915cf` / `02c1748`): bounded delta against doc 87

**Your three questions, answered:**
1. **Composition: CORRECTIONS REQUIRED.** One P2 (R4C-1) remains, in the intake verifier only, and the mistake is in my
   own doc 87 specification. The transaction source stays **ACCEPTED WITH NAMED LIMITS** (doc 87): revision 4 leaves
   it byte-identical. **DC-1 is exact and accepted.**
2. **Pins: RE-CONFIRMED.** I recomputed all 102 pins in both receipts myself: zero mismatches, with exactly the three
   expected rows changed. The five currentness pins and `8b631a83` are unchanged.
3. **Finalization: not yet.** R4C-1 changes the intake verifier, which both receipts pin. Section 3 sets the exact
   envelope now, so that after revision 5 the finalization runs once, with no further review.

No P0 or P1. No regression and no new fail-open path. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-DISABLED-INTEGRATION-SOURCE-REVIEW-20261011`
revision 4, acknowledged at `f8539cd`. Controlling review: doc 87 (`77a2cae`).

**Target:**
- **Source:** `38915cf4318594607098717389113869e3eff0da` (tree `b06c1a3c…`).
- **Records:** `02c1748dee7c1d7e6453aaf993182dcc80e3db65` (tree `a60b61a0…`).
- **The receipts bind** `114d5177cfe7fe26fe57b0189d271cba49407477` (tree `a449e534…`, which I confirmed).

**What changed.** Between `69d9e32` and `38915cf`, only two code paths change: the intake verifier (+266/−23) and the
composition test (−2). Between `38915cf` and `02c1748`, only `.xenios` and the four evidence records change.

**Method.** Four read-only lenses, each with an adversarial verifier, then a completeness critic:
- the R3C-1 attribution;
- R3C-3 and a verifier regression check;
- DC-1 and the client side;
- the records and receipts.

**What I checked myself:**
- every pin;
- the DC-1 diff;
- the R3C-1 frame code;
- the R4C-1 path (`intake.sql:597`, `currentness.sql:1060`, `:615-624`, and the accepted verifier at
  `264e6af:1546-1567`);
- the accepted receipt key-set rule (`264e6af:2071-2076`);
- the R4C-3 regex.

**Disclosures.** Behaviour is reasoned, NOT RUN. Output is archived as `hl12/94_composition_r4_delta_findings.json`.
The submission text refers readers to the coordinator's checkout; I read those three files there as data only.

## 1. Doc 87 items

| Item | Result | Evidence |
| --- | --- | --- |
| Transaction source | **Unchanged and accepted** | Byte-identical to `69d9e32`. Doc 87's acceptance stands |
| **DC-1** | **CORRECTED and accepted** | One hunk (`@@ -844,8 +844,6 @@`) removes exactly the `pages/member/ProductPage.tsx` and `ProductPage.subscription.test.tsx` rows and keeps six well-formed tuples. The new blob is `1ad35398`, raw `79ef310c…`, which matches the approved blob and hash. The records name doc 90 as governing, with no D56 copy and no qualification credit. The patch identity `9a9feba6…` and your approval are not provable from Git; they are taken from the coordinator's records |
| **R3C-1(b)** | **PARTIAL** | The attribution is correctly built, and admin and replay can pass (details below). But the commit control can never pass (R4C-1) |
| R3C-2 | PARTIAL (P3) | Both deltas are enumerated (revision 3: 16/12/74 rows; revision 4: 0/3/99) and the headroom is stated. The finalization envelope is still open, so I rule it in section 3 |
| R3C-3 | PARTIAL (P3) | **Authored:** the git-show blob, raw hash and length comparison; three `^{tree}` checks; six one-value negatives. **Missing:** the committed receipt's `sourceCommit`/`sourceTree` are not compared with the dependency header. **Mislabelled:** the rebased checkpoint tree is called the "accepted currentness source tree" (R4C-2) |
| R3C-4 | CORRECTED | All sub-items are present. CC-15-TYPES still lacks its citation (R4C-6) |
| R3C-5 | CORRECTED (record only) | The TC9-MEMORY-RETENTION and ROUTE-CONTROL-SOURCE-TEXT limits are in all four records. No page source changed |
| R3C-6 | PARTIAL (coordinator) | The erratum is on the board at `ae7e38f`. The TC-15 alignment is NOT PROVEN (R4C-8) |
| R3C-7 | Carried | Owned by the supervisor workstream; due when qualification opens |

**How the R3C-1 attribution works** (`mjs:1159-1349@38915cf`):
- **Capture.** NOTICE and CONTEXT are captured under `SHOW_CONTEXT always` plus `VERBOSITY verbose`, in a fresh backend
  per call.
- **Attribution.** The attributed caller is `frames[1]`, directly after the owned `pg_temp.doc87_mark` frame.
- **Intake frames refuse.** The intake set is exactly the five intake functions plus `inline_code_block`. An intake
  innermost caller refuses, even when the outer frames are canonical.
- **Canonical allowlist.** It is an exact 25-name set with no prefix matching, and an unknown caller refuses. The 14
  trigger names cover all 19 pinned write-target triggers.
- **Probes and twins.** There are four typed positive probes per session, and the no-domain twins are kept.

**Why it can't false-pass:**
- Arguments are evaluated before callee frames are pushed.
- VALUES expressions are evaluated before triggers fire.
- Every canonical SQL helper on the path has `SET search_path`, so none is inlined.
- No intake function suppresses notices.

The controls still discriminate the revision-1 bytes: admin_detail's unqualified variables are attributed to an intake
frame.

## 2. The correction

**R4C-1 (P2, S2; owner: builder `01a10d78`; one file). The commit shadow control can never pass.**

For a new key, the commit's first currentness call is `read_strict_authority` (`intake.sql:597`), which runs
`perform integrity()` (`currentness.sql:1060`). `integrity()` runs with `search_path=''` and digests
`pg_catalog.format_type()` over the twelve source relations' columns (`:615-624`). With same-named `pg_temp` types
present, `text`, `uuid` and `jsonb` are no longer visible, so they render as `pg_catalog.text` and so on. Once the
descriptor is bound, the commit therefore raises 55000 "Quick Order source-column descriptor drift" before any write.
While it is unbound (TC-21), the commit refuses even earlier.

This is the accepted currentness design. The accepted verifier's own R2C-1 control expects exactly this refusal
(`264e6af:1546-1567`: "this session-local type shadow fails closed at the descriptor"). As written, the third shadow
iteration aborts the intake verifier and skips every later control.

**This is my specification error.** Doc 87 required an attainable commit control and assumed the commit reaches
`research_domain_readiness`. It never gets past the gate.

**Ruling (exact fix):**
- **Keep the attribution rule unchanged.**
- **Re-scope the commit shadow session:**
  - expect `sqlFailure` 55000 with the exact message `Quick Order source-column descriptor drift`;
  - run `doc87AttributeShadowNotices` over the failure stderr. All four probe events must be present, with no
    intake-owned or unknown innermost caller. This keeps the commit's DECLARE section and its pre-gate statements
    dynamically covered, because PL/pgSQL initializes declared variables at block entry;
  - assert that effect counts are unchanged;
  - make the no-domain twin the successful commit (`countDelta [1,1,1,1,1]`), followed by its replay.
- **Optional:** a timestamptz-only commit shadow session. `format_type` renders timestamptz without a visibility check,
  so the gate should not drift, and post-gate timestamptz resolution would be observed. This is reasoned, NOT RUN.
- **Records:** correct the TC-3/R3C-1 blocks that claim three attainable success controls, and record the named limit
  below.

**Ruling on the named limit COMMIT-POST-GATE-SHADOW: ACCEPTED.** It follows the doc 80 R2C-1 precedent. Under
jsonb/text/uuid shadows, the accepted currentness gate fails closed by design. Intake type resolution after
`intake.sql:597` is therefore covered:
- **statically:** every intake type is `pg_catalog`-qualified (doc 87 TC-3);
- **dynamically:** through the admin and replay controls, and through the pre-gate commit attribution.

**Fold into the same revision 5 (P3):**
- **R4C-2 (verifier and records).**
  - **Ruling:** the dependency header is the committed currentness receipt's own header, and the finalization keeps it.
  - Assert that the committed `sourceCommit`/`sourceTree` equal `dependency.sourceCommit`/`sourceTree`, each with a
    one-value negative and a positive twin.
  - Add negatives for the definition, `currentnessDefinition`, `reviewCommit` and status checks.
  - Relabel "accepted currentness source tree" as "dependency header (rebased checkpoint) tree". Record that the
    accepted currentness identity is enforced by the five pins plus the definition recompute, or add
    `acceptedCodeSource^{tree}` = `75911334` with a negative.
- **R4C-3 (verifier). The precheck/postcheck descriptor gate is inert.** The regex at `mjs:330` cannot match the actual
  `constant pg_catalog.text := null`. It predates revision 4 and is masked today. Accept an optional
  `(?:pg_catalog\.)?` with a negative for each spelling. Also set `GIT_NO_LAZY_FETCH=1` for git children, or record
  that the verifier needs a full clone.
- **R4C-4 (verifier comment and records).**
  - Add the intake's own `::pg_catalog.date` (`intake.sql:811`) and empty-array forms to the not-runtime-probed list.
  - Reword the schema claim: it is enforceable only for PL/pgSQL frames.
  - Accept the `PL/pgSQL assignment "` wrapper with a fixture, or narrow the "renderings" wording.
  - Extend the CS-2 list, or make the verifier's canonical set authoritative.
  - Optional: require a canonical `documents_json` jsonb event in admin and replay, as positive evidence that implicit
    resolution occurred.
- **R4C-6 (records).**
  - Make CC-15-TYPES cite doc 83 TC-3 and doc 87/94.
  - Fix the stale `laterRevision4Delta` and the erratum's assignment number.
  - Split the TC-10 identity into the accepted `349d3ea9@69d9e32` and the now-accepted `1ad35398@38915cf`.
  - Fix the intake delta's `comparedTo`.
- **R4C-7 (integrator records).** Name the untested 409/unknown-state page branches and the lexical route blind spots
  as S3 carries. Add `governedPaths` to the doc 90 governance record.
- **R4C-8 (coordinator records).** The TC-15 alignment; erratum fields labelled as at-doc-87; a registration erratum for
  `candidateCheckout`; the assignment snapshot committed or bound; the DC-1 patch provenance disclosed.

**Rejected.** These evidence claims, each of which had no effect on the findings:
- `resolve_scope` calling `integrity()`;
- `intake.sql:504` being install-time only;
- the comparator-only-negatives framing;
- the erratum timing rationale;
- one registration line anchor.

## 3. The finalization envelope (ruled now; performed only after revision 5)

**Currentness receipt finalization successor:**
- **Base:** the revision 5 currentness receipt blob that I re-confirm. This replaces doc 87 §2's `1cbdb0d8` base,
  which can no longer be met.
- **Exactly three changes from the base:**
  - `sourceAcceptance.status` → `SOURCE_ACCEPT_WITH_LIMITS`;
  - `sourceAcceptance.reviewCommit` → `29ccf647aa0dc332b334f4dd9c62f6396a85282b` (doc 82);
  - one new key under the existing `disclosures` object. It cites doc 82 for the acceptance and docs 87/94 and the
    revision 5 record for the binding confirmation, and declares the embedded PENDING/NON_FINAL strings superseded.
- **Everything else is frozen:** all 102 pins, the header (`sourceCommit`, `sourceTree`), the definitions, and the
  exact 11 top-level keys and `sourceAcceptance` key set that the accepted verifier deep-checks
  (`264e6af:2071-2076`). The size stays at or under 262,144 B.
- **Records:** drop "+legitimateR4pins" from them. Moving the about 15 KB of receipt narrative into the map is
  recommended. The revision 5 receipt must leave at least 2 KB of headroom.

**Intake currentness dependency seal: FINAL, after that blob is committed.** Change exactly these fields:
- `status` → `SOURCE_ACCEPT_WITH_LIMITS`;
- `reviewCommit` → `29ccf647…`;
- `sealStatus` → `FINAL_CURRENTNESS_DEPENDENCY_ONLY`;
- `receipt.{commit, recordsCommit, gitBlob, rawSha256, sha256lf, bytes}` → the finalized blob.

`sourceCommit`, `sourceTree` and `definitionSha256` (`8b631a83`) stay unchanged; they equal the finalized receipt's
header, which the finalization keeps. These values match the intake verifier's gates (`mjs:217-235`, `:264-275`).

**Intake source seal** (the intake receipt's own `sourceAcceptance`, which the verifier requires before any child):
- It stays PENDING until the composition is accepted at revision 5.
- It is then set to `SOURCE_ACCEPT_WITH_LIMITS` with the revision 5 acceptance record as `reviewCommit`, as a separate
  step.

**No further review.** Neither successor needs one if it matches this envelope byte for byte. I will spot-check the
diff when it is registered. A mismatch fails closed in the accepted verifiers.

**TC-21 (S3).** Binding the descriptor changes the currentness definition and forces a re-seal of all of the above. It
is also what would have unmasked R4C-1, which is why R4C-1 lands first.

## 4. Next steps (nothing here authorizes tests, SQL, installation, a push or deployment)

1. **Builder: revision 5.**
   - The verifier: R4C-1, plus R4C-2, R4C-3 and the R4C-4 comment.
   - The records: R4C-4, R4C-5 restatement, R4C-6 and the narrative pruning.
   - Rebind both receipts. Only the verifier row and records rows may change, and the five currentness pins and
     `8b631a83` stay unchanged.
   - No SQL, adapter or client change.
2. **Integrator, optional in the same rebind:** R4C-7.
3. **Coordinator:** R4C-8, then register revision 5 for a narrow check: the verifier diff against this ruling, the
   records, and my pin re-confirmation. If it is clean, that record accepts the composition and confirms the
   finalization base.
4. **Then, in order:** the currentness finalization successor, then the intake dependency seal FINAL, then the intake
   source seal, each matching section 3.
5. **Still open:** your or the coordinator's TC-25 protected-change disposition for `App.tsx` `b5cc8edc`, before
   integration or qualification. Then S3 qualification under its own approval, including the TC-21 descriptor binding
   and re-seal and the R3C-7 manifest rebind.

**Carried named limits:**
- CANONICAL-CS-2;
- TC1-CANDIDATE-WRAPPER;
- INTEGRITY-ONLY-STRICT;
- DECODER-CANONICAL-CHECK-PARITY;
- CONFIGURATION-422;
- TC9-MEMORY-RETENTION;
- ROUTE-CONTROL-SOURCE-TEXT;
- NOTICE-CONTEXT-FORMAT;
- COMMIT-POST-GATE-SHADOW (new, accepted);
- TC-17 partial;
- TC-18 carry;
- TC-20 to TC-28 as staged.
