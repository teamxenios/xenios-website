# LANE H — pricing cache adversarial verification — handoff

SESSION: `claude-fable-s9-conversion-qa`
LANE: H (pricing cache / performance adversarial verification)
TASK: FULL-VISION-DEMO lease (owns `e2e/**`)
BRANCH: `lane/e2e-conversion-qa-20260819` (pushed)
BASE SHA: `e199b18` — your LOCAL integration head, not origin
PUSHED SHA: `57087f84f7349b759d884edff2e34e83d61222cd`
PRODUCTION MUTATED: NO

## FILES CHANGED

- `e2e/pricing-cache-adversarial.spec.ts` (new, 13 tests)
- `e2e/proposed-fixes/bulk-catalog-pricing-empty-read.patch` (new)
- `e2e/README.md` (LANE H section)

Nothing outside `e2e/**`. Your `bulk-catalog-pricing-source.ts` is untouched.

## WHAT IS NOW WORKING

Your 3-query source holds up under attack. Confirmed green: cold read, warm
serve, ttl refresh, stampede collapse at 1/5/10/25 concurrent cold callers (one
upstream read every time), stale-while-error serving the last verified snapshot,
an honest raise past the staleness ceiling, an honest raise on cold upstream
failure, recovery to fresh data after a blip, and no customer identity anywhere
in `stats()`.

## THE ONE DEFECT

**An upstream that SUCCEEDS with zero rows poisons the cache.**

The failure path is guarded; the success-with-nothing path is not. A read that
resolves with `[]` replaces the good snapshot, every product then answers `null`
from `readProductForPricing`, and all 417 approved prices render "Price on
request" — cached for the full ttl and re-poisoned on each refresh.

That is the same collapse the class was written to prevent, reached through a
quieter door. It is not hypothetical on this project: `.env.example` records a
production incident where a key misconfiguration made "reads silently return
empty". An RLS change, a revoked grant, a filtered query or a half-applied
migration all resolve successfully with nothing.

## INTEGRATION INSTRUCTIONS

```bash
git apply e2e/proposed-fixes/bulk-catalog-pricing-empty-read.patch
npx vitest run --config e2e/vitest.config.ts
```

17 lines: refuse an empty read only when a non-empty snapshot is held, so a
genuinely empty deployment still works and a cold empty read still surfaces.

I did not apply it myself — the file is your active unpushed work, and one
writer per path family. Verified in both directions: **13/13 with the patch,
and exactly the one empty-read test red without it.**

## TESTS

PASS 12 / 13. The single failure is the confirmed defect above and is committed
deliberately, so it goes green the moment the guard lands. The suite runs
standalone (`--config e2e/vitest.config.ts`) and is NOT in the default suite, so
it cannot redden anyone else's run.

## KNOWN RISKS / OPEN DECISION

A refresh returning 2 rows where 417 stood has the same root causes as an empty
read, but "how small is too small" is your call — too strict a ratio would
refuse a legitimate catalog reduction. The suite pins today's behaviour (the
shrunken read is accepted) rather than asserting a threshold nobody agreed. If
you want a shrink guard, say what ratio and I will pin it.

Also note: my base is your LOCAL `e199b18`. Origin's
`xenios/launch-integration-20260819` is still `c371201` and does not contain the
pricing source at all, so anyone rebasing from origin cannot see this lane's
subject. Worth pushing the integration branch.

## NEXT

Claiming LANE G (mobile + browser E2E) against the storefront convergence at
`bd3aaad`, which peers report has never been exercised in a real browser. First
targets: GRP-0422 rendering VISIBLE + retail priced + Request Order and never
Temporarily Unavailable or Buy Now, WITH DAC 2mg/5mg direct vs 10mg request,
Hexarelin 5mg once at $49.00, Oxytocin 10mg once at $59.00, Care rows keeping
Continue through Care, and no horizontal overflow at 430/390/375/360/320.
