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

There are two distinct layers. The existing durable checkout foundation is the
same four-candidate sequence, in this order:

1. `20260909150000_research_checkout_executions`
2. `20260910201400_research_checkout_credit_reservations`
3. `20260910120000_research_checkout_execution_recovery`
4. `20260910220129_research_checkout_recovery_operation`

The refund remediation adds a fifth, later prerequisite for checkout readiness:

5. `20260921_research_refund_execution`

The fifth candidate must run only after all four checkout candidates. It adds
the durable refund-intent authority, SECURITY DEFINER prepare/claim/evidence/
reconciliation/commit RPCs, active claim/order mutation guards, and the refund
execution foreign-key binding on the existing payment webhook inbox. Because
the production composition now requires this authority before accepting new
purchases, installing only the original four is not sufficient to activate
checkout.

LF-normalized SHA-256 identities:

| File | LF SHA-256 |
|---|---|
| `20260909150000_research_checkout_executions.sql` | `5f3178756d017ab11d939c171d379ef153f1ae72791611f087e3c546518d6bfd` |
| `20260910201400_research_checkout_credit_reservations.sql` | `1196169a2d29cb7bf62e29326ed689bdd9f668d43abe6977d97dd087de70033e` |
| `20260910120000_research_checkout_execution_recovery.sql` | `c63563dc5e378e95d35f70f3f99acf966ab74c4019edcb7f7dfa82872bf383ba` |
| `20260910220129_research_checkout_recovery_operation.sql` | `a2fd98dfc80a921caa3eb1c6bb2b5e0d8a7c581b9ad3dcfaae65dd4fafa37fb0` |
| `20260921_research_refund_execution.precheck.sql` | `4cba831ad3e94e077f8872c67e933adea570aced5e8f3a08cb4dbd32ef7f59e1` |
| `20260921_research_refund_execution.sql` | `894e70909f48caa5fe5f13ea091e211d1be79750ab60684a8430d08963c71a16` |
| `20260921_research_refund_execution.postcheck.sql` | `7202535e263ba76ebcf589463a9230da7b00636631521aa443cb7f17f27e8810` |
| `20260921_research_refund_execution.rehearsal.sql` | `2b55a01bed5aa42011f3e85cbedfa11c7490af854a5efd5ea76bfee9aa8f4f8e` |

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
  marker, and no unsupported Connect account configuration.
- Customer checkout readiness is one full-money-path decision. Durable checkout
  execution, durable webhook inbox, client Stripe configuration, and durable
  refund authority must all be ready. Omitting refund authority is fail closed.
- A captured webhook receipt remains `processing` until the canonical
  `commitCaptured` path commits the order and checkout execution. A crash or
  contention returns non-2xx and redelivery resumes the same execution.
- Refund intent is persisted by a locking RPC before the provider call. The
  same execution id is placed in provider refund metadata. Provider replay is
  allowed only inside the hard 20-hour ceiling; after that the operation moves
  to reconciliation and no new provider refund call is issued.
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

The new candidate's precheck, migration, postcheck, and transactional rehearsal
passed in a disposable in-memory PGlite 0.5.8 / PostgreSQL 18 runtime:

```json
{"status":"PASS","scope":"LOCAL_MEMORY_ONLY","runtime":"@electric-sql/pglite@0.5.8"}
```

That rehearsal covers exact prepare replay, conflicting replay refusal,
compare-and-swap contention, first-attempt persistence, active claim/order
guards, refund-inbox binding, provider evidence, atomic projections, ledger/
event single-write, RPC/table privilege postures, and direct service-role write
refusal. It is one connection and does not claim a real two-session lock race.

Focused Node 20.19.0 results at the final source state:

- `server/research/commerce` plus `server/research/providers/payment.test.ts`:
  57 passed files, 1 classified skipped file; 2,492 passed tests and 3
  classified skips.
- durable checkout client/payment UI: 3 passed files, 39 passed tests.
- refund/provider/webhook/persistence/production-wiring focus: 7 passed files,
  715 passed tests.

Repository-wide `tsc --noEmit --pretty false` passed at the final source state.

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
- a true two-session PostgreSQL refund prepare/claim contention run;
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
