# Claude independent review: HL-12 successor `268e691` (handoff runtime `3c897f4`)

## Identity

- **Fetched:** once, 2026-09-30 ~19:05 CT.
- **Branch tip:** `268e691649d4eb363e959d698d9674f171f19a13`, tree `b28cb296dd2fad72cddebb5be31074573775e4b6`.
  This is the newest coherent runtime and the one reviewed.
- **Handoff-frozen runtime:** `3c897f4dc019b6f420aa85da5e0d792814cd801e`, tree
  `70673c588919ca626ce5cb7db4c6984f9e8684d8`. Verified as an ancestor.
- **Records tip:** `d6f99e04f3b9613ea5c309f06e199bb188d05097`.
- **Two runtime commits landed after the records tip**, and no recorded checkpoint covers them (REC-01, P3):
  - `2dc7d62`: the F10 gateway.
  - `268e691`: suppresses legacy payment instructions.
- **Delta from `fe45550`:**

  | Commit | Kind | Content |
  | --- | --- | --- |
  | `a46531b` | schema | Migration 84, `20260930230541_…quote_evidence_corrections.sql`: blob `59cdd7a7`, 26,533 B, sha256 `434885ea…0a66`. This equals the DAG and `MIGRATIONS.md`. |
  | `0065e6c` | runtime | Quote panel, evidence-bound status, verification effects |
  | `4decc9f` | runtime | Decoder hardening |
  | `3c897f4` | runtime | HL-24/25 recovery |
  | `d6f99e0` | records | Handoff, runbook, DAG (43 nodes) and proofs |
  | `2dc7d62` | runtime | F10 gateway |
  | `268e691` | runtime | Status page |

- **Protected files.** `server/routes.ts` = `sha256:7c21ea1a…9137` and `server/index.ts` = `sha256:1d6594d6…c315` at
  `268e691`. Both are byte-identical to the bytes Claude reviewed, and no commit after `fe45550` touches either
  file. **The prior protected-file review (PASS) remains applicable to exactly those two hashes.**

## Method

**Database.** Disposable `supabase/postgres:17.6.1.171` + `postgrest:v14.13`, local only. Exact LF bytes were applied
in this order:
1. bootstrap
2. M71
3. `0820`
4. the `0921` candidate
5. P-17 `20260927203000` (sha `98cce457…`)
6. `191323`
7. `193033`
8. `202413`
9. `205725`
10. `230541`

**Composed path.** The real `registerResearchApi` gateway in **non-public mode**, with no review cookie or bearer,
in front of the real route table. Behind it:
- the production composition;
- `AssistedOrderService` and `AssistedOrderFinanceService`;
- `SupabaseAssistedOrderRepository`;
- the real P-17 `SupabaseStatusRecoveryStore` for `/status`;
- postgrest-js, then PostgREST, then SQL.

**Substitutions:**
- an admin guard stand-in that stamps `adminAuthUserId`;
- a member header stand-in;
- a **synthetic** manual ledger (production composes `null`);
- in-memory outbox and audit sinks that copy production dedupe semantics, with one-shot failure injection;
- verifier grants inserted by SQL.

**Scripts and outputs** (in `sql/composed/`):
- `hl12-successor-probe.mts` → `successor_268e691.out` (56 cases);
- `hl12-successor-extra.mts` → `successor_extra_268e691.out` (6 cases);
- `reapply_regression.sql`.

**Source review.** Five read-only lenses: SQL, TS service, status surfaces, gateway/journey, and ops. Each P0–P2
claim got one adversarial skeptic. Results are in `hl12/268e691_lens_findings.json`.

## Executed results against the prior findings

