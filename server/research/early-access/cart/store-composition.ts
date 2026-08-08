import { InMemoryEarlyAccessCartStore } from "./store";
import type { EarlyAccessCartCheckoutStore, EarlyAccessCartQuoteStore } from "./ports";

/**
 * F4: THE CART MAY NOT SILENTLY REMEMBER A CHECKOUT IN RAM.
 *
 * The composition read `options.cartStore ?? new InMemoryEarlyAccessCartStore()`.
 * That default is harmless in a test and unacceptable in production, because
 * it is reached by OMISSION. A deployment that turned the cart flag on without
 * wiring the durable store would have booted successfully, taken real money
 * against a parent checkout held in process memory, and lost every child order
 * on the next restart or the next dyno. Nothing would have looked wrong until
 * a customer asked where their order went.
 *
 * A fallback you get by forgetting is not a fallback, it is a trapdoor. So the
 * in-memory store now has to be ASKED FOR, and asking for it in production is
 * refused outright.
 */

export class EarlyAccessCartStoreUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarlyAccessCartStoreUnavailable";
  }
}

export type CartStorePorts = EarlyAccessCartQuoteStore & EarlyAccessCartCheckoutStore;

/**
 * True when this process is a production deployment.
 *
 * Unknown counts as production. An environment that cannot say what it is gets
 * the strict answer, because the failure modes are not symmetric: refusing to
 * boot a misconfigured staging box costs an engineer ten minutes, and quietly
 * accepting money into RAM costs a customer their order.
 */
export function isProductionLikeEnvironment(
  env: Readonly<Partial<Record<string, string | undefined>>>,
): boolean {
  const mode = env.NODE_ENV;
  return mode !== "test" && mode !== "development";
}

/**
 * Resolve the durable store the cart routes will persist through.
 *
 * @throws EarlyAccessCartStoreUnavailable when production enables the cart
 *         without a durable store. Failing to boot is the correct outcome: the
 *         alternative is a checkout door that accepts orders it cannot keep.
 */
export function resolveEarlyAccessCartStore(input: {
  /** The durable store, when the deployment wired one. */
  readonly durable?: CartStorePorts | undefined;
  /**
   * An explicitly supplied ephemeral store. Named `unsafeMemoryStore` on
   * purpose: it should be uncomfortable to type and impossible to reach by
   * accident.
   */
  readonly unsafeMemoryStore?: CartStorePorts | undefined;
  readonly env: Readonly<Partial<Record<string, string | undefined>>>;
}): CartStorePorts {
  if (input.durable !== undefined) return input.durable;

  const production = isProductionLikeEnvironment(input.env);
  if (production) {
    throw new EarlyAccessCartStoreUnavailable(
      "The Early Access cart is enabled but no durable cart store is configured. " +
        "A production cart checkout must persist through the " +
        "research_early_access_commit_cart_checkout RPC, never process memory. " +
        "Configure the durable store or set RESEARCH_EARLY_ACCESS_CART_ENABLED to false.",
    );
  }

  // Outside production an explicit memory store is fine, and so is the
  // convenience of not passing one, because a test that loses its cart on
  // restart has lost nothing.
  return input.unsafeMemoryStore ?? new InMemoryEarlyAccessCartStore();
}
