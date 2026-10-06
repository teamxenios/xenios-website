# Quick Order: one supplemental source scope

Status: PROPOSED FOR A BOUNDED SOURCE DECISION. This document is not implementation
authority or independent acceptance. It extends the existing proposal records; it creates no
replacement task board or approval service.

Decision requested: allow the existing builder to implement the new currentness
modules and candidate SQL drafts described here, the dependent atomic commit
draft, the five shared runtime edits in the accompanying proposed patch, their
named tests and the four additional composition tests. SQL drafting remains
conditional on the same reviewer's naming/fence and lock-protocol review. All
database execution, protected successor acceptance and live activation stay
separate. This permission would let the missing backend be built for review;
it would not make a request save successfully today.

Samuel's actual kickoff at 2026-10-06T17:43:37Z adopts S1–S5. Its exact text and
the adopted draft are archived in `quick-order-first-plan-20261006/`; authority
commit is `60d593ae2fc0623edc869e373bfe52e830968df9`. S4 permits currentness
design and requires this concrete expansion before currentness implementation,
the complete commit RPC, or existing shared-service edits. S2 separately
requires the additional composition test paths to be named before edits.

The inspected predecessor is builder
`5ee44d53e55774fd8a29ea009dac16da2ed907ef`, runtime
`fd023e8c03baa2326baf707c944bcd25dce7f453`. The builder's authorized mount/PWA
successor is ac36e60fe5e91b1217722e7f2a2711fd62a64559, records
c54f53f5aa0501cbddbb2a1148c49f9578e0ca93. Every sidecar baseline was
rehashed and is unchanged at that successor. Revalidate again before editing.

## Intended result

A verified actor submits a frozen normalized request. One canonical transaction
stores the existing request, complete lines and event, immutable referral and
affiliation evidence, the same-actor recovery receipt and one obligation in the
existing notification outbox. An authorized operator reads the canonical record
and those declarations through the existing admin workflow. No payment, clinical
access, fulfillment or commission is inferred from a request or declared code.

The current application cannot do that. The proposed mount remains unavailable;
the production port reports `productionReady: false` and its commit method
throws. This packet does not enable it.

## Small naming/fence proposal for the existing reviewer

The four proposed database names become:

- `public.research_health_quick_order_intakes`
- `public.research_health_quick_order_replay(text,text)`
- `public.research_health_quick_order_commit(jsonb)` (reserved name; no body yet)
- `public.research_health_quick_order_admin_detail(uuid)`

All new helpers, sequences, indexes, policies and triggers use the
`research_health_quick_order_` prefix. The existing proposed A2 filenames remain
unchanged. The ADP fence selects public functions and relations under
`research_assisted_order_` plus the existing notification outbox; drift raises
55000 (quarantine migration lines 16–31 and 361–373). This proposal neither
replaces a fenced function nor alters fenced tables, their user triggers,
indexes, constraints, policies or grants. The companion's FK references the
existing request. Internal FK triggers appear excluded by the current predicate;
that is a source inference, not a demonstrated installation result.

Keep canonical `source = 'early_access_manual_order_bridge'`. This preserves its
existing source CHECK and recovery readers. It also means the existing
public-reference/email status-recovery flow can recognize these requests; the
source reviewer must explicitly assess that consequence. The new actor/key replay
reader mints no status-access token and does not bypass current authentication.

The companion identifies the intake. Additionally, propose an independent marker
in the existing immutable submitted event's `evidence` object:
`intakeKind: 'health_quick_order'`, `intakeSchemaVersion: 'quick-order-v1'`, and
the normalized input hash. This is an intentional refinement of doc36's
companion-only discriminator: it lets the operator reader reject a missing
companion rather than misclassify corruption as a legacy request. No event-table
schema change is proposed. The reviewer must check the actual later event guards.

After compatibility review, the smallest already-adopted S4 slice is the renamed
companion, service-only replay/admin-reader draft, ACL/pre/post/rollback records
and verifier source already named in PERSISTENCE_PROPOSAL.md. The complete commit
body, authority revisions and writer guards remain held for the supplemental
source decision. No DDL is executed and no candidate is registered.

