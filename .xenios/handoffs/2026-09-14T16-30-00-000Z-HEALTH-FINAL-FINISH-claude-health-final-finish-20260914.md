# Xenios Health finish takeover — 2026-09-14

Writer: `claude-health-final-finish-20260914` (Claude Opus 5), holder of the
`XENIOS-NATIVE-FINISH-20260910` lease, transferred from the usage-exhausted
`codex-native-finish-20260910` under the continuity OS emergency-recovery
section. Old sessions are marked stale, not deleted.

Branch `codex/xenios-native-finish-20260910`.

## Read this first

`docs/release-candidate/XENIOS_HEALTH_RC_20260914.md` is the deliverable: the
current truth, the full capability matrix, the real gap list with acceptance
conditions, the qualification record, and what a release would consist of.
This file is the pointer and the exact-SHA record.

## What changed

1. **Production identity.** The coordination records named `3814c687` as live,
   verified 2026-09-08T14:45Z. Production moved on later the same day. The
   identity `c545a70` / `dep-dag8l567bikc738a1nj0` comes from the founder's
   authenticated Render audit; this session holds no Render credential. It is
   corroborated read-only: both origins answered `/api/health` 200 at
   2026-09-14T15:47:19Z with uptimeSeconds 494653, placing the running process
   160 seconds after `c545a70` was authored, which excludes the superseded
   deploy that went live 7.74 hours earlier. Only `supabase/MIGRATIONS.md`
   differs under `supabase/` between the two commits, so the baseline move
   applies no SQL. Six records corrected; prior versions preserved byte-exact
   under `docs/coordination/history/` with their Git blob identities.
2. **The system-of-record registry** had been pinned to `db5a2d44` through two
   production deploys, so `npm run site:record:check` was already failing before
   this session. Corrected and regenerated; it now exits 0.
3. **Public Care truthfulness.** `/care/support` answered every submission with
   "We have it." while storing nothing, firing both emails without awaiting them
   and swallowing each failure. The team alert must now succeed before the route
   reports success; a failure returns 503 naming a direct address. Both senders
   now check the provider's result, which reports a rejected send in the payload
   rather than by throwing. `/care` no longer asserts "The Care request line is
   verified live." above a fetched status that can contradict it, and the
   gateway hero no longer claims the request line is open in static copy on an
   indexed page.

## What was found and not fixed

Four P0s, all of them integration gaps rather than payment defects, each with an
exact acceptance condition in the RC document:

1. The commerce queues admin endpoint returns the store's ten-kind internal view
   while the client reads the frozen six-field DTO. No server code produces those
   six field names. The route dependency is typed `unknown`, and the page's test
   stubs its own DTO, so neither the compiler nor the suite can see it.
2. Two mounted admin queue stores return an empty array on a failed read, so an
   RLS denial or a missing table renders "0 waiting on a decision".
3. Nothing mints a canonical order. The canonical order service, its route table
   and the assisted-order conversion gate each have zero non-test callers.
4. The canonical fulfillment engine is never mounted, so no code path in this
   deployment can move a member order past processing.

Ten P1s and a set of P2s are listed in the RC document. The three most load
bearing: the support queue's reads are unmounted while its answer verb is
mounted; no member can download a document in production; and nothing writes an
Early Access referral grant, so every such order is permanently unattributed.

## Native payment, recovery, receipts

Unchanged and preserved. The recovery caller stays default-off behind a
digest-pinned approval, the receipt queue stays off, the preview stays
write-refusing, and the credit rule is untouched. The hosted execution request
at `docs/native-finish/HOSTED_EXECUTION_PACKET_20260911.md` still stands, and
its central finding holds: the approved SQL candidate cannot support the
checkout journey alone.

Production reports `commerceEnabled=false`, so native checkout is not enabled
live.

## Authority

No production, database, provider, environment or service mutation. No mail was
sent. No flag was enabled. Nothing was deployed. Render and Supabase were both
unreachable from this session — the Render MCP server is unauthenticated and
`supabase-xenios-prod` failed to connect — so **no managed database state was
observed at all**, and every schema statement in the RC document is a statement
about source or about a prior recorded receipt.

## Next

The founder decides three things, stated at the end of the RC document: whether
the four P0s block a release, which queue shape is canonical, and whether the
hosted amendment is approved and who executes it.
