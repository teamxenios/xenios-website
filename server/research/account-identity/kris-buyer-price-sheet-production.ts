/**
 * Production composition for the KRIS_VOLUME_PARTNER buyer-scoped pricing
 * provider. This file decides exactly one thing: whether this deployment
 * carries the seam at all, and with which already-existing objects.
 *
 * The flag (`XENIOS_BUYER_SCOPED_PRICING=KRIS_VOLUME_PARTNER`, exact) is the
 * founder's switch. Absent or different, this returns undefined and every
 * door behaves as if the seam had never been built. Present but with any
 * dependency unbuildable (no Supabase configuration, no artifact, no
 * bindings), the provider still constructs CLOSED rather than half-open: a
 * misconfigured deployment refuses wholesale pricing, it never guesses it.
 */

import { readFileSync, existsSync } from "node:fs";
import { getSupabaseAdmin, getSupabaseAnon } from "../../supabase";
import {
  createSupabaseAccountAuthVerifier,
  type SupabaseAuthClient,
} from "./production-deps";
import { createSupabaseB2BBuyerBridgeDeps } from "./b2b-buyer-bridge-supabase";
import { loadKrisLegacyBindings } from "../kris-launch-a/legacy-order-production";
import { resolveKrisDatasetLocation } from "../kris-launch-a/dataset-location";
import {
  buyerScopedPricingEnabled,
  type BuyerScopedPricing,
} from "../early-access/commerce/buyer-scoped-pricing";
import { createKrisBuyerScopedPricing } from "./kris-buyer-price-sheet";

/**
 * Structurally the M62 legal binding directory: the ONE existing
 * customer-handle-to-member read. Typed structurally so this composition
 * depends on the answer's shape, not on a class identity.
 */
export interface KrisMemberBindingDirectory {
  forCustomer(customerRef: string): Promise<
    | { readonly ok: true; readonly binding: { readonly memberId: string } }
    | { readonly ok: false }
  >;
}

export function buildKrisBuyerScopedPricingFromEnv(input: {
  readonly memberDirectory: KrisMemberBindingDirectory;
  readonly env?: NodeJS.ProcessEnv;
  readonly warn?: (message: string) => void;
}): BuyerScopedPricing | undefined {
  const env = input.env ?? process.env;
  const warn = input.warn ?? ((message: string) => {
    // eslint-disable-next-line no-console
    console.warn(`[kris-buyer-pricing] ${message}`);
  });

  if (!buyerScopedPricingEnabled(env)) return undefined;

  let artifact: unknown = null;
  const location = resolveKrisDatasetLocation({
    env,
    cwd: process.cwd(),
    probe: { exists: (candidate: string) => existsSync(candidate) },
  });
  if (location === null) {
    warn("no Kris dataset location resolves; buyer-scoped pricing constructs closed");
  } else {
    try {
      artifact = JSON.parse(readFileSync(location.filePath, "utf8"));
    } catch (error) {
      warn(
        `Kris dataset unreadable at ${location.filePath} (${error instanceof Error ? error.message : "unknown"}); buyer-scoped pricing constructs closed`,
      );
    }
  }

  try {
    const bridge = createSupabaseB2BBuyerBridgeDeps(
      getSupabaseAdmin(),
      createSupabaseAccountAuthVerifier(getSupabaseAnon() as unknown as SupabaseAuthClient),
    );
    return createKrisBuyerScopedPricing({
      bindings: {
        memberForCustomer: async (customerRef: string) => {
          const resolution = await input.memberDirectory.forCustomer(customerRef);
          return resolution.ok ? { memberId: resolution.binding.memberId } : null;
        },
      },
      bridge,
      krisBindings: loadKrisLegacyBindings(env),
      artifact,
      warn,
    });
  } catch (error) {
    warn(
      `buyer-scoped pricing could not be composed (${error instanceof Error ? error.message : "unknown"}); the seam stays absent`,
    );
    return undefined;
  }
}
