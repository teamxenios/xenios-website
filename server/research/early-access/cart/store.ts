import type { EarlyAccessCartCheckout } from "@shared/research/early-access-cart";
import type {
  CartCommitResult,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartQuoteRecord,
  EarlyAccessCartQuoteStore,
} from "./ports";

/**
 * Test/local store. Every commit is synchronous between the uniqueness reads and
 * writes, so one JS turn is the atomic boundary. Production maps the same port to
 * one reviewed SQL transaction/RPC.
 */
export class InMemoryEarlyAccessCartStore implements EarlyAccessCartQuoteStore, EarlyAccessCartCheckoutStore {
  private readonly quotes = new Map<string, EarlyAccessCartQuoteRecord>();
  private readonly byKey = new Map<string, EarlyAccessCartCheckout>();
  private readonly byNumber = new Map<string, EarlyAccessCartCheckout>();
  private readonly childOrderNumbers = new Set<string>();

  async put(record: EarlyAccessCartQuoteRecord): Promise<void> {
    this.quotes.set(record.publicQuote.quoteId, record);
  }

  async get(quoteId: string): Promise<EarlyAccessCartQuoteRecord | null> {
    return this.quotes.get(quoteId) ?? null;
  }

  async byIdempotencyKey(key: string): Promise<EarlyAccessCartCheckout | null> {
    return this.byKey.get(key) ?? null;
  }

  async byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckout | null> {
    return this.byNumber.get(checkoutNumber) ?? null;
  }

  async commit(checkout: EarlyAccessCartCheckout): Promise<CartCommitResult> {
    const priorKey = this.byKey.get(checkout.idempotencyKey);
    if (priorKey) return Object.freeze({ committed: false as const, reason: "idempotency_key_taken" as const, checkout: priorKey });
    const priorNumber = this.byNumber.get(checkout.cartCheckoutNumber);
    if (priorNumber) return Object.freeze({ committed: false as const, reason: "checkout_number_taken" as const, checkout: priorNumber });
    for (const child of checkout.children) {
      if (this.childOrderNumbers.has(child.orderNumber)) {
        return Object.freeze({ committed: false as const, reason: "child_order_number_taken" as const, checkout: null });
      }
    }
    this.byKey.set(checkout.idempotencyKey, checkout);
    this.byNumber.set(checkout.cartCheckoutNumber, checkout);
    for (const child of checkout.children) this.childOrderNumbers.add(child.orderNumber);
    return Object.freeze({ committed: true as const, checkout });
  }
}
