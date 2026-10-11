# Currentness verifier revision 3 (`264e6af`): byte check

**R2C-1 AND R2C-2 CORRECTED. The doc 81 SQL and definition are intact. The currentness family is ACCEPTED WITH NAMED
LIMITS.**

- **The currentness receipt may be finalized.**
- **The intake's dependency seal on currentness may be finalized** against the accepted definition.

This does not accept the intake source or the integration changes. Those go to the transaction composition review.

No P0 or P1, and no blocking defect. Nothing was executed. Authored controls are not pass counts.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC71-CURRENTNESS-SOURCE-ACCEPTANCE-20261010` revision 3,
registered at coordinator `7a14880` and acknowledged at `8db00bd`. Samuel delivered it directly. Controlling review: doc
81 (`97c61df`).

**Target**, recomputed from Git:

| Field | Value |
| --- | --- |
| Source | `264e6af20477fabe65aa8d229ed2334fb59d9cc4` (tree `75911334…`), on `codex/accepted-source-integration-20261005`. Relative to its parent `642978a`, the commit changes only the verifier |
| Verifier `research_health_quick_order_currentness_local.mjs` | blob `26c0cd3`, raw `6c47b308b394cd70e1a6e381fb3b75b8737390bef5b366d79dfffe770fac7094` |
| Records | `b00aed5be48d9b3ff92a62f041ceb8ec344bcb2f` (tree `3b007c05…`), via `fcdc31b` |

**Method.** Two read-only checkers, each with an adversarial verifier: the R2C-1 control; R2C-2 coverage and the records.
I confirmed the SQL hashes, the verifier binding in the records and the unchanged definition myself.

**Disclosures.** The agents reported read-only command-form deviations only. No file was written and nothing was
executed.

Output is archived as `hl12/82_currentness_verifier_r3_byte_check.json`.

## 1. Results

| Item | Result |
| --- | --- |
| **The doc 81 SQL** | **Intact.** All four files are byte-identical to doc 81 at `264e6af`, and also at the provisional intake `5e984ca`: `d44974d1…`, `91ab412b…`, `78534251…`, `8de55983…` |
| **The definition** | **Unchanged.** `8b631a83…` is recorded unchanged, and the verifier's digest computation (now `mjs:2148-2152`) is byte-identical to revision 2's. The value itself was not recomputed here and fails closed if wrong |
| **R2C-1, the temporary-object control** | **Corrected** (`mjs:1546-1569`). The marker is a NOTICE collected on the writer connection on both the success and error paths, and a direct call first proves capture. With the shadow domains present, both guarded updates go through the refusal helper. Each expects 55000 "Quick Order protected source columns drift", the exact text at `sql:1130`, with all six authority relations unchanged and zero marker notices. A twin without the domains must succeed: zero rows means no change, and the material write gives +1 and held. Reasoned (NOT RUN), it discriminates: revision 1's unqualified declarations would raise the marker notice, so the zero-marker assertion would fail |
| **R2C-2, drift coverage** | **Corrected.** Function settings, owner and ACL drift loop over all 13 functions, and table ACL over all six tables. A new role-membership case leaves the fingerprint unchanged and reaches the explicit function-ACL loop (`sql:796-798`), after the fingerprint check (`sql:709-712`). Every expected message exists verbatim in the accepted SQL |
| **Records** | **Correct.** Both receipts and the correction map bind the new verifier (`6c47b308…`, blob `26c0cd3`, 219,791 bytes). The four SQL hashes, the definition and the shared bindings record (`ac7d45ec…`) are unchanged. Nothing claims a pass count, an execution, a final seal or this acceptance. The intake seal is NON_FINAL |
| **Precision items R2C-3 to R2C-15** | **Partly folded in.** The remainder travels as named limits (section 3) |

## 2. Disposition and what it permits

**Accepted with named limits:** the currentness family at source `264e6af`. That means the four doc 81 SQL files and
the revision 3 verifier above, with definition `8b631a83…` as recorded.

**Permitted now:**
1. **Finalize the currentness receipt,** binding this review, the five file hashes and the definition.
2. **Finalize the intake's currentness dependency seal** to the accepted definition.

**What this does not accept:**
- **The intake source** (`121d098`, provisional).
- **The integration changes on the same lineage:** the session, handler, production, ports and composition files
  changed in `8e01ef8`, `59b2241` and their successors.
- **Any execution.**

**How the lineage affects the receipts.** `264e6af` does not descend from `aa857e4`; it sits on the integration
lineage. The currentness paths match `aa857e4` except for the verifier. The receipts' dependency rows for
non-currentness files, however, now name integration-lineage versions that have not been reviewed. Those rows are
identity bindings only, not acceptance (YV-1). The intake source, those integration files and the composition all go to
the transaction composition review.

## 3. Named limits

**From doc 81, still in force:**
- **Nothing is executed.** No control has run, and PostgreSQL behaviour is reasoned only.
- **The digest is not recomputed.** The definition digest and the raw hashes are not recomputed beyond Git blob identity
  and size; a wrong value fails closed.
- **Descriptor seals.** Both source-column descriptor seals stay NULL until the implemented snapshot's descriptor is
  bound (S3 or S4). Install, integrity, precheck, postcheck and rollback all refuse until then.
- **Carried items.** CS-27 to CS-32 and R2C-16 to R2C-18 travel to S3; CS-33 to CS-36 travel to S4.

**From this check (nonblocking precision, for the composition records or S3):**
- **X-1:** no executed witness that the shadow-type path yields a marker.
- **X-2:** the exception count ignores some string literals (R2C-5 scope).
- **XV-1:** the dynamic control shadows only three type names. Other bare types in the function-entry path are covered
  only by the static qualification check.
- **Y-1:** the explicit table-ACL loop is still reached only behind the fingerprint.
- **Y-2:** one receipt and map field describes the old expected refusal.
- **Y-3:** the membership case assumes the fixture's `anon` role inherits.
- **Y-4:** historical blocks were edited in place under a label.
- **YV-1:** the lineage rebinding described in section 2.
- **YV-2:** the owner-side cases assume a superuser fixture owner.

## 4. Next steps

1. **Builder:**
   - finalize the currentness receipt and the intake's currentness dependency seal, as permitted above;
   - complete the schema and checkout bindings from their proper evidence sources, inventing no installed-state
     identity;
   - freeze the transaction composition, covering the intake source, the integration changes on this lineage and the
     shared bindings record.
2. **Coordinator:** register the bounded transaction composition review to this reviewer.
3. **Throughout:** nothing here authorizes tests, SQL, installation, a push or deployment.
