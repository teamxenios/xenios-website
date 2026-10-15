# Mixed browser test extension and input bindings for `84178ce1`

**SUFFICIENT, with no material defect.**

- **What it tests.** The new harness and driver test the real mixed request path that the old `browser-r2` journey
  could not reach. The scope is honestly bounded: volatile synthetic RPC storage, and staff denial only.
- **What else checks out.** The three framework copies, the LF bindings, the new 2,048 MiB callsite and the bounded
  metadata phase are exact and adequate.
- **The DNS receipt.** The existing 27-control DNS receipt applies to the unchanged DNS fence.

This is not admission, invocation, or a browser, metadata, SQL, Auth, staff or deployment result.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects. One historical, non-active framework scratch file was read as a base. No command named an active source or
scratch path, nothing was run, and no agents were used. Docs 174, 176 and 177 and the framework were not reopened.
Reviewed at 2026-10-15T06:22–06:30Z. Archive: `hl12/178_mixed_browser_test_and_input_binding_comparison.json`.

## 1. Binding

- **Packet.** Core `d10e8852` (tree `6e811ec8`, parent `824c97d4`). It holds 16 files in
  `correction-84178ce-mixed-browser-source-r1/`, all matching their pins, including `PACKET.json` (3,113 B,
  `96f77389…`).
- **Exact rebuilds.** Applying every declared edit exactly once rebuilds each file from its stated base. Reversing the
  edits recovers each base byte for byte, and every edit is unique in both directions:

| File | Base | After | Edits |
|---|---|---|---|
| `harness.ts` | 48,579 B, `60b025ee…` | 57,733 B, `fc8e200c…` | 15 |
| `ql-browser-driver.mjs` | 39,288 B, `08f62b4e…` | 56,680 B, `54b313fb…` | 15 |
| `prepare-input-pins.cjs` | 9,223 B, `a43c26fb…` (historical scratch) | 9,239 B, `02988485…` | 5 |
| `run-durable-browser.cjs` | 43,722 B, `7fa93cf5…` | 43,735 B, `ed4b059c…` | 9 |
| `bind-and-run-durable-browser.cjs` | 21,466 B, `ed36ca86…` | 21,508 B, `de97bd90…` | 19 |

- **Originals untouched.** The original framework files are unchanged. The new ones are isolated after-images with no
  canonical or protected application.

## 2. The new test: what it actually exercises (accepted)

- **The real gap.** The old `browser-r2` journey mounts only the legacy assisted-order doors, so it cannot prove the
  mixed `RequestIntentForm`.
- **Harness.**
  - It mounts the candidate's real `registerRequestIntentApi` (`request-intent/production.ts`), with its real catalog,
    service and RPC adapter.
  - It feeds two synthetic offerings, one research and one clinical (`care_pathway`), with an empty price map, so no
    price is invented.
  - The RPC fake allows only `research_rate_limit_hit` (exact key and limits), `request_intent_find_attempt` and
    `request_intent_create_or_replay`. Every other RPC, including staff, is refused.
  - Records are capped at 8, each with exactly 2 pending lines, a `.invalid` contact and an exact-fingerprint
    replay-or-conflict rule. It is stated to be "not SQL transactions, constraints, race safety, audit durability or
    real Auth".
  - Mixed starts disabled (`request_intent_disabled`) and is enabled once by a fresh-phase control. The staff flag is
    always `"false"`, and the Care dependencies resolve no principal. The audit hook throws if it is ever reached.
  - The mixed routes are allowlisted only in the fresh phase, and the staff GET is allowed only so that it can be
    denied. Legacy SQL, retry, admin, payment-hold and reopen assertions are retained.
- **Driver.** A separate browser context keeps the mixed customer away from the legacy synthetic admin, and the user's
  Chrome is untouched.
  - The run checks the visible pathway guidance, quantities of exactly 2 and 3, and the review panel.
  - A double click must yield exactly one POST.
  - Before each POST, the attempt marker (`xenios.assisted-order.intent-attempt.v1`, which matches `storage.ts`) is
    verified through CDP. Only digests are kept, never the raw key.
  - Each saved line must equal its catalog projection key for key, both families must be present, and the acceptance
    times must match.
  - A dropped response, retried in the same mount, must reproduce the exact body, key and `acceptedAt`, with no new
    record.
  - A separate drop, followed by a reload and marker-only recovery, must restore no PII or selection and reach the same
    record.
  - The staff GET must return `503 private_review_unavailable` with unchanged state.
  - Afterward, the run cross-checks the census: 3 mixed records, 4 POST observations, 3 creates.
  - Every UI string the driver waits for exists in the `84178ce1` form, and `requestIp` falls back to the socket address
    for local requests.
