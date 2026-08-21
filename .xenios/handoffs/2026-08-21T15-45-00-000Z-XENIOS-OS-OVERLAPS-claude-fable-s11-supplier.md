# xenios-os lease conflict detection — handoff

- **Session**: `claude-fable-s11-supplier`
- **Branch**: `lane/xenios-os-overlaps-fix` (pushed)
- **Exact SHA**: `6aaf917281a930de40929b807841abf8bd012d7b`
- **Base**: `15f436bd16b0d907385246d8b7b6ef78141afe82` (verified on origin via `git ls-remote` before branching)
- **Production mutated**: NO
- **Taken because**: the lead declared `scripts/agentic/**` unowned and asked whoever was free to take it.

## The defect

`overlaps()` normalised a pattern by cutting it at the first `**`:

```js
const normalize = (p) => p.replace(/\*\*.*$/, "").replace(/[\/]+$/, "");
```

`server/research/**request**` became `server/research`, and the prefix test then
matched every active lease beneath that directory. On the live board
REQUEST-CENTER (P1) collided with four unrelated leases at once — including
`claude-opus5-main`, whose only path is `server/research/account-identity/**`.

Consequences: REQUEST-CENTER was unclaimable by anyone, `next` under-reported the
board as P2-only, and lease ownership drifted into chat messages because the tool
refused valid claims. Nine sessions were affected.

## The fix

Ask the real question: does any concrete path match both patterns?

Standard glob semantics — a segment that is exactly `**` matches zero or more
whole segments; `*`, and `**` appearing inside a segment (as in `**request**`),
match within one segment and never cross a `/`.

One deliberate widening, documented at the module head: a pattern that runs out
of segments is treated as an ancestor of everything below it, so the directory
lease `server/research/catalog` still conflicts with
`server/research/catalog/price.ts`. Lease paths in this repo are written as
directory prefixes, and for a conflict check over-reporting is the safe
direction — a missed conflict puts two writers in one file.

## Files

| File | Role |
|---|---|
| `scripts/agentic/path-overlap.mjs` | **New.** The implementation, beside the CLI that uses it. |
| `scripts/agentic/xenios-os.mjs` | Inline `overlaps()` removed, now imports the module. |
| `shared/research/continuity/path-overlap.test.ts` | **New.** The proof. Lives under `shared/` because vitest's `include` covers `shared/**` and not `scripts/**`. |

## Verified end to end against the real board

- `next` returns **REQUEST-CENTER (P1)** as top candidate; previously offered only P2s
- the exact claim that failed four ways now returns `ok: true`
- `validate` still passes
- 22 tests, `tsc --noEmit` clean

It does not open a hole: `server/research/**request**` still conflicts with
`server/research/product-requests.ts`, and siblings still do not conflict. All
four falsely-conflicting leases are asserted non-conflicting in both directions.

## For the lead

Once integrated, board state is authoritative again — worth telling the fleet.
`claude-fable-lane4-affiliate` has been working REQUEST-CENTER on message-based
ownership and can register it properly.
