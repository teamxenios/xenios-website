# Durable recovery operation — bounded local qualification

Application: `55b9a5048d624c92e84b6cc62e1d644026bf7f3c`.
Application tree: `5ee3d4136caaea6a1a6697a049c3f4983dabac40`.
Parent: `0fcac22c9a0861e3b4fa89be6f56c20dcbef5692`.
This application was pushed and independently read at that exact identity.
Later evidence records do not change the application target.

## Implementation and boundaries

One bounded operation persists intent before unattended settlement and atomically
records a closed outcome plus its original discovery cursor afterward. An
interruption resolves the pending intent against canonical execution identity
before discovering new work, including an already-terminal execution no longer
returned by discovery. Lost acknowledgements cannot become reported completion.
Persisted skips remain skips. A fixed horizon, exact microseconds, owner/lease and
decimal-string fencing token survive restart. Exhaustion is explicit and checked
against actual database discovery.

The injected RPC adapter refuses malformed input, response envelopes, identities,
timestamps and error-bearing successes. It does not resolve credentials or start
a client. The operation defaults disabled before acquiring any lease and receives
only unattended settlement, not normal checkout or notification capabilities.

The candidate was named by Supabase CLI 2.116.0 in an isolated scaffold:
`supabase/candidates/20260910220129_research_checkout_recovery_operation.sql`.
It uses two fixed operational namespaces in the existing private idempotency
table, not its unsafe once() producer helper. Existing executions, orders, credit
and reservations remain the sole financial authority. The RPC is SECURITY
INVOKER, service-role-only, with explicit minimum table grants and existing RLS.
No migration history, managed database or production configuration was changed.

## Actual checks and retained failures

| Check | Actual result |
| --- | --- |
| Worker operation tests, before main corrections | 88 passed. Synthetic ports only. |
| Worker RPC adapter tests | 228 passed, including installed SDK serialization through a network-denying fetch stub. |
| Final commerce and credit-policy run | 2,224 passed, three skipped, zero failed; exit 0. Includes 91 operation and 228 adapter tests. |
| First typecheck | Failed TS2339 on claim.state union narrowing. Main corrected the refusing branch without relaxing validation. |
| Final typecheck | Exit 0, including actual SDK type compatibility. |
| Production build | Exit 0; 2,299 client modules; existing chunk warning retained. No activation implied. |
| First SQL contact | 15/15 passed; 12 exact SQL files and first metadata case. |
| Expanded SQL author run | 65/65 passed; 12 files and 51 scenarios. |
| Main final SQL/contact run | 66/66 passed, including all 51 SQL scenarios and six engine/adapter/SQL contact cases; database closed. |
| Strict scan ff3c496..55b9a50 | Exit 0; 87,242 added lines / 471 files; 106 reviewed fixture findings, zero unresolved secrets, zero bounded name matches. |
| Core-site protection | Exit 0. Protected runtime/seam hashes unchanged. |

Two main contact runs failed at the same final cursor assertion. The fixture's
to_char timestamp used +00, while actual database JSON/discovery used +00:00.
The test now compares the final cursor byte-for-byte to the persisted begin
literal. Runtime and compiled-bundle hashes did not change for this correction.
Both failures remain recorded; they are not relabeled as passes.

SQL review corrections before the first executed proof reject malformed stored
outcomes on duplicate completion and reject infinite lease timestamps. Negative
controls retain both. Postchecks individually require SELECT, INSERT and UPDATE
because PostgreSQL's comma-separated privilege query accepts any listed grant.
Main also aligned pending committed-phase refusal and rejected unknown operation
options/explicit null limits before any effect.

Pinned Node 20.19.0, TypeScript 5.6.3 and Vitest 4.1.10. One heavy run at a time.
The approved 131-byte V3 hash and accepted 545c39e fixture registry/context were
verified unchanged; no names, matching text or raw private findings are stored here.
Full-suite results from older applications retain their original source identity.

## Independent acceptance and scope limits

`/root/native_finish_review` independently accepted the exact application runtime,
adapter, contract and candidate SQL/pre/post/rollback source. Main reviewed the
worker's complete SQL rehearsal and executed its final successor through the
contact proof. Neither worker self-issued required acceptance of their own code.

