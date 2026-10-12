# TC-25 App.tsx manifest amendment (`3ec5ec0`): scope check

**SCOPE ACCEPTED. The applied amendment is exactly the approved one-hash change, and it is traceably authorized. The
protection check has not been run; that evidence is still pending. TC-25 is otherwise closed.**

Reviewer: this session, `claude-fable-5-1`. Reviewed read-only from Git on my own initiative, as doc 97 said I would
when the applied successor was registered (board `7271ff2`). Governing records: my reconciliation at `582c763` and the
erratum in doc 97 section 2.

**Target:** commit `3ec5ec036a69cef107f17e59e0eb5bb3178d1f86` on local branch `codex/tc25-app-manifest-20261012`
(not on the remote), parent `340d167` (custody claim), whose ancestry includes the accepted source `25741f0`.

## 1. What I verified

| Check | Result |
| --- | --- |
| Files changed | Exactly two: `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` (one hash row replaced, one provenance comment line added) and the new `docs/phase2/HEALTH_APP_PROTECTED_HASH_APPROVAL_20261012.md` (105 lines). No code path changed |
| The hash row | `seamBaselineHashes.files["client/src/App.tsx"]`: `sha256:3b3b808b…` → `sha256:1ee2d576…`. No other hash, zone, route, baseline or test changed |
| Applied bytes equal the approved candidate | Applied manifest raw SHA-256 `95445fdf1855560460da2283d06f9dda733e373c1258611ec278cd499e74a23d` = the approved candidate recorded on the board. Pre-amendment manifest blob `241fc344` as expected |
| Applied diff equals the prepared patch | The board patch (`5e539cea…`) and the applied `git diff` have identical `+`/`-` lines |
| The source it pins | `client/src/App.tsx` at `3ec5ec0` is blob `b5cc8edc`, raw `1ee2d576…`, 18,079 B: the accepted revision 5 candidate, unchanged across the amendment |
| Authority | The approval record cites your pasted request observed 2026-10-12T18:16:38Z (raw `20041ef0…`, 14,993 B, preserved at `04b4cc70`), which precedes the 18:23Z commit. It names both covered changes (the `0d22757` access-hub line and the disabled Quick Order composition), follows the `663268f` precedent, and records the `fileHashes`-vs-`seamBaselineHashes` wording reconciliation |

## 2. What remains

- **The protection check is NOT RUN.** The board's `TC25_EXACT_LOCAL_PROTECTION_EXECUTION_BINDING_20261012.json`
  reserves an exact scope (`scripts/acceptance/verify-core-site-protection.mjs` and
  `server/core-site-protection.test.ts` at `3ec5ec0`, Vitest 4.1.10, finite window, one heavy job) with status
  `NOT_RUN`. Reasoned from the bytes, the seam-baseline test (`:385-388`) should pass against this tree, because the
  file's raw hash equals the new baseline. That is not a result. When the executed receipt is registered I compare its
  argv, source identity and exit against this binding.
- **The amendment is local.** `codex/tc25-app-manifest-20261012` has no remote ref. Landing it is an integration step
  under the existing release authority, not something this check grants.
- **The provenance comment keeps the word "proposed".** The approval record discloses this deliberately, to match the
  approved patch bytes. It is accurate as history.

Nothing here authorizes tests, a push, integration, qualification or deployment.
