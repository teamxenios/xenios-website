# Mixed browser attempt: actual G0 refusal at the 2,048 MiB browser floor

**REFUSED, as designed. The browser did not run. Classification: host capacity below the external browser floor. This
is not an application defect, and it earns no test credit.**

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed
objects only. No command named an active source or scratch path, nothing was run, and no agents were used. Docs
174–179 stay closed. Reviewed at 2026-10-15T07:28–07:31Z. Archive: `hl12/180_mixed_browser_g0_2048_refusal_outcome.json`.

## Actual outcome

- **Admission.** Root 290 (`642cf37`) consumed single-use ticket `07b730a0…` after Core's actual FINAL READY
  (`a07c3b83`).
  - The grant is `coordinator-admission.json`, 6,994 B, `2b45b2b9…`.
  - It is `approved:true` for candidate `84178ce1` and tree `24d3fa00`, with run ID `mixed-r1` and port 5237.
  - The budget is 5,730,000 ms. The window runs from `notBefore` 07:13:14.947Z to `latestStart` 07:24:30Z, reserved
    until 09:00Z.
  - The grant names the existing DNS-controls receipt (`guard-controls-r2-actual/receipt.json`, 5,834 B).
- **The run.** Core invoked the unchanged accepted entry once, as native chunk `d0e702`. It exited 1 after 2.1185 s.
- **G0 result.** 988 B, with empty stderr. It reports `THRESHOLDS_SATISFIED_REQUIRES_OUTER_CONFIRMATION`, with all
  three internal 1,536 MiB comparisons true. It was observed at 07:15:56.690Z with these raw readings:
  - OS free: 1,632.457 MiB;
  - available: 1,623.309 MiB;
  - commit headroom: 5,916.504 MiB.
- **The refusal.** OS free and available are below 2,048 MiB, so line 41 of the entry threw
  `BROWSER_EXTERNAL_2048_RESOURCE_FLOOR`. That is exactly the stricter browser floor accepted in Doc 178. The internal
  1,536 MiB pass does not admit a browser.
- **Nothing downstream ran.** G0 ran once. There were zero bridge, outer, harness or browser attempts, zero browser
  assertions and zero raw passes, and no stops. No managed session remains.
- **Archive.** Core `671a2763` (tree `67424470`) holds six files, all matching:

| File | Bytes | SHA-256 |
|---|---|---|
| execution record | 19,291 | `eed0ee3e…` |
| handoff | 1,870 | `3898ce29…` |
| postcheck and archive | 145,828 | `68862dd6…` |
| grant | 6,994 | `2b45b2b9…` |
| G0 result | 988 | `d83d8401…` |
| G0 stderr | 0 | (empty) |

- **Postcheck.** Root 291 records, at 07:18:01Z, that the built and canonical `84178ce1`/`24d3fa00` checkouts are
  clean and all bounded input pins are unchanged. No run, supervisor or binding directories exist.

## Capture limitation, preserved and not material

- **What is missing.** The entry throws at line 41, before the outer G0 summary writer runs at lines 45 and 46. So
  `g0-browser-r1-outer.json` does not exist.
- **What exists.** The evidence is the native tool exit and wall time, plus the persisted G0 result and the empty
  stderr.
- **What isn't claimed.** No substitute receipt, process census or browser-owned cleanup claim is made, and none is
  needed: nothing beyond G0 started.
- **Pattern.** This matches the non-material note in Doc 169: throw paths skip the outer writer.

## Credit and holds

- **Credit preserved.** Build (Doc 176), focused 220 of 220 and typecheck 0 (Doc 177), the mixed test mechanism
  (Doc 178) and the inventory (Doc 179) stand.
- **No browser credit.** There is no browser credit of any kind, and no application defect is inferred.
- **Spent.** Ticket `07b730a0` is consumed. Window 282 is not extended.
- **The next attempt is not reviewed here.** Root 292 chose a distinct source-binding successor window ending at
  10:00Z, with gate completion by 08:24Z and the outer start by 08:24:30Z. Its R2 bindings are not frozen yet, so
  nothing about unknown bytes is approved here and no admission is inferred.
- **Capacity.** The reported idle resets (Root at 07:21:22Z, plus the resource owner) have an unmeasured effect.
  Capacity must be shown by a fresh G0 under a new comparison, READY and ticket.
- **Open.** Hosted SQL and the staging decision (Doc 247), the security exposure, privileged staff reads, phase A's
  return and final manifest, and live verification all remain OPEN.
- **Not live.** NOT LIVE. No push, deployment, secret or provider change.

Not execution, admission, push, deployment or production consent; not human approval; not browser or qualification
credit.
