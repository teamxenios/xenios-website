# KAN-31 B4 read-only snapshot, third attempt: query ran, input gate refused, no rows compared

**CHANGES REQUIRED (environment pin), not a data failure.**

- **What happened.** The query executed on staging and returned its envelope with `input_valid:false`, `pass:false`
  and `cases:[]`.
- **What that means.** The gate refused before any request row was compared. **Persistence is still neither proven nor
  disproven.**
- **What did not cause it.** Every gate fed by the bindings payload passes when evaluated offline. The refusal must
  come from the environment guards.
- **The approval is consumed.**

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only. No SQL executed by the reviewer.

## Receipts

Core handoffs in `C:/xenios-wt/tc25-app-manifest-20261012/.xenios/handoffs/`. The files are not yet committed, and I
read the working-tree bytes:

- **`2026-10-17-b4-sql-desktop-reconnected-consumed.json`** (799 B, `000bd0f3…`). Reservation marked at 19:58:07Z,
  before the call. Connector `supabase-staging-readonly`, project `tetynodzrtmdbuzgboro`, read-only, query `1784c8a5`,
  the three bindings verified, and the two earlier failures preserved.
- **`2026-10-17-b4-sql-desktop-reconnected-actual-response.json`** (2,483 B, `16a3a295…`).
  - The call ran 19:58:14–19:58:15 UTC: 1 call, 0 retries, 0 probes.
  - **A database result was returned** (wrapped as untrusted data by the connector).
  - The `hosted_fixture_postcheck` envelope contains: `pass:false`, `input_valid:false`, `cases:[]`,
    `run_id 39053887716`, `source_sha 8efa9a9e`, `source_tree 0c92fdc6`, `bindings_sha256 683fc21b…`,
    `frozen_manifest_sha256 36802f25…`, `expected_project tetynodzrtmdbuzgboro`, `expected_cases 3`, and
    `operational_staff_read_proved:false`.
  - Rollback was not separately confirmed. The batch is `BEGIN READ ONLY … ROLLBACK`, so it carries no write risk.

## Diagnosis

In the template (`a58aace0`), `input_valid` is `input_gate.ok`, a single `AND` chain:

- **Environment guards:** `current_user = 'postgres'`, `session_user = 'postgres'`, `current_database() = 'postgres'`,
  `server_version_num = '170006'` and `transaction_read_only = 'on'`.
- **Then the payload guards:** the JSON gate (no duplicate keys, depth below 32), size, hashes, exact key sets, string
  types, metadata equality, three distinct labels, UUIDs and references, per-case keys, `public_reference` =
  `XRI-` + UUID, `pending_review`, the `created_at` format, `sha256(expected_json)`, and the detail keys
  `contact`/`agreements`/`lines` with their bounds.

**I evaluated every payload guard offline against the exact `B4_BINDINGS.json` (`683fc21b`), and all pass.** Maximum
depth is 3, there are no duplicate keys, all three cases are valid, and the hashes match. The returned envelope also
echoes the right `bindings_sha256`, manifest and run ID.

The refusal must therefore come from an environment guard. **The most likely one is the role:** Supabase's read-only
MCP mode runs queries as a dedicated read-only role, not `postgres`, so `current_user`/`session_user = 'postgres'`
would fail. The server version is the second candidate.

Root's 10178 said the role and version guards were "preserved, no new probe", based on historical evidence. That
history evidently did not come from this read-only connector.

**Design gap.** The query collapses all guards into one boolean, so it cannot say which guard failed. This run produced
a result but no diagnosis.

## Required correction

1. **One approved metadata-only read** through the same connector, read-only, touching no table data:
   `SELECT current_user, session_user, current_database(), current_setting('server_version_num'),
   current_setting('transaction_read_only');`
   - It needs Samuel's approval, but it reads no customer or request data.
   - Its result names the actual role and version.
2. **A successor template** with these changes:
   - Pin the **observed** role, database and version values. The read-only role is acceptable, and arguably better,
     provided `transaction_read_only = 'on'` holds.
   - Change nothing else.
   - Emit each environment guard and the overall payload guard as separate named booleans in the envelope. The values
     are not sensitive, and a future refusal then names its cause.
   - Re-populate with the same four substitutions and the same bindings `683fc21b`. I review the new template and
     populated hash before any run.
3. **Samuel gives a fresh one-call approval** for the successor query. I review the raw per-case results.

The browser acceptance (Doc 240) stands. Staging stays closed, and staff read-back stays separate.

NOT LIVE. No SQL executed by the reviewer. No production change.
