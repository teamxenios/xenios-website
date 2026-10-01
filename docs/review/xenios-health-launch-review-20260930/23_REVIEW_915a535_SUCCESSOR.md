# Claude independent review: HL-12 successor `915a535` (records `61853e2`)

## Identity

- **Fetched:** once, 2026-10-01 ~22:10 CT. The core tip is the records tip `61853e28c2e6a803340f9f9cb5f4eabe480e0961`
  (tree `53578848…`). No newer commit existed.
- **Runtime reviewed:** `915a5354376f0f5e9c850e5fddd2b51be78d2e43`, tree `c3793ba4b83031bce7841a1ba6df78bda5e10731`.
  Ancestry `947f6ee` → `915a535` → `61853e2` is verified.
- **Delta from `947f6ee`/`95e040a`:**

  | Commit | Kind | Content |
  | --- | --- | --- |
  | `663268f` | protection | Manifest amendment. Only `server/routes.ts` `fileHashes` changes (`f17d518e` → `7c21ea1a`) and `server/index.ts` `seamBaselineHashes` changes (`598ffd2e` → `1d6594d6`), plus a provenance comment. Exactly the founder-approved pair. |
  | `915a535` | runtime and schema | Migration 86, `20261001024018_research_assisted_order_quote_history_immutability.sql`: blob `837db34f`, sha256 `09563161…243f`. Also `service.ts`, `supabase-repository.ts` and `status-recovery/supabase-store.ts`. |
  | `240628f`, `c181db5` | tests | |
  | `74b043d` | registration | |
  | `ab5cb09`, `61853e2` | records | |

- **Predecessor migration bytes 01–10:** unchanged at `61853e2`.

## Method

**Database.** The same disposable stack as `22_*`: `supabase/postgres:17.6.1.171` plus `postgrest:v14.13`, with exact
LF bytes in DAG order through migration 86.

**Harness change.** PostgREST moved to host port 38431, because Windows now reserves 55402–55501. The Postgres host
port mapping was removed; it was never used, since all SQL runs through `docker exec`.

**Composed path.** The real `/api/research` gateway in non-public mode, the route table, the services, the
repository and the P-17 `/status` store. The substitutions are unchanged from `22_*`: guard and member stand-ins,
a synthetic ledger, sinks with production dedupe semantics, and grants inserted by SQL.

**Scripts and outputs** (in `sql/composed/`):

| Script | Output | Cases |
| --- | --- | --- |
| `hl12-successor-probe.mts` | `successor_61853e2.out` | 56 |
| `hl12-915a535-probe.mts` | `p915_61853e2.out` | 22 |
| `hl12-successor-extra.mts` | `extra_61853e2.out` | 6 |
| `reapply_024018_check.sql` | `reapply_024018_61853e2.out` | 6 states |

**Source review.** Four read-only lenses (SQL, TS and surfaces, protection seam, ops), each with an adversarial
skeptic per P0–P2 claim. Results are in `hl12/915a535_lens_findings.json`.

## Executed results

### 1. Historical paid progression: CLOSED (HIST-PROG)

Every start state below had legacy events and **no verification**:

| Start | Forward over HTTP | Forward in SQL | Cancel over HTTP |
| --- | --- | --- | --- |
| `paid` | 409 `payment_verification_not_ready` | refused, `HISTORICAL_PAID_UNRESOLVED` | 409 |
| `supplier_processing` | 409 | refused, `HISTORICAL_PAID_UNRESOLVED` | 409 |
| `shipped` | 409 | refused, `HISTORICAL_PAID_UNRESOLVED` | 409 |
| `delivered` | 409 | refused, `HISTORICAL_PAID_UNRESOLVED` | 409 |
| `closed` | (terminal) | (terminal) | 409 |

**Also refused:**
- `supplier_processing` with **no events at all**;
- a **regressed** `payment_review` label that has a prior `paid` event: moving back to pending, cancelling, and the
  SQL path are all refused.

X1 from `22_*` (a historical row shipping and delivering) is now refused (409).

**Remaining gap.** There is still no governed historical resolution operation, so held rows stay held. That is
correct, and it is disclosed.

### 2. Verified progression: PASS

A verified paid order went `supplier_processing` → `shipped` → `delivered` → `closed` over HTTP: **200 at every
step**.

### 3. Quote immutability: CLOSED (SQL-06, SQL-13)

These mutation attempts were all refused with `ASSISTED_ORDER_QUOTE_IMMUTABLE`. Every one ran as the table owner,
not just `service_role`:

| Quote state | Attempt |
| --- | --- |
| Issued | change total |
| Issued | issued → superseded while carrying acceptance fields |
| Issued | DELETE |
| Accepted | change total |
| Accepted | accepted → superseded |
| Accepted | change `accepted_at` |
| Accepted | DELETE |

