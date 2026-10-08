# Source-integration inventory, revision 1

Records-only inspection. No integration, source changes, qualification, database query, installation, push or deployment.
Snapshot: 2026-10-08T18:37:41Z. Scope is SOURCE-INTEGRATION-INVENTORY-20261008:r1.

## Conclusion

The catalog and Workstream C direct patches are disjoint, but their complete histories are not interchangeable.
Workstream C forks before the accepted integration; its accepted wording must travel with its newer behavior.
The Quick Order verifier descends from the now-rejected supervisor. Accepting one does not accept the other.
Public catalog presentation is independent of a durable Quick Order transaction, which is still missing/held.
No complete assembly or execution is eligible from this inventory alone.

Doc 55 was pending in the assignment but is now committed at
`d97f855874c486da9ed020934b06b0f1b5757aa0`: **SOURCE REVISION REQUIRED**.
Reviewer snapshot `9e6b601a8551ad9fe12e06d953e4e4fd1d6bd41f` acknowledges catalog Doc 56 next.
No message was sent to Claude, no new reviewer was started, and no catalog/C acceptance was inferred.

## Authority and ownership

Coordinator packet: `1b165b15bfd6b575c25d66be7c9c15cce8ee94fa`,
`docs/coordination/launch-coordination-20261005/SOURCE_INTEGRATION_INVENTORY_ASSIGNMENT_20261008.md`,
and its `sourceIntegrationInventoryAssignment` board entry.
The actual human request was independently read in chat
`01a10d12-0764-7222-8b5a-5029508020ad`, user message
`01a11cc4-c1a0-74a0-bec9-fd3cd033f86d`.
The attached directive's actual SHA-256 is
`0b94731b7a7f19af9af70ec4e25105bb5eecc52575286b55ce07fd1751b248a9`.
Section 5 authorizes the integration inventory; routine coordinator handoff follows the existing human-authorized loop.

Same owner/session `codex-accepted-source-integration-20261005`, same task
`ACCEPTED-SOURCE-INTEGRATION-20261005`, same lease
`d0897045-efd3-425b-a8b4-02385e855153`, same branch
`codex/accepted-source-integration-20261005`, same b22f checkout.
Only the two named inventory files, own handoff/session and own registry rows are writable.
The baseline was clean at `9737db71014d1073ec5ffe9a78b2a1c491220813`.
Workstream C transfer `20a23057f99529241ef1f593175670e13ab86f67` remains unchanged.
Actual model/effort is not exposed; no switch or actual-setting claim was made.

## Exact source, tree and records

Full parents, source/records trees, direct path sets and Git blob bindings are in
`source-integration-inventory-20261008.json`. Trees below belong to source commits, not later records tips.

| Package | Source | Source tree | Records |
| --- | --- | --- | --- |
| Accepted integration | `756a906877dbc174b7e228a259d2faa9c3af48ca` | `787432948d9464880df1dcfc5dff58eec7d889aa` | `38c723964358c18b8c5090f2f9a0aa92f74601b0` |
| Catalog/detail B | `e0a7d4787071140a25a984edc4c0a49f0d7c22ab` | `340248360ac85f50f10ed5890624401616f792fd` | `9737db71014d1073ec5ffe9a78b2a1c491220813` |
| Accepted subscription wording | `e6d7dd10045289594d91a6a086ba592348d7edb8` | `7cb1521f5466dce0c226eda1126c49ed958000cd` | `95283ce83fdedf4dbeb84f131aed16008e6f3c5f` |
| Workstream C behavior | `736bb2a84fa5b704eabdd8b069bc3ef89b084979` | `920691093dc817a7dcf631b26f50fd41a3f20aa3` | `e5ca41d5e6a6f41ee2b3a24703830d9e9037da90` |
| Quick Order repair | `3e82154724ede74b7c5f361f280739eedd60db25` | `04958ec1567b74bccd84e423e179e6269faf6bee` | `1631323d7cf60f145141e0f82586e64ef7c7d637`; acceptance closeout `7f8edd7535c6c80c963d213e1ea92a705c5c814a` |
| Head integrity | `f581b6bd42b5c32cb7791677159522ddf6274aaa` | `9efb20d52e253027b2d3b803a5e11d5ff8ca7541` | `30085a641a2101d6578d26fb42a7468a16c8351e` |
| Decision-input currentness | `e90d464a2e2f81f6b30a02bfef2fd3ccbe35d9e7` | `bdb31ef330f59ddce89d53238107a3341e04dc86` | `5a49ef043c43663c7a19c9b1c1b9988439062240` |
| Supervisor | `1e808bab28fac90437de93628a15a7fb0322d53e` | `0fd769d844228c7b9a9352935b25c214cb572493` | `8e462da35b4319dc6d0c53b0d7b431d0b2c6f562` |
| Verifier follow-up | `2d2d958f5c45259d5d1134665f3eb5b8caf9c172` | `b7826387a6868bd86501804ba152e861b5e442c4` | `0d417a918a45ee9e4015f41abba8976e9660c3dd` |