| Id | Status | Executed evidence |
| --- | --- | --- |
| **F1** | **OPEN (P1)** | `server/index.ts` is unchanged and still composes `AssistedOrderFinanceService(getSupabaseAdmin(), null)`. Observe, correct and verify all refuse with `manual_evidence_unavailable`. Grants are still created only by SQL insert. |
| **F2** | **CLOSED** | S7: verified paid → `supplier_processing` over HTTP returns **200**. H1: historical paid → `supplier_processing` returns **409** `payment_verification_not_ready`, and SQL returns `HISTORICAL_PAID_UNRESOLVED`. H1c: historical paid → cancelled returns 409. **Limit:** the "supplier-assignment gate" is only a free-text `supplierAssignmentId`. |
| **F3** | **CLOSED for replacement; void missing → N2 (P2)** | See the F3 detail below. |
| **F4** | **PARTIAL (P2)** | See the F4 detail below. |
| **F5** | **CLOSED for exact evidence**, with P3 residuals | F5-a: the second order over HTTP (with a permissive ledger) returns **409** `payment_evidence_reused`. F5-b: SQL alone refuses, `EVIDENCE_REUSED`. F5-c: the whitespace-padded variant is refused. Residuals are below. |
| **F6** | **CLOSED (fail-closed)** | C2: `payment_review` with an observation → cancel over HTTP returns **409** `financial_resolution_required`, and SQL returns `REFUND_AUTHORITY_NOT_READY`. C2c: an observation recorded while still `reviewing` → cancel returns 409. C3/C3b: verified paid or `supplier_processing` → cancel returns 409. C1: `payment_pending` with no money → cancel returns 200. **Liveness gap:** there is no governed no-funds, void or refund exit, so an order with any observation can never be cancelled (N2). |
| **F7** | **PARTIAL (P2)** | See the F7 detail below. |
| **F8** | **PARTIAL (P3)** | All set-status financial refusals now return 409 (C2, C3, H1). These still return **500**: F3-g, a 2-character `correctionReason` (SQL CHECK, 23514); X2, an uppercase request UUID in the verify path, **after `paid` committed**; X4, see ROLL-06. |
| **F9** | **OPEN (policy), unchanged** | A different granted admin verifying returns 403. The rule is tightened from a label to a UUID, not silently changed, and the handoff discloses it. This remains the founder's decision. |
| **F10** | **CLOSED** | Through the real gateway in non-public mode, with no review credential: owner GET quote 200, status-token GET 200, owner accept 200; foreign member GET/accept 404, no credential 404. Lookalikes are **walled (401)**: trailing slash, lowercase reference, `/QUOTE`, `//quote`, `%2Fquote`, POST `/quote`, GET `/quote/accept`, `/quote/accept/x`, `/quote/accept/`, PUT. |
| **AUTH-01** | **CLOSED at `230541`**, with a re-apply caveat | An unrelated member on a NULL-owner guest request now gets NULL (refused), and the quote stays `issued`. A wrong session is refused. The owner session is accepted. HTTP returns 404. **ROLL-05:** re-applying `202413` after `230541` brings the bug back (executed). |
| **SQL-01** | **OPEN (P1)** | See the SQL-01 detail below. |
| **ADP-01** | **OPEN (P2, latent)** | `provider-adapter.ts` is byte-identical to `c042599`. Authenticated but unbound or wrong-amount events still return a refusal code with no durable inbox or quarantine. |

### F3 detail

**Executed:**
- **F3-a:** a 9,999¢ observation → verify returns 409 `payment_mismatch` → the governed correction returns 201
  (`supersedes` set).
- **F3-b:** an identical correction replay returns `replayed:true`. A changed reason returns 409.
- **F3-c:** verifying the superseded observation returns 409. Verifying the replacement returns 200 `paid`.
  Result: 1/1, with history of 2 observations and 1 correction.
- **F3-d:** correcting a **verified** observation returns 409.
- **F3-e / F3-f:** an owner-role UPDATE of an observation, or DELETE of a correction, is refused:
  `FINANCIAL_EVIDENCE_IMMUTABLE`.
- **N22:** a concurrent verify and correction gives exactly one winner (1/1).

**Remaining gaps:**
- There is no void or no-funds outcome (N2).
- Correction requires the original observer UUID with an active grant (N3).
- A claim created by a mis-assigned evidence reference survives correction and permanently blocks the rightful
  order (F5-f, executed).

