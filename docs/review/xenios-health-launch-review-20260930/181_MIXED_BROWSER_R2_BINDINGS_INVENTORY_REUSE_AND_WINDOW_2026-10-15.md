# Mixed browser R2: binding deltas, inventory reuse and the new window

**SUFFICIENT, with no discrepancy.**

- **Deltas.** All five R2 files are exact literal rebindings of the accepted R1 packet (`d10e8852`), reversible byte
  for byte.
- **Inventory reuse.** Reusing the Doc 179 inventory in place is sound, under two conditions in section 2.
- **Window.** The new finite window is consistent with the entry's bounds.

This is not admission, not a capacity pass, and not a browser result.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed
objects only, with no command naming an active source or scratch path. Nothing run, no agents. Docs 174–180 stay
closed.
- **Pickup.** Root's `DOC297_…ORIGINAL_PROMPT` (3,467 B, `e84fbbfe…`) was picked up by the overnight check before any
  UI delivery.
- **Timing.** Reviewed at 2026-10-15T07:45–07:48Z.

Archive: `hl12/181_mixed_browser_r2_bindings_inventory_reuse_and_window.json`.

## 1. The five deltas (Core `df0b32f3`, tree `09786f0b`, 9 files)

`BINDING_REUSE_AND_NEXT_ACTION.json` is `11c09725…` and `EXACT_LITERAL_DELTAS.json` is `b47c1565…`. For every file,
applying the declared replacements to the R1 bytes yields the R2 bytes, and reversing them restores the R1 bytes:

| File | R1 | R2 | What changes |
|---|---|---|---|
| `QUALIFICATION_BINDING.json` | `8a3553f6…` | `6687de44…` | authority text now cites Doc 292; reuse text cites Doc 179; window 07:23:48.629Z–10:00Z; gate 08:24Z; outer start 08:24:30Z |
| `harness.ts` | `fc8e200c…` | `e53e1e19…` | scratch path; binding hash |
| `run-durable-browser.cjs` | `ed4b059c…` | `6b554df8…` | scratch path; harness and binding pins |
| `bind-and-run-durable-browser.cjs` | `de97bd90…` | `e6fba6cd…` | `SCRATCH` line only; harness, binding and outer pins |
| `invoke-browser-g0-and-run.ps1` | `b1f8790e…` | `fe30b36c…` | scratch (4 places); `mixed-r2`; `g0-browser-r2-` (4); label `…_SLOT_R2_…`; `notBefore` 07:23:48.629Z; stop 10:00Z (4); `latestStart` 08:24:30Z; bridge pin |

- **Behavior unchanged.** No assertion, guard, budget, floor, binary, environment, helper or cleanup literal changed.
  The external all-three 2,048 MiB check and the G0 script `947bba10…` are unchanged.
- **Unchanged R1 inputs, for future byte-identical copy only.** `ql-browser-driver.mjs` (`54b313fb…`),
  `CLIENT_DIST_PREPARED.json` (`5ab9ca42…`) and `HARNESS_SOURCE_NOTES.md` (`28250564…`). The notes are historical
  provenance only, not R2 authority.

## 2. Reusing the Doc 179 inventory: sound, with conditions

- **What is reused.** The R2 bridge deliberately keeps `PREPARED` and `METADATA_PRODUCER` at their R1 paths. It reuses
  the accepted inventory (`e5bf5147…`, 11,365,704 B) and the producer (`02988485…`, pinned in `FIXED`) without
  re-running or copying them.
- **Why it is sound.**
  - The inventory binds the source and dependency paths of the same installed `84178ce1`/`24d3fa00` root, not the
    browser scratch or run.
  - The bridge accepts it only through the grant's `inputMetadataPin`. That pin's path must equal `PREPARED`, and
    `readPin` checks its bytes and hash.
  - The bridge then re-checks schema, status, candidate and tree, root, Node version, matching and clean pre and post
    Git state, the false flags, pin uniqueness, root scopes and the byte cap.
  - The browser procedure's six full raw passes re-read the pins physically. Any drift since 06:51Z therefore refuses
    the run rather than passing silently.
  - Core's 07:36:13Z check found both sources clean and full-history, with the 24 sampled and lock pins current.
- **Conditions.**
  1. The future grant's `inputMetadataPin` must be exactly the R1 path, 11,365,704 B, `e5bf5147…`.
  2. The R1 inventory and producer files must stay present and unchanged at their R1 paths until the R2 run completes.
     They must not be cleaned up or re-materialized.
- **What this is not.** No new whole-dependency scan is claimed.

## 3. The window

- **Root 292.** Root 292 (`cb02f560`) chose a distinct window: 07:23:48.629Z to 10:00Z, with gate completion by
  08:24Z and the outer start by 08:24:30Z.
- **Entry checks.** The entry's literals match:
  - `notBefore ≥ 07:23:48.629Z`;
  - `latestStart ≤ 08:24:30Z`, which the bridge also enforces at its just-in-time start;
  - `reservedUntil` 10:00Z;
  - `now + 5,760,000 ms ≤ 10:00Z`, which means a start by 08:24:00Z.
- **Budgets.** 5,730 s in total, 75 s for fresh actions and 20 s for reopen, six raw passes, and all three readings
  at least 2,048 MiB, all unchanged.
- **No reuse.** The R1 ticket (`07b730a0`) is consumed and window 282 is not reused.

## 4. Limits and what remains

- **Capacity.** The reported idle resets have an unmeasured effect, and no capacity pass is inferred. The Doc 180
  refusal stands.
- **Still required before any invocation.**
  - Root's seven R2 copies, prepared source-only and verified byte-identical to these files.
  - Core's fresh FINAL READY and the exclusive slot.
  - Current pins, and no existing outputs.
  - A new actual single-use Root ticket.
  - A hash-matched grant that carries the section 2 metadata pin and the existing DNS27 receipt pin.
  - A fresh G0 with all three readings at least 2,048 MiB.
  - Owned cleanup.
- **Discipline.** Doc 175's rule applies.
- **The gap map.** `REMAINING_QUALIFICATION_GAPS.json` is a source-only map. It does not reopen the Doc 176 or 177
  credit, and grants no blanket credit for older full-suite runs or controls.
- **Mixed scope.** Unchanged: two synthetic rows, volatile RPC, the harness's own allowlisted app. The legacy SQL
  reopen remains separate.
- **Holds.** The hosted database and staging decision (Doc 247), the security exposure, privileged staff reads, phase
  A's return and final manifest, and live verification remain OPEN. NOT LIVE. No push, deployment, secret, provider,
  clinical or payment change.

Not execution, admission, push, deployment or production consent; not human approval; not browser or capacity
credit.
