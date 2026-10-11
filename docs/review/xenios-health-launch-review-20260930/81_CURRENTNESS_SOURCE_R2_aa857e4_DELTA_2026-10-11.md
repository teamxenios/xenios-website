# Currentness source revision 2 (`aa857e4`): bounded delta against doc 80

**CORRECTIONS REQUIRED, IN THE VERIFIER ONLY. The four currentness SQL files are accepted as the currentness
definition, and the intake reseal may start against them now.**

Revision 2 makes every SQL correction doc 80 required:
- **CS-1.** The integrity check now covers tables only.
- **CS-2.** Every type, cast, catalog relation and built-in is qualified.
- **CS-3.** The structural predicates sit, byte-identical, in all five places.
- **CS-4.** The record_id refusal is removed.
- **CS-5.** The alias-collision bypass is closed.

The regression sweep of the large qualification rewrite found no invalid name, changed cast, weakened check, changed
lock order, signature, owner, SECURITY DEFINER flag or function setting, and no new fail-open path. Most verifier and
records items are corrected too.

Two verifier items remain:
- **R2C-1.** One control cannot pass and cannot tell the old source from the new.
- **R2C-2.** One coverage set was not extended as required.

Both are edits to `research_health_quick_order_currentness_local.mjs` only. Neither changes a SQL byte or the
definition digest, because the verifier computes that digest from the SQL install and fingerprint sections alone
(`currentness_local.mjs:2024`).