**Other results:**

| Case | Result |
| --- | --- |
| `service_role` UPDATE/DELETE | 42501 |
| Re-issue after acceptance | 409 |
| Final quote row | `accepted`, total 10,000 |
| TRUNCATE quotes | Blocked (by FK) |
| TRUNCATE requests CASCADE | Blocked by the quote trigger, rows intact |
| Legitimate re-issue | Still works: v1 superseded, v2 issued |
| Accepting an issued quote on a **cancelled** request | HTTP 409; SQL `QUOTE_ACCEPTANCE_CLOSED`; the quote stays `issued` |

**Races.** Eight concurrent accept and cancel pairs gave either "accept refused, then cancelled" or "accepted
**before** cancel committed, then cancelled". There were **0** acceptances after the cancel committed.

### 4. F7: CLOSED

**F7-d** (`supplier_processing` after a verified payment): the status page and `/status` both show the timeline
entry as **"Payment verified"**. The same holds at `shipped` and at `closed`. A historical unverified order still
shows "Payment record under review" on both. The notification agrees.

### 5. Account history: OPEN (P3)

- `client/src/research/member-orders/AssistedRequests.tsx` still renders the badge
  `Request status: ${status}`, for example "Request status: paid", from the operational label.
- It carries an explicit disclaimer: "A request status or estimate does not establish captured payment".
- It does not use the evidence-bound copy, so for a historical unverified paid it reads differently from the two
  status pages.

### 6. HIST-02: OPEN (P2)

The first quote for an existing `payment_pending` order, or a `payment_review` order, returns **409**
`financial_action_refused`. `quote_issue` still admits only pre-payment statuses.

### 7. F4: OPEN (P2)

**What works:** the stable effects keys and one-shot repair still work (I1–I4).

**Where it fails:**
- **F (X3):** an outbox outage after commit returns 503. The observer's grant is then revoked. A retry by the
  observer returns 403, and a retry by another granted admin returns 403. Result: **notification lost**, outbox 0.
- **No durable effects-obligation table exists.**
- **X2:** an uppercase request id still commits `paid`, then returns 500 on every retry with that id.

### 8. N2: OPEN (P2)

A cancel with any observation is still refused. There is no governed no-funds, void or refund record.

### 9. Provider authority: intact (SQL-01 stays CLOSED)

- A forged provider observe is refused (`PROVIDER_AUTHORITY_NOT_READY`).
- The 86 preflight asserts that both provider-hold triggers exist and are enabled.
- Provider refusal survives every re-apply tested (see re-apply interplay below).

### Other

- **ROLL-06: CLOSED.** The app without the finance function now returns **409** `payment_verification_not_ready`
  (it was 500).
- **The remaining 56 composed cases are unchanged from `947f6ee`,** except the F7 cases, which are now correct.

### Re-apply interplay (ROLL-05: narrowed, P3)

Sequence: 86 → re-apply 86, `230541`, `202413`, 85, 86.

- **Survives every re-apply:**
  - all seven HL-12 triggers;
  - the acceptance backstop on cancelled requests;
  - the provider hold.
- **Lost when `202413` is re-applied:**
  - the NULL-safe check in `quote_accept`: the unrelated member's acceptance on the guest quote succeeded;
  - revocation of the unbound verify for `service_role`.
- **Restored** by re-applying forward to 86.


## Research gateway protection baseline

| Field | Value |
| --- | --- |
| Protected path | `server/research/index.ts` (manifest `seamBaselineHashes.files`) |
| Old pinned hash | `sha256:b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070`: the bytes at `9b5e61b` (2026-09-07) |
| Exact reviewed new hash | `sha256:5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188`: the bytes at `2dc7d62`, unchanged through `61853e2` (LF, no CR) |
| Changing commits | `2dc7d62` only. History was checked with `git log 9b5e61b..61853e2 -- server/research/index.ts`. |
| Gate state | `server/core-site-protection.test.ts` › "verifies the seam baselines too" is the **only** protection failure: 1 of 37 in that file, and 1 of 1,064 in the focused run. |

The separate CLI gate (`verify-core-site-protection.mjs`) compares the whole branch against `origin/main` (4,149
files). Its out-of-zone failures are long-standing differences between the branch and main, not caused by this
successor. They are not evaluated here.

**The diff** (+8/−3, in the gateway wall only):
1. Comment wording.
2. The status-read regex gains an optional `/quote` suffix. It is still anchored, with the reference
   `XRR-\d{8}-[0-9A-F]{10}`, and tested only in the GET/HEAD branch.
3. A new POST-only `/quote/accept` regex.
4. One line adding that regex to the POST admission chain.

