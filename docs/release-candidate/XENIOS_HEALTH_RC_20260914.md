# Xenios Health release candidate — 2026-09-14

One document: what is true now, what each journey's real state is, which gaps
are real, what was qualified, and what a production release would consist of.
Nothing here has been deployed, enabled or executed against a managed database.

Written by `claude-health-final-finish-20260914`, the current holder of the
`XENIOS-NATIVE-FINISH-20260910` lease. States use the vocabulary the takeover
brief fixed: `NOT_IMPLEMENTED`, `IMPLEMENTED`, `INTEGRATED`, `LOCALLY_QUALIFIED`,
`MANAGED_QUALIFIED`, `DEPLOYED`, `ENABLED`, `LIVE_VERIFIED`, `EXTERNALLY_BLOCKED`.
They are not collapsed. "Not examined" appears where nothing was examined.

---

## 1. Current truth

| | |
|---|---|
| Worktree | `C:/Users/sboad/projects/xenios-native-finish-20260910`, clean at takeover |
| Branch | `codex/xenios-native-finish-20260910` |
| Head at takeover | `2b9b01c6b03b45dd1108cd3591a16c4dc4f4ed87`, equal to `origin/` |
| Application candidate beneath it | `ce0858aba29113b87c061ea8deb20b67991c1357`, tree `1aadecebd7e28d7fb15b73dfbe5f8c3e7b9cf27e` |
| Relation to live production | 65 commits ahead of `c545a70`, 0 behind; `c545a70` is a verified ancestor |
| Relation to `main` | 1151 ahead, 0 behind. `main` is not the release base |
| Newer work anywhere | none. No ref is newer than 2026-09-11; today is 2026-09-14 |
| Stash | one entry, `fable-admin-read-wip-20260910`, belongs to another lane and was left alone |
| Live processes in this worktree | none. The Node processes on the host belong to the Codex runtime |

### Production identity, and how it was established

The coordination records named `3814c687` / `dep-dag1reu7bikc73e16ie0` as current
production, verified `2026-09-08T14:45Z`. Production moved on later the same day
and nothing wrote it down.

- The deploy identity `c545a70eb694d990842ad1259df4f0786dab92c9` /
  `dep-dag8l567bikc738a1nj0` comes from the founder's authenticated Render audit
  of 2026-09-14. **This session holds no Render credential**: the Render MCP
  server is unauthenticated here, so no credentialed read was possible.
- It was corroborated independently and read-only. Both production origins
  answered `/api/health` 200 at `2026-09-14T15:47:19Z` reporting
  `uptimeSeconds` 494653, which places the running process at
  `2026-09-08T22:23:06Z` — **160 seconds after `c545a70` was authored**
  (`2026-09-08T22:20:27Z`). The superseded deploy went live
  `2026-09-08T14:38:44Z`, 7.74 hours earlier, which that uptime excludes.
- `/api/health` does not expose a commit identity. The runtime evidence
  therefore excludes the old deploy and fits the new one; it does not by itself
  name the commit.
- Between `3814c687` and `c545a70`, the only file changed under `supabase/` is
  `MIGRATIONS.md`, and only to record the already-applied migration 77. The
  installed migration set is unchanged, so moving the recorded baseline applies
  no SQL.

Records corrected, with the prior versions preserved byte-exact under
`docs/coordination/history/` and referenced by Git blob identity:

| Record | Was | Now |
|---|---|---|
| `docs/coordination/CURRENT_PRODUCTION_STATE.json` | `3814c687` | `c545a70` |
| `docs/coordination/ACTIVE_RELEASE_GRAPH.json` | `3814c687` | `c545a70`, old baseline node retired |
| `docs/coordination/MIGRATION_DAG.json` | `3814c687` | `c545a70` |
| `docs/coordination/FILE_OWNERSHIP.json` | `3814c687` | `c545a70` |
| `.xenios/RELEASE_STATE.json`, `.xenios/PROJECT_STATE.json` | `3814c687` | `c545a70`; lane-scoped deploy records kept as history |
| `docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.registry.json` | `db5a2d44` (2026-09-03) | `c545a70` |

The registry had been stale through **two** production deploys, so
`npm run site:record:check` was already failing before this session. It now
exits 0.