### F4 detail

**Executed:**
- **S5:** verify gives **1 outbox intent** (stable `dedupeKey` per verification) and **1 audit record** (eventId =
  verificationId).
- **S6/S8/N20:** replays and concurrent verifies add none.
- **I1:** an outbox outage after the paid commit returns **503** `payment_verification_effects_pending`, with `paid`
  1/1, outbox 0, audit 1.
- **I2:** an admin retry repairs it to exactly 1/1.
- **I3/I4:** the same holds for an audit outage.

**Not proven:**
- **X3:** if the observer's grant is revoked after an interruption, the retry by the observer returns 403 and by
  another admin returns 403. The notification is **permanently lost**: outbox 0.
- There is no durable pending-effects record and no reconciler.
- **X2:** an uppercase request id commits `paid`, then returns 500 on every retry with that id.
- Production audit is still `log_line_nondurable` unless the 20260828 audit-store candidate is applied and
  enabled. A log line is **not durable audit**, and nothing stops finance being enabled while audit is non-durable
  (NEW-5).

### F5 residuals (P3)

- **F5-d / F5-e:** a lowercase or internal-whitespace variant of the same evidence is **ACCEPTED** on another order.
- Manual and provider namespaces are separate.
- **F5-f:** a claim from a corrected mis-assignment is permanent.

### F7 detail

**Executed:**
- **F7-a/b/c/e:** both surfaces agree, and both derive from `financial_state`:
  - verified paid → "Payment verified" on the page, in `/status` and in the notification;
  - historical paid → "Payment record under review" on both, with no notification.
- The legacy `actionRequired` text is suppressed for financial statuses.

**F7-R1 (P2) remains:**
- **F7-d:** after a **verified** order moves to `supplier_processing`, both surfaces relabel its timeline "paid" entry
  as **"Payment record under review / Contact Support before relying on this payment record"**. The customer's email
  says "Payment verified".
- The cause: `paymentVerified` is read only while the current status is `paid` (`supabase-repository.ts:372`,
  `supabase-store.ts:113`).
- **SQL-01 cascade:** the forged provider payment renders **"Payment verified"** on both customer surfaces.

### SQL-01 detail

**Executed:** as `service_role`, with zero grants involved:

```sql
payment_observe(..., 'provider', 10000, 'USD', 'pi_forged_by_claude_2', 'no-real-evidence', now(), null,
                'anything', 'evt_forged_by_claude_2', 'pi_forged_by_claude_2')
```

then `verify_bound(R, obs, null)` → `{"state":"paid","verifiedBy":"provider:anything"}`, and the request is now
`paid`. **No attempt, provider-event, inbox or quarantine table exists.** Both customer surfaces then say "Payment
verified".

**Source.** `230541` rewrote `payment_observe` and left the provider branch as non-blank strings only
(`230541:177-184`). The handoff discloses this honestly ("must not be … used as the final provider authority"), but
the database still accepts it.

## New findings at `268e691`

Severities are after adversarial verification. "Executed" means reproduced on the disposable stack. "Source"
means a code citation only.

### P2

