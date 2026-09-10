# Final takeover: the payment and checkout lane

Worker: `fable-durable-payment-20260909` (Claude / Fable), closing out.
Successor: Codex, as sole integration owner for the whole Xenios Health build.

This is written so nothing about this lane is left only inside a chat session.
If one thing here is wrong, it is the SHA; verify it against the remote before
trusting anything else.

## Exact source

| | |
|---|---|
| Branch | `claude/durable-payment-port-20260909` |
| Head commit | `f8f6a4bc0eec841f469cb94bc8c608697b0bba67` |
| Head tree | `684fd09ea0f6efe370e3183e81612d3404a1fdd9` |
| Remote | verified equal to local by `rev-parse` after push |

Three commits to integrate, oldest first. They are cumulative; do not take one
alone.

1. `c29b825263ad9973db07b4edd82e2f19c6baf159` — the eight unattended properties, receipt and credit seams
2. `246e13e0ef460df2ba4cb090bf2b874694805dc1` — the managed journey binding; eleven invariants adopted from the verified package
3. `f8f6a4bc0eec841f469cb94bc8c608697b0bba67` — the harness was wrong about every surface it had to touch

## Exact recommended integration method

Codex's last published head is `27f84b2c0bb8f1e6fdc53424429a630d5f771ede`, which
is patch-equivalent to `370fa915` plus its own `unavailableDurableCheckout`
repair. It does **not** contain `c29b825`.

**Take the range, not a single commit.**

```bash
git cherry-pick 370fa9151d2dde1dd90629f2ec4282f8db681df3..f8f6a4bc0eec841f469cb94bc8c608697b0bba67
```

Verified before writing this: a three-way from the shared base `370fa915`,
Codex's head against `f8f6a4b`, merges with **zero conflicted paths**, result
tree `f5ff1a3c87a32217e61c19f3d543d799006bbe07`. Cherry-picking `246e13e` or
`f8f6a4b` alone conflicts in four files, purely because the middle commit is
missing.

I checked that with `git merge-tree --write-tree`, which writes only to the
object database. No worktree was created in Codex's checkout and its branch was
not touched.

## Breaking API changes across the range

Four. Each will fail to compile rather than fail quietly, which is deliberate.

| Symbol | Was | Now |
|---|---|---|
| `SweepOptions` | `cursor` | `checkpoint: {before, after}` |
| `RecoverySweepReport` | `cursor` | `checkpoint` |
| `settleUnattended` | `(memberId, requestKey)` | third optional arg `expected?: {updatedAt}` |
| `ReceiptRepairDeps.listCommitted` | `({limit})` | `({limit, after})`, and `repair()` takes and returns a cursor |

## Changed paths

New: `server/research/commerce/receipt-repair.ts` and its test;
`shared/research/checkout-credit-policy.ts` and its test;
`server/research/commerce/unattended-settlement.test.ts`;
`server/research/commerce/qualification/managed-journey-{config,binding,run}.ts`
and `managed-journey.test.ts`;
`server/research/commerce/qualification/qualification-fault-seam.ts` and its
test; `docs/research-commerce/MANAGED_JOURNEY_QUALIFICATION.md`; two handoffs.

Modified: `checkout-recovery-sweep.ts` and its test;
`durable-checkout-executor.ts`; `persistence/checkout-executions-store.ts`;
`qualification/connected-checkout-journey.ts` and its test;
`supabase/candidates/20260910120000_research_checkout_execution_recovery.{sql,postcheck.sql,rollback.md}`;
`.env.example`; `docs/research-launch/PROVIDER_READINESS.md`;
`docs/coordination/EXTERNAL_INPUTS_REQUIRED.md`.

## What is complete

- **The unattended settlement policy, proven on decisive fixtures.** All eight
  properties. Mutation-checked: four mutations of the implementation were each
  caught by exactly the intended test, and all three sources restored
  byte-for-byte afterwards.
- **Recovery discovery and cycle semantics.** Microsecond cursor, total order,
  fixed horizon per cycle, operator recording per row before the cursor passes
  it, a cursor that may only pass rows actually examined, and survival of a row
  that throws.
- **Receipt reconciliation**, off by default, verifying pre-existing rows as
  strictly as ones it writes.
- **Credit arithmetic and consent**, refusing rather than clamping.
- **The managed qualification harness**: configuration, binding, executable
  entry point, fault seam with a loopback control channel, and a browser driver
  written against the real CDP API.

## What remains, and who owns it

| Remaining | Owner |
|---|---|
| Mount the durable surface through `production-deps.ts` and `server/index.ts`; give `createWebhookHandler` its `executions` processor | Codex |
| A qualification entry point that composes the application over the fault seam and starts its control channel | Codex |
| Register `renderCommerceReceiptOutboxEmail` in the outbox dispatch chain (one line, shown in the module docblock) | Codex |
| Decide the prior receipt event keys, from code and authorized records | Codex |
| Decide the store-credit policy, and protect the balance under concurrency in the database | Codex |
| A committed-execution reader in SQL; `listCommitted` has no database implementation at all | Codex |
| Scheduler, durable checkpoint storage, operator-event store for the recovery cycle | Codex |
| Provision synthetic members and supply test-mode keys | Codex and the founder |

## Known high-risk unresolved issues

These are the ones I would look at first, in this order.

