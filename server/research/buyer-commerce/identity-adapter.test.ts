import { describe, expect, it } from "vitest";

import { InMemoryEarlyAccessCustomerRepository } from "../early-access/identity/early-access-customer";
import { EarlyAccessBuyerIdentityAdapter } from "./identity-adapter";

const NOW = "2026-08-12T19:00:00.000Z";

describe("existing Early Access customer identity adapter", () => {
  it("returns one durable customerRef for repeat no-account intake", async () => {
    const repository = new InMemoryEarlyAccessCustomerRepository();
    const adapter = new EarlyAccessBuyerIdentityAdapter(repository, () => "buyer_alpha");
    const first = await adapter.upsert({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "Ada@Example.com",
      now: NOW,
    });
    const repeat = await adapter.upsert({
      firstName: "Someone",
      lastName: "Else",
      email: "ada@example.com",
      now: NOW,
    });
    expect(repeat.customerRef).toBe(first.customerRef);
    expect(repeat.customerRef).toMatch(/^eac_[a-f0-9]{32}$/);
  });

  it("binds a later authenticated account without creating credentials or approving commerce", async () => {
    const repository = new InMemoryEarlyAccessCustomerRepository();
    const adapter = new EarlyAccessBuyerIdentityAdapter(repository, () => "buyer_alpha");
    const buyer = await adapter.upsert({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      now: NOW,
    });
    expect(
      await adapter.bindClaimedAccount({
        email: "ada@example.com",
        customerRef: buyer.customerRef,
        authenticatedUserId: "user_123",
        now: "2026-08-13T00:00:00.000Z",
      }),
    ).toBe("bound");
    expect(
      await adapter.bindClaimedAccount({
        email: "ada@example.com",
        customerRef: buyer.customerRef,
        authenticatedUserId: "user_123",
        now: "2026-08-13T00:00:00.000Z",
      }),
    ).toBe("already_bound");
    const record = await repository.findByNormalizedEmail("ada@example.com");
    expect(record).toMatchObject({ userId: "user_123", status: "INVITED" });
  });

  it("refuses a claim for the wrong opaque reference or a different bound account", async () => {
    const repository = new InMemoryEarlyAccessCustomerRepository();
    const adapter = new EarlyAccessBuyerIdentityAdapter(repository, () => "buyer_alpha");
    const buyer = await adapter.upsert({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      now: NOW,
    });
    expect(
      await adapter.bindClaimedAccount({
        email: "ada@example.com",
        customerRef: "eac_wrong",
        authenticatedUserId: "user_123",
        now: NOW,
      }),
    ).toBe("not_found");
    await adapter.bindClaimedAccount({
      email: "ada@example.com",
      customerRef: buyer.customerRef,
      authenticatedUserId: "user_123",
      now: NOW,
    });
    expect(
      await adapter.bindClaimedAccount({
        email: "ada@example.com",
        customerRef: buyer.customerRef,
        authenticatedUserId: "user_other",
        now: NOW,
      }),
    ).toBe("claim_conflict");
  });
});
