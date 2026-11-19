# Account source transaction payload — 2026-11-19

This four-path increment is a source-only assembly boundary. It is **not managed-executable**, a connection/apply API, a managed controller, an approval packet or a migration/history registry. No new migration SQL filename is introduced. Root owns the actual provider/migration mechanism and staged action.

The isolated baseline is `ae792657bb8faa8f93cf7effc34e4e9c313f839a`; grant `2026-11-19T06-ACCOUNT-ATOMIC-PAYLOAD-GRANT.json`, existing author/task `EA-ACCOUNT-ATOMIC-PACKAGE-BUILDER-20261119`. Frozen core545 and proof546 sources remain unchanged.

## Defect closed by source

The full canonical prerequisites, foundation and replay previously ran in separate transactions. The foundation and companion each contain an outer `BEGIN`/`COMMIT`. Putting their unchanged text inside another `BEGIN` would not make one atomic unit: a component could commit earlier effects before a later refusal.

`buildAccountInstallationPackage(sources)` accepts exactly five `{path,sql}` inputs, in the fixed reviewed order. It checks each canonical UTF8 length and SHA256 before assembling anything. It normalizes checkout CRLF to LF only; bare CR, BOM, body/whitespace/case changes, extra SQL, wrong/missing/duplicate/reordered paths and caller execution fields refuse with sanitized typed errors.

| Complete immutable input | Bytes | SHA256 |
|---|---:|---|
| `supabase/research-membership.sql` | 3404 | `a5741c2cd9d25e7fec0631e0609cc3e8385f4808026680465ee4a46cf26c46d8` |
| `supabase/research-members.sql` | 1140 | `aa9f6c539f755f08042f90f7799885320e58e2f775f4078fbc6f10cf21b0aded` |
| `supabase/research-orders.sql` | 9246 | `dcac210951410775608f9c0b5413cdcdf054a7741136e1d2844b28375a3c76d0` |
| `supabase/pack02-candidates/20260812_research_account_organizations.sql` | 59747 | `3d9454f7981bb7516efa66e03e19babe00225cb27d871ba155431b5bed6c3eb9` |
| `supabase/candidates/account_history_claim_replay.sql` | 9204 | `84ff901e4947ff239d0115eb739d987d620218cfa4d85020c23370d1d100cff3` |

For the foundation and companion ONLY, the builder verifies `begin;\n` at exact UTF8 byte offsets746 and312, and `commit;\n` at each known EOF. It removes exactly those15 bytes per component. Complete comments, embedded DDL, DO blocks, routine bodies, quoted strings and all other bytes survive. The three prerequisite sources are retained byte-for-byte. One LF separates components. No global SQL replacement or function/DO statement splitting occurs.

## Artifact contract

The frozen result includes `transactionBodySql` (no enclosing transaction), its `bodyBytes`/`bodySha256`, canonical source SHA, and component raw/payload hashes/lengths plus UTF8 body offsets. Each component's source proof is distinct from the transformed body proof. It always reports `status='source_payload_only'`, `managedExecutable=false`, and `transactionRequirement='one_provider_owned_transaction'`. Inputs cannot approve or override these fields.

Independent byte inspection of the pinned inputs gives an expected82715-byte body, SHA256 `318c93ba60d87fd9dcdb145ad2162931eaf6ef54c0ebf7c31ba8f78d482806d5`. This is source arithmetic, not execution of the builder or PostgreSQL; the authored unit case must still qualify the actual implementation against it.

Root must later wrap the body in the reviewed provider-owned transaction that also performs exact target/principal/preimage/ACL checks and truthful existing migration-history recording. The body has no such controller and does not create history. It must not be used as a stand-alone managed script, historical byte-identity claim or blanket reapply operation. Existing `IF NOT EXISTS` core SQL alone does not detect/adopt a foreign core baseline; reuse the qualified catalog/refusal contract in the later owner boundary.

The five still-unresolved contracts are explicit: core ACL, provider-owned transaction/history, managed principal, native event hooks, registered migration identity. `requiresExternalPreimageValidation=true` also makes the omitted catalog-admission boundary explicit. This slice selects no core/browser/service policy, changes no default ACL, grants no production actor privileges and installs nothing. Foundation/replay source guards and exact ACL remain unchanged.

**Empty tables, no seeds and closed new account flags do not make core DDL inert.** Existing mounted legacy application/member/claim/forgot/resend APIs and the expiry sweep are independent of those new flags. The current read-only ACL audit found that a legacy claim can read app/member then create/update Auth before member INSERT; recovery/resend can mail after SELECT alone. Denying INSERT alone would not prevent these effects. Root/Website2 is reviewing the actual first-DB-check/ACL coupling; this builder neither selects that policy nor treats broad inherited core grants as safe activation.

## Authored qualification and limits

Unit cases test immutable source-set refusal, altered inner/outer bytes, checkout normalization, complete inner-byte conservation, stable receipts and absent execution/approval interfaces. These checks do not claim a generic SQL parser.

The owned PG case reuses the existing durable fixture unchanged, forces Docker `postgres:17.11`/actual170011, and uses a dedicated `NOSUPERUSER+BYPASSRLS`, login-enabled, non-createdb/non-createrole/non-replication fixture actor. Its synthetic privileges are explicit: public schema CREATE, Auth/extensions USAGE and REFERENCES(id) on an EMPTY four-column synthetic Auth table with id second. It has no Auth SELECT. Managed-style broad object defaults are set ONLY for that disposable actor before execution. This is an emulated test capability profile, not proof of real managed postgres/Auth privileges or a proposed production grant.

The complete real payload runs inside one caller-owned transaction. An existing foreign partial foundation must cause refusal after attempted core creation, preserve the foreign object, and roll back all core effects. A forced error AFTER the full companion must roll back all19 new tables, six routines and sequence; this would detect a surviving premature component COMMIT. A separate successful owned commit checks empty19-table closure, intended owner/RLS, the actual companion routine, unchanged default ACL/legacy five-column partner sentinel and no new migration history. It explicitly observes retained broad core MAINTAIN rights alongside closed foundation reads and still reports managedExecutable=false.

Synthetic Auth, owned superuser kernel setup and a nonsuperuser surrogate are not live Auth/PostgREST, real installer permission, native Supabase event-hook or full managed parity evidence. No native hooks are disabled, copied, impersonated or declared harmless. The helper's full-core41 scenarios remain separate unchanged evidence. No seeds enter the installation body and no account, organization, partner, rate, payment or mail is provisioned.

All new runtime cases are **UNRUN** at author handoff. Only permitted source AST/hash/diff checks may be reported. Root schedules independent exact-source review and one coherent hosted qualification; no local tests, semantic compiler/build, PostgreSQL, browser, CI, network write or managed action is performed by this author.
