# Claude independent review: HL-26 fix (`084063a`, records tip `c2580cd`)

## Identity

- **Runtime and migration commit:** `084063ac424a4c2ec55183c004c420aba43a3ba0`, tree
  `56e083d93f2f2ca08ad80568931ed16973fbb443`.
- **Records tip:** `c2580cd3d155ea078ced806240f5d2bc4f65cbdf`, tree `fa3bda3389a91714c551fc1b64ec75acaa072dae`.
  It registers the pending migration in the DAG and `supabase/MIGRATIONS.md`.
- **Paths:**
  - `supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql`
  - `server/research/assisted-order/supabase-repository.ts`
  - `server/research/assisted-order/service.ts` and `service.test.ts`
- **Migration bytes (canonical LF, `git show c2580cd:`):** blob `3a35b2849fbf901d7ab5a1e8856a75930721b4ff`, 5,581
  bytes, SHA-256 `4c4a6b1f59667ced8aeffa9571f6017d3eba9ecf62fd555bec122a3ce8e1a014`.
- **Reviewed:** 2026-09-30 14:35-14:50 CT.
- **Classification:** local and disposable only. The managed migration was **not applied**.

## What changed

**Migration:**
- `research_assisted_order_set_status` and `research_assisted_order_document_complete` are redefined.
- Only the two deterministic compare-and-set misses change: `40001` becomes `P0001` with
  `detail = ASSISTED_ORDER_STALE_STATUS` or `ASSISTED_ORDER_DOCUMENT_NOT_PENDING`.
- All M71 transition and evidence rules are kept.
- `search_path = ''` is set, with qualified references.
- `service_role`-only EXECUTE is re-asserted, with an explicit revoke from `public`, `anon` and `authenticated`.
- The header states honestly that this does **not** complete HL-12.

**Application:**
- `SupabaseAssistedOrderRepository.fail` maps exactly those `P0001` details to a 409 `AssistedOrderConflictError`.
- `completeDocumentUpload` refuses a non-pending document with a 409, **after** the ownership check, so the
  refusal is not an existence oracle.

## Qualification run by Claude

**Environment:** fresh `supabase/postgres:17.6.1.171` (PostgreSQL 17.6) and `supabase/postgrest:v14.13`. Applied:
the four baseline files recorded in `11_…`, then this migration's canonical bytes. The application is the composed
path at `c2580cd`, as in `11_…`.

**Effective state in the database:**

| Function | `prosecdef` | `proconfig` | `40001` in body | `P0001` in body | Owner | Grants |
| --- | --- | --- | --- | --- | --- | --- |
| `research_assisted_order_set_status` | true | `search_path=""` | none | present | `postgres` | `service_role:EXECUTE` only |
| `research_assisted_order_document_complete` | true | `search_path=""` | none | present | `postgres` | `service_role:EXECUTE` only |

**Results:**

| Check | Before (`afb3aed`) | After (`c2580cd`) |
| --- | --- | --- |
| 15 concurrent verifier pairs, through composed HTTP | 10 losers hung, retry loop | **15/15: 200 + 409 `status_changed`, 0 hangs** |
| `xact_rollback` over the whole stress run | about 6,400 per second, continuing after the client disconnected | **3 total; 0 in the 5 s after** |
| One `document_complete` on a non-pending document (direct PostgREST) | 8,038 rollbacks in 10 s; kept looping after the client gave up | **HTTP 400 in 6 ms, `{"code":"P0001","details":"ASSISTED_ORDER_DOCUMENT_NOT_PENDING"}`; 1 rollback; 0 after** |
| Direct `set_status` as `anon` / `authenticated` | 42501 | 42501 |
| `server/research/assisted-order` (single-worker) | n/a | 15 files, **321 passed** |
| Mutation check: the old repository and service against the new tests | n/a | **2 fail** (the 409 mapping and repeat completion), as they should. Restored clean afterwards. |
| `tsc` | n/a | exit 0 |
| `verify-migration-dag` | n/a | **accepted, 39 nodes, canonical checksums verified** |

## Disposition

**HL-26: PASS in source** (disposable PG 17.6 + PostgREST v14.13).

**Still required:**
- apply this migration, under separate authorization, **after** M71 on the managed target;
- re-run this qualification there;
- confirm the managed PostgREST version.

## Unchanged and still open

- **HL-12 FAIL** (`paid` still accepts `"x"`, 1¢, EUR, and a reused id; `paid` → `cancelled` needs no refund
  evidence). The migration header acknowledges this.
- **P3:** a whitespace-only verification id still returns 500 `assisted_order_unavailable`. The TS check passes it,
  SQL raises 23514, and the error is unmapped.