All observations use local immutable objects. No remote fetch/transfer or current remote-publication verification occurred.
Historical pushed status of older checkpoints is not a claim that their newer successors are pushed.

## Ancestry and path intersections

`756a906` is an ancestor of catalog B and Quick Order, but **not** of C.
The accepted integration/C merge base is
`3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`.
The accepted integration and C's pre-wording source at `1fe97f5` nevertheless have identical Git blobs
for all four C files; the exact comparison is retained in the JSON.

The ancestry constraints are:

~~~text
common Core base 3eaa017
  accepted integration 756a906
    catalog ownership 20a2305 -> catalog e0a7d47 -> records 9737db7
    earlier Quick Order foundation/containment/relocation/wiring/candidates
      repair 3e82154 -> head f581b6b -> old supervisor 90f4ebd
        -> currentness e90d464 -> supervisor 1e808ba -> verifier 2d2d958
  earlier Core/subscription lane -> pre-wording 1fe97f5
    -> wording e6d7dd1 -> records 95283ce -> C736bb2a -> records e5ca41d
~~~

Arrows abbreviate intervening records; they do not imply each package is accepted.
The JSON carries each named commit's actual parent.

Definitions: **direct** is first-parent to named commit. **Cumulative** is the net changed-path set from the
explicit common base `3eaa017`, including inherited source and records. Neither is a merge-conflict simulation.

| Package | Direct paths | Common-base cumulative paths |
| --- | ---: | ---: |
| Accepted integration | 65 | 69 |
| Catalog B | 4 | 120 |
| Wording | 2 | 67 |
| C | 4 | 68 |
| QO repair | 23 | 220 |
| Head | 6 | 226 |
| Currentness | 6 | 235 |
| Supervisor | 2 | 239 |
| Verifier | 4 | 245 |

| Pair | Direct intersection | Common-base cumulative intersection |
| --- | ---: | ---: |
| Catalog / C | 0 | 22 |
| Catalog / any named QO source | 0 | 69 |
| C / any named QO source | 0 | 22 |
| Wording / C | 2 | 67 |
| Repair / head or currentness | 5 | 220 |
| Repair / verifier | 3 | 220 |
| Head / currentness | 5 | 226 |
| Head / verifier | 3 | 226 |
| Currentness / verifier | 3 | 235 |
| Currentness / supervisor | 0 | 235 |
| Supervisor / verifier | 0 | 239 |

The 22-path catalog/C cumulative intersection includes three registry files, inherited Core shell/assisted-order
presentation, the subscription adapter/tests, and C's four paths. It does not mean their direct edits collide.
The 69-path catalog/QO intersection is the inherited accepted-integration set, not 69 new simultaneous edits.
Every exact set and all 28 source-pair intersections are reconstructable from the JSON's indexed path dictionary.

The two wording/C direct overlaps are:

- `client/src/research/pages/member/ProductPage.subscription.test.tsx`
- `client/src/research/product-subscriptions/ProductSubscriptionCreate.tsx`

The common five currentness paths are the candidate `.sql`, `.precheck.sql`, `.postcheck.sql`,
`.rollback.md` under `supabase/candidates/20261006_research_health_quick_order_currentness*`,
plus `supabase/verification/research_health_quick_order_currentness_local.mjs`.
The verifier's three-path overlap excludes pre/postcheck. Its SQL change from e90 is header comments only.
Its executable verifier changed; the rollback notes changed. This does not make the entire commit records-only.

## Assembly constraints, not authorization to assemble

1. Preserve accepted integration `756a906` and its explicit release holds. Its review/evidence do not qualify B or C.
2. Catalog B is a four-path presentation/test delta. It has no dependency on new QO database functions. Await its
   original reviewer disposition and newly authorized component/browser qualification; do not repeat the implemented UI.
3. C must retain accepted wording `e6d7dd1` before applying the behavioral delta `736bb2a`, or bind the four final
   C blobs as a combined selection. Selecting the behavioral patch alone against the integration can omit wording
   context. The full-period assertion is already present in C; do not author it again.
   Do not replay earlier Core/subscription ancestors or copy their registry rows. Additional C behavior is still unaccepted.
4. The QO repair is not a standalone feature: it follows the existing foundation, parser containment, relocation,
   HTTP, disabled mount, admin-reader, composition-test and SQL-draft work. The cumulative application/candidate
   delta against `756a906` is listed separately in JSON. It includes protected `client/src/App.tsx` and
   `server/index.ts`, privacy/PWA seams and the admin reader cutover. Their prior source authorization does not
   remove exact-hash, qualification or release requirements. This inventory selects none of them.
5. A future source selection must retain the four intake-candidate files and intake verifier from `3e82154`;
   retain the currentness pre/postcheck from `e90d464`; and, only after bounded acceptance, retain the newer
   currentness SQL header/rollback/verifier at `2d2d958`. Do not regress to the old f581 signature or verifier.
   Application bytes under client/server/shared/scripts and protected manifest/package paths are unchanged
   between `3e82154` and `2d2d958`; that does not make all intervening commits application-ready.
6. **Do not merge the verifier branch wholesale:** its ancestry includes supervisor `1e808ba`, which Doc 55
   rejects. Supervisor and manifest are qualification controls even though stored under docs. Keep their source,
   manifest, external bindings/receipts and acceptance distinct from application/currentness packages.
7. The frozen supervisor manifest still binds f581. A fresh reviewed re-pin must name accepted currentness/verifier,
   application/test/fixture source, actual approval provenance, limits and time window. Neither the hourly task nor
   an old receipt grants execution. No preparation/G0 or database verification is presently qualified by this inventory.
8. Never merge coordinator Finance ancestry, foreign registries, historical evidence rewrites or branch-wide records
   into an application assembly. Carry the required source receipts and acceptance references without treating them as tests.

## Acceptance ledger at the inspected reviewer snapshot

| Package | Recorded disposition | What it does not mean |
| --- | --- | --- |
| Integration 756a906 | Accepted composition with release holds; corrected record `fffa33a6b3407b407b2b43d3c5a5c7054887f590` | Not release/customer-purchase ready |
| Wording e6d7dd1 | Doc 54 `63fdb0a438ad123dfa9e0b66898f3a00c83ea680`: SOURCE ACCEPT WITH LIMITS | Partial PS-R4 only; not C behavior acceptance |
| Catalog e0a7d47 | Doc 56 acknowledged at `9e6b601`; no verdict in that snapshot | Authoring is not acceptance or browser proof |
| C736bb2a | Additional behavior pending original review | In-memory lock is not durable reload/cross-tab idempotency |
| QO repair 3e82154 | Doc 48 `7dde166bad54e7c5d6b673434d04cd591c93e3e9`: SQL draft/composition source accepted with limits | 5C held, no execution/installation |
| Head f581b6b | Doc 50 `a2be7e2bac24bc0e7d5ba2275b7c33f4d80b4dde`: SOURCE ACCEPT WITH LIMITS | Held metadata, not active transaction authority |
| Currentness e90d464 | Doc 53 `58c6f586b5242421ebbd63118fa6823d9ef8642c`: SOURCE ACCEPT WITH LIMITS | No writer/commit, no activation; CF-11 census preimage open |
| Verifier 2d2d958 | CF-1/CF-2 corrections authored, bounded review pending | No executed verifier result |
| Supervisor 1e808ba | Doc 55 `d97f855874c486da9ed020934b06b0f1b5757aa0`: SOURCE REVISION REQUIRED | No eligible execution group |

