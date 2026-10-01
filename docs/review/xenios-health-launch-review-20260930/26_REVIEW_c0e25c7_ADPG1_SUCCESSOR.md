# Claude independent review: core ADP-G1 quarantine-isolation successor `c0e25c7` (records `8549011`)

## Identity

- **Runtime source:** `c0e25c73a0d789829ea213e2ee040c68e06f0a75`, tree `1771d18bad91b89e95414bebb8b574dc32729687`.
- **Records tip:** `854901160330ce524cc8349d64cc54c5100819df`, tree `573655a2711554d4f4cd417cc0092cc4bc8d8ec3`.
  - From `c0e25c7` to `8549011`, only tests, release-control, `MIGRATIONS.md`, proofs and records changed.
- **Previously reviewed source:** `8f24082` (report 24).
  - From `8f24082` to `c0e25c7`, the SQL change is exactly one new migration:
    `20261001160730_research_assisted_order_provider_quarantine_isolation.sql` (migration 94).
  - Its canonical LF blob SHA-256 is `91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477`. Predecessors
    80–93 are byte-unchanged.
  - The other runtime changes are HL-01 detail disclosure, admin-session isolation, the partnership-receipt component,
    and a one-class `AccessHub.tsx` scroll margin. LENS-01 changed only verification SQL.
- **Protected files:** `server/index.ts`, `server/static.ts`, `client/src/App.tsx` and `server/research/index.ts` are
  byte-unchanged since `8f24082`. The CLI protection gate still fails on the same `static.ts` hash `b7a76417…9f94`.
  GATE-01 is unchanged. No hash or manifest was amended by Claude.

**Evidence classes:** separate, not aggregated.
- **E1:** Codex's committed quarantine proof, re-run by Claude at `8549011` on an idle host. Node 20.19.0, postgres
  17.11, no network. **PASS:** 14 groups, 27 refusals, 8 real lock-wait races, 1 predecessor reproduction, 126 s.
  - Its printed `migrationSha256` `345044cf…` is the CRLF Windows checkout hash. The canonical LF hash is `91a20f68…`
    (P3 provenance note).
  - Output: `hl12/26_codex_quarantine_proof_rerun_8549011.out`.
- **E2:** Claude's own scenario driver `hl12/26_claude_adpg1_probe.mjs.txt (run as supabase/verification/claude_review_adpg1_probe.local.mjs, then removed)`.
  - It reuses Codex's disposable provisioning only; every scenario and assertion is Claude's.
  - 60 recorded observations; disposable no-network container removed.
  - Output: `hl12/26_claude_adpg1_probe_8549011.out`.
- **E3:** Claude's LENS-01 execution on a disposable `supabase/postgres:17.6.1.171` with no network.
  - Output: `hl12/26_lens01_census_8549011.out`.
- **E4:** a read-only five-lens source review with adversarial verification.
  - Results: `hl12/c0e25c7_lens_findings.json`.
- **Not run by Claude:** the full suite, typecheck, build, browser, managed or production. No managed or production
  database was contacted.

## ADP-G1: **PARTIAL**