**Why it is safe:**
- Admission only forwards the request. Owner authority is still enforced downstream: `quote_get` uses coalesced
  member, session or token checks, and `quote_accept` is NULL-safe and checks request status.
- No other route becomes reachable.
- The regexes are case-sensitive and anchored, while the Express router is case-insensitive and non-strict, so
  every variant fails closed.
- **Executed through the real gateway** in `22_*` and again here. Owner and token requests get 200, foreign or
  uncredentialed requests get 404. These lookalikes are **walled (401)**:
  - trailing slash;
  - lowercase reference;
  - `/QUOTE`;
  - `//quote`;
  - `%2Fquote`;
  - POST `/quote`;
  - GET `/quote/accept`;
  - `/quote/accept/x`;
  - `/quote/accept/`;
  - PUT.

**An owner amendment is appropriate.** Per `CORE_SITE_PROTECTION.md`, the protection owner makes it in its own
commit, citing Samuel's explicit approval. It changes only that one hash and adds a dated entry with the old/new
pair in `seamBaselineHashes.$comment`. That follows the per-section convention; `663268f` put its note in the
top-level comment instead (CSP-05, P3).

**Optional P3 hardening, not blocking:**
- **CSP-02:** quote doors make a `service_role` RPC even for fully anonymous callers. Short-circuit when no
  credential is present, and add rate limiting before the finance flag is enabled.
- **CSP-03:** a status token alone can accept a quote. Record the owner decision.
- **CSP-04:** pin the case, slash and encoding variants in `early-access-wall.test.ts`.

**The `663268f` amendment itself is correct.** It changes exactly three tokens: `routes.ts` `f17d518e` →
`7c21ea1a`, `index.ts` `598ffd2e` → `1d6594d6`, and one comment. Both files at `61853e2` equal the approved hashes.

## Adjudicated findings at `915a535`

Severities are after adversarial verification.

**P0: none.**

**P1:**

| Id | Status |
| --- | --- |
| F1 | Still open. Production composes no independent manual evidence source, and no grant procedure exists. Awaiting the founder's operational choice. |

**P2:**

| Id | Status |
| --- | --- |
| F4 | Executed: a revoked grant loses the notification permanently. There is no durable effects obligation, and production audit is log-line only. |
| N2 | No governed no-funds, void or refund outcome. |
| HIST-02 | Executed: the first quote for `payment_pending`/`payment_review` returns 409. Live rows moved to `payment_pending` before acceptance also strand once the quote expires (HIST-02-R1, folded in). |
| ADP-01 | Latent: no provider attempt, event or quarantine store. |

**Closed in this successor:**

| Id | Evidence |
| --- | --- |
| HIST-PROG | Executed |
| F7-R1 | Executed, on both status surfaces |
| SQL-06 | Executed, as owner |
| SQL-13 | Executed |
| ROLL-06 | Executed: the 500 is now a 409 |
| Protected two-hash amendment | Correct |
| SQL-01 | Stays closed: provider hold intact |

**P3 (selected):**

| Id | Finding |
| --- | --- |
| HIST-FREEZE | Every legacy paid or post-paid row is permanently held once 80–86 apply, because no historical resolution operation exists. Verifiers judged this designed containment, not a new defect. **It becomes a release blocker if the pre-80 count shows non-terminal rows** (see the go/no-go step under "Managed-migration prerequisites"). |
| ROLL-06-R1 / NEW-APP-ORDER | Executed: with the app ahead of migration 84, **every** cancel returns 409, even from `submitted`/`reviewing` with no money. The app-versus-migration order is still unwritten. |
| Account history | `Request status: paid` comes from the operational label, with a disclaimer. Not evidence-bound. |
| X2 | An uppercase request UUID commits `paid`, then returns 500 on every retry with that id. |
| ROLL-05 | Narrowed. Only the AUTH-01 body and the unbound-verify revoke are not trigger-backed. |
| TRIG-ENABLED | Preflights accept `tgenabled='R'`. Use `in ('O','A')`. |
| TRUNC-EVID | Events, observations, verifications, claims and corrections can still be TRUNCATEd by the owner. |
| GUARD-NEWSTATE | A direct jump into a post-paid status from an unpaid one is guarded only by the `set_status` matrix. |
| POSTCHECK-COVERAGE / NEW-GO-NOGO | No committed expected fingerprints, no decision rule, and older holds are not asserted. |
| ERR-ORDER / AVAIL / TEST-GAP / QUOTE-CONTRACT | Error ordering, read availability, test coverage and quote-contract consistency issues. |
| NEW-RECORD-* | Record wording: "parent-first locks"; "two separate runs". |

## Managed-migration prerequisites (none satisfied yet)