Doc 55's smallest coherent repair is CR-01 to CR-07: command-environment allowlist, five newline-rendered names,
non-consuming per-command admission/resumption, trusted input attestation, expected-red calibration,
wall-fit/admission budgeting, and pre-window approval/review timing. Its CR-08 to CR-31 hold/precision findings
remain in the controlling record, including currentness re-pin CR-29. Bootstrap interruption, inherited handle
allowlist, G0 process/wall proof, TAP calibration and G7 shared wall remain explicit holds, not waived approvals.
Do not call a supervisor source repair a new execution window.

## Source-observed customer/runtime and database dependencies

These observations concern immutable candidate source, not a served deployment.

| Capability | Present source | Missing/held prerequisite |
| --- | --- | --- |
| Catalog/detail presentation | B renders the existing supplied Product Control projection, facts, filters and variants | Original B acceptance plus authorized integrated tests/browser checks. It does not require new QO SQL and does not prove live catalog authority. |
| Subscription presentation | C preserves `product={null}`, `commerceEnabled={false}` in ProductPage; maintains an in-memory attempt owner while hiding/loading the view | Real eligible-offer projection, current-price decision, durable idempotency, attribution/activation/payment authority and owner decisions remain separate. No subscription purchase becomes possible from C. |
| QO entry point | At 3e82154, `server/index.ts:274-278` mounts pre-parser containment returning private 503; production ports are explicitly unmounted | Protected mount and complete accepted/qualified runtime composition. A route or flag is not an operational intake. |
| QO session/preflight | `production.ts:42-65` uses the canonical viewer, submit capability, actor and session-bound CSRF; handler has read/preflight ordering | Future raw stored session-hash/owner-role lock and post-wait checks are not implemented by the actorId/CSRF-only session contract. Health legal/configuration and current decision authority remain held. |
| Durable QO submission | `production.ts:88-98` delegates replay only if an extension exists and always throws from commit | Accepted canonical commit, source guards and writer protocol; session/liveness/policy scope; atomic request/lines/event/intake/receipt/outbox; service-only recipient and protected runtime wiring. No database commit body is supplied. |
| Lost-response recovery | Handler calls actor-scoped getExisting; candidate `research_health_quick_order_replay(text,text)` exists | Qualified/installed intake candidate and actual production extension mapping authenticated viewer/actor/key to replay. A replay reader is not a writer or an authentication grant. |
| Operator request detail | At 3e82154, `supabase-repository.ts:419-431` calls `research_health_quick_order_admin_detail(uuid)` and fails closed | The service-role wrapper must be installed and qualified before reader cutover. Missing enrichment cannot fall back. This dependency affects existing admin detail, not only a hypothetical new QO request. |
| Currentness metadata | Immutable revisions, canonical decision text, a held singleton, own-table integrity, publish/revoke | The reader at 2d2d958 `currentness.sql:549-554` always returns unavailable. No active reader/activation, source-write guard, commit or runtime consumer is supplied. |

Paths abbreviated in that table are under `server/research/health/quick-order/`,
`server/research/assisted-order/` or `supabase/candidates/` as appropriate.

