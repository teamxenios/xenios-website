# Fable browser/toolchain unblock — bounded QA handoff

**Task:** `XENIOS-SETH-FABLE-BROWSER-UNBLOCK-20260905`  
**Session:** `fable-browser-unblock-20260905`  
**State:** `handoff_ready`; browser installation blocker repaired, browser acceptance incomplete, release **NO-GO**  
**Production authority:** none; no production access or mutation occurred

## Exact integrated source and repair

- Exact qualifying source/harness commit: `204091b1c8a3888706914205d71a0722424bca16`
- Exact qualifying tree: `ed85ea43e42a82442cda35401f1c92c51d9bf677`
- Clean disposable checkout: `C:\tmp\xenios-fable-qualify-204091b`
- Import/real-loopback regression commit: `784f3d066daceabb6122061a2064a695fb25b4a5`
- Lazy-`ws` repair commit: `e14b5794651b2ab851af33022e3a7b651ea83043`
- Assertion-detail commit: `f02aefb810f9420b9619fb0c69794e9314888a12`
- Final test cleanup commit: `204091b1c8a3888706914205d71a0722424bca16`
- Changed runtime helper: `scripts/evidence/lib/cdp.mjs`
- Retained regression: `scripts/evidence/lib/cdp-import-order.test.mjs`

The repair removes the module-scope `ws` import and performs the same real
`await import("ws")` inside `CdpConnection.open()`. Constructor options and
the real WebSocket transport are unchanged. No dependency, lockfile, native
binary, install policy, auth/network boundary, or application feature changed.

## Confirmed root cause

On the unmodified frozen diagnostic source, importing the complete synthetic
runner in a fresh pinned-Node child loaded `ws 8.21.0`, `bufferutil 4.1.0`,
`node-gyp-build`, and the exact native image
`node_modules/bufferutil/prebuilds/win32-x64/bufferutil.node` before the runner
invoked its mandatory same-checkout `npm ci`.

A safe hardlink to that same file record reproduced Windows `EPERM` (`errno
-4048`, syscall `unlink`) while the importing parent was alive. The identical
unlink succeeded immediately after that parent exited, while the original
native binary remained present. After the lazy import, importing the complete
runner loaded neither `ws` nor `bufferutil`, reported no mapped `bufferutil`
shared object, and the same live-parent hardlink unlink succeeded. This
confirms parent-process self-lock as the causal installation blocker for the
reproduced occurrence; no ACL, scanner, lockfile, or optional-dependency
workaround was used.

## Pinned install, build, and regression proof

- Node: `v20.19.0`
- npm: `10.8.2`
- `ws`: `8.21.0`; `bufferutil`: `4.1.0`
- `package-lock.json` SHA-256:
  `84fecf0017f4855a609a245eff3382586edb835651aee8ca0d7adf7b5ea44f3e`
- Install method: `npm ci --no-audit --no-fund`; exit `0`
- Production build: exit `0`
- Build provenance time: `2026-09-06T01:13:57.590Z`
- Distribution: 336 files; inventory SHA-256
  `f9ac995c27c77ff716ebc1c9f4de8346772f4e413d5db8440d40f7f5ceb3df60`
- `dist/evidence-provenance.json` SHA-256:
  `dd06fad6e4b58e5e87485f05cdf84d2abd73c8ddbbd27610538076ff6029533c`
- Focused evidence Vitest on exact tree: **90/90 pass**
- Direct import/transport `node:test` on exact tree: **5/5 pass**
- A re-ran the direct test from
  `C:\Users\sboad\.codex\worktrees\f36a\xenios-website` with pinned Node:
  exit `0`, 5 pass, 0 fail, 4.92 seconds.

The regression imports the full capture graph in a fresh process and proves
that `ws`, `bufferutil`, its native addon, and esbuild are not loaded early. It
also opens, sends over, and cleanly closes a real installed-`ws` loopback
connection, plus verifies refused-loopback behavior.

## Qualifying browser result — partial only

- Browser: Chrome for Testing `149.0.7827.55`
- Browser executable SHA-256:
  `b798f9e53a98d29eb7f36f8c409f905d3184780a04d2bcb56989067194784bd1`
- Partial artifact root:
  `C:\tmp\xenios-fable-synthetic-204091b-001`
- Partial inventory: 16 files, 2,283,257 bytes; deterministic sorted-record
  inventory SHA-256
  `55e72371ba886566f92dda16de5523ead940cf0c3d9724bdb579ac50eac08899`
- No trace was emitted. No final `synthetic-journey-evidence.json` exists.

Eight real-browser captures reported `AUTOMATED_PASS`:

| Scenario | Width | Screenshot SHA-256 |
|---|---:|---|
| catalog/default | 1440 | `a84f2d1a79e0eb1a829e22f8cc01852cfd190f710597195eaf6ce270593a8545` |
| catalog/default | 390 | `1c673322179eb24932472c126b15e305e0d9c14e995fcb8acbcbcb8c7d638b60` |
| product-detail/default | 1440 | `082176be5ac12c4bd163a63c5fb8ff6671f9bd0902030dfe994fb2bb93b5aa0f` |
| product-detail/default | 390 | `771fe1203e0d29260d7157446908b1dcebf4f17611c611ac9874f22159c8fc23` |
| account-overview/rich | 1440 | `9219f1ad14cb3c50cb3195e2f13cc74fe4d3b747e249c0429a7fe2aa856a171c` |
| account-overview/rich | 390 | `aa2a9b9dbdb27e1721fc79413f50f3f86b5d019c0ab3ddd06014af73a0cee5f1` |
| orders/rich | 1440 | `47c4230d066d51d8cf5c8ddb45c61447c20160acc84aaf570d11e75a3b84795d` |
| orders/rich | 390 | `a84728694cd81a2b4f25a6952645d2115561ca1dd445aae92088c167257c94d7` |

