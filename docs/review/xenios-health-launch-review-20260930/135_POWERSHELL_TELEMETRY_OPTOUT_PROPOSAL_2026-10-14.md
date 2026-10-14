# PowerShell telemetry opt-out proposal, exact-candidate source disposition

**SOURCE-COMPATIBLE as an exact candidate. It does exactly what Doc 134 asked and nothing else.** Core commit
`149f9fd7` (tree `c4e83833`, parent `555bb2e9`) stages review-only `.proposed` copies of four files. Each one is
exactly the current blob plus the listed edits:

- `POWERSHELL_TELEMETRY_OPTOUT='1'` is added to the three rebuilt environment tables: executor, caller and the
  frozen supervisor's fixture-child table.
- The pins that depend on those edits are updated.

Nothing else changes. I also bind the observer-gate addendum to the successor here, which the handoff asked for.
Two conditions remain before any run: the executor process's own opt-out, and fresh private output paths. This
change does not address the R3 G0 failure, whose cause is still unknown.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
parsed, applied or run. Root had not registered this commit when I reviewed it, so I bound the Core blobs directly.
Archive: `hl12/135_powershell_telemetry_optout_proposal.json`.

## 1. Verified by rebuilding each file

I rebuilt each proposed file from its current blob plus only the listed edits, and compared bytes.

| Proposed file | Base | Bytes | SHA-256 | Edits |
|---|---|---|---|---|
| supervisor | `2d97340f` `bfbe6d19…` | 23,155 → 23,187 | `63caac95…` | fixture-child table gets the opt-out |
| manifest | `2d97340f` `32dcd697…` | 26,295 → 26,295 | `8cb217eb…` | both supervisor pin rows become 23,187 / `63caac95` |
| caller | `82fe41df` `b2225a0d…` | 25,455 → 25,487 | `1ae35909…` | `L-Start` table gets the opt-out; `$lManifestHash` becomes `8cb217eb` |
| executor | `82fe41df` `fa7f72d2…` | 17,176 → 17,208 | `c80cb8c3…` | caller-child table gets the opt-out; caller hash `1ae35909` and pin 25,487 |

- Every listed edit occurs exactly once, and each proposed file is byte-identical to its rebuild.
- No stale supervisor hash or byte count remains in the proposed manifest.
- Each key adds exactly 32 bytes.
- The observer is unchanged and still finds the supervisor by its unchanged path. The closure takes post pins from
  the manifest, so it follows the new supervisor pin automatically.

## 2. Coverage

With the change applied, the opt-out reaches:

- the caller, from the executor's table;
- CMD and therefore the supervisor process, the observer and the closure, from the caller's table;
- the fifteen counter fixtures, from the supervisor's table. Node ignores the variable, so the scheme runner is
  unaffected.

The one process it cannot reach is the executor itself. The native transport starts the executor with the
operator's environment. That needs the handoff's held "native entry" binding, or Root records the executor
process as an explicit residual.

## 3. Observer-gate addendum applicability

The handoff asked me to bind the addendum to the successor. The Doc 128 addendum `d201070f` (`44413e31…`)
describes the frozen source `2d97340f` and manifest `32dcd697…`. It is byte-unchanged, and the caller still pins
it by hash.

**Its mandatory gate applies unchanged to the successor supervisor `63caac95…` and manifest `8cb217eb…`.** Three
reasons:
- the gate is implemented by the caller and enforced against the frozen observer, and neither one's logic changes;
- the supervisor change only adds a key to its fixture children's environment;
- the manifest change only re-pins that supervisor.

The addendum's historical source-identity fields stay as they are. They must not be read as naming the successor.

## 4. Remaining before any run

1. **Root's source and manifest permission to apply.** After applying, a byte confirmation that the four canonical
   files equal these `.proposed` hashes. That is a hash comparison and needs no re-review.
2. **The executor's own opt-out.** It must be set before process start, through a separately reviewed
   per-invocation binding, or the residual must be recorded.
3. **Fresh private output paths.** The caller and executor hard-code `caller-counter-cmd-r3` and
   `executor-counter-cmd-r3`, and the failed R3 now occupies both. The successor also requires them absent, so no
   run can start until those paths change. The scheme prior-receipt path follows the caller path. The handoff
   rightly kept path edits out of this patch. Folding them into the same apply step avoids another review round.
   Any new path change needs its own narrow byte confirmation.
4. **The G0 question from Doc 134 is still open.** The two-way PerfOS query's rebuilt-environment lane should use
   the environment as it will be after this change, with the opt-out present. Both lanes need the opt-out before
   process start, as the handoff says.
5. **A fresh admission** with all four new identities, the addendum binding above, exclusive reservation, finite
   window, real 512 MiB admission and absent outputs.

## 5. Publication note

The handoff marks the earlier raw `telemetry.uuid` and startup-profile files as local only, and notes that the
records branch history contains them. I agree: nothing from that ancestry should be pushed or published without
excluding them.

Not execution consent, not an application of the proposal, not G0 or counter credit. Application `8e85daa`,
tooling `3dd3d96`, the 512 and 2,048 MiB floors, all bounds and the consumed tickets are unchanged.
