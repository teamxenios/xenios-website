# Resource Hub and account/partner UI — staged installation packet

**Installation stage only. Activation is blocked pending the listed corrections and managed-service proof.** This packet does not claim a usable populated Hub or full platform completion.

## Source, target and authority

- Pinned application: `3814c687ef9293f84f939c372fdbc01b278a9193`; tree `62915f1f23e16610c74622723391e9692fe7c84e`. Deploy this pushed commit, never evidence/branch HEAD.
- Expected live/application rollback: `ff3c496245739233b71e46f9e5d6e26af9d57017`; last observed deploy `dep-dafcm567bikc7382rhng`.
- Render service `srv-d8s9vej7uimc7384dfcg`, workspace `tea-d8nhh6a8qa3s73f4ocj0`; retain branch `release/early-access-code-session-checkout` and auto-deploy off.
- Supabase project `yvzeduaxbwgcwllhywff`. A executes; B independently verifies. No other release writer may operate concurrently.
- Standing founder directive verified at source SHA-256 `3b525ea83b308e30c64d55481b3210ae845a4074e95230813b3bbcf9b1a36b63`; exact original is preserved privately. Its qualified staged-release authority covers the in-scope corrective successor after its own review/gates. [Authority record](standing-conditional-authorization-20260908.json).

The original c350 scan failed on three personal-name authorization attributions. Those fields now identify the founder role, preserving the authorization; the original approval artifact and failed receipt remain retained. The actual corrected range has 224 paths. [Strict scan](strict-scan-v3-3814c68.json): 47,459 added lines, 102 raw/102 reviewed/zero unresolved secrets, zero PII, exit 0, no skips. The approved private V3 file is unchanged. Its limited coverage remains explicit.

[Source equivalence](source-equivalence-3814c68.json) establishes that all c350-to-successor changes are 50 documentation/continuity paths. Application code, SQL, dependencies, build inputs and runtime-read SOR are unchanged. Original full-suite/build/browser dates and limitations remain unchanged; three affected record-backed files were rerun with 62 passed/1 skipped, exit 0. B's new ownership attestation covers 224 paths, 200 unowned, 24 covered, zero wrong-lane/conflicts. Final manifest/DAG/production-record and diff checks must pass before execution.

## Exact database files

| File under `supabase/candidates/` | LF SHA-256 |
| --- | --- |
| `20260906120000_research_resource_library.sql` | `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722` |
| `20260906120000_research_resource_library.precheck.sql` | `742bce5729a0b4c2db848fbf32658efe0b286c5b910730fd6bfc9182c1ea6fab` |
| `20260906120000_research_resource_library.postcheck.sql` | `7c7ef33b7091cc1946077070ca6587491b299c5101ca05b4b70dcf95ff379550` |
| `20260906120000_research_resource_library.rollback.md` | `1c8261fbb1723c7ef0d47fdd6a8f65d150ff7931ee8d3b2f896b134a8dea4153` |

The managed migration copy has identical bytes and is not a second migration. Apply once only, through the authenticated Supabase migration tool in its stop-on-error transaction, preserving its actual migration-history receipt. Do not replay account/partner versions `20260907143147` or `20260907143204`, apply unrelated migrations, repair history, seed users/resources or alter other policies.

## Execution sequence and stop conditions

