# Claude independent review: core successor `8f24082`

## Identity

- **Fetched:** once, 2026-10-01 ~09:40 CT.
- **Core tip:** `8f240828df93ad45f31609d85460bd9d111047ec`, tree `0de2b81ebc29ed86dad8084956041dc28881b225`. It is
  96 commits past the last reviewed records tip `61853e2` (runtime `915a535`).
- **Frozen runtimes inside the range:**

  | Slice | Runtime | Tree | Notes |
  | --- | --- | --- | --- |
  | ADP03 | `2f0a975` | `55c15891…` | test checkpoint `c3ab4bd`, controls `edf8526`, handoff `b907cf6` |
  | HL-17 | `0d22757` | `afeaa20d…` | tests `bd236fa`, records `8f24082` |

- **Slices in the range:**
  - F4 durable effects (`3562c03`);
  - HIST-02 historical quote reissue (`3da9095`);
  - N2 no-funds disposition (`cb9b8d6`);
  - HL-11 424/423 reconciliation (`9c3358b`, `4cba24a`);
  - ADP01 provider journal (`5809b72`, `91a4e0e`);
  - ADP02 create recovery (`27463d7`);
  - ADP03 governed capture settlement (`2f0a975`);
  - HL-17 Access Hub (`0d22757`).
- **New pending migrations, 87–93.** Committed LF SHA-256:

  | # | Migration | SHA-256 |
  | --- | --- | --- |
  | 87 | `20261001040349` audit_store | `a6814b1c…` |
  | 88 | `20261001040351` effects | `8121e537…` |
  | 89 | `20261001044200` history_reissue | `4f44f9df…` |
  | 90 | `20261001062651` no_funds_disposition | `51279964…` |
  | 91 | `20261001085559` provider_journal | `15de2acb…` |
  | 92 | `20261001102904` provider_execution | `5386c625…` |
  | 93 | `20261001115512` provider_settlement | `1470740b…`, equal to the ADP03 handoff |

- **Predecessor migrations 80–86:** byte-identical.

## Method

