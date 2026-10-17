# KAN-31 B4 read-only snapshot, second attempt: desktop MCP authentication rejected

**CONFIRMED: no database result; disposition correct.** Authorization 10182/10184 is consumed.

- **Not a problem with the query or the app.** The query (`1784c8a5`, Doc 241) and the browser acceptance (Doc 240)
  are unaffected.
- **The blocker is the Core desktop app's own MCP connection.** It still requires authentication.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only. No SQL executed by the reviewer.

## Correction to my earlier statement

I told Samuel at about 18:3xZ that "no call was made". That was true when KAN-31 10183 was posted, but it became
stale after 10184. Samuel resolved the hold, and Core made the single authorized call at 19:44:02Z (10185). Root's
comment 10186 records the same correction.

## Receipts

Core local commit `3f4e098`, `C:/xenios-wt/tc25-app-manifest-20261012/.xenios/handoffs/`:

- **`…-fresh-10182-consumed.json` (`a4ae08e6…`).**
  - The one-use reservation was marked at 19:43:45Z, before the call.
  - Executor Core `01a0e098`, connector `supabase-staging-readonly`, project `tetynodzrtmdbuzgboro`, `readOnly:true`.
  - Query 29,104 B, `1784c8a5`; config hash `55d6b717…`; CLI OAuth login exit 0.
  - The earlier failed attempt is preserved.
- **`…-fresh-10182-actual-response.json` (`55ef826e…`).**
  - Started and ended at 19:44:02 UTC; the timestamps have only second precision.
  - 1 call, 0 retries, 0 probes; `bindingsDecodedVerified:true`; `configUnchanged:true`.
  - Result: `isError:true`, "MCP authentication required. Reconnect to continue using this server."
  - `databaseResultReturned:false`.

## Reading

- **The CLI login did not fix the desktop connection.** It succeeded (`codex mcp login` exit 0), but the connection
  the desktop app actually uses still reports that authentication is required.
- **The query never reached the database.** No rows, counts or comparisons exist, so the result is neither a PASS nor
  a FAIL.
- **The disposition is correct:** a single attempt, no retry, no fallback connector, no probe, and the approval marked
  consumed.

## Conditions for the next attempt

1. **Re-authenticate the existing desktop connection** through the Core app's Settings → MCP servers →
   `supabase-staging-readonly` → Authenticate or Reconnect, then Restart if asked. Samuel signs in privately.
   - Keep the definition, project lock and read-only mode.
   - Do not add a server or switch to a generic Supabase plugin.
2. **Check the connection without a query.** Use `/mcp` status and tool discovery only. A "connected" status is not
   database proof.
3. **Only then:** Samuel's fresh one-call approval, sent directly to Core, for the unchanged `1784c8a5`.
4. **I review the raw result** against the expected per-case fingerprints.

NOT LIVE. No SQL executed by the reviewer. No production change.
