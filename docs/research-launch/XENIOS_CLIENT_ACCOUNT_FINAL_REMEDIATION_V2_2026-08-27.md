# Xenios client-account RC — FINAL P1/P2 remediation recut v2 (2026-08-27)

The second independent Codex adversarial review failed
`22396613a1d67aa2eed429fa012dcbf8e8e479a4`. It narrowed the problem sharply:
P1-1 auth binding, P1-2 active-member catalog protection, P1-8 migration
privileges, and P1-11 import integrity PASSED and are preserved. The remaining
seven blockers were evidence-model defects, not architecture — monetary facts
discarded, history completeness lost, unavailable Care converted to a factual
"not enrolled", config strings treated as authorization, invitation approval
not bound to the evidence approved. This recut fixes all seven and closes all
four P2s. The failed SHA is not to be deployed; both prior failed branches are
untouched.

## P1 dispositions (this round's seven)

| # | Finding | Disposition |
|---|---|---|
| P1-A | Payment truth from lifecycle | **FIXED.** Monetary facts (`amountDueCents`/`amountCapturedCents`/`amountRefundedCents`/`currency`) now ride `OrderSummaryDto.payment`, closed through from `research_orders.refunded_cents` on the commerce lane and from the verification invariant on both EA lanes. `paymentFromFacts` implements the reviewer's canonical mapping verbatim; lifecycle is CONTEXT only (interprets an absent capture as zero in provably pre-capture states; flags money/lifecycle contradictions as unknown). `payment_captured` with no capture evidence → unknown; `refunded` with no refund evidence → unknown; 10,000/1,000 → partially_refunded. Every reviewer repro pinned. |
| P1-B | Fabricated order history | **FIXED.** No fabricated lines: absent lines → `detailAvailability:"unavailable"`, null label/quantity, never "Research order"/0. History is a DISCRIMINATED per-source model (`{availability, sources:{commerce,xea,xec,xrr:{connected,complete}}}`) derived by a shared helper at the composition root — "unavailable" is never an empty list. Fulfillment requires a CONNECTED shipment source (unconnected → unknown, never unfulfilled) then evidence. Cross-source dedupe added. Overview consumes `accountStanding`: "up to date" only when provable; counts over partial history render unknown, never 0. |
| P1-C | Disputed billing renders green | **FIXED.** One canonical `billingPresentation` (shared) is the sole place billing states become words/tones; nothing defaults to green, disputed/past_due are danger "attention required", unknown/unrecognized are neutral "unavailable". Overview, SubscriptionView, badges, and the "up to date" language all consume it. Tested every state with enforcement ON and OFF. |
| P1-D | Unavailable Care = "not enrolled" | **FIXED.** `CareEnrollmentDto` is discriminated: `{sourceState:"unavailable"}` carries NO enrollment claim; enrollment truth (either way) exists only under `sourceState:"available"`. The production port answers "unavailable" (no durable Care source); overview, subscription, and the Care page all render "Care status unavailable", never "not enrolled". Care is not expanded, not inferred from anything. |
| P1-E | Config text as approval | **FIXED.** `isValidActivationApproval` requires a substantive approver and a strict, real, in-era ISO-8601 UTC instant (round-trip refuses impossible dates); the resolver and loader both consume it, and the loader fails the whole load on a present-but-invalid approval. And structurally: a valid approval still only lets the overlay STOP restricting — it can never promote a non-orderable base. Full attack set. |
| P1-F | Mutable, unbound approval | **FIXED BUT UNAPPLIED.** The candidate migration binds each approval to an immutable evidence snapshot (server-computed sha256 over staging identity/contact/consent/partner + `row_version`), re-verifies it on every queue/sent advance (with re-checked contact/consent eligibility and a still-active approver), freezes the approved staging evidence, makes the approval record immutable for every writer, forbids re-pointing, and aligns the check constraint with the trigger's one state machine. The stale "v2 all refused" and "v1 18/18 refused" claims are withdrawn: counted v2 is V2-1 positive plus 11 refusals; v1 has 18 mapped historical rows, with A14 now nonconstructible and represented by one positive vocabulary assertion plus one refusal. V2-7 is additional, historically positive, and currently superseded by two stricter-model refusals. Exact rollback/reapply rehearsed. STILL NOT READY FOR APPLY. |
| P1-G | Caller text echoed in import output | **FIXED + PRODUCTION-DISABLED.** `sourceLabel` is removed from the model entirely; the report identifies its source with a server-authored enum (`sourceType:"partner_client_import"`) plus the server-created batch id. A recursive-marker test plants a unique marker in every caller-controlled field and asserts it is absent from the whole response — success AND error. Route stays flag-disabled. |

### 2026-08-28 P1-F evidence correction

The pinned disposable harness ran twice with the same logical-result SHA-256,
`7b84af47bdcc99f471e5ef986b34e1e13347377686d75b0baa89b94a2eff1703`.
Each run contains two full apply/attack/rollback passes. Per pass, the broad
suite is 37 refusals + 11 positives; the stable-ID narrative suite is 31
refusals + 2 positives. The latter covers exactly 18 counted v1 historical
rows (19 executable replacements), 12 counted v2 rows, and uncounted V2-7
(two executable replacements), with no duplicate or unmapped execution.

