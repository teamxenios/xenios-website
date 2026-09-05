# Universal access production compatibility matrix — 2026-09-05

Status: **read-only compatibility evidence; no production apply or deployment
authority**.

The linked Supabase project `yvzeduaxbwgcwllhywff` was re-read at
`2026-09-05T22:43:06.5168+00:00`. The schema artifact is
[`production-account-partner-schema.json`](./production-account-partner-schema.json)
with normalized-LF SHA-256
`9254b6d9b7e8717c42b23e9752cb2eaccf90d43d9f1812d77eac44990d21cf77`.
The read transaction was marked read-only and exported no identity, clinical,
evidence, payment or customer rows.

## Release A candidate dependencies

Release A is the reusable approved-customer and partner-access slice. It does
not include Referral V1 or price activation.

| Candidate | LF SHA-256 | Required production precondition | Expected change |
| --- | --- | --- | --- |
| `supabase/candidates/20260905_research_approved_customer_access.sql` | `026ac29d3e17a86fa19100aa4c712e5d90fd66b2ef5de28774b8032965b171b5` | `research_applications`, `research_members`, application events, notification outbox, and verified `auth.users` columns | Adds approval provenance, normalized-email indexes, `approved_customer` status/access basis, service-only approval/claim authorities, and exact service grants |
| `supabase/candidates/20260905_research_partner_lifecycle.sql` | `4f10c3e996cbe60e660981dc654e89af2d23e209f8252db067cb9a367b4f5bbb` | Canonical partner/member/agreement/training/lifecycle tables | Adds reviewed-evidence columns, idempotent lifecycle event columns/index, service-only lifecycle authorities, and exact service grants |

The matching read-only prechecks and postchecks are pinned as follows:

- Approved customer precheck `f275d2d98c3e5349a619952ba0674202f260f85cff6066ace6a46a5ad8287451`; postcheck `e3d9ef340b3059c8810adad9168d96873a0d9a0f35b692a39ff793f3a53fe065`; rollback note `6b46bba491af31ed8846f430012f5393d35cf36865fb7959d799275b47e22bbd`.
- Partner lifecycle precheck `04ec1bff31b8363f8e816c22bd8d9ad65bf13fa43604bfd8755af377cdae29e9`; postcheck `43a04ae4eb8a6fb5d07ae3bed5b9e946b658308f3e644d48cf11980ea1b4bcf`; rollback note `01468f2309a769de174068d875e89b3e7de71b907bb1036106a8792368f572b5`.

## Observed production state

- All Release A base tables are present and RLS-enabled: applications, members,
  application events, notification outbox/attempts, partners, agreements,
  training, lifecycle events, partner links, attribution touches,
  idempotency keys and rate limits.
- The three approved-customer authority functions are absent.
- The two partner-lifecycle authority functions are absent.
- Existing application status excludes `approved_customer`.
- Existing member access-basis check allows only `paid_membership` and
  `sponsored_b2b`.
- Existing application `country` is non-null; the candidate intentionally
  relaxes this only for an admin-approved customer row whose source is
  `admin_approved_customer`.
- Candidate-added approval provenance, operation/idempotency, and reviewed
  evidence columns are absent as expected before apply.
- Existing partner certification provenance includes `certified_by_admin_id`;
  the application projection requires both certification timestamp and actor.
- Existing public RLS policies are empty in the captured evidence; table ACLs
  and function ACLs must be rechecked by the exact precheck/postcheck during an
  authorized apply window.

## Excluded capabilities

Referral V1 remains excluded because its tables and authorities are absent in
production. The quantity/price candidate is also excluded from Access Release
A; it is a separate purchasing release with candidate SQL LF SHA
`a8d3909335a1fc0ccd8f679ed9b525995464dfd1f0d92957bdfcfbdee650daec` and
separate precheck/postcheck/rollback evidence.

## Rehearsal limits and release boundary

Disposable PGlite rehearsals pass approved-customer 35/35 and partner lifecycle
57/57 checks. They cover idempotency, exact identity binding, expiry,
privileged execution, reviewed evidence, stale revisions and transaction
rollback. They do not establish production object parity, live RLS/ACL behavior,
cross-session concurrency, provider delivery, or a real user's login.

The matrix therefore establishes a **bounded production preflight plan**, not
production readiness. A founder exact-SHA GO is still required before running
the named prechecks against production, applying either migration, changing
grants or constraints, deploying code, approving an account, operating a
partner, sending mail, activating prices, charging, or shipping.