**Database.** Disposable `supabase/postgres:17.6.1.171` plus `postgrest:v14.13` (host port 38431). Exact bytes were
applied in this order:
1. bootstrap
2. M71
3. `0820`
4. the `0921` candidate
5. P-17
6. `supabase/research-notification-outbox.sql` (the root production schema that Codex's own harness applies first)
7. migrations 80–93

All 116 HL-12 functions installed.

**Composed path:**
- the real `/api/research` gateway in non-public mode;
- the route table, now including `paymentEffects`;
- services, repository and P-17 `/status`;
- the **real durable audit authority** (resolved over migration 87 with a synthetic key ID and HMAC key);
- the **real `resolvePaymentEffectsRecovery`**.

The substitutions are as before: guard and member stand-ins, a synthetic manual ledger, and grants inserted by SQL.

**Scripts** (in `sql/composed/s8f/`):
- `p8f-main.mts`: 56 cases;
- `p8f-p915.mts`: 22 cases;
- `p8f-f4.mts`: 5 cases.

**Codex's committed ADP03 settlement proof** was re-executed here: Node 20.19.0, `postgres:17-alpine` with no
network.

**Source review.** Six core lenses plus adversarial verification. Results are in
`hl12/8f24082_lens_findings.json`.


## Executed results (Claude composed stack, exact bytes through 93)

| Area | Result |
| --- | --- |
| **F4 durable effects** | **CLOSED at source (executed).** See the F4 detail below. |
| **HIST-02** | **CLOSED at source (executed).** The first quote for an existing `payment_pending` or `payment_review` order now returns **201**; it was 409 at `915a535`. The source lens confirms the pricing body uses the exact line snapshots under the request lock. A P3 residual applies to legacy `payment_review` rows (HIST-02-R1). |
| **SQL-01** | **Still closed for manual or forged provider observe.** A forged `payment_observe(method='provider')` is refused (`PROVIDER_AUTHORITY_NOT_READY`). Provider rows are now admitted only through settlement-bound lineage (`115512` redefines the hold guard), with the trade-offs described under ADP-G1 to ADP-G5. |
| **Regression** | The 56 + 22 earlier composed cases are unchanged from `61853e2`, except: HIST-02 now passes; the in-memory effects injections (I1/I3/F) are superseded by E2; and `TRUNCATE requests CASCADE` is now also refused by the disposition graph. |
| **Accept-versus-cancel races** | 8 of 8 serialized. In every pair the accepting transaction's id is lower than the cancel event's, so accept committed first and cancel waited on the lock. One timestamp comparison looked inverted only because the app passes milliseconds while the database records microseconds. |
| **ADP-G1** | **CONFIRMED (executed).** See below. |

### F4 detail

| Case | Result |
| --- | --- |
| **E1** | Verify returns 200 `paid`, 1/1. The outbox row is `pending` and the audit receipt is present. The replay reports `replayed:true`. |
| **E2** | An injected completion outage after commit returns **503** `payment_verification_effects_pending`. The request is `paid`, 1/1, and the outbox row stays **`held`**, with no audit, and dispatch is **refused**. Then the observer's grant was **revoked**, and a **new** recovery instance with a **rotated** audit key ran the bounded worker: `{completed:1}`. The row moved to `pending`, with the audit receipt present, and dispatch was allowed. |
| **E3** | Inserting a forged or legacy payment notice is refused (`ASSISTED_ORDER_EFFECTS_CONFLICT`). The dispatch guard refuses a plain `paid` notice and a padded `" paid "` status. |
| **E4** | These owner-level changes are all refused: changing the payload, moving the row back to `held`, deleting the outbox row, and deleting the audit row. |

### ADP-G1 detail

1. The owner provisions **one** provider source, as you would after choosing a processor.
2. `service_role` appends **one** stray `captured` event for an unknown attempt. It is accepted and classified
   `quarantined`, `unknown_attempt`.
3. `provider_uncertainty` for an **unrelated** order flips from `held:false` to `held:true`,
   `provider_unbound_event_held`.
4. On manual-only orders that never touched a provider, every action now returns **409**:
   - quote issue;
   - customer accept;
   - cancel from `payment_pending`;
   - cancel of a fresh `reviewing` order with no money;
   - manual verify.
5. The journal row cannot be updated or deleted (`PROVIDER_IMMUTABLE`), and **no** resolution RPC exists.

**Codex's own ADP03 proof does not cover this case.**

## Protected seams at `8f24082`

The strict tripwire (`server/core-site-protection.test.ts`) has **4** mismatches. The hash chains were verified by
the seams lens and by Claude.

| Path | Section | Pinned (old) | Reviewed new (`8f24082`) | Changing commits | Disposition |
| --- | --- | --- | --- | --- | --- |
| `server/index.ts` | seam | `sha256:1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` (bytes at `4197a96`) | `sha256:ba5800e604482af4f1ca56b08c43abd3d1207473a6e213ab99c22113471a4521` | `3562c03`, `cb9b8d6`, `5809b72`, `27463d7`, `2f0a975` | **Safe; owner amendment appropriate.** See note 1. |
| `server/static.ts` | **fileHashes (hard)** | `sha256:9cd3e1c363dd921fab780761baa888e9319f40ef177ca303072e3179b2c20004` | `sha256:b7a7641752b74a557664c9119130431fa3e68c0b2a31acce5ddab0c8283d9f94` | `0d22757` (HL-17) | **Technically safe, but a founder product decision is required first.** See note 2. |
| `client/src/App.tsx` | seam | `sha256:3b3b808b23cccdf8d2e2179fd30349b3ae299137a8a4a5f33525e0a304828d80` | `sha256:1bc59371e5028234ed5b31e1b3db77f0c2ff6a011999210d2b29d46be18a57a7` | `0d22757` (HL-17) | **Same as `server/static.ts`.** |
| `server/research/index.ts` | seam | `sha256:b8db03cf…3070` | `sha256:5b9f683b…4188` (unchanged since `2dc7d62`) | (none new) | **Unchanged.** It was already reviewed safe in `23_*` and still awaits your amendment. |

1. **`server/index.ts`.** All seven hunks are imports or internal to `composeAssistedOrderBridge`:
   - payment-effects and disposition-effects recovery resolvers;
   - finance mounts only when durable audit and effects readiness both resolve;
   - default-off dispositions, provider journal, provider execution and provider settlement, each with
     `source: null`;
   - four admin POST doors behind `requireSupabaseAdmin`.

   There is no middleware, CSP, session, static, error-handling or main-site change, and no customer door. P3 notes:
   - **IDX-01:** stale "ten registrations" comments, though 19 doors now exist;
   - **IDX-02:** two boot-time authority probes have no timeout when their flags are on;
   - **IDX-03:** the finance flag now also requires durable audit plus effects readiness, so a flag-on environment
     without migrations 87/88 flips the customer quote doors to 503.
2. **`server/static.ts` and `App.tsx`.** Each removes exactly one `/research/access-hub` → `/` redirect line; the
   Research section then serves the hub noindex, with no data fetch, form or credential. **However, that exact
   redirect was introduced by `cfdfd4e` "implement owner-approved clarity program" (B-1, 2026-09-26).** HL-17
   reverses an owner-approved information-architecture decision, and the HL-17 record does not cite it
   (SEAM-GOV-01). The original HL-17 concern (links bouncing customers home) could have been fixed in unprotected
   Research files by repointing or removing the links. Six of the hub's 12 cards are themselves owner-approved
   301 aliases. Approve this hash pair only if you decide to bring the Access Hub back. Otherwise Codex should
   revert `0d22757`'s two protected lines and fix the links inside the Research section.

## Prior findings at `8f24082`

| Id | Status | Basis |
| --- | --- | --- |
| **F1** (P1) | **OPEN** | `server/index.ts` still composes `AssistedOrderFinanceService(…, null)`. The N2 evidence adapter and all provider sources are `null`. No grant-creation procedure exists, because grants are owner-SQL only. **Business effect after migration 81:** with no evidence source, in-flight `payment_pending`/`payment_review` orders cannot reach `paid` until F1 is resolved (LENS-05). |
| **F4** (P2) | **CLOSED at source** | Executed: E1–E4 above. The lenses confirm the same-transaction obligation, audit before release and dispatch, and recovery that survives restart, response loss, grant revocation and key rotation. P3 residuals follow below. |
| **N2** (P2) | **PARTIAL** | A governed `never_received` no-funds cancellation exists: a scoped grant, a positive single-use receipt, an atomic cancellation event, a held intent, and audit before dispatch. It is default-off with a null adapter. A no-funds disposition cannot be applied to a verified, paid or historically paid order, and historical verification stays immutable. **REFUND-ABSENT** (P2, confirmed) is below. |
| **HIST-02** (P2) | **CLOSED at source** | Executed: 201 for `payment_pending`/`payment_review`. Pricing is byte-identical to the reviewed body and uses exact line snapshots under lock. HIST-02-R1 (P3): a legacy `payment_review` row with off-system money could be quoted again at a new total. |
| **ADP-01** (P2) | **PARTIAL, superseded** | Attempts, an immutable journal, server-side classification and quarantine now exist (91–93). The quarantine design introduces ADP-G1 to ADP-G5. |
| **SQL-01** | **Stays CLOSED** | The forged manual-RPC provider observe is refused. Provider rows are admitted only through settlement-bound lineage. The SQL authenticity boundary is ADP-G5. |
| Account history (P3) | **CLOSED at source** | The server reads `financial_state` per owned row, and the client renders the shared evidence-bound copy. P3 omissions: a cancelled row with an unverified paid event shows a bare status, and a no-funds cancellation shows a bare "cancelled". |
| HIST-PROG, F7-R1, SQL-06, SQL-13, ROLL-06 | **Stay CLOSED** | Unchanged in the composed re-run. |

## Findings at `8f24082`

Severities are after adversarial verification.

### Refund and dispute authority

**REFUND-ABSENT (P2, confirmed).** There is no refund, void, partial-refund, dispute or chargeback authority, in SQL
or in the mounted runtime. The disposition kind is limited to `no_funds`, and the authority names `void` and `refund`
as unsupported. Provider refund and dispute facts are only quarantined or held. A verified or provider-settled order
cannot be reversed at all. This fails closed, so no money state is recorded wrongly.

### Provider design gaps

All four are **P2-latent**: unreachable at this SHA, because every source is null, but **blocking before any
processor source is provisioned**.

- **ADP-G1 (confirmed, executed).** One unbound or quarantined journal row anywhere freezes every financial action on
  every request, and nothing can resolve it.
- **ADP-G2 (confirmed).** One attempt per request, `held` as the only state, and immutable. There is no abandon or
  expire, so an abandoned card checkout freezes that order permanently.
- **ADP-G3 (confirmed).** Settlement accepts only a perfectly clean lifecycle. An `unknown` create result recovered
  later, a claim left unbound after a process death, or a declined-then-retried card makes a real capture
  permanently unsettleable.
- **ADP-G4 (confirmed).** After settlement, any new claim, result or journal row changes the graph snapshot and blocks fulfillment for good. That includes a routine admin re-click of `/provider-attempts/:id/prepare`, which create_context routes to `retrieve`, and a benign out-of-order webhook. No review path exists.

### Authenticity boundary

**ADP-G5 (downgraded to P3; design boundary).** SQL cannot tell a provider-authentic fact from one typed in by a `service_role` caller. Once the owner provisions a source, policy and grants, the server key alone could build a complete provider-paid chain. The migrations document this trusted-integration boundary, and the key holder already has the equivalent power on the manual path. Before activation: authenticate raw provider bytes in the adapter, and consider storing a verifiable signature reference.

### Managed apply

**LENS-01 (P2, confirmed by execution).** Setup: the stack applied through 87, plus **one** legacy `status_changed.customer` notice with `payload.status="paid"`. The production runtime `79414143` writes exactly this row on every admin paid transition, and outbox rows are never deleted. Result: migration **88 aborts** with `ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED`, and the column is not added. The committed pre-80 preflight on that same database reports **0** rows requiring a decision. A managed chain apply could therefore stop between 87 and 88 with nothing having warned anyone. Fix: add the legacy paid-notice count, any status, to the pre-80 census and the go/no-go rule, and give 88 a governed adoption path or an explicit founder-approved disposition for those rows.

### P3 (selected)

| Id | Finding |
| --- | --- |
| N2-R1 (downgraded) | Payment-stage orders with no observation can still be cancelled with free text. |
| N2-DEADEND | One mis-keyed observation can make an order impossible to cancel, verify or resolve as no-funds. |
| N2-LATE-FUNDS | Money that arrives after a terminal `never_received` cannot be recorded. |
| N2-AUDIT | The audit shape is indistinguishable from an ordinary cancel. |
| N2-SOD | The observer can also hold the no-funds grant. |
| N2-REPLAY | A retry after a lost response reports "refused" even though the cancellation committed. |
| F4-R1 | Stuck `held` obligations are invisible to operators. |
| F4-R2 | Recovery stops if the boot probe fails or the flag is off. |
| F4-R3 | SQL does not bind the audit actor alias to `verified_by`. |
| F4-R4 | The canonical "Payment verified" copy is not reserved against operator free text. |
| F4-R5 | Fulfillment does not wait for the canonical audit. |
| F4-R6 | The ADP03 seal fingerprints the shared outbox and every assisted-order function (see LENS-04). |
| ADP-G6 | A test-mode source could settle real orders. |
| ADP-G7 | Replica-mode hardening is partial. |
| ADP-G8 | The global O(N) settlement-integrity scan. |
| ADP-G9 | Execution can be configured without event ingress. |
| HL11-F1…F7 | Syringes shown three ways. GRP-0422 record/runtime mismatch. **Nothing enforces the 6,250¢/10,750¢ decisions** (both rows are unbound and quote-priced). Superseded Product Control variants are still approved in Product Control. `catalogVersion` is a constant. v2 doors price Care rows when that flag is on. Stale comments. |
| HL17-01…03, IDX-01…03 | See "Protected seams". |
| Settlement race fixture | The test window is too short under load. See "Codex proof reproduction". |

## Managed-release prerequisites (14 pending HL-12 migrations, 80–93)

**Present and verified:**
- **Exact bytes and DAG.** All 14 DAG checksums equal the committed LF blobs. The DAG has 52 nodes, and the edges
  run 71→80…86, 71→87, 86+87→88→…→93. The release-control plane registers all 14 source SHAs.
- **Partially present:**
  - a pre-80 census file, though it misses LENS-01;
  - a go/no-go rule, though it ignores the legacy paid notices and in-flight payment-stage orders (LENS-05, P3);
  - a written app-after-84 order;
  - rollback policy (disable, preserve, roll forward).

**Missing:**
1. Founder exact-SHA approval naming the project, all 14 blob SHAs and the executor.
2. Managed identity and history reads:
   - M71 recorded as `20260819203614`, and `20260921172323` present;
   - none of the 14 applied.
3. The census **executed** on managed and recorded, including the LENS-01 count.
4. A decision on frozen legacy rows **and** on legacy paid notices.
5. A per-file apply mechanism: 80, 81, 83 and 87 lack BEGIN, and 87/88 set no lock or statement timeouts. 88 takes
   ACCESS EXCLUSIVE on the shared hot outbox (LENS-02, P3).
6. Committed expected fingerprints (LENS-07).
7. Managed role, BYPASSRLS, PostgREST, `search_path` and O/A-trigger qualification.
8. An ordering decision for other pending nodes inside the ADP seal scope, plus a DDL freeze across lanes (LENS-04,
   P3). Any later DDL on `research_assisted_order_%` or the shared outbox breaks the provider authorities.
9. A complete replay prohibition (LENS-03, P3). Besides 193033/202413/205725/230541, replaying `20260815150000`,
   `234614`, `040351` or `062651` now regresses effective bodies.
10. A full suite and build at the exact candidate.
11. Browser qualification.
12. Owner amendments for the four seams.
13. **F1.**

## Codex proof reproduction (separate evidence)

Codex's committed ADP03 settlement proof, `research_assisted_order_quote_provider_settlement_local.mjs`, was run on
Node 20.19.0 with `postgres:17-alpine` 17.11 and no network.

| Run | Conditions | Result |
| --- | --- | --- |
| **Run 1** | Host loaded by 9 review agents plus Claude's own composed probes | **Exit 1** after 29 PASS groups. `AssertionError: Peer must wait on a real database lock` in `runSettlementRaces` (races.mjs:131, lockedRace), at the case after "ordinary cancellation, settlement first". |
| **Run 2** | Control; review agents still running, no other Claude Docker work | **Exit 1**, same assertion, same case, after 29 PASS groups. |
| **Run 3** | Idle host, races module only (`claude_review_settlement_races_only.local.mjs`, untracked, then removed) | **PASS.** 4 groups, **12 actual lock-wait races** (including the case that failed in runs 1 and 2), 14 refusals, 5 rollback boundaries, 98 s. This matches Codex's recorded `adp03-races-smoke2` figures exactly. |

The fixture holds the first lock for 2 s. It then polls at most 15 times, at 50 ms plus one `docker exec psql` per
poll, for the peer's `wait_event_type='Lock'`. Under load the peer's own `docker exec` startup can outlast the
holder. These are failed runs; **they are not relabelled.** **Conclusion:** the runtime is not at fault. The fixture window is load-sensitive (P3). Poll until the holder commits, or use a deadline derived from the hold, rather than a fixed 15 attempts.

## Unit tests and typecheck (separate evidence)

Run at `8f24082` on Node 20.19.0, one worker, real dataset reader, idle host. The test set:
- `server/research/assisted-order`;
- `outbox-hl12-*`;
- `server/research/master-offerings`;
- `client/src/research/assisted-order`;
- `client/src/research/member-orders`;
- `server/research/status-recovery`;
- `early-access-wall`;
- `core-site-protection`;
- `release-control-plane`.

| Run | Result |
| --- | --- |
| Focused tests | **107 files: 105 passed, 1 skipped, 1 failed. 2,328 tests passed, 14 skipped, 2 failed.** Both failures are `core-site-protection.test.ts`: the hard-hash tripwire on `server/static.ts` and the seam baselines (GATE-01). |
| `tsc --noEmit` | exit 0 |

**Not run:** the full suite, the build, a browser pass, or anything on a managed environment.

## Disposition

| Area | Disposition |
| --- | --- |
| Shared financial invariants | **PASS** for all executed cases. |
| Manual workflow | **FAIL** on F1 (P1): no evidence source and no grant procedure. |
| Refund, void and dispute | **ABSENT** (P2). |
| Provider authority | Fail-closed and default-off. **Not activatable:** ADP-G1 to ADP-G4 must be fixed before any source is provisioned. |
| Historical orders and cancellation | Holds are intact. Governed no-funds exists. A historical resolution operation is still absent, which is the legacy-freeze decision. |
| Customer status and account | **PASS** (F7 and account history). |
| Protected seams | **GATE-01 red (P1 release hold).** `server/index.ts` is safe to amend. `static.ts`/`App.tsx` need your B-1 decision. `server/research/index.ts` is safe and awaits amendment. |
| **Production promotion** | **NOT READY.** |

## Next exact correction for Codex

**First:**
1. **LENS-01, a release blocker for any managed apply:**
   - count legacy `status_changed.customer` paid notices, any status, in the pre-80 census and the go/no-go rule;
   - give 88 a governed adoption path for them, or a recorded founder disposition;
   - add 87 to the no-BEGIN list, and add lock and statement timeouts to 87/88.
2. **ADP-G1, before any provider source is provisioned:**
   - scope `provider_uncertainty`, and every copy of the unbound-row check, to the request the event actually binds
     to;
   - give quarantined or unbound journal rows a governed review and resolution record (dismiss, bind or refund)
     instead of a global hold.

**Then:**
- ADP-G2: attempt abandon and expiry states;
- ADP-G3: tolerate recovered `unknown` results, unbound claims after a crash, and decline-then-retry;
- ADP-G4: make `prepare` and late events after settlement no-ops for eligibility;
- the refund, void and dispute authority (REFUND-ABSENT), using the same governed disposition model as N2;
- F4 P3s: an operator view of stuck held obligations, and recovery independent of the intake flag.