A14's historical accepted-state rewind cannot be built because both current
CHECK vocabularies exclude `accepted`; its replacements prove the exclusion
and refuse sent → queued. V2-7's historical revoke/edit/reapprove/queue
success is superseded by the current revoked-terminal and immutable-history
model; the harness proves both reapproval and a second history are refused and
does not weaken the candidate to recover the old success.

The runner uses only the locally verified
`postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`
image with `--pull=never --network none`. It proved two identical logical
object deltas, the exact state-preserving `P0001` in-place refusal, and exact
baseline restoration after both non-`CASCADE` rollbacks.

Rehearsed inputs (SHA-256):

```text
da388c62bb7482622521db087ac8439bcea0ab1967e42221c68e1cf9fd608919  20260826_research_client_accounts_blitz.sql
a9aad83261a28beef3a86deed11def0a594f73c33aa8b11258a5db083f9e769b  20260826_research_client_accounts_blitz.attack-map.json
c4f5c4b46123f61ad399b66a2b27bc604aa4338d6b105a808c1188c678ba81b1  20260826_research_client_accounts_blitz.disposable-bootstrap.sql
00b3e6e46a4d994ad30061d6c6d536c75c1d1367c1c551c544cb53036533299a  20260826_research_client_accounts_blitz.capture-objects.sql
f1081726ac886a44b44eea14dd6d3fd0547cf2e2d7a518397fc2af33e15e9b0a  20260826_research_client_accounts_blitz.attacks.sql
c2f5e93b5b865c19cf98b4ed17389f7133a40abbf8ef758b6f9eca68ddeed377  20260826_research_client_accounts_blitz.narrative-attacks.sql
ff296b4786bc338d108b20bd03a89b183bfa5592a8393022a716c3f138490588  20260826_research_client_accounts_blitz.rollback.sql
df1fff3c9cb2998a14ee02e549dfd9cc9f8f24f17a08e717274fcc6757f92cbf  20260826_research_client_accounts_blitz.verify-rollback.sql
fbdc0b1f1eb30c7f7edb2ae8f4c4b8e3a189c7229c10f8551f3ab19730f0d8e3  20260826_research_client_accounts_blitz.rehearse.ps1
```

The candidate is still unapplied. The remaining reviewer-only decision is
whether to accept the stricter A14/V2-7 supersession as the intended model.

## P2 dispositions (all four closed)

- **P2-1 interactive targets** — card-action links, footer Privacy (at all widths), and the PWA dismiss/action buttons now carry ≥44px hit areas (inline-flex + min-height); nav links and `.btn` already did.
- **P2-2 account main landmark** — the account shell's page body is now `<main>`; account routes get bare chrome, so exactly one main. Tested.
- **P2-3 support rate limit** — one member-scoped support authority (`member-support-submission:<id>`) consumed by BOTH questions doors and the account support door; exhaustion surfaces as 429 `rate_limited`, never 500. Alternation + source-pin tests.
- **P2-4 confirmation nested main** — the assisted-order confirmation root is now `<section>`; MinimalChrome supplies the page main. Tested (page renders no main of its own).

## Preserved gates (re-run, not regressed)

P1-1 exact auth_user_id binding, P1-2 active-member catalog-priority guard,
P1-8 REVOKE-first migration privileges, P1-11 import normalization/integrity,
customer isolation, return-path security, document isolation, support
persistence, route census (399/408), Early Access flow (e2e 53/53),
Hino/public site, Node 20.19.0 toolchain, secret/PII scans.

## Release scope declaration

**ENABLED + AUTHORITATIVE** — sign-in/returnTo, account chrome (one main),
identity, membership access state, membership BILLING state via the canonical
presentation, research orders with money-fact-derived payment states from
connected sources, catalog-priority (active members, monotonic, valid-approval-
only), support (one shared budget), documents.

**ENABLED + EXPLICIT UNKNOWN/UNAVAILABLE** — payment where money facts are
absent/contradictory → unknown; fulfillment without a connected shipment source
→ unknown; order history → discriminated per-source availability, "up to date"
only when provable; billing where no value is readable → neutral unavailable;
Care → "Care status unavailable" (no durable source).

**PRODUCTION DISABLED** — client-import admin surface; real invitations,
partner seed, persistent import, activation-audit persistence (migration-
dependent).

**FUTURE MIGRATION REQUIRED** — `supabase/candidates/20260826_research_client_
accounts_blitz.sql` (reworked, v2-attack-rehearsed, NOT READY FOR APPLY); XRR
list-by-member read; XEC cart-history RPC; durable Care source; Stripe billing
portal/renewal schedule; and the commerce refund lane writing an amount that a
future EA refund concept could mirror.

Verification numbers, browser QA evidence, and the recut SHA are in the final
handoff for this branch.
