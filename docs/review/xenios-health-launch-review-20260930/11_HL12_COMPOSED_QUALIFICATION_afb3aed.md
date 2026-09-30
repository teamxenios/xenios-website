# HL-12 composed qualification (disposable) and a new P1: PostgREST retry loop on `40001`

**Classification.** Claude, review-only, 2026-09-30 13:40-14:15 CT. Everything here is **local and disposable**:
- It is not managed staging.
- It is not production qualification.
- Nothing hosted was read or changed.

## Subject

- Codex successor tip `afb3aedfd31f91107e91260c652bfc5669a01633`.
- Application runtime `c9d638a`. The assisted-order code and SQL are unchanged since `c213707`.
- The harness imports the application from `C:/xenios-wt/closeout-review` at `c9d638a`.

## Exact SQL bytes applied

Canonical LF bytes were extracted with `git show afb3aed:<path>`, not from the CRLF checkout.

| # | Path | Git blob | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql` | `26e099ef3763467581d39beba2ac24e9057a2ede` | 1,267 | `7c1d1da7cac376528d4fc995241595fc4e9430821a009a97a7abdec2bff7b938` |
| 2 | `supabase/migrations/20260815150000_research_assisted_order_bridge.sql` (M71) | `edd6060e81cc891f84724e30a9f70f1fab65af3c` | 48,280 | `3e59df2650dedb1d13dbe604c57ae35c0de9e28409c06cd41332b8ae9020d8d7` |
| 3 | `supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql` | `c4a30f96b674f0e9cf7697c0de422c9963aa6c70` | 18,816 | `f9ab3892560bf5002417b3302919367d400971253ac8455a16e310b041403fda` |
| 4 | `supabase/candidates/20260921_research_assisted_order_member_history.sql` (recorded as applied in managed history) | `a4c7cfec242eee332e9c8fe1b743c363159abac6` | 11,319 | `c0ae0cf3f737cc32163fe06984688fd640043f15d7511205caa574f3a3409a7e` |

The M71 identity equals the one in Codex's 2026-09-29 handoff.

## Environment

- **Database:** image `public.ecr.aws/supabase/postgres:17.6.1.171`, `PostgreSQL 17.6 on x86_64-pc-linux-gnu`.
- **Roles, as seeded by the image:**

  | Role | `rolsuper` | `rolbypassrls` |
  | --- | --- | --- |
  | `service_role` | f | **t** |
  | `postgres` | f | t |
  | `anon`, `authenticated` | f | f |

  `authenticator` is NOINHERIT and a member of `anon`, `authenticated` and `service_role`.
- **API:** `public.ecr.aws/supabase/postgrest:v14.13`, connecting as `authenticator`. It switches role from an HS256
  JWT, as managed Supabase does. Its schema cache holds 5 relations and 15 RPCs.
- **Effective privilege:** `research_assisted_order_set_status` is EXECUTE to `service_role` only. Direct PostgREST
  calls as `anon` and as `authenticated` are refused with **42501**.

## Composed path exercised

The HTTP request goes through:
1. the Express door `PATCH /api/admin/research/assisted-orders/:requestId/status` (the real route table and
   `assistedOrderExpressHandler`);
2. `createAssistedOrderProductionComposition` and `AssistedOrderService.updateStatus`;
3. `SupabaseAssistedOrderRepository`;
4. `@supabase/postgrest-js` 2.108.2 with a `service_role` JWT;
5. PostgREST;
6. `research_assisted_order_set_status`.

**Substitutions:**
- `requireSupabaseAdmin` is replaced by a header stand-in (GoTrue is not composed).
- The outbox and audit are in-memory captures.

Requests are seeded through the real `research_assisted_order_submit` RPC.

## Results: `afb3aed`, clean database

| Case | HTTP result | Stored fact | Required for HL-12 close |
| --- | --- | --- | --- |
| P0 legitimate walk to `payment_review` | 200 each step | ok | same |
| C1 `paid` with verification id `"x"` | **200 paid** | event evidence `{"paymentVerificationId":"x"}` | refused |
| C2 whitespace verification id | **500 `assisted_order_unavailable`**. The TS check passes `"   "`, SQL raises 23514, and the error is mapped to a generic 500. | not paid | a 4xx validation error, with TS/SQL parity |
| C3 `verifiedAmountCents: 1` against a 10,000¢ request | **200 paid** | evidence stored verbatim, including `verifiedAmountCents: 1`, and never compared | refused |
| C4 `currency: "EUR"` on a USD request | **200 paid** | stored verbatim | refused |
| C6 one verification id reused on two orders | **200, 200** | both paid | the second is refused |
| C7 replay of `paid` | 409 `invalid_status_transition` | ok | same |
| C8 `paid` → `cancelled` with a reason only | **200 cancelled** | no refund or reversal evidence | refund or reversal evidence required |
| C9 two concurrent verifiers | 200 plus a **hang** (see P1 below) | one paid | 200 plus 409 |
| C10 no admin (stand-in) | 401 | ok | same |
| C11 body injects `actorId` / `actorType` / `expectedStatus` | 200 paid | recorded actor is the server admin label (`founder@example.invalid`); the injection was ignored | same |
| C12 skip `reviewing` → `paid` | 409 | ok | same |
| C13 direct PostgREST `set_status` as `anon` / `authenticated` | 42501 | ok | same |
| Amount columns | only `estimated_total_cents`, `currency` | no quote, verified amount or verification record | present and constrained |

