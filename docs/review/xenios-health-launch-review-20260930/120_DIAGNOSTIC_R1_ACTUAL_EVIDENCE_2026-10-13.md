# Revision 20 A: actual Doc 117 pre-navigation diagnostic, evidence acceptance

**ACCEPTED as bound diagnostic evidence: the original target refusal was reproduced before any application
navigation, under the accepted mechanics, with the positive guarded-open proof, exact pins, actual outer timing and an
independent scoped closure.** The receipt proves exactly what doc 116 §6 said such a run could prove and nothing more:
the refusal `UNEXPECTED_BROWSER_TARGET` fires on two `service_worker` attachments classed `OTHER_ORIGIN` (one at
initialization, one at fresh startup) while the expected `about:blank` page is accepted, with zero cases, screenshots,
network events, control calls, application, server or SQL activity, and `journeyCredit = false`. It is not a passed
journey, it does not identify the scheme, origin, ownership or cause of the rejected targets, and it authorizes no
guard relaxation, no benign reclassification and no full browser retry.

Reviewer: this session, `claude-fable-5-1`, revision 20 item A. Read-only on repository bytes; no agents; nothing
parsed, imported, executed, probed or fetched. Docs 117, 118 and 119 remain closed; application `8e85daa`/`25507c2f`
and tooling `3dd3d96`/`7a4ce7c3` unchanged. Archive: `hl12/120_diagnostic_r1_actual_evidence.json`.

**Where the bytes are.** Core `aced83b4` (tree `e66ec038`), prefix
`doc104-baseline-reconciliation-20261013/owned-endpoint-diagnostic-r1-actual/`. Root
`DOC117_DIAGNOSTIC_R1_ACTUAL_RAW_20261013/`: 47 files; every one byte-identical to the Core blob its
`ROOT_RAW_INDEX.json` names, with size and sha256 equal; the 41 `RAW_INDEX.json` rows agree with it; the archive flags
`nativeProfileHomeTmpCopied`, `rawChromeOutputCopied`, `freshExecution` and `resourceRead` are all false.
`ACTUAL_EXECUTION.json` 11,731 B `2ff047fb…`; `OUTER_OBSERVATION.json` `f3c33d74…`; `INDEPENDENT_CLOSURE.json`
`2665f84e…`; `TOOL_EXECUTION_RECORD.json` `d78f7b74…`; `raw/ADMISSION.json` 23,415 B `db599667…`;
`raw/parent/receipt.json` 30,360 B `5f3ba6a1…`; `raw/runner/receipt.json` 34,213 B `d1c10e29…`; `raw/source/` holds
the doc 117 successor parent `1b82d025…`, runner `4770729a…`, pins `9aa9e916…` and guard `7aa38c2d…` byte for byte;
15 pairs of `process-evidence` streams. Root's mechanical disposition agrees on every figure below; its verification is
producer metadata and is not relied on here.

## 1. Bindings verified from the raw files

- **Ticket.** `raw/ADMISSION.json` hashes to `db599667…`, equal to the `admissionSha256` in both the runner and
  parent receipts. Mode `target-lifecycle-diagnostic`, Core owner, source/tree, tooling source/tree, output `run-r1`,
  `nativeProfileMetadataPolicy = CHROMIUM_OWNED_PROFILE_ONLY_NO_EXPORT`, bounds 120,000 / 60,000 / 180,000 ms, 256
  MiB heap, 2,048 MiB floor, one attempt, zero retries, `fullBrowserRetryGranted` and `productionMutationGranted`
  false; window 23:24:01.042Z–23:44:01.042Z with `lastStart` exactly `ends − 210 s`; 56 frozen inputs = the 55 pin
  rows plus the pin file itself (`9aa9e916…`), and the pin file hashes to the runner's `pinsSha256`.
- **Parent** (PID 20220). Attempt consumed 23:27:17.848Z, inside the window; G0 OS free 2,100.75 / available
  2,070.57 / commit headroom 6,807.48 MiB against 2,048; zero competing qualifications; 56 pins before and after,
  equal; worker PID 51668 created 23:27:17.884Z, exit 0 at 23:27:46.582Z, actual lifetime 28,697.9 ms ≤ 180,000;
  `supervisorReceiptSha256` equals the sha256 of `raw/runner/receipt.json`; status
  `COMPLETED_DIAGNOSTIC_REQUIRES_INDEPENDENT_PROCESS_POSTCHECK`, which under the doc 117 successor requires guard
  attempts 1, delegated, instance captured, restored, send restored, two quiets and no terminal-failure marker.
- **Runner.** Status `DIAGNOSTIC_PRELIMINARY_REQUIRES_OUTER_TIMING_AND_INDEPENDENT_CLOSURE`, `failure` null,
  `primaryStopReason ONE_PRE_NAVIGATION_DIAGNOSTIC_FINISHED`, `elapsedMs` 28,606, Node v20.19.0, 55 pins,
  `openGuard {attempts:1, delegated:true, instanceCaptured:true, restored:true}`, `sendRestored` true,
  `cleanupConfirmed` true, `postPinsMatched` true, `activeProbeCount` 0, `unresolvedIdentities` 0,
  `cleanupActions` [] (no kill was needed), `rawEndpointAndProtocolIdsExported` false, dependency boundary as
  accepted (40 rows, `wrapper.mjs` export, pinned `win32-x64` prebuild, built-in `isUtf8`, no overrides). Supervisor
  OS identity: PID 51668 under 20220, pinned `node.exe`, creation ticks `639275308378840640`, which I recomputed from
  its `createdUtc`; the parent's handle-derived `createdUtc` differs only in the seventh decimal, the CIM microsecond
  truncation the record itself names.
