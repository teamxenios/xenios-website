# e33 window 346 and its two entry bindings

**SUFFICIENT, with no discrepancy.**

- **The change.** Each new entry differs from the entry accepted in Doc 185 only in its three stop literals,
  12:30:00.000Z → 14:30:00.000Z.
- **What stays.** Runner, pins, G0, source and the prepared copy are unchanged (Docs 185 and 186).
- **The window.** It is a new, separate choice.

This is not a ticket, admission, result or production consent.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. Nothing run; no agents. Docs 185 and 186 are not reopened.
- **Packet.** Delivered in chat, Root `083ef51`/`b2c1d75`.
- **Timing.** Reviewed at 2026-10-15T13:43–13:45Z.

Archive: `hl12/188_e33_window346_entry_bindings.json`.

## Comparison (Core `9b2ced1e`, tree `258cbe85`; five new files only)

- **Check entry.** `NATIVE_ENTRY_CHECK_WINDOW346.ps1.txt`, 3,365 B, `f2a13eee…`.
- **Regression entry.** `NATIVE_ENTRY_REGRESSION_WINDOW346.ps1.txt`, 3,395 B, `b6b22732…`.
- **How they differ.** Each base (`2f3fb42e…` and `f1d4adf6…`) contains `2026-10-15T12:30:00.000Z` three times. Replacing
  all three with `14:30:00.000Z` gives the new bytes exactly, and reversing it restores the base exactly. The new
  copies contain no 12:30 literal.
- **What did not change.** No path, action, command, reserve (360,000 and 240,000 ms), heap, G0 floor, freshness,
  stdout or stderr limit, or cleanup literal changed.
- **Unchanged blobs.** These are byte-identical between `6e614a53` and `9b2ced1e`:
  - runner `a22b4a84` (`5de63524…`);
  - pins `080b55fc` (`fbe8e649…`);
  - G0 `d1244593` (`4f2898d8…`);
  - both old entries.
- **`FINAL_READY_WINDOW346.json`.** 5,850 B, `74f60f07…`, matches the packet.
- **Fresh currentness, 13:38:28–29Z.** HEAD `e33c12a9` and tree `ab4415f0`, clean, not shallow. The 91 recorded pins
  equal `fbe8e649` exactly (102,235,961 B), and no G0 or application command was invoked. Output absence is as Core
  recorded it.

## Window and authority

- **Root 346 (`8a9dd395`).** Chose 13:35:29.704Z to 14:30:00Z, with no extension or retry. The latest G0 completion is
  14:24Z for the compiler and 14:26Z for the regression, run one after the other. Window 328 expired with zero
  compiler or regression invocations and is not reused.
- **Root 347 (`64d87ece`).** Records the human direction to obtain a fresh, independently authorized window,
  readiness, resource admission and tickets for the compiler check and the 66-test regression; to preserve all
  failures; and to finish the `source7` cleanup.
- **Consistency.** The entries and the runner's own start limit (launch time plus the aggregate budget must be at or
  before the stop) both enforce 14:30Z.

## Limits

- **Before each group, separately.** A fresh post-review READY, an exclusive slot, a one-use ticket, a fresh CLI G0
  (1,536 MiB on all three metrics, under 30 s) and an owned closure with an independent postcheck. The CLI G0 cannot
  admit the browser.
- **Exec body.** The exact entry body runs in pinned PS7 `exec_command` with `login false`, never through `-File` on the
  `.txt`.
- **Cleanup.** `source7` cleanup comes after the required use and evidence, under the existing Doc 338 procedure. Only
  the owned worktree may be removed.
- **Preserved.** Regression 309 FAILED, copy 340 FAILED and the Doc 186 acceptance all stand.
- **Holds.** The browser capacity, Doc 247 DB, security and staff, phase A return, final manifest and live
  verification are unchanged. NOT LIVE.

Not execution, admission, push, deployment or production consent; not human approval; not test credit.
