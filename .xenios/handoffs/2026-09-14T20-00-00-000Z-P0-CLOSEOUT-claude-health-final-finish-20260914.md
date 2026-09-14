# Xenios Health P0 operational closeout — 2026-09-14

Writer: `claude-health-final-finish-20260914` (Claude Opus 5), holder of the
`XENIOS-NATIVE-FINISH-20260910` lease.

Branch `codex/xenios-native-finish-20260910`.

## Exact source

| | |
|---|---|
| Application SHA | `329799cf5abec816bcac53a1891c6f9fe6ef8f0d` |
| Tree | `9af57ee319b1b44a8f36d7f3d15b259f5bbdfa60` |
| Remote | pushed, equal to `origin/` |
| Live production | `c545a70eb694d990842ad1259df4f0786dab92c9`, 80 commits behind this candidate, 0 ahead |

| Gate | Result at `329799c` |
|---|---|
| Typecheck | exit 0 |
| Full suite | 954 files, 949 passed, 5 skipped, **0 failed**; 17721 tests passed, 59 skipped |
| Build | exit 0 |
| Route uniqueness | accepted, 444 registrations across 435 call sites |
| Migration DAG | accepted, 36 nodes |
| Production state | accepted on `c545a70` / `dep-dag8l567bikc738a1nj0` |
| System of record | exit 0 |
| Release control plane typecheck | exit 0 |
| Release diff-scan unit tests | 8 passed |
| Release diff scan itself | still blocked: needs an out-of-repository PII names file |

## Authority decisions, as directed and as implemented

| Question | Decision |
|---|---|
| Commerce admin queue shape | The backend's ten kinds. The six-array DTO is retired |
| Native order authority | `research_orders` |
| Legacy `XO-` order lane | Superseded. Left unmounted, not deleted |
| Post-payment progression | The native order service and `research_order_shipments` |
| Legacy fulfillment engine | Superseded for this release. Left unmounted: an independent 15-state machine with no atomic synchronization to `research_orders` would be a second fulfillment truth |
| Delivered | Carrier fact. System or signed provider event only. No admin route exists |

## What was closed

**The queue contract.** The handler served the store's ten-kind view while the
page decoded six named arrays no server code produced. The route dependency was
`Promise<unknown>` and the page's test stubbed its own payload, so neither the
compiler nor the suite could see it. One shape now, declared in
`shared/research/commerce-api.ts`, imported by both sides, asserted by a route
test against the real handler and the real store.

**Failed reads.** A missing table, an RLS denial, a malformed payload and a
thrown client all rendered as "0 waiting on a decision", in the commerce store
and again in the member-platform queues. An unavailable queue now carries null
count and null items behind a named code, so the shape itself makes the old bug
unrepresentable. One source going down costs that queue, not the console. The
member-platform route answers 503 carrying no table, role or provider string.

**The order-authority correction.** The first pass said "nothing mints a
canonical order". That was wrong about the thing that matters:
`createDurableCheckoutSubmission` persists a `research_orders` row before any
provider effect, and the capture commit updates that same row. Only the older
`XO-` lane has no callers. No second order authority was created.

**The post-payment and admin action loops.** A held order could not be opened —
approve, capture and cancel had been mounted for months with no read behind
them, and the queue linked into a screen decoding a shape no endpoint served. A
paid order could not be worked. Both are closed on the native order service:
`GET /api/admin/research/orders/:orderId`, plus `processing`, `fulfilled` and a
shipments door for carrier and tracking evidence.

Three rules hold it together. The screen offers only the moves the server
reported as available. Recording tracking is evidence and never moves the
order. And there is no delivered action, which the screen says rather than
silently omitting.

## Proof

`server/research/commerce/admin-order-loop.test.ts` — the paid order reads back
identically through member history, member detail and the admin file; it does
not exist to another member; a replay finds one record; tracking is refused on
an unpaid order, for a shipment group the order lacks, in a bad shape, and over
a provider-reported shipment; delivered is refused to an operator; available
actions match the transition table state by state; and captured money is
reported as unrecorded rather than as zero.

Both gates that caught my own mistakes are recorded in the history rather than
quietly re-pinned: the Express census moved 431/440 to 435/444 with each new
route named, and the denial vocabulary gained `tracking_invalid` with its copy.

## Hosted checkout

`docs/native-finish/HOSTED_EXECUTION_PACKET_20260911.md` carries a dated
refresh. **No SQL candidate changed** — `git diff ce0858a..329799c -- supabase/`
is empty — so every hash, order, precheck, postcheck and rollback note stands,
and the existing authorization still covers candidate #1 as the same blob. The
amendment requested there is unchanged in scope.

The runtime did change, in one way that matters to a hosted run: the operator
half of the checkout journey is now reachable, so a qualification can exercise
it rather than only the customer half. Three synthetic checks are added to the
recommended scope in the packet.

**Still not authorized, and still not run.** Staging credentials, test-mode
provider keys, synthetic identities and a named executor remain external.

## Not done

The browser matrix was not re-run against this candidate. The previous run at
`694b54d` covered nine public routes at eight widths with zero failures, and no
public route changed here; the admin surfaces this slice touched are behind a
Supabase admin session the local preview harness does not carry, so a run
against them would prove the signed-out state and nothing more.

P1 items from the RC document are untouched: the support queue's reads, member
document downloads, the Early Access referral grant writer, and the `xr_aff`
double token authority.

## Authority

No production, database, provider, environment or service mutation. No mail,
no flag, no deploy. Render is unauthenticated in this session and
`supabase-xenios-prod` failed to connect, so no managed database state was
observed at all.
