# Client-account candidate migration — disposable rehearsal evidence

Rehearsed: 2026-08-27, by the release-integration session on branch
`integration/xenios-client-account-final-rc-20260826`.

- Candidate file: `supabase/candidates/20260826_research_client_accounts_blitz.sql`
- Target status: **STILL UNAPPLIED** to production and to every shared staging
  environment. This document records a rehearsal, not an application.
- Rehearsal environment: disposable Docker container `postgres:15-alpine`
  (PostgreSQL 15.19 — Supabase's PG 15 major), fresh databases `rehearsal1`
  and `rehearsal2`, destroyed after the rehearsal. The Supabase role model was
  mirrored first: `anon` and `authenticated` as plain nologin roles,
  `service_role` as nologin **BYPASSRLS**, plus a `rls_probe` role (grants but
  no bypass) to demonstrate forced RLS directly.

## Result summary

| Check | Result |
|---|---|
| Syntax / clean apply on fresh PG 15 | PASS — single transaction, `COMMIT` reached |
| Extensions | PASS — none required (`gen_random_uuid()` is built in on PG ≥ 13) |
| Creation order / FK order | PASS — batches → staging → interests → invitations → audit |
| RLS enabled AND forced, all 5 tables | PASS (`relrowsecurity = t`, `relforcerowsecurity = t`) |
| Zero policies | PASS (`pg_policies` count = 0 across all 5) |
| anon / authenticated privileges | PASS — no grants at all; direct reads answer `permission denied` |
| service_role verbs are the minimum | PASS — batches I+S; staging I+S+U; interests I+S+U+D; invitations I+S+U; audit I+S |
| Forced RLS demonstrated | PASS — a granted role WITHOUT bypassrls sees 0 rows through zero policies |
| Invitation founder-approval constraint | PASS — `founder_approved`/`queued` without `approved_by`+`approved_at` is unrepresentable on INSERT and on UPDATE; draft is fine; advancing with an approval record succeeds |
| Append-only activation audit | PASS — service_role UPDATE and DELETE both `permission denied`; INSERT+SELECT work; malformed `group_id` refused by CHECK |
| Import idempotency | PASS — duplicate `(batch_id, normalized_name_key)` refused by the unique constraint; malformed batch ids, emails, states, and interest keys refused by CHECKs; valid enrichment UPDATE succeeds |
| Staging delete containment | PASS — service_role holds no DELETE on staging; purge remains a separately governed step |
| Rerun behavior | PASS — the preflight raises `client-accounts blitz: one of the target tables already exists; reconcile before applying`, the transaction aborts to `ROLLBACK`, and previously staged data is untouched |
| Migration failure behavior (atomicity) | PASS — with one target name pre-created on a fresh database, the whole apply aborts and creates **nothing** (only the decoy table remains) |
| Rollback | PASS — dropping the five tables in reverse dependency order succeeds in one transaction (nothing else references them), and a re-apply afterwards succeeds |

## Exact evidence

Apply (fresh `rehearsal1`): every statement of the file executed and the
transaction committed (`BEGIN … 5×CREATE TABLE … 10×ALTER TABLE …
5×REVOKE … 5×GRANT … COMMIT`).

Structure query output (abridged, all five tables):

```text
relname                                     relrowsecurity  relforcerowsecurity
research_client_import_batches              t               t
research_client_import_staging              t               t
research_customer_account_invitations       t               t
research_customer_product_interests         t               t
research_product_activation_overlay_audit   t               t
policy_count = 0
grants: service_role only —
  research_client_import_batches            INSERT,SELECT
  research_client_import_staging            INSERT,SELECT,UPDATE
  research_customer_account_invitations     INSERT,SELECT,UPDATE
  research_customer_product_interests       DELETE,INSERT,SELECT,UPDATE
  research_product_activation_overlay_audit INSERT,SELECT
```

Founder-approval constraint (three refusals, one success):

```text
INSERT state='founder_approved' (no approval)  → ERROR: violates check "invitation_requires_founder_approval"
INSERT state='queued' (no approval)            → ERROR: violates check "invitation_requires_founder_approval"
UPDATE draft → 'queued' (no approval fields)   → ERROR: violates check "invitation_requires_founder_approval"
UPDATE draft → 'founder_approved' with
  approved_by='Samuel', approved_at=now()      → UPDATE 1
```

Append-only audit as service_role:

```text
INSERT verbal_confirmation_recorded → INSERT 0 1
UPDATE recorded_by                  → ERROR: permission denied for table research_product_activation_overlay_audit
DELETE row                          → ERROR: permission denied for table research_product_activation_overlay_audit
```

Rerun refusal (applied database):

```text
ERROR:  client-accounts blitz: one of the target tables already exists; reconcile before applying
CONTEXT: PL/pgSQL function inline_code_block line 8 at RAISE
... ROLLBACK — staged row count afterwards: 1 (unchanged)
```

Failure atomicity (fresh `rehearsal2`, decoy `research_product_activation_overlay_audit` pre-created):

```text
apply → preflight ERROR → ROLLBACK
public tables afterwards: research_product_activation_overlay_audit   (the decoy only; zero partial objects)
```

## Caveats an applier should still hold

1. This rehearsal ran on vanilla PostgreSQL 15 with a **mirrored** role model.
   On real Supabase the same roles pre-exist with platform defaults (including
   `service_role`'s BYPASSRLS) — behavior should match, but the applier should
   re-run the structure queries above post-apply as acceptance.
2. Supabase projects may carry `ALTER DEFAULT PRIVILEGES` that grant broader
   verbs to `anon`/`authenticated`/`service_role` on **newly created** tables.
   The candidate's explicit `REVOKE`s cover anon/authenticated, but the
   post-apply acceptance query on `role_table_grants` is the check that the
   deployed grants equal the table above — run it, don't assume it.
3. Application remains founder-gated and must be registered in
   `supabase/MIGRATIONS.md` and the migration DAG at apply time (both were
   deliberately not touched by this branch).
4. The synthetic rehearsal data ("Synthetic Person") never left the container;
   the container and both databases were destroyed after the rehearsal.
