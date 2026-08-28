# Client-account candidate migration — P1-8/P1-9 attack rehearsal evidence

Rehearsed: 2026-08-27, by the P1 remediation session on branch
`fix/xenios-client-account-p1-remediation-20260827`.

- Candidate file: `supabase/candidates/20260826_research_client_accounts_blitz.sql`
  (REWORKED this date for the adversarial review's P1-8 effective-privilege and
  P1-9 invitation-governance findings).
- Target status: **STILL UNAPPLIED — NOT READY FOR APPLY.** The corrected
  candidate awaits its own independent review, ledger registration, and DAG
  entry. This document records an attack rehearsal, not an application, and
  every migration-dependent production feature remains disabled.
- Environment: disposable Docker `postgres:15-alpine` (Supabase's PG 15
  major), fresh database, destroyed after. Role model mirrored (`anon` /
  `authenticated` nologin, `service_role` nologin BYPASSRLS), plus the
  production-applied `research_prelaunch_role_assignments` shape (with a
  minimal `auth.users`) that the new preflight requires, seeded with an
  ACTIVE super_admin, a non-admin operator, and a REVOKED super_admin.

## What changed since the 2026-08-26 rehearsal

The earlier rehearsal *proved the P1 findings* without naming them: it showed
`UPDATE draft → founder_approved with approved_by='Samuel'` **succeeding**
(arbitrary actor text as approval) and flagged the `ALTER DEFAULT PRIVILEGES`
gap as a caveat instead of closing it. The rework closes both:

1. **Effective privileges (P1-8):** before any grant, ALL privileges are
   revoked from `PUBLIC`, `anon`, `authenticated`, AND `service_role` on all
   six tables and on both identity sequences; function EXECUTE is revoked
   from `PUBLIC`. The explicit grants are the exact effective surface.
2. **Append-only by trigger (P1-9 adjacent):** the audit table blocks
   UPDATE/DELETE by trigger (the commission-ledger pattern, `search_path`
   pinned), so an owner connection, a migration, or a later stray GRANT cannot
   rewrite history either.
3. **Invitation governance (P1-9):** `staging_id` is NOT NULL; a permanent
   unique index allows one invitation history per staged identity; a BEFORE trigger
   enforces the full state machine for EVERY writer (owner included), requires
   contact + granted consent on the staged person before approval, and
   verifies `approved_by` against a CURRENTLY-ACTIVE `super_admin` row in
   `research_prelaunch_role_assignments` — actor text is never authority.
   `service_role` holds SELECT only; writes go through three SECURITY DEFINER
   doors (`research_client_invitation_draft`,
   `research_client_invitation_founder_approve`, and
   `research_client_invitation_transition`) that the trigger still governs.

## v1 historical denominator — 18 rows, current dispositions below

| # | Attack | Result |
|---|---|---|
| A1 | `anon` direct read of staging | permission denied |
| A2 | `service_role` direct INSERT into invitations | permission denied (SELECT-only grant) |
| A4 | OWNER inserts an invitation born `founder_approved` | refused: "born draft" |
| A6 | Transition draft → queued (skipping approval) | refused: not in the state machine |
| A7 | Approval naming a non-admin (`internal_team`) user | refused: not a currently-active super_admin |
| A8 | Approval naming a REVOKED super_admin | refused: not a currently-active super_admin |
| A9 | **Unauthenticated OWNER sets `approved_by='Samuel'` free text** | **refused exactly because `auth.uid()` is absent; actor text is not authority** |
| A10 | Approving a person with no contact info | refused: enrichment precedes approval |
| A11 | Approving with consent still `pending` | refused: only granted consent |
| A12 | Second invitation history for one staged identity | refused: one-history unique violation |
| A13 | founder_approved → sent (skipping queued) | refused: not in the state machine |
| A14 | Historical accepted → queued rewind | no longer constructible: both CHECK vocabularies exclude `accepted`; replacements assert that exclusion and refuse sent → queued |
| A15 | OWNER deletes an invitation | refused: history is revoked/expired, never deleted |
| A16a/b | `service_role` UPDATE / DELETE on audit | permission denied |
| A16c | `service_role` `nextval` on the audit sequence | permission denied |
| A16d/e | **OWNER** UPDATE / DELETE on audit | refused by trigger: append only |