- **Sources.** Both roots exact and clean before and after: `8e85daa`/`25507c2f` and `3dd3d96`/`7a4ce7c3`,
  non-shallow; the four Git probes' 88-byte outputs are the three-line identities and the status outputs are empty.
- **Browser and endpoint.** Pinned Chromium `chromium-1228`, `Chrome/149.0.7827.55`, protocol 1.3, 19 arguments,
  private profile under `run-r1`, debugging port 59661, endpoint stored as sha256 only. Census 6
  (`owned-before-version-get`, 23:27:25.51Z) shows 8 owned Chromium processes and exactly one listener on port 59661
  at `127.0.0.1` owned by the browser root PID 45904; censuses 7 (`owned-after-version-get`) and 8
  (`immediate-before-first-cdp-open`, 23:27:32.14Z) show 9 owned Chromium processes and the same single owned
  listener; the guard's revalidation therefore ran on a fresh census immediately before the one `open()`.
- **Outcome.** `diagnostic.status ORIGINAL_TARGET_REFUSAL_OBSERVED_BEFORE_NAVIGATION`; `boundaryReached` true;
  `firstFailure`, `originalDriverFailure` and `drainError` all `UNEXPECTED_BROWSER_TARGET`; `browserCloseRequested`
  and `cdpClosed` true; three sanitized attachment records (type, URL class, booleans only): `service_worker`
  `OTHER_ORIGIN` at `initialization` (not accepted), `page` `ABOUT_BLANK` at `fresh-startup` (accepted by the
  existing predicate, same context, waiting for debugger), `service_worker` `OTHER_ORIGIN` at `fresh-startup` (same
  context, not accepted); zero records omitted. Chromium wrote 0 stdout bytes and 536 stderr bytes, digested, not
  stored.
- **Cleanup and quiets.** Cleanup began 23:27:32.468Z. Census 9 (`cleanup-prekill`) already shows no owned process
  and no listener on 59661, so no kill was issued; quiet 1 at 23:27:38.08Z and quiet 2 at 23:27:45.87Z, 7.79 s apart,
  both with zero owned processes, zero listeners on the port, zero active probes and all 16 anchors closed (15
  metadata probes and the browser, each exit 0). The receipt was written at 23:27:46.577Z, before the parent's own
  `endedUtc` 23:27:46.59Z.
- **Outer observation and independent closure.** An external observer (PID 50364) captured the parent at
  23:27:11.45Z with handle creation 23:27:10.3590816Z and CIM creation 23:27:10.359081Z, and recorded its exit at
  23:27:46.79Z, lifetime 36,431.7 ms, exit 0, zero stops. The independent closure at 23:29:14.60–16.03Z (observer PID
  39444, pwsh 7.6.5) queried exactly 28 PIDs, which equal the 9 owned Chromium identities, the 15 metadata anchors,
  the worker, the parent, the parent's `cmd.exe` ancestor and the outer observer; all absent; no `chrome.exe` in the
  pinned-executable plus private-profile scope; no listener on 59661 for any known PID; parent post pins equal the
  ticket rows; zero stops; memory not read; private profile not read or copied.
- **Timing of the preparation error.** The `TICKET_NOT_CURRENT` failure at 23:26:06.77Z came from an external
  metadata reader that parsed the ticket's UTC as local time; the corrected binding at 23:26:27.86Z used the same
  `-DateKind String` the admitted parent already uses. It preceded the parent launch at 23:27:10.36Z; neither the
  ticket nor any source changed (hashes above), no browser was started by it, and the one admitted attempt is the one
  recorded. It is not a second attempt.

## 2. Privacy, checked against the raw bytes

No raw file contains `ws://`, `/devtools/browser/`, `webSocketDebuggerUrl` or a command-line field. The only
UUID-shaped strings are the coordination identifiers inside `ADMISSION.json` and the owner id in the parent source;
the word `DevToolsActivePort` appears only in the policy sentence and in the runner source. Process rows carry PID,
parent PID, creation ticks, created time, executable path and two mention booleans; listener rows carry address, port
and PID. The browser-profile, home and tmp directories were not read, copied, exported or deleted. The port number and
the endpoint digest are the only endpoint components persisted, as accepted in doc 116 §5.

## 3. Limits retained

As the record itself states: this reproduces the pre-navigation refusal and nothing else; `OTHER_ORIGIN` names a URL
class, not a scheme, host, origin, provenance or cause; `--disable-extensions` was already among the 19 arguments and
no extension cause is inferred; the 15 metadata anchors have exit records but no independently captured OS creation
keys; closure is the recorded known-identity, family and listener scope at the stated instant, not a kernel
guarantee; the parent and runner receipt statuses stay preliminary as written, with the outer observation and closure
supplying the actual timing and absence proofs. No application navigation was dispatched, and the doc 117 guard facts
are what make that claim truthful. No retry, controls execution, diff check, manifest validation or full browser
qualification follows from this consumed ticket. The browser outcome owed to the release remains open: this is the
diagnostic of the R2 failure, not its resolution.
