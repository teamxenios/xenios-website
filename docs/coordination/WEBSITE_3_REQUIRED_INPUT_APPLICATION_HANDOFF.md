# Website 3 required-input application handoff

Session: WEBSITE 3 — Products, Diagnostics & Member Commerce

Branch: `feature/website-3-required-inputs`

Base SHA: `efd2213b7687c2f6400ca35b2f846fa9e632d572`

Canonical dependency:

- deployed migration: `20260726045307 canonical_required_input_readiness`
- shared contract: `docs/coordination/REQUIRED_INPUT_READINESS_SHARED_CONTRACT.md`
- shared types: `shared/research/required-inputs.ts`
- deployed Render release: `dep-d9ip5pn41pts73an90m0`

Final head: the exact containing commit recorded in PR, issue #44, and the
Website 2 handoff message.

## Completed application

- consumes the canonical `RequiredInput`, `RequiredInputDefinition`,
  `RequiredInputState`, and `DomainReadiness` contracts;
- fails closed unless the server-computed readiness domain, manifest, counts,
  launch status, and canonical input states all agree;
- keeps public projections limited to an availability boolean and truthful
  generic message;
- provides exact Website 3 required-input locations for product identity,
  pricing, content, inventory, lots, exact-lot COAs, supplements, metabolic
  pathways, Superpower, diagnostics, and qualified biomarker review;
- replaces exact internal labels with real values when those values exist;
- restores the blocking presentation for rejected or expired canonical inputs;
- connects the existing product, product-detail, inventory, and Website 3
  configuration administration surfaces to the canonical required-input read
  API;
- allows internal product, supplement, pathway, Superpower, and biomarker
  components to receive canonical required inputs without changing the
  ordinary member/public rendering;
- keeps long administrator actions inside narrow cards.

## Explicit boundaries

- no database migration;
- no required-input rows;
- no seed data or seed namespace;
- no roles;
- no provider or origin contract;
- no browser-authoritative launch switch;
- no public activation;
- no production mutation;
- no changes to frozen PR #62 or Release Train 1.

Website 2 owns route wiring, canonical dashboard integration, migration order,
merge order, production application, and deployment. Website 6 owns independent
isolation, launch-gate, responsive, and accessibility verification.

## Tests and evidence

Focused coverage proves:

- missing price, inventory, lot, and applicable COA block;
- rejected and expired inputs block again;
- only the complete canonical server readiness object can enable;
- absent, stale, and mismatched readiness fail closed;
- public projections omit keys and evidence;
- verified values replace exact internal labels;
- ordinary member views do not expose internal labels or technical keys;
- internal diagnostics, supplements, and product views show exact required
  facts;
- long actions wrap inside narrow cards.

Browser evidence:

- Xenios-native admin shell and UI-kit cards inspected at 1440px;
- desktop document width matched viewport width with no horizontal overflow;
- the first 320px pass identified long action-label overflow;
- the action control was corrected to wrap with automatic height and a
  100-percent maximum width, with a focused regression.

The final focused and complete test, typecheck, build, and diff checks are
recorded in the PR and issue #44 against the frozen head.

## Production requirements

After Website 2 merges and deploys:

1. confirm the deployed SHA;
2. verify signed-out member/admin APIs remain registered and fail closed;
3. use only an authorized existing internal/product-admin/reviewer session;
4. confirm canonical required-input records render exact labels without
   exposing technical keys publicly;
5. confirm verified values replace labels;
6. confirm rejected or expired facts re-block;
7. verify desktop, 375px, and 320px behavior;
8. inspect accessible names, focus, and logs;
9. do not fabricate an account, record, or verification merely to pass smoke.

PRODUCTION STATUS: NOT YET MERGED
