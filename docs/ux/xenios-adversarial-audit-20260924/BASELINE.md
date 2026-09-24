# Independent audit baseline — 2026-09-24

Status: IN PROGRESS. This is fresh evidence, not a release approval. No application edits or production mutations have occurred in this audit.

## Provenance and isolation

- Candidate: `0574264562f33fe40572b1d9976f4700bef9c83e`, tree `0f4c05b8fa8e4d927c8de693085b58d96ac1febd`.
- Audit branch starts at documentation-only successor `c8ea24944f277e5b0770d5446687f2752db3ab73` and is `codex/xenios-adversarial-audit-20260924`.
- Fresh production Render read: service `srv-d8s9vej7uimc7384dfcg`, live deploy `dep-daqft3vf3r2c73b7e88g`, commit `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, finished 2026-09-24 10:43:29 UTC. Auto-deploy and previews disabled. Workspace selection explicitly authorized by Samuel.
- Production health GET at 18:46:30 UTC: running, Supabase/admin configured, Turnstile false, commerceEnabled false. Configuration booleans do not prove administrator identity or provider behavior.
- Frozen candidate worktree: `C:/tmp/xenios-audit-0574264-20260924`. Fresh pinned Node 20.19.0/npm 10.8.2 install and build passed; Vite chunk warnings remain. Dist inventory: 346 files; SHA256 `8766ab299967278fd35abcfbf1517a6b7a2bbb288ff0ebb48c5eebb8afcf9f38`.
- Candidate browser origin: `http://127.0.0.1:5299`, provenance-bound preview. Ambient app secrets removed, loopback bounded Supabase fixture, no email provider, temporary memory storage. Fixture catalog fallback is not canonical catalog evidence. Legal package unavailable; native commerce disabled. Shipping sweep fixture errors are expected unsupported fixture operations, not production observations.
- Production browsing is read-only. Synthetic submissions are local only. No real notification, payment, account creation, deploy, migration, or operational state change is authorized by this audit.

## Observations before repairs

| ID | Severity | Evidence | Finding |
| --- | --- | --- | --- |
| AUD-001 | P1 | `evidence/candidate-partnership-no-provider-result.txt` and PNG; local POST /api/contact returned 200 in 2ms at 18:53:03 UTC | Form claims inquiry received, human follow-up, and separate confirmation even with no email provider. Server fires email operations without awaiting acceptance and stores no durable inquiry. This can silently lose a business inquiry. |
| AUD-002 | P2 candidate | `evidence/candidate-partners-mobile.txt` | Primary links and form title still say Prepare inquiry although final action submits. Requires comparison with actual flow before repair. |
| AUD-003 | Historical production gap | `evidence/production-health-mobile.txt`, `candidate-home-390.txt` | Production lacks candidate's prominent sign-in/access chooser. Candidate visibly improves discovery; this does not establish deployed behavior. |

Partner dashboard signed-out state clearly denies access and its Sign in link preserves returnTo. Password recovery preserves the same return destination. These are browser observations only; real authentication, email delivery, expired/consumed tokens, cross-owner isolation, and privileged lifecycle transitions remain NOT RUN until separately evidenced.

## Evidence rules

Screenshots and DOM snapshots are labeled by environment/state. A link appearing in an inventory is NOT RUN until exercised. Fixture successes are never production persistence or delivery proof. Source review and automated tests remain separate from browser evidence. Release readiness stays NOT READY while the full baseline and required evidence are incomplete.
