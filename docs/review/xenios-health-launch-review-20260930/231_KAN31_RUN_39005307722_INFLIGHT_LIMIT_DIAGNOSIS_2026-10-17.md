# KAN-31 hosted run 39005307722: failed on the harness in-flight limit, not the application

**CHANGES REQUIRED (harness).**

- **Result.** The approved single run failed during public bootstrap with `firstFailure` `REQUEST_LIMIT`. The cause
  is the harness's `maxInflight: 8` check, which fails the run instead of throttling. Normal browser parallelism
  exceeds it.
- **The application did nothing wrong.** No application defect is shown.
- **No data was created.** There were no request rows, no POSTs and no unlock.
- **The one-attempt authorization is consumed.** Staging must be closed now.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Opening (verified before dispatch; KAN-31 comment 10115)

- Deploy `dep-db9frvnbtjjs73bj0mmg` on `8efa9a9ef4e94773c446e7fa2a17cf00c6592d85`, manual, live at
  04:49:15.730Z. Auto-deploy is off.
- `GET /api/research/early-access/session` returned `{"authenticated":false,"openAccess":true}` at 05:06:05Z.
- At 05:32:40Z it was still `openAccess:true`. **The closure deadline is 08:49:15Z.**

## Run

- **Run identity.** `workflow_dispatch`, head `da2f3386cbd031c37f4b804c7553306c9edfe49f` (= B2
  `workflowSourceCommit`). Created at 05:10:48Z; the job ran 05:10:52Z–05:11:48Z.
- **Steps.** Bundle validation passed, and the tool inventory was verified (455 files). The browser step exited 1.
- **Preflight.** `appSha` `8efa9a9e…`, `appTree` `0c92fdc6…`, manifest `d2dc8e0a…`, proof `746c3519…`,
  `servedIdentityBasis` provider-only, `privatePairProvenance` false. It started at 05:11:14.579Z.
- **Not verified here.** I did not re-run the Doc 227/230 comparator. Root's comparator transcript and output must be
  posted for the record.
- **Evidence artifact.** `12090831819`, ZIP `fb941726…`, holding `browser-evidence.json` 8,908 B and
  `preflight.json` 1,474 B. It was extracted with path checks and read without executing anything.
- **What the evidence shows:**
  - `cases: []` and `sessionChecks: []`.
  - `firstFailure`: `{code: REQUEST_LIMIT, phase: public-bootstrap, recordedAt: 05:11:16.984Z}`.
  - Requests 1–19 were same-origin GETs of the page and its assets, all 200.
  - Request 20 (`/assets/EarlyAccessCheckoutJourney-EKu65k-7.js`) was FAILED_OR_UNRESOLVED.
  - Requests 21–36 were same-origin requests correctly aborted after the failure.
  - There were no POSTs. `dbPersistenceVerified` is false. Cleanup closed the contexts and the browser, with 0
    active requests and 0 handlers.

## Root cause

In `hosted-browser.UNAPPLIED.mjs` on main, `onAllowed` does `active++` and then
`need(count<=maxRequests && active<=maxInflight,'REQUEST_LIMIT')`, decrementing in `finally`. Each allowed request
stays active across `route.fetch` and `route.fulfill`. The page's module graph issues about 20 parallel chunk loads,
so by request 20 more than 8 were in flight. `count` was 20, far below the 400 limit, so the failure came from
`maxInflight`.

The validator caps `maxInflight` at 8 or less (line 294), so it cannot be raised by the manifest alone.

- **The same mechanism probably explains run 38993363060.** That run's "unidentified off-origin" failure is better
  explained this way. The old `guard()` threw `PRIOR_FAILURE` after a first failure that was then lost; it was not
  confirmed at the time.
- **Why offline tests missed it.** They use a small synthetic page that never exceeds 8 concurrent requests.

## Required correction

1. **Throttle instead of failing.** In `onAllowed`, acquire a slot from a FIFO semaphore of size `maxInflight`
   before `route.fetch`, and release it in `finally`. Keep `REQUEST_LIMIT` for `count>maxRequests` only. Bound the
   wait by `requestTimeoutMs` and fail as `INFLIGHT_WAIT_TIMEOUT` if it is exceeded. Keep the cap of 8 or less.
2. **Add an offline test.** It needs a fixture page that issues at least 24 parallel same-origin module or asset loads
   with delayed responses. It must pass, with peak active at most `maxInflight` and no `REQUEST_LIMIT`. Keep the
   existing `maxRequests: 1` test.
3. **Re-rehearse locally against the real built bundle of `8efa9a9e`,** not a synthetic page, before any hosted
   attempt.
4. **Start over on the run chain.** A new PR, then my review, then a new template and baseline under Doc 227 with the
   new `workflowSourceCommit`, then **Samuel's new approval for one new run and a new window**. The 05:10 attempt
   cannot be retried.

## Closure

Samuel sets `RESEARCH_EARLY_ACCESS_OPEN_ACCESS=false`, Save only, and does a Manual Deploy of `8efa9a9e`. I will verify
the new live deploy and `openAccess:false`, and post the result in KAN-31.

NOT LIVE. Not a production approval. No SQL.
