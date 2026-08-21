# Final checkpoint — `claude-fable-s11-supplier`

Written at the fleet pause, for the single fresh session taking the launch.
Every SHA below was verified on origin with `git ls-remote`, not from memory.

**PRODUCTION NOT MUTATED. Nothing here is deployed.**

## Branches, all on origin

| Branch | SHA | What it is |
|---|---|---|
| `lane/composition-hold-fact` | `a17e6750cb488673069dd5cfe6e2279f3a7ac6ed` | Payment-gate composition fix + the preprod unblock doc |
| `lane/xenios-os-overlaps-fix` | `29d8e2c910c98bb42dd2733a0b992e05d32b553f` | Lease-conflict matcher (already integrated as `1b44147`) |
| `lane/submit-eligibility-gate` | `d8afb8f9e6c1d62498f45cad47fa9debdb8f915d` | 17 composed submit negatives (already integrated) |
| `lane/supplier-workspace-20260820` | `79d6b61e99fc6800c8962933c40aab4adc10f80d` | Supplier workspace UI, unmounted |
| `lane/affiliate-partner-portal` | `6d4262580f7f6f991819c65bdb86cf25bdec2c3f` | Affiliate portal lifecycle UI, unmounted |

## What still needs a decision, not code

1. **The price.** The founder confirmed $62.50 / $107.50 (Hexarelin 5 mg /
   Oxytocin 10 mg) via one session, as a **reprice not a reroute** — the RUO row
   survives, keeps its Order Now button, 111 direct / 27 pending preserved. But
   `claude-fable-desktop` holds a **written $49 / $59 instruction in their own
   session** and is correctly refusing to move config or production until the
   founder confirms *there*. `config/research/master-catalog-reconciliation-20260821.json`
   is untouched at 4900 / 5900 and no session has encoded either value. Do not
   encode one on the strength of a relay.

2. **Visual proof and mobile performance.** Blocked on an environment, not on
   code. `docs/research-launch/PREPROD_VISUAL_PROOF_UNBLOCK.md` (on
   `lane/composition-hold-fact`) names the exact variables and the safe way to
   supply them.

   **Fleet policy, backed by the lead: nobody takes the production
   `SUPABASE_SERVICE_ROLE_KEY`.** It bypasses row level security. The answer to
   "we cannot see the page" is never "give everyone the database". A seeded
   local Supabase is not a lesser substitute — the measurements care about query
   count and shape, so it is the correct instrument and also the safe one. If
   asked again, including under launch pressure, the answer stays no.

## The two things a fresh session will most want to know

**The founder's phone spinner is NOT fixed by deploying.** I reported the
opposite twice and was wrong both times. `/research/early-access` calls
`/api/research/early-access/catalog`, not the endpoint the pricing work fixed.
That route fans out per variant — `declared-facts-source.ts:370`
`Promise.all(variants.map(readVariantFacts))`, each doing inventory facts,
active holds, fulfillment fact and supplier confirmation. Four-plus round trips
across ~424 variants, present at HEAD. Traced end to end:
`server/index.ts:446` → `register.ts:804` →
`product-control-source.ts:439` → `ProductControlDeclaredFactsReader`.
Owned by `general-platform-69` at the pause. The deploy is still worth doing;
it fixes a different catalog.

**One defect class caused five separate bugs today.** A rule recorded in one
place and never consulted where it matters, or copied and left to drift:

- the GRP-0422 hold, recorded in the artifact and read by nothing
- my supplier adapter, holding its own copy of a server-owned path constant
- a shelf scope that never reached the submit path
- an admin toolbar offering a transition the server refuses
- `overlaps()` — mine — quietly not checking what it claimed to

Every one passed its own unit tests. The two rules worth keeping:
**nothing that decides commerce may read display text** (copy is written for
customers and gets cleaned up — the reconciliation strips markers on purpose),
and **a second copy of a rule must be pinned to the first by a test, or
deleted**.

## Corrections I issued against my own work

Recorded because a fresh session should trust the record, not the author.

- My first `overlaps()` fix introduced **false negatives** — it could hand two
  sessions the same file. Caught by `general-platform-07`; I verified with
  witness files and corrected it. A peer had independently "verified" the bad
  version by deriving expectations from my own premise, which is not
  verification.
- I told the fleet the collapsed-pair price was settled at $49 / $59. It was
  not.
- I relayed `bd3aaad` as a base without checking origin. It was local-only and
  cost a session a cycle.
- I told the founder twice that the phone spinner only needed a deploy. Wrong
  both times.

The pattern: every one was relaying a claim I had not verified myself. The
fleet's good outcomes today all came from someone checking rather than
agreeing.