1. **The durable door never debits the credit ledger in TypeScript.** The debit
   exists only in the unapplied candidate SQL, and the in-memory store that
   documents itself as mirroring that function omits it. Do not add a second
   application-level debit; make the one in the transaction real.
2. **Nothing prevents two concurrent orders spending one balance.** The spend is
   an unlocked read-then-insert, and the candidate SQL insert performs no
   balance check at all, so the database and the application disagree about
   whether an overdraw is possible.
3. **The assisted door's payment-method gate trusts a client number.** It
   computes the requirement from `req.applyStoreCreditCents` while computing the
   charge from the server's own cart figure, so a request carrying a large value
   passes the gate while the order still owes money. This is the only server
   read of that field anywhere.
4. **Whether credit pays for shipping is answered two ways today.** The cart
   caps at the subtotal; the gate subtracts from subtotal plus shipping. The
   helper makes it a required field so it must be decided, not inherited.
5. **A refund never returns store credit**, and refunds are bounded by the
   captured amount, which is the amount after credit.
6. **The recovery cycle has nowhere to persist a checkpoint.** No job or
   checkpoint table exists anywhere in the repository, and no operator event
   store is keyed by execution id. Until one exists, the `record` callback is
   optional and the sweep is not an operational recovery service.

## Test results, kept honestly

| Run | Result |
|---|---|
| Focused: qualification, sweep, unattended, receipt, credit | 169 passed, 0 failed |
| Full suite at `c29b825` | 16359 passed, **1 failed**: `server/pgcrypto-qualification.test.ts` timed out at its 5s limit under load, passes alone in 438ms |
| Full suite at `246e13e`, twice | 16426 passed, 0 failed |
| Full suite at `f8f6a4b`, first attempt | 16451 passed, **2 failed** |
| Full suite at `f8f6a4b`, uncontended | 16453 passed, 59 skipped, **0 failed** |

The two failures in the first `f8f6a4b` run were mine: I started a second full
suite while the first was still running, and that run took 557s against a normal
290s. Both tests pass in isolation. I am recording the contended run rather than
deleting it, and I raised nobody's timeout.

All runs on the pinned Node 20.19.0. `tsc --noEmit` clean at every commit.

## Evidence actually obtained

Local deterministic tests against the real store, the real port, the real
coordinator, and a model of the provider's HTTP API.

**No** Stripe call, **no** PostgreSQL query, **no** browser launched, **no**
managed project read or write, **no** deployment, **no** email queued or sent.

Nothing in this lane is production-qualified. The managed harness is written and
typechecked; it has never been executed against anything, because the three
things it needs do not exist yet. Do not read a green local suite as provider
evidence.

## SQL still unapplied

Both candidates. `supabase/migrations/` contains no checkout-execution migration.

- `20260909150000_research_checkout_executions.*` — the table. Frozen for its own
  rehearsal. Its authorization covers this candidate only.
- `20260910120000_research_checkout_execution_recovery.*` — discovery for the
  sweep. **Not authorized.** It must not ride with the rehearsal above. I changed
  it twice today: the function now raises on half a cursor (which moved it from
  `language sql` to `language plpgsql`, losing inlining, with the trade-off
  documented in the file), and the index predicate now matches the function's
  filter exactly so settled cancellations do not accumulate in it forever. The
  postcheck asserts both.

There is still **no** committed-execution reader in SQL, so the receipt
reconciler cannot reach a database at all. The verified package supplies one as
a separate candidate. Consolidating that with the recovery candidate into a
single amendment is Codex's call.

## External prerequisites

| Prerequisite | Who |
|---|---|
| Founder scope confirmation naming `20260909150000_research_checkout_executions.sql` for project `tetynodzrtmdbuzgboro` | Founder |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` in test mode | Founder |
| A decision to open the evidence harness network boundary for the provider's domains, so a real 3DS challenge can be driven | Founder |
| The store-credit policy decision | Founder |

`STRIPE_PUBLISHABLE_KEY` was absent from every register; it is now in
`.env.example`, `PROVIDER_READINESS.md` and `EXTERNAL_INPUTS_REQUIRED.md`.

## Two things to know before planning a qualification run

- `authentication_challenge_and_return` can only be satisfied by a browser
  driving the provider's hosted challenge. No server call completes one.
- Declaring `browserDrivenChallenge: true` makes **two** required scenarios
  depend on the browser, because `process_restart_recovery` prefers the
  challenge method whenever one is declared.

## Exact next executable action for Codex

```bash
git cherry-pick 370fa9151d2dde1dd90629f2ec4282f8db681df3..f8f6a4bc0eec841f469cb94bc8c608697b0bba67
node C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Then mount the durable surface in the composition root and run the harness. It
will answer `NOT_RUN durable_checkout_not_mounted` until that is done, which is
the fastest way to confirm the mount actually took:

```bash
node --import tsx server/research/commerce/qualification/managed-journey-run.ts
```

Exit 0 qualified, 1 ran and did not qualify, 2 NOT_RUN with exactly one named
missing prerequisite.

## Closing note on what this lane is worth

Every defect I fixed today in my own new code was found by checking it against
the code it had to talk to, not by reading it again. The harness compiled,
passed its own tests, and was wrong about all five surfaces, four of them in
ways that would have reported a scenario as passed. Apply the same test to
anything in this lane that has not yet touched the thing it claims to verify.
