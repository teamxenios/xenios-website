# Revision 19: incident intake-closure recovery plan at `8e85daa`, source and document review

**Disposition: SOURCE-COMPATIBLE as hold-preserving incident containment, with three precision corrections to the
plan text; NOT a rollback; NOT qualified, authorized or operational.** The plan does exactly what the unchanged
source supports: a `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED` value other than the exact string `true`, evaluated once
at boot, composes the bridge with `service: null` and `refusalReason: assisted_order_bridge_disabled`; the ten
assisted-order doors stay registered and answer an explicit state (config `200 {enabled:false, code:
assisted_order_unavailable, reason}`, the other nine `503` with the same reason); the service that performs status
transitions is never constructed, so the QL12 hold is not merely preserved but moot; no record is touched; the rest
of the site boots and serves unchanged. It is the containment the repository itself documents as the first response
(Phase Zero fail-safe, RC manifest `flag_off_first_then_runtime`, rollback notes "containment without dropping"). It
satisfies the "meaningful hold-preserving recovery target/method" stop condition only for an incident whose blast
radius is the assisted-order lane: it stops that lane without downgrading to `794` or relabelling `3dd`, and it
truthfully claims neither an application rollback nor retained online staff readback. For a defect elsewhere in the
shared `8e` runtime it is not a recovery, and the Core comparison's limitation stands: no source-grounded
hold-preserving rollback exists for that case, and that must be reported rather than papered over.

Reviewer: this session, `claude-fable-5-1`, revision 19. Read-only on repository bytes; no agents, no source edits,
no parser, imports, tests, probes, UI, provider, remote, G0, browser, SQL, mutation or deployment. I did not fetch
the Render documentation; those facts are owner-asserted and marked so below. Docs 117 and 118 remain closed and are
not touched. Application `8e85daa`/`25507c2f` unchanged. Archive: `hl12/119_incident_intake_closure_recovery_plan.json`.

**Where the bytes are.** Root packet `DOC118_INCIDENT_INTAKE_CLOSURE_RECOVERY_PROPOSAL_20261013/`:
`EXACT_PROPOSAL.json` 2,854 B `442020f2…`; `EXACT_ROLLBACK_OR_INTAKE_CLOSURE_DECISION_SOURCE_ONLY.txt` 7,187 B
`98e3e1cb…` and `RENDER_CLOSURE_METHOD_R2_PRIMARY_DOCUMENTATION.txt` 6,520 B `836f26fa…` (both equal to
`ROOT_RAW_INDEX.json`); `CORE_PAYMENT_HOLD_PRESERVING_ROLLBACK_COMPARISON.json` 12,105 B identical to Core blob
`cf2def9c` at `1961e810`. The proposal's three source anchors are the exact blobs at `8e85daa`: `production-deps.ts`
`26e2719c`, `production.ts` `cd156aae`, `server/index.ts` `56d0d3ab`. `service.ts` (the hold,
`payment_transition_held` at line 119) is blob `d7d26cf0` at both `3dd3d96` and `8e85daa`, as the comparison says.

## 1. Source facts the plan rests on, verified

- **Parse.** `production-deps.ts:92`: `enabled = env[RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED] === "true"`. Exact,
  case-sensitive, untrimmed string equality: `false`, empty, unset or any other spelling disables. The literal `false`
  is the clearest choice; nothing else is needed.
- **Boot-evaluated.** `buildAssistedOrderProduction` runs once inside `composeAssistedOrderBridge()` in the boot IIFE
  (`server/index.ts:1291`), reading `process.env` at that moment; the ten handlers are bound to that composition
  result. There is no per-request re-read. A new process is required; a saved-but-undeployed value changes nothing,
  which is why the plan's "boot-evaluated, not instant" and "Restart cannot activate" statements are right in source
  terms (the Restart semantics themselves are a provider fact I did not verify).
- **Disabled composition.** `production.ts:78–85` returns `{enabled:false, service:null, refusalReason:
  "assisted_order_bridge_disabled"}` before any dependency is examined; `AssistedOrderService`, and with it every
  submit, status, document and admin transition path including the hold, is never constructed. The log line is
  `assisted order bridge not mounted: assisted_order_bridge_disabled (audit mode: …); every door answers the explicit
  unavailable state` (`index.ts:1023`).