No P0 or P1. Nothing was executed. Authored controls are not pass counts.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC71-CURRENTNESS-SOURCE-ACCEPTANCE-20261010` revision 2,
registered at coordinator `ebcbe18` and acknowledged at `4593f22`. Controlling review: doc 80 (`1b68cda`).

**Target**, recomputed from Git:

| Field | Value |
| --- | --- |
| Source | `aa857e4f94df95f09a1402fb1cbf08042a3bc19f` (tree `03eae1a56cf433e604392440b4d42cb26eef5e56`) |
| Records | `735254e4cc6230479c9bfa821e1c6991389d5266` |
| `…currentness.sql` | blob `dd7d3e59`, raw `d44974d1826328b0b2be99b2b1cc9b5d4e8f456d4e8f8f62335a09e586354135` |
| `…currentness.precheck.sql` | blob `11f32766`, raw `91ab412bf9f95f3470ca0854621e15409930570f11f7c1b0ffb2489e4451c22e` |
| `…currentness.postcheck.sql` | blob `c894794a`, raw `785342514257040685a68ce5aadc2723b8741ddd226bc9e35c537ff2628b205f` |
| `…currentness.rollback.md` | blob `fc898603`, raw `8de5598353ced0a68a733c6f06ecc6b04675e7831376c06acbf01efed3cae5ff` |
| Verifier `…currentness_local.mjs` | blob `120449d6`, raw `2665acf4…` |
| Definition digest, as recorded | `8b631a8323394d8277986b3be6560a494bf541e102e93ad263a7a5990e3baabe` |

The source commit changes only the five currentness paths.

**Method.** Three read-only lenses, each with an adversarial verifier, then a completeness critic:
- the SQL corrections and a regression sweep;
- the verifier controls;
- the records and trust chain.

I confirmed R2C-1 and the definition-digest inputs myself.

**Disclosures.** The agents reported read-only command-form deviations only. No file was written and nothing was
executed.

Output is archived as `hl12/81_currentness_source_r2_delta_findings.json`.

## 1. Doc 80 items

| Items | Result |
| --- | --- |
| CS-1, CS-3, CS-4, CS-5 (SQL) | **Corrected** |
| CS-2 (type qualification) | **SQL corrected.** Qualification is complete in all four SQL files; the only unqualified occurrences are in comments. The required temporary-object negative control is defective (R2C-1) |
| CS-6 to CS-13 (verifier) | **Corrected:** the valid revoke reason with the spaced-reason negative; the gate-predicate set; published-state writer-profile refusals; the 3 x 3 isolation matrix; 65 published-state IN and OUT cases; immutability, seal and parser refusals; timer and relation negatives; MERGE, CTE and COPY; prefixed-trigger negatives |
| CS-14 (settings inventory) | **Partial.** The 13-function inventory, rollback absence and role denial are present. The drift negatives were not extended (R2C-2) |
| CS-15 (records) | **Corrected** |
| CS-16 to CS-26 (precision) | **Corrected,** except CS-24, partial in the receipt only (R2C-15) |
| CS-27 to CS-36 | **Carried** unchanged to S3 and S4 |

## 2. Remaining corrections (P2, verifier only)

**R2C-1. The temporary-object negative control cannot pass or discriminate** (`currentness_local.mjs:1470-1479`).
- **What it does.** The control creates temporary domains named `jsonb`, `uuid` and `text`, then runs two guarded
  updates with no refusal handling.
- **Why it fails.** The guard builds its column descriptor with `format_type` (`currentness.sql:1126-1130`), which
  renders those types differently once the temporary names shadow them. So the guard refuses with 55000 "protected
  source columns drift", and the control throws (reasoned, NOT RUN).
- **Why it proves nothing.** Its marker is a temporary-table insert, rolled back with the failing statement, so it
  would also show zero against revision 1.
- **The fix.** Make the marker a NOTICE that survives rollback. Run both updates through the refusal helper, expecting
  55000 with no authority change and no marker notice. Add a twin without the domains that passes.

**R2C-2. The drift negatives are not extended** (`currentness_local.mjs:1839-1842`). The ACL, settings and owner drift
negatives cover one old function and one table only. Doc 80 CS-14 named `activate_revision`, `resolve_scope`,
`read_strict_authority`, `guard_source_write` and the new tables. **The fix:** loop the function settings, owner and
ACL cases over all 13 functions, and the table ACL case over all six tables, with at least one case that reaches the
explicit ACL loops past the fingerprint.

## 3. Ruling: the SQL definition is accepted now

Revision 2's four SQL files are fully corrected, with no remaining S2 issue, and the definition digest depends only on
them. So I accept them now as the currentness definition the dependent work may bind. This shortens the critical path:
the builder need not wait for the verifier fixes before starting the intake reseal.

- **Accepted now, for dependency binding:**
  - `…currentness.sql` (raw `d44974d1…`), `.precheck.sql` (raw `91ab412b…`), `.postcheck.sql` (raw `78534251…`) and
    `.rollback.md` (raw `8de55983…`) at `aa857e4`;
  - the definition digest `8b631a83…` as recorded.

  The digest's value is consistent across all six record sites. It is NOT PROVEN by hashing here, and fails closed if
  wrong.
- **The builder may now:** author the intake dependency-seal successor against that definition (doc 80 section 3 and
  R2C-9's IC items), and prepare the schema and checkout bindings.
- **Not final yet:** the currentness receipt and the intake seal stay non-final until I byte-check revision 3. That
  check confirms the four SQL files and the digest are unchanged and that R2C-1 and R2C-2 are fixed.
- **If revision 3 changes any SQL byte,** this ruling lapses, and the delta is reviewed again.

## 4. Precision items (P3)

**Fold into revision 3 where cheap (S2):**
- **R2C-3.** rollback.md wording about the anchor (changes the rollback.md hash only).
- **R2C-4.** Two fixtures that don't isolate their predicate.
- **R2C-5.** The EXCEPTION check is line-anchored.
- **R2C-6.** Add a static source assertion.
- **R2C-7.** The intake receipt copies currentness refusals.
- **R2C-8.** Label the stale `6c6b27b4` digest.
- **R2C-9.** Number the intake reseal carry by IC item, and include the intake's own LIKE scan.
- **R2C-10.** Superseded case IDs.
- **R2C-11.** The coordinator's dependency block is pinned at revision 1.
- **R2C-12.** Stage consistency across records.
- **R2C-13.** R2-4 row fields, and the "6+17+14" count.
- **R2C-14.** Split the CC-15-TYPES disposition.
- **R2C-15.** Disclose the revoke SQLSTATE change.

**Travel to S3:**
- **R2C-16.** The `int2vector` comparison resolution, confirmed by the first positive integrity control.
- **R2C-17.** Holder idle-timer races.
- **R2C-18.** Per-control evidence and a logical-WAL prerequisite.

**Rejected:**
- **UV-1.** The guard reads the forced-RLS head before any classification.
- **The CS-13 partial rating, and the CS-9 40001 remark.** The bytes refute both.

## 5. Next steps

1. **The same builder:** a revision 3 confined to `currentness_local.mjs` (R2C-1, R2C-2), with R2C-3 to R2C-15
   folded in where cheap, and the records rebound to the new verifier hash. The four SQL files stay untouched.
2. **In parallel, under the ruling in section 3:**
   - author the intake dependency-seal successor against definition `8b631a83…`;
   - prepare the schema and checkout bindings.
3. **Me:** a byte check of revision 3 against R2C-1 and R2C-2, confirming the SQL and digest are unchanged. Then the
   currentness receipt and the intake seal may be finalized, and the transaction composition submitted for review.
4. **Throughout:** nothing here authorizes tests, SQL, installation, a push or deployment.
