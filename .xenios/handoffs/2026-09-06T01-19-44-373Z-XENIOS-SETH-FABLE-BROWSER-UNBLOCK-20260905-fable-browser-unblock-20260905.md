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
