# Revision 16 C: owned-endpoint pre-navigation diagnostic runner, source only

**SOURCE ACCEPTED for the guard, parent, pins and runner mechanics, with one minimal correction required before any
ticket: the receipt must evidence that the driver's single `open()` actually passed through the installed guard.**
Today the same-class property holds by construction: the accepted driver `b2f0901d…` imports the CDP module through
`pathToFileURL(path.join(ROOT, 'scripts/evidence/lib/cdp.mjs')).href` with a `ROOT` literal byte-identical to the
runner's `TOOL_ROOT`, it constructs `CdpConnection` once and opens once, and one Node process resolving one canonical
file URL yields one module instance. But the runner's pass predicate and the parent's acceptance predicate only check
that the guard was *restored*, not that it was *traversed*, and the guard's own module-URL check compares two strings
the runner itself supplied. The user's objection is exactly right: equal caller-supplied URLs are not class proof.
The proof the mechanism already produces, `openGuard.attempts === 1 && delegated === true && instanceCaptured`, must
be required by both the runner's `ok` and the parent's status line. Without it, the status
`ORIGINAL_TARGET_REFUSAL_OBSERVED_BEFORE_NAVIGATION` could in principle be reported for a run in which the adapter's
`Page.navigate` interception never applied, because the accepted adapter's `applicationNavigationDispatched` is a
static `false`. With it, every `Page.navigate` is provably intercepted and the "before navigation" claim is truthful.

Everything else requested checks out from the bytes: the Chromium argv is identical to R2's nineteen arguments; the
owned-listener identity is verified before the single bounded, non-redirecting 65 KiB `/json/version` read and again
immediately before the socket; the native `DevToolsActivePort` endpoint must equal the version endpoint; the forty
selected native dependency rows are preserved and bound exactly; optional-branch and flag guards match the original
transport; there is one `runFresh`; bounds are 120 s + 60 s / 180 s, 256 MiB heap, 2,048 MiB floor; the primary stops
before `Page.navigate`; no application, server or SQL import or route exists; instrumentation persists endpoint hash,
port and sanitized facts only, never raw endpoint, browser, target, session or context IDs; and Chromium's own
`DevToolsActivePort` stays in the private profile that nothing in this source copies or exports.

Reviewer: this session, `claude-fable-5-1`, revision 16 C, after A/B (doc 115). Read-only, no agents, nothing parsed,
imported, executed or probed; no browser, profile or file created. Application `8e85daa`/`25507c2f`, tooling
`3dd3d96`/`7a4ce7c3`, docs 104–115, all accepted receipts and the accepted driver/adapter unchanged. Archive:
`hl12/116_owned_endpoint_diagnostic_runner_source.json`.

**Where the bytes are.** Core `d57d9c88` (tree `4c7703ef`),
`doc104-baseline-reconciliation-20261013/target-lifecycle-diagnostic-runner-source-proposal/`: parent
`execute-admitted-target-lifecycle-diagnostic-proposed.ps1` 12,432 B `7fb7af42…`; runner
`run-target-lifecycle-diagnostic-proposed.cjs` 32,412 B `2a4da635…`; guard `owned-endpoint-open-guard-proposed.mjs`
2,290 B `7aa38c2d…`; pins `pins-target-lifecycle-diagnostic-proposed.json` 13,831 B `782efd64…` (55 rows);
`PROPOSAL.json` 9,049 B `d584bef9…`. Root `diagnostic/` copy byte-identical; `ROOT_RAW_INDEX.json` names the same
blobs. Compared against: pinned `cdp.mjs` `12a76cec…` 43,506 B (git blob at `3dd3d96`), `chrome.mjs` `01f53d2d…`,
accepted driver `b2f0901d…` 40,786 B (doc 109), accepted adapter `f79528ec…` 6,264 B (doc 112 B), dependency rows
`506ec8c6…` (40), process helper `f3a92fa2…` 8,075 B and identity helper `c9d5d4f3…` 5,387 B (read at their pinned
paths, hashes equal), and the R2 browser runner source (doc 106 scratch) for the launch argv.

## 1. Same-class boundary, as it stands

