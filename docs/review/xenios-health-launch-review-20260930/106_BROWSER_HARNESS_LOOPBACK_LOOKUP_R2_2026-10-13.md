# Browser-qualification harness, R2 loopback `dns.lookup` exception: narrow test-control review (revision 7)

**SOURCE ACCEPTED WITH NAMED LIMITS, test-harness scope only. The R2 harness differs from the failed R1 harness in
exactly one behaviour: `dns.lookup` answers the two-argument literal-loopback form synthetically and refuses every other
shape. Every other fence, the driver, the client build, the nine cases, six validations and the resource floors are
unchanged, and every binding in the packet re-hashes to the bytes. This accepts the control change; it is not a browser
pass, not an execution grant, and the 27 guard controls remain unexecuted.**

Reviewer: this session, `claude-fable-5-1`. Board registration revision 7 on
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` (18:56:34Z;
`DOC105_BROWSER_R2_NARROW_LITERAL_LOOKUP_REVIEW_REGISTRATION_20261013.json`, packet hash `405586ee…`, records
`721c124c`). Application source `8e85daa`/`25507c2f` and the physical build `3dd3d96`/`7a4ce7c3` are unchanged and
stay accepted (docs 104, 105; carry `e54781c`). Reviewed directly, read-only, without agents or local execution, as the
registration asked. Archive: `hl12/106_browser_harness_loopback_lookup_r2.json`.

## 1. What failed, and why the change is the right size

- **R1 (board `DOC105_LOCAL_BROWSER_R1_ACTUAL_FAILED_CLOSED_20261013/`, records `ae036d0a`).** Launched 17:41:06Z;
  the fresh application phase hit `OUTBOUND_REFUSED` before any Chromium case (0 cases, 0 requests, no reopen), then
  the outer supervisor closed on `WORK_PHASE_TIMEOUT` at 18:13:53Z; cleanup, post-pins, source status, PIDs and the
  port were verified closed. The receipt did not label which API raised the refusal; it is preserved as failed, not
  reinterpreted.
- **Diagnostic (records `e1aa85eb`, `PASS_ISOLATED_API_ONLY`).** An isolated Node 20 no-bind run shows that
  `server.listen(port, "127.0.0.1")` invokes `dns.lookup` before binding; Node's `lookupAndListen` passes exactly
  `(address, callback)` even for an IP literal, unlike the connect path, which pre-checks `isIP`. The R1 harness set
  `dns.lookup = refused`, so the application's own listener (`harness.ts:574`, the only `listen` call) could not start.
  The diagnostic proves the Node interaction, not the exact uninstrumented R1 call site; the R2 run itself is the proof
  of the fix.

## 2. The delta, verified from bytes

- **Archive.** All nine packet files re-hash to `PACKET.json` (harness 48,579 B `60b025ee…`, outer runner 43,722 B
  `7fa93cf5…`, bind runner 21,466 B `ed36ca86…`, binding 42,233 B `eccbb889…`, driver 39,288 B `08f62b4e…`, client
  dist manifest `a926f766…`, notes `5f85ea56…`, controls script 5,192 B `05ce894d…`, controls launcher `0092369e…`);
  `PACKET.json` hashes to the registration's `405586ee…`.
- **My own diff of the R1 bytes (`harness.ts` `34a094e2…`, outer `8d60caa9…`, bind `4e08b8fc…`, all archived in the
  failed-closed directory) against R2:** `harness.ts` changes the scratch `ROOT` constant, the `PROPOSAL_HASH` pin,
  and replaces `(dns as any).lookup = refused;` with the seven-line exception plus two comment lines; the outer and
  bind runners change only the scratch path and the three re-pinned digests (harness, binding, notes; the bind runner
  also re-pins the outer). Nothing else differs. The supplied `EXACT_RUNNER_DIFF.patch` matches.
- **Binding.** `QUALIFICATION_BINDING.json` R1→R2 differs in four places: `scratchRoot`, `preparedAt`,
  `schemaVersion` (`…v1`→`…v2`) and an added `runnerCorrectionR2` block (`browserExecution: NOT_ADMITTED`); the nine
  cases, six validations, SQL lineage (7), closures and floors are byte-identical.

## 3. The exception itself

```ts
(dns as any).lookup = (...args: any[]) => {
  if (args.length !== 2 || args[0] !== "127.0.0.1" || typeof args[1] !== "function") return refused();
  const callback = args[1];
  process.nextTick(() => callback(null, "127.0.0.1", 4));
};
(dns as any).resolve = refused;
```

- **Scope.** Only the exact shape Node's listen path uses: two arguments, the literal `"127.0.0.1"`, a function
  callback. Hostnames (`localhost`), other IPs, `::1`, the three-argument options form that `net.connect`/`http`
  use, the promises API and `dns.resolve` all still hit `refused()`, which logs `OUTBOUND_REFUSED`, sets the fatal
  marker and throws, exactly as before.
- **Answer.** Deferred by `process.nextTick` with the real callback signature `(err, address, family)` →
  `(null, "127.0.0.1", 4)`, so the listener binds to IPv4 loopback as it did under a real resolver; no resolver code
  runs.
- **Reach.** Outbound reach is not widened: `net.Socket.prototype.connect` is still restricted to `127.0.0.1` on the
  one qualification port (`harness.ts:187`), `http`/`https`/`tls`/child-process fences and the single allowed
  loopback `fetch` are untouched, and the override is installed before `syncBuiltinESMExports()` and before any
  application import, so ESM importers see the same function.

## 4. Named limits (P3)

- The 27 extracted guard controls (`verify-loopback-lookup-controls.cjs`) are proposed, not run, and their VM timeout
  covers setup only; the owners are correcting that separately. Acceptance here is of the harness bytes, not of the
  controls' result.
- R2 browser execution is not admitted; a fresh G0 window and capacity reading are required; a later browser result
  binds to `3dd3d96`'s artifacts and transfers to `8e85daa` per `e54781c`.
- Any application code calling the two-argument `dns.lookup("127.0.0.1", cb)` would also receive the synthetic
  answer; with the socket fence unchanged that cannot reach beyond the loopback port, but it is a policy exception,
  not a pure listen-path hook, and should stay as narrow as written.
- The R1 failure's refused API was inferred from the diagnostic, not labelled in the R1 receipt.

## 5. QS-R5 acknowledgment

`DOC105_QS_R5_ACTUAL_CONTROL_PLANE_OWNER_RELEASE_ONLY_DISPOSITION_20261013.json` (17:55:04Z) records the incumbent
control-plane owner's native direction: use the `8e85daa` record and test only for this isolated release, preserve
`0f92ca7`/`2b4888e` as historical evidence, no cross-lineage merge without the owner's field-level reconciliation,
release ref only after the current branch/live/194-path/authority/qualification/rollback/no-overwrite checks. That is
the record `e54781c` asked for; QS-R5 is dispositioned. It is the owner's direction and custody acknowledgment, not
human push or deploy consent.

## 6. Next steps

1. **Owners:** bind the corrected guard controls to their own finite admission and run them; admit R2 only on a fresh
   capacity reading at the unchanged 2,048 MiB floor; keep the seven doc 105 §2 items on their separate track.
2. **Coordinator:** record this disposition against revision 7; register the controls result, the R2 outcome and the
   doc 105 items as they complete.
3. **Reviewer:** assess each on sight; the restart claim will be limited to what R2 actually exercises.

Nothing here authorizes tests, a browser run, a push or deployment. Nothing was executed.
