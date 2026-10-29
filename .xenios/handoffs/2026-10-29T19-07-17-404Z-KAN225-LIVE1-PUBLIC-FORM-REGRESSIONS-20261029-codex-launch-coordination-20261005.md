# KAN-225 LIVE-1 public-form diagnostic expected-RED QA handoff

Session: `codex-launch-coordination-20261005`

Task: `KAN225-LIVE1-PUBLIC-FORM-REGRESSIONS-20261029`

Lease: `c28ee3be-1d58-42d2-9838-24f0c91655da`

## Exact test-source identity

- branch: `codex/live1-public-form-regressions-20261029`
- pushed SHA: `d6c577eff3795499d084b9d2d5305001fc903f17`
- tree: `18e343e74d29a36c9f4786e7ae1546e2aad468d1`
- parent/base: `4634cb438908b583d50d6bcbdd5569a5ff9324cf`
- draft PR: https://github.com/teamxenios/xenios-website/pull/334
- provider checkout identity: `9227b413c60fe62615ceaff76e9d27ce7146bbf8`; provider tree verified as `18e343e74d29a36c9f4786e7ae1546e2aad468d1`
- only path: `server/public-forms.security.test.ts`

This is a test-only diagnostic source. Product implementation files,
`server/routes.ts`, `server/turnstile.ts`, workflows, configuration, protected
manifests/gates, and production state are unchanged.

## Actual executed result — diagnostic expected RED

Trusted hosted run `40935981474`, attempt 1, reached a terminal result:

- test job `123666537727`: FAIL;
- required completion `123668858469`: FAIL;
- typecheck `123666537583`: SUCCESS;
- build `123666537438`: SUCCESS;
- protection `123666537270`: SUCCESS.

The new file executed 31 tests in 152 ms: 17 passed, 14 expected contract
failures, zero skipped. The full suite reported 18,226 passed, 14 failed, 83
skipped; 978 files passed, 1 failed, and 6 skipped. The focused suite reported
107 passed; focused and full scopes overlap and are not additive.

All 14 failures are confined to the one new test file and partition as:

- 5 missing production-configuration obligations;
- 1 transport error-log privacy obligation;
- 4 contact courtesy-verification obligations;
- 4 proxy-IP, limiter, and storage obligations.

No unexpected database getter, import, or fixture failure was observed. Raw log
SHA-256:
`299cbd4bc78de2d8389001b1dd85464d84b68fbd4008e6d1601f9878e78a595e`.

## Qualification and release boundary

Status is **DIAGNOSTIC EXPECTED RED — NOT RELEASE ADMISSIBLE**. This handoff
records an executed security harness for review; it does not claim a passing
gate, waiver, protected-source fix, reviewer acceptance, or production GO.
Lawful protected owner KAN-226 and configuration readiness remain required for
any actual repair. Root and the authoring helper are not independent acceptance.
Cross-read corrected vacuous Error-serialization assertions; the SAME executed
harness verdict is still forthcoming.

No real database, provider, or customer call occurred. No source product,
runtime, CI, security configuration, protected control, service, provider,
customer, deployment, or production mutation is authorized or performed by
this handoff.
