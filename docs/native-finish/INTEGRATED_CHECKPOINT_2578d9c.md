# Native payment integration checkpoint — not a production release

Recorded 2026-09-10 by the sole integration owner. No production deployment,
configuration change, migration, provider call, notification, purchase or shipment
was performed. The overall Xenios Health goal remains incomplete and active.

## Exact source and evidence

- Application: `2578d9c31b1521d43d7fb96ef261e0d05b39716d`.
- Application tree: `20c155693b1fe069eba4cbfd6637ff69854a7c0a`.
- Qualified record successor: `13b78ae0455730f98b920bda0f4ddd2d0f1cf16d`.
- Record-successor tree: `27783db75bf430943f0b5fa685f3269f59ede62e`.
- The successor changes only six coordination/protection/fixture-record files.
  Application, SQL, test and scanner source bytes are unchanged from the application.
- Claude handoff: `51931c28f1f3f1b35008ca514f63bde7999713ef`; runtime
  `f8f6a4bc0eec841f469cb94bc8c608697b0bba67`. Earlier c29/246 deltas were already
  integrated. The newer contact-surface corrections were integrated selectively;
  no wholesale merge replaced native browser restrictions or approved fixtures.

## Implemented corrections

- Native durable checkout composition and guarded server mount; disabled provider
  and notification defaults remain intact.
- Native owned-process/browser qualification, strict observation projections,
  translated signed webhook fixtures, stable redelivery bytes and approved seed
  requirements. Empty success, malformed execution rows and non-2xx success
  payloads fail closed. Cancellation reasons and owner-existence assertions survive.
- A lost execution-create response now re-reads durable authority before any
  compensation. Potentially committed orders/holds are preserved; only a proven
  different winner permits compensation of the losing order.
- Credit expiry read fidelity is preserved. New durable expiring-credit writes
  remain refused until expiry-allocated spending is qualified.
- Exact SQL pre/postcheck and rehearsal defects corrected without changing either
  candidate migration body. A disposable local SQL runner retains negative controls.

## Actual qualification results

| Check | Actual result and source |
| --- | --- |
| Full Vitest suite | At application 2578d9c: 16,455 passed, 59 skipped, 2 failed; exit 1. This run remains failed in the record. |
| Isolated failing guard files | Unchanged application: 52 passed, 1 failed. Pgcrypto passed unchanged; server/index seam baseline still failed. |
| Reviewed seam correction | Exact server/index LF hash re-pinned in separate commit 0f4c539 after independent acceptance. No guard/test weakened. |
| Affected guard rerun | At evidence 13b78ae: 53 passed, 0 failed, 0 skipped; exit 0. |
| Selective Claude integration | 77 passed, 0 failed; three suites. |
| Uncertain-create regressions | Before: 12 passed, 3 failed. After: 34 passed, 0 failed across submission and executor suites. |
| Restricted expiry fidelity | 35 passed, 0 failed. This does not enable expiry-aware spending. |
| Typecheck | Pinned Node 20.19.0, TypeScript 5.6.3: exit 0. Runtime source matches 2578d9c. |
| Production build | At evidence 13b78ae: exit 0, 2,299 client modules. Existing chunk warnings retained. No qualification control markers found in built server output. |
| Native Node/browser boundaries | At evidence 13b78ae: 79 passed, 0 failed, 0 skipped. Real Chrome against local synthetic documents; not provider authentication. |
| Disposable SQL | At evidence 13b78ae: 23/23 passed, all eight SQL files and 11 negative controls. PGlite 0.5.8 / PostgreSQL 18.3, one connection only. |
| Route census | 440 registrations / 431 call sites; accepted. |
| Core-site protection CLI | Base ff3c496 to evidence 13b78ae: PASS; 28 protected hashes verified. |
| Strict scan, original | At application 2578d9c: exit 1; 105 raw matches, 102 reviewed, 3 unresolved, 0 bounded name-list matches. |
| Strict scan, reviewed successor | Base ff3c496 to evidence 13b78ae: exit 0; 80,146 added lines / 439 files; 105 raw and reviewed fixtures, 0 unresolved, 0 bounded name-list matches. |

