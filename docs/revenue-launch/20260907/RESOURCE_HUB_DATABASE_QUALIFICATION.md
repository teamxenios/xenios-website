# Resource Hub database qualification — 2026-09-07

**LOCAL PASS — 132 checks, 2026-09-07T22:51:29.026Z.** No production SQL,
migration, account action, notification or external delivery was performed by
this worker. This is database qualification input for A's combined release;
it is not production approval or complete platform qualification.

**Additional PostgreSQL 17 qualification:** the identical 132 checks passed
on PostgreSQL 17.5 / official PGlite 0.4.6 at 2026-09-07T23:05:39.336Z,
exit 0, under the pinned Node runtime. All three SQL hashes and the existing
postcheck fingerprints matched without edits. See
[the complete receipt](resource-hub-pg17-rehearsal.json). This establishes the
tested PostgreSQL 17 catalog/deparser compatibility; it does not establish
exact production 17.6 execution, concurrent sessions or Storage HTTP behavior.

A subsequently executed the complete first-install read-only precheck on
production PostgreSQL 17.6. The single-result receipt at
2026-09-07T23:00:01.215002Z returned PASS and zero Storage client policies:
[production precheck](resource-hub-production-readonly-precheck.json).
The migration remains unapplied and requires fresh checks after new exact
authorization. The original worker's no-production-query statement above
describes that worker; A performed these later read-only checks.

## Source and corrected permissions

Reviewed candidate: `supabase/candidates/20260906120000_research_resource_library.sql`.
The original Fable candidate at `db0e5270afd0e943ae52bb0c84d5c786b92c78e7`
had LF SHA-256 `355843f94af8e52e1b18d4cc540d6e1c8f430de784617acf74ec16110c4b6215`.
A explicitly authorized correcting this **new, undeployed** candidate's ACLs
before the new exact-SHA release decision. The previous account/partner GO is
not reused.

The original candidate depended on creator-specific default privileges. Two
isolated database configurations reproduced the defect:

| Original candidate environment | Observed result |
| --- | --- |
| No project-specific table/function default grants | `service_role` lacked library INSERT and publish EXECUTE. |
| Broad Supabase-style defaults | `anon` retained table TRUNCATE; a local synthetic delivery-table truncate succeeded despite RLS. |

The 18-line correction explicitly revokes all table privileges from PUBLIC,
anon, authenticated and service_role, then grants the service only SELECT,
INSERT and UPDATE on library/versions and SELECT/INSERT on deliveries. It
explicitly grants service EXECUTE on publish/withdraw and makes the immutable
trigger helper non-callable by client/service roles. The trigger still runs
on authorized version updates. The original tables, constraints, RPC bodies,
bucket behavior and application policy remain unchanged.

| Qualified file | LF SHA-256 |
| --- | --- |
| Candidate `.sql` | `6859a8d3b156f99b2f3f205de12e6fe84e3f484e186950543895801352f48633` |
| `.precheck.sql` | `12535e95ef818c0623fa9c442b5428bcfac4d105232372224f8db0f301615630` |
| `.postcheck.sql` | `08bbde3025b691390b3d94f9fbd4e761e63b4c1808fc07261d635753edcc3be5` |

All three paths share the prefix
`supabase/candidates/20260906120000_research_resource_library`.
The companion `.rollback.md` describes flag-off/application recovery with
history preservation, including uncertain-operation reconciliation.

## Reproducible local qualification

Run from the repository root with the pinned Node toolchain and an existing
external PGlite installation; the script installs nothing and accepts no
database URL:

```powershell
& C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe `
  scripts/revenue-launch/rehearse-resource-library.mjs `
  C:/Users/sboad/.codex/tmp/xenios-revenue-pglite-20260905/node_modules/@electric-sql/pglite/dist/index.js
```

