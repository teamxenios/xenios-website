# Credit reservation qualification checkpoint

Recorded 2026-09-10 by the sole integration owner. This is completed local
qualification, not managed/payment-provider acceptance or a production release.
The full Xenios Health operational goal remains active and incomplete.

## Source and scope

- Application: `2604286d9abd4d50aa39a8407a239f8c3b7af4f5`.
- Tree: `951c740d70e8d8117293775e0c356392b6480728`.
- Branch: `codex/xenios-native-finish-20260910`; application pushed and verified.
- Source stayed clean/frozen throughout the following qualification. Subsequent
  checkpoint records do not replace this application identity.
- Contract, migration hashes, permissions, prior failed development runs and
  bounded independent source acceptance are in
  `CREDIT_RESERVATION_CONTRACT_20260910.md`.

## Actual results

All receipts below are under
`C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`.

| Check | Observed result |
| --- | --- |
| Full Vitest, Node 20.19.0, two workers | 16,567 passed, 59 skipped, zero failed; exit 0. One full suite only. |
| Final exact-SQL PGlite rehearsal | 51/51 checks: 11 SQL files, 29 scenarios, eight negative controls, setup/restoration/identity checks; exit 0. PostgreSQL 18.3, one connection. |
| PostgreSQL 17.11 concurrency proof | All 11 SQL files and 11 scenarios passed; 11 server-observed advisory-lock barriers; three independent connections; exit 0. |
| TypeScript 5.6.3, `tsc --noEmit` | Exit 0 on frozen source. No diagnostics; tool execution receipt `520704` recorded `TYPECHECK_EXIT=0`. Empty Tee output did not create a log file. |
| Production build | Exit 0; 2,299 client modules. Existing mixed-import and chunk-size warnings remain; no warning suppression. |
| Route uniqueness | 440 registrations / 431 call sites; exit 0 on the clean application worktree. |
| Core-site protection | ff3c496..2604286: PASS; 28 protected hashes verified; exit 0. |
| Strict release-diff scan | ff3c496..2604286: PASS; 82,312 added lines / 449 files, 105 raw/reviewed synthetic matches, zero unresolved secrets, zero bounded name-list findings. |

The approved private V3 remains unchanged and outside Git: 131 bytes, SHA-256
`27fb9d7052867808f8cee5f3147fa34855fad0d893a6a14508b9212198ce4fbb`.
Existing scanner policy and the accepted 2578d9c fixture/context registry remain
unchanged. Its historical/team/handwriting coverage limitations still apply.

## Independent-connection database evidence

Main initialized a new synthetic-only local PostgreSQL cluster after confirming
the exact directory did not exist and port 15437 had no listener. It was bound
only to `127.0.0.1:15437`; no system service or provider database was changed.

- Cluster: `postgres17-runtime/credit-qa-cluster-20260910` under the evidence root.
- Database/user: `xenios_credit_qa_20260910` / `xenios_credit_qa`.
- PostgreSQL: 17.11; database OID 16384; system identifier 7684016671943266632.
- Driver: `credit-concurrency/pg17-credit-proof.mjs`, LF SHA-256
  `b20a4d2b04432fee38478d9a28ee7928f64ce5e2f99746d6ec3235cb368f2271`.
- First attempt safely refused identity before any SQL file/scenario/write:
  PostgreSQL's inet text included `/32`. Only the IP projection was corrected
  to `host(inet_server_addr())`; exact endpoint checks were not relaxed.
- Second attempt required pinned Git/file hashes, exact local cluster identity,
  empty schema, no unrelated clients and distinct backend PIDs. Each scenario
  observed its exact waiter/blocker in `pg_stat_activity` and `pg_locks` before
  releasing the competing transaction. Fixed sleeps were not pass evidence.
- Worker operations used `service_role`. Fixtures and observation used the
  isolated local bootstrap owner; this does not establish managed-role parity.
- Verified competing reservation commit/rollback, duplicate 23505, independent
  members, atomic capture balance, duplicate capture, both legacy-spend race
  directions, owned cancellation, negative adjustments and reversal refusal.
  The capture cases prove exactly one order-bound debit and one canonical event.
- `/root/native_finish_review` independently accepted final driver and receipts
  at 2026-09-10 21:13:29 UTC. No worker self-issued execution acceptance.
- Driver closed its connections. Main then stopped only this cluster via its
  exact data directory; exit 0 and port no longer listening. Synthetic database
  files and both receipts are retained, not deleted or reset.

Runtime acquisition provenance and limitations are in
`postgres17-runtime/ACQUISITION_RECEIPT.md`: official PostgreSQL-to-EDB ZIP chain,
locally hashed archive, unsigned Windows binaries, no independently observed
vendor checksum. Do not call it signature-verified.

## Immutable receipt hashes (SHA-256)

| Relative receipt | Hash |
| --- | --- |
| `full-suite-2604286.json` | `dec76aa2855e730b7b5cc469b78c036b7dfa1e632ca32aac8e7bb33f7de15fab` |
| `strict-scan-2604286.json` (text receipt) | `4f9a636066f73188dc394f74b23b736c3dfe53bda569e9c71a9065f68fc5cd8e` |
| `credit-sql-2604286-final.jsonl` | `0888280d86b36c75a869c605ea76d1903bd51ac31e1e14daaf16caff8f5d04f4` |
| `build-2604286.log` | `f9d5ee5d218a7bc49825b772b2f2cd2d2e8201a6dcb4f5cbd06b17c72cb765cf` |
| `protection-2604286.log` | `ab51c2684c6c0ed0e70a3ebfed2f0bb6493c33b4c931a05707f1e85e36ba2bae` |
| `routes-2604286.log` | `68701fbff77d2017a19d11fddf3a794bc060de298aec38a7b249183dc93faf79` |
| `credit-concurrency/pg17-credit-proof-2604286-first.jsonl` | `ad1e48ce2e43a1a17f25cfa0a0d8b7d4c242d9163e0d7d744e886f91f213645f` |
| `credit-concurrency/pg17-credit-proof-2604286-second.jsonl` | `a417a2b7861cae4e33d0585f31dbfb1f28eeaa7b282e4d14ef02b9f02cf013b3` |
| `postgres17-runtime/cluster-stop.log` | `3589d2bd01f8295cc7c9ec3f5e07625fcd347ccb6f33f2d80edafe5f5217c1fb` |

## Remaining dependencies and next work

Staging `tetynodzrtmdbuzgboro` was again observed ACTIVE_HEALTHY, but a fresh
supported read-only `select 1` at approximately 21:03 UTC returned connection
timeout. This proves neither schema parity nor a credential defect. No restore,
reset, SQL write, migration replay or production fallback occurred.

Approved checkout-specific staging fixtures/effects and a restricted test-mode
provider configuration remain necessary for actual managed/provider/browser
qualification. Resource Hub effects do not authorize checkout effects.

Next build remains with the main integration owner: canonical credit policy/
consent and existing receipt/recovery operational integration, then remaining
full-credit/refund/expiry requirements with explicit business policy. No feature
is silently enabled by a local test. No production migration, deployment, flag,
real payment, account change, email, shipment or clinical action occurred.
