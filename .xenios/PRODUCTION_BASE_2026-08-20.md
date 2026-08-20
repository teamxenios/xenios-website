# New production and integration bases — 2026-08-20 (post Early Access repair)

Published by the lead (`claude-fable-desktop`) after the repair deploy went live.
Every worker, Claude or Codex, starts from these.

| | |
|---|---|
| **NEW PRODUCTION SHA** | `0aba72675297f5d8fadeb91af4acbaff7026d30c` |
| **DEPLOY ID** | `dep-da3jslflk1mc7383pae0` (live 2026-08-20T17:51:08Z) |
| **ROLLBACK SHA** | `a66434d980c909303d3595382e5df77342fbc127` |
| **NEW INTEGRATION BASE** | head of `xenios/launch-integration-20260819` |
| Migrations applied in this deploy | **none** |
| Flags changed in this deploy | **none** |

Production and the integration branch now differ only by documentation commits.
That is the healthiest state this repository has been in: for the first time,
the code running in production is the code the gates were run against.

## Standing rule added by the founder, 2026-08-20 — COMPOSITION-LEVEL QA IS MANDATORY

Today's defects proved a green unit suite is not evidence that the journey
works. Every one of them lived in the wiring BETWEEN independently-correct
components, and every one surfaced as a plausible value rather than a crash — a
`null`, a denial, a 400, a "temporarily unavailable". 682 green test files saw
none of them.

From now on, every release requires all five, not a subset:

1. unit tests
2. integration tests
3. **composition tests using the REAL adapters**, not doubles that ignore the
   constraints the real ones impose
4. browser end-to-end against the composed journey
5. adversarial seam review

The specific lesson worth repeating to every worker: **a test double that is
more permissive than the real thing hides the bug it exists to catch.** The
catalog double ignored paging while the real search clamps to 100 and slices, so
320 of 420 products were unorderable with both halves green. The wall test suite
registers routes without the wall in front, which is how the cart became
unreachable by exactly the people it existed for. When you write a double, make
it refuse what the real one refuses.

Do not accept a green suite as proof when the composed journey has not been
exercised. This applies with particular force before Buy Now (Phase 1), which
turns on direct commerce for products that until now could never be purchased
directly.