`QUICK_ORDER_SUPPLEMENTAL_BASELINES_20261006.json` binds the bridge, M75, five
later guard migrations and the ADP provider/fence chain. Pre/postchecks must
enumerate and preserve these guards, compare all measured schema/ACL definitions
in the eventual exact target, and refuse unknown drift. A future disposable
verifier must invoke the actual provider authority/integrity RPC before/after
install, exact reapply and rollback. Naming review alone cannot prove compatibility.

## Frozen intake contract to implement after approval

1. Derive actor identity from the verified canonical viewer. A member uses
   `member:<authUserId>` for the companion actor, while the canonical request uses
   its distinct member-row ID. Early Access uses `early_access:<customerRef>` for
   actor-scoped recovery and the actual bound session hash for canonical evidence.
   Refuse viewers without the required bound customer and durable standing.
2. Derive the canonical idempotency hash from
   `quick-order-v1 + NUL + actorId + NUL + key`. The full normalized input hash
   covers customer details, item identities/quantities, acknowledgments, declared
   referral and affiliation. Never use email as the authorization identity.
3. Lock actor/key, then perform exact-input replay before reevaluating mutable
   catalog/legal rules. Current authentication is still required. Changed input
   conflicts; another actor receives no matching receipt. No duplicate request,
   event or notification is created, and no administrator identity is fabricated.
4. For new input, acquire the currentness boundary below. Resolve complete
   canonical lines, including product name, action label, workflow, quantity band,
   price identity/version/effectivity, and authoritative fingerprint. A QO digest
   or a second application scan is not the database currentness guard.
5. Preserve the full declared 1–64 character referral code in the companion. The
   legacy canonical declared-code column receives only its separately validated
   M75 representation/state. Never truncate the evidence or promote it to trusted
   attribution. Resolve trusted attribution through its existing canonical
   authority and carry its reference separately.
6. Insert canonical request, full lines, submitted event, immutable companion,
   safe recovery receipt and one existing-outbox obligation in one transaction.
   Map zero known subtotal to the canonical nullable total as required; keep the
   explicit known-subtotal/completeness facts in the companion. Price-on-request
   lines have null unit prices. Do not call legacy submit and append a second RPC.
7. Verify complete canonical readback before producing the safe receipt. Preserve
   the same result after response loss or restart. Operator readback is a separate
   capability-guarded read, not a prerequisite requiring a fake admin viewer.

New shared projection module: `shared/research/assisted-order/quick-order.ts`
(already listed in A2). Its closed schema contains immutable intake version,
source/sourceDetail/declaredCode, affiliation kind/detail, customer confirmation
and timestamp, request acknowledgment, captured review state, submission estimate
and currency. Source and affiliation enums reuse the existing QO contracts. Initial
review state is `direct_no_referrer` or `captured_unmatched`; commission remains
`not_authorized`. Trusted attribution is displayed from the canonical record,
separately from declarations. No new financial verification field is added.

## Currentness design and exact new source scope

Two proposed relations publish and coordinate existing authorities; they are not
a second catalog or legal registry:

- `research_health_quick_order_authority_head`: one intake gate, monotonic
  `writer_epoch`, active revision ID and `held|active` state. Missing means held.
- `research_health_quick_order_authority_revisions`: immutable schema-versioned
  publication of exact catalog/binding/reconciliation/legal artifact identities,
  normalized decision inputs, source/applicability references, effectivity and
  publisher audit identity. Unknown Health authority cannot produce an active row.

Proposed functions: `research_health_quick_order_publish_revision`,
`research_health_quick_order_revoke_revision`, private
`research_health_quick_order_guard_source_write` and private
`research_health_quick_order_read_current_authority`. Publication/revocation are
owner-scoped; the application service role cannot approve its own authority.
No role, credential, active publication, applicable legal pair or positive Health
eligibility decision is provisioned by source approval.

Exact additional files, all new at the inspected predecessor:

- `supabase/candidates/20261006_research_health_quick_order_currentness.sql`
- `supabase/candidates/20261006_research_health_quick_order_currentness.precheck.sql`
- `supabase/candidates/20261006_research_health_quick_order_currentness.postcheck.sql`
- `supabase/candidates/20261006_research_health_quick_order_currentness.rollback.md`
- `supabase/verification/research_health_quick_order_currentness_local.mjs`
- `server/research/assisted-order/quick-order-currentness.ts` and `.test.ts`
- `server/research/assisted-order/quick-order-publication.ts` and `.test.ts`
- `shared/research/assisted-order/quick-order-currentness.ts`

