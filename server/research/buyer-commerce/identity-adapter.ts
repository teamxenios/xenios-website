import { randomUUID } from "node:crypto";

import type { BuyerIdentity } from "@shared/research/buyer-commerce";
import {
  createEarlyAccessCustomer,
  customerRefFor,
  normalizeEmail,
  type EarlyAccessCustomerRepository,
} from "../early-access/identity/early-access-customer";
import type { BuyerIdentityPort } from "./service";

const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Progressive buyer identity backed by the existing Early Access customer
 * directory. Intake creates an INVITED customer, never an account and never an
 * approval. A later authenticated account claim may bind that same row.
 */
export class EarlyAccessBuyerIdentityAdapter implements BuyerIdentityPort {
  constructor(
    private readonly customers: EarlyAccessCustomerRepository,
    private readonly newCustomerId: () => string = () => `buyer_${randomUUID()}`,
  ) {}

  async upsert(input: BuyerIdentity & { now: string }): Promise<{ customerRef: string }> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await this.customers.findByNormalizedEmail(normalizedEmail);
    if (existing !== null) return Object.freeze({ customerRef: customerRefFor(existing) });

    const created = createEarlyAccessCustomer({
      id: this.newCustomerId(),
      email: input.email,
      legalName: `${input.firstName} ${input.lastName}`,
      phone: input.phone,
      now: input.now,
    });
    if (!created.ok) throw new Error(`Buyer identity was refused: ${created.code}`);
    const inserted = await this.customers.insert(created.value);
    if (inserted.ok) return Object.freeze({ customerRef: customerRefFor(inserted.value) });

    // A concurrent first request for the same normalized email won. Re-read the
    // existing row instead of creating a second customer system or identity.
    const winner = await this.customers.findByNormalizedEmail(normalizedEmail);
    if (winner === null) throw new Error("Buyer identity conflict could not be reconciled.");
    return Object.freeze({ customerRef: customerRefFor(winner) });
  }

  /**
   * Bind an already-authenticated account id to the durable buyer record.
   * This does not create credentials or approve Early Access; Pack 02/account
   * claim owns authentication and calls this seam only after proof of email.
   */
  async bindClaimedAccount(input: {
    email: string;
    customerRef: string;
    authenticatedUserId: string;
    now: string;
  }): Promise<"bound" | "already_bound" | "not_found" | "claim_conflict" | "invalid"> {
    if (
      !SAFE_USER_ID.test(input.authenticatedUserId) ||
      !Number.isFinite(Date.parse(input.now))
    ) {
      return "invalid";
    }
    const customer = await this.customers.findByNormalizedEmail(normalizeEmail(input.email));
    if (customer === null || customerRefFor(customer) !== input.customerRef) return "not_found";
    if (customer.userId === input.authenticatedUserId) return "already_bound";
    if (customer.userId !== null) return "claim_conflict";
    await this.customers.update(
      Object.freeze({ ...customer, userId: input.authenticatedUserId, updatedAt: input.now }),
    );
    return "bound";
  }
}