The committed script creates two independent in-memory PostgreSQL instances,
one with minimal defaults and one with broad default table/function grants.
Each closes in `finally`; no real identity, bucket or row is involved. The
script prints a timestamped JSON receipt with the full case list and exact LF
source hashes. The executed engine was **PostgreSQL 18.3 / PGlite 0.5.8** under
Node 20.19.0. The local Docker CLI was present, but its Linux-engine pipe was
absent; no native psql/postgres/initdb/pg_ctl executable was on PATH.

Both profiles passed:

- Fresh read-only precheck; incompatible existing table and existing public
  bucket refusal; broad Storage policy refusal; another bucket's exact
  literal policy accepted.
- Corrected migration/postcheck, isolated repeat application, and refusal to
  treat an already applied migration as a fresh first-install precheck.
- Postcheck negative controls for ACL regression, disabled RLS, public bucket,
  and unexpected seeded rows. No negative control is skipped.
- Actual SELECT/INSERT/UPDATE/DELETE/TRUNCATE denials for anon/authenticated
  on all three tables, and publish/withdraw/helper EXECUTE denials.
- Service writes without inherited default grants, immutable storage key,
  content hash, size, resource binding and version number, cross-resource
  publish refusal, valid/idempotent publish, current-version replacement,
  prior-version superseding, withdrawal and withdrawn-version refusal.
- Invalid-validation publish refusal and an induced pointer-update failure
  that rolls back the earlier version update atomically.
- Append-only delivery privileges: service insertion allowed, update/delete/
  truncate refused.

The read-only postcheck pins the complete column and primary/unique/check/FK
definitions, normalized RPC bodies and execution properties, exact effective
client/service permissions, absence of client column grants, immutability
trigger, required indexes, private bucket and zero first-install rows. Its
schema fingerprints are drift checks, not release identity hashes. PostgreSQL
18's separate NOT NULL catalog entries are excluded; nullability is checked
through `pg_attribute`. A catalog-deparser difference on another PostgreSQL
version is a STOP for review, not permission to replace a fingerprint.

## Production prerequisites and remaining evidence

A supplied preliminary read-only metadata receipts from authenticated project
`yvzeduaxbwgcwllhywff`: at `2026-09-07T22:50:31Z`, PostgreSQL **17.6** and all
three Resource Hub tables absent; at `2026-09-07T22:51:17Z`, the Resource Hub
bucket absent and the `storage.objects` policy list empty. This worker did
not repeat those queries. These receipts do not replace the complete fresh
precheck or prove the final postcheck.

The precheck is intentionally first-install-only: any pre-existing Hub
table/index/function or bucket stops it. The migration executor must verify
the authenticated project binding separately; `current_database()` alone is
not a project identity proof. Both checks use `BEGIN READ ONLY` and `ROLLBACK`.
The full precheck also examines `storage.buckets` policies and inherited role
applicability, which the preliminary object-policy receipt does not settle.
Complex client Storage policies fail for explicit policy-specific review;
do not alter unrelated policies or weaken the checker to meet a deadline.

Outstanding before production activation:

1. A's final combined SHA/tree, independent candidate/ACL review, migration
   registration and exact new release authorization naming migration hash,
   flags, included/excluded scope and rollback.
2. Full fresh precheck against the bound production project, then an atomic
   apply with stop-on-error and this exact immediate postcheck. PostgreSQL
   17.6 catalog parity remains unproven by the local 18.3 engine.
3. Supabase Storage HTTP/private-byte behavior and actual application adapter
   compatibility: local storage metadata is synthetic and proves neither.
4. The final production observation and authorized read-only smoke. Local
   single-process PGlite does not prove concurrent-session row-lock behavior.

`RESEARCH_RESOURCE_HUB_ENABLED` remains absent/false until the approved
activation sequence. Keep the already deployed account/partner hardening at
`ff3c496245739233b71e46f9e5d6e26af9d57017` intact. No real content upload,
customer approval, partner activation, email, payment or shipment is included.

Supabase's current documentation distinguishes table privileges from row
policies and explains the separate Storage controls:
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
The current changelog was fetched; no reviewed entry changed the SQL/ACL
features used by this correction.
