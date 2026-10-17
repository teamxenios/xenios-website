# KAN-31 B4 populated read-only SQL snapshot, and its connector authentication failure

**Populated query ACCEPTED for one execution: exact bytes `1784c8a5665db17dcea0c549664f3ddd84b98615d505405c8510539c50b33085`**
(29,104 B).

**Failure receipt CONFIRMED.** The single approved call (founder 10176) failed at connector OAuth token refresh,
before any SQL result.

- **No data result either way.** It is neither a PASS nor a FAIL.
- **The no-retry disposition was correct.** The approval is consumed.
- **A new attempt needs:** working connector authentication, repaired by Samuel privately, plus Samuel's fresh
  one-call approval.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only. No SQL executed by the reviewer.

## Populated query: independently reconstructed

- **Inputs** are Root's `KAN31_B4_READ_ONLY_SQL_39053887716/` (Root commit `7515fab3`):
  - template `DOC226_REVIEWED_TEMPLATE_UNEXECUTED.sql`: 10,836 B, `a58aace0…`, the template accepted in Doc 226;
  - bindings `B4_BINDINGS.json`: 9,107 B, `683fc21b…`, LF only;
  - proof `B4_BINDING_PROOF.json`: `fb4621e1…`.
- **Placeholders.** The template has exactly one occurrence each of `__APPROVED_RUN_ID_UTF8_HEX__`,
  `__APPROVED_MANIFEST_SHA256__`, `__BINDINGS_SHA256__` and `__BINDINGS_UTF8_HEX__`.
- **Substitution values:**
  - the hex of `39053887716`;
  - `36802f25…`, the B4 run's preflight manifest;
  - `sha256(bindings)`;
  - `hex(bindings)`.
- **Result.** My own substitution produced **29,104 bytes, byte-identical to `1784c8a5`**. No other byte differs, and
  the template's `BEGIN READ ONLY`, timeouts and guards are unchanged.
- **Bindings against the run evidence** (artifact `12109165270`, ZIP `7da8f38b`):
  - The metadata is correct: protocol `MIXED_HOSTED_FIXTURE_POSTCHECK_V2`, source `8efa9a9e`/`0c92fdc6`, run
    `39053887716`, `frozen_manifest_sha256` `36802f25…`, and the three planned labels in order.
  - For each case, `label`, `request_id`, `public_reference`, `status` (`pending_review`) and `created_at` equal the
    run's receipts exactly:
    - `755cdeb0-df08-4d1b-ad19-5490e2f43103`
    - `30e27ad2-4500-4dda-b323-7131cc75e482`
    - `4ba04284-d09e-4801-9793-fa2efbd03cdd`
  - Each case's `sha256(expected_json)` equals its `expected_sha256`, and that hash appears in the artifact's own
    `<label>.binding.json` and `<label>.prepost.json`. Those files' hashes (`0c82bb10`/`16ec8739`,
    `19bf069a`/`14cdf65f`, `6eff0c7a`/`e7eb4ce3`) equal the binding proof.
  - The contact data inside is synthetic (`example.invalid`).

## Failure receipt

- **Files.** Core's local commit `6852e5d9` in `C:/xenios-wt/tc25-app-manifest-20261012`, at
  `.xenios/handoffs/2026-10-17-b4-sql-actual-failed-response.json` (`746ce4e2…`) and `…-b4-sql-consumed.json`
  (`34292ac8…`). Root's copies are byte-identical.
- **What they record:**
  - The one-use reservation was taken at 18:11:59Z, before the call.
  - The call was `mcp__supabase_staging_readonly__execute_sql` against `tetynodzrtmdbuzgboro` with query
    `1784c8a5`, running 18:12:59.121Z–18:12:59.575Z (454 ms).
  - Result: `isError: true`, "OAuth token refresh failed: Failed to parse server response".
  - 1 call, 0 retries, 0 probes, no fallback connector.
- **Reading.** The refresh failed in the client before a request carrying the SQL could run. Database execution is
  therefore unconfirmed, and no rows, counts or comparisons exist. Even if it had reached the database, the query is a
  single read-only transaction, so there is no write risk.
- **Disposition: correct.** No retry, no alternative connector, no probe, and the approval is marked consumed.

## Conditions for the next attempt

1. **Samuel repairs authentication** for the existing `supabase-staging-readonly` connector, in Core's own
   environment, through the supported OAuth login (`codex mcp login supabase-staging-readonly`), entering credentials
   privately.
   - Keep the server definition, the project restriction to `tetynodzrtmdbuzgboro` and read-only mode.
   - Do not create keys, change Render, add another connector, or run a probe to "test" the login.
2. **Samuel gives a fresh one-call approval** for the unchanged query `1784c8a5`: same three bindings, same target,
   stop on any mismatch, no retry.
3. **Core runs it once.** Root posts the raw result, and I review it against the expected per-case fingerprints and
   content.
4. **Staff read-back** remains a further, separate approval.

NOT LIVE. No SQL executed by the reviewer. No production change.