- **Door coverage and author ordering.** Ten unconditional literal registrations (`index.ts:1004–1016`): six
  customer doors (config, catalog, submit, status by reference, upload-url, complete) and four admin doors (queue,
  detail, status PATCH, download-url). Literal paths precede parameterized ones. When `service` is null each door is
  `assistedOrderUnavailableDoor` (`857–871`): config `200` with `enabled:false`, `code`, `reason`; every other door
  `503 {error: assisted_order_unavailable, reason}`; `Cache-Control: no-store`. The admin doors carry
  `requireSupabaseAdmin` first, so an unauthenticated probe sees that guard's `401/403`, not the `503`; only an
  authenticated admin observes the disabled state. The research wall (`app.use(researchPageGate)`, line 377, with
  the admission lists in `server/research/index.ts:333–371, 424–441`) is registered before the doors and admits config
  and catalog openly, submission openly to the handler's own gate, and the parameterized reference/document paths by
  anchored regex. The doors are registered before `registerRoutes` (1329), static serving (1363) and `listen` (1374),
  so nothing later can shadow them. The production boot test at `8e85daa` pins exactly this disabled behaviour
  (`production-boot.test.ts:284–300`): config `200 enabled:false reason:assisted_order_bridge_disabled`, catalog `503`
  with the same reason, no generic 404 on any of the ten doors, site root still `200`.
- **What else the flag reaches.** The founder command center receives no assisted-order port when the composition
  is disabled (`index.ts:1028`, `1291–1300`) and its card reports "Canonical assisted-order admin reader
  unavailable" (`founder-command-center-production.ts:475–484`). The early-access persistence composition folds the
  bridge flag into `productionCommerceEnabled` (`persistence/production-deps.ts:331–336`): with the bridge off, the
  agreement-policy refusal is forced only if `RESEARCH_EARLY_ACCESS_ENABLED` is `true` or the cart flag is on. The
  recorded production snapshots (2026-09-05 and 2026-09-07) show `RESEARCH_EARLY_ACCESS_ENABLED=true`, so no
  behaviour changes if that is still so; it must be confirmed in the preflight.
- **What the flag does not reach.** The member account order history (`/api/research/orders` family, wired at
  `index.ts:518–521`) decorates the commerce orders source with `createAssistedMemberHistoryReader`, which reads the
  M71 RPC `research_assisted_order_member_history` directly with the service-role client, independent of the bridge
  composition. Authenticated members can still read their own historical XRR requests, read-only, while the bridge is
  closed. The outbox worker (`startOutboxWorker`, 1288) keeps running and will still render and send
  assisted-order notification intents that were already enqueued. Neither is a write door and neither undermines
  containment, but both contradict the plan's "ALL customer readback closes" and "no customer message" wording if read
  literally.
- **Client.** The wizard's `loadAssistedOrderConfig` throws `assisted_orders_disabled` on `enabled:false`
  (`api.ts:149`), and the CTA renders its "Order requests are temporarily unavailable" state on anything but
  `enabled:true` (`AssistedOrderCta.tsx:42–46, 97–99`). The SPA route itself keeps serving; the site "keeps running"
  claim holds.
- **Served identity.** `/api/health` is liveness plus configuration-presence booleans and carries no commit
  identity (`routes.ts:202`, `health.test.ts:9`). The only served, source-grounded commit identity is the founder
  command center's `release.runtime_sha` fact, which echoes `RENDER_GIT_COMMIT` when it is a 40-hex SHA
  (`founder-command-center-production.ts:1021–1039`), behind that API's own authorization. Provider deploy records
  are provider association, not served proof.

## 2. Does it meet the stop condition?

- **As containment for an assisted-order-lane incident: yes, in source.** Intake, status, documents, admin queue,
  admin transitions and the founder card all close at the next boot; records and the hold-bearing source are
  untouched; `794` is not touched; nothing is dropped. It is stronger than hold preservation because no transition
  code runs at all.