**HL-12 remains FAIL** on the composed application plus effective SQL, not only the in-memory service.

## NEW P1 (HL-26): PostgREST automatically retries `40001`, and these functions raise `40001` for deterministic refusals, so the retry never ends

**Evidence (disposable, PostgREST v14.13):**
- **Concurrent verifiers, 15 pairs through the composed HTTP path:** 5 pairs answered 200 + 409. In **10 pairs the
  losing request never answered** (20-second client timeout).
- **Database counters during the hang:** `pg_stat_database.xact_rollback` climbed about **6,400 per second**
  (999,923 → 1,032,089 in 5 s), with PostgREST at about 200% CPU and Postgres at about 400% CPU. It **kept looping
  after the client disconnected**. Only restarting PostgREST stopped it (0 rollbacks per 5 s afterwards).
- **Deterministic trigger, no race needed:** a single `POST /rpc/research_assisted_order_document_complete` for a
  document that is not `upload_pending` produced **8,038 rollbacks during a 10-second call**, then **4,909 more in
  the 5 seconds after the client gave up**. It stopped only on restart.

**Seams:**
- `20260815150000_research_assisted_order_bridge.sql`:
  - `research_assisted_order_set_status` raises `40001` "status changed concurrently" (line 948).
  - `research_assisted_order_document_complete` raises `40001` "document upload state changed or was not found"
    (line 1034).
  - Both are re-raised on every retry because the precondition is permanently false.
- **Customer reachability:** `server/research/assisted-order/service.ts:995-1053` (`completeDocumentUpload`) checks
  that the document exists but **not** that it is still `upload_pending` before calling `completeDocument`. A
  customer's double submit, or a retry after a slow response, on
  `POST /api/research/early-access/assisted-orders/:requestId/documents/:documentId/complete`
  (`server/index.ts:1045`) triggers the loop.
- **Other `40001` raisers checked:** `research_early_access_commit_settlement`
  (`20260804121000_research_early_access_commerce_persistence.sql:920`) raises `serialization_failure` only in a
  narrow race. A retry reaches its earlier "reference already claimed" check and returns a normal refusal, so a
  permanent loop is **not expected**. That was not tested.

**Consequence:** each occurrence pins one PostgREST pool connection and burns database CPU indefinitely. A few
repeats, from customer double-clicks or two operators verifying the same payment, could exhaust the pool and take
down every Supabase-backed API on the project. The request that triggered it hangs until the gateway times out.

**Scope limit:** reproduced on PostgREST v14.13 against Supabase Postgres 17.6.1.171, locally. The managed project's
PostgREST version and retry configuration were **not observed**. Production is unaffected until the bridge path is
exercised this way, but the bridge is recorded as enabled in production.

**Smallest correction (source; the managed migration needs separate authorization):**
1. In a forward migration, raise a **non-retryable** SQLSTATE for deterministic refusals, for example `P0001` with a
   distinct message or code, or `55000`, instead of `40001`. Reserve `40001` for genuine serialization failures that
   a retry can resolve.
2. Map that code to 409 in `SupabaseAssistedOrderRepository.fail` (`supabase-repository.ts:228-251`).
3. In `completeDocumentUpload`, return idempotent success, or 409, when the document is already `uploaded`.
4. **HL-12 design rule:** the new quote and payment-verification RPCs must follow the same rule, with no `40001` for
   stale-state or compare-and-set refusals.
5. **Regression test:** a disposable PostgREST run asserting that a stale compare-and-set and a duplicate completion
   each return a 409 in under 2 seconds, with `xact_rollback` delta ≤ 2.

## Artifacts

Committed under `sql/composed/`:
- `hl12-app-probe.mts` and `hl12-c9-stress.mts` (harnesses)
- `reset-infra.sh` (disposable PG and PostgREST setup)
- `BYTES.txt` (exact SQL identities)
- `hl12-app-probe_afb3aed.out` (case output)

The JWT secret is generated locally per run and is not committed. `sql/hl12_probe.sql` (the earlier direct-SQL run) remains the SQL-only specification.