A read-only Fable spot-check of catalog/desktop, product-detail/mobile,
account-overview/desktop, and orders/mobile found rendered content and
responsive layouts rather than a blank, crash, or blocking overlay. This is
not a substitute for B's independent screenshot review.

Rendered-text hashes were `1b0bbfb204ede1515a4485440399450f66562073e4b3b0ac812406a85b5a5541`
(catalog 1440), `63a3e7bd8da641fc80fa0eaf06e89452ded0a9cd21c888cf8c57fdfa3626096f`
(catalog 390), `18a1cfc66c735e69b761007c0aa8afae890a7ccbef20f7937a141868823d386a`
(both product-detail widths), `afaba33bde45a898fcb62c6287fb65713cc78cc8d76aa27eb817fc51292a1d99`
(both account widths), and
`2e002465f65faad40e2d988c169963265702492edcb129fccd337d1535ba0286`
(both orders widths).

The next membership capture stopped deterministically with:

> `ROUTE_STATE_CONTRACT expected but did not find Membership, separated from Care. and Next billing / renewal`

The runner exited nonzero before its signed/final evidence envelope. Therefore
the partial screenshots are diagnostic artifacts, not a completed acceptance
packet and not permission to release.

## No-go gaps and cleanup

Only widths 1440 and 390 completed. Required widths 1366, 1024, 768, 430,
375, 360, and 320 were not exercised. The required approval -> secure claim ->
normal credential login -> account -> partner-workspace journey, pending and
suspended states, notification-failure persistence, and real-handler runs
against a disposable database were not completed. Synthetic UI state is not
evidence that those handlers work.

One overlapping diagnostic installer was detected and stopped; its transient
`tslib` error was caused by the concurrent `npm ci` and is excluded from the
qualifying record. The superseded 68a8 matrix and 0521 capture trees were also
stopped at A's direction. The qualifying runner, preview harnesses, browser,
and their children are stopped; a final process audit found none of those
process types remaining. A's separate focused-test process is outside this
cleanup statement. Failed/partial artifact directories were preserved and not
overwritten.

A remains the sole integrator and release owner. B should independently review
the assertions and partial screenshots. Do not deploy, migrate, activate
prices, grant accounts, notify real users, charge, or ship on this record.


## Superseding integration note — 2026-09-06

The Fable tooling slice is now integrated in root candidate `b1fb9a5e64d90210b9b267214bb20fcc66e4b117` (tree `68426af116445394a05ace33a1397eac96b4244e`). The current regression is Vitest-compatible and passes **5/5** for lazy import ordering and real WebSocket loopback/refused-loopback behavior. ASTRA-B's account UX correction is also integrated: the subscription surface states **Membership, separated from Care.** and exposes **Next billing / renewal**.

The latest parallel full-suite observation was not green under host contention: **873 passed files, 2 failed, 5 skipped; 13,488 passed tests, 3 failed, 59 skipped**, with one Vitest worker-start error. The two migration-DAG timeout cases pass serially with a 120-second timeout (2/2), and the roster-privacy case passes serially with the same timeout (1/1); no assertion regression was reproduced. Final exact-current browser capture on `b1fb9a5` remains pending; no browser journey acceptance is claimed from the earlier partial artifact.

This handoff remains QA evidence only. Production SHA `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, deployment `dep-dad08h740ujc73aprfcg`, and service `srv-d8s9vej7uimc7384dfcg` are unchanged. No deploy, migration, account grant, notification, payment, or shipment occurred.


## Superseding tooling patch — exact denial contract

Fable's readiness retry was integrated as root `42ab49475148df18b82927491ae7bfc86d94a42e`. The subsequent evidence-only patch from Fable commit `46a9415b26564ee961251a141e5738e47ceb42a4` is integrated in root `1d46e068fecc4f1f555d7775fa5136f32406590f` (tree `d224ca1f273b7882f96d14be08a4ec95e6e5ba90`). It predeclares only the empty fixture's exact authenticated `GET /api/research/partner/me` 404 (`partner_not_found`, canonical body hash `87d28f7e...`, one Fetch and one console signal), records separate `partnerAbsenceEvidence`, and adds manifest drift tests. Focused runner/report/manifest coverage is **54/54 PASS**.

A fresh exact-tree browser recapture against `1d46e06` is pending; the prior `42ab494` envelope's two undeclared empty-fixture failures are superseded by this contract patch but remain non-final evidence.


## Final browser acceptance — 2026-09-06

Fable's sole-owned exact-tree capture is complete on `28e4b7802c84c01b4433040a36e622ce6bbf27de` (tree `17b204350602f8be22b6b722eddd5d5a1c421930`). The manifest at `C:\tmp\xenios-fable-synthetic-28e4b78-final-007\synthetic-journey-evidence.json` is 672,136 bytes (SHA-256 `6e123d7e1703117f262087e7f6949c5590ebeb2aabd2495d7e8c3023e56d9e8b`); its 40-file artifact inventory (20 PNG + 20 text) is SHA-256 `05e021f240db8c95e22370dca156da9ff950483db0ad6b8fbf42b653f475e377` with zero missing/extra/mismatch files.

All 20 captures completed: 16 `AUTOMATED_PASS` and four exact `AUTOMATED_PASS_WITH_NOTES` (two forged-reference denials and two no-partner denials), zero failures, all boundary assertions pass, zero truncated screenshots, and warmup PASS in 13,668 ms. The run is `completeWithExpectedDenialNotes=true`, `zeroUndeclaredFailures=true`, `externalMutations=0`, and `claimScope=UI_PRESENTATION_ONLY`; manual PII/PHI review remains explicitly pending by design.

This is synthetic local browser evidence, not production approval.