The current legitimate path is draft → founder_approved by the ACTIVE
super_admin → queued → sent. The stale claim that it continued to `accepted`
is withdrawn: `accepted` is deliberately absent from both persisted state
vocabularies.

## Effective grants after apply (information_schema.role_table_grants)

```text
service_role  research_client_import_batches             INSERT,SELECT
service_role  research_client_import_staging             INSERT,SELECT,UPDATE
service_role  research_customer_account_invitations      SELECT
service_role  research_product_activation_overlay_audit  INSERT,SELECT
(anon / authenticated / PUBLIC: no rows — zero privileges)
```

Owner (`postgres`) retains inherent table privileges, which is why the
governance lives in triggers: A4/A9/A15/A16d/A16e prove the owner path is
bound too.

## Also re-verified

- Clean single-transaction apply on fresh PG 15 (`COMMIT` reached).
- Rerun refusal: the preflight raises and the transaction rolls back with
  prior data untouched.
- New preflight dependency: apply refuses where
  `research_prelaunch_role_assignments` does not exist.

## What an applier must still do (unchanged)

Founder gate, independent review of THIS reworked file, `supabase/MIGRATIONS.md`
ledger + DAG registration at apply time, and the post-apply acceptance query on
`role_table_grants` against the table above. Synthetic rehearsal data
("Synthetic Person A/B") never left the container; the container was destroyed.

---

# Round 3 addendum — P1-F: immutable, evidence-bound approvals (v2 battery)

Reworked the same date for the second adversarial review's P1-F finding:
approval was governed but not BOUND — eligible data could be approved, then
mutated, and still queue. The candidate (STILL UNAPPLIED) now binds every
approval to an immutable snapshot and freezes the approved evidence:

1. `research_client_import_staging.row_version` bumps on every update; the
   guard trigger computes `approved_snapshot_hash` (built-in sha256 over
   staging_id | batch | normalized identity | contact | consent | partner)
   plus `approved_row_version` AT APPROVAL TIME — server-computed, never
   caller-supplied — and every queue/sent advance RE-RESOLVES the staging row
   and refuses on any mismatch, re-checks contact/consent eligibility, and
   re-verifies the approving principal is STILL an active super_admin.
2. Approval fields are immutable once written, for every writer; the
   invitation can never be re-pointed at a different staged person.
3. The staging row's evidence fields FREEZE while a founder_approved/queued/
   sent invitation references them. The older revoke → edit → re-approve claim
   is superseded by the current revoked-terminal and one-history rules.
4. Constraint/trigger alignment: `draft → revoked` is legal WITHOUT approval
   (the check constraint now exempts 'revoked'); there is ONE state machine.

## v2 attack battery — corrected counted outcomes

| # | Attack | Result |
|---|---|---|
| V2-1 | draft → revoked without approval | ALLOWED (aligned machine — positive test) |
| V2-2a/b | approve, then mutate consent / email on staging | refused: approved evidence is immutable |
| V2-2c | superuser disables the freeze, mutates, re-enables, queues | refused: snapshot mismatch |
| V2-3a/b/c | owner replaces approved_by / rewrites approved_at / swaps hash | refused: approval record is immutable |
| V2-3d | owner re-points the invitation at another staged person | refused |
| V2-4 | owner deletes the staged person behind a live approval | refused (FK) |
| V2-5 | advance to sent after the approver's super_admin role was revoked | refused: re-approval required |
| V2-6a | queue after revoked | refused: not in the state machine |
| V2-6b | sent without queued | refused: not in the state machine |
| V2-7 | historical revoke → edit evidence → re-approve → queue | historical positive superseded; current re-approval and second-history replacements are both refused (additional, not counted) |

