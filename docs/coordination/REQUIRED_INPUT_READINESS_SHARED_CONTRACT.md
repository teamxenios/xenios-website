# Xenios Required-Input and Readiness Shared Contract

Owner: Website 2

Status: focused candidate; production application prohibited until independent
review accepts an exact frozen SHA

Branch: `integration/required-input-readiness`

Dependency: deployed canonical pre-launch contract
`3859e799abb9a7a307b13ca1e8a6a5d252abbc5e`

This is the single shared model for first-principles business inputs, readiness
manifests, and controlled launch transitions. Domain sessions must not copy it,
invent another readiness percentage, or implement browser-authoritative launch
flags.

## Required-input object

The shared type is `shared/research/required-inputs.ts`. Every item records:

- canonical key and domain;
- team-facing label, description, and why the fact is required;
- exact record type, optional record ID, and field path;
- current state and blocking level;
- responsible pre-launch role;
- verification method and evidence list;
- direct, record-reference, or external-secret entry mode plus an explicit
  ordinary/sensitive-reference classification;
- entry/review metadata, public launch impact, and next action;
- optimistic version and append-only audit history.

Allowed states are `missing`, `entered`, `under_review`, `verified`, `rejected`,
`expired`, `superseded`, and `not_applicable`.

An input cannot move directly from `missing` to `verified` or
`not_applicable`. It must be entered, submitted for review, and verified,
rejected, or marked not applicable by a different immutable Supabase user ID.
Rejected or expired facts become blocking again. Audit records reject UPDATE
and DELETE.

## Secret boundary

`external_secret` inputs never store or return a value. They store only an
uppercase configuration name such as `PAYMENT_PROVIDER_KEY`. Every definition
has an explicit value-sensitivity classification, and the API/database also
inspect all semantic definition fields so a record such as `api_credentials`
cannot be misclassified as direct storage. `recordId` and `record_id` are
normalized to the same canonical identifier before sensitivity enforcement;
conflicting aliases fail closed. Secret values remain in the approved
environment-management system.

## Readiness manifests

Each domain launch control binds review to:

- a positive manifest version;
- a server-computed 64-character lowercase SHA-256 over the canonical active
  definition serialization;
- an exact expected required-input count;
- explicit software-complete state;
- administrator, time, reason, and optimistic version.

The scorecard reports software completion separately from real inputs required.
It does not use a vague readiness percentage.

## Launch transitions

The canonical sequence is:

`internal_build` → `internal_review` → `ready_for_real_data` →
`real_data_entered` → `release_review` → `public_enabled`

`paused` and `disabled` remain controlled recovery states. The browser only
requests a transition. The server function refuses `public_enabled` unless:

1. software is marked complete;
2. the stored manifest hash exactly matches a fresh server recomputation;
3. expected input count is positive;
4. actual non-superseded input count exactly matches the manifest;
5. every non-informational input is `verified` or reviewed
   `not_applicable`.

No domain is created or enabled by the migration.

## Admin routes

All routes use the deployed persisted pre-launch role registry and immutable
verified Supabase `auth_user_id`; seed context is prohibited. Reads allow the
approved governance roles, definition/entry requires the responsible domain
role or an elevated internal role, resolution requires
`approved_internal_reviewer` or a distinct `super_admin`, and manifest/launch
changes require `super_admin` or `internal_team`:

- `GET /api/admin/research/required-inputs`
- `POST /api/admin/research/required-inputs`
- `POST /api/admin/research/required-inputs/:id/transition`
- `GET /api/admin/research/readiness/:domain`
- `PUT /api/admin/research/readiness/:domain/manifest`
- `POST /api/admin/research/readiness/:domain/transition`

The Xenios-native dashboard is `/admin/research/required-inputs`. It includes
loading, unavailable, empty, populated, validation, and retry behavior, exact
labels, progressive admin forms, responsive wrapping, keyboard labels, and one
primary action per workflow.

## Migration

`supabase/research-required-input-readiness.sql` creates only:

- `research_required_inputs`
- `research_required_input_audit`
- `research_domain_launch_controls`
- `research_domain_launch_audit`

All four tables use forced RLS, have no policies, and revoke table authority
from `public`, `anon`, and `authenticated`. Only the service role may execute
the six reviewed governance functions. The migration inserts no required
input, manifest, role, namespace, provider, product, member, financial,
clinical, or other operational record.

The disposable PostgreSQL 16 proof applies the migration twice, proves secret
value rejection, explicit sensitive-definition rejection, exact state
sequence, independent verification/rejection, stale same-count manifest
rejection, recomputed-manifest launch, append-only audit, 4/4 forced RLS, zero
browser table/function grants, and transaction rollback to zero rows.

## Domain adoption rule

Website 1, 3, 4, and 5 must wait for Website 2 to return an independently
accepted exact contract SHA. Domain application may then define only real
domain requirements and validators on focused branches. It must not add seed
records, enable a public feature, change the shared state machine, store
credentials, or create a parallel required-input table.

Website 6 verifies public redaction, rejected/expired fail-closed behavior,
server-only launch authority, mobile/accessibility, and exact domain isolation.
