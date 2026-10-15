# Release-control results, and the unapplied route-mount correction

**Actual results:**
- **Check: PASSED.** Compiler only, for the `84178ce1` bytes.
- **Regression: FAILED.** The failure is real; it is not identity drift.

**Correction:** the unapplied two-path correction is **technically sufficient for the observed failure, with no material
discrepancy.** It may go to the held custody and protected-source decision. It is not accepted for application, and
the failed run stays FAILED.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. Nothing compiled, parsed by a runtime, tested or probed; no agents. Docs 174–182 stay closed.
- **Packet.** Root `1afb10c` DOC314 (5,002 B, `975be468…`). It supersedes DOC313 (4,489 B), which was never sent.
- **Timing.** Reviewed at 2026-10-15T09:26–09:33Z.

Archive: `hl12/183_release_control_results_and_route_mount_correction.json`.

## 1. Actual execution, classified

### Check (Core `aa521d7`, tree `551dedf5`, 38 files): PASSED

- **Receipt.** 47,177 B, `09d0e45e…`.
- **Log.** 480 B, `e8c95d04…`. It shows the literal `npm run check:release-control-plane` (`tsc --strict` over four verifiers and
  the test file), one npm `production` config warning, and no TypeScript diagnostics.
- **Exit.** The child exited 0, with supervisor 0, between 08:50:05.341Z and 08:50:14.914Z.
- **Invariants.** `sourceInvariant` and `postPinsMatch` are true, npm is 10.8.2, cleanup is confirmed and no probes
  remained open.
- **Pins.** The runner pin is `b096bbb9…` and the pins hash is `747e230f…`, both as reviewed in Doc 182.
- **Scope of credit.** Compiler only, for these exact bytes.

### Regression (Core `47164e7`, tree `a5709922`, 57 files): FAILED

- **Records.** Receipt 70,518 B (`1985e96a…`); Vitest JSON 23,587 B (`4a1087dd…`).
- **Exit.** The child exited 1, with supervisor 1, between 09:02:00.524Z and 09:03:13.256Z. No timeout and no retry.
- **Counts.** 63 assertions: 61 passed, 1 failed, and 1 named PG16 opt-in skip, which is retained, not passed.
- **Identity.** All three per-file identity hashes equal the historical ones (`1a67f0d4…`, `f998eba9…`,
  `4ddc27eb…`). The release-control file mismatches only because it has 50 passes and 1 failure, so this is a genuine
  failure. The other two files passed 5 of 5 and 6 of 6.
- **Earliest failing condition.** `server/release-control-plane.test.ts:1852`,
  `expect(scanExpressRouteResult(ROOT).issues).toEqual([])`. It received five `NON_API_ROUTE_PATH` findings, at
  `server/research/assisted-order/request-intent/express.ts` lines 60, 73, 76, 83 and 91 (`/catalog`, `/`,
  `/recover`, `/staff`, `/staff/:requestId`).
- **Not reached.** The rest of that test was never reached: the call-site and route counts and the uniqueness check.
- **Cause.** This is a release-control coverage gap. The candidate's new factory `createRequestIntentRouter`
  registers relative paths, and it is mounted statically at `production.ts:121` as
  `app.use("/api/research/early-access/request-intents", secure, createRequestIntentRouter(...))`. The scanner did
  not model that mount.
- **What this does and does not show.** It is not evidence of a runtime route defect, nor evidence that none exists.
  The census and uniqueness for those routes are simply unmeasured.

## 2. The unapplied correction (Core `503e5100`, tree `e7fd916d`; addendum `82f6bebb`)

### Identity

All eight files match:
- `PROPOSAL` (`79c659a2…`) and `EXACT_LITERAL_PATCH` (`ad6fe00d…`);
- `TEST_IDENTITY_IMPACT` (`84b69f1a…`);
- the before and after images.

Root's DOC312 and DOC314 frozen copies are identical. Both before images equal the `84178ce1` blobs:
`8b359115…`, 18,832 B, and `9fbea381…`, 110,740 B.

Applying the 2 and 3 declared replacements gives exactly `157ac000…` (23,685 B) and `f9518705…` (114,935 B).
Reversing them gives the base files exactly.

### Scanner change

