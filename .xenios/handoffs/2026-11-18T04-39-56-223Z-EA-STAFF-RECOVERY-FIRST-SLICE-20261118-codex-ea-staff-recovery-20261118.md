# Staff recovery first slice

Author: existing Codex catalog_review agent; source implementation, not native Claude acceptance.

- PR: https://github.com/teamxenios/xenios-website/pull/482 (draft).
- Exact head: `5cb0d3b9a60c6c6137ac0de66059c8b4693ad4c2`.
- Base: Root `169edddd932e6f32016b2c3af0f07e6aa5b1c086`, branch `codex/ea-experience-root-integration-20261118`.
- Author branch/worktree: `codex/ea-staff-recovery-20261118`, `C:/xenios-wt/ea-staff-recovery-20261118`.
- Initial author base: `ca6bcb94e756b120f0a66070f88c12aabd821f4e`; source `1bf91838`, assertion/parity follow-up `ed2e6c95`, then a normal merge of Root169. No rebase/force push.
- Task/session: `EA-STAFF-RECOVERY-FIRST-SLICE-20261118` / `codex-ea-staff-recovery-20261118`.
- Exactly eight leased product files. Mirrored `.xenios` files remain uncommitted; no release ledger or DAG edits.

The existing forgot-password endpoint keeps member eligibility and single-send priority, then optionally checks staff eligibility after sending the same neutral response. The new feature defaults off. Staff requires explicit trusted SITE_URL, same-origin JSON context, shared durable hashed budgets, and one RPC with a confirmed non-SSO/nondeleted/nonbanned Auth subject and current explicit staff assignment. It does not read request roles, metadata or email domains as authority; create membership; renew access; or change a password directly.

The private fixed-search-path definer reads `auth.users.email = p_email AND is_sso_user=false`, preserving the observed installed email-index predicate. The public wrapper and private function execute only for service_role and explicitly reject another current SQL role. service_role receives no Auth-table SELECT or private-schema CREATE privilege. The sole write is a transactional actor-null decision audit with a new audit-only purpose. Existing permission constraints, append-only trigger and role definitions are preserved. An allowed audit is eligibility evidence, not authenticated identity or email delivery.

Git-byte pins:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `supabase/migrations/20261118034207_staff_account_recovery_eligibility.sql` | 4552 | `3805756dcadac2cd5ad5780adaec6f151375557fa952547e114dc496015cbd2f` |
| `server/research/staff-recovery.ts` | 4124 | `98c6d642154f54292f9999f5e465f6e3c4210c037e5d9cbf4b4d4d72a41ff659` |
| `supabase/tests/staff-account-recovery.test.sql` | 8462 | `becc8ea5bc2d387e46c2c8af6548e6602f67d84c4ba372ea0cae34d5149a4eee` |

Actual evidence:

| Check | Result / applicability |
| --- | --- |
| Six-file TypeScript syntax transpilation | PASS, zero diagnostics; syntax only |
| Git whitespace checks | PASS |
| Local guarded three-file Vitest on first source | 115 pass, 10 fail, 1 SQL skip. All failures were one obsolete expected response literal in unsafe-returnTo cases. That literal is corrected; redirect assertions preserved. |
| Guarded member-only repeat after correction | RESOURCE_HOLD, exit75 before child start; no repeat pass claimed |
| Hosted run44234930509, exact current head | Build, typecheck, protection PASS. Recovery pre-gate: 3 files/126 tests passed, zero skipped/failed. Includes real ownedPG16; members78, staff39, continuity9. 5.72s. Subsequent guest checks178pass/1fail (missing Root-owned migration ledger entry46vs47). Full suite skipped, required completion failed. |
| Local PostgreSQL / managed Auth / real email | NOT_RUN |
| Independent review | Requested CLAUDE-3 via KAN-225 comment13338; POST confirmed, no ACK/verdict observed yet |

The owned PG16 wrapper publishes no port, accepts no existing database URL or credentials, uses a random isolated Docker container, and restricts the rollback fixture to `staff_recovery_disposable`. It applies the real Care foundation and unchanged actual reader/processor role/audit extension blocks, replays the new migration, preserves an independently approved audit value, then exercises 27 decision calls. Its synthetic Auth shape uses the actual observed columns/indexes, not a live managed provider. Cases include eight allowed staff roles; denied patient/no-role/metadata-only/revoked/future/unconfirmed/deleted/banned/SSO/non-normalized/unknown identities; current revocation; actor-null append-only audit; audit failure abort; browser-role denials; full Auth/role value parity; and the index-eligible equality predicate. It does not qualify the rest of the workflow migration, managed GoTrue, redirect policy or SMTP.

Read-only environment evidence from the independent callback audit: stored staging SITE_URL matches `https://xenios-research-staging.onrender.com`. Actual managed Auth SiteURL/redirect allowlist/templates/SMTP remain unobserved; no wholesale secret-bearing config getter was used.

The exact recovery step log is saved privately as `staff-recovery-hosted-44234930509.log` beside this handoff. The hosted test job134568651327 finished at04:07:37Z; qualification step7 finished at04:06:51Z. Independent review was requested before these final counts and is still posted-only, not ACKed or accepted.

Remaining required seams: Root must assess the actual qualification evidence before assigning auth ledger89, obtain exact independent source review, and compose/requalify. Staff-only post-reset sign-in currently reaches the existing customer membership denial; Root is assigning that separate SignIn/core seam. Synthetic active-customer continuity is not proof of staff-only portal arrival. Real authorized recovery/inbox, current staff sign-in/MFA, and managed activation remain unverified. Existing password floors and implicit recovery flow remain unchanged.

No real provider call, recovery/invite email, Auth setting, password, account, role/grant, capability activation, managed database write or deployment was performed. Local tests/browser processes ended; the heavy slot was returned to ux_reflow. Continue hosted qualification and resolve the separate auth seam without waiting for credentials to do source work.
