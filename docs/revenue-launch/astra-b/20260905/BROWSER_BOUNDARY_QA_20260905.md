# ASTRA-B browser-boundary QA — 2026-09-05

This is QA evidence for the integrated universal-launch closeout. It is not
production evidence and does not authorize deployment, migration, price
activation, account grants, communications, payment, or fulfillment.

## Boundary-test result

At the B checkout after commit `36917ca2f5f735a83e1d291aefd48aca7a08cfa0`,
the referral browser-boundary test passed:

```text
node --test scripts/referral-v1/browser-qa.test.mjs
12 tests, 12 passed, 0 failed
```

The correction is test-only. It counts the two assertions inside the
`snapshot` method (rather than all explicit Research/Care arrival checks) and
accepts either LF or CRLF source line endings. It does not weaken the browser
network boundary, credential redaction, PWA-promotion guard, persona binding,
or navigation-settling assertions.

## Actual browser capture status

The disposable synthetic-journey capture was attempted against A's clean
integrated source in a detached temporary worktree using Node `v20.19.0` and
npm `10.8.2`. The repository harness requires a fresh `npm ci`; Windows
repeatedly refused replacement of native `esbuild`/`bufferutil` files with
`EPERM`/`EBUSY` locks, and the install then reported an esbuild binary-version
mismatch. The attempt stopped before preview startup and produced no browser
journey evidence.

This is an environment/toolchain blocker, not a product pass. A final clean
candidate must rerun the mandatory build-bound browser matrix and synthetic
journeys after the installer/native-module lock is cleared. No browser result
is inferred from the boundary-test pass.
