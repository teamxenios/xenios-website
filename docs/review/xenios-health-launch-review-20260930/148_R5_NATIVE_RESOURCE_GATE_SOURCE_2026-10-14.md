# R5 native resource gate: source disposition

**CORRECTION REQUIRED: one blocking defect with a one-number fix. One material timing finding is also recommended
for correction. Otherwise source-compatible.**

What is right:
- The `GetPerformanceInfo` adapter is correct against the documented structure.
- It measures system commit headroom the documented way, `(CommitLimit − CommitTotal) × PageSize`, which closes the
  Doc 147 gap.
- It keeps the operating-system physical check and both 512 MiB floors.
- The validator and the 25 fixture cases are coherent, the shared copies are byte-identical and the pin chain is
  consistent.

The blocker: the proposed caller still refuses any manifest larger than 26,295 bytes, and the proposed manifest is
34,182 bytes. Every counter and scheme run would stop at the caller's input check before anything started.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
parsed, compiled, imported or run. Archive: `hl12/148_r5_native_resource_gate_source.json`.

## 1. Binding

- **Commit.** Core `bc45acb6` (tree `7d08ad52`, parent `5ee7f88f`) adds exactly 17 files under
  `native-resource-gate-r5-source-proposal/`: 12 `.proposed` counterparts and 5 records. It has no canonical edits.
- **Bytes.** Every raw blob matches the stated sizes and hashes: `FREEZE_INDEX_R5.json` 10,322 B `e8c342ea…`,
  `SOURCE_BINDINGS_R5.json` 29,290 B `b9d7212c…`, and `COMPLETE_VS_5ee7f88_UNAPPLIED.patch` 108,077 B `3ab54aa9…`.
  Root's five archived records are byte-identical, and the worktree equals the blobs.
- **Line endings.** This folder has no `.gitattributes`, unlike the four canonical folders, which carry `* -text`. A
  `git archive` export on this host converts the line endings; I first saw differing sizes for that reason. Raw-blob
  identity is unaffected, and the canonical folders protect applied bytes. This is hygiene only.

## 2. What I verified

- **Diffs.** Each `.proposed` file diffs cleanly against its canonical blob at `5ee7f88f`. The caller and the
  executor each change one pin line.
- **Byte-identical copies.**
  - The 62-line adapter is identical in the supervisor, the counter parent and the diff-check runner.
  - The 40-line validator is identical in the supervisor, parent, fixture and diff-check runner.
  - The 24-line resource slice occurs exactly once in the supervisor and once in the parent, and it is the
    fixture's slice body.
  - The fixture contains no `Add-Type` and no `DllImport`.
- **Adapter.**
  - The structure's `Pack = 8` sequential layout gives 104 bytes on 64-bit and 56 on 32-bit. The asserted offsets
    `{0,8,…,80,88,92,96}` and `{0,4,…,52}` match the SDK `PERFORMANCE_INFORMATION`.
  - The import is `kernel32!K32GetPerformanceInfo` with `ExactSpelling`, System32-only search and a 4-byte boolean
    return.
  - `cb` is set to the size and checked after the call. Any exception becomes `MEMORY_NATIVE_READ_FAILED`, and an
    already-loaded type is refused.
- **Validator.**
  - Exactly one native row and one operating-system row.
  - A closed key set, with `success` required to be true. The pointer width must equal the process's and match the
    structure size.
  - Every numeric field must be a non-boolean integer value type: not null, NaN, infinite, negative, fractional or
    beyond 64-bit.
  - Page size must be positive and available memory no larger than physical total. On 32-bit, page counts must fit
    32 bits.
  - Each page-to-byte product is checked for overflow. Commit charge above the limit is refused as
    `RESOURCE_FLOOR`.
  - Output: operating-system free as KB/1024, available as `PhysicalAvailable × PageSize`, commit headroom as
    `(CommitLimit − CommitTotal) × PageSize`. The slice keeps the three 512 MiB floors and the 30 s parent-age fence.
