# Six-path correction `84178ce` and its build-slot rebinding

**CORRECTION ACCEPTED as source. BUILD-SLOT REBINDINGS SUFFICIENT.**

- **The correction.** It fixes a real defect that I missed in Docs 164 and 166. It also repairs the three stale test
  expectations behind the actual focused and typecheck failures.
- **The build slot.** The runner, G0 script, entry, pins and preparation are exact rebindings of accepted, executed
  artifacts.
- **Capture limit.** The preparation capture limitation is recorded and is not material.

This is not admission or invocation, and gives no build, test, typecheck, browser, SQL, staff, security or deployment
credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
text, and read-only hashing of the prepared checkout. Nothing run, no agents. Unchanged source and framework were not
re-reviewed. Reviewed at 2026-10-15T04:35–04:41Z. Archive:
`hl12/174_six_path_correction_84178ce_and_build_rebinding_comparison.json`.

## 1. The failures being corrected (actual, preserved)

- **Focused run.** 214 assertions: 212 passed, 2 failed, 0 skipped (Core `2903f156`). The two failures:
  - `CareRequestIntentPage.test.tsx`, "keeps noindex";
  - `RequestIntentForm.test.tsx`, the round trip with staff readback.
- **Typecheck.** 6 errors (Core `a273128`):
  - TS2339 `Property 'id' does not exist on type 'MemberInfo'`, three times: once in `OrderRequestEntry.tsx`, twice
    in `RequestIntentEntry.tsx`;
  - TS2353, the stale staff-context fixture (`rail`) in `RequestIntentForm.test.tsx`;
  - TS2345, `string | string[]` passed to the staff detail route in `express.ts`, twice.
- **Recorded as is.** Both runs exited normally, with independent closure and source/pin checks passing. They are
  failures as recorded. There is no retry and no claim of a pass.

## 2. The defect, and a correction to my own record

- **What the code did.** `OrderRequestEntry` and `RequestIntentEntry` keyed the request form by `member?.id`.
  - `MemberInfo` has no `id`. It has `firstName`, `status`, `applicationStatus` and an optional `cartScope`.
  - So at runtime the key was always `"early-access-session"`.
  - Their own comment promised "an account switch cannot keep another person's form", and that guarantee did not hold.
- **Why the tests missed it.** The tests passed because they mocked `useResearch` with a `member: { id }` that the
  real type never provides.
- **My record.** I accepted that keying in Docs 164 and 166, and I record the miss here. The typecheck caught it.

## 3. The correction (`84178ce1`, tree `24d3fa00`, parent `47f49adf`): accepted

- **Scope.**
  - Exactly six paths change (80 insertions, 15 deletions): `OrderRequestEntry.tsx`, `RequestIntentEntry.tsx`,
    `express.ts`, and the three test files.
  - Root's frozen Doc 257 patch (15,433 B, `092d8ed6…`) has the same content as `git diff 47f49adf 84178ce1`.
  - None of the six is a protected or seam path. The applied manifest (`dd99bc37…`) is unchanged.
  - No service, guard, core, Auth, SQL, wiring, dependency or lock file changes.
- **Owner key.** Both entries now key by `member.cartScope`, accepted only if `isResearchCartScope` passes, meaning
  64 lowercase hex characters.
  - The scope is the canonical opaque, server-derived value: a domain-separated SHA-256 of `auth_user_id`, used for
    cart isolation and "never authorization evidence".
  - When signed out with no member, the key is `"early-access-session"`, as before.
  - A missing, empty or malformed scope, or a member that is null while authenticated, renders "Your account could not
    be confirmed… Contact support" and no form. The standalone probe stays inactive.
  - A token-only rerender keeps the same key, so the form is retained. A different scope remounts it.
  - Every server path still authorizes for itself. The key isolates browser UI only.
- **Express.** `typeof id !== "string" ||` before the UUID regex. That fails closed on array parameters and fixes
  TS2345.
- **Tests.**
  - The Care page asserts the hoisted `document.head` robots meta, with the exact value `noindex, nofollow` and none
    present beforehand.
  - The form round trip uses the accepted pending-read context, with purpose and actor.
  - The entry tests use typed `MemberInfo` and a valid `recovery: "pending"`. They add six cases across both real
    entry components, with child forms stubbed: retention on token refresh, remount on scope change, refusal of
    missing, malformed or unconfirmed scopes, and remount when leaving to the signed-out boundary.
  - These are written, not run, and they are not proof of live Auth.
