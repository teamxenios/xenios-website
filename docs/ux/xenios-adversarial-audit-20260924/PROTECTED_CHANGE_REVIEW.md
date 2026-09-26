# Protected change review — integrator action required

## September 26 closeout lead review (supersedes the ownership dependency below)

Samuel's pasted continuation request explicitly assigns this Codex session as implementation and release-control lead and requires protected review and canonical fingerprint reconciliation. This grants local review/record authority only. The six-file diff from 0574264 to c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa was re-read in full: the change is limited to contact acceptance, provider idempotency, bounded waiting, corporate confirmation and removal of an unsupported response-time promise. Existing validation, honeypot, rate limit, email recipient configuration and all non-contact routes remain unchanged. This is the named lead's review, not an independent second-agent acceptance.

Exact lease: XENIOS-AUDIT-RELEASE-CONTROL-20260926. The prior manifest lease is in handoff state. Claude's active clarity-spec lease covers only docs/ux/xenios-clarity-program/** and is untouched. The manifest now records these six exact reviewed files as reported seams, hard-locks their complete normalized bytes, and admits no directory wildcard. The gate's unrelated-file denial remains tested; mutation checks now include every contact seam. This deliberately scoped baseline revision will be committed separately from application changes. Full release qualification is still pending and no deployment is authorized.

Fresh read-only Render, dual-origin health, managed migration history and bounded function-ACL observations are in evidence/closeout-*-20260926.json. Central production identity is reconciled to 79414143, never to the candidate. Managed history alone is not exact migration byte equality or full SQL postcheck evidence.

Application source: `c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa`. Original tested repair: `02d525baa7d784ed16e297c1d17b1e4050ecf4cc`. Test-only successor `ee1c972` corrects the old documents destination assertion; it does not change the browser bundle.

The user authorized reversible audit repairs, including corporate confirmation and response-time wording, but explicitly withheld deployment authorization. The author has not approved their own protected integration or modified fingerprints.

## Exact scope and rationale

`protected-routes-review.diff` is the exact baseline `0574264` to application `c4ea8a9` diff for `server/routes.ts`. It replaces fire-and-forget contact delivery with an awaited result. Team acceptance is bounded at 10 seconds; courtesy acceptance at 2 seconds. Unknown team acceptance returns 503 with uncertainty wording, while accepted team delivery remains successful when courtesy delivery stalls. Existing request validation, honeypot, rate limit and authentication boundaries remain intact. No route registration, payment, membership, clinical or security authority was added.

Additional protected review scope: `client/src/components/ContactForm.tsx`, `client/src/lib/content.ts`, `client/src/lib/waitlist-service.ts`, `server/services/contact-delivery.ts`, `server/services/email.ts`. Corporate and partnership callers share the real service; these are the only application callers found by repository search. Client waiting is bounded at 20 seconds. Deterministic provider idempotency keys protect unchanged retries within the provider's 24-hour window. Courtesy keys include the original inquiry payload. This does not establish inbox delivery or durable application storage.

Recorded fingerprint mismatch, not reconciled:

| File | Manifest expected SHA256 | Candidate SHA256 |
| --- | --- | --- |
| server/routes.ts | feb276a9f6412c16deb352d267b3c2216ea251b32f0769bd42a66b1edd9f73c4 | f17d518ee2a3bcda2ff4d4ffca6bc8475c0ced5f7c9f5f85b19bd189e09ea2ae |
| client/src/lib/content.ts | 077f0e154aa05ee91f4a9088f763c391d3ca61f78cf9bd89f9ce7031bf8cc13a | 505468087f7f96148d3e112b428ed8c3b39a125d159511d28d81fb641c05e2f0 |

## Regression evidence

74 focused tests pass, typecheck and production build pass. Full suite at application source: 18,053 passed, 85 skipped, two failures (protected fingerprint and outdated route assertion). The route assertion was corrected separately and all five quality-surface tests pass. This is a full-run result plus a focused correction, not a fabricated all-green full run.

Browser evidence proves team timeout, courtesy stall, provider response loss, browser response loss, preserved drafts, unchanged retry/replay, rate limiting, slow-network pending state and duplicate submission capture. All email evidence uses a blocked-network isolated provider capture. No external message was sent. 185 lifecycle tests and 35 customer / 57 partner SQL rehearsal checks pass; their isolation limitations are recorded separately.

## Required integrator workflow

The launch ownership contract reserves `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` and integration controls to the lead/integrator. Review the exact diff and six paths above, record ownership acceptance against the exact proposed integration SHA, then reconcile fingerprints only as the result of that review. Re-run core protection and trusted-base ownership checks. Do not copy hashes merely to force green.

Fresh Render observations identify production as `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, deployment `dep-daqft3vf3r2c73b7e88g`; both origins returned health 200 with commerce disabled. Historical central controls still name `c545a70`. Reconcile CURRENT_PRODUCTION_STATE, ACTIVE_RELEASE_GRAPH, FILE_OWNERSHIP.productionBaseSha and MIGRATION_DAG.productionSha together using actual production evidence and a current schema observation. Never identify the undeployed candidate as production.

The qualified release manifest prerequisites are not satisfied: actual integration ownership attestation and coherent production/schema controls are missing. No qualifying manifest or approval is invented. After those prerequisites, bind the manifest to the exact integration candidate, its complete Git diff inventory, rollback to verified production, health/route smoke, and explicit deployment authority. This audit provides no such authority.
