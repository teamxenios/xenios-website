# Claude independent review: successor `fe45550`, and the HL-12 SQL authority addendum

## Identity

- **Core successor reviewed:** `fe455502436ea59e2913502b165dcebf11d93283`, tree
  `3057fd928e37ee68adfc37edeee4271cb5d63ab4`. This is also the branch tip at fetch (19:2x CT); there are no records
  commits after it.
- **Delta from `3775557`:**

  | Commit | Kind | Content |
  | --- | --- | --- |
  | `c042599` | runtime | Adds `server/research/assisted-order/payment/provider-adapter.ts` and its test: an unmounted, processor-neutral contract. |
  | `fe45550` | runtime | `server/research/early-access/private-access-routes.ts`: a rolling-window limit on open-access session minting, plus a test. |

- **No change** to SQL, migrations, `finance.ts`, `service.ts`, status copy, the gateway, `server/index.ts` or
  `server/routes.ts`.
- **Tests at `fe45550`:** `server/research/assisted-order/payment` and `server/research/early-access`. Run on
  pinned Node 20.19.0, single worker: **163 files, 2,540 passed, 25 skipped, 0 failed.**

## F1–F10 at `fe45550`

Every one is still **OPEN**, and the evidence in `19_*` still applies, because none of the files involved changed:

| Id | Severity |
| --- | --- |
| F1 | P1 |
| F2 | P1 |
| F3 | P2 |
| F4 | P2 |
| F5 | P2 |
| F6 | P2 |
| F7 | P2 |
| F8 | P3 |
| F9 | P3 |
| F10 | P2 |

The protected-file disposition is unchanged: **PASS on review**, with the owner-authorized repin still pending, and
the gate stays red.

## New executed findings (disposable PG 17.6.1.171 with exact bytes; SQL in `sql/composed/sql01_auth01_probe.sql`)

### HL12-SQL-01 · P1 · A `service_role` caller can mark an order `paid` with invented provider identities

**Setup.** One guest request with an accepted quote (10,000¢). Every call was made as `service_role`, and **0
verifier grants** existed.

**What was run:**

```sql
select public.research_assisted_order_payment_observe(R, Q, 'provider', 10000, 'USD',
  'pi_forged_by_claude', 'no-real-evidence', now(), null,
  'anything', 'evt_forged_by_claude', 'pi_forged_by_claude');
select public.research_assisted_order_payment_verify_bound(R, <obs>, null);
```

**Result.** The observe call recorded `observed_by = provider:anything`. The verify call returned `{"state":"paid"}`,
and the request status is now `paid`, with 1 verification.

**Source.** The provider branch of `payment_observe` (`202413:483-490`) requires only non-empty strings. The
provider branch of `verify` (`:642-648`) requires only that the verifier is NULL.

**Reachability.** There is no provider route at `fe45550`, so HTTP cannot reach this. Any holder of `service_role`
can: the server, scripts and admin tooling. The new `provider-adapter.ts` does not close it. That module states
the SQL "remains authoritative", and it defines an `AssistedProviderEventAuthority` that has no SQL implementation,
no attempt table and no event table.

**Documentation error.** The migration header (`202413:1-3`) says the paid hold "remains in force". In fact the
file replaces `paid_hold_guard`.

**Correction:**
1. Until a provider attempt authority exists in SQL, `payment_observe` must refuse `p_method = 'provider'` with a
   stable P0001 detail such as `PROVIDER_AUTHORITY_NOT_READY`.
2. When it lands, add a server-created payment-attempt table: request, quote, version, acceptance, amount,
   currency, provider, account, mode, and a unique provider payment id. A provider observation must then match an
   attempt row, and only `captured` may qualify.
3. Fix the header.
4. Add a proof run under `SET ROLE service_role`.

### AUTH-01 · P2 · `quote_accept` accepts on NULL authorization

**Setup.** A guest request whose `actor_member_id` is NULL.

**Result.**
- **Control:** a wrong session hash is refused (NULL result).
- **The bug:** an unrelated member id, with no session and no token, returned `acceptanceId …`, and the quote is
  now `accepted`.

**Source.** `202413:385-392`: `if not v_authorized`, where `true and NULL` evaluates to NULL. This is the same
three-valued-logic bug that was fixed in managed history on 2026-09-21. `quote_get` (`205725:26`) uses `coalesce`
correctly. Over HTTP the path is gated only because `finance.ts:149` calls `getQuote` first.

**Correction:** use `if v_authorized is not true then return null; end if;` and add NULL-owner and NULL-session
proof cases.

## Source-verified SQL and rollout items (not previously sent; the review ran at `7600943`, and the SQL is byte-identical at `fe45550`)

