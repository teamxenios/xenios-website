# Homepage and Early Access public-site increment

This release prepares the reviewed homepage, staged guest phone/dock/entry improvements, search corrections, read-only request timelines and exact Care sign-in continuation. Current Early Access remains a request-for-review experience; Infinity remains in development and Tensa services are described as planned. The two founder-approved policy and founding-group labels remain.

The candidate starts from all-green 096b0c01364c77697f9dc62db4e086b32ba0d1fe (run44236068367,19,305 tests passed,83 skipped), composes #482 source5cb0d3b9, #483 sourceaacf9e14, #484 sourcefe86b431 and the reviewed b922 metadata/recovery-fixture delta. Exact final source, hosted gates and staging receipts are recorded after qualification; this document does not claim them in advance.

## Deliberate release scope

The new #481 customer-notice SQL/sender/test feature is NOT in this branch. Its intermittent concurrent duplicate-event collision remains explicitly tracked in full integration b922, KAN-225/13356; that original branch and all tests remain intact. No test of an included feature is deleted, weakened or skipped to hide the failure. Draft485 MFA and draft486 Start review control are also excluded. Existing staff-notification behavior is preserved and full-detail production mail remains OFF.

Workflow core87 and staff recovery89 are included as default-off source only; neither migration is installed by this release. No configuration, database setting, role, scope, permission, provider or sender activation is part of the public-site deployment. The customer status fallback remains truthful while workflow reads are unavailable. Server AAL2, role, capability, scope, ordinary-session and recovery guards are preserved. No prescription, purchase, payment, clinical review, shipment or email-delivery fact is invented.

## Exact environment anchors and rollback

Last verified production:7726fd9ebde5ca1ba71c4e8babfad174e82ef677, Render service srv-d8s9vej7uimc7384dfcg, deployment dep-dbtpv82fngtc739setp0. Staging:b1def03be322f2f594ce119ac334363b102f3db5, service srv-d9h4f4m7r5hc73ctjng0, deployment dep-dbuh4mhsrm7s73erucg0. Reverify immediately before pinning any deployment. Preserve service branch/config and all secrets; exact-commit deployment only. Rollback uses the respective known-compatible application SHA with no SQL/schema rollback. Preserve immutable requests, events, outbox and uncertain-send evidence. No cleanup/backfill or original-request duplication.

The old contact/quote runbook pending/rollback intro is historical and MUST NOT drive migration application. Auditor13351 observed older contact/quote/queue/postal sources installed under managed20261115203553 through20261115203618 and short staff notices20261115220003; staging alone full staff detail20261116163920. Managed installation IDs differ from source filenames. New87/89 are absent both environments. There is no migration action in this release; require a separately reviewed exact checksum/object/ledger plan for a future apply, including row89 audit-constraint lock impact and provider readiness. CLAUDE-4 owns correction of the historical contact runbook in the full workflow lane.

## Validation and honest limits

Exact73d homepage body/layout: actual production build,11 focused tests,13 viewport/text states and3 real200-percent browser zoom states passed. No overflow, external requests, browser mutations or page errors;113 copy keys/116 occurrences; axe0 at390. The seven-file b922 delta has independent source ACCEPT: raw/CSR metadata agree and only2 exact home hashes changed; body/layout/assets unchanged. The immutable private preview at http://127.0.0.1:60500/ is presentation-only and remains a prior snapshot. Real-device, screen-reader, genuine staff/customer, real provider/mailbox and full cross-zone acceptance are not established by those synthetic checks.

Before release, require exact composed hosted checks, independent source acceptance, scoped compiled/served staging proof, fresh environment anchors and one Root production writer. Post-deploy record exact deployment/SHA, health/route/asset/SEO checks and rollback availability. The overall Early Access/staff/factory program remains incomplete even after this narrower site update goes live.
