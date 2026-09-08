# Care endpoint differences: controlled baseline/candidate disposition

**ENVIRONMENT_MISMATCH supported for the original three Care differences.** This is a bounded local result, independently reviewed. It does not establish enabled-provider or production parity.

Application candidate: `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`, tree `314ef445a6e3be8420a77451ed182088419d59ec`. Baseline: the actual live application source `ff3c496245739233b71e46f9e5d6e26af9d57017`, built in a separate detached worktree. The live HTTP baseline remains the retained September 7 capture.

| Actual run | Configuration | Result |
| --- | --- | --- |
| 01: ff3 baseline | Original refusal fixture; email readiness input absent; retry timers suppressed | 27 SAME / 3 REGRESSION, exit 1; all original difference details reproduce exactly |
| 02: ff3 baseline | Matched disabled Care projection and synthetic email-readiness configuration | 30 SAME / zero differences or waivers, exit 0 |
| 03: c350 rebuilt runtime | Identical matched configuration | 30 SAME / zero differences or waivers, exit 0 |

The affected routes are `GET /api/care/status`, `GET /api/care/access-request/status`, and `GET /api/care/tebra/configuration`. They remain required in any later authorized production smoke.

The matched fixture returns an explicitly synthetic empty Care capability projection. Its nonfunctional email key marks configuration present only; no email transport exists. Auth continues to return 401, other data reads return 503, writes are refused and timer callbacks remain suppressed. No response expectation, scanner rule or waiver was changed. The original [27/3 result](CRITICAL_ENDPOINT_LOCAL_COMPARISON_DISPOSITION.md) remains failed and intact.

The independent reviewer compared response status, headers, content type, route classification and shapes across all 30 endpoints; the matched baseline and candidate records agree. They also checked all 336 baseline and 342 candidate distribution hashes, finding no mismatch. Instrumentation is byte-identical to the original, SHA-256 `1898d04b04790a23059f62f293a2921b70c619b58274ed4bdada89425a516506`.

Each run admitted exactly the existing 30 unauthenticated GETs on loopback, executed zero timer callbacks and confirmed child termination. Provider GETs reached only the owned fixture. Each unattributed POST was denied before transmission; its path, purpose and provenance remain unknown. No production query/write, real credential, account action, notification job, email, migration or deployment occurred.

The [sanitized machine receipt](critical-endpoints-environment-control-c350ab1.json) identifies the scenario for every run and hashes the external raw artifacts. Those raw qualification files retain generic unavailable-provider wording and do not contain a `providerScenario` field; this companion makes that limitation explicit without altering them. Run 03 observed evidence HEAD `1704387beffca6b86dd8c36afc161f2b1439be51`; [fresh build evidence](build-typecheck-c350ab1.json) binds its 342 unchanged output files to application c350. Intervening changes are documentation/continuity only.

These controls resolve the environment explanation for the observed differences. Node instrumentation and suppressed retries are not an operating-system sandbox or actual Auth, Storage, email, clinical or enabled Hub adapter qualification. No production GO follows from this result.