Evidence observed at the superseded baseline was moved to `historicalEvidence`
rather than deleted. The new entry's verification status is
`deployed_not_authenticated_smoked`, not `live_verified`: the origins answered
unauthenticated health, and no authenticated journey was smoked.

### Ownership

`XENIOS-NATIVE-FINISH-20260910` was held by `codex-native-finish-20260910`,
usage-exhausted, last heartbeat `2026-09-11T01:29:29Z`, with no live process in
its worktree. Under the continuity OS emergency-recovery section the lease was
transferred to this session and the old sessions were marked stale, not deleted.
`xenios-os` has no transfer verb, so the corpus files were edited directly, as
the continuity prompt permits. `xenios-os validate` passes.

### What this session could not read

- **Render**: MCP server unauthenticated. No deploy list, service settings,
  environment variable names or deploy history were read.
- **Supabase**: `supabase-xenios-prod` failed to connect (`JWT could not be
  decoded`). **No managed database state was observed at all.** Every statement
  about installed schema below is a statement about source or about prior
  recorded receipts, never about the live database.
- **Runtime configuration**: only what `/api/health` publishes as booleans —
  `supabaseConfigured=true`, `adminConfigured=true`, `turnstileConfigured=false`,
  `commerceEnabled=false`.

`commerceEnabled=false` in production is worth stating plainly: **native
checkout is not enabled on the live site.**

---

## 2. Capability matrix

Evidence is source unless a row says otherwise. `LOCALLY_QUALIFIED` means
focused tests exist and pass; it does not mean mounted, deployed or enabled.

### Public

| Journey | State | Evidence |
|---|---|---|
| `/health` gateway | INTEGRATED | `client/src/App.tsx:186` to `client/src/research/pages/Gateway.tsx`; every hero and card target resolves to a mounted route |
| Unknown `/health/*` 404s, no wildcard | INTEGRATED | exact-map only; `server/research/seo/raw-http-document-policy.ts:714,814` |
| Care public routes (`/care`, `schedule`, `portal`, `how-it-works`, `provider-review`, `support`) | INTEGRATED | `client/src/App.tsx:197-198` to `client/src/care/section.tsx:27-44` |
| Care access request | INTEGRATED, env-gated | `server/care/manual-access.ts:293`; durable write before the response; fail-closed when persistence or notifications are unready (`:91-102`) |
| Care support message | INTEGRATED | `server/care/contact.ts`; **corrected this session**, see section 3 |
| No clinical free text in public Care forms | INTEGRATED | enum and contact fields only; `shared/care/manual-access.ts:115-138` is `.strict()`; the operator record pins `medicalFreeTextCollected: false` |
| Public liveness | LIVE_VERIFIED | read-only HTTP 2026-09-14: `/`, `/health`, five `/care` paths, three `/research` paths, `/api/health`, `robots.txt`, `sitemap.xml` all 200; an unknown path 404s |
| Policies, legal, SEO, accessibility, mobile navigation | not examined | |

### Customer