| Id | Basis | Finding | Smallest correction |
| --- | --- | --- | --- |
| **F7-R1** | Executed (F7-d); verifier CONFIRMED | Once a **verified** order moves past `paid`, both customer surfaces show its "paid" timeline entry as "Payment record under review / Contact Support before relying on this payment record". The customer was emailed "Payment verified". | Read the financial state whenever the timeline contains a `paid` event (any current status ≥ `paid`), on the status page, `/status` and account history. |
| **HIST-PROG** | Executed (X1); verifier CONFIRMED | A historical order that went through an **unverified** `paid` and is now `supplier_processing` can be shipped (200) and delivered (200) with 0 verifications. The hold covers only rows whose *current* status is `paid`, so the handoff's "historical labels remain held" overstates it. | Hold further transitions for rows that have a `paid` event but no verification, or record an explicit founder-approved legacy disposition. Count these rows in the preflight. |
| **N2** | Source plus C2; verifier CONFIRMED | Any observation, including a superseded, mismatched or provider one, blocks cancellation **forever**. There is no governed no-funds, void or refund resolution, so such an order can be neither paid nor cancelled. This is the missing "void" half of F3. | Add a governed `no_funds`/`void` resolution record (evidence, actor UUID, reason) that the cancel guard accepts. Observations stay immutable. |
| **F4** (residual) | Executed (I1-I4, X2, X3) | Effects are repaired only by an explicit verify retry from the same observer, with an active grant and a configured manual authority. There is no durable "effects pending" record and no reconciler. The production baseline audit is `log_line_nondurable`, which is not durable audit, and nothing stops finance being enabled with non-durable audit. | Write an effects-pending row in the verify transaction. Repair it through a service reconciler, or through any granted admin without re-verifying. Require durable audit before the finance flag can be enabled. Normalize UUID case. |
| **ADP-01** | Source (latent, unmounted) | Authenticated but unbound provider events still disappear. | A durable quarantine inbox before any provider ingress is mounted. |
| HIST-02, SQL-06 | Source, unchanged | `payment_*` rows cannot be quoted. There is no quote immutability trigger. | As sent previously. |

### P3

| Id | Basis | Finding | Correction |
| --- | --- | --- | --- |
| ROLL-05 | Executed | Re-applying `202413` after `230541` exits 0 and reverts three things: `quote_accept` returns to the NULL-authorization version (AUTH-01 is back), `service_role` regains EXECUTE on the unbound `payment_verify`, and manual verify loses its UUID binding. | `202413` preflight refuses if a successor is present. `230541` (or migration 85) adds a postcondition that asserts the ACLs and function fingerprints. |
| ROLL-06 | Executed (X4); downgraded, fail-closed | The app deployed before `230541` turns an ordinary cancel into a 500, because PGRST202 is unmapped. No app-versus-migration order is written. | Map PGRST202 to a controlled 409. Write the order: migrations 80-84 with postchecks, then this app. |
| F8-R | Executed (F3-g, X2) | A short reason, currency or evidence value hits a 23514 CHECK and returns 500. An uppercase UUID commits `paid`, then returns 500. A reference typo returns 403. | Match TS validation to the SQL CHECKs. Lowercase UUIDs. Give the reference mismatch its own detail code. |
| F5-R | Executed (F5-d/e/f) | Case and internal-whitespace variants bypass single-use. A claim from a corrected mis-assignment is permanent. | Canonicalize evidence ids in the evidence adapter. Allow a governed claim release, with audit, when a correction supersedes the only observation holding the claim. |
| RUNBOOK / ROLLBACK | Source; downgraded | The preflight is prose, not SQL, and cannot run before apply. "Disable financial ingress" names no switch and no SQL revoke. | Ship exact pre-apply and post-apply PII-free count queries. Name `RESEARCH_ASSISTED_ORDER_FINANCE_ENABLED=false`, plus the revoke. |
| QJ-01 | Executed with a fixture outside the production cap; downgraded | The client quote decoder caps lines at 100 units. The production catalog caps each variant at 100, so this is latent drift today. | Import the shared constant. |
| Notification / history / panel | Source | Operator free-text status emails can contradict the evidence-bound pages. Account history shows a bare "paid". The quote panel shows an error, or "do not send funds", whatever the status, including when finance is off. | Bind payment-status email copy to evidence. Use the shared copy in history. Mount the panel only when a quote can exist. |
| SQL-10, SQL-13, SQL-09, SQL-03b, GW-01, AUTHZ-SCOPE-01, HL25-01, PROOF, REC-01 | Source | Unchanged or minor. | As listed in the lens file. |

## Tests and limits

**What was run** (single worker, pinned Node 20.19.0, at `268e691`):

