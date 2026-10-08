# Doc56 bounded catalog correction: local source handoff

AUTHORED, NOT RUN, LOCAL ONLY, NOT PUSHED, NOT ACCEPTED. No release or customer-purchase readiness.

## Exact identity and ownership

| Identity | Exact value |
| --- | --- |
| Branch | `codex/accepted-source-integration-20261005` |
| Worktree | `C:/Users/sboad/.codex/worktrees/b22f/xenios-website` |
| Session / chat | `codex-accepted-source-integration-20261005` / `01a0e098-3b23-7233-9b07-877ace092650` |
| Existing task / lease | `ACCEPTED-SOURCE-INTEGRATION-20261005` / `d0897045-efd3-425b-a8b4-02385e855153` |
| Assignment | `DOC56-CATALOG-CORRECTION-20261008` r1, coordinator `acbba2cc5a759455bdb16be50cce2ea00dc5fbab` |
| Original review | `cb41382df985cc03a2833523a14e829ddd47eb47:docs/review/xenios-health-launch-review-20260930/56_CATALOG_DETAIL_PRESENTATION_e0a7d47_2026-10-08.md` |
| Review copy raw SHA-256 | `63f3d2364a7dddc937e0391f8770cb3b33cc669460eeee3270bb16a671c48cd6` |
| Reviewed B target / tree | `e0a7d4787071140a25a984edc4c0a49f0d7c22ab` / `340248360ac85f50f10ed5890624401616f792fd` |
| Original B records | `9737db71014d1073ec5ffe9a78b2a1c491220813` |
| Starting inventory records | `0dbfaf57fe51d70d9b9a7de8cc7136a7604b3d7f` |
| Reclaimed-lease commit / source parent | `9c597b2dbe66d7c9666f986fabbc535941c415bc` |
| Correction source | `8f080a08af06aa16e7aaf80add1a1b25e0cfae41` |
| Correction source tree | `7ff4d6a5059466e716d9b81f66a696cf69bc53d3` |

The complete original review was read before editing. Human authority remains the Workstream B directive
at `94485a6a0efc8f347ea8e652ffd4744228ae3595` plus the additive directive/provenance at
`1b165b15bfd6b575c25d66be7c9c15cce8ee94fa`, sections 5 and 8. Actual human messages were independently
verified previously: `01a11c6c-acdd-7753-a395-cb17f5e0b05f` and
`01a11cc4-c1a0-74a0-bec9-fd3cd033f86d`. No authority is inferred merely from a worker message.

At `2026-10-08T19:14:34Z`, the same owner reclaimed exactly these four source/test paths plus its report
root, own session, own handoff and own registry rows, after inspecting active leases. No conflicting active
source claim appeared. The unrelated active global-continuity lease was not changed. Foreign rows and
registry top-level fields are preserved; no stale-heartbeat takeover occurred.

| Leased path under `client/src/research/products-diagnostics/` | This correction |
| --- | --- |
| `MemberCatalogExperience.tsx` | Unchanged from reviewed B target |
| `MemberCatalogExperience.test.tsx` | Unchanged from reviewed B target |
| `MemberProductDetailExperience.tsx` | One title literal restored |
| `MemberProductDetailExperience.test.tsx` | Matching positive/negative title expectations reversed; body assertion retained |

Source commit changes exactly the two detail files (3 insertions / 3 deletions). The cumulative source
delta from accepted `756a906` still comprises the same four B files. No server, adapter, shared authority,
SQL, package, script, protection, route composition, media authority or Workstream C file changed.
Source raw Git-byte hashes and separate working-file hashes are in `doc56-source-bindings.json`.
The completed inventory records and original `source-bindings.json` are retained unchanged as historical evidence.

## Finding map: all findings retained once

These are author dispositions for narrow reviewer follow-up, not reviewer closure or self-acceptance.

