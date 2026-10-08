# Accepted customer-source assembly, 2026-10-08

LOCAL ONLY. EXACT BLOBS ASSEMBLED. NOT RUN. COMPOSED CHECKPOINT NOT YET ACCEPTED.
No release readiness, live behavior, purchasing or subscription enablement is claimed.

## Exact identities

| Item | Value |
| --- | --- |
| Assignment | `CUSTOMER-ACCEPTED-ASSEMBLY-20261008` r1 at coordinator `8655288a1059a9fbd0ae985161db440481b9f9fa` |
| Branch / worktree | `codex/accepted-source-integration-20261005` / `C:/Users/sboad/.codex/worktrees/b22f/xenios-website` |
| Same session / chat | `codex-accepted-source-integration-20261005` / `01a0e098-3b23-7233-9b07-877ace092650` |
| Same task / lease | `ACCEPTED-SOURCE-INTEGRATION-20261005` / `d0897045-efd3-425b-a8b4-02385e855153` |
| Clean starting records | `37f2d9648916b50fae2fd99b3c5ee46174893fae` |
| Recipient-claim commit / source parent | `9c2dd1cb1d4943aa3c924e77931bad4d02050c6c` |
| **Assembled source** | **`cad2c4d1b1dd4ead798b032e6abf8b55e1c2f055`** |
| **Source tree** | **`e90de4206f9698f00bc1ee8a9905978db8c960ce`** |
| Preserved B source / tree | `8f080a08af06aa16e7aaf80add1a1b25e0cfae41` / `7ff4d6a5059466e716d9b81f66a696cf69bc53d3` |
| Incoming C source / tree | `736bb2a84fa5b704eabdd8b069bc3ef89b084979` / `920691093dc817a7dcf631b26f50fd41a3f20aa3` |
| Required C records correction | `937c91378e5f0d11f54795880188f7265a2faf5c`, tree `7d7e8118c6c82351e1a9b06839973fdac9d1bba5` |
| Explicit return transfer | `ce5e58f7917f815576e19be97e30ccdb95a06312`, tree `a64a8bba323a9810a1bb04f03bc2a52468069705` |
| Doc57 C acceptance | `23600f771340029471c48b144572a75f4598155a`, SOURCE ACCEPT WITH LIMITS, NOT RUN |
| Doc60 B acceptance | `dc34f6a1eaae9ac9bdcdd88ec3a896e476ab5b48`, SOURCE ACCEPT WITH LIMITS, NOT RUN |

The records/handoff tip is the containing local records commit, reported by exact SHA in the final response.
Its identifier is not self-embedded. No source acceptance is inferred for the composition merely from its inputs.

## Authority and exact transfer receipt

The full original Doc57 and Doc60, C records correction and explicit transfer were read. The clean local
integrator remained at the expected `37f2d96`; no newer work was discarded. Mandatory continuity and current
ownership were reconciled in the existing session. No new session, owner, reviewer or branch was created.

Samuel's actual human message was independently read in coordinator chat
`01a103a8-5684-7272-89e5-3c42eefcd593`, turn `01a11bc5-1154-74a3-a5de-75f3f9c0ddae`,
message `01a11bda-03c1-7103-bba7-757c7a9aa8d6`. It supplies FULL_COMPLETION attachment
`96001a74-ef4d-4c2c-8747-d6ed8e02a818`, SHA-256
`effa648e80ef813c94f1bd757b06177045ae4665aa41f789f433a5b50ab2a703`.
Sections 6 and 7 step 5 preserve this integrator and direct integration of accepted corrections.
Exact B/C scope remains directive `94485a6a0efc8f347ea8e652ffd4744228ae3595`, with additive
`1b165b15bfd6b575c25d66be7c9c15cce8ee94fa`. A reviewer verdict is a prerequisite, not source or execution consent.

The outgoing transfer incorrectly attaches the full-completion section numbering to the additive directive.
This record corrects that citation only. Its original bytes are unchanged and not imported as current authority.
The outgoing lease at `ce5e58f` explicitly excludes exactly four C source/test paths and retains records scope.
This recipient recorded its own exact claim at `9c2dd1c`; Git proves that claim commit precedes the source commit.
No claim about physical edit timing is needed from Git alone.

The prior outbound transfer `20a23057f99529241ef1f593175670e13ab86f67` remains historical in this owner's row;
the new `workstreamCReturnReceived` field records receipt. Foreign registry rows and top-level fields stay unchanged.
The legacy `OWNER-W2-PR85-INTEGRATION` / Website 2 reservation in `docs/coordination/FILE_OWNERSHIP.json`
is preserved, blob `899840292dca5491651ba18677c8b789e6ec3fdf`. Current exact human C scope, the original
transfer and explicit return govern these four paths only; no broader reservation or foreign test is taken over.
An unrelated active global-continuity lease is also untouched. No stale-heartbeat inference was used.