The already-listed A2 `quick-order-repository.ts`, `quick-order-service.ts`,
`quick-order-authority.ts` and adjacent tests consume this contract. The complete
commit RPC remains in A2's named intake candidate file; its implementation is
included in the requested expansion, only after the design and writer coverage
are accepted. No historical migration is edited.

Lock protocol proposed for review:

1. Canonical authentication, then actor/key transaction lock. Exact replay is
   handled before current catalog/legal evaluation.
2. For new intake, record the writer epoch before any canonical preflight that
   locks source rows. Finish that preflight before taking the authority-head
   shared lock, then require the epoch to match. A changed epoch refuses this
   attempt; it does not silently replay the preflight. Only server-derived,
   actor/request-bound results are eligible, never browser-supplied proof.
   After any wait, read active revision and canonical facts in fresh READ
   COMMITTED statements; reject unsupported isolation. Missing head refuses.
3. Participating source writes take the head's exclusive lock and advance its
   writer epoch in their own transaction. New statement-level guards cover
   INSERT/UPDATE/DELETE/TRUNCATE on an exact allowlist in the new candidate.
4. Intake must not subsequently lock source rows. Existing writers may already
   hold product-row locks before DML; avoiding that reverse lock order prevents a
   head/source-row lock inversion. New canonical request/line/event/outbox writes
   retain their existing guard order.
5. Recheck database time for price and session expiry after waits and immediately
   before insertion. An intake already within the protected decision boundary
   precedes a waiting revocation. After revocation commits, new intake refuses.
6. File/config publication holds intake first, deploys the reviewed immutable
   artifact set, verifies the governed revision, then activates it. Partial rollout
   stays held. Old application instances must reject a mismatched active bundle;
   restarting old source cannot reactivate an old revision. Generator scripts
   create artifacts only; they gain no publication authority.
7. Preserve previous requests, receipts and outbox evidence after revocation.
   Treatment of already-submitted requests is a separate policy decision. Earlier
   remote Auth checks cannot be made atomic by this SQL protocol; that limitation
   and session revocation semantics must be explicitly bounded before activation.

The existing Referral V1 guest resolver calls availability helpers that lock
partner/link rows (`20260904_research_partner_referral_v1.sql`, lines537–597;
`20260914_research_referral_v1_touch_attribution.sql`, lines72 onward). Calling
that path after locking the authority head would violate step4. Preserve the
canonical resolver, order its preflight before the head lock, bind its input and
observed epoch, and recheck time-sensitive expiry after waiting. The nonlocking
canonical durable-binding helper may be reused under review; do not implement a
second attribution policy. The reviewer must also inspect locks taken by every
called helper, constraint/FK and later canonical-write trigger. This is a proposed
protocol, not a demonstrated deadlock-freedom or revocation guarantee.

### Finite writer-guard allowlist

The new currentness candidate proposes statement guards for INSERT, UPDATE,
DELETE and TRUNCATE on the following 23 existing public relations. No existing
writer body, schema, policy or grant is changed. Every new trigger name uses the
new prefix. The table boundary covers direct DML as well as the named RPCs;
historical/candidate source is evidence of intended paths, not proof of which
writers are installed on a managed database.

| Exact relations | Source readers and writer families to qualify |
| --- | --- |
| `research_products`, `research_product_variants`, `research_product_prices`, `research_product_media`, `research_product_content` | Product Control's `product-admin-production.ts` table constants and create/duplicate/update/transition product, create/update variant, create/approve price RPCs; candidate tier-price writer if installed. Media availability remains separate from buying eligibility. |
| `research_required_inputs`, `research_domain_launch_controls` | `research-required-input-readiness.sql`: define/transition input, set manifest, transition launch status; `research_domain_readiness` consumes these. |
| `research_inventory_lots`, `research_lot_quality_documents`, `research_lot_quality_tests` | Actual selection reader `member-catalog-service.ts:193` and `research_lot_is_allocatable`/quality helpers at inventory migration lines453–544. Include lot creation, movement, disposition, quality publication/withdrawal and reservation writers. Quantity, recall, expiry and document/test changes affect eligibility even when purchase is off. This grants no inventory mutation. |
| `research_members` | Canonical Auth-user lookup/active standing and pricing audience read this row. Approved-customer access, buyer-account activation, sponsored claim and legacy activation/billing writers must all coordinate if installed; this grants no paid-membership restoration. |
| `research_early_access_customers`, `research_early_access_session_bindings`, `research_early_access_agreement_acceptances`, `research_early_access_referral_grants` | Identity-persistence customer insert/update/bind-session/agreement/referral writers. Only verified durable standing and actual bound identity are usable. |
| `research_private_early_access_sessions`, `research_early_access_legal_bindings`, `research_early_access_shipping_regions` | Durable session revocation, legal binding and allowed-region writers. Existing Research agreements do not establish Health applicability. |
| `research_affiliate_customer_bindings`, `research_referral_binding_transfer_events`, `research_partners`, `research_partner_links`, `research_attribution_touches` | Referral V1 execute operations, durable binding/transfer and guest touch attribution; partner/link issue/revoke and privacy cleanup where installed. No commission or partner-activation authority is added. |

