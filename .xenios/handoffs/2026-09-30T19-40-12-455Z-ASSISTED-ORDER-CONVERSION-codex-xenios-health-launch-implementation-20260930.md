# Xenios Health HL-12 partial source handoff

Branch: `codex/xenios-health-launch-implementation-20260930`  
Current source commit: `f318859262812b8fc1fcb6d2c8e697d86a209349`  
Current source tree: `d97f11fbb206de04f1a578fcb4a09f56f03ae167`  
Records tip before this handoff: `d253e70f14e0b0bb6882e65a93def45a8c0bdba8`

This is **not HL-12 completion**. The mounted paid path previously accepted a free-text verification ID. It now fails closed in the application and in a separate pending SQL trigger candidate. The admin form no longer offers a paid option until a real authority is mounted. Existing historical paid labels cannot drive fulfillment or cancellation through this bridge without that authority. Both new migrations are PENDING, source-only and not applied to managed staging or production.

## Coherent changes

- `3e47f92974d90c2a5d16903b0f72ef844519e131`: Claude's Care-price coverage failure corrected without discarding Product Control authority. Real catalog: 175 Research displayed numeric, 242 intentionally withheld Care numeric, 2 genuine quote-only; FedEx exclusion by GRP-0364 identity. Exact handoff at `server/research/master-offerings/HEALTH_CATALOG_REVIEW_RESPONSE_20260930.md`.
- `084063ac424a4c2ec55183c004c420aba43a3ba0`: HL-26 deterministic `40001` retry-loop correction in mounted repository and forward SQL. M71 historical bytes preserved. Disposable PostgreSQL/PostgREST 14.13 stale-status and repeat-document calls returned quickly; SQL ACLs remained service-role-only. Source migration SHA-256 `4c4a6b1f59667ced8aeffa9571f6017d3eba9ecf62fd555bec122a3ce8e1a014`.
- `f318859262812b8fc1fcb6d2c8e697d86a209349`: temporary paid hold in mounted service, admin UI, repository error mapping and a second forward SQL trigger. A typed `paymentVerificationId = "x"` cannot assert paid; local SQL left zero paid events. Source migration SHA-256 `2a4ece6bb76e2e912285ae212331987708b44442a81ed66c91140fcb20376845`.
- Records commits registered both pending migrations in the DAG and managed ledger. The DAG accepted 40 nodes and canonical checksums. Neither migration was applied to a managed project.

## Commands and results; do not combine runs

- Catalog first focused attempt: 1 failed assertion / 15 passed; corrected; focused rerun 16/16 passed.
- At catalog source `3e47f92`, real-dataset assisted-order/catalog affected suite: 810 passed, 13 skipped; full one-worker Node `v20.19.0`, npm `10.8.2` run: 18,185 passed, 85 skipped, 987 files passed, 6 skipped, exit 0. This result is **not** the full-suite result for `f318859`.
- HL-26 first focused attempt: 7 failed because the new repeat-completion check was placed in upload creation; corrected; focused rerun 52/52 passed.
- At `f318859`, `vitest run server/research/assisted-order shared/research/assisted-order client/src/research/assisted-order --maxWorkers=1 --no-file-parallelism --testTimeout=120000`: 23 files, 410 tests passed, exit 0.
- At `f318859`, private Node 20.19.0 `npm run check`: PASS; `npm run build`: PASS; source em-dash gate 1,332 files / zero, production-build gate 224 files / zero. Vite emitted import/chunk warnings, not failures.
- Disposable `postgres:17-alpine` plus PostgREST v14.13: both forward candidates applied twice at exit 0. Stale-status and non-pending-document SQL details returned in 89 ms and 8 ms, rollback counter flat; typed-ID paid attempt returned in 115 ms, no paid event. The containers and private networks were removed. The SQL-only PostgREST responses are HTTP 400; the mounted repository maps the exact details to HTTP 409. A fully composed HTTP-to-PostgREST successor regression remains to run.
- Migration DAG check: 40 nodes, canonical checksums verified, exit 0.
- No full suite was rerun at `f318859`; it is required at the next integration boundary, not to reconcile documents.

## Open release-critical work

HL-12 still requires an accepted versioned quote against immutable server-owned line identities, exact total/currency, actual authorized verification record and independently observed amount/reference, durable audit, single-use/replay/concurrency protection, refund/cancellation rules, and separate fulfillment eligibility. The existing pure quote/payment engines are not mounted; SQL has no durable authority for them. No account grant or historical verification should be fabricated. A qualified successor migration must replace the temporary paid hold only when all of those checks pass together.

HL-11 424-variant accounting, exact product details, public journey HL-17/23/24/25, and final release gates remain in queue. Claude's independent review request is in `.xenios/messages/2026-09-30T19-37-41-441Z-codex-xenios-health-launch-implementation-20260930.json`; no review outcome for this source has been received. Do not merge to the production release branch, apply pending migrations, deploy, send real email, handle real money, grant accounts, or perform procurement/clinical actions from this checkpoint.