| Journey | State | Evidence |
|---|---|---|
| Sign-in, password recovery, approved-access claim | INTEGRATED | `server/research/members.ts:106-145,264-318`; Supabase Auth is the credential authority |
| Account home, member home | INTEGRATED | `client/src/research/section.tsx:387,391`; `server/research/customer-account/routes.ts:109` |
| Catalog and product detail | INTEGRATED, fail-closed | `server/research/catalog/member-catalog-routes.ts:58,80`; unavailable answers 404 or 503, never a fabricated row |
| Cart continuity across authentication | IMPLEMENTED | `client/src/research/core.tsx:289-301,320`; the stored envelope is deliberately untouched during verification |
| Checkout, payment authentication, credit consent | LOCALLY_QUALIFIED | `ce0858a`; not deployed, and `commerceEnabled=false` live |
| Native order record | INTEGRATED | `research_orders`. `server/research/commerce/durable-checkout-submission.ts:199-225` persists it through `OrderRepository` **before** any provider effect; the capture commit updates that same row |
| Legacy `XO-` canonical-order lane | NOT_IMPLEMENTED, and deliberately left so | `server/research/orders/service.ts:118` has zero non-test callers. It predates the durable checkout and is **not** the native order authority; mounting it would create a second answer to "what is the order?" |
| Order history | INTEGRATED | `GET /api/research/orders` and `/api/research/orders/:orderId` read the same `research_orders` authority the checkout wrote. Proven end to end in `server/research/commerce/admin-order-loop.test.ts` |
| Legacy `XO-` history surface | NOT_IMPLEMENTED, and deliberately left so | `server/research/orders/http.ts:61` never mounted; the unmounted client route belongs to the same superseded lane |
| Fulfillment status, Early Access lane | INTEGRATED | `server/research/early-access/routes/order-routes.ts:1004-1019` |
| Post-payment progression, member and commerce lane | INTEGRATED | `payment_captured -> processing -> fulfilled` on the native order service, reachable at `POST /api/admin/research/orders/:orderId/{processing,fulfilled}`; `delivered` stays system/provider-only |
| Operator-recorded tracking | INTEGRATED | `POST /api/admin/research/orders/:orderId/shipments` writes `research_order_shipments` facts; shape-validated, refused on an unpaid order, and never over a provider-reported shipment |
| Legacy fulfillment engine (`server/research/fulfillment/*`) | IMPLEMENTED, unmounted, superseded for this release | `register.ts:205` has zero non-test callers. It is an independent 15-state machine with no atomic synchronization to `research_orders`; mounting it would create a second fulfillment truth |
| Tracking, Early Access | INTEGRATED | carrier, number and `shippedAt` are served and rendered |
| Tracking, member and account surfaces | IMPLEMENTED but dark | the provider webhook is disabled by default and the history reader declares `shipmentsSource: "unavailable"` |
| Documents, listing | INTEGRATED | `server/research/customer-account/routes.ts:141` |
| Documents, download | NOT_IMPLEMENTED in production | `server/research/documents.ts:160-162` returns a not-configured byte store whenever `NODE_ENV` is production |
| Support case and answer loop, customer side | INTEGRATED | `server/research/questions.ts:450,464,579` |
| Fabricated progress in customer surfaces | none found | shipped and delivered require real carrier evidence; an unconnected source yields `unknown`, never `unfulfilled` |

### Care operations

| Journey | State | Evidence |
|---|---|---|
| Care request queue, status transitions, duplicate handling | INTEGRATED | `server/care/manual-access-admin.ts:257,280,308`, mounted at `server/care/index.ts:86-90` |
| Eligibility, consent, appointment, clinician review, prescription, pharmacy state | IMPLEMENTED | each has its own repository and route family; composed behaviour was not re-qualified this session |
| Separation from Research and RUO authority | INTEGRATED | Care rows are separate from the generic LOI domain |
| Operator UI for the Care access queue | NOT_IMPLEMENTED | the admin list and detail endpoints exist and are guarded; no client file references them |
| Any clinical action activated | none | and none should be, without real provider, pharmacy and jurisdiction authority |

### Partner, affiliate, referral

| Capability | State | Evidence |
|---|---|---|
| Partner identity, application, portal reads, dashboard | INTEGRATED, env-gated | `server/research/commerce/routes.ts:578,622`; `partners/portal-routes.ts` |
| Referral links, capture, attribution cookie, v1 | LOCALLY_QUALIFIED | `partners/referral-v1-routes.ts`, mounted at `server/index.ts:552`; requires three flags plus Supabase |
| Attribution survives an authentication round trip | LOCALLY_QUALIFIED | an HttpOnly 30-day cookie pair, re-bound server-side on every authenticated member probe through an atomic RPC |
| QR and share tools | INTEGRATED, guarded | active partners only; live in production |
| Commission ledger | IMPLEMENTED, no production writer | `partners/accrual-bridge.ts:188` has zero callers, so the partner commissions page will always read zero |
| Early Access commission hold | INTEGRATED | a separate ledger, written by the admin settlement path |
| Payout execution | IMPLEMENTED, disabled by default | `providers/payout.ts` permits paid only on a real provider result |
| Partner privacy boundaries | INTEGRATED, no defect found | no customer identity, no other partner's rows, no rates or margin; no handler accepts a partner id |

### Organization