| Run | Result |
| --- | --- |
| Focused suite: `server/research/assisted-order`, `client/src/research/assisted-order`, `shared/research/assisted-order`, `server/research/status-recovery`, `server/release-control-plane.test.ts`, `server/research/early-access-wall.test.ts`, `client/src/research/early-access` | **82 files, 1,252 passed, 1 skipped, 0 failed** |
| `tsc --noEmit` | exit 0 |
| Composed probes | 62 cases. Whole-run rollback delta 18: only deterministic refusals, no 40001, no hang. |

**Not run:**
- the full suite or the build: Codex's combined-candidate gate;
- a browser pass of the quote panel;
- managed Supabase, live Auth, a real bank or processor, or a real email.

**Synthetic, and stated as such:** the manual ledger, the sinks and the grants.

## Historical paid

- The runbook does **not** manufacture verification. It keeps rows held and requires authenticated transaction
  evidence plus a reviewed resolution operation, which it says is not yet implemented. **Acceptable language.**
- **Still required:**
  - exact pre-apply and post-apply read-only, PII-free queries;
  - coverage of rows already past `paid` (HIST-PROG);
  - an authorized bounded managed read before any apply.

## Disposition

| Area | Disposition |
| --- | --- |
| Shared SQL invariants | **FAIL** on SQL-01 (P1). Otherwise PASS, including AUTH-01, single-use, append-only correction and the cancel hold. |
| Mounted manual workflow | **FAIL**. F1 (P1): no evidence authority or grant procedure in production. F2, F10 and F5 are closed. |
| Card / provider adapter | A processor-neutral contract only, with no SQL attempt or event authority (SQL-01, ADP-01). The processor choice is deferred and is not a blocker. |
| Historical and cancellation | PARTIAL: HIST-PROG and N2 (P2), runbook queries (P3). |
| Customer status consistency | PARTIAL: F7-R1 (P2) |
| Protected files | Unchanged since review. The PASS applies to exactly `7c21ea1a…` and `1d6594d6…`. The gate stays red until the owner-authorized manifest amendment lands. |
| **Production promotion** | **NOT READY**: P1 SQL-01, P1 F1, the protected-gate repin, and pending migrations 80-84 with no authorized managed preflight read. |

## Next exact correction for Codex

**Migration 85**, one forward migration:
1. `payment_observe` refuses `p_method='provider'` with P0001 `ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY`, and
   `payment_verify` refuses provider observations the same way. Both stay closed until a server-created
   `payment_attempts` authority exists. That authority binds:
   - the request or order;
   - the accepted quote id, version and acceptance;
   - the expected amount and currency;
   - the provider, account and mode;
   - the attempt, session and payment ids (unique);
   - the creation time and state;
   - the idempotency key.

   Provider observations must then resolve to an attempt row, and only `captured` may qualify.
2. In the same file:
   - `verify_bound` uses `is distinct from`;
   - `quote_accept` checks the request status;
   - add a quotes immutability trigger;
   - add a postcondition that asserts ACLs and function fingerprints (closes ROLL-05).

**Then, in order:**
- F7-R1: the evidence read for any status at or after `paid`;
- HIST-PROG: hold later transitions with no verification, and add the preflight query;
- N2: governed no-funds or void;
- F4: a durable effects-pending record and reconciler, plus a durable audit gate on the finance flag;
- the P3 mappings.

---

## Addendum: successor `947f6ee` / records `95e040a`, which landed during this review

- **Identity:**
  - **Runtime:** `947f6ee7739bf2a1381b4b29a4f9d132c751d64c`, tree `03ccddee03fbad2966655c2ce1a3cb46c468d8d5`.
  - **Records tip:** `95e040a300e23ce5eb4ebc0dd7e5039f76aa818c`, tree `18fdb975…`. Relative to `947f6ee`, it changes
    records plus `server/release-control-plane.test.ts` only.
- **Delta from `268e691`:**

  | Commit | Kind | Content |
  | --- | --- | --- |
  | `05e413c` | runtime | EA-01 mint limiter |
  | `947f6ee` | schema | Migration 85, `20260930234614_…quote_provider_hold.sql`: blob `8b390d8e`, sha256 `6596f261…08fe`. This equals the DAG (44 nodes, dependsOn 84). |
  | `95e040a` | records | Handoff and registrations |

  Predecessor migration bytes are unchanged.