## Exact source delta and final eight customer bindings

The source commit changes only the four C paths below, 298 insertions / 51 deletions. They were copied via an
exact Git diff applied with `apply_patch`, not rewritten or combined with new glue. The older C branch was not
merged, cherry-picked or imported wholesale. No foreign continuity or historical record was copied.

`customer-accepted-assembly-bindings-20261008.json` records the full raw Git-byte SHA-256, Git blob,
accepted origin and exact comparison for each of the eight customer files, plus three preservation anchors.
All eleven comparisons match. This is metadata equality, not executed qualification.

| Path | Origin | Final Git blob |
| --- | --- | --- |
| `client/src/research/product-subscriptions/ProductSubscriptionCreate.tsx` | C `736bb2a`, replaced | `b4046a7fa1ec200ff4c432c0b9a17801e3d90d99` |
| `client/src/research/product-subscriptions/ProductSubscriptionCreate.test.tsx` | C `736bb2a`, replaced | `d094babf3592395f9a3e26f299cf24789a837dbd` |
| `client/src/research/pages/member/ProductPage.tsx` | C `736bb2a`, replaced | `d50b467159739148ae2ecbe90689c6d8df6f6d92` |
| `client/src/research/pages/member/ProductPage.subscription.test.tsx` | C `736bb2a`, replaced | `ce94ff421800fa3b84437038d8c7e390ceeb0401` |
| `client/src/research/products-diagnostics/MemberCatalogExperience.tsx` | B `8f080a0`, preserved | `c54db8933eb9654f55b98f163c68e5ae1d51cc3a` |
| `client/src/research/products-diagnostics/MemberCatalogExperience.test.tsx` | B `8f080a0`, preserved | `5a9e65bed522d2687b28b5c624ea01379d1048f9` |
| `client/src/research/products-diagnostics/MemberProductDetailExperience.tsx` | B `8f080a0`, preserved | `f1db3fa817be2e89a9bb9273301204333f274fae` |
| `client/src/research/products-diagnostics/MemberProductDetailExperience.test.tsx` | B `8f080a0`, preserved | `78f23534fddf90a66cf2589ca323a69105e260ed` |

Preserved, never assembly edits:

- `client/src/research/adapters/product-subscription-create.test.ts`: integrator blob
  `e19dd0a0003289f84a5eb2a4c805d031c2b63035`, retaining 400/403 parameterization. The C branch's older
  `27c216f5f41fa0ea7ecae0697ab3fa27de8c0997` is NOT copied.
- `client/src/research/pages/member/product-subscribe.test.tsx`: blob
  `f389110e89d5465f401ce919354864484efb7f8d`, including title assertions 117/183 and no substitution at 184.
- `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`: blob
  `241fc344445a12dbf7861232248393a742105526`; no approval or recut.
- The other-source inventory is unchanged: 3,278 rows, 347,963 bytes, SHA-256
  `d6a1e886f7f928c649e391b00dd472a5583640ad7e7d73796300c2ea2c738200`. Definition: Git's ordered full
  `ls-tree -r` rows, excluding only four C paths and `docs/` / `.xenios/`, UTF-8 without BOM, LF plus final LF.

No adapter, dependency, API, server, SQL, package, global style or protected composition change was needed
or authorized. One existing helper inspected the four-file diff and inventory method read-only; it was not
an acceptance reviewer. The original reviewer alone owns the composed checkpoint disposition.

## What the assembly contains, not live behavior

The accepted subscription component retains an in-memory attempt owner through inner loading/hiding;
ignores stale refusals; includes capability in form identity; converts rejected promises to uncertainty;
and masks old product/account details in the same render. ProductPage still passes a null offer and
`commerceEnabled={false}`. No form, recurring offer, payment or activation is enabled by assembly.
The retained catalog files supply the reviewed selection/facet/fact behavior and restored unavailable title.
No new customer-visible copy was authored in this assembly.

## Carried Doc57 findings and required correction

The authoritative records correction remains at `937c913`:
`docs/health-launch/evidence/product-subscription-intent-20261005/doc57-records-20261008.md` and its proof JSON.
Those files were read through Git, not imported over another owner's records. All twelve dispositions carry:

| Finding | Continuing disposition |
| --- | --- |
| WC-P2-1 | Records corrected by outgoing owner. In-memory duplicate protection is lost on actual auth/route unmount, full reload and across tabs. New-session sign-in, token refresh that re-verifies, forced user update, sign-out and route exit can unmount through RequireMember. Retained inner slug/loading/retry state is not durable idempotency. Backend ticket 1 must land before any offer. |
| WC-P3-1 | OPEN before offer: existing canonical route/error/adapter owners must distinguish proven pre-write refusal from unknown outcomes. Thrown 401/403 and unknown relay envelopes can release the guard incorrectly. Backend ticket 2 remains unimplemented. |
| WC-P3-2 | OPEN fail-closed limit: `commerce_disabled` becomes 503/unavailable and an uncertain lock. Historical PS-R5 adapter closure does not prove this path. |
| WC-P3-3 | OPEN latent preserved-hide busy presentation; lock remains. No current trigger or fix claimed. |
| WC-P3-4 | OPEN owner decision: retained lock is not bound to account/product and may block a different one while mounted. |
| WC-P3-5 | OPEN test limits: passive/layout-effect discrimination, page owner retention, broader masking, unauthorized-refusal retry and negative charged/paid wording remain unpinned. |
| WC-P3-6 | OPEN before offer: two-decimal formatting cannot establish correct currency minor-unit policy. |
| WC-P3-7 | Required records correction preserved: exact affected 17/36 sets, overlap 4 / union 49, changed test blobs and foreign test are named. No pass transfers. |
| WC-P3-8 | Catalog title dependency resolved by original Doc60 source inspection; exact accepted B/C blobs now assembled. This does not resolve other catalog holds. |
| WC-P3-9 | Backend ticket anchors carried: `subscriptions.ts` create/new ID/save at 353/391/409 lacks durable command replay; production refuses before save at 380-384 while test-only persistence remains disabled outside test wiring. No historical paid/subscribed status is fabricated. |
| WC-P3-10 | Corrected current pointer and explicit transfer carried. Legacy Website 2 reservation remains disclosed and unchanged; only exact transferred paths claimed. |
| WC-P3-11 | October 5 browser text/fixtures/screenshots with old intro and `yet` remain historical, not evidence for this tree. |

Backend ticket 1 belongs to the existing canonical subscription service/persistence owner: durable create
idempotency binding member, exact variant/price version, quantity/frequency, command key and authoritative
result, including lost response, conflict, concurrency and remounts. Ticket 2 belongs to canonical
commerce route/error/adapter owners (`routes.ts` 693-706/971-984, `server/index.ts` 1472-1485,
`lib/api.ts` 100-140 at C source). These are carry-forward assignments, not authority to edit their files here.

## Carried catalog findings and copy decision owner

Doc60 resolves Doc56 D-1 and accepts D-9 records by source inspection. D-2 is narrowed and HELD, not fixed.
Doc56 D-3/D-4/D-5/D-6/D-7/D-8/D-10 remain open: canonical-summary divergence, program link-name collisions,
denial/not-found semantics, catalog/variant status pairing, clear-filters focus loss, test/markup limitations,
and out-of-scope zero-price/malformed-currency behavior. Their exact ledger remains unchanged in
`docs/health-launch/catalog-detail-presentation-20261008/DOC56_CORRECTION_PACKET_20261008.md`.

| Doc60 finding | Continuing disposition |
| --- | --- |
| D56C-1 | OPEN with D-5: title/body contradiction, including definitive not-found and denials. No copy change authorized by assembly. |
| D56C-2 | OPEN technical follow-up for the existing ProductPage and canonical API owners: map `product_not_found` to an actual not-found state rather than unavailable. This integrator holds ProductPage only for immutable assembly, not that routing repair. |
| D56C-3 | Copy/policy decision owner explicitly **Samuel**. Product-education implementation belongs to its existing content owner after a decision. Strings below remain held, not approved by this record. |
| D56C-4 | Historical working-file hash provenance remains NOT PROVEN by the reviewer. Do not repair or relabel old receipts. Current acceptance bindings use reproducible raw Git blobs only. |
| D56C-5 | Prior readability observation retained; new records separate identifiers from words. No historical record rewrite. |
| D56C-6 | Git proves lease-claim commit order, not physical edit timing. This packet states that narrower fact. |

Samuel's held-copy decision includes `Pricing shown after clinical review`, `Supplier confirmation pending`,
`Awaiting documentation`, `Price on request`, clinical pathway wording and the unavailable title/body pair.
It also includes the carried `client/src/research/content/productEducation.ts` strings, unchanged:

- Line 279: `Available only through independent review by a U.S.-licensed clinician and current pharmacy serviceability. A listing does not guarantee suitability, a prescription, or fulfillment.`
- Line 295: `Availability depends on the exact approved classification, product record, documentation, pricing rule, and operational status.`