| Capability | State | Evidence |
|---|---|---|
| Organization identity, roles, invitation, admin inspection | INTEGRATED, fail-closed | `server/index.ts:379`; absent schema answers 503 and inspection reports unavailable, never empty |
| Whether the managed organization schema exists | unknown | no database access this session |
| Emailed account-identity links resolve | NOT_IMPLEMENTED | `/research/account/claim-history` and `/research/account/organization-invitation` are sent by a mounted server path and are not routes in the client |

### Supplier and fulfillment

| Capability | State | Evidence |
|---|---|---|
| Minimum-data supplier release packet | INTEGRATED, no defect found | allowlist construction with no spread, so customer economics, attribution and margin have no field to travel in |
| Verified payment gates release and commission | INTEGRATED | the verified-order projection returns null for any other status, and the transport layer answers 409 `PAYMENT_NOT_VERIFIED` |
| Acknowledgement, packing, tracking, shipped, exception | INTEGRATED, admin-attested | tracking is required before shipped |
| Carrier acceptance fabricated | no | but in the Early Access lane carrier and tracking are operator-typed and regex-validated, so shipped there is a human attestation. The commerce lane requires a signature-verified webhook |
| Canonical fulfillment engine, fifteen states | IMPLEMENTED, unmounted | `server/research/fulfillment/register.ts:205` |
| Supplier principal or supplier workspace | NOT_IMPLEMENTED | no supplier route exists; `SupplierAccess.tsx` is a marketing page |

### Admin and operations

| Capability | State | Evidence |
|---|---|---|
| Server-derived admin authority | INTEGRATED | `server/routes.ts:129-152`, Supabase JWT matched against `ADMIN_EMAIL`, recovery sessions denied |
| Founder command centre, thirteen sources | INTEGRATED | `server/index.ts:1308-1342`; it honestly reports what it cannot see |
| Care requests, assisted orders, quotes, applications, product requests | INTEGRATED | |
| Early Access payment review, per-order dispatch, tracking, exceptions | INTEGRATED | the one revenue lane whose loop is closed end to end |
| Customer-access approval | INTEGRATED | |
| Order roster, support queue, audit trail, CRM workspace | NOT_IMPLEMENTED | client adapters target admin paths registered nowhere in `server/`. The roster is now the only one of the four that the order loop needs |
| Held-order approve, capture, cancel | INTEGRATED | reachable from the order file, offered only where the transition table admits them |
| Commerce queues page | INTEGRATED | ten canonical kinds; an unreadable source renders unavailable, never zero |

---

## 3. Gaps

### Closed in the P0 closeout (2026-09-14, second pass)

1. **The commerce queue contract.** The canonical shape is the backend's ten
   kinds, declared once in `shared/research/commerce-api.ts`. The route
   dependency is typed with it instead of `Promise<unknown>`, the page renders
   all ten, and the retired six-array names are gone. `partnerReview` and
   `commissionDisputes` are not preserved as empty commerce queues: they had no
   producer, and they belong to the distribution lane.
2. **Failed reads.** A source that errors, returns a non-array or throws is now
   unavailable, in both the commerce store and the member-platform queues. An
   unavailable queue carries null count and null items, so the shape itself
   makes "0 waiting" unrepresentable for a failed read. One source going down
   costs that queue, not the console.
3. **The order authority question.** Corrected below, and proven by test.
4. **The post-payment loop and the admin action loop.** Both closed on the
   native order authority. See the two rows above and section 4.

### Closed in the first pass

1. The public Care support form reported delivery it had not achieved. The team
   alert now has to succeed before the route reports success, and a failure
   returns 503 naming a direct address. Both senders now check the provider's
   result, which reports a rejected send in the payload rather than by throwing.
2. `/care` asserted "The Care request line is verified live." directly above a
   fetched status that can say the opposite, and the gateway carried the same
   class of claim as static copy on an indexed page. Both now describe the
   surface and let the fetched status speak.
3. Production identity records, stale by one deploy; the system-of-record
   registry, stale by two.

### P0 — all four closed

**P0-1, the commerce queue contract — CLOSED.** The handler served the store's
ten-kind view while the page decoded six named arrays no server code produced.
Resolved toward the backend model, as the founder directed. The route
dependency is typed, a route test asserts the handler's own payload against the
shared type, and the page test is built from that contract rather than from a
stub of its own.

