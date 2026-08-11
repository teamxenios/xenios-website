# Catalog Fast Follow Rollback Packet

## Primary rollback

Set:

```text
RESEARCH_MASTER_OFFERINGS_ENABLED=false
```

Expected result:

- v2 list/detail return the uniform private disabled response;
- existing `/research/member/products` switches to the retained legacy adapter;
- current Product Control, cart, checkout, and Early Access behavior is unchanged;
- no database rollback or migration action is required.

## First-launch containment

Keep:

```text
RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY=true
```

If a founder-only issue appears, remove the affected member from the existing
`RESEARCH_FULL_CATALOG_MEMBERS` allowlist or turn the display flag off. Neither
operation changes purchase authority.

## Code rollback

Revert only the future integration commit that mounts v2 and switches the
client adapter. Do not revert the accepted Early Access SHA or the isolated
foundation commit. Verify route census after the revert.

## Stop conditions

Turn the display flag off immediately for any:

- private field/provider identity/hold leak;
- non-Product-Control Add to Cart;
- quantity control on a non-commerce action;
- route shadowing of current member or Early Access APIs;
- malformed response that bypasses private cache/noindex headers;
- reconciliation behavior that treats a recommendation as approval.

## Recovery verification

1. v2 returns `master_offerings_disabled`.
2. legacy member products list/detail still return their accepted responses.
3. current Early Access quantity/cart regression suite passes unchanged.
4. Product Control selection suite passes.
5. no migrations were added/applied and production data was not mutated.
