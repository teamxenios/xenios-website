/**
 * The member bridge: base identity always wins, only a verified member with
 * an APPROVED claim-rail customer resolves, the userId link happens durably
 * exactly once, and an email matching somebody else's bound customer REFUSES
 * rather than rebinding. Every failure is null - the caller reads exactly as
 * it did before the bridge existed.
 */
import { describe, expect, it, vi } from "vitest";

import type { EarlyAccessCustomer } from "../routes/ports";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  customerRefFor,
  transitionEarlyAccessCustomer,
  type EarlyAccessCustomerRecord,
} from "./early-access-customer";
import { MemberBridgedEarlyAccessIdentity } from "./member-bridged-identity";

const NOW = "2026-08-14T12:00:00.000Z";
const MEMBER = Object.freeze({
  memberId: "member-1111",
  userId: "11111111-1111-4111-8111-aaaaaaaaaaaa",
  email: "kris@example.com",
});

const SESSION_CUSTOMER: EarlyAccessCustomer = Object.freeze({
  customerRef: "eac_" + "d".repeat(32),
  displayName: "Session Customer",
  boundBy: "session_code" as const,
});

async function approvedCustomer(
  repo: InMemoryEarlyAccessCustomerRepository,
  overrides: Partial<Parameters<typeof createEarlyAccessCustomer>[0]> = {},
): Promise<EarlyAccessCustomerRecord> {
  const created = createEarlyAccessCustomer({
    id: "eacid0001",
    email: MEMBER.email,
    legalName: "Kristopher Lopez",
    now: NOW,
    ...overrides,
  });
  if (!created.ok) throw new Error(`fixture customer refused: ${created.code}`);
  const approved = transitionEarlyAccessCustomer({
    customer: created.value,
    to: "APPROVED",
    by: "Samuel Boadu",
    reason: "Founder-confirmed Roman Health operator.",
    now: NOW,
  });
  if (!approved.ok) throw new Error(`fixture approval refused: ${approved.code}`);
  const inserted = await repo.insert(approved.value);
  if (!inserted.ok) throw new Error("fixture insert refused");
  return inserted.value;
}

function bridge(repo: InMemoryEarlyAccessCustomerRepository, base?: EarlyAccessCustomer | null) {
  return new MemberBridgedEarlyAccessIdentity({
    base: { resolve: async () => base ?? null },
    customers: repo,
    warn: () => {},
  });
}

describe("the member-to-Early-Access identity bridge", () => {
  it("lets the base identity answer first, unchanged", async () => {
    const repo = new InMemoryEarlyAccessCustomerRepository();
    await approvedCustomer(repo);
    const resolved = await bridge(repo, SESSION_CUSTOMER).resolve({
      cookieHeader: "c",
      member: MEMBER,
    });
    expect(resolved).toBe(SESSION_CUSTOMER);
  });

  it("resolves a verified member to their APPROVED customer and links the userId once", async () => {
    const repo = new InMemoryEarlyAccessCustomerRepository();
    const record = await approvedCustomer(repo);
    expect(record.userId).toBeNull();

    const identity = bridge(repo);
    const resolved = await identity.resolve({ cookieHeader: "c", member: MEMBER });
    expect(resolved).not.toBeNull();
    expect(resolved?.boundBy).toBe("verified_link");
    expect(resolved?.customerRef).toBe(customerRefFor(record));

    const linked = await repo.findByNormalizedEmail(record.normalizedEmail);
    expect(linked?.userId).toBe(MEMBER.userId);

    // Second resolution matches the already-linked record without re-linking.
    const update = vi.spyOn(repo, "update");
    const again = await identity.resolve({ cookieHeader: "c", member: MEMBER });
    expect(again?.customerRef).toBe(customerRefFor(record));
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an email that matches a customer bound to a DIFFERENT userId", async () => {
    const repo = new InMemoryEarlyAccessCustomerRepository();
    await approvedCustomer(repo, { userId: "22222222-2222-4222-8222-bbbbbbbbbbbb" });
    const resolved = await bridge(repo).resolve({ cookieHeader: "c", member: MEMBER });
    expect(resolved).toBeNull();
  });

  it.each(["INVITED", "SUSPENDED", "REVOKED"] as const)(
    "resolves nothing for a %s customer",
    async (status) => {
      const repo = new InMemoryEarlyAccessCustomerRepository();
      const record = await approvedCustomer(repo);
      await repo.update({ ...record, status });
      expect(await bridge(repo).resolve({ cookieHeader: "c", member: MEMBER })).toBeNull();
    },
  );

  it("resolves nothing without a member, and nothing for an unknown email", async () => {
    const repo = new InMemoryEarlyAccessCustomerRepository();
    await approvedCustomer(repo);
    expect(await bridge(repo).resolve({ cookieHeader: "c" })).toBeNull();
    expect(
      await bridge(repo).resolve({
        cookieHeader: "c",
        member: { ...MEMBER, email: "stranger@example.com" },
      }),
    ).toBeNull();
  });

  it("fails closed when the repository read or the link write breaks", async () => {
    const repo = new InMemoryEarlyAccessCustomerRepository();
    await approvedCustomer(repo);
    const broken = new MemberBridgedEarlyAccessIdentity({
      base: { resolve: async () => null },
      customers: {
        findByNormalizedEmail: async () => {
          throw new Error("supabase unreachable");
        },
        update: repo.update.bind(repo),
      },
      warn: () => {},
    });
    expect(await broken.resolve({ cookieHeader: "c", member: MEMBER })).toBeNull();

    const unlinkable = new MemberBridgedEarlyAccessIdentity({
      base: { resolve: async () => null },
      customers: {
        findByNormalizedEmail: repo.findByNormalizedEmail.bind(repo),
        update: async () => {
          throw new Error("write refused");
        },
      },
      warn: () => {},
    });
    expect(await unlinkable.resolve({ cookieHeader: "c", member: MEMBER })).toBeNull();
  });
});
