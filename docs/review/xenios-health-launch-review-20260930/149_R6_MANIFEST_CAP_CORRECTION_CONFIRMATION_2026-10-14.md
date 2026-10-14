# R6 manifest cap correction: narrow confirmation

**CONFIRMED. Doc 148's blocking defect is fixed exactly, and nothing else changed.** R6 is source-compatible, with
the retained timing limitation stated below.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
compiled, parsed or run. Archive: `hl12/149_r6_manifest_cap_correction_confirmation.json`.

## Binding

- **Commit.** Core `3bb19a31` (tree `21916cac`, parent `bc45acb6`) adds exactly 19 files in
  `native-resource-gate-r6-manifest-cap-successor-proposal/`: 12 `.proposed` counterparts, a `.gitattributes` of
  `* -text` (which closes Doc 148's hygiene note) and 6 records. It has no other edits.
- **Bytes.** The raw blobs equal the stated values:

| Record | Bytes | SHA-256 |
|---|---|---|
| `FREEZE_INDEX_R6.json` | 11,040 | `a66f43aa…` |
| `SOURCE_BINDINGS_R6.json` | 27,225 | `a4ee2cb1…` |
| `NARROW_VS_R5_REVIEW_ONLY.patch` | 3,151 | `8ab14c8e…` |
| `COMPLETE_VS_5ee7f88_UNAPPLIED.patch` | 108,883 | `f7bc4827…` |

  All six records in Root's archive are byte-identical, and the worktree equals the blobs.

## The delta

- **Changed.** Of the twelve `.proposed` files, ten are byte-identical to R5. The other two differ by one line each:
  - Caller line 181: `L-Regular $lManifest 26295` becomes `34182`. The caller is still 25,487 B, now `3b1dfdee…`.
  - Executor line 17: `$eCallerHash` becomes `3b1dfdee…`. The executor is still 17,208 B, now `d042053b…`.
- **Caps and pins, checked as data.**
  - The caller's manifest cap is 34,182, which equals the manifest's bytes. The caller still pins the unchanged
    manifest `93a557cf…`.
  - The addendum cap of 4,015 equals the frozen addendum's bytes.
  - The executor pins the new caller hash and the 25,487-byte size.
  - The closure's manifest cap of 131,072 is above the manifest's size.
- **Unchanged.** The native adapter, validator, slices and 25 cases are exactly as reviewed in Doc 148.

## Retained timing limitation

The qualification owner keeps the combined budget: the cold compile and the native read must fit in 2,000 ms in the
counter parent and supervisor, and 1,000 ms in the diff-check runner. The 30 s fence, floors and refusals are
unchanged, with no separate initialization, prewarm or bound extension. That is the "if kept" alternative Doc 148
allowed. The first independently admitted run of each runner must prove its own fit, and a late refusal is a
foreseeable outcome. A late refusal in the supervisor leaves only its stderr token, with no duration.

## What a successful run would prove

Take one successful supervisor G0 inside an admitted counter-proving run: `memorySource GetPerformanceInfo`, a
`counterReadMs` under 2,000, finite derived values above the floors, and the run continuing past G0. For that one
fresh pwsh process on this host, under the caller's rebuilt environment, that run proves:
- `Add-Type` compiled cold within the combined 2,000 ms;
- the adapter's own runtime assertions passed, meaning the 64-bit structure size of 104 and every field offset,
  since any mismatch throws before the call;
- `K32GetPerformanceInfo` returned success with `cb` unchanged;
- the validator accepted every field;
- the three floors held.

The 25 stub outcomes prove the validator and slice logic only, not the adapter.

It does **not** prove:
- a recomputation from raw values, because the receipt keeps only derived MiB figures and timings, not the page
  snapshot;
- the 32-bit path;
- other hosts or OS states, including a cold OS after reboot;
- the diff-check runner's 1,000 ms fit, which is its own admitted run;
- the finalization-controls parent's fit, a separate process under its own environment that runs the same bytes
  but needs its own run;
- the browser's 2,048 MiB admission, a separate runner and floor.

The scheme group runs the same supervisor G0 bytes, so it shows its own fit in its own run.

## Remaining

1. The exact canonical twelve-path protected-body, supervisor, manifest and hash exceptions, which are held for
   Samuel's actual decision. This confirmation does not lift them.
2. After application, a hash confirmation of the twelve canonical files against these `.proposed` bytes.
3. Fresh counter admission. Its G0 provides the counter-path proof described above.
4. Then scheme, controls, diff check, browser, manifest, security, release, deployment and served identity.

Not execution consent, not source-application authority, and not test credit.
