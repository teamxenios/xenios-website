# DE-R1: signed media and client clock skew

## Review boundary

- Task: `DE-MEDIA-FOUNDATION-DE-R1-20261005`; session: `codex-de-media-foundation-20261005`.
- Branch: `codex/xenios-de-media-foundation-20261005`; worktree: `C:/Users/sboad/.codex/worktrees/2227/xenios-website`.
- Accepted foundation source: `5152adb4db6db3e197d4534146bcc2ae75fa8f96`, tree `0258be61bf4761ee9911cda1c0d042b6cd183aa3`; preceding records: `c3ea1357f6a4d2a366417753bd08def4c5920fec`.
- Correction source: `e6a8171b5b2d4ad78930c214997532e16601a48e`; tree: `72023b56e21b0f8b5c9643d110def78c0a6b6e7b`.
- Source-only correction; independent Claude narrow recheck is pending.

The coordinator reported Claude SOURCE ACCEPT of the foundation as fallback-first source, IC3/presentation-only PASS and no P0/P1, with this one bounded P2 to fix before integration. The exact accepted source and its original handoff remain unchanged in history. Only four previously owned runtime/test files change in DE-R1; records follow separately. `verification.json` records those source blobs and the focused command. This task does not complete any open browser, canonical reader, metadata writer, SQL execution or delivery-byte qualification work.

## Problem and correction

A newly signed URL expires 300 seconds after the server's evaluation instant. `ProductMedia` reparsed it using the browser wall clock and rejected expiry more than 300 seconds ahead. A client clock 15 seconds behind therefore rejected a valid fresh URL as apparently having a 315-second lifetime.

`parseProductMedia` still enforces the signing-lifetime ceiling by default. The server projection and browser catalog adapter continue to call it with the server `evaluatedAt` instant and without an override. Their existing upper-bound checks and the server's 300-second signing request remain unchanged. Only the final `ProductMedia` renderer disables the redundant upper-bound comparison against browser time.

Finite/canonical expiry and `expiry <= now` refusal remain unconditional, along with URL/bucket/object/token policy, product/variant identity, metadata/hash format, square size and all broken-image fallback behavior. Ahead clocks still fail conservatively once they reach the expiry timestamp. No static server time replaces `Date.now()`.

The existing mounted expiry timeout now schedules failure at the smaller of the local remaining time and 300 seconds. The descriptor key and effect dependencies are unchanged, so a same-descriptor rerender does not restart the timeout. A backward clock offset therefore cannot schedule that mounted descriptor for an arbitrarily long interval. Browser timer scheduling can still be delayed in suspended/background tabs.

This is an elapsed-time bound for a mounted descriptor, not proof of exact server-relative expiry under arbitrary clock skew or stale-data remounts. That stronger guarantee would require carried server-time/receipt provenance and is outside this narrow correction. Storage remains the URL access authority. No commerce authority is created by presentation.

## Checks

- Node 20.19.0 / Vitest 4.1.10: **71 tests in 5 files passed**, exit 0, 7.52 seconds. One worker, no file parallelism. Receipt: `focused-tests.txt`.
- Node 20.19.0 nonincremental TypeScript check: **PASS**, exit 0; receipt: `typecheck.txt`.
- `git diff --check` and continuity validation: PASS.
- Shared parser regressions retain default strict lifetime rejection; the renderer override still rejects expired/noncanonical/malformed expiry, wrong identity, malformed hash, non-square size and wrong object URL.
- Mounted regressions cover clocks 15 seconds and one day behind, 15 seconds ahead, an ahead clock at/past expiry, actual elapsed expiry, and a same-descriptor rerender partway through the lifetime. Existing error, replacement, dimensions, variant and fallback checks pass.
- Unchanged server projection/service and browser adapter tests pass in the same run, preserving the trusted evaluation-time boundary.

No full aggregate, build, browser, database, Docker or hosted operation ran. The serialized compute slot is released before packaging. No SQL or delivery policy source changed, and no migration was registered or applied. Core/Auth/Finance/protected paths remain untouched.

## Next action

Independent Claude narrow recheck of this exact correction source and the four-file diff. Session returns to `handoff_ready`, correction task to `qa`, lease to `handoff`. Review acceptance, integration and every pre-existing runtime release gate remain separate. Original D/E handoff `../HANDOFF.md` retains the full open-work and release-boundary list.