- **Protected files:** still `7c21ea1a…` and `1d6594d6…`. The prior PASS still applies.

### Executed results (same disposable stack, migration 85 added; outputs in `sql/composed/hold/`)

**Main composed probe re-run** (56 cases):
- The **only** differences from `268e691` are the SQL-01 cases. The forged provider observe is **REFUSED**, P0001
  `ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY`.
- The request stays in `payment_review`, and both customer surfaces show "Payment review", not "Payment verified".
- Every manual-path case is identical: no regression.

**Hold checks** (`provider_hold_*.sql`):
- **Phase A:** with a pre-existing provider verification, the migration **refuses** with 55000
  `PROVIDER_VERIFICATIONS_RECONCILIATION_REQUIRED` and rolls back. No triggers are left behind.
- **Phase B:** with a provider observation created by the permissive 84 function before the hold:
  - `verify_bound` on it is refused;
  - a new forged observation is refused;
  - `verify_bound(NULL, …)` returns NULL, so **SQL-10 is closed**;
  - the unbound verify is denied to `service_role`;
  - even an owner-role direct INSERT of a provider verification is refused by the new trigger.
- **Re-apply sequence:** re-applying 85, then `202413`, then `205725`, then `230541`, then 85 again:
  - the **provider path stays refused in every state**, because the insert triggers backstop older function bodies;
  - **ROLL-05 is narrowed but remains (P3):** re-applying `202413` re-grants the unbound verify to `service_role`
    and restores NULL-unsafe `quote_accept`; re-applying `205725` restores NULL-unsafe `verify_bound`;
  - re-applying forward to 85 restores all three.
- **N2 confirmed again:** the stranded pre-hold provider observation makes its order permanently uncancellable.
  The 85 preflight counts provider *verifications* but not provider *observations*, so it should also report them.

**Unit tests** (single worker, Node 20.19.0, at `95e040a`): `server/research/early-access`,
`server/research/early-access-wall.test.ts` and `server/release-control-plane.test.ts` gave **163 files, 2,551
passed, 26 skipped, 0 failed**. `tsc` was not re-run, because no TypeScript runtime changed except
`private-access-routes.ts`, which the suite covers.

### Status changes at `947f6ee`

| Id | Status |
| --- | --- |
| **SQL-01** | **CLOSED (fail-closed hold).** No provider evidence is accepted or verifiable by any `service_role` caller, in any re-apply order. A durable, server-created payment-attempt and event authority is still **required before any provider ingress is mounted**; that stays tracked under ADP-01. |
| SQL-10 | CLOSED |
| EA-01 | CLOSED. At capacity, the oldest below-budget entry is evicted; exhausted budgets survive. This matches the correction sent. |
| Everything else in this report | Unchanged: no app TypeScript changed apart from EA. |

### Disposition at `947f6ee` / `95e040a`

| Item | Status |
| --- | --- |
| Open P1 | **F1**: production composes no independent manual evidence authority, and there is no grant procedure. |
| Open P2 | F7-R1, HIST-PROG, N2, F4 (durable effects and audit), ADP-01 (latent), HIST-02, SQL-06 |
| Protected gate | Red until the owner-authorized amendment for exactly the reviewed hashes is recorded |
| **Production promotion** | **NOT READY** |

**Next correction for Codex.** F1 needs the founder's real evidence source, so it is not Codex-only. The next
engineering correction is the customer and payment truth pair:
1. **F7-R1:** read financial state for any status at or after `paid` on the status page, `/status` and account history.
2. **HIST-PROG:** hold later transitions for rows that have a `paid` event but no verification, and add the exact
   pre-apply and post-apply preflight queries, including provider-observation counts.

**Then:**
- N2: a governed no-funds or void resolution;
- F4: a durable effects-pending record, a reconciler and a durable-audit gate;
- ROLL-05: preflights in older migrations that refuse when a successor exists.
