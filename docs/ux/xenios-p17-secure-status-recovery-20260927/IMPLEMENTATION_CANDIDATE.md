# P-17 secure status recovery implementation candidate

Date: 2026-09-27
Task: `XENIOS-P17-SECURE-STATUS-RECOVERY-20260927`
Frozen parent: `5dcbc45f49a753bb857b8f6f035e83d212bd9648`
Runtime: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
Runtime tree: `55bdc57d3992393f4b767cd7f9c6a00c53e25c60`

## Outcome

P-17 now uses a neutral, out-of-band recovery flow. Reference plus email never
returns status. A matching eligible Research order or assisted-order request can
enqueue one deterministic event addressed only to the canonical stored email.
The delivery worker materializes a 256-bit credential only at send time and the
database retains only a digest. An explicit POST exchanges a valid single-use
credential for a revocable, 24-hour, exact-subject status session.

The browser stores no token. The email link uses a fragment; the fresh landing
page copies the token into volatile component state and immediately removes the
fragment with `replaceState`. Opening or prefetching the page does not consume
the token. The exchange cookie is HttpOnly, Secure in production,
SameSite=Strict, and path-scoped to `/api/research/status`.

## Scope boundaries

- Status output is limited to public reference, plain-language state, what
  happened, next step, next-step owner, return route, support route and bounded
  timeline facts.
- Account login/claim, other orders, Care/clinical data, payment destinations,
  private documents, partner and admin authority are not granted.
- Existing owner, raw-token and Early Access status authorities are unchanged.
- `commerceEnabled=false`; native commerce remains dark.
- No real email, environment/configuration change, deployment, staging write,
  production write or managed migration apply occurred.

## Source slices

- Runtime: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
- Tests and SQL qualification: `4ca346e0bae7252eab62b71e59310cf263211a68`
- Release controls: `9b77f1ce400074985da87daba48628d3ffa1f570`
- Migration: `supabase/migrations/20260927203000_research_status_recovery.sql`
- Migration SHA-256: `98cce457db8d82c72a399223117dcf4d98488dc153f3d1883e65a07e95220292`

## Qualification summary

- Typecheck, production build, focused status tests, nearby regression tests,
  route uniqueness, migration DAG and release-control typecheck passed.
- Disposable PostgreSQL 17 apply-twice, structural/ACL/behavior verifier and
  independent-connection double-consume race passed.
- Local exact-build browser UAT passed fragment removal, explicit exchange,
  neutral landing, no-referrer and safe invalid-token behavior.
- The complete suite was rerun after release-control reconciliation with the
  established 60-second per-test headroom: 987 files passed, 6 skipped; 18,169
  tests passed, 85 skipped; zero failures.

P0: 0. P1: 0. The candidate is ready for independent source review, not deploy.
