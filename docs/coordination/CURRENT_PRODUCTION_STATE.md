# Current production state

This is the human companion to
`docs/coordination/CURRENT_PRODUCTION_STATE.json`. The JSON record is the
machine-readable release-manager snapshot.

## Trusted release baseline

| Field | Value |
|---|---|
| Audited baseline Git SHA | `4a45b89856df3104de498c7124d27b608e52b34d` |
| Render deployment | `dep-d9l8s8m7bikc73f9bj0g` |
| Render state | `LIVE` |
| Public origin | `https://xeniostechnology.com` |
| Evidence captured | `2026-07-30T01:05:00Z` |

The checked-in SHA is an immutable audited baseline and policy reference. It
does not attempt to predict the SHA of a future merge. Pre-merge validation
binds the trusted external base and reviewed candidate to their exact diff.
Post-deploy validation receives the observed main SHA, Render Git SHA, Render
deployment id, and accepted candidate SHA externally; it requires exact
identity, commit ancestry, the reviewed merge tree, byte-identical
candidate-scoped files, health 200, and passing route/runtime evidence. A
non-descendant or mismatched observed deployment fails without requiring
another checked-in snapshot commit. The post-deploy CLI receives these facts
only through `XENIOS_OBSERVED_*`, `XENIOS_ACCEPTED_CANDIDATE_SHA`, and
`XENIOS_EXPECTED_OBSERVED_TREE_SHA`; partial input fails closed.

Health is 200. The signed-out Research account gate is 200/no-store, while
member, activation, capability, and activation-readiness endpoints reject
signed-out requests with 401. Care remains disabled and absent from ordinary
Research navigation.

PR #143 is merged and live at the identity above. Exact-main Actions run
`30499992101` completed successfully. The repository is private. Authenticated
Render evidence binds the live deployment to the same SHA, and the bounded log
view contained no explicit error/fatal/panic/failed or credential-assignment
matches. Raw log lines and secret values were not reported.

Samuel's 2026-07-30 Final Claude + Codex Full Website Completion Master
Directive confirms Codex/Website 2 as sole release manager, merger, migration
operator, environment operator, and deployer. Claude Code Fable 5 is the
independent continuous product/reliability reviewer and does not hold a
competing merge or provider lease. PR #108 comment `5129153960` records the
exact current-main bounded lease; the final directive expands the program
mission but does not erase exact path ownership, review, migration preflight,
or post-action verification requirements.

## Account continuity

Read-only production evidence shows two Research members, both bound to an
existing Supabase Auth user, with zero orphaned auth bindings. One member is
active and one is pending activation. The deployed ancestry includes the
session-resume merge `07bd51c09cca71c1cd4dfe980f9d95e4ba6a7d44`
and atomic activation-verification merge
`7f74308ab705ec7850b7a65dc1e6f53ac7683ada`.

This is continuity evidence, not an invented end-to-end browser result. No
account, role, session, or record was fabricated.

## Activation bridge and payment verification

The founding-membership bridge has one settings row and is enabled for new and
existing activation obligations. Production contains one approved/enabled
manual payment method, one verified obligation, one upcoming obligation, one
ledger entry, one receipt, one membership period, and one bridge audit event.

`research_fm_activation_verify_commit` exists once, is executable by
`service_role`, and is not executable by `anon` or `authenticated`. Replacement
provider status is `not_started`. Therefore:

- the existing manual founding-membership bridge has real production evidence;
- no general product-checkout payment provider is claimed ready;
- payment credentials or secret values were not inspected or recorded.

## Capability route ownership

PR #86 is deployed and Website 6 post-deploy accepted it. Production now has
one canonical `GET`/`HEAD /api/research/capabilities` owner in
`server/research/capabilities.ts`, mounted through `registerMemberPlatformApi`.
Private no-store/no-cache/no-referrer/noindex headers are applied before the
downstream member and administrator authentication boundaries. `POST` remains
intercepted and fail-closed. The `/admin/research` document receives the same
private document posture.

## Migration ledger reconciliation

Production migration history ends at:

- `20260727160000 research_inventory_reservation_commands`.

The five later managed files are present in Git and represented as pending
nodes in the formal DAG:

- `20260727200000 research_persistent_cart`;
- `20260728010000 research_fulfillment_supplier_operations`;
- `20260728020000 research_affiliate_professional_operations`;
- `20260729000000 research_pricing_lineage`;
- `20260729100000 research_rls_retro_hardening`.

All five are absent from the authenticated production ledger. This
control-plane correction applies no migration and authorizes none.

## Safe production counts

| Fact | Count/state |
|---|---:|
| Research members | 2 |
| Research applications | 2 |
| Notification outbox | 42 |
| Required inputs | 0 |
| Domain launch controls | 0 |
| Product Control rows | 0 |
| Product Control Storage objects | 0 |
| Care capability | disabled |

Product Control remains 12/12 forced RLS, zero browser table grants, 33 service
table privileges, five command-table SELECT grants, zero command-table DML, and
11 service-only RPC grants.

## Founder-commercial source pins

- Founder addendum SHA-256:
  `a19be2e51672991b94eaccf1cbb0d3896afda67cc36c09e1d45df9b30bb9a7ce`.