The 23 names are a proposed source contract, not permission to install triggers.
Missing relations, extra decision dependencies, disabled guards, incompatible
existing guards or unexpected helper definitions keep activation held. Precheck
must census actual objects and writer privileges before a separately authorized
installation. Table owners/superusers can bypass controls; this design assumes
the reviewed application roles and does not claim resistance to a privileged
administrator changing the schema. Do not add a trigger to `auth.users` or edit
Auth, existing writer bodies, the ADP fence or historical migrations under this
scope. If any such change is necessary, return its exact delta before editing.

Append-only audit history, nonce/consumed-token history and payment ledgers are
not inputs to this intake decision and are excluded. If the implementation starts
reading one for eligibility, its dependency must be added explicitly before it
can qualify. No deletion or mutation is permitted by this inventory.

File authority is a separate finite set: generated master-offering dataset,
generated bindings, pinned reconciliation/commerce holds, applicable approved
Health legal bytes and the reviewed nonsecret configuration identities. Read
actual configured paths and bind bytes; do not assume a conventional filename.
The existing reconciliation/build-offerings/build-bindings scripts remain
unchanged. The publication record must bind their exact outputs and the deployed
code/config set, including memoized reviewed holds. A stale process or partial
rollout stays unavailable until it observes that exact publication.

### Required future qualification (source plan, execution held)

Author bounded synthetic cases for: actor/key equality/conflict and response
loss; canonical full-line/receipt/declaration/outbox atomic rollback; every listed
writer competing before/after the head boundary; a waiting intake observing
revocation; epoch changes during locking referral preflight; price, session,
touch and lot expiry while waiting; explicit forbidden isolation; missing or
disabled guards; and stale artifact/config nodes after publication. Use actual
canonical constraints/guards, including FK lock order, rather than a simplified
table fixture. Verify unchanged ADP integrity before/after install, reapply and
rollback. Test role denial for publication and raw table writes. Preserve failure,
timeout, signal, source identity and transaction evidence. None of these database
cases is authorized to execute by S5 or by this supplemental source packet.

Existing QO wiring changes proposed to its current builder (baselines in the
JSON sidecar): `ports.ts` carries standing/currentness/full canonical line and
trusted-attribution inputs; `catalog.ts` requires positive Health classification
and the exact governed revision; `legal.ts` resolves only approved published
Health bytes and explicitly refuses the Research-use pair for Health;
`production.ts` binds canonical standing/revocation and the new repository in
unmounted, dependency-injected tests. Adjacent existing tests are in scope for
these exact changes. Keep `productionReady: false`, config disabled and the live
composition unavailable until a separately reviewed activation slice is approved.

## Operator reader and notification integration

The smallest proposed existing runtime delta is five files. Exact before hashes
are in the JSON sidecar; no change is proposed to the current HTTP permission
check, new public endpoint, repository port method or outbox dispatcher loop.

The exact proposed diff is
`QUICK_ORDER_SHARED_EDITS_PROPOSED_20261006.patch`: five runtime files and the
existing UI test. It is not applied, compiled or executed. The pure projection
and strict envelope decoder are explicit dependencies in the already-authorized
new A2 module paths. Their exact contract will be bound to a separate source
checkpoint before the shared patch is applied. Any incompatible contract change
must be returned as a concrete patch amendment, not silently widened permission.
The patch preserves canonical status and finance authority; notification state
is only an observation of the existing outbox.