- **Driver side.** Line 36: `const { CdpConnection } = await import(pathToFileURL(path.join(ROOT,
  'scripts/evidence/lib/cdp.mjs')).href)`; line 37: `new CdpConnection(wsUrl)`; line 250: `await conn.open()`.
  Counts in the file: one import of the module, one construction, one `open`. `ROOT` (line 8) is
  `C:/Users/sboad/.codex/tmp/ql-doc104-render-build-r2-20261013/source`.
- **Runner side.** Line 8 `TOOL_ROOT` is the same string, byte for byte. Line 406 computes `cdpUrl` the same way, line
  409 imports it and captures `cdpClass` and `originalSend` before anything else touches the class. Node's module map
  is keyed by the resolved URL, so the driver's dynamic import returns the same namespace and the same class object.
  No copy, suffix, query, fragment, symlink alias (every pin passes `regular()`: real path equal, no symlink ancestor)
  or second connection: the runner opens no CDP connection of its own, and `finish` uses only `guard.connection`.
- **Guard.** Installed at line 414 before the adapter is invoked at line 417. It wraps `prototype.open` by data
  descriptor without replacing or subclassing the class; `guardedOpen` runs `check()`, refuses a second attempt, any
  argument, a foreign prototype or constructor, or a `wsUrl` other than the exact endpoint; captures `this` before
  the original `open` can import `ws` or create a socket; awaits `revalidate()` (a full owned-endpoint re-check with a
  fresh census, see §2); runs `check()` again; re-compares instance, `wsUrl`, prototype and that `prototype.open` is
  still the guard; then delegates. `restore()` reinstates the exact original descriptor and verifies it. The
  endpoint shape check is strict (`ws:`, `127.0.0.1`, numeric port, no credentials/search/hash, `/devtools/browser/<id>`,
  `href === endpoint`).
- **The gap.** `installOwnedEndpointOpenGuard` requires `canonicalModuleUrl === expectedModuleUrl`, but lines 414–415
  pass two values computed by the same expression; that is a tautology, not evidence. The runner's `ok` (lines
  344–345) requires `openGuard.restored === true` and `sendRestored === true`; `restore()` succeeds whether or not
  `guardedOpen` ever ran. The parent (line 130) requires the same two facts. Neither requires `attempts === 1`,
  `delegated === true` or `instanceCaptured`. The adapter's status `ORIGINAL_TARGET_REFUSAL_OBSERVED_BEFORE_NAVIGATION`
  is granted on `UNEXPECTED_BROWSER_TARGET` alone (adapter lines 104–105, 113) and `applicationNavigationDispatched`
  is never updated from `false`; R2 itself served GETs before its zero-case failure. Only an intercepted `Page.navigate`
  on the driver's class makes "before navigation" true, and only the guard facts prove the driver's class is the
  patched one.
- **Minimal correction.** Runner line 344–345: add `&& receipt.openGuard?.attempts === 1 &&
  receipt.openGuard?.delegated === true && receipt.openGuard?.instanceCaptured === true` to `ok`. Parent line 130: add
  `-and $qualResult.openGuard.delegated -eq $true -and $qualResult.openGuard.attempts -eq 1`. No change to the guard,
  adapter, driver, pins (other than the two self rows), bounds or privacy scope. With that, a run that reaches a
  diagnostic status has proven that exactly one `open()` on exactly the patched class occurred after revalidation, so
  the adapter's `send` patch covered every `Page.navigate` the driver could issue.

## 2. Endpoint order and listener identity

