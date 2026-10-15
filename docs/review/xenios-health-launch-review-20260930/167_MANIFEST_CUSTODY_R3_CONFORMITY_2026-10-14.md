# Manifest custody wording r3: conformity with Doc 166

**CONFORMS. The required Doc 166 clarification is resolved by the preferred route. Exactly one manifest line changes,
in two places only:**

- the label `APPLICATION_CUSTODY_PENDING` becomes `APPLICATION_CUSTODY_RECORD`;
- the "at application, replace all three" sentence is replaced with the Doc 166 two-stage order.

Every other byte, all 39 accepted files and both seam pins are unchanged, and the three custody values stay unfilled.

This is a conformity check of an unapplied proposal. Nothing was run. It does not re-review accepted source, and it
grants no custody, source application or execution.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs and
metadata. No tests, parsing of application code, patch application, queries or agents. Archive:
`hl12/167_manifest_custody_r3_conformity.json`.

## 1. Binding

- **Source.** Core `96aa00c8` (tree `370969b3`, parent `bc3a2028`). Records: `fdd21e7e` (tree `4064211f`), which adds
  `HANDOFF.json` only. All files sit in `manifest-custody-r3/`.
- **Artifacts.** All seven match the packet's pins:

| Record | Bytes | SHA-256 |
|---|---|---|
| `SOURCE_MANIFEST.json` | 8,216 | `4ac7ece4…` |
| `DELTA_AFTER_CLAIM_R2.patch` | 6,031 | `d86cfce3…` |
| `CUMULATIVE_AGAINST_8e.patch` | 238,471 | `b8b77b7e…` |
| `CUMULATIVE_SOURCE_INDEX.json` | 54,855 | `a935911b…` |
| `SOURCE_APPLICATION_PROCEDURE.txt` | 7,042 | `7ab9ed17…` |
| manifest before | 98,841 | `ff65e384…` (blob `f0db4f0e`) |
| manifest after | 99,341 | `89c17ed3…` (blob `edc97036`) |

- **Before-image.** The manifest before-image is byte-identical to the composition-r2 after-image that Doc 166
  reviewed.

## 2. Conformity checks

- **Two edits only.** Exactly one physical line differs. Reversing the two edits recovers the old manifest byte for
  byte (`ff65e384…`).
- **Placeholders.** `lease=UNASSIGNED`, `authority=UNGRANTED` and `custody-return=PENDING` each still appear once,
  unfilled.
- **The rest of the manifest.**
  - It still parses.
  - The `seamBaselineHashes.files` pins are unchanged: `server/index.ts` `1a3fb0b7…` and `server/research/index.ts`
    `000da4da…`.
  - All 533 comment entries are present, and only the new first entry differs.
  - Every other part of the manifest is identical.
- **Wording.** The new sentence states the Doc 166 section 5 order exactly:
  1. an exact decision covering all 40 paths, and a real exclusive protected lease;
  2. a copy of the 39 fixed files plus the manifest, with only lease and authority filled from actual records, while
     the custody return stays PENDING;
  3. the original applied-byte confirmation;
  4. separately authorized qualification under that custody;
  5. the real return, with the receiving owner's acknowledgment;
  6. a finalizer with its own valid authority that fills only the custody return, freezes and measures the manifest,
     re-runs the protection and seam checks, and obtains the original final-record confirmation. The returned lease is
     not reused.

  The new label stays accurate after completion. The procedure file states the same order.
- **Index and patches.**
  - The source index keeps the same 40 paths, 11 existing at `8e85daa` and 29 new.
  - Only the manifest's after entry changed; every before entry is unchanged.
  - The cumulative patch differs from claim-r2's only in the manifest hunk and its blob, and the delta has one file
    section.

## 3. What stays as recorded

- **Accepted source.** Docs 163–166 cover all 40 final paths at source level, now with this manifest after-image in
  place of composition-r2's.
- **Non-blocking items.** The non-blocking findings from Docs 163, 165 and 166 stay open and optional.
- **Custody.** Samuel's exact source and custody decision and a real exclusive protected lease are not held. Docs lease
  `19d2ed9a` gives none.
- **Execution.** Execution remains separately authorized. That covers database, rate-limiter, Care foundation and
  patient-index rehearsal; typecheck, build, tests and browser runs; and the protection and release controls.
- **Security.** Security authority is NONE. The pending staff-read scope must stay unapproved until the
  exposed-credential condition is closed and service-role rotation is confirmed. Names stay deferred, as recorded.
- **Unchanged.** R8 and Docs 160–166 stay closed, and the application `8e85daa` is unchanged. Failed run `790af2ce`
  stays FAILED, and the payment and security holds stay open.

Not execution, custody, source-application, push or deployment consent; not human approval or test credit.