This naming supplies decision provenance, not a decision, new policy or implementation permission.

## Every Doc35 release hold remains

- Founder: exact approval of three protected old-to-new hash pairs; GATE-01 / Access Hub disposition;
  intended subscription SKU/plan, quantity policy (effective cap 50 enforced) and product plan. Manifest recut
  remains a separate authorized protection-owner action, not an assembly action.
- Subscription: six buying gaps OPEN: durable create idempotency, referral lineage, decisive current-price
  validation, canonical eligible-offer projection, durable production activation/currentness and independent
  payment finality. PS-R2/PS-R3 and the test-only persistence seam remain. PS-R4 placeholder-card and
  PS-R5 through PS-R7 decisions/limits are not closed by assembly.
- MC-01: persistent-cart predecessor chain, reviewed candidate, non-image Product Control re-approval and
  separate launch transition; cart-history preservation/adoption, including four-history-table requirements,
  where history exists. SQL remains source-only/unregistered here; historical unapplied records are not a new live observation.
- D/E: delivered-byte/hash integrity, canonical readers, metadata ingestion/review writer, descriptor SQL
  execution and runtime qualification OPEN; fallback-first only.
- Finance: excluded from this candidate; F1, refund/dispute, ADP-G2 through G4, LENS adoption OPEN;
  ADP-G1 PARTIAL. No payment/provider/commission/payout/notification authority enabled.
- Qualification: full aggregate resource-deferred; red protection gate, inherited static/composition seams,
  founder hash approval and GATE-01 remain; exact 768, native 200%/400%, CLS and native forced-colors unproved.

Doc35 historical source is `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree
`787432948d9464880df1dcfc5dff58eec7d889aa`, evidence `fc53751ff7a988d029d5dabbd9f24f1431b62d19`,
handoff `38c723964358c18b8c5090f2f9a0aa92f74601b0`, corrected review
`fffa33a6b3407b407b2b43d3c5a5c7054887f590`. Its 17-file / 401 and 36-file / 626 passes overlap in four
files, union 49; counts are not additive. They do not qualify this tree. PS-R1 remains an exact historical
closure; PS-R5 is mocked-fetch real-Response 400/403 adapter proof, not live HTTP. Summary logs lack per-case results.
Earlier split/failed receipts and Finance ENOSPC at a different source remain separate.

Exact lists are retained in `docs/health-launch/catalog-detail-presentation-20261008/DOC56_AFFECTED_TEST_SETS_20261008.md`.
All historical receipts, snapshots, logs, source bindings and prior handoffs are preserved byte-for-byte in Git.
Historical browser widths 1440/1024/767/430/390/320, CDP forced-colors, one home-link focus observation,
synthetic GET/HEAD preview with refused writes and denied outbound traffic are not native zoom/full accessibility,
real Auth/partner/payment or live data proof. No image onError/delivered-byte trace existed. TTY shutdown exit 1,
missing STOPPED/result receipt, absent PIDs and unchanged 349-file snapshot remain separate facts.
47/47 Node samples were sampled, not continuous; the approximately 304 MiB typecheck sample was not retained.
MC01-R1 admin notice and all inherited seam findings remain. See the unchanged Doc56 packet for full attribution.

## Execution and next boundary

Only source/record/Git reads, immutable-byte hashing, `apply_patch` and local commits occurred. No import,
syntax checker, compiler, typecheck, test, build, lint/gate, resource probe, supervisor/preparation/G0,
SQL/verifier/database, browser/server, install, live request, notification, payment or deployment ran.
No push, merge, protected-hash approval, manifest recut, schedule change or hosted configuration change occurred.
Local commits used per-command `-c core.hooksPath=NUL` to prevent prohibited hook execution; no gate was waived.
Actual model/effort is not exposed and no setting switch is claimed. Current hosted state is not reverified.

Future qualification requires fresh exact-tree authority: all four lane tests, both historical sets,
detail/Products/ProductPage route tests, typecheck, no-em-dash, build and new browser/keyboard/focus/screen-reader
evidence at the specified widths and native zoom. Existing supervisor/window/prerequisite holds remain.
No source acceptance substitutes for Samuel's reserved copy, product, offer, quantity or currency decisions.

Coordinator collects the ordinary final local source/tree/records handoff. No outbound message is sent from this
turn. Queue this composed identity/compatibility and corrected-records checkpoint to the SAME original Claude
after its active Doc59 work; do not repeat the accepted full source audits, interrupt or create another reviewer.
Queued status is not acknowledged delivery. No additional assembly edits are authorized at this checkpoint.