The full-suite pgcrypto failure lasted 6,263 ms and did not reproduce in isolation.
The record does not infer a definitive environmental cause or relabel that failed
run as a clean full suite. Subsequent checks are recorded separately.

## Independent acceptance

- `/root/native_finish_review`: bounded four-file contact-surface integration
  accepted at 2026-09-10 19:26:47 UTC. Both connected-journey files match the
  reviewed Claude runtime bytes; native fixtures/browser restrictions remain.
- `/root/product_review_filters`: new three synthetic contexts accepted at
  2026-09-10T19:27:30.695Z; unchanged historical 102 contexts and all 20 file hashes
  accepted at 2026-09-10T19:31:55.623Z. Actual imported artifacts at 13b78ae accepted
  at 2026-09-10T19:44:49.220Z. No historical finding was rewritten or deleted.
- `/root/product_review_filters`: three SQL checker/rehearsal corrections accepted
  at 2026-09-10T19:39:14.437Z. Managed compatibility/concurrency remain unverified.
- `/root/native_finish_review`: server/index seam accepted, exactly three added
  lines and no removals from preserved A parent 27f84b2c. Canonical guards and all
  previous bootstrap/routing bytes/order remain. See the separate protection pin.
- Main independently reviewed the delegated SQL runner and executed it; its author
  did not issue independent acceptance of that implementation.

## Scan and migration identities

The approved V3 stays outside Git and unchanged: SHA-256
`27fb9d7052867808f8cee5f3147fa34855fad0d893a6a14508b9212198ce4fbb`, 131 bytes,
13 entries, six eligible and seven ignored. Incomplete historical/team coverage
and unverified handwritten-name completeness remain explicit limitations.

New exact fixture registry LF SHA-256:
`400402bcd25d2233d9b1e618b2464a9f1d724a44b95267b609e910bcfd476da3`.
Context LF SHA-256:
`8649f31c86bd250b1ffc1d7ef49186969ae936f0ffec83452c43743f75c5e1b2`.
The historical 20260907 registry/context are preserved unchanged.

Unapplied candidate migration LF SHA-256 values:

- Checkout executions: `5f3178756d017ab11d939c171d379ef153f1ae72791611f087e3c546518d6bfd`.
- Recovery discovery: `c63563dc5e378e95d35f70f3f99acf966ab74c4019edcb7f7dfa82872bf383ba`.

These hashes are preparation identities, not authorization to apply SQL.

## Precise blockers and next work

1. Staging `tetynodzrtmdbuzgboro` is ACTIVE_HEALTHY (PostgreSQL 17.6.1.147), but
   an actual supported read-only `select 1` still returned connection timeout at
   this checkpoint. Earlier project-bound REST reads also timed out. Gateway
   reachability is not database access. Do not restore/reset or infer schema state.
2. A restricted approved test-mode Stripe credential file and the exact checkout
   fixture/effect authorization have not been established. Do not paste keys into
   chat, use live keys, reuse unrelated Resource Hub effects, or fall back to production.
3. Next implementation: member-serialized credit reservation before provider
   authorization, exact capture/debit settlement and cancellation release. Existing
   capture debit alone does not prevent two orders spending one balance.
4. Complete ledger aggregation, credit consent/policy binding, credit refund and
   fully credit-funded checkout, recovery checkpoint/operator persistence and
   receipt reconciliation composition remain separate unfinished requirements.
   No expiry/refund business policy is invented and no payment readiness is claimed.
5. Managed browser/provider/database and independent multi-connection qualification,
   exact deployment/activation authority, and live observation still remain.

The next owner is this integration session. Workers remain bounded subordinate
reviewers; Claude is optional. Continue implementation without repeating the
completed source/fixture search or staging restoration.