- **Where it applies.** One helper, called only when every resolved path is relative and outside `/api/`.
- **What it accepts.** A `router.<method>` call whose nearest enclosing function is a named function declaration,
  where:
  - that function declares exactly one top-level `const router = Router()`, with `Router` imported from `express` and
    called with no arguments;
  - no parameter shadows `router` or `Router`;
  - the function ends with `return router`;
  - `router` is used only as `router.<method>(…)` or as `router.use(x)` with one argument.
- **Every reference must be a mount.** Every reference to the factory in the index (same file, or a named-import
  alias that resolves to the file) must be a direct argument after the first in `app.use(<static /api/ path>, …)`.
  Anything else returns null and stays `NON_API_ROUTE_PATH`.
- **Duplicates.** Prefixes are normalized, and duplicate mounts still produce duplicate routes.
- **What does not change.** Runtime mounting, `baseUrl`/`req.path`, the guards and the application manifest are all
  unchanged.
- **The current candidate qualifies.** `express.ts` meets every condition: one `router` (line 32), `router.use` with one argument
  (33), five route calls, and `return router` last (102). Its only non-test importer is `production.ts`, through a
  named import with a static `/api/` prefix. `http-e2e.test.ts` is excluded because test files are not scanned.
- **The six new routes.** Statically, the six-route set in the updated count test is that router's five, plus the explicit
  `GET …/config` at `production.ts:83`.

### Test changes

- **The new tests.** Three new `it` blocks sit inside `describe("route uniqueness validator")`. The suite goes from 52
  to 55 tests, with none removed or renamed. Their full names equal `TEST_IDENTITY_IMPACT` exactly, and all three are
  NOT_RUN.
- **Count assertion.** The old 439/448 assertion becomes the exact six-route set plus 445/454. Those totals are
  source-derived and unmeasured.
- **Temp directory.** The third test writes under `tmpdir()`. The existing runner creates its `tmp` directory and
  sets TEMP and TMP to it.
- **Language support.** `.at(-1)` is already used in the test file and allowed by ES2022/esnext.

## 3. Limits and consequences

1. **Invisible callers.** Callers that use a namespace import, an `export … from` re-export or a default import are
   not indexed by the scanner. A mount made that way would be neither counted nor rejected. This is the same
   name-based visibility the scanner already has (`app` and `router` identifiers only). It does not affect the
   current tree, but "closed" means closed among uses the scanner can see.
2. **Untested escape paths.** The router-level escape paths are implemented but not exercised by the new tests: a
   second `Router()`, `router` passed out of the function, a nested `router` binding, a multi-argument `router.use`,
   and registration inside a method.
3. **Nothing executed.** No compile, test or census was run. The 445/454 totals and the 66-test outcome (65 passing,
   1 skipped) are expectations only.
4. **What applying it requires.** Applying the correction changes canonical tooling, which needs canonical custody and
   the protected-source exception. Both are HELD, and this review grants no write. It would also need:
   - a new candidate commit and tree;
   - a new pin manifest, because both files are among the 91 pins;
   - a new runner profile, reviewed fully, with 66 identities and new digests, because the current runner refuses a
     55/5/6 split by design;
   - fresh check and regression runs, each with its own READY, ticket, G0 and postcheck.

   Check credit from `aa521d7` does not carry over, because both files are compiler inputs. Neither path is in
   `tsconfig`'s include or the build entry graph. Even so, any reuse of the Doc 176 or 177 credit needs an explicit
   exact-tree argument from the integrator; this review grants none.
5. **Windows.** Window 302 has closed (09:30Z), and tickets 307 and 309 are consumed. This window gives no future
   admission.
6. **Still open.** The browser still needs a resource change from Samuel. The Doc 247 DB, the security exposure, staff
   reads, phase A's return, the final manifest, the full suite, static checks, the diff and live verification all
   remain OPEN. NOT LIVE.

**Actionable verdict:** the next step is for custody owners to decide on the two-path tooling exception. Only after a
real apply, a new candidate, new pins, a reviewed 66-identity runner and fresh check and regression passes can the
release-control regression be credited. Until then it stays FAILED.

Not execution, admission, write, push, deployment or production consent; not human approval; not test credit.
