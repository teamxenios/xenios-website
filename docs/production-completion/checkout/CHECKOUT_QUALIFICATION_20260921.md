# Checkout, webhook, and refund qualification — 2026-09-21

This is a review packet, not authority to install SQL, change a secret, deploy,
activate checkout, or move money. The source defaults remain fail closed and no
managed database or external provider was mutated by this remediation.

## Current production observation

The earlier read-only observation in this packet recorded HTTP 200 from
`https://xeniostechnology.com/api/health` and
`https://xenios-website.onrender.com/api/health` at `2026-09-21T17:59Z`.
Commerce was disabled. The health response did not expose a commit SHA, so it
did not independently prove the sprint-supplied live identity
`c545a70eb694d990842ad1259df4f0786dab92c9`.

A later authenticated, read-only Render observation resolved service
`srv-d8s9vej7uimc7384dfcg` and its live deploy
`dep-dag8l567bikc738a1nj0` to exact commit
`c545a70eb694d990842ad1259df4f0786dab92c9`. The service is configured from
branch `release/early-access-code-session-checkout` with auto-deploy disabled.
The public health endpoint still returned HTTP 200 with commerce false. This
authenticated control-plane observation establishes the live deploy identity;
the earlier health response alone did not. No Render setting, deploy, secret,
or other production resource was written.

A fresh authorized read-only observation found Supabase project
`yvzeduaxbwgcwllhywff` `ACTIVE_HEALTHY` on PostgreSQL 17.6. Migration history
included `20260921172323 research_assisted_order_member_history_20260921`.
One metadata-only query returned true for every reviewed postcondition:
`status_exists`, `nullable_guard_corrected` (`if v_authorized is not true
then`), `member_history_exists`, `customer_status_exists`, both functions
`SECURITY DEFINER`/`STABLE` with an empty `search_path`, anon/authenticated
EXECUTE denied, and service-role EXECUTE present. The migration was not
replayed and no database write was made.

## Required SQL order and exact identity

The P1-remediated durable checkout chain is installed in this order:

1. `20260909150000_research_checkout_executions`
2. canonical inventory lot/COA and reservation-command migrations, then
   `20260909170000_research_checkout_atomic_preparation`
3. `20260910201400_research_checkout_credit_reservations`
4. `20260910120000_research_checkout_execution_recovery`
5. `20260910220129_research_checkout_recovery_operation`
6. `20260921_research_refund_execution`

The refund candidate must run only after the preceding checkout authorities. It adds
the durable refund-intent authority, SECURITY DEFINER prepare/claim/evidence/
reconciliation/commit RPCs, active claim/order mutation guards, and the refund
execution foreign-key binding on the existing payment webhook inbox. It also
adds `research_checkout_money_capability()`, whose exact version is returned
only when the database proves the complete required chain: checkout execution
claim/provider/settlement functions, recovery discovery and operation,
credit-reservation guards, refund execution transitions, webhook receipt
authority, guarded order-effect transitions, RLS/triggers, least-privilege
ACLs, normalized function-body fingerprints, SECURITY DEFINER/invoker mode,
fixed search paths, and safe ownership. Installing only
the original four candidates is therefore not sufficient to activate checkout.

LF-normalized SHA-256 identities:

| File | LF SHA-256 |
|---|---|
| `20260909150000_research_checkout_executions.precheck.sql` | `515af7938470f6b80294457140825558fe1bdcefc8477d125eab917b67ab3b3c` |
| `20260909150000_research_checkout_executions.sql` | `0aa4e24d5056ed3db5dfca30fb256955b8af2b15025244868fb3d86929dc1317` |
| `20260909150000_research_checkout_executions.postcheck.sql` | `d488ae8e0a31e1279fa0daea95ede3edf78cd891b992b0511f8225d4973cbfc0` |
| `20260909150000_research_checkout_executions.rehearsal.sql` | `622279f39c24bcbb995fb23ef980fa202e3396ce0459ff14b6912440a991dc15` |
| `20260909170000_research_checkout_atomic_preparation.sql` | `5319c8c139be3f20b0648963e76ff2108340247c09eab39766b91b2cc7188953` |
| `20260910201400_research_checkout_credit_reservations.sql` | `aedc5b073ff51c4c8e2c60f8ccf1b582a6f3f58fb41eaab47d171327b16caab4` |
| `20260910201400_research_checkout_credit_reservations.postcheck.sql` | `9774dd97549591e34309b4a41f22411e448e45719e95abc2c3b3818c752c7122` |
| `20260910120000_research_checkout_execution_recovery.sql` | `c63563dc5e378e95d35f70f3f99acf966ab74c4019edcb7f7dfa82872bf383ba` |
| `20260910220129_research_checkout_recovery_operation.sql` | `a2fd98dfc80a921caa3eb1c6bb2b5e0d8a7c581b9ad3dcfaae65dd4fafa37fb0` |
| `20260921_research_refund_execution.precheck.sql` | `17d58ebe8c33d25f56ed2311855abf927c05435a65d20409894a098e4d0afc26` |
| `20260921_research_refund_execution.sql` | `1fa06c3163b910f805d42a6ae08ab28ccc6f48a76399ce2b6092dcd6a956abd9` |
| `20260921_research_refund_execution.postcheck.sql` | `798d4f8a56e123c39101ec837578489467c744996ab6d9e2779f4dee0697f374` |
| `20260921_research_refund_execution.rehearsal.sql` | `aea2196f9d3577d8e5a812db9e15d50a06e7c94daae867feaeda38d8349fdb27` |
| `refund-execution-sql-rehearsal.mjs` | `d8b40f77330a6b89dca8c6b3402159728512479937433ae1d91e22ae84ac7e26` |

For candidate 5 the authorized disposable-database sequence is exactly:

1. precheck with `ON_ERROR_STOP=1`;
2. candidate install;
3. catalog-only postcheck;
4. transactional rehearsal (always rolls back);
5. record the database identity, application SHA, hashes above, and PASS output.

The reviewed rollback preconditions and order are in
`20260921_research_refund_execution.rollback.md`. No candidate in this section
was applied by this session.

## Money-path behavior now enforced in source

- Provider selection is server-only and defaults disabled. Stripe requires the
  commerce flag, an unambiguous `stripe` selector, complete publishable/secret/
  webhook keys with valid shapes, matching test/live modes, no synthetic
  marker, and no unsupported Connect account configuration. Matching `pk_*`
  and `sk_*` modes prove only key-shape consistency; they do not prove that the
  two keys or webhook secret belong to the same Stripe account. Checkout must
  remain disabled until an authenticated provider account-readback check is
  added to the activation procedure.
- Customer checkout readiness is one full-money-path decision. Durable checkout
  execution, durable webhook inbox, client Stripe configuration, and durable
  refund authority must all be ready. The server preflights the exact managed
  capability version before exposing client configuration, accepting a checkout
  submission, continuing/cancelling an execution, processing a payment/refund
  webhook, or initiating a refund. Member-visible `product_commerce` starts
  false and cannot become true from static composition readiness alone; the
  capability API awaits a managed preflight before answering. Missing SQL, an RPC
  error, a null or stale capability version, or a failed fingerprint is fail
  closed.
- Webhook receipt creation and terminalization are available to `service_role`
  only through locked SECURITY DEFINER RPCs. The table is directly readable but
  not directly insertable, updateable, deletable, truncatable, referenceable, or
  triggerable by that role. Provider/event identity, event type, payload digest,
  receipt time, execution/refund binding, and terminal result are immutable;
  terminalization is one-way and only an exact replay is accepted.
- A captured webhook receipt remains `processing` until the canonical
  `commitCaptured` path commits the order and checkout execution. A crash or
  contention returns non-2xx and redelivery resumes the same execution.
- Refund intent is persisted by a locking RPC before the provider call. The
  same execution id is placed in provider refund metadata. Provider replay is
  allowed only inside the hard 20-hour ceiling; after that the operation moves
  to reconciliation and no new provider refund call is issued.
- A Stripe refund response is accepted as provider evidence only when its
  metadata echoes the exact `xeniosRefundExecutionId` supplied with the request.
  Missing or mismatched metadata is a permanent, non-retryable provider
  validation failure and cannot be committed locally.
- A lost response is recovered by exact provider readback. Provider-terminal
  `refund.created`/`refund.updated` objects can also finish the same execution
  through the durable inbox. The aggregate `charge.refunded` event is not
  settlement authority because it cannot unambiguously name one refund
  execution.