**P0-2, failed reads rendering as zero — CLOSED.** Both stores now report
availability per source. The member-platform route answers 503 with a named
code and no table, role or provider string. A single-kind read throws rather
than returning a false empty list. The store's "no migration provisions
`research_admin_queue_items`" note had stopped being true — the DDL is TRACK B
COMPLETION 1 in `supabase/production/research-track-b-commerce.sql` — and
whether any given database has it is not knowable from source, which is exactly
why the read no longer guesses.

**P0-3, the order authority — CORRECTED, then CLOSED.** The first pass said
"nothing mints a canonical order". That was wrong about the thing that matters.
`createDurableCheckoutSubmission` persists a `research_orders` row **before**
any provider effect, and `research_checkout_execution_commit_captured` locks
and updates that same row; `research_checkout_executions.order_id` references
it. The accurate statement is narrower: the older `XO-` lane
(`server/research/orders/*`) has no callers. It is a superseded lane, not the
missing authority, and mounting it would have created a second answer to "what
is the order?". `server/research/commerce/admin-order-loop.test.ts` proves the
same row reads back through member history, member detail and the admin file,
that a replay finds one record, and that another member cannot see it.

**P0-4, the post-payment loop — CLOSED on the native authority.** The gap was
never that an old module lacked a caller; it was that a paid order could not be
worked. `payment_captured -> processing -> fulfilled` is now reachable, and a
carrier and tracking number can be recorded against `research_order_shipments`.
`delivered` has no admin route: the transition table admits it only from the
system or a signed provider event.

**P0-5, the admin action loop — CLOSED.** `GET /api/admin/research/orders/:id`
exists, the queue link resolves, and the order file offers only the moves the
server reported as available.

### Authority decisions recorded

| Question | Decision |
|---|---|
| Commerce admin queue shape | The backend's ten kinds |
| Native order authority | `research_orders` |
| Legacy `XO-` order lane | Superseded, left unmounted, not deleted |
| Fulfillment progression | The native order service and `research_order_shipments` |
| Legacy fulfillment engine | Superseded for this release, left unmounted: an independent state machine with no atomic synchronization to `research_orders` would be a second fulfillment truth |
| Delivery | Carrier fact. System or signed provider event only |

### P1

1. Fifteen routed admin screens have no server endpoint: members, plans, orders,
   questions, guides, partners, fulfillment, audit, privacy. Each renders an
   honest unavailable boundary, so nothing lies, but it is a third of the admin
   navigation advertising capability the deployment does not have. Each should
   gain its read or leave `ADMIN_ROUTES`.
2. The support loop is open: the answer verb is mounted, the list and detail
   reads are not, and the command centre counts open questions and links the
   operator to a screen that is permanently unavailable.
3. Held-order resolution has no reachable path: approve, capture and cancel are
   mounted with no client caller, reached only through a detail screen that has
   no read endpoint.
4. Assisted-order requests never appear in any order history —
   `server/index.ts:1200` hard-codes the reader as unconnected — and the tracking
   number that lane requires before shipping is absent from the customer status
   view.
5. An Early Access order that has tracking shows "Shipment details unavailable"
   in the member and account order surfaces, while another endpoint serves the
   real carrier and number for the same order.
6. No member can download a document in production: the listing is honest, the
   bytes store is not configured, and every download path ships empty.
7. `xr_aff` has two incompatible token authorities under one cookie name. The
   only writer of the format `server/index.ts:963` reads is unmounted and
   contractually forbidden to mount, so that seam resolves null on every request.
   There is no forgery risk today, because the version check rejects the other
   format, but it becomes P0 the moment commission accrual is wired.
8. Nothing writes an Early Access referral grant, so every Early Access order is
   permanently unattributed and every commission hold is null. The reader is
   wired; the writer has zero callers.
9. Three referral authorities coexist — member rewards, the Gen-2 partner spine,
   and referral-v1 — with no document naming which one is authoritative.
10. The Care access queue has no operator UI, so the public promise of a
    follow-up within one business day rests entirely on an alert email whose
    failure is only logged.

### P2

Client robots metadata for three Care pages contradicts the server's noindex;
the access-request honeypot returns a reference the UI presents as a saved
request, and its trap field is a labelled "Website" input that an autofill can
populate; the closed and error states of the access request offer no alternate
channel; orphaned Tebra components and a dead client referral-capture module
with a wrong path ship in the tree; the CRM supplier-operations workspace is
unmounted on both sides; two command-centre cards link to dead screens.