- Final commercial workbook SHA-256:
  `5bc5a624b88cd7c2d77d81633370d6c31f26ca223d6c919deca2a26011b9e1d1`.
- Wholesale-source workbook SHA-256:
  `2b47a6b6fe6d0fac60cd51399c6c8823ab12e926da113211b96cd6d3c7d82bd5`.
- Missing-inputs workaround addendum SHA-256:
  `1850fa49256e8722717f02c4ed4344511fe354f8f6fccde648e69d44066d05ce`.
- Activation-workaround workbook SHA-256:
  `345787a2a00ceab988c7222f5d73f5dcaa1928fce643757aad387c8e4cd4aaeb`.
- Final full-website master directive SHA-256:
  `aeef43961c57f5740600aca45c9a5a0b0801f033d68643869bcbf6cedcf01373`.
- Codex release-manager copy SHA-256:
  `27c9b330d19c1114dfe2d10d23be027821cb26abdfa4aa1486903cede4761886`.
- Claude Fable 5 review copy SHA-256:
  `0ad9f242308773ede5307ba027ae308e6993d97978c60556e269a89fbc2c0461`.

The source contains 15 peptide and 20 NutriDyn rows. Every displayed target
price is formula-driven as `ROUND(cost * 2.5, 2)`. Eleven peptide presentation
rows retain explicit founder-override mismatch evidence. The final workbook's
Decision Register renumbers D002-D018 differently from the signed addendum and
labels several now-locked commercial inputs as Recommended; the signed addendum
is therefore the controlling decision map, and the source workbook remains
immutable provenance evidence.

The later workaround workbook preserves those 35 price rows and adds founder
attestations for a 1,200-unit opening balance per exact mapped Renew360 SKU,
`SUPPLIER_UNMETERED` brand availability, native Superpower D2C with a restricted
manual partner handoff, the 48 contiguous-state target with Alaska and Hawaii
excluded, and a $1,800-per-vial restricted Quantum EV Care service. Its
Decision Register still does not match the signed founder addendum's D002-D018
numbering, so the signed Markdown addenda remain the controlling decision map
and the workbook remains immutable implementation provenance.

These attestations convert missing documents and feeds into explicit
operational states and evidence tasks. They authorize bounded software,
template, migration-source, and test construction under separately reviewed
path leases. They do not by themselves identify a live Product Control row,
apply a migration, seed production data, enable a payment rail, transmit a
partner order, assign a provider, schedule or administer a clinical service, or
activate Care. QNT-001 remains a pricing decision identifier rather than a
product SKU.

The final master directive supersedes conflicting permanent-global-disable,
planning-only, and sandbox-only instructions. It directs serial application of
the five reviewed migrations once exact current production, checksum,
dependency, RLS/grant, count, rollback, and post-apply gates are green. Until
those gates are independently accepted, the authenticated production ledger
remains authoritative and all five nodes remain pending.

## Release queue

- PR #80 exact head `f646708d45d4a6e4e7acf4e2653e44746baef184`
  remains prohibited.
- PR #85 predecessor
  `12759c2567246ee83ed71aad9ffa4b517d31e8aa` remains prohibited.
- PR #85 replacement
  `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4` is prohibited after three
  Website 6 HIGH findings. Its predecessor `12759c2567246ee83ed71aad9ffa4b517d31e8aa`
  remains prohibited as well.
- PR #85 second replacement
  `0472905dff10c45239b7f95834e1086c3b3c5f59` is prohibited after two
  Website 6 HIGH findings covering exact active display-blocking input
  completeness and the shared five-minute signed-media TTL.
- PR #85 exact source `dc11623d27fa59cb51b6cfe653f143633c7ae9ed`
  is Website 6 accepted with zero blocker/high. Its 12 source blobs are frozen;
  a separate current-main integration candidate is required.
- PR #86 head `225455615eda0c420996929379a5a1f9d535b4e8`
  is prohibited because full production route order shadows the capability
  handler before its private member boundary. A bounded replacement is in
  progress in the separate shared-hotfix worktree.
- PR #86 replacement `4f71648aa5684ebec70f14b7e09268331c522969`
  is merged and deployed as `d494150668de2ede8a61fd0d28bc9ff9a75def26`
  on Render `dep-d9jcfkuk1jcs73fi5r1g`. Website 6 post-deploy QA accepted the
  live route/header/browser/log posture with no blocker/high.
- PR #87 source `0276112499ed029e70f09c2cd53bf9191d851601`
  is historical merged release-control lineage. The current snapshot correction
  is proceeding from exact main `4a45b89856df3104de498c7124d27b608e52b34d`.
- PR #144 exact head `410e687898d6406a684023e8327dc5fb697b30d3`
  is frozen. Its seven pricing-model paths are outside the current
  control-plane lease and require founder-rule, ownership, provenance, and
  independent exact-SHA reconciliation.
- The next bounded source unit will address Samuel authority plus the raw-error,
  committed signing-fallback, and legacy admin-key findings only after an exact
  current-base path lease is merged.

Website 2 alone owns shared integration, migration ordering, merge, Render
deployment, rollback, and production smoke. No candidate merges or deploys
before Website 6 exact-SHA acceptance.
