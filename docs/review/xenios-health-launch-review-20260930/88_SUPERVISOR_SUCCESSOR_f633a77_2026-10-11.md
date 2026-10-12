# Qualification supervisor successor (`f633a77`): bounded delta against doc 84

**SOURCE ACCEPTED WITH LIMITS. EXECUTION ELIGIBILITY: NONE.**

SV-3 through SV-11 are corrected:
- **SV-3.** A refused pre-attempt resume becomes terminal only when the existing pause can no longer resume. That means
  the parent pause's fixed `latestResumeStartAt` has passed, or one of four monotone limits is exhausted.
- **SV-4.** A budget-inspection failure on a complete group fills only the future-admission data again, as it did in
  `25858ad`.
- **SV-5 to SV-11.** The prose, labels and records are fixed in the source comments and the manifest.

SV-1 and SV-2 stay disclosed as open execution gates. They are not claimed closed.

**What stayed unchanged:**
- No limit, stage count, wall, cap, or numeric or boolean manifest leaf.
- The U-15 3/4/8 map and the 60,000 ms assertion (unchanged context lines).
- The embedded helper is byte-identical; the first hunk starts at line 1304.
- All five G0 holds remain EXPLICIT_HOLD.

**What is preserved:** original started deadlines (`run.deadline` is set only at `:1649`, `:1912` and `:2097`),
completed-command protection (`:2153`) and cleanup uncertainty (`:2295`). No P0, P1 or P2. Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `DOC67-SUPERVISOR-CORRECTION-DELTA-20261009` successor,
acknowledged at `c3e7337`. The board request still names revision 2, so this target was taken from the builder's frozen
handoff, as doc 84 committed. Controlling review: doc 84 (`7449c65`).

**Target:**
- **Source:** `f633a771d1751a2af0854c746256131f9d647184` (tree `2683c971…`). Chain:
  `3e5e2ed` → `71bdd9d` (records) → `086cf86` (owner acknowledgment, records only) → `f633a77`.
- **What the source changes:** only `qualification-supervisor.mjs` (blob `d2e20a8`, 204,885 bytes) and
  `evidence/qualification-manifest-20261008.json` (blob `fb55451`, 1,520,981 bytes).
- **Records:** `fcc98a27546609a83f0a0b79dc3ae954e1999d03`, which changes only the three `.xenios` registries and the new
  handoff.

**Byte checks I ran myself:**
- Supervisor raw SHA-256 is `ed3c8076856ff7be42ab92bddbbc3ef59b21564322b66c1492509fdee7153f1a`.
- Manifest raw SHA-256 is `f5decbe9998203dfd5784586b804fb403cb61f97fc53f9c284c6b04156a92004`.
- Both match the handoff, and the exact two-file diff is 58,218 bytes.

**Method.** One read-only checker and one adversarial verifier. Output is archived as
`hl12/88_91_bounded_package_reviews.json`. Behaviour (Windows, Node, libuv and Job Objects) is reasoned from source, NOT
RUN. No authored test discriminates the corrected finalization paths; correctness rests on source tracing.

## Named limits (P3, S2; fold into the next bounded touch of the same two files; no limit change)

- **SS-1 and SSV-1. Some clock-dependent refusals become permanent.** The SV-8 wrapper and the late-G0-acceptance check
  set `restartForbidden` on every pre-validation `REFUSED:` predicate (`:1576-1582`, `:1981-1992`). That includes
  checks against the local clock: `acceptedAt <= Date.now()`, the zero-launch `finishedAt <= Date.now()` (`:2034`) and
  the witness `recordedAt <= Date.now()` (`:1713`). After a backward clock step, a group can be refused permanently
  even once the clock recovers. This fails closed. **Fix:** keep the flag for immutable predicates only, or disclose
  the clock-relative permanence under D68-5 and D68-7, which currently call the wrapper's scope "immutable".
- **SS-2. Two advisory labels are imprecise.**
  - Refusals raised before history validation read "not restartable", although the guard allows a later
    material-change reentry.
  - A post-attempt resume failure blocked only by FINITE writes `terminalProgress:false` beside `STARTED_TERMINAL`.

  These are labels only; nothing reads them.
- **SS-3(a). One SV-9 change is still unmapped.** Since `3e5e2ed`, an `error` event after spawn no longer resolves on
  its own; the supervisor waits for close or the wall. Only the comment at `:1449` says so. Add one sentence to D68-4.
  The verifier refuted SS-3(b) and (c) as defects.

**Carried:** SV-12 to SV-14 (S3, now disclosed); SV-15 and SV-16 (S4, now labelled).

## What still prevents execution (unchanged from doc 84 section 3)

- **The two open gates:** SV-1 (console hosts and full-tree counts) and SV-2 (the compile-phase hold).
- **G0_ONE_MINUTE_ALL_WORK** and the other three G0 holds.
- **SV-13:** helper-start refusal fixtures.
- **The responder.**
- **Fit and calibration.**
- **The native-lane rebase.**
- **Fresh execution authority.**

## Disposition

- **SOURCE ACCEPTED WITH LIMITS** for the two files at `f633a77`.
- **Execution eligibility: none.** Nothing here authorizes a supervisor run, a native build, a test run, a push or
  deployment.