### External blockers

| Blocked fact | Already implemented | Still qualifiable | Missing input | Blocks |
|---|---|---|---|---|
| Staging execution authority for SQL 2, 3 and 4 | all four candidates, with prechecks, postchecks and rehearsals | everything local | one amendment naming the executor | hosted checkout qualification |
| Staging and provider credentials | the qualification supervisor and browser harness | local gates | credentials held by a named executor | the same |
| Managed database truth | fail-closed readers throughout | source review | a working Supabase connection | any claim about installed schema |
| Render credential | — | public HTTP checks | authenticated Render access | deploy history, environment variable names, service settings |
| Clinical provider, pharmacy, jurisdiction | Care state machines | local tests | real relationships | activating clinical workflows |

---

## 4. Qualification record

Commands run in `C:/Users/sboad/projects/xenios-native-finish-20260910` with
Node 20.19.0 pinned at `C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64`.

| Gate | Command | Result |
|---|---|---|
| Route uniqueness | `npm run verify:route-uniqueness` | accepted, 440 registrations across 431 call sites |
| Migration DAG | `npm run verify:migration-dag` | accepted, 36 nodes, canonical checksums verified |
| Production state | `npm run verify:production-state` | accepted on the corrected baseline `c545a70` / `dep-dag8l567bikc738a1nj0`. The trusted-identity variables are a CI input; they were supplied locally for structural validation only and are not an attestation |
| Site system of record | `npm run site:record:check` | exits 0. It was failing before this session |
| Focused, Care contact | `vitest run server/care/contact.test.ts server/care/contact-email.test.ts server/care/integration-wiring.test.ts` | 3 files, 15 tests, 0 failed |
| Focused, Care and gateway client | `vitest run client/src/care client/src/research/pages/gateway` | 17 files, 134 tests, 0 failed |
| Typecheck | `tsc --noEmit -p tsconfig.json` | exit 0 at `51cf64f` |
| Full suite | `vitest run --maxWorkers=2` | **at `51cf64f`: 952 files, 947 passed, 5 skipped, 0 failed; 17694 tests passed, 59 skipped.** An earlier run at `2b07408` had 6 failures, all of them the production-SHA pin inside the release control plane's own test — the gate correctly refusing a baseline the records no longer agreed with — and the reconciliation then moved it |
| Build | `node script/build.mjs` | exit 0 at `51cf64f`, client and server |
| Evidence suite | `vitest run --config scripts/evidence/vitest.config.mjs` | 15 files, 229 tests, 0 failed |
| Release control plane typecheck | `npm run check:release-control-plane` | exit 0 |
| Release diff-scan unit tests | `npm run test:release-diff-scan` | 8 passed, 0 failed |
| Release diff scan itself | `npm run verify:release-diff-scan` | **not run**: it requires an out-of-repository PII names file this session does not have. A scan with no names would report a pass it had not earned |

### Browser matrix

Run against the candidate itself, not production: `scripts/evidence/build-candidate-preview.mjs`
performed `npm ci` and a production build from a clean checkout and pinned the
result, then `scripts/preview-research.mjs` served that exact build on
127.0.0.1 and `scripts/evidence/capture-browser-matrix.mjs` drove Chromium
149.0.7827.55 over raw CDP against it.

| | |
|---|---|
| Candidate | `694b54dbae8d5bf92bc1839b7a6ae860c9157de6`, tree `46aacba936a567807c6a0030ce55a697ab7c9ec3` |
| Build provenance | 344 dist files, inventory `3be4c3d8b4bf9d689310578230d1e47044d71e4bdaaf25861fdfa817b3bdf3de`, Node 20.19.0, npm 10.8.2, `npm ci` |
| Widths | 1440, 1024, 768, 430, 390, 375, 360, 320, plus a 200 % zoom equivalent at 720 CSS px and deviceScaleFactor 2 |
| Variants | default, `prefers-reduced-motion`, `forced-colors` |
| Routes | `/health`, `/care`, `/care/schedule`, `/research`, `/research/access-hub`, `/research/sign-in`, `/research/support`, `/research/policies`, and an unknown path |
| First pass | 88 runs, 55 pass, 33 fail |
| After re-pinning three stale route contracts | 44 re-runs, 33 pass, 11 pass-with-notes, **0 fail** |

