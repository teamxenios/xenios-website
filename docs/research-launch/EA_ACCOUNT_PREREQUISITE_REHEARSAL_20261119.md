# Owned canonical account prerequisite rehearsal — 2026-11-19

This is test source, not a managed installer, migration, ACL-policy decision or activation packet. No managed schema, data, history, role, configuration, mail or deployment action is authorized by this document.

The isolated source baseline is `a1f544af3c41ef96457ea11fe02cbe71ff95b3dc`. Root's actual three-path grant is `.xenios/handoffs/2026-11-19T05-CANONICAL-CORE-REHEARSAL-GRANT.json`, later checkpointed in `24d641604f95afcf06f796c09c998e84898b97f5`. The original source-author task/ownership continues; frozen releases541/542 are unchanged.

## Why the fixture changes

The read-only prerequisite audit at `C:/Users/sboad/projects/ea-account-foundation-convergence-20261119/PREREQUISITE-READINESS-HANDOFF-20261119.md`, SHA256 `1af8ea65eb17bed975b794576a1242fcb246c3608c2efb6022353151ddcd4c59`, found all eleven canonical prerequisite tables absent on staging. Production has an evolved125-column family, not the112-column original footprint, with existing relationships, routines and partially unresolved historical provenance. Neither situation justifies creating bare member/order placeholders or replaying a broad historical bundle.

The previous qualified41-case foundation fixture used minimal application/member/order anchors. This increment replaces them, in both main and fresh subfixtures, with the complete pinned membership2/member4/orders22 sources. Existing Auth-provider/PostgREST inputs remain synthetic. The owned Auth model keeps the observed `id` at physical column2; it is not a reconstruction of managed GoTrue or proof of live sign-in.

## Complete immutable inputs and order

| Source | LF Git-blob bytes | SHA256 |
|---|---:|---|
| `supabase/research-membership.sql` | 3404 | `a5741c2cd9d25e7fec0631e0609cc3e8385f4808026680465ee4a46cf26c46d8` |
| `supabase/research-members.sql` | 1140 | `aa9f6c539f755f08042f90f7799885320e58e2f775f4078fbc6f10cf21b0aded` |
| `supabase/research-orders.sql` | 9246 | `dcac210951410775608f9c0b5413cdcdf054a7741136e1d2844b28375a3c76d0` |

The loader only normalizes checkout CRLF to LF, then checks byte length and SHA256. It does not trim comments, extract table snippets, modify the actual scripts or substitute Track B/billing/B2B/activation sources. Actual execution includes the complete three files, in applications/events → members → eight-table orders order. The two pinned `CREATE EXTENSION IF NOT EXISTS pgcrypto` statements remain; the owned kernel must already have pgcrypto.

The orders source stores member UUIDs without a member-table FK. The member source stores a nonnull unique Auth UUID without an Auth FK. The fixture preserves those real contracts instead of adding invented dependencies. The refund idempotency primary key is text `scope`, not UUID.

## Owned-only controller and catalog proof

`account-prerequisites.pg.fixture.ts` creates and closes over the existing owned-loopback database fixture; it accepts no managed URL, client or credentials. Existing literal loopback/resource fences and the approved closed16/17.6/17.11 image/version selection remain unchanged.

The core bootstrap requires all eleven relation names, generated primary/unique names and explicit index/constraint names absent. Existing, partial, foreign or evolved baselines refuse without adoption or repair. Within its own explicit transaction it:

1. Builds empty temporary reference relations from complete hash-pinned source, changing only their temporary namespace/index names and extension no-ops. Reference transformations require exactly11 table declarations/closings and12 explicit indexes. No reference data or persistent authority is created.
2. Executes the complete original files into public without changing them.
3. Compares every column's type/nullability/default/identity/collation, every PK/unique/FK/CHECK and associated attributes, and all index keys/operator classes/collations/predicates/sort/uniqueness/validity against native-parsed source expectations. It checks ordinary owner/RLS state, no inheritance/partitions/policies/rules/user triggers, exact28/10/9/4/7/17/8/9/5/12/3 column counts, and all eleven domain tables empty.
4. Observes the known broad fixture default ACLs and verifies the pinned sources did not change default-ACL policy. The expected broad privilege set is obtained from native owner defaults, so PG17 `MAINTAIN` is observed rather than guessed away.

After core DDL commits, separate owned rollback-only probes confirm RLS is active for anon/authenticated and that valid application insertion is denied. An unexpected allowed probe explicitly rolls back and fails the test; it cannot persist a row. Empty-domain counts are checked again before any synthetic Auth/application/member seed. The original five-column legacy partner sentinel is deliberately pre-existing external fixture state and remains byte-for-metadata/data unchanged through core and foundation work.

The historical core files have no explicit GRANT/REVOKE policy. Their broad inherited anon/authenticated/service-role table privileges are retained and reported here; RLS/no-policy row denial is a separate measured boundary. No new production least-privilege policy, Data API exploit conclusion or managed-hook acceptance is implied. The owned kernel does not recreate managed extension placement or the platform's native event triggers. The later managed package still needs its explicit reviewed ACL boundary and native platform-event-trigger compatibility.

## Required fields and adversarial identity semantics

Synthetic application seeds now supply canonical unique email, first/last name, nonnull country and an allowed status; member seeds supply their canonical application, unique Auth binding/email, first name and status. All eleven tables are proved empty before these test identities are seeded. No real company, credential, role, payment, provider event or request is provisioned.

Both synthetic verified Auth actors intentionally still report the SAME email, testing that email cannot transfer another actor's claim. Their canonical application/member rows use distinct unique emails, and both real member bindings remain present. Duplicate canonical member/application emails are explicitly rejected by actual uniqueness constraints. The original same-email second-Auth-account denial and zero-commit-RPC assertions remain; no uniqueness constraint is removed and the second member is not omitted to make denial easier. This adversarial provider input is not a claim that managed GoTrue permits duplicate verified addresses.

## Retained controls and transaction limits

All41 existing foundation/replay cases and their negative controls remain, with the original strict image selectors, Auth-id-second/wrong-column FK proofs, scopes, exact receipt/retry/expiry/lock behavior and protected replay companion. The fresh subfixture adds core-name/foreign-index refusal and a real DDL-trigger wrong-order-default sabotage to prove the core transaction rolls back its full11-table footprint without repairing foreign state. The first case also proves an already populated core cannot be silently re-adopted.

Transaction boundaries are deliberately separate: owned-kernel startup; atomic owned core bootstrap; rollback-only RLS probes; synthetic test seeds; foundation installer transaction; replay companion transaction. A later foundation failure leaves the already committed core in the owned database. This is not an atomic combined managed installer or an apply/uncertain-result/rollback controller. Production's evolved baseline/history, staging's missing real prerequisites, native platform hooks, release activation and the reviewed closed registrar remain Root-owned work.

## Qualification

New source/cases are authored and **UNRUN** at author handoff. Only permitted source AST/hash/diff checks may be reported separately. Root owns independent exact-source review and coherent hosted execution of the same41 cases on PG16, exact17.6 and exact17.11. Previous a1 qualification does not qualify this changed prerequisite fixture. No local heavy test, compiler/build, PostgreSQL, browser, CI or managed action is performed by the source author.