- **Custody and authority.** The six paths sit inside active phase A lease `abb400e5`, with no overlap. The repair
  falls under the recorded run instruction and Samuel's overnight direction to "repair only a demonstrable problem
  through the existing source-ownership procedure, with the narrow review appropriate to the change". No protected
  exception is needed.
  - Doc 168's applied-byte confirmation covered `47f49adf` only.
  - The final manifest finalization and my final-record confirmation must bind the final candidate, `84178ce` or later.

## 4. Build slot (Core `aad83e13`, tree `eb0ab115`; Root Doc 258 at `8af0ac6`): sufficient

- **Runner.** 39,598 B, `954b99b7…`. It is `baaf43b1…` with four unique constant changes: scratch path, candidate,
  tree and action. It is exact in both directions.
- **G0 script.** 15,919 B, `947bba10…`. It is `8b1e85ed…` with only the candidate and tree literals changed, exact in
  both directions. The R7 slice (`e11e657d…`) is unchanged.
- **Entry.** 3,201 B, `94090792…`. It differs from `8edcfb98…` only in the declared bindings:
  - the run root and the adapter path;
  - the label;
  - the candidate and tree in the closed-result check;
  - stop `2026-10-15T05:30:00.000Z`;
  - the final runner call with pins hash `0018cb57…`.
- **Pins.** 5,853 B, `0018cb57…`, 28 entries.
  - The candidate and tree are rebound, and the paths moved to the new scratch folder.
  - The only value change is the runner's own pin. None of the six corrected files is among the runner's eight pinned
    source files.
- **Preparation.** Root 257, receipt `bb0b253b`, tree `4e261ae4`. My read-only check confirms the scratch holds only
  `source/`, `run-render-build.cjs` (`954b99b7…`) and `pins.json` (`0018cb57…`).
  - The source is at HEAD `84178ce1`, tree `24d3fa00`, with full history.
  - The six corrected files match the commit's LF blobs.
  - There are no `node_modules`, `dist`, `run1` or G0 outputs.
  - The existing `47f49adf` scratch and its receipts are untouched.
- **Capture limitation.** Preparation exited 0 natively, but Git's stderr error-record serialization truncated the
  complete original capture. The retained partial capture and the independent state proof stand. They do not recreate
  the missing capture.
  - That is not material to the build: the resulting state is independently confirmed, and the runner re-verifies HEAD,
    tree, clean status, pins and injection at startup.
  - The postcheck typo (`sourceCorrection.paths`) was a read-only error, corrected without re-materializing anything.
- **Window and controls.**
  - Root's fresh window runs from 04:24:33.469Z to 05:30:00Z. The last full start is 05:18:00Z, which the entry's
    `now + 720 s ≤ stop` check enforces, along with the runner's own launch check.
  - Run instructions: Docs 223 and 239. Pinned pwsh 7, login false.
  - G0 requires all three readings of at least 1,536 MiB, native exit 0, under 30 s, at most 8,192 B of stdout, no
    stderr, and fresh UTC.
  - The literal `npm run render-build` runs in a private, process-only npm prefix, cache, home and temp. The build
    includes a fresh `npm ci`, because this checkout has no dependencies.
  - The managed session uses only `write_stdin` waits of 30 s or less, with no interleaved tools, and latency is
    recorded.
  - No reuse of old tickets, no retry and no extension.

## 5. Still required, and holds

- **Before activation.** Core's fresh FINAL READY, an exclusive single heavy job, and Root's new ticket. One G0 and one
  conditional build.
- **Tests and typecheck.** The Doc 173 slots are bound to `47f49adf`, with test-file and source pins that now differ.
  The corrected candidate needs its own rebound focused and typecheck slots and fresh admission. The prior results stay
  FAILED as recorded.
- **No credit.** No build, test, typecheck, browser, SQL, persistence, staff-read or deployment credit for
  `84178ce`.
- **Custody.** The phase A return and final manifest are PENDING.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Production.** The live revision (`7bba…`) is neither candidate.
- **Unchanged.** R8 and Docs 160–173 stay closed. Failed run `790af2ce`, tickets `404727c5`, `264a4c65` and
  `07024dd5`, and the failed focused and typecheck results all remain as recorded. The payment and security holds stay
  open.

Not execution, admission, push, deployment or production consent; not human approval; not build, test or
qualification credit.
