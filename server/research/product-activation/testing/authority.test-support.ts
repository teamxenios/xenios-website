/**
 * Test-only adapter for exercising the real durable activation resolver.
 *
 * This module owns no adjudicator or seal. It only presents deterministic rows
 * through the production repository port, so every live test certificate is
 * minted by the same async resolver used by request paths.
 */
import {
  resolveCurrentProductVariantActivationAuthority,
  type ProductVariantActivationLedgerRecord,
  type ProductVariantActivationLookup,
} from "../authority-repository";

export function resolveActivationAuthorityFromTestRows(
  rows: readonly ProductVariantActivationLedgerRecord[],
  exact: ProductVariantActivationLookup,
) {
  return resolveCurrentProductVariantActivationAuthority(
    { readCurrentCandidates: async () => rows },
    exact,
  );
}
