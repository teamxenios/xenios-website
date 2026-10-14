# R8 narrow successor: Doc 159 correction confirmation

**CONFIRMED.** Core `9e1ddbc0` makes exactly the Doc 159 correction and adds the requested vectors. Its dependent pins
cascade exactly. Nothing else changed. R8 is now source-compatible with Doc 158.

This is source compatibility only. It is not a controls run, timing, closure proof or qualification.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
diffs and hashes. Nothing parsed, run, queried or imported. No agents. Archive:
`hl12/160_r8_doc159_narrow_correction_confirmation.json`.

## Binding

- **Commit.** Core `9e1ddbc0` (tree `7cd4bf04`, parent `134d246c`) adds exactly 11 files under
  `identity-qualified-closure-r8-doc159-narrow-successor/`. Root's mirror is byte-identical.
- **Records.** The bindings are 10,118 B `740eb375…`. The complete patch against canonical R7 is 27,513 B `a40cd0f2…`
  and names the five targets. The narrow patch against `e280d5e1` is 10,864 B `84f872ce…` and names four targets plus
  the controls.
- **Parent.** The parent `134d246c` adds only the unadmitted control-template record. That record is not reviewed
  here and is not the controls' execution contract.
- **Unchanged.** All 11 `e280d5e1` files and the 13 canonical R7 files are unchanged. The R8 output root does not
  exist yet.

## The correction

`Q-ClassifyObservedIdentity` now works in this order:

1. **Parse the row.** It reads the row's ID, parent ID and creation time first. Any missing or invalid value still
   refuses.
2. **Self and known matches.** It requires the full identity check, including a valid and matching executable, only
   inside two branches: an ID and creation-time match with the closure itself, or with a known identity. A missing
   executable there refuses as unknown, and a different one refuses as a mismatch.
3. **Everything else.** Worker-child, reused-parent and reused-ID rows are classified from ID, parent and creation
   alone. Any executable value is kept in the observation without being required or validated.

Nothing else in the closure changed. The gate binding and echo, row retention, refusal record, scheme lifetime rule,
two quiets, 500 ms spacing, 1 s query, 10 s limit and post-pins are all unchanged.

## Pins

| File | After | Change since `e280d5e1` |
|---|---|---|
| Closure | 14,620 B `a153292c…` | Classifier only |
| Supervisor | 35,636 B `aaf3f093…` | None, identical |
| Manifest | 46,451 B `e4cf6425…` | Closure pin in counter and scheme only |
| Caller | 25,874 B `daa0d1ed…` | Manifest hash only, same 46,451 cap |
| Executor | 17,331 B `476f648f…` | Caller pin hash only, same 25,874 size |

## Controls

The controls file is 6,871 B `5118b193…`. It pins the corrected closure at 14,620 B `a153292c…`. All 20 earlier vectors
are kept, and the count literal is now 24. The four new vectors are:

- a reused ID with no executable, which is not present;
- a reused ID with `\SystemRoot\System32\smss.exe`, which is not present;
- a `Local`-kind creation time exactly 1 ms off, which is still present;
- a `Local`-kind creation time just past 1 ms, which is reused.

Reading the code, all 24 expected outcomes follow, including the exact-identity-without-executable refusal. The file
has no CIM, process, write or network call. It has not been run.

## Still held

1. Samuel's new exact five-path protected exception for these after-images. The superseded `e280d5e1` payload was
   never asked.
2. Same-owner application and my applied-byte confirmation.
3. An actual local run of the 24 controls under a reviewed execution contract, with the result recorded.
4. A fresh, independently authorized window and ticket for all 32 counter cases, carrying the new gate argument, the
   new pins and the R8 root, then my comparison.
5. Core acknowledgment, Root admission and Core final readiness, then one call.

**Unchanged.**
- Ticket `790af2ce` stays consumed and FAILED. Its 93 files are preserved and its outputs are not reused.
- The application `8e85daa` is unchanged.
- The security hold stays open, with no remediation confirmed.
- The browser, diff, final manifest, provider and live verification remain separate.

Not execution consent, not human approval and not test credit.