The intake candidate at 3e82154 requires READ COMMITTED, the canonical provider-fence schema owner with
RLS-bypass authority, anon/authenticated/service_role, `extensions.digest(bytea,text)`,
`research_assisted_order_admin_get(uuid)`, provider settlement-integrity/fingerprint functions,
canonical requests/lines/events/outbox and the exact nineteen-trigger predecessor inventory.
Its install block explicitly refuses an existing `research_health_quick_order_commit` or
`research_health_quick_order_guard_source_write` (`intake.sql:341-390`).
Consequently the future commit requires a separately owned intake/precheck/postcheck compatibility amendment,
not installing a body around those refusals.

Currentness likewise requires the canonical owner/fence/functions, digest, nineteen-trigger inventory,
non-partial namespace, exact definition/fingerprint seal and held head. Its own mutation/monotonic guards protect
its two authority tables; they are not the still-held guards on canonical product, inventory, legal or session
sources. A nondecreasing epoch guard does not establish the future strict writer protocol.

Latest policy/scope authority is coordinator
`1b165b15bfd6b575c25d66be7c9c15cce8ee94fa:DOC51_CARRY_FORWARD_AND_DECISION_INPUT_SCOPE_20261008.md`
under the coordination report root, as dispositioned by Doc 53. Preserve:

- **Referral OUT:** current QO carries declarations only, with unmatched/direct evidence and no authorized commission.
  Referral-family epoch dependencies and the old privacy_begin replacement were explicitly removed. Do not restore
  them from an older HELD_5C document or invent effective attribution.
- Inventory owner scope must be re-derived for actual changed predicates and lock order. Quantity/version-only
  changes with unchanged protected projection do not automatically take the head; blanket replacement of every
  inventory writer is not the accepted requirement.
- Quantity existence-versus-sufficient-stock policy, exact Health agreement/configuration pairs, product/workflow,
  audience and destination applicability, revocation/refusal/lock budgets remain owner decisions.
- Same-owner/privilege proof, explicit call/operation inventory, session lock/recheck, future definer/ACL/fingerprint,
  intake-family compatibility and strict head-write protocol remain held-body prerequisites.
- CF-11's exact closed reader-census preimage is still open. No real readerCensusSha256 may be filled from a
  shape-valid synthetic fixture. Parser bounds and source hashes do not establish operational approval or capacity.

## Evidence limits and next eligible action

Historical record `0d417a9:docs/health-launch/quick-order-20261005/SQL_CANDIDATE_DRAFT_STATUS_20261006.md`
says the candidates are not installed/qualified/operational. This inventory confirms the record exists;
it does **not** observe the current hosted database. Current hosted installation/deployment is UNKNOWN.
No resources were sampled and no subject source, SQL, verifier, test, compiler, build, browser or server ran.
The Supabase skill was used to keep source ACL/function prerequisites distinct from live database evidence;
its usual query verification is outside the controlling no-execution scope and was not performed.

Commands were read-only Git metadata/source operations (`show`, `log`, `diff-tree --raw`, `diff --name-only`,
`merge-base`, `rev-parse`), file/record reads and SHA-256 of the directive/output files.
Ancestor exit 1 for accepted integration to C is an observed false relation, not a test failure.
Truncated display attempts were reread narrowly; they were not qualification runs.
Local commits use a per-command hook suppression to avoid prohibited execution, not to waive release gates.
Both schedules were left unchanged, and no remote payload was transferred.

The next concrete source repair belongs to the existing Quick Order supervisor owner on its same two authorized
supervisor/manifest paths, under Doc 55 and the existing coordinator assignment. This owner did not dispatch or
duplicate that repair. Catalog Doc 56 is already acknowledged; C behavior and the verifier successor retain their
own pending dispositions. No additional customer-source task is proven eligible inside this owner's records-only
lease. Remain available for actual B review corrections; do not invent a new feature or retry completed UI work.
The coordinator's existing consolidated decision register remains the place for held transaction/policy approvals.
This inventory creates no new approval question and no release or customer-purchase readiness claim.