`openPrivateBrowser` (lines 259–282): fresh `browser-profile` under the output (must not exist); spawn with the
original flags; `browserLog` hashes and counts Chromium's streams, stores no bytes; the pinned `waitForDevToolsPort`
reads the native `DevToolsActivePort` only; port range checked; then `requireOwnedEndpoint('owned-before-version-get')`:
a census via the pinned process helper, `clearObservation` (no ambiguous rows, no unresolved identities, no owned
process listening anywhere but `127.0.0.1:debugPort`), browser root anchor observed and live with family `browser`
and executable equal to the pinned Chromium, exactly one listener on `debugPort` at `127.0.0.1` whose owning process
is an owned browser-family Chromium, and the native endpoint re-read and shape-checked. Only then `readVersionOnce`:
`http.get` to `127.0.0.1:debugPort/json/version`, `agent: false`, non-200 rejected (so no redirect is followed), body
capped at 65,536 B, bounded by the remaining budget up to 5 s. `webSocketDebuggerUrl` must equal the native endpoint
exactly; URL shape and version shapes are checked; then `requireOwnedEndpoint('owned-after-version-get')`. The guard's
`revalidate` repeats `requireOwnedEndpoint('immediate-before-first-cdp-open')` inside `guardedOpen`, after `this` is
captured and before `originalOpen` imports `ws`. `PRIVATE_ENDPOINT_CHANGED` fails if the native endpoint differs at
any later read. Ownership adoption requires a simultaneously observed exact parent (`absorb` for direct anchors with
the supervisor's own exact identity; the pinned identity helper for descendants, creation ticks not before the
parent's, executable required or pending re-check, never adoption after absence).

## 3. Launch argv, optional branch and dependency closure

The nineteen-element Chromium argv (headless new, debugging address 127.0.0.1 port 0, private user-data-dir,
no-first-run, no default browser check, GPU/extensions/background networking/sync/QUIC disabled, the three disabled
features, WebRTC policy, dead proxy `127.0.0.1:9` with loopback bypass, host resolver `MAP * ~NOTFOUND, EXCLUDE
127.0.0.1`, scale 1, 1440×900, `about:blank`) equals R2's array element for element. `verifyDependencyResolution`
requires win32/x64/v20.19.0, refuses `NODE_OPTIONS`, `NODE_PATH`, `WS_NO_BUFFER_UTIL`, `WS_NO_UTF_8_VALIDATE`,
`PREBUILDS_ONLY`, npm arch/platform, `LIBC`, `ARM_VERSION`, `BUFFERUTIL_PREBUILD`, `ELECTRON_RUN_AS_NODE`; requires
built-in `isUtf8`; resolves `ws`, `bufferutil` and `node-gyp-build` from the pinned module locations by
`createRequire`; checks the `ws` export map; refuses `build/Release` and `build/Debug`; requires the exact prebuild
tuple set and the single `win32-x64/bufferutil.node`. The forty dependency rows (`bufferutil` 12, `node-gyp-build`
9, `ws` 19) equal pins rows 1–40 under the runner's exact JSON comparison, and the required set is exactly those forty
plus Node, Chromium, PowerShell 5, Git, the two helpers, `chrome.mjs`, `cdp.mjs`, driver, adapter, dependency rows,
guard, parent, runner and pwsh: 55, matching the pins file and the parent's 55-plus-ticket rule (56 frozen inputs
including the parent itself). The runner additionally hard-codes the digests of `cdp.mjs`, driver and adapter. All 55
pinned paths resolve to the pinned bytes on this host at review time.

## 4. Parent, bounds and cleanup

Parent: ticket hash equals the argument; `approved`, Core owner, mode, source, tree, output `run-r1`,
`nativeProfileMetadataPolicy = CHROMIUM_OWNED_PROFILE_ONLY_NO_EXPORT`, exact bounds, pins row from the ticket, exact
six-element invocation (pinned Node, `--max-old-space-size=256`, runner, pins path, pins hash, ticket path), window
≤ 20 min with `lastStart = ends − 210 s`, inherited `GIT_INDEX_FILE`/`GITHUB_EVENT_PATH` refused, output parents
reparse-free, both outputs fresh, 56 frozen inputs including `$PSCommandPath`, every input re-hashed before and after,
55 pin rows each matched to a ticket row, both source roots at exact HEAD/tree, non-shallow and clean with
`--no-optional-locks`, competing qualification regex, fresh 2,048 MiB floors with the doc 112 A refusal telemetry,
`lastStart` recheck; then the runner is spawned with a cleared environment and an outer stop of start + 184 s,
observed for 190 s, exit code and actual lifetime recorded, runner receipt hashed and read; the parent's status is
`COMPLETED_DIAGNOSTIC_REQUIRES_INDEPENDENT_PROCESS_POSTCHECK` only on exit 0, lifetime ≤ 180 s, runner status
`DIAGNOSTIC_PRELIMINARY_REQUIRES_OUTER_TIMING_AND_INDEPENDENT_CLOSURE`, `cleanupConfirmed`, `postPinsMatched`,
`openGuard.restored`, `sendRestored`, `journeyCredit false`, two quiets and no `terminal-failure.json` (plus the §1
additions). Runner: argv and `execArgv` exact, ticket re-validated including the metadata policy, `stopAt = min(t0 +
180 s, outer)`, `workAt = min(t0 + 120 s, stopAt − 60 s)`, work timer, pins re-hashed with duplicate refusal, outputs
fresh, baseline census and supervisor OS identity, pre sources, then §1–§2. `finish`: bounded `Browser.close` on the
captured connection only if still open (the adapter normally closes it first), bounded socket close, primary
settlement, unconditional guard and `send` restoration, census, exact kill through the pinned helper (which verifies
microsecond ticks and executable before `Kill()` and never kills a tree), quiet 1, 5 s pause with budget check, quiet
2 (no live owned, no listener on the debug port, no active probes, every anchor closed), post sources and pins, receipt
with `wx` under a 2 MiB cap, terminal-failure marker on deadline overrun, exit 1 on any failure. Statuses are
`DIAGNOSTIC_PRELIMINARY…` or `DIAGNOSTIC_FAILED_OR_INCOMPLETE`; `journeyCredit` is false in adapter, runner and
parent. Sanitized `uncaughtException`/`unhandledRejection` paths call `finish`.