| Id | Sev | Finding | Smallest correction |
| --- | --- | --- | --- |
| HIST-02 | P2 | Requests already in `payment_pending`/`payment_review` can never be quoted: `quote_issue` admits only pre-payment statuses (`202413:269-274`), and nothing leads back. Nothing requires an accepted quote before `payment_pending` (SQL-07). | Require an accepted quote for the governed `payment_pending` transition. Allow a re-quote with supersede from `payment_*`. Include existing `payment_*` rows in the preflight. |
| SQL-06 | P2 | The quotes table has no UPDATE/DELETE immutability trigger. Accepted-quote immutability rests on RPC discipline. | Add a BEFORE UPDATE OR DELETE trigger that allows only `issued`→`superseded`/`accepted`. |
| SQL-09 | P2 | `quote_issue` has no quantity floor (`:315-319`). The bridge permits `minimum_quantity <= 0`. | Refuse `quantity <= 0` with a stable detail. Forward CHECK `>= 1`. |
| SQL-03b | P2 | Currency is not normalized at observe: any 3-10 character string is accepted (`:83`), and it is consumed before comparison. | `upper(btrim())` plus CHECK `^[A-Z]{3}$`. Compare with the quote before consuming the reference. This combines with the F3 supersede. |
| SQL-02b | P2 | Observations are accepted on `cancelled`/`closed` requests (`:167-181`). | Refuse observe outside `payment_pending`/`payment_review`, or store it for review. |
| CANC-01 | P2 | M82 newly refuses `supplier_processing`→`cancelled`. The app still offers it and returns 500 (F8). | Map all M82 details to 409. Refuse it in the service, and hide it in the UI. |
| SQL-08 | P2 | The verification stores label text only: labels are not unique, grants are mutable, and there is no verifier UUID or idempotency key. | Store observer and verifier auth UUIDs, keep an append-only grant ledger, and resolve F9 explicitly. |
| ROLL-01/02/03 | P2 | No rollback runbook. The DAG `rollback.procedure` points at a handoff and a proof. M82 does not assert M81's trigger. No written app-first rollout order. | Runbook: flag off, then preflight counts, then roll back only by re-applying the M81 hold body; never drop financial rows. M82 preflight asserts the trigger and the P0001 `set_status`. Write an exact-SHA rollout for the candidate. |
| SQL-10 | P3 | `verify_bound` with a NULL request id skips the binding (`205725:68`). HTTP forbids NULL. | Use `is distinct from`. |
| SQL-11 / ROLL-04 | P3 | M83 has no begin/commit, `lock_timeout` or preflight. Re-applying 202413 re-grants the unbound verify. | Wrap M83 and move the revoke into M82's postcondition. |
| SQL-12/13 | P3 | Raises without a detail code. A concurrent identical observe gives 23505 rather than a replay. Accept ignores request status. No withdraw path for an accepted, unpaid quote. | Add stable details, an `on conflict` re-read, a status check in accept, and a governed withdraw. |
| REG-01 | P3 | The DAG CLI never lists `supabase/migrations/`. | Enumerate the committed files. |
| SQL-14 / TEST-01 | P3 | The local proofs run as superuser with `when others` catches. The already-paid and cancel paths are untested. | Run under `SET ROLE service_role`, catch specific SQLSTATE and detail, and add the cases. |

## `c042599` provider adapter boundary (unmounted): the direction is right; it is not yet an authority

**Pass notes:**
- Processor-neutral, with no SDK or provider default.
- `null` adapter or authority → `unavailable`.
- Scope (provider, account, mode) is compared.
- An interrupted create is `creation_uncertain`, never "no money".
- Payment identity is allowlisted after authentication, and client secrets are kept out of persistence.
- `eventKey` is kept separate from `payloadFingerprint`.

**Latent findings, to fix before any adapter is mounted:**

| Id | Sev | Finding | Correction |
| --- | --- | --- | --- |
| ADP-01 | P2 | An **authenticated** event that fails binding is discarded with no durable record. That covers a captured amount different from the quote, a different quote or acceptance, an unknown attempt, and `binding_mismatch`/`invalid_event`. Money can arrive with no operator-visible trace. The caller must also choose the attempt before authenticating, which forces an unauthenticated lookup. | Authenticate first, then resolve the attempt from the authenticated payment id. Commit authenticated but unmatched facts to a durable quarantine with an operator action, and only then return a refusal. |
| ADP-02 | P3 | `retrieveAttempt` admits only `pending`/`authorized`, so an attempt that is already captured returns `binding_mismatch`. | Let retrieve report `captured` as a non-settling state. Settlement still comes only from events. |

## `fe45550` open-access mint window: a regression in availability

| Id | Sev | Finding | Correction |
| --- | --- | --- | --- |
| EA-01 | P2 | `createOpenAccessMintLimiter` never evicts an active key. At `maxKeys` (10,000), **every new client is refused** until entries age out: defaults are 8 mints per 15 min, and the key is the IP. That needs only 10,000 distinct IPs with **one** mint each. The replaced policy evicted non-locked entries, so exhaustion needed 10,000 locked keys (80,000 mints). A launch-day spike or IPv6 rotation locks out the anonymous storefront entry. The test at `open-access-window.test.ts:72` encodes this behavior. | At capacity, evict the entry with the oldest last attempt among keys **below** `maxMints`. Refuse only when every tracked key is exhausted. An exhausted budget is still never erased. Adjust the test accordingly. |

## Disposition at `fe45550`

| Area | Disposition |
| --- | --- |
| Shared SQL invariants | PASS for the covered manual cases. **FAIL** on the provider path (SQL-01, P1) and on NULL authorization at accept (AUTH-01, P2). |
| Mounted manual workflow | FAIL: F1 and F2 (P1), plus F10 |
| Card adapter | A contract only, unmounted and processor-neutral, with no SQL authority. The processor choice is deferred by the founder and is **not** a blocker. |
| Historical and cancellation handling | PARTIAL. No preflight, runbook or rollback: ROLL-01/03, HIST-02, F6, CANC-01. |
| Status consistency | FAIL: F7 |
| Protected files | PASS on review; the owner repin is pending |
| Production promotion | **NOT READY**. Open P1s: F1, F2, SQL-01, plus the protected gate. |
