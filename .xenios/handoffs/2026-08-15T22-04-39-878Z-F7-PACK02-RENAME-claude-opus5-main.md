[XENIOS HANDOFF]

TASK:
F7-PACK02-RENAME. Finish and certify the Pack 02 account organization rename
(decision D-004) and its migration M70.

BASE SHA:
75ea6637acdda07d6ab576df236d6ee5c6790a57 (the paused work-in-progress commit)

BRANCH:
fable/f7-pack02-rename (pushed to origin)

COMMIT SHA:
f556dc79ab74d3ae87b4c29335e1200ca3fcbabe

FILES:
- scripts/verify-m70-account-organizations.sh (new, 362 lines)
- docs/coordination/MIGRATION_DAG.json (M70 registered; 29 -> 30 nodes)
- supabase/MIGRATIONS.md (ledger row 70)

The migration body was NOT modified. Its pinned blob checksum
eaebfa6e20560837e287a44793aaf53884cdd6089e7bcee23ec31407f99239e5 is identical
at the base SHA and at HEAD.

WHAT WAS BUILT:
The certification harness and the two registrations that 75ea663 left open.

The harness rehearses the one risk M70 actually carries. M70 exists because
production already carries public.research_organizations for the PARTNER
system, so the danger is not a failed apply, it is an apply that quietly
damages a live table. The fixture builds that partner table with its real
five-column shape (id, name, owner_partner_id, state, created_at), two rows,
row level security and an authenticated SELECT grant, and the suite compares
its column list, its row contents and its grant after every apply. A rehearsal
without that table present would pass vacuously and prove nothing.

It also rehearses the collision itself: a partner-shaped clone is placed under
the account name and the preflight is required to refuse it, which is exactly
what D-004 was decided to prevent.

Certified on PostgreSQL 16 and PostgreSQL 17. On both engines:
- the preflight fails closed on a bare database and leaves no relation behind
- a partner-shaped clone under the account name is refused (D-004 enforced)
- two applies at psql exit 0
- the 11-assertion behavioural suite green after each pass
- the live partner table byte-identical before and after
- the post-condition proven non-decorative: granting anon SELECT on an account
  table makes the re-apply abort
- a stray anon EXECUTE grant on an account routine is healed by re-apply, with
  the healed end state proven

WHAT WAS NOT BUILT:
- Production application of M70. Not done, not authorized here.
- Independent DB QA. Still required before application.
- The account UI mount (F7-ACCOUNT-MOUNT), which depends on this.
- Two hardening deltas were RECORDED rather than changed, because editing a
  certified migration body to match a newer convention is not a documentation
  edit: (1) row level security is enabled but not FORCED on the eight tables,
  unlike 17 of 30 peer migrations and unlike the assisted-order bridge
  migration's stated convention; (2) the post-condition proves grant absence
  for anon and authenticated but not for PUBLIC or service_role. Neither is an
  open hole today because the migration creates no table grant at all. A later
  hardening pass should close both, and that pass should be its own migration
  with its own certification.

FOCUSED TESTS:
account-identity 161 passed across 23 files.

TYPECHECK:
tsc --noEmit exit 0.

BUILD:
Not run. No application runtime code changed on this branch beyond the two
production-store references already carried by the base commit.

ROUTES:
Route uniqueness accepted: 375 static Express API registrations across 366
call sites.

SECURITY:
Zero anon or authenticated table grants on the eight account tables, proven by
the suite and re-proven by the migration's own post-condition. Three SECURITY
DEFINER routines executable by service_role alone. The live partner table's
authenticated SELECT grant survives, so the partner system's read path is not
broken by a broad revoke.

PRIVACY:
No customer, member, payment or identity data is created or read. One seed row
(the roman-digital organization) carries a business contact address that was
already in the migration as authored.

MIGRATION:
Registered in docs/coordination/MIGRATION_DAG.json as
research_account_organizations_pack02, appliedToProduction false,
managedMigrationId PENDING, applyTwiceVerified true, dependsOn [] (its
prerequisites auth.users, research_members and research_orders predate the
DAG). Ledger row 70. Row 69 is deliberately skipped on this line: it is the
quantity-band-100 migration held on fable/q100-dark, not yet merged here.
Migration DAG gate accepted at 30 nodes with canonical checksums verified.

FEATURE FLAG:
None. The schema is inert until the account API surface is mounted, and that
surface is the only writer.

INTEGRATION:
None yet. F7-ACCOUNT-MOUNT (the parked fable/pack02-account-mount at
53e306e4a) is blocked on this and must be rebased onto the accepted release
line after M70 is applied, not before.

PRODUCTION MUTATED:
NO. Production was never connected to. All rehearsal ran on disposable
containers. Render was inspected read-only only.

FOUNDER ACTION:
Required before M70 reaches production, and not performed here:
1. Independent DB QA of this exact SHA.
2. Approval of the production apply packet.
3. One authorized production DB writer applies M70 and runs the postcheck.
Production is currently live at b0fe396 (deploy dep-da07gcdbedkc73a3mka0),
which does not contain this branch.

NEXT TASK:
Independent DB QA of f556dc79ab74d3ae87b4c29335e1200ca3fcbabe, then the
production apply packet for founder approval. F7-ACCOUNT-MOUNT unblocks only
after the schema exists in production.