| File and existing function | Proposed edit |
| --- | --- |
| `shared/research/assisted-order/contract.ts`, `AssistedOrderAdminDetail` at line365 | Add optional typed `quickOrder` enrichment using the new shared projection. The enriched RPC always emits explicit null for genuine legacy rows. |
| `server/research/assisted-order/supabase-repository.ts`, `getAdmin` at line418 | Call one service-only wrapper around the unchanged canonical admin reader; strictly decode request-bound companion, receipt and exact outbox obligation. Missing RPC is unavailable, never legacy fallback. |
| `server/research/assisted-order/service.ts`, `updateStatus` at line935 | Preserve immutable intake enrichment from the guarded pre-mutation read when the legacy update returns. Omit/mark stale mutable observation fields. Preserve existing transition/effect authority. |
| `client/src/research/assisted-order/AdminAssistedOrderDetail.tsx`, detail rendering at line132 | Render complete canonical lines, existing OperatorDeclarations, submission estimate and observed notification state. Refresh mutable observations after a status change; failed refresh says saved/readback unavailable and never resubmits the mutation. |
| `server/research/assisted-order/communications.ts`, `renderAssistedOrderOutboxEmail` at line158 | Add one strict reference-only Quick Order admin renderer; preserve every legacy renderer. |

The existing service `adminDetail` at line816 enforces `read_all`; the current
admin GET route at http.ts line360 stays in place. Marked Quick Order rows with
missing/malformed companion, receipt or expected obligation fail closed. True
legacy rows can return explicit null only when the independent submitted-event
witness is absent. A missing wrapper RPC must not make a new request look legacy.
The reader candidate must be installed/qualified before its reader cutover.

Notification contract: template
`research.assisted_order.quick_order.submitted.admin.v1`, unique event key
`assisted-order:<canonicalRequestId>:quick-order-submitted:admin`, status
`pending`, null financial foreign keys. Closed payload:
`{schemaVersion: 'quick-order-v1', requestId, publicReference}`. Derive the internal
link from a validated UUID and fixed trusted origin; no supplied URL, contact
details, lines, declarations or payment material. Recipient/routing and final
copy require the existing communications owner's approval before activation.
The existing dispatcher supplies the stable event key as provider idempotency.
Transport failure must leave the request and one durable obligation recoverable.
Recorded `sent` means transport acceptance, not recipient delivery or operator
acknowledgment. This refines doc36's suggested payload to avoid accepting a URL.

Exact reader/notification test additions:

- New `server/research/assisted-order/quick-order-admin-readback.test.ts`: actual
  repository/service/admin-route composition; read_all denial before RPC, legacy
  null, malformed/missing evidence/obligation, missing RPC, request mismatch and
  immutable mutation enrichment.
- New `server/research/assisted-order/quick-order-notifications.test.ts`: strict
  renderer and existing dispatcher; forbidden fields/URLs, transport failure,
  retry/restart/reclaim and stable event key, with synthetic transports only.
- Existing `client/src/research/assisted-order/AdminAssistedOrderSession.test.tsx`:
  actual detail rendering, Unicode/HTML as text, full declared code, session switch
  and stale response, pending-price/provider state, refresh after mutation. Before
  SHA256-LF `e5da57686afddb59d6b705c2f355fac86fca35e009c7c50840f5a810f75f2bd7`.

Proposed ownership: after the mount/PWA freeze, the existing builder owns these
five existing runtime files, their tests and the QO wiring. A separately named
persistence owner may own only the exact new A2/currentness files after approval
and compatibility review. No shared file has two writers; no second source writer
has been launched by preparing this packet.

The builder checkout's current registry had no active lease matching any of the
six shared-patch paths when inspected at approximately18:20Z. This is a
branch-local observation, not a global no-conflict guarantee. Before editing,
reconcile the current authoritative owner records and extend the same builder's
lease with each exact path; preserve other owners and all registry top-level
fields. Default assignment for the supplemental scope is this same builder;
using a second owner requires a separately recorded non-overlapping assignment.

## Additional composition test scope

Proposed owner: the same Quick Order builder, after its current S2/S3 slice is
frozen, under a separate exact lease extension. These are new files, absent at
the inspected predecessor:

| New path | Exact behavior to prove |
| --- | --- |
| `client/src/research/quick-order/QuickOrderApp.composition.test.tsx` | Render the actual default App and actual QuickOrderPage/PublicShell at `/health/quick-order`, with declared synthetic auth/network boundaries. Preserve the unavailable state, no collection/POST, one header/main/footer, and existing root/Research/Care controls. Exercise the actual PwaLifecycle alongside App because main.tsx mounts it as a sibling. Do not replace the owned page, shell, privacy predicates or PWA predicate with mocks. |
| `server/research/health/quick-order/static-document.test.ts` | Call the real `serveStatic` with a synthetic built shell. Direct GET/HEAD to Quick Order must return its private document policy: 200 HTML, noindex/nofollow/noarchive, no canonical/social/public structured data, and the specified privacy headers. Assert unrelated public and Access Hub behavior carries unchanged. |
| `server/research/health/quick-order/vite-document.test.ts` | Exercise actual `setupVite` and its real document fallback with a controlled Vite transport boundary. Assert Quick Order direct-navigation status and document policy. Label any mocked transform as a composition unit test, not a real Vite/browser qualification; real Vite proof remains a separately reserved execution. |
| `server/research/health/quick-order/root-composition.test.ts` | Boot actual `server/index.ts` with a synthetic, explicitly allowlisted environment and loopback dependencies. Assert owned raw API targets terminate with private disabled JSON before body parsing/fallback, malformed/oversized body probes do not change that outcome, and unrelated route controls still answer through their actual root. Retain bounded child output and exit evidence; clean up only processes/files created by this test. A small reconstructed Express app does not satisfy this test. |

Runtime files `server/static.ts` and `server/vite.ts`, application boot behavior,
protected hashes, manifest, and test runner configuration are unchanged by this
test-only scope. If the test reveals a runtime correction or needs a new seam,
return that exact source delta before editing. The actual production build and
browser still need independent qualification; mocked Auth or a synthetic shell
must be disclosed. Computed styles, mobile layouts, zoom and keyboard behavior
cannot be proved by these source assertions alone.

Read-only reference bindings (SHA256 of UTF-8 with CRLF normalized to LF):

| Path | SHA256-LF at 5ee44d5 |
| --- | --- |
| `client/src/main.tsx` | `8ee3abbbcaf3fc0b922a067fff9c963401c449eaf17e19d2360d9c2617ec3162` |
| `client/src/clarity/PublicShell.tsx` | `3ba0d3fd5aff043be7729dfd03c6d048e44241472318c15293f217ea59e0b0dc` |
| `client/src/research/quick-order/QuickOrderPage.tsx` | `4fb3034fc6bbe41b9b8445e167cd9eb8e9e0b1ce83670683fc4438bcea6db76b` |
| `server/static.ts` | `b7a7641752b74a557664c9119130431fa3e68c0b2a31acce5ddab0c8283d9f94` |
| `server/vite.ts` | `af15971b6b66c42a6503bafa8f4d428bc295968c8c365cffc5cc238f6a678243` |
| `server/research/assisted-order/production-boot.test.ts` | `f3494beb131edf7d8b739acc50f9445548bf3614fae0f60ba1bba5ddbab89893` |
| `server/research/assisted-order/production-env-shape.fixture.json` | `be34e4d26cebbce8bc3bc73a4625786402a13b48bea14bd3ec00e9035cd4a92d` |
| `vitest.config.ts` | `24bdf9b67ddd363895a55879c07c779c5a367c399ea2fef1d17300f32382a5d0` |

No test in this section has been authored or executed. G1's resource refusal is
separate evidence and does not qualify this future scope. S5 has one of six
groups consumed, five remaining until 21:43:37Z; another attempt requires a
materially changed host condition and a fresh coordinator reservation. This
packet supplies no database, cloud or background qualification permission.

## Authority boundaries

The same original Claude session is the acceptance owner. Naming/fence
compatibility must be reviewed before the corresponding SQL draft. Source
implementation needs Samuel's approval of the completed concrete scope. Exact
successor hashes, manifest/GATE-01 disposition, SQL registration/execution,
managed qualification, real notifications/intake/payment and production release
are separate later decisions. Do not widen Health terms, product eligibility,
destination or standing decisions by implementing technical plumbing.
