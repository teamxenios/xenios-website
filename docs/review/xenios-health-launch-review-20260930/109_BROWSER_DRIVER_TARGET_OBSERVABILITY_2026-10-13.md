# Browser driver, sanitized target-attachment observability: bounded source review (revision 10)

**SOURCE ACCEPTED, observability scope only. The proposed driver adds exactly two things to the R2 driver: two
evidence fields, and a capped, sanitized metadata record per attached target written before the existing acceptance
predicate. It stores no identifier, URL, origin, path, query, fragment, body, token or customer datum; it adds no
`await`; the acceptance predicate, `Target.closeTarget` and `fail('UNEXPECTED_BROWSER_TARGET')` are byte-identical;
nothing is accepted or retried that was refused before. This accepts the source delta. It is not a diagnosis of the
R2 failure, not a browser rerun, and not an admission.**

Reviewer: this session, `claude-fable-5-1`. Board registration revision 10 on
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` (20:08:13Z;
`DOC106_SAFE_TARGET_OBSERVATION_REVIEW_REGISTRATION_20261013.json`, proposal `2610b8af…`, records `56231f6d`).
Application `8e85daa`/`25507c2f`, build `3dd3d96`, QS-2, QS-R5 and docs 104–108 unchanged. Reviewed directly,
read-only, no agents, nothing executed; revision 9 (doc 108, `35dea8c`) was published first and is not affected.
Archive: `hl12/109_browser_driver_target_observability.json`.

**Bytes.** Prior driver `ql-browser-driver.mjs` 39,288 B `08f62b4e…` (the doc 106 R2 driver I already held);
proposed `ql-browser-driver-observation-proposed.mjs` 40,786 B `b2f0901d…`; both re-hashed. My own diff: two hunks,
one modified line (the evidence initializer gains `targetAttachments: []` and `targetAttachmentRecordsOmitted: 0`)
and twenty added lines inside `onAttachedTarget`; the archive's `EXACT_DIFF.patch` has identical +/− lines; removing
only those additions from the proposed file reproduces the prior bytes exactly (`08f62b4e…`). LF throughout.

## 1. What the added block does

Inside the existing `onAttachedTarget(params, allowExpectedPage)` handler, before the unchanged predicate:

- If fewer than 64 records exist, it builds one record from `params.targetInfo`: `phase` and `case` (the driver's
  own phase/case labels), `type` restricted to a fixed whitelist (`page`, `iframe`, `worker`, `shared_worker`,
  `service_worker`, `tab`, `browser`, `other`) else `UNKNOWN`; `urlClass` as `ABOUT_BLANK`, `CANONICAL_ORIGIN`
  (equal to the validated loopback `origin` destructured at line 31 and demanded to match
  `^http://127.0.0.1:\d+$` at line 32), `OTHER_ORIGIN`, or `UNPARSEABLE` when `new URL()` throws;
  `hasQueryOrFragment` as a boolean (null when unparseable); `browserLevelHandler`, `acceptingPage`, `phaseOpen`,
  `waitingForDebugger` booleans; and equality booleans `knownTarget` (membership in `sessions`),
  `sameCreatedTarget`, `sameContext`, `samePageSession`, plus `acceptedByExistingPredicate`, which re-evaluates the
  same four-term predicate the next line applies. Otherwise it increments `targetAttachmentRecordsOmitted`.
- Then the original lines run unchanged: accept only `allowExpectedPage && acceptingPage && type === 'page' &&
  url === 'about:blank'` (recording the session), else `await send('Target.closeTarget', …)` and
  `fail('UNEXPECTED_BROWSER_TARGET')`.

## 2. Privacy, bounds and guard preservation

- **No raw identity leaves the process.** `targetId`, `sessionId`, `browserContextId` are used only inside
  comparisons; the URL is parsed and reduced to a class and a presence boolean; nothing else from `targetInfo`
  (title, opener, attached, subtype) is read. `phase`/`case` are driver constants, not customer data.
- **Bounded.** At most 64 records of roughly a dozen scalar fields; overflow is counted, not stored; the outer runner
  embeds `driver.evidence` in its receipt and validates `status`, `cdpClosed`, `runtimeExceptions` and the case names
  (`run-durable-browser.cjs:493-496`), not the evidence key set, so the two new keys cannot trip an existing demand.
- **Guards preserved.** No new `await`, promise or timer; the block is synchronous and wrapped in `try/catch` only
  around URL parsing; the predicate, `closeTarget` and `fail` are the same bytes; the nine case assertions, network
  fences, `TOP_LEVEL_NAVIGATION_REFUSED` and the harness (`60b025ee…`) are untouched. A record is written for a refused
  target *and* the target is still refused — this changes what is learned, not what is accepted.
- **Failure-safe.** A thrown `URL` constructor leaves `urlClass = 'UNPARSEABLE'`; `origin` is in scope, so the
  classification is live, not silently degraded.

## 3. Named limits (P3)

- The R2 failure's cause remains unknown; this change would make the *next* refusal legible, nothing more. No benign-
  target or Chromium-warning causal claim follows from it.
- `phase`/`case` strings are free text from the driver; they are bounded by its own constants today.
- The driver is a test-harness artifact outside the application tree; its pin changes in the binding/runner
  (`08f62b4e…` → `b2f0901d…`) must be re-frozen before any run, as with the doc 106 R2 packet.
- Any actual diagnostic run still needs its own exact source, tooling, failure binding, owner, human scope, limits and
  G0 admission; none exists, and none is implied.

## 4. Next steps

1. **Owners:** re-pin the driver in the browser packet if and when a run is prepared; keep the harness and all nine
   cases unchanged.
2. **Coordinator:** record this disposition against revision 10; the browser outcome remains owed in full.
3. **Reviewer:** on a future run's receipt, the `targetAttachments` records will be read for what they are: sanitized
   observations, not acceptance.

Nothing here authorizes a browser launch, rerun, guard change, test or deployment. Nothing was executed.