- **As a rollback: no, and the plan correctly does not claim it.** It restores nothing and fixes nothing. For a
  shared-runtime defect outside the assisted-order lane, the Core comparison's conclusion holds: `794` loses the hold,
  `3dd` shares the application and is not currently rollback-qualified, so no source-grounded hold-preserving rollback
  exists. The release owner must record the trigger as an assisted-order-lane incident for this plan to be the
  recorded recovery, and must report the residual limitation for other incident classes.
- **Staff readback.** Correctly claimed as lost: admin doors `503` behind admin auth, founder card unavailable, no
  online queue during closure. Working outstanding requests by hand needs an out-of-band channel; the rollback notes
  anticipate this ("work the outstanding requests to completion by hand").

## 3. Smallest material corrections (text only; no source change)

1. **Effects statement.** Replace "ALL assisted-order customer and staff queue/readback/status/document doors close"
   with: the ten bridge doors close (config `200 enabled:false reason assisted_order_bridge_disabled`; the other nine
   `503` with that reason; the four admin doors only after `requireSupabaseAdmin`); the founder command center
   assisted-order card reports unavailable; the member account order history continues to project historical XRR
   requests read-only through the M71 member-history RPC and is not a bridge door; previously enqueued outbox
   notifications continue to dispatch. "No customer message" means no operator-sent message.
2. **Read-only post-check procedure.** Name it exactly: three unauthenticated `GET`s, config (expect `200`,
   `enabled:false`, `code assisted_order_unavailable`, `reason assisted_order_bridge_disabled`), catalog (expect `503`
   with that reason), and status by a well-formed non-existent reference `XRR-00000000-0000000000` (expect `503` with
   that reason; while enabled it answers `403/404`); one authenticated admin `GET` of the queue (expect `503` with that
   reason); the boot log line above; and served identity through the founder command center `release.runtime_sha`
   read or, failing that, the provider deploy record with the explicit note that `/api/health` cannot confirm the
   commit. The `reason` string is what distinguishes the flag-off state from a dependency refusal. No `POST` probe and
   no real request.
3. **Preflight additions.** Record the current `RESEARCH_EARLY_ACCESS_ENABLED` and `RESEARCH_EARLY_ACCESS_CART_ENABLED`
   values (expected `true` / `false` per the recorded snapshots) so the agreement-policy refusal remains forced by the
   early-access flag; record the trigger class (assisted-order lane) and the residual limitation for other classes;
   and record that the closure window has no automatic reopen and that reopening is a separately qualified recovery.

## 4. Qualification, method and authority prerequisites (all still open)

- Target-specific human authority from Samuel for the single environment mutation and the one same-SHA containment
  deploy, accepting temporary loss of customer and staff assisted-order access; neither clause 6 of `20041ef` nor
  the direct continuations record this mutation or incident selection, as the packet itself states.
- Core's authenticated method verification at the authorized boundary: service and workspace identity, current ref
  and source, the exact current environment row, no pending configuration edits or deploys, no newer work, auto-deploy
  off, availability of "Save only" and "Deploy a specific commit" in the account's dashboard. The Render documentation
  statements (save-only persistence, service-level precedence, exact-SHA dashboard deploy, restart not incorporating
  saved values) are owner-asserted; I did not fetch them. The REST PUT replace-all and the connector's missing
  `commitId` are correctly excluded.
- A finite ticket: one attempt, zero retries, preserved receipts for save outcome, deploy identifier and associated
  commit, build result, served identity and the post-checks above; stop on any failed or unknown step; no `794`, no
  database, role, payment or profile change, no customer message.
- The trigger itself: a confirmed shared `8e` request-safety or payment-hold incident observed after `8e` is
  served. Observing an incident grants no live-write, SQL or data authority.
- Independent closure: after the deploy, confirm the new process serves (served identity plus the disabled
  responses); a failed deploy leaves the old configuration and the old process active, and "Save only" alone closes
  nothing.

## 5. Scope

No execution consent, no gate waiver, no reopening of the accepted application, CLI, protection or static receipts,
and no composition review beyond the flag's reach. The 3dd/794 dispositions in the Core comparison are not
re-adjudicated; their source identity facts were checked and agree.