PGlite 0.5.8 / PostgreSQL 18 is disposable and single-connection. Expiry fixtures
are explicit synthetic timestamp edits, not a real-time/multi-session lease
proof. Contact tests use the actual operation/adapter/SQL and service_role RPC,
but a local execution-read mapping and synthetic terminal update, not the real
financial executor, PostgREST, provider or payment settlement. Managed PostgreSQL
17 and approved connected effects remain separate qualifications. Real local
multi-connection contention is recorded below. No notification, payment, shipment or production action
occurred. The full Xenios Health goal is still active and incomplete.

## External receipts

Under `C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`:

| Receipt | Raw SHA-256 |
| --- | --- |
| recovery-operation-contact-first.jsonl | ff9abce54801c59325dbdc20b19c3c5e74cec2e9e9f38fa56178e8d880107e3c |
| recovery-operation-contact-diagnostic.jsonl | 18aabc652511a08fb398b89d1e22271c56bc8d607435a89259ef4344e2285bcb |
| recovery-operation-contact-final.jsonl | 5139d037145ff6c5c9fa05e86d12d1f24b8668b8c98ce71ccc39eef8912f7887 |
| recovery-operation-sql-second.jsonl | 60e9d691c6c71a3b25b64d432551e1a1fded5350c96eabd50cfdd72f048f5058 |
| commerce-recovery-operation-final.json | 2fdc8ad93c3ea74667189bbd203fbfdc77772ec2aff7522a22c3bf4f15e1fa06 |
| build-recovery-operation.log | 8605c959c177e2740909326798938e4dad837ce84f0b4acf468d6d037bebb4ee |

Strict raw output remains restricted outside Git at
`C:/Users/sboad/.codex/private/xenios-privacy-input-v3-20260908/recovery-operation-scan-55b9a50.log`.

## Real local PostgreSQL 17 contention proof

Main verified the preserved task-owned cluster was stopped, restarted it, and
created only the previously absent `xenios_recovery_qa_20260910` database. Its
OID is 17457. PostgreSQL 17.11, cluster system ID 7684016671943266632, user
xenios_credit_qa and loopback 127.0.0.1:15437 were verified before writes. The
old credit QA database was not changed or reset. Existing cluster roles were
verified, not recreated or expanded.

The external script was authored by product_review_filters, read completely by
main, then executed once: exit 0, all 15 exact SQL inputs passed, all five cases
passed, and four actual PostgreSQL transaction-lock barriers were observed over
three independent connections. Cases cover first-claim winner/busy, begin and
complete serialization, expired takeover with stale-owner refusal, atomic
rollback after outcome insertion, and disconnect-before-commit rollback.
Expiry uses an explicitly disclosed edit to a synthetic lease timestamp. It
does not claim a 120-second clock-expiry observation.

The independent reviewer native_finish_review accepted that exact script and
receipt after checking source identities, real lock observations and retained
state. It did not rerun the mutating proof or self-accept its own artifact.

Every case checked the same unchanged nonempty financial snapshot. The final
read-only check found one released control row, fence 2, no pending intent,
four operational outcomes and zero other clients. Main stopped the exact local
cluster and verified it no longer ran. All committed fixtures and an inert,
opt-in local fault trigger remain in the dedicated database for inspection.
The initial PowerShell launcher used Start-Process -Wait, which waited on server
descendants and delayed its subsequent psql check until after shutdown; that
late check exited 1 (connection refused). Separate actual identity/preflight,
qualification, postcheck and shutdown commands succeeded. No success is inferred
from the launcher wrapper.

External proof under `recovery-concurrency/`:

- `pg17-recovery-proof.mjs`: 0cc2fd572cb7f721f2acf9a8730e0afc1b9215aa2cc5e26a9924e9f4e8a5e36b.
- `pg17-recovery-first.jsonl`: e683d746293e4bb4c97e22b0e7486f3e4b7490f3354b28aefe8198cc8d59d249.

Direct PostgreSQL is not managed Supabase/PostgREST/pooler or provider proof.
This script deliberately refuses rerunning against the now nonempty database;
preserve its data and use an explicitly reviewed continuation for any new proof.

Next: the explicitly gated one-pass operational composition and real-executor
contact. Do not install the candidate remotely or start recovery
effects until the applicable environment, candidate and effects are authorized.

The Supabase skills informed the explicit service-role-only grants, separate
RLS checks and short database transactions; no lock is held across a provider call.