- Refund execution, refund ledger key, order state/amount, claim resolution,
  and order event commit in one database transaction. Exact committed replay
  verifies the canonical projections before returning success.
- The client never supplies price and never accepts raw card number, expiry, or
  CVC. It receives only the server-approved provider client configuration and
  sends a provider payment-method reference.

## Local evidence

The complete candidate chain (checkout execution, inventory/atomic preparation,
credit reservation, recovery discovery, recovery operation, and refund),
its prechecks, migrations, postchecks, and transactional rehearsals passed in a
fresh disposable in-memory PGlite 0.5.8 / PostgreSQL 18 runtime:

```json
{"status":"PASS","scope":"LOCAL_MEMORY_ONLY","runtime":"@electric-sql/pglite@0.5.8"}
```

That rehearsal covers exact prepare replay, conflicting replay refusal,
compare-and-swap contention, first-attempt persistence, active claim/order
guards, locked webhook claim/terminalization, digest and binding tamper refusal,
provider evidence, atomic projections, ledger/event single-write, full RPC/table
privilege postures including direct `TRUNCATE` refusal, the exact complete-chain
capability token, function-body and execution-attribute tamper refusal, and ACL
tamper refusal. It is one in-memory engine and does not claim a real two-session lock
race, managed PostgREST behavior, or provider delivery.

Focused Vitest results at the final source state: 13 passed files and 790 passed
tests across managed capability gating, checkout submission/config and
continuation, production visibility, refund execution, provider validation,
webhook processing, strict repository readback, and the connected checkout
journey. Repository-wide
`tsc --noEmit --pretty false` and the production build also passed.

## Managed Stripe qualification and explicit NOT_RUN gates

The managed launcher remains safely NOT_RUN without its authorized target:

```text
NOT_RUN base_url_missing
XENIOS_QUALIFY_BASE_URL is not set
```

The connected journey now includes `durable_claim_refund` in
`REQUIRED_SCENARIOS`. The current managed launcher deliberately declares that
capability false because it has no owner-approved admin credential and no
mounted claim/refund observation port. Therefore no receipt can qualify merely
by passing the purchase scenarios. A qualifying hosted run must create a
captured purchase, submit and approve its claim through the mounted surfaces,
refund it, prove one provider refund across exact replay, and reconcile the
committed refund execution, claim, order, amount, currency, and provider
reference.

The following evidence is external and remains **NOT_RUN**:

- applying all five candidates to the authorized non-production project, with
  every precheck/postcheck/rehearsal receipt;
- a true independent-connection PostgreSQL checkout/refund/inbox contention
  run (the local PGlite gate uses one in-memory engine);
- the complete managed test-mode journey, including hosted 3DS return, process
  restart, controlled local-commit failure, and the required refund scenario;
- a Stripe-delivered (not harness-signed) refund settlement webhook proving the
  configured endpoint subscribes to `refund.created` and `refund.updated`;
- same-account publishable/secret-key proof through Stripe.js plus server
  PaymentIntent continuation; and
- the separately founder-authorized live low-value purchase/refund smoke.

The mounted webhook route is `/api/research/webhooks/payment`. JSON parsing
retains the exact request buffer on `req.rawBody`; verification receives those
exact bytes and the signature before mutation. Harness-signed delivery proves
that route and verifier but is not relabeled as provider-delivered evidence.

## Activation sequence (not performed)

After the managed receipts pass, activation still requires an exact-SHA,
owner-authorized deployment and configuration change. At minimum:

- `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED=true`;
- `PAYMENTS_PROVIDER=stripe` (with no conflicting singular selector);
- same-account `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and
  `STRIPE_WEBHOOK_SECRET` in one mode;
- the four checkout migrations plus the fifth refund candidate verified by the
  hashes and receipts above; and
- `RESEARCH_REFUND_EXECUTION_ENABLED=true` only after candidate 5 is installed
  and its managed postcheck/rehearsal are green.

No flag or secret was added or changed here. Production checkout remains
disabled.

## Effects

- Production mutated: no.
- Staging mutated: no.
- Managed database migration applied: no.
- Stripe objects created: none.
- Render secrets changed: no.
- Checkout activated: no.
