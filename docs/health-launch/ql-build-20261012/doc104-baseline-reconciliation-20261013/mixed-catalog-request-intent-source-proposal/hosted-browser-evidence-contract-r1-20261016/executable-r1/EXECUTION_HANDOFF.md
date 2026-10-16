# Executable proposal R1 - NOT RUN / NOT AUTHORIZED / UNAPPLIED

This subdirectory implements Doc208's conditionally accepted weaker protocol.
Application E33 is unchanged. Do not move workflow.UNAPPLIED.yml into .github,
publish, dispatch, install tools, provision credentials or run these modules
without the corresponding actual approval and reviewed execution controls.

Files:
- contracts.mjs: independent serialization literals and standard SHA-256 vector,
  pre-POST expected binding, exact native receipt parsing, identity admission.
- hosted-browser.UNAPPLIED.mjs: mounted real UI, three scenarios, bounded same-origin
  network proxy, upstream-complete/downstream-loss, replay/409/A/B/anonymous,
  before-forwarding expected files and post-staff-snapshot handoff.
- verify-tools.UNAPPLIED.mjs: exact allowlisted tool bytes/modes/set verification.
- workflow.UNAPPLIED.yml: manual dispatch, full-history exact Core checkout,
  pinned actions/Node, staging environment/concurrency, approved immutable tools
  artifact, short-lived credential-file handling. No runtime build/install or SQL.

These are executable source files but NOT an execution-ready bound payload.
No syntax check, golden-vector execution, browser/test/build or workflow validation
was performed: current task explicitly forbids execution.

## Doc208 conditions mapped

1. CLAIM literal appears in admission/evidence/output. No Doc399 equivalence claim.
2. All five compensating actions mandatory for EACH case; any failure aborts.
   409 no-new-row still needs independently approved DB snapshot and settled
   complete accounting; HTTP 409 alone is not declared persistence proof.
3. Server-session proof must attest real eligible distinct A/B and bind the exact
   sensitive state-file byte hashes and expiry. Typed email/profile is never used.
   B has runtime authorized catalog read, only recover mutations; no B submission.
   The app lacks a public pair-identity route: existing secure server-side session
   observation must supply the proof. This candidate does NOT invent such evidence.
4. Route accounting covers all same-origin HTTP including POST/recovery; unknown
   mutations/off-origin/redirects fail; no automatic fetch retry. All requests settle.
5. Independent canonical golden literals live in contracts.mjs, not imported E33
   output. DB-owner successor handles missing/NULL, pair_rows1, fingerprint/exact
   JSON and exactly one submitted/total event. Not implemented by Core.
6. Optional DB private equality/distinctness strengthening is not presumed.
7. Proposed served-identity basis is EXPLICIT PROVIDER-ONLY, requiring executable
   reviewer acceptance + approved fresh provider proof. No /api/health or new route.
   Provider proof must bind origin/service/deploy/live status/E33 SHA/tree and
   current observed time. Root must obtain another fresh provider identity after
   the browser interval; current browser output explicitly awaits that evidence.
8. No old Doc399/G0 evidence changed/retried. Records retain residual no-private-
   pair provenance and NOT LIVE status.

## Mandatory run-manifest and provider-proof inputs

No filled manifest is fabricated here. Root freezes exact raw UTF-8 manifest hash
in XENIOS_FROZEN_MANIFEST_SHA256. Manifest fields consumed by code:
appSha/appTree/origin/renderService/supabaseProject/deployId/servedIdentityBasis;
executionAuthorization/executableAcceptance/databaseSuccessorReview/expiresAt;
providerProofSha256/providerEvidenceMaxAgeMs/preStaffSnapshotRequired;
limits {maxRunMs<=600000,maxPosts<=40,maxRequests<=400,maxInflight<=8,
maxResponseBytes<=4194304,maxTotalResponseBytes<=134217728,requestTimeoutMs<=10000};
toolchain {acceptanceReference,inventorySha256,playwrightEntry,playwrightEntrySha256,
playwrightPackageJson,playwrightVersion,browserPath,browserSha256,browserVersion};
cases in exact three-label order, each {label,contact,lines,agreements,
catalogSha256,configSha256}.
contact is normalized synthetic input, billingSameAsShipping=true; agreements
contain exactly {kind,version,accepted:true} before UI-generated acceptedAt binding.
catalog/config hashes use independent canonical serialization. Each case uses the
same catalog authority unless genuinely changed and separately reviewed. Full
catalog scan is bounded50pages and all selected source identities must be present.

Provider proof fields: providerOnlyBasisAccepted=true, authorizationReference,
appSha/appTree/serviceId/origin/deployId/status="live"/observedAt;
principalEvidence {authority:"server-session",sourceReference,aEligible:true,
bEligible:true,distinct:true,stateSha256:{a,b},expiresAt}.
A proof is an actual owner-collected evidence artifact, not an instruction to set
booleans by assertion. Reviewer must inspect source evidence and exact binding.
The file hashes prevent substitution, not fabricate authenticity or scope.

Tool bundle: approved same-repository artifact ZIP contains run-manifest.json,
provider-proof.json, tool-inventory.json and tools/. All are nonsecret. Every tool
file must appear in inventory {path,bytes,mode,sha256}; no extras/symlinks. A fully
pinned Playwright package, complete dependencies and matching Linux Chromium are
required. There is currently NO prepared/approved tools artifact, chosen version,
browser hash or actual artifact ID. Do not infer they exist. Source preparation
may produce the exact lock/bundle under separately valid tooling authority;
no unpinned npm install or replacement test runner is authorized here.

## Exact remaining actions / authorities

- Original reviewer executable review, including provider-only identity basis,
  Ubuntu runner/network/fault semantics, golden-vector coverage and cleanup limits.
- Qualification owner approves toolchain bundle creation/reuse, locks and complete
  file inventory, then offline syntax/negative-control checks under exact admission.
- Root supplies actual staging config/deploy readiness and approved deployment;
  no customer/staff credential grants or staging writes inferred from MCP OAuth.
- Authorized short-lived A/B synthetic states, actual server proof and appropriate
  existing standing; staff state/capability later via existing operations owner.
- GitHub publication/dispatch of this exact successor, staging environment, read
  permissions contents/actions only, exact approved artifact ID/digest; no paid
  resources provisioned. Artifact availability/pinning is a real prerequisite.
- Exact bounded staging mutation run approval; separate populated SQL approval.
- Post-browser provider identity check and independent owned-process closure
  attestation. browser.close() and runner job completion are not an OS census.
- Safe evidence collection must be reviewed before artifact publication. Proposed
  pinned upload-artifact step retains ONLY explicit synthetic evidence JSON/PNG
  under the output directory for one day, never the input/tool/state directories.
  Synthetic emails must end in @example.invalid. The output schema and screenshot
  surface need explicit executable-review acceptance before dispatch. Raw traces,
  HAR, private provider/session proof and storage states are not uploaded.
- Staff readback AFTER the persistence snapshot; admin payment refusal and other
  release conditions remain independently outstanding. No payment transition.

Authority requests must name exact inputs/budgets/window and permitted mutations.
A successful process exit from this browser source remains only completed HTTP/UI
observations pending DB/postidentity/closure/staff/admin evidence, not a live release.
