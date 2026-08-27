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
   five tables and on the audit identity sequence; function EXECUTE is revoked
   from `PUBLIC`. The explicit grants are the exact effective surface.
2. **Append-only by trigger (P1-9 adjacent):** the audit table blocks
   UPDATE/DELETE by trigger (the commission-ledger pattern, `search_path`
   pinned), so an owner connection, a migration, or a later stray GRANT cannot
   rewrite history either.
3. **Invitation governance (P1-9):** `staging_id` is NOT NULL; a partial
   unique index allows one live invitation per person; a BEFORE trigger
   enforces the full state machine for EVERY writer (owner included), requires
   contact + granted consent on the staged person before approval, and
   verifies `approved_by` against a CURRENTLY-ACTIVE `super_admin` row in
   `research_prelaunch_role_assignments` — actor text is never authority.
   `service_role` holds SELECT only; writes go through two SECURITY DEFINER
   doors (`research_client_invitation_draft`,
   `research_client_invitation_transition`) that the trigger still governs.

## Attack battery — 18 attacks, all refused as expected

| # | Attack | Result |
|---|---|---|
| A1 | `anon` direct read of staging | permission denied |
| A2 | `service_role` direct INSERT into invitations | permission denied (SELECT-only grant) |
| A4 | OWNER inserts an invitation born `founder_approved` | refused: "born draft" |
| A6 | Transition draft → queued (skipping approval) | refused: not in the state machine |
| A7 | Approval naming a non-admin (`internal_team`) user | refused: not a currently-active super_admin |
| A8 | Approval naming a REVOKED super_admin | refused: not a currently-active super_admin |
| A9 | **OWNER sets `approved_by='Samuel'` free text** | **refused** (the exact 2026-08-26 hole, now closed at the trigger) |
| A10 | Approving a person with no contact info | refused: enrichment precedes approval |
| A11 | Approving with consent still `pending` | refused: only granted consent |
| A12 | Second live invitation for one person | refused: unique violation |
| A13 | founder_approved → sent (skipping queued) | refused: not in the state machine |
| A14 | Rewinding accepted → queued | refused: not in the state machine |
| A15 | OWNER deletes an invitation | refused: history is revoked/expired, never deleted |
| A16a/b | `service_role` UPDATE / DELETE on audit | permission denied |
| A16c | `service_role` `nextval` on the audit sequence | permission denied |
| A16d/e | **OWNER** UPDATE / DELETE on audit | refused by trigger: append only |

The legitimate path (draft → founder_approved by the ACTIVE super_admin →
queued → sent → accepted) succeeded end to end, and the final state carries a
verified approver id.

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