| ID / severity | Disposition | Exact scope / remaining limit |
| --- | --- | --- |
| D-1 / P1 | CORRECTION AUTHORED, NOT RUN; reviewer verification pending | Restored `This product is not available.` in the owned detail component and expectations. Foreign `pages/member/product-subscribe.test.tsx` assertions at lines 117 and 183 remain unchanged. Their no-purchase/no-subscription and no-`Substituted Product` assertions remain intact, as do ProductPage slug/current-request safeguards. No no-substitution behavior changed. |
| D-2 / P2 | CLAIMS NARROWED; COPY/POLICY HELD BEFORE RELEASE QUALIFICATION | Withdraw blanket claims that all clinical/program/supplier copy avoids eventual-ordering implications. Remaining literal strings are listed below. No policy decision or copy rewrite is smuggled into this fix. |
| D-3 / P3 | OPEN, CARRIED | Client clinical catalog summary overrides the canonical nontransactional server summary; detail clinical-pathway wording presumes a path. Canonical `Research catalog pathway` alignment or approved copy remains required. |
| D-4 / P3 | OPEN, CLAIM NARROWED | Link accessible names include displayName, but all program adapter names can be `Research program`; global distinctness is not established. |
| D-5 / P3 | OPEN, CARRIED | Restoring the title does not repair body semantics for definitive `product_not_found` or inactive-membership denial. The body implies a failed load, with no retry/way back, and its uncertainty can conflict with the title. This requires an appropriately owned state/copy decision. |
| D-6 / P3 | OPEN, CARRIED | Live catalog status may be `Unavailable` beside variant `Available`; separate headings do not resolve the presentation conflict. |
| D-7 / P3 | OPEN, CARRIED | Clear filters removes its own focused button, leaving focus at the body; the sort-only route is new. No browser/focus correction is claimed. |
| D-8 / P3 | OPEN, CLAIMS LIMITED | Some fixtures would be rejected by the adapter and some tests do not discriminate. Two inherited test names say keyboard. Markup, wrapping classes and live-region attributes are not browser, native zoom, forced-colors, keyboard/focus or screen-reader evidence. |
| D-9 / P3 | RECORDS CORRECTED; reviewer verification pending | Four-path lease reclaimed before edits; literal copy table, exact affected 17/36 sets with overlap, full Doc35 holds, exact source lineage/path hashes and corrected claims now recorded. Existing receipts remain predecessor-only. |
| D-10 / P3 | OPEN, OUTSIDE FOUR-PATH SCOPE | Zero-price/Available pairing and malformed adapter-accepted currency that can throw remain unresolved. No adapter or price-authority scope expansion. |

## Literal before/after copy ledger

The first two columns preserve the historical `756a906` to `e0a7d47` delta. The final column identifies the
current correction precisely. Text in braces is a literal source expression, not an invented rendered value.
Tests add fixture/assertion strings, not additional customer-rendered copy.

| Surface | Before at `756a906` | After at `e0a7d47` | Current correction |
| --- | --- | --- | --- |
| Catalog clinical summary | `This clinical listing is available only through independent licensed review and current pharmacy fulfillment. A listing does not guarantee suitability or a prescription.` | `Clinical information requires independent licensed review. This listing does not confirm provider or pharmacy availability, clinical suitability, or a prescription.` | Unchanged; canonical divergence held |
| Catalog count | `{visible.length} {visible.length === 1 ? "product" : "products"}` | `{visible.length} of {catalog.items.length} {catalog.items.length === 1 ? "product" : "products"}` | Unchanged |
| Catalog View product link | Visible `View product`; no explicit aria-label | Visible text unchanged; aria-label `View product: ${product.displayName}` | Unchanged; not globally unique |
| Detail unavailable title | `This product is not available.` | `Product information is unavailable.` | Restored to `This product is not available.` |
| Detail unavailable body | `Only an exact published and public Product Control record can appear here.` | `Approved product information could not be loaded. This does not confirm the product's availability.` | Unchanged; denial/not-found semantics held |
| Detail status heading | No heading above existing badge | `Catalog status` | Unchanged |
| Detail missing variant body | `An exact approved Product Control variant and SKU are required.` | `Approved variant information is not available for this listing.` | Unchanged; inherited supplier panel still appears |
| Detail selection announcement | No selected-variant announcement | `Selected variant: {selected.label}` | Unchanged; markup only |
| Detail variant facts | No displayed strength/form/size/presentation facts | `Strength`, `Form`, `Size`, `Presentation`; supplied values or `Not provided` | Unchanged |
| Detail availability label | `Availability` | `Variant availability` | Unchanged; status pairing held |
| Detail future_clinical paragraph | `Ordering appears only after current product, price, documentation, and availability checks pass.` | `This is clinical pathway information, not an offer of treatment or medication. Provider and pharmacy availability require separate confirmation.` | Unchanged; copy held |
| Detail non_product_program paragraph | `Ordering appears only after current product, price, documentation, and availability checks pass.` | `This program listing is informational. It does not offer enrollment or purchasing.` | Unchanged; does not remove other price copy |
| Detail other-lane paragraph | `Ordering appears only after current product, price, documentation, and availability checks pass.` | `Catalog and variant availability are not purchase approval. Ordering requires current product, price, documentation, and availability checks.` | Unchanged |
| Detail related-product links | Visible `View product`; no explicit aria-label | Visible text unchanged; aria-label `View product: ${related.displayName}` | Unchanged |