1. Reverify the pushed candidate/tree, all four hashes, authenticated project/service/workspace, live ff3, no competing production writer or active/queued deploy, unchanged service branch and auto-deploy off. Preserve the exact reviewed manifest and separate evidence head.
2. Inspect only the relevant configuration. For installation explicitly set the service-level `RESEARCH_RESOURCE_HUB_ENABLED=false` and verify that stored value before any candidate deployment. Keep membership billing absent/false; do not activate commerce or other workstreams. Existing Supabase credentials must stay secret. Stored flag state is not proof of an already-running process's state. Verify actual Render start is `npm run start` and the pinned package start sets `NODE_ENV=production`; nonproduction memory preview is not a valid flag test. There are zero workspace environment groups in the fresh read. Verify the new production process and disabled-route behavior after deployment. Existing startup/outbox/schedulers are unchanged from ff3 and may perform ordinary due work; do not trigger them for smoke or claim a zero-effect restart.
3. Capture the 30 public/unauthenticated GET endpoints with the existing `scripts/release/critical-endpoint-diff.mjs` immediately before deploy; it retains shapes/status/safe headers, not response bodies. Include all three Care routes. No Hub PDF GET/HEAD belongs in this read-only set.
4. Run the exact fresh first-install read-only precheck as the intended executor, with unfiltered visibility and stop-on-error. The 14:11:36 UTC receipt passed on PostgreSQL 17.6, but must be repeated immediately before apply. Any existing Hub object/bucket, incompatible role/Storage policy, identity/hash/baseline drift or failed assertion is a stop.
5. Apply only the exact e55 migration. Preserve the tool response and actual generated history version. On timeout or uncertainty, stop and query history/objects before any retry; never infer failure or success.
6. Run the exact postcheck before inserting content or continuing to deployment. Require the expected schema/constraints/indexes/functions/triggers, FORCE RLS and service-only permissions, private bucket, and zero initial rows/objects. A failure stops further work; preserve all data and investigate without unapproved recovery changes.
7. Deploy the pinned application using the supported Render deploy API with `commitId=3814c687ef9293f84f939c372fdbc01b278a9193` and `clearCache=do_not_clear`. The generic trigger tool has no commit parameter and must not be used for this step. Record returned deploy ID, status and commit; reread serving identity after the deploy is live.
8. Run the same 30 public/read-only endpoint capture and existing comparison requiring **30 SAME, zero intentional changes, zero regressions and zero human-review-required differences**, with an explicit empty expectations list. No historical comparison allowance may be used. Verify public health and unauthenticated account/admin boundaries. No real account/partner approval, notification job, email, payment, shipment, resource upload/publication or download audit is part of installation smoke.
9. Observe for **five full minutes after live identity and initial smoke pass**. Check health at least every 30 seconds, retain serving identity, and inspect error logs for the full interval. Do not shorten the window to meet a calendar target. Any material regression or health/deploy failure triggers the reviewed compatible recovery decision.
10. Reconcile observed application/config/database state, exact receipts and the resulting workflow status. Installation success must be labeled **installed/deployed, Hub disabled, live resource journey unverified**. Continue activation work below.

## Recovery

Use the exact reviewed rollback document. Preserve all resources, versions, Storage objects, deliveries, customer/approval/partner/agreement/audit/billing/outbox history. Never drop the additive schema or private bucket.

Before any application rollback, explicitly set `RESEARCH_RESOURCE_HUB_ENABLED=false` and `RESEARCH_FOUNDING_ACTIVATION_ENABLED=false`, and keep `RESEARCH_MEMBERSHIP_BILLING_ENABLED` absent/false. Verify those values, redeploy exact compatible ff3, verify serving identity, repeat smoke and the same five-minute observation. The ff3 application does not reference the additive Hub objects. Additional database recovery/history repair remains outside routine rollback authority.

## Activation work that must follow

B confirmed two blockers for admin activation: concurrent upload-key recovery must repeat the SHA/filename identity check; review transitions require expected-state conditional updates. Correct and independently qualify those changes in a subsequent pinned source. Keep the current migration unchanged unless a reviewed correction actually requires schema changes.

Then establish authorized existing role sessions and an appropriate managed Auth/PostgREST/Storage qualification environment. Prove persistent private upload/read, review/publish/withdraw, entitled delivery, denials, logout/account switching and resulting audit records against the actual final source. Ordinary local previews use memory adapters and cannot establish these managed-service behaviors.

Prepare exact reviewed resource bytes/hash/version, metadata, usage policy, authorized audience, test identities, expected writes and non-destructive recovery before enabling/publishing. Private privacy-review PDFs/registers are not publication candidates. Audiences exclude suspended/terminated partners but permit pending/quality-review partners; `all_partners` is broad and is not a single-account selector. Any new real-user grant or communication requires specific approval.

Record download GET/implicit HEAD delivery-audit writes. An audit row does not prove browser receipt; verify downloaded bytes independently. The separate activation plan must bind these effects and the reviewed content; an empty disabled library is not activation.

Affiliate dashboard share/link/QR card, PNG and mobile corrections remain a controlled follow-on build. Ordering/purchasing activation still requires verified commercial/provider/fulfillment prerequisites. Report implemented, deployed, enabled and live-journey-verified separately for each workflow.