0. **Founder exact-SHA approval** naming the target project and all seven blob SHAs:
   - 191323 `4c4a6b1f…`
   - 193033 `2a4ece6b…`
   - 202413 `f59dc7d2…`
   - 205725 `452a94e5…`
   - 230541 `434885ea…`
   - 234614 `6596f261…`
   - 024018 `09563161…`

   All of these match the DAG (45 nodes) and the blobs.
1. **An authorized, bounded pre-80 read.** It must run against today's managed schema. The committed
   `…history_immutability_precheck.sql` is valid only after 85 (NEW-PRE80-PREFLIGHT, P3). A PII-free pre-apply query
   using only M71 tables is proposed and was executed read-only on the disposable stack: see
   `sql/composed/s915/historical_preflight.sql` and its output. It reports, per status: requests, rows with a `paid`
   event, **`frozen_after_86`**, and unquotable payment-stage rows. The post-apply section adds held rows without
   verification, observations by method (unverified, missing an observer UUID, requests blocked from cancel), and
   payment-stage rows without an accepted quote. Also confirm in `schema_migrations` that M71 is present and none
   of the seven versions are.
2. **Go/no-go decision.** If `frozen_after_86` includes non-terminal rows (`paid`, `supplier_processing`,
   `shipped`), those customers' orders stop. You need either a governed historical resolution operation first, or
   an explicit founder decision to accept the freeze. Provider verifications must be 0, or 85 and 86 abort.
3. **Freeze the window:**
   - `RESEARCH_ASSISTED_ORDER_FINANCE_ENABLED` unset;
   - the verifier grants table empty;
   - admin status writes paused.
4. **Apply** one file at a time in DAG order, with a stated mechanism. 80, 81 and 83 have no BEGIN/COMMIT
   (NEW-APPLY-MECHANISM). Run each embedded preflight and postcondition. Run the committed precheck after 85, and
   the postcheck after 86; the facts must be equal, and fingerprints recorded.
5. **App order.** Deploy the `915a535` app only **after** at least 84. During the window, the old runtime receives
   the new P0001 refusals as 500s, which fails closed. Write this order into `MIGRATIONS.md` and the handoff.
6. **Rollback** is not reversible. Disable finance ingress, preserve every row and guard, and roll forward with a
   new reviewed migration. Never replay 193033/202413/205725/230541 (ROLL-05).

## Tests and limits

| Run | Result |
| --- | --- |
| Composed probes | 56 + 22 + 6 cases, plus re-apply (6 states), ROLL-06-R1 (2) and the preflight (read-only) |
| Whole-run rollback deltas | Deterministic refusals only, no 40001 |
| Focused unit run (Node 20.19.0, single worker; `server/research/assisted-order`, `client/src/research/assisted-order`, `shared/research/assisted-order`, `server/research/status-recovery`, `release-control-plane`, `early-access-wall`, `client/src/research/member-orders`, `core-site-protection`) | **39 files, 1,062 passed, 1 skipped, 1 failed.** The failure is the expected seam-baseline tripwire. |
| `tsc --noEmit` | exit 0 |

**Not run:**
- the full suite or the build: Codex's combined gate;
- a browser pass;
- managed Supabase, real evidence or real email.

**Managed role attributes not verified.** The guards are SECURITY INVOKER triggers reading FORCE-RLS tables, and
the local proofs used a superuser owner. Confirm on the managed target that the definer owner has BYPASSRLS and
EXECUTE on `financial_state`.

## Disposition

**Production promotion: NOT READY.** The blockers:
- P1 F1;
- P2 F4 and N2;
- the protection tripwire, red until the owner amendment for `server/research/index.ts`;
- migrations 80–86 unapplied, with no authorized pre-80 read and no go/no-go decision on frozen legacy rows.

## Next exact correction for Codex

1. **F4, durable effects.** In the same SQL transaction as the verification, write an append-only
   `payment_verification_effects` obligation row: verification id, request, kind, dedupe key, state. A reconciler,
   or any granted admin, delivers audit and outbox from that row without re-verifying and without the original
   observer's grant. Mark it delivered idempotently. Gate the finance flag on durable audit, and lowercase UUIDs
   before the receipt comparison.
2. **Records-only, in parallel:**
   - commit a pre-80 preflight file (the proposed SQL is acceptable as a base);
   - write the app-versus-migration order and the go/no-go rule into `MIGRATIONS.md` and the handoff;
   - limit the cancel finance read to statuses where an observation can exist, which removes the ROLL-06-R1
     dependency.

**Then:**
- N2 and the historical resolution as one governed `financial_disposition` record type (no-funds, void,
  legacy-attested) that the cancel and history guards accept;
- HIST-02;
- the P3 hardening: TRUNCATE guards on the evidence tables, `tgenabled in ('O','A')`, predecessor-refusal
  preflights, evidence-bound account-history copy.