- **Scope.** The harness mounts the API on its own allowlisted app, so it does not exercise the real research wall or
  the `server/index.ts` composition. Mixed records are volatile: the process reopen deliberately loses them, and only
  the legacy SQL reopen proves durability. That is a representative synthetic interaction, not the full production
  catalog, and not SQL, Auth, PostgREST or staff proof. This scope is stated correctly in the code and evidence labels.

## 3. Framework and LF bindings, the new callsite, and the DNS receipt

- **Framework edits.** These are bindings only:
  - roots, scratch, candidate and tree;
  - pins for the harness, binding, notes, client inventory, producer, outer runner and driver;
  - the current build receipt `0aac8e0c…` and artifact inventory `72f5ae02…`, which Doc 176 accepted;
  - a public census of 349 files, 8,888,576 B.

  The census equals the R2 artifact inventory's public entries exactly: 350 files minus the 1,799,814 B
  `index.cjs`. Process-local `core.autocrlf` changes from true to false in the outer runner and the producer, which
  matches the LF R2 checkout. No timeout, cleanup, fence or schema comparison was removed.
- **Callsite.** `invoke-browser-g0-and-run.ps1`, 6,691 B, `b1f8790e…`. It is the accepted focused entry plus a grant
  prefix and the existing `Get-QlPin` helper. It does the following:
  - requires a hash-matched `coordinator-admission.json` with `approved:true`, the exact candidate, tree and source
    root, run ID `mixed-r1`, port 5237, a 5,730,000 ms budget and reservation until 09:00Z;
  - requires `notBefore ≥ 06:06:49.497Z` and `latestStart ≤ 07:24:30Z`. The bridge also enforces
    `notBefore ≤ now ≤ latestStart` at its just-in-time start;
  - requires `now + 5,760,000 ms ≤ 09:00Z`, meaning a start by 07:24:00Z;
  - pins the bridge and the unchanged G0 script `947bba10…`;
  - runs one G0 with all the old refusal checks, then requires all three raw readings to be at least 2,048 MiB. The
    helper's 1,536 MiB classification is not browser admission;
  - calls the existing bridge with a 256 MiB heap.

  No grant exists yet, and no `approved:true` fixture is bundled.
- **The DNS receipt applies.** The 27 controls (`verify-loopback-lookup-controls-r2.cjs`) extract and test the harness's
  loopback lookup-guard block in isolation.
  - That block is byte-identical in the base and new harness: 436 B, `f027d00c…`, present once. The outer runner's
    Chrome `--host-resolver-rules` is untouched.
  - So the receipt's result applies to the unchanged fence. It does not cover the new harness's other content, and was
    never meant to.
  - The grant's `guardControlsReceiptPin` must name the exact existing receipt bytes. No fresh run of the 27 controls is
    claimed.

## 4. Metadata phase, window and authority

- **The producer.** It imports no application or engine code and starts no listener.
  - Pinned Node 20.19.0, with exactly a 256 MiB heap, and the output must not already exist.
  - A cooperative 900,000 ms budget, with byte and count caps.
  - It runs `lstat`, `realpath`, read and hash on every tracked non-test file and every private `node_modules` file,
    with Git using process-local `autocrlf=false`.
- **One invocation.** Root's metadata window runs from 06:21:48.653Z to 07:00Z, with a single run. It still needs this
  comparison, Core's fresh READY, the exclusive slot, a new ticket and a copy scope.
- **Unknown until it runs.** The complete inventory and hash are UNKNOWN until actual native completion. Partial output
  fails and is preserved, with no automatic retry. The inventory then needs its own narrow currentness review before
  browser admission.
- **Browser window.** 06:06:49.497Z to 09:00Z, with gate completion by 07:24Z and the outer start by 07:24:30Z.
  - The existing 75 s budget for fresh actions, 20 s for reopen and 5,730 s in total are unchanged.
  - Six full raw passes, a fresh 2,048 MiB G0, Core's FINAL READY, a single-use Root ticket and owned cleanup.
  - It is not an extension of any consumed window.
- **Authority.** Docs 279 and 282, plus Docs 223 and 239, cover this ordinary test preparation. Everything runs from
  isolated scratch copies with no canonical or protected edits, so no held protected application is needed.

## 5. Notes

- **Shared budget.** The mixed cases run inside the same unchanged 75 s fresh-action window as the legacy cases.
  Exceeding it fails closed. The packet correctly promises no fit, and no budget was enlarged.
- **Discipline.** Doc 175's rule applies to the metadata group and the browser group: while one is active, no session,
  this reviewer included, runs a command that references the source or scratch.
- **Holds.** Security is OPEN, staff reads are HELD, the staging decision (Doc 247) is pending, phase A's return is
  PENDING, and SQL cases 228 are NOT RUN. Production (`7bba…`) is not `84178ce1`. There is no payment, fulfillment,
  push or deployment.
- **Unchanged.** R8 and Docs 160–177 stay closed. The failed runs and consumed tickets stay as recorded.

Not execution, admission, push, deployment or production consent; not human approval; not browser, metadata or
qualification credit.
