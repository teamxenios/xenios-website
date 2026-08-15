[XENIOS HANDOFF] SUPERSEDES the f556dc79 handoff

TASK:
F7-PACK02-RENAME. Fix the blocking defect independent QA found in M70, and
correct the ledger and DAG evidence that overstated what had been proven.

BASE SHA:
2a9aa6891b1e294dc15accf5ee01acd182ef9337 (the previously handed-off state)

BRANCH:
fable/f7-pack02-rename (pushed)

COMMIT SHA:
095c6c3f6f60eb0b6de817f2c2d7d1e712957dd3

WHY THIS SUPERSEDES THE EARLIER HANDOFF:
The earlier handoff said M70 was certified and ready for independent QA. QA
returned HOLD and was right. M70 could not have applied to production at all.

THE DEFECT:
Managed Supabase carries ALTER DEFAULT PRIVILEGES for postgres and
supabase_admin in schema public granting arwdDxtm on TABLES to anon,
authenticated and service_role. Verified read-only against the production
project. M70 created eight tables and carried ZERO table-level revokes, so its
own post-condition would have counted 112 grants (8 tables x 7 privileges x 2
browser roles) and aborted. A non-transactional apply would have left all
eight tables behind carrying anon and authenticated ALL, after reporting
failure.

WHY THE FIRST CERTIFICATION MISSED IT:
The harness fixture created the three Supabase roles but not the default ACLs.
On a stock postgres container a new table genuinely has no grants, so the
assertion "count of browser grants is zero" was true for a reason the target
does not share. The fixture was wrong, not the assertion. The fixture now
carries the default ACL, which makes that assertion load-bearing for this
migration and for anything else certified with this harness.

THE FIX:
- Eight tables now carry `revoke all ... from public, anon, authenticated`,
  the pattern thirteen migrations in this directory already use.
- service_role is DELIBERATELY NOT REVOKED: the deployed Pack 02 store queries
  these tables directly as service_role (production-store.ts via
  getSupabaseAdmin), so revoking it would let M70 apply and then break the
  account API on the next deploy. The post-condition asserts service_role
  reads all eight or none, so that regression fails at apply time instead.
- The post-condition's browser check moved off
  information_schema.role_table_grants onto the ACL, because that view reports
  only grants to roles and cannot see PUBLIC.
- Behaviour change: a stray browser grant is now HEALED by re-apply rather than
  refusing. That is the M67 shape, and the harness asserts the heal and proves
  the grant is gone afterwards.

RE-CERTIFIED:
PostgreSQL 16 and 17, 12/12 after both passes on both engines, against a
fixture that now replicates production's default ACL. Preflight still fails
closed; the D-004 partner-shaped-clone refusal still holds; the live partner
table is still byte-identical after both applies; both heal controls assert
their pre-state so neither passes vacuously.

THE OTHER CORRECTED CLAIM:
The earlier handoff said the schema is inert until the account API is mounted.
It is NOT. registerProductionAccountIdentityApi(app) is unconditional at
server/index.ts:283 in the production tree at b0fe396, and
server/research/index.ts admits its nine routes past the research wall. They
answer 503 today only because these tables are absent. Applying M70 alone,
with no deploy, flips GET /api/research/account/context from 503 to a real 200
for a signed-in verified member, and flips POST /api/research/account/claims/request
from 503 to fully live: it writes a challenge row, writes an audit row, and
sends real outbound email through Resend. Every path still requires a verified
Supabase JWT and QA found no cross-tenant read or write, so this is activation
rather than a privilege hole. But the release ordering between applying M70
and deploying is now an explicit founder decision, not a detail.

FOCUSED TESTS:
account-identity 161 passed across 23 files.

MIGRATION:
DAG gate accepted at 30 nodes with canonical checksums verified. M70 pinned to
sourceSha abed6d798670e5a4fe88d5b43a008a47d7b421ea, blob sha256
00260f8114af3f7884c62b24574a0f3761027fc955d06f22768dc6f6f02dd971,
appliedToProduction false, managedMigrationId PENDING. Ledger row 70 rewritten
with the correction stated rather than silently replaced.

NOT DONE:
- Re-QA of the corrected candidate. The previous QA verdict applies to the
  BROKEN version; it does not certify this one. A second independent pass
  should confirm the revoke fix on a Supabase-shaped fixture.
- Production apply. Still not authorized.
- The account UI mount (F7-ACCOUNT-MOUNT), still blocked on the schema.

PRODUCTION MUTATED:
NO. Read-only SELECT inspection only, to confirm the default ACL and the live
partner table shape. No migration applied, no Render change.

FOUNDER ACTION:
1. Independent re-QA of 095c6c3f.
2. A release-ordering decision: applying M70 before deploying activates two
   live endpoints, one of which sends outbound email. Deciding to deploy first,
   or to apply and accept the activation, is a choice that must be made
   deliberately.
3. Only then, approval to apply.

MIGRATION LEDGER CONVERGENCE:
Three unmerged branches each own a consecutive row. M69 =
20260814180000_research_early_access_cart_quantity_band_100.sql on
fable/q100-dark. M70 = this branch. M71 = the assisted-order bridge on
claude/assisted-order-bridge. Each branch's MIGRATIONS.md sees only its own
row, so no branch may be merged by taking one side wholesale. The integrator
must reconcile all three together and re-run the DAG and checksum gates on the
combined tree.

NEXT TASK:
Independent re-QA of 095c6c3f, and the assisted-order mount on the other
branch, which is unblocked and does not depend on this schema.
