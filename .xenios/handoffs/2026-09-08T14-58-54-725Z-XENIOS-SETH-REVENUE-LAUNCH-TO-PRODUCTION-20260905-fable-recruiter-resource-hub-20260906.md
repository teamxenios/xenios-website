# Activation fixes checkpoint — branch `claude/activation-fixes-20260908`

Fix commit `6af2474357f31861200efd6be02624a4a8e8986b` on top of A's `3f51ed4`
(runtime identical to the installed `3814c687`). Not merged, not deployed;
the installed application is untouched. Five files, all under
`server/research/resource-hub/`.

## What changed

1. **Upload-key recovery** (`service.ts` createVersion conflict path): after
   an insert conflict, the winner found under the idempotency key is treated
   as a replay only if its `sha256` and `originalFilename` equal this
   request's; otherwise the same typed `resource_state_conflict` the
   pre-check already gives ("already used for a different file").
2. **Conditional review transitions** (`store.ts`, `supabase-store.ts`,
   `service.ts`): `updateVersion(versionId, patch, expected{state, reviewedAt})`.
   In-memory: compare-and-swap. Supabase: `UPDATE … WHERE id=… AND state=…
   AND reviewed_at (IS NULL | = …)` then `select("id")`; zero rows →
   `ResourceHubConflict`, evaluated by Postgres under the row lock. Service
   maps it to `resource_state_conflict` "changed while you were reviewing
   it" and writes nothing. Publish/withdraw were already conditional in SQL.

## Evidence

`vitest run server/research/resource-hub`: 118/118 on Node 20.19.0. `tsc`
exit 0. Broad `server/research` run: 8,908 pass; two failures in
`production-boot.test.ts` and `preview-harness.guard.test.ts`, the same
capacity-sensitive files as in earlier contaminated runs, unrelated to this
change, 9/9 when run in isolation.

## For B's review specifically

- The recovery identity check (does a winner with different bytes ever
  return `ok: true`?).
- The WHERE-clause condition: `reviewed_at` equality uses the ISO string the
  service itself wrote (millisecond precision). Every `reviewed_at` in the
  schema originates from this code path, so it round-trips exactly. **Latent
  risk to confirm in the managed environment:** if any future writer sets
  `reviewed_at` with microsecond precision (e.g. SQL `now()`), the equality
  filter would miss and produce a spurious conflict rather than a silent
  overwrite — fail-closed, but worth a rehearsal assertion. A schema-level
  version/etag column would be the stronger long-term guard and is a
  migration, deliberately out of this scope.

## For A

Needs a pinned successor candidate, affected and integrated checks (the
resource-hub focused tests, the full suite at that commit, rehearsal 154
plus a conditional-update assertion if B wants one), B's acceptance, then
the activation plan. Claude holds no other path and will not merge into
your lineage.