## 5. Privacy scope, reviewed

Authored receipts, logs, args and process evidence persist: the endpoint SHA-256, the debugging port number, the
profile path, the Chromium argv (paths and flags), browser/protocol version strings, sanitized target-attachment
records and counts from the accepted driver, process rows (pid, parent pid, creation ticks, executable path, two
mention booleans; the helper deliberately emits no command lines or environment), host listener rows (address, port,
pid), probe argv (helper paths and modes), cleanup results (pid, ticks, status), and Chromium stream counts and
digests with `rawBytesStored: false`. Never persisted by this source: the raw `ws://…/devtools/browser/<id>` endpoint,
browser/target/session/context IDs, Chromium's stdout or stderr bytes, the DevTools listening URL, or stacks. The
runner writes nothing to stdout and only whitelisted codes to stderr. Chromium writes its own `DevToolsActivePort`
inside `run-r1/browser-profile/`; the runner reads it and keeps it in memory; nothing in the parent or runner copies,
archives, exports or deletes the profile, `home/` or `tmp/`. The claim "IDs never existed on disk" is correctly not
made. The archive allowlist in the proposal (receipt, terminal-failure, process-evidence streams and index, parent
files, source/pin/ticket copies; never a recursive copy; exclude profile, home, tmp and unclassified files) is a
future Root step, not code here; it must be enforced at that step. The port number and the listener rows are the only
endpoint components persisted; they match the accepted R2 and R3 patterns.

## 6. Observations and predicates (no further corrections)

- `ORIGIN = http://127.0.0.1:5237` is used only as the driver's navigation base; no request to it can occur while the
  adapter's `Page.navigate` interception holds, which is precisely why §1's correction is required rather than
  optional. If another process were listening on that port, an unintercepted navigation would contact it.
- The parent and runner both refuse any `node.exe`/`pwsh.exe`/`powershell.exe` whose command line names this runner
  or parent; the launch chain must not self-match. Any process mentioning the tooling root or scratch on its command
  line during the run is ambiguous and ends the attempt.
- The listener check requires exactly one `127.0.0.1` listener on the debug port; Chromium with
  `--remote-debugging-address=127.0.0.1` binds IPv4 only, as in R2.
- The parent omits `Set-StrictMode`; missing ticket fields still fail its comparisons (null never equals the required
  values), and a null `openGuard` fails `-eq $true`.
- Admission predicates: finite Root ticket binding the 55 rows plus the pins file as the 56th, Core owner, unchanged
  `8e85daa`/`25507c2f` and `3dd3d96`/`7a4ce7c3`, the metadata policy string, fresh `run-r1` and `parent-r1`, fresh
  2,048 MiB floors, no competing admitted heavy group, the two tooling scratch paths (driver copy and dependency
  rows) present with pinned digests, and an independent exact-identity closure plus outer start/end/exit after the
  run. Socket close and provisional JSON prove nothing about process closure.
- Outcome rules retained: `ORIGINAL_TARGET_REFUSAL_OBSERVED_BEFORE_NAVIGATION` is diagnostic evidence only;
  `PRE_NAVIGATION_BOUNDARY_REACHED_NO_REFUSAL_OBSERVED` cannot exclude a navigation- or application-triggered refusal;
  no journey credit and no full nine-case retry follows from either.

No execution consent follows. No gate is waived. The accepted driver and adapter are not reopened; the correction is
to the proposed runner and parent only.