Remaining inherited literal copy is explicitly HELD, not newly approved:

| Copy | Current location / policy limit |
| --- | --- |
| `Pricing shown after clinical review` | Catalog price presentation line 87; detail lines 26 and 225. Catalog test line 376 and detail test line 323 pin it. This is not evidence of a clinical path, eventual price or treatment availability. |
| `Supplier confirmation pending` / `Awaiting documentation` | Shared `ResearchPendingPanel` supplier_pending presentation, selected by detail line 221 even on lanes with no variants. Shared kit is outside this lease. |
| `Price on request` | Program catalog cards line 90; detail price helper line 29. No new quote/price policy authorized. |

Packet claims (6)/(7) identified by Doc56 are narrowed: a changed informational paragraph does not establish
that every rendered nontransactional surface is free of eventual-ordering implications. The old README's
`Clinical copy no longer presumes provider/pharmacy availability.`, `Unavailable information no longer asserts
unavailable merchandise.`, and `Program/clinical copy does not promise eventual purchasing.` are superseded
by the exact ledger and held strings above. `distinct accessible names` is also narrowed to product-labelled
names with collisions possible. This does not change price eligibility, product availability or clinical policy.

## Affected qualification and evidence limits

`DOC56_AFFECTED_TEST_SETS_20261008.md` lists all 17 historical subscription and 36 affected integration paths,
the four-file overlap (49-file union), historical command envelope, Node/npm identity and results.
Those receipts bind only source `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree
`787432948d9464880df1dcfc5dff58eec7d889aa`, evidence `fc53751ff7a988d029d5dabbd9f24f1431b62d19`,
records `38c723964358c18b8c5090f2f9a0aa92f74601b0`. They do not qualify `e0a7d47` or this correction.
PS-R1/PS-R5 closures from corrected Doc35 `fffa33a6b3407b407b2b43d3c5a5c7054887f590` remain exact-predecessor
closures. PS-R5 proves adapter behavior using real Response objects behind mocked fetch for 400/403, not live HTTP.
Summary logs do not contain per-case lines. Earlier 377+23 split and 396/3-failed receipts remain separate.

This correction executed only read-only source/Git/record/hash inspection, local authoring and local commits.
One existing helper extracted command arrays and historical copy; it did not execute or accept source.
No tests, imports, syntax checks, compiler, typecheck, lint, build, no-em-dash, route/protection/release gate,
resource probe, G0/supervisor, browser/server, SQL/verifier, install or runtime-version probe ran.
No merge, push, branch switch, protected edit, schedule change or hosted/live action occurred.
Per-command `git -c core.hooksPath=NUL commit` prevented prohibited hook execution; no persistent setting
changed and no gate was passed or waived. Git's LF/CRLF notices are reflected by separately named raw Git-byte
and working-file hashes, not conflated byte identities.

## Complete Doc35 release holds and inherited evidence limitations

None is resolved by this correction. Source acceptance of `756a906` is not release qualification or acceptance
of any descendant. No historical count or finding is silently upgraded to current runtime evidence.

- Founder: exact approval of all three protected old-to-new hash pairs; GATE-01 / Access Hub disposition;
  intended subscription SKU/plan, quantity policy (effective cap 50 enforced) and product plan. Manifest recut
  remains a separate protection-owner action after exact approval, not permission conveyed here.
- Subscription: all six buying gaps OPEN: durable create idempotency; durable referral lineage; decisive
  current-price validation; canonical eligible-offer projection; durable production activation/currentness;
  independent payment finality. PS-R2/PS-R3 server holds remain; test-only persistence seam preserved.
- MC-01: persistent-cart predecessor chain, reviewed candidate, non-image Product Control re-approval,
  then separate launch transition. Cart-history preservation/adoption (including the four-history-table
  requirements) remains necessary where history exists. Source SQL candidates remain unregistered; no
  installation or application is performed or newly observed here. Historical unapplied status is not a live probe.
- D/E: delivered-byte/hash integrity, canonical readers, metadata ingestion/review writer, descriptor SQL
  execution and runtime qualification remain OPEN. Fallback-first only; source presentation is not image
  delivery, storage integrity or card/detail byte-hash proof.
- Finance: excluded from this integration candidate. F1, refund/dispute, ADP-G2 through G4 and LENS adoption
  OPEN; ADP-G1 PARTIAL. No provider, payment, commission, payout or notification authority enabled.
- Qualification: full aggregate remains resource-deferred; protection gate remains red pending founder
  hash approval and GATE-01; exact 768, native 200%/400% zoom, CLS and native forced-colors remain unproved;
  inherited static/composition-seam findings remain open. An inherited gate failure is still a release hold.

Doc35 retained evidence limits are also carried:

- Bounded historical preview used the production client on loopback with GET/HEAD synthetic reads,
  refused writes and outbound sockets denied. Measured widths were 1440, 1024, **767**, 430, 390 and 320.
  A requested 768 that measured 767 was not exact-768 qualification. CDP forced-colors was emulation,
  not native forced-colors or zoom. A home-link focus observation was not full keyboard/accessibility proof.
- Fallback text/square observations did not capture an onError event or delivered bytes. No real Auth,
  partner activation, subscription/purchase/payment or production-data behavior was established.
- Preview shutdown had TTY exit 1, no STOPPED event and no result receipt. Separately, PIDs were absent
  and all 349 snapshot files rehashed unchanged. Neither a clean shutdown nor a source failure is inferred.
- Node provenance covered 47/47 sampled processes under Node 20.19.0, not continuous worker observation.
- The approximately 304 MiB typecheck-memory claim lacks a retained sample. The retained aggregate
  deferral samples are 805 and 1,452 MiB; no new resource probe was run.
- Historical Finance ENOSPC run at `dfd8b9b` is separate: receipt at `b13c29e`,
  `server/research/assisted-order/finance-sprint-20261003/evidence/runs/full-20261005-01/receipt.json`,
  SHA-256 `bc5d395c511a0de9171f2bf243de71869e48b908eea85eb5ed3682d33d09eb36`, exit 1;
  files 16 failed / 1,007 passed / 6 skipped; tests 2 failed / 19,078 passed / 85 skipped.
  It is not an aggregate result for `756a906`, `e0a7d47` or this correction.
- Admin unchanged applies to the Core customer-style boundary only. MC-01 deliberately changes Product
  Admin media notice copy; MC01-R1's overstatement persists until its SQL chain is applied and qualified.
- Reviewer-recommended later qualification remains only a recommendation: changed component tests,
  exact 17/36 sets, Products/ProductPage route tests, typecheck, no-em-dash gate, build, then authorized
  browser/keyboard/focus/screen-reader checks at 320/375/767/exact768, native 200%/400%, forced colors.
  Copy decisions and every hold above remain prerequisites. Fresh scoped execution authority is required.

## Preserved transfer and next action

Workstream C's transfer at `20a23057f99529241ef1f593175670e13ab86f67` is unchanged. The four transferred
paths (ProductSubscriptionCreate component/test and ProductPage component/subscription test) remain owned
by session `codex-product-subscription-intent-20261005`, chat `01a10d12-0764-7222-8b5a-5029508020ad`,
lease `d9ff89ea-06a4-4d35-b62b-5db6bac37920`. The separate foreign `product-subscribe.test.tsx` was read,
not edited. No foreign branch was merged or copied into this source.

Return this exact source/tree and records successor to the existing coordinator through the human-authorized
handoff loop. Original Claude remains the sole acceptance reviewer; do not interrupt its C/Doc57 and
verifier/records queue or create another reviewer. Ask it only for a bounded successor review when queued.
The local records commit containing this packet and the exact-SHA handoff is identified by the final dispatch;
the packet does not attempt to self-embed its own commit hash. Push and execution remain held.