Every structural and accessibility assertion passed on all 88 runs of the first
pass, before any correction: no horizontal overflow, no clipped text, no target
under 44×44, exactly one main landmark and one `h1` per page, no nested main,
no duplicate ids, every form control labelled, every image with alt text, every
aria reference resolving, a document language, the whole tab order reachable
with visible focus, self-hosted fonts loaded, a clean console, a clean network,
the same-origin boundary held with WebSockets disabled, and a stable service
worker controller.

All 33 first-pass failures came from three declarations that had drifted from
the site they describe, and none of them was a page defect:

- `/research` still required the hero copy "Research products." and "A clearer
  standard.", which exists nowhere in the client. `/research` has deliberately
  rendered the canonical Care + Research gateway since `8b53dbe`.
- `/research/access-hub` still required "Choose the path that matches what you
  are here to do."; a copy edit had shortened it.
- The two public 404 paths pin one shared authoritative not-found document by
  body hash, and those bytes had moved.

So the browser gate could not have been green on those routes for some time.
Re-pinning them changed no application bytes: the rebuilt dist inventory hash
is identical.

Evidence, hashed and verified, in
`C:/Users/sboad/xenios-recovery/claude-health-finish-20260914/` — 403 files
under a `SHA256SUMS` that verifies: gate logs, both build logs, both matrix
runs with every screenshot, rendered-text capture and per-run JSON.

Coverage limit, stated plainly: 9 of the inventory's 101 public routes were
captured, chosen as the launch-critical public entry journeys. The preview's
own header is explicit that its catalogue is not the canonical product set and
that it is good for layout, gating and form behaviour, not for data-dependent
verification. No authenticated journey was exercised.

Read-only HTTP evidence, 2026-09-14: both production origins answered
`/api/health` 200 with identical uptime; fourteen public paths were checked; an
unknown path 404s. No authenticated request, account mutation, notification,
payment or commerce action was performed.

Not run: managed or staging qualification, any authenticated journey, and
the other 92 routes in the public inventory.

---

## 5. Release candidate packet

**A production release is not recommended yet.** Not because the code is
unsound, but because the four P0s above sit between the candidate and the
customer, and none of them is a payments problem.

If the founder nonetheless wants the current candidate deployed, it would be:

| | |
|---|---|
| Candidate | the head of `codex/xenios-native-finish-20260910` at the time of the GO |
| Current live | `c545a70eb694d990842ad1259df4f0786dab92c9`, `dep-dag8l567bikc738a1nj0` |
| Relation | linear descendant, 0 behind |
| Migrations required | none. The four checkout candidates stay uninstalled, and the application tolerates their absence while commerce is disabled |
| Flags to change | none. Leave `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` false, the recovery caller off and the receipt queue off |
| Rollback | redeploy `c545a70` by commit id. No schema change means no data rollback |
| Post-deploy smoke | `/api/health` 200 on both origins; `/`, `/health`, the five `/care` paths and the three `/research` paths return 200; an unknown path 404s; `/care/support` submits and, with mail configured, returns 200 — with mail unconfigured it must now return 503 rather than a false success |
| Secrets | none in this document. Variable names only |

The hosted checkout execution request is unchanged and still stands at
`docs/native-finish/HOSTED_EXECUTION_PACKET_20260911.md`. Its central finding
holds: the approved SQL candidate cannot support the checkout journey alone,
because the application calls credit functions that only the unapproved
candidate creates.

**Production action: NOT AUTHORIZED.** Nothing in this session deployed,
migrated, enabled a flag, sent mail, charged money or mutated any managed
system.

### The exact next decisions, for the founder

1. Do the four P0s get closed before any release, or is the release scoped to
   the public and Care surfaces only?
2. For P0-1, which shape is canonical: the frozen six-field DTO, or the ten-kind
   view?
3. Does the amendment in the hosted packet get approved, and who is the
   executor?

---

## 6. What this document does not claim

It does not claim the site is finished. Checkout completing locally is not
full-platform completion, and a capability being implemented is not the same as
a customer being able to reach it. The rows above marked implemented but
unmounted are the difference between a codebase that contains a platform and a
platform that runs.