- **Fixture.** I traced all 25 cases. The defaults give exactly 1,024 MiB. `valid-floor` gives exactly 512 MiB on
  all three figures, and the low cases give 511 MiB. Each refusal case reaches its stated token: zero or two rows,
  missing, null, negative, NaN, infinite, fractional and boolean fields, false result, bad structure size, zero page,
  overflow, physical above total, operating-system null, late operating-system read, late read, throw, and
  late-then-throw, where late wins. The manifest's 25 case contracts equal the fixture table.
- **Pin chain.**
  - The manifest's counter pins for supervisor, parent, fixture and requirements equal the proposed bytes. The
    scheme pin for the supervisor matches too.
  - The caller pins the proposed manifest `93a557cf…`. The executor pins the proposed caller `01ffd16b…` at 25,487 B.
    The fixture pins the proposed parent `31bd76fa…`.
- **Work budget.** 25 child cases fit the unchanged 90 s counter work budget and the 5 s child limit; the longest is
  about 2.6 s.

## 3. Blocking defect

- **Where.** The proposed caller `invoke-proving-with-observer-gate.ps1`, line 181:
  `L-Regular $lManifest 26295;L-Regular $lAddendum 4015`. `L-Regular` throws `INPUT_SHAPE` when the file is larger
  than its cap.
- **Consequence.** The proposed manifest is 34,182 bytes. Every counter or scheme run would refuse at the caller's
  input binding, before CMD, the supervisor or G0 starts. That would consume an approved window with no information.
- **Smallest correction.** Change `26295` to `34182`, an exact cap as in the original pattern. The caller's length
  stays 25,487 bytes; only its hash changes. Then re-pin the executor's caller hash.
- **Proving check, data only.** Every size cap in the chain must be at least the pinned size of the file it guards:
  the caller's manifest cap equals the manifest's bytes, the addendum cap is 4,015, the executor's caller pin equals
  the caller's bytes, and the closure's manifest cap is 131,072. Root's mechanical checks compared hashes, not caps,
  which is why this passed.

## 4. Material timing finding, correction recommended

- **The issue.** The timed read includes `Add-Type`, a cold in-process C# compile, inside 2,000 ms in the counter
  parent and supervisor and 1,000 ms in the diff-check runner. The records already say compile feasibility is
  unproven.
  - The bound was introduced to limit the provider read.
  - A cold compile is a one-time local cost, unrelated to whether memory is available, and its duration on this host
    is unknown.
  - Under the 1,000 ms diff-check bound, a refusal unrelated to resources is a real risk.
  - A late refusal in the supervisor leaves no receipt, only the stderr token, so the run could not show which part
    was slow.
- **Smallest correction.** Time `Add-Type` as its own explicit, recorded step, inside the same G0 phase, with its own
  finite bound, and fold that bound into the existing parent-age fence arithmetic. Apply the 2,000 ms and 1,000 ms
  bounds to `[Xenios.ResourceGateR5]::Read()` alone. Both durations should appear on stderr before any late refusal.
  This is not a hidden prewarm: it is in the same step, bounded and visible.
- **If kept as is.** The owner may keep the combined budget. Then the first admitted run is the proof, and a late
  refusal there is a foreseeable outcome.

## 5. Non-blocking

- No fixture case exercises an operating-system row count other than one, or a pointer-width mismatch. The validator
  does check both.
- The proposal folder lacks `.gitattributes`, as noted in section 1.

## 6. Remaining

1. **Corrections.** The section 3 correction, and if adopted the section 4 one, frozen with re-pins. Then my narrow
   byte confirmation.
2. **Exceptions.** The exact canonical protected-body, supervisor and manifest exceptions, which are Root's and
   Samuel's, and which this review does not lift.
3. **Real proof.** The first actual compile, ABI check and native read happen only in an admitted run. The fixture
   stubs the adapter by design, so its 25 cases prove the validator and slice, not the native call.
4. **Then** fresh counter admission and the rest of the release path.

Not execution consent, not source-application authority, and not test credit.