The old heading "all refused" is withdrawn: counted v2 has one deliberate
positive (V2-1) and 11 refusals. V2-7 is additional and is not part of the
12-count denominator. Likewise, v1's 18 historical rows are not honestly
"18/18 refused" in the current vocabulary: A14 is nonconstructible and has a
positive vocabulary assertion plus the nearest representable rewind refusal.

## 2026-08-28 executable-harness remediation

The authoritative map is
`supabase/candidates/20260826_research_client_accounts_blitz.attack-map.json`.
It contains exactly 18 counted v1 rows and 12 counted v2 rows; V2-7 is marked
additional. Every mapped execution has a unique stable executable ID and both
passes require complete, duplicate-free, unmapped-free coverage.

Per pass, the existing broad suite records 37 refusals and 11 positive
invariants. The mapped narrative suite records 33 executions: v1 has 18
historical rows represented by 19 executions (18 refusals and the positive
`accepted`-unrepresentable assertion); counted v2 has V2-1 positive plus 11
refusals; additional V2-7 has two current-schema refusals. Across two passes,
that is 74 broad refusals, 22 broad positives, 62 mapped refusals, and 4 mapped
positives.

The pinned disposable runner applied the candidate twice, required the second
apply's normalized object delta to equal the first, and restored the exact
pre-apply catalog/data baseline after each explicit non-`CASCADE` rollback.
The captured delta spans six tables, ten functions, six triggers, two identity
sequences, six row types, every explicit/implicit index, constraints, policies,
and helper functions. It also proved the in-place rerun returned only SQLSTATE
`P0001` with the exact reconciliation message and left catalog/data unchanged.
Two complete 2026-08-28 runs produced the same logical-result SHA-256:
`7b84af47bdcc99f471e5ef986b34e1e13347377686d75b0baa89b94a2eff1703`.

Rehearsed input SHA-256 values:

```text
da388c62bb7482622521db087ac8439bcea0ab1967e42221c68e1cf9fd608919  20260826_research_client_accounts_blitz.sql
a9aad83261a28beef3a86deed11def0a594f73c33aa8b11258a5db083f9e769b  20260826_research_client_accounts_blitz.attack-map.json
c4f5c4b46123f61ad399b66a2b27bc604aa4338d6b105a808c1188c678ba81b1  20260826_research_client_accounts_blitz.disposable-bootstrap.sql
00b3e6e46a4d994ad30061d6c6d536c75c1d1367c1c551c544cb53036533299a  20260826_research_client_accounts_blitz.capture-objects.sql
f1081726ac886a44b44eea14dd6d3fd0547cf2e2d7a518397fc2af33e15e9b0a  20260826_research_client_accounts_blitz.attacks.sql
c2f5e93b5b865c19cf98b4ed17389f7133a40abbf8ef758b6f9eca68ddeed377  20260826_research_client_accounts_blitz.narrative-attacks.sql
ff296b4786bc338d108b20bd03a89b183bfa5592a8393022a716c3f138490588  20260826_research_client_accounts_blitz.rollback.sql
df1fff3c9cb2998a14ee02e549dfd9cc9f8f24f17a08e717274fcc6757f92cbf  20260826_research_client_accounts_blitz.verify-rollback.sql
fbdc0b1f1eb30c7f7edb2ae8f4c4b8e3a189c7229c10f8551f3ab19730f0d8e3  20260826_research_client_accounts_blitz.rehearse.ps1
```

All fixtures were synthetic; both random containers were destroyed. The
candidate remains unapplied. Independent review must explicitly accept or
reject the stricter A14/V2-7 supersession before any apply decision.

**Status unchanged: NOT READY FOR APPLY** — founder gate, independent review,
ledger + DAG registration all still required before any environment runs it.