### Requested scenarios (E2 unless noted)

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Unrelated manual-only order while source A is quarantined | **PASS.** `uncertainty.held=false`; manual verify → `paid`; then `supplier_processing` → `shipped` succeed. A late quote accept and an ordinary cancel succeed. Legacy fixture 990 is unaffected. |
| 2 | Provider source A versus B (same provider, other account) | **PASS.** B settles `verified`, is eligible and moves to `supplier_processing`. A fresh reservation on B is accepted. |
| 3 | Distinct account/mode scopes | **PASS.** C (same provider and account, `live`) and D (other provider, same account) both settle, are eligible and progress. |
| 4 | Same-source order with an existing attempt | **HELD (conservative).** `provider_unbound_event_held`; manual observe refused `UNCERTAINTY_HELD`; cancellation refused `UNCERTAINTY_HELD`; eligibility `provider_uncertainty_held`. |
| 5 | Refused reservation leaves no residue | **PASS.** `UNCERTAINTY_HELD`. Attempt rows, the order's financial graph and the journal are byte-unchanged. That order can still be paid manually. |
| 6 | Unbound event before an attempt | **PASS (refused).** No new exposure on A. |
| 7 | Unbound event after an attempt | **HELD** (as in #4). |
| 8 | Manual verification while an unrelated source is quarantined | **PASS** (as in #1). Also, an event on A carrying an operator- or attacker-supplied `claimedRequestId`/`claimedQuoteId` for manual order 2002 gives `requestId=null`. 2002 stays unheld and verifies manually. |
| 9 | Concurrent event append versus reserve, quote, accept, cancel or verify | **PASS.** E1: 8 explicit lock-wait races in both orders, including manual verify against the global fence. E2 invariant: 8 reservations, 2 unbound events and 1 unrelated manual verify fired concurrently on F gave 11 OK, **0 orders exposed but not held**, and the unrelated verify succeeded. |
| 10 | Later fulfillment after legitimate provider exposure | **HELD, permanently.** Four orders on source E were settled and verified, and one had already shipped. One later unbound event on E then made all four ineligible. `supplier_processing→shipped`, `shipped→delivered`, `paid→supplier_processing` and `paid→cancelled` were all refused with `FULFILLMENT_HELD`, while payment stays `verified`. A fresh reservation on E is refused. A pre-existing settled and processing order on A cannot ship either. |
| R | Late event on a **revoked** source | Appended as `quarantined`, and that source's attempted order stays held. Revocation does not erase exposure. |

### Verified properties

- **Journal immutable.** Update and delete are refused with `ASSISTED_ORDER_PROVIDER_IMMUTABLE` (E1 also covers
  truncate and replica mode). An exact replay is byte-identical, and a changed replay appends an unattributed conflict.
- **No operator-selected request becomes evidence.** Claimed ids never set `established_request_id` (#8).
- **No invented dismissal.** No `dismiss|resolve|attribut|release|unquarantine|adjudicat` function exists.
- **No settlement authority granted.** All four authority DTOs are byte-identical before and after a double install.
  The settlement authority still has `historicalAdoption:false`. No grant, source, policy or financial row is created.
- **No unrelated manual-only order inherits the hold** (#1, #5, #8, #9).
- **Same-source uncertainty stays conservative** (#4, #7, #10, R).
- **Effective-body scan.** After install, only three functions contain `established_request_id is null`: the two new
  scoped helpers, and the journal classifier's own `j.source_id=p_source_id … providerPaymentId` conflict rule, which
  is source- and payment-scoped. No global check remains.

### Why PARTIAL, not CLOSED

**ADP-G1-R1 (P2-latent, blocking before any provider source is provisioned; confirmed by E2 #10).** The blast radius
is now one **source**, which is the processor account and mode. It is still permanent and unresolvable.

One unattributable event on a source does three things:
- it permanently refuses every new reservation on that source;
- it freezes every order ever exposed to it, including settled, verified and already-shipped orders: they cannot ship,
  deliver, close or cancel, and there is no refund path;
- it strands abandoned-attempt orders, which can then be neither paid manually nor cancelled.

None of this can be undone:
- there is no attribution, dismissal or review record;
- journal rows are immutable;
- `unique(provider_namespace, account_ref, mode)` prevents re-provisioning the same account as a new source;
- revocation keeps the hold.

Realistic triggers:
- any non-Xenios charge or dispute event on a shared processor account;
- Codex's own next-slice case: a later valid event for an already-bound payment that omits attempt metadata, which
  classifies as `unknown_attempt`.

This is fail-closed, with no money misstated. It is not operable for a live source.

**ADP-G1-R2 (P3).** Post-shipment record-keeping transitions (`shipped→delivered`, `delivered→closed`) are held
together with fulfillment release. Those transitions release nothing; the resolution model should distinguish them.

**ADP-G1-R3 (P3).** `account_ref` is free text with no normalization. Casing or whitespace variants of one real
account could be provisioned as two sources, splitting source-scoped quarantine. Provisioning is owner-SQL only;
normalize or canonicalize before activation.

**ADP-G1-R4 (P2-latent, new):** cross-scope events are re-homed under the receiving source. See E4.

The Codex handoff states R1 honestly: "partial ADP-G1", attribution not implemented, and G2–G4 open.

## Other gates

| Id | Status | Basis |
| --- | --- | --- |
| **ADP-G2** (attempt abandon/expiry) | **OPEN (P2-latent)** | No change. E2 #4 shows its interaction with G1: an abandoned attempt on a quarantined source can be neither paid manually nor cancelled. |
| **ADP-G3** (recovered `unknown`, interrupted claim, decline-then-retry) | **OPEN (P2-latent)** | No change. |
| **ADP-G4** (late or benign facts after settlement) | **OPEN (P2-latent)** | No change. G1's request-scoped graph check still freezes fulfillment on any new bound fact. |
| **F1** (evidence source and grant procedure) | **OPEN (P1)** | `server/index.ts` is byte-unchanged. `AssistedOrderFinanceService(…, null)`, and every provider source is null. |
| **REFUND-ABSENT** (refund, void, partial refund, dispute) | **OPEN (P2)** | No new disposition kind. The only SQL change is migration 94. |
| **LENS-01** | **Detection CLOSED; adoption OPEN (P2)** | See below. |
| **GATE-01** | **OPEN (P1 release hold)** | Unchanged. The B-1 Access Hub decision belongs to Samuel. Claude does not make it and amends no hash. |

### LENS-01 (E3)

On a pre-80 disposable database with three synthetic envelopes, the `8549011` census returned:
- `legacy_paid_notices: 2`, from one delivered envelope and one cancelled-delivery envelope with an orphan reference;
- `adoption_required_outbox_rows: 2`;
- `notification_chain_gate: "NO_GO"`.

A clean database gave `CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION`. Claude then applied 80–87 and the unchanged migration 88
(exact blob `8121e537…f743`) to the same database. Migration 88 aborts with `ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED`
and adds no columns. So the census and migration 88 now agree, and the handoff's "detection, not adoption" wording is
truthful.

The coordinator relays a production census of 0 legacy paid notices, 0 frozen historical paid orders and 2 submitted
requests. Claude has **not verified** it. The current production runtime writes such a notice on every admin paid
transition, so a zero count is valid only if the census is re-run inside the managed apply window, immediately before
migration 80.

### Records truthfulness

**Full suite:** the handoff represents it accurately:
- **FAILED**, exit 1: 19,443 pass, 3 fail, 85 skip;
- the 3 failures are 2 protection assertions and the real-repository pgcrypto scan timeout at 13,749 ms against a
  5,000 ms limit;
- the passing pgcrypto diagnostics are kept separate and "do not replace the failed aggregate".

Claude did not re-run the full suite.

**Other claims:**
- It declares partial ADP-G1, G2–G4 open, REFUND-ABSENT open, LENS-01 adoption unresolved, F1 open and GATE-01 open.
- It makes no managed, production, deployment or Claude-acceptance claim.
- It says the partnership fix is **not** mounted on the current public journey.
- See E4 below for lens-verified details.

## E4: lens review of the other changes from `8f24082` to `c0e25c7`

The five lenses were admin session, HL-01 details, partnership, records, and an ADP-G1 bypass hunt. Each P0–P2 claim
got an adversarial verifier; P3s are recorded but were not verified. Full text is in `hl12/c0e25c7_lens_findings.json`.

### New finding

**ADP-G1-R4 (P2-latent; upheld by the verifier and checked by Claude in source): cross-scope events re-homed under
the receiving source.**

The ingress (`server/research/assisted-order/payment/provider-journal.ts:173-177,195`) handles an authenticated event
whose provider, account or mode differs from the receiving source like this:
- it strips all claims;
- it appends the event under the receiving `sourceId`;
- its comment says this "becomes a global uncertainty hold".

`provider-journal.test.ts:184-191` locks that behaviour in.

At `c0e25c7`, SQL holds only orders exposed to the receiving source (E2 #3 executes this half: an unbound row on A does
not hold live source C). So a `refunded` or `dispute_opened` event for a **live** order, delivered to the **test**
ingress, no longer holds the live order: `paid→supplier_processing→shipped` stay allowed. Before `c0e25c7`, the global
predicate held it.

The precondition is narrow. The adapter contract (`provider-adapter.ts:72`) says authentication must check account and
mode, so a conforming adapter would refuse such an event. Even then, the misrouted live event is dropped and nothing
holds R_live, which was also true before. The builders are composed in `server/index.ts` with `source: null`.

Fix one of two ways before provider ingress is activated with more than one source:
- refuse scope-mismatched events at ingress, with an alerting record; or
- mark them as a scope mismatch, carrying the declared scope, and hold that scope or hold globally.

Either way, correct the comment.

### Other lens results

**Admin session isolation (`6d64d3e`):** no P0–P2.
- Request A versus B, cross-actor bleed and implied success are all prevented.
- A duplicate submit is refused by server compare-and-set.
- **P3 F1:** an hourly same-user token refresh remounts the page. That wipes the draft and filters, and can silently
  drop an in-flight PATCH outcome. Fix: key on actor identity, or show "outcome unknown, re-check".
- **P3 F2:** a one-tick window lets a document ticket call `window.open` after sign-out.

**HL-01 details:** no P0–P2.
- The disclosure carries no price and no ordering affordance.
- Native `details` gives acceptable accessibility.
- **P3 HL01-1:** held rows GRP-0422 and GRP-0365 show "Maximum request quantity 100" and "Availability is confirmed
  separately", which is request-term copy on unorderable rows. Treat held rows like Care in the disclosure.
- Pre-existing and latent: a bound, priced held row would show a price on the card face.

**Partnership receipt (`c9677cb`):** no P0–P2.
- Codex's "not mounted on the current public journey" claim is **confirmed**. `App.tsx:246-249` redirects all four
  legacy routes first.
- Receipt, clipboard, duplicate-submit and unmount guards are correct.
- **P3 PIR-01:** after an edit made while the request is in flight, followed by an uncertain failure, the retry copy
  wrongly promises duplicate safety.

**Records:** no P0–P2 overclaim.
- Migration 94 replaces 9 functions: the 6 consumers, plus `attempt_guard`, `settlement_integrity` and the
  byte-identical fingerprint.
- The registered LF hash, the dependency on 93, the DAG at 53 nodes and the full-suite archive numbers all match.
- There are no protected or manifest edits since `8f24082` and no managed claims.
- **P3 REC-ADPG1-01:** the "install smoke applied the exact migration" run predates the commit and is not
  hash-bound. Run 2 is the hash-bound proof.
- **P3 REC-ADPG1-02:** `MIGRATIONS.md:789` says "seven effective function bodies"; it should say eight changed (nine
  replaced).

**ADP-G1 bypass hunt:** besides R4, no escape.
- Every money and fulfillment write path for an attempted order passes a request-scoped check.
- The payment-effects outbox can still release a held "Payment verified" email after the source becomes quarantined.
  That changes no money state and is unchanged from the predecessor, so it is noted, not raised.

## Remaining findings at `c0e25c7`

- **P0:** none found.
- **P1:**
  - **F1:** no evidence source or grant procedure.
  - **GATE-01:** protected `static.ts`/`App.tsx` hashes; the Access Hub decision is Samuel's.
- **P2:**
  - **ADP-G1 remainder:** R1, permanent source-wide freeze with no resolution; R4, cross-scope re-homing.
  - **ADP-G2, ADP-G3 and ADP-G4.**
  - **REFUND-ABSENT.**
  - **LENS-01 adoption.**
  - All of these are latent while every source is null, except REFUND-ABSENT and LENS-01, which bind the managed apply
    and launch operations.
- **P3, new:**
  - ADP-G1-R2 and R3;
  - admin F1/F2;
  - HL01-1;
  - PIR-01;
  - REC-ADPG1-01/02;
  - Codex's proof prints the CRLF checkout hash.
- **P3, carried:** the P3 table in report 24.

## Next smallest engineering slice

Claude agrees with Codex's own proposed next slice, with one prerequisite.

0. **Fix ADP-G1-R4 first.** It is small, and it restores the fail-closed promise for cross-scope events:
   - **Option 1:** refuse scope-mismatched events at ingress and record a non-financial alert.
   - **Option 2:** persist the declared scope and hold the declared source, falling back to a global hold when it is
     unknown.
1. **Attribution receipt.** Covers a later valid-scope event whose `providerPaymentId` (and session) equals a
   pre-existing exact same-source binding with a durable bound create result.
   - SQL derives the target; it is never operator-selected.
   - The original journal row is kept unchanged.
   - Only that row's source-wide effect is removed; its derived target stays held.
   - Attribution never grants settlement.
   - Prove: missing or conflicting session identity, source/account/mode, grants, changed replay, interruption, and
     both lock orders.
2. **Then:**
   - a positively evidenced resolution for truly foreign or early events;
   - a separate rule that post-shipment record-keeping transitions do not release goods (R2);
   - G2 abandonment and expiry, which E2 #4 shows is needed so a stranded attempt can be cancelled.

## Production: **NOT READY**

Claude approves no production promotion and no managed apply. The Access Hub decision and protected-hash amendments
remain Samuel's.
