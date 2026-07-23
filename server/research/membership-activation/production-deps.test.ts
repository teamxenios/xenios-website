import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY15_CHECKLIST_ITEMS,
  SupabaseEvidenceMediaProvider,
  buildFoundingActivationDependencies,
  createInMemoryChecklistStore,
  createSupabaseLedger,
  createSupabaseMembershipWriter,
  createSupabaseReceipts,
  memberStatusToMembershipStatus,
  type FoundingActivationWiring,
} from "./production-deps";
import { SyntheticDataInProductionError } from "../commerce/production-guards";
import { createInMemoryObligationsStore } from "./persistence/obligations-store";
import { createInMemoryPeriodsStore } from "./persistence/periods-store";
import { createInMemoryPaymentMethodsStore } from "./persistence/payment-methods-store";
import { createInMemoryBridgeStore } from "./persistence/bridge-store";
import { createInMemoryDocumentsStore } from "./persistence/documents-store";
import { createInMemoryIdentityStore } from "./persistence/identity-store";
import {
  createInMemoryLedger,
  createInMemoryMembershipState,
  createInMemoryReceipts,
} from "./activation";
import { InMemoryIdempotencyStore } from "../commerce/persistence/idempotency-store";
import { InMemoryIdentityMediaProvider } from "./identity-documents";
import type { InstructionCipher } from "./payment-methods";

// ---------------------------------------------------------------------------
// Three-state proof of the founding-activation composition. Environments are
// injected objects; process.env is never mutated and no flag is flipped
// outside these test objects.
// ---------------------------------------------------------------------------

const NOW = () => new Date("2026-07-22T00:00:00Z");

const LIVE_ENV: NodeJS.ProcessEnv = {
  RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true",
  SUPABASE_URL: "https://activation.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_activation_key",
};

const RESOLVER_NAMES = [
  "resolveObligationsStore",
  "resolvePeriodsStore",
  "resolvePaymentMethodsStore",
  "resolveBridgeStore",
  "resolveDocumentsStore",
  "resolveIdentityStore",
  "resolveMembershipWriter",
  "resolveLedger",
  "resolveReceipts",
  "resolveIdempotencyStore",
  "resolveIdentityMedia",
  "resolveEvidenceMedia",
  "resolveInstructionCipher",
  "resolveChecklistStore",
] as const;

function refusingWiring(): {
  wiring: Partial<FoundingActivationWiring>;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  const wiring: Record<string, unknown> = {};
  for (const name of RESOLVER_NAMES) {
    const fn = vi.fn(() => {
      throw new Error(`${name} must not be called in this state`);
    });
    spies[name] = fn;
    wiring[name] = fn;
  }
  const memberEmail = vi.fn(async () => {
    throw new Error("memberEmail must not be called in this state");
  });
  const enqueueEmail = vi.fn(async () => {
    throw new Error("enqueueEmail must not be called in this state");
  });
  spies.memberEmail = memberEmail;
  spies.enqueueEmail = enqueueEmail;
  wiring.memberEmail = memberEmail;
  wiring.enqueueEmail = enqueueEmail;
  return { wiring: wiring as Partial<FoundingActivationWiring>, spies };
}

function expectNoResolverRan(spies: Record<string, ReturnType<typeof vi.fn>>): void {
  for (const [name, spy] of Object.entries(spies)) {
    expect(spy, `${name} ran`).not.toHaveBeenCalled();
  }
}

const testCipher: InstructionCipher = {
  encrypt: (plaintext) => `testenc:${Buffer.from(plaintext, "utf8").toString("base64")}`,
  decrypt: (ciphertext) => Buffer.from(ciphertext.slice("testenc:".length), "base64").toString("utf8"),
};

function inMemoryWiring(overrides: Partial<FoundingActivationWiring> = {}): Partial<FoundingActivationWiring> {
  const media = new InMemoryIdentityMediaProvider();
  return {
    resolveObligationsStore: () => createInMemoryObligationsStore(),
    resolvePeriodsStore: () => createInMemoryPeriodsStore(),
    resolvePaymentMethodsStore: () => createInMemoryPaymentMethodsStore(),
    resolveBridgeStore: () => createInMemoryBridgeStore(),
    resolveDocumentsStore: () => createInMemoryDocumentsStore(),
    resolveIdentityStore: () => createInMemoryIdentityStore(),
    resolveMembershipWriter: () => createInMemoryMembershipState(),
    resolveLedger: () => createInMemoryLedger(),
    resolveReceipts: () => createInMemoryReceipts(),
    resolveIdempotencyStore: () => new InMemoryIdempotencyStore(),
    resolveIdentityMedia: () => media,
    resolveEvidenceMedia: () => media,
    resolveInstructionCipher: () => testCipher,
    resolveChecklistStore: () => createInMemoryChecklistStore(),
    memberEmail: async () => null,
    enqueueEmail: async () => true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("state 1: flag off (the production default)", () => {
  it("resolves to disabled and touches no resolver, store, or provider", () => {
    const { wiring, spies } = refusingWiring();
    const deps = buildFoundingActivationDependencies(NOW, {}, wiring);
    expect(deps.state).toBe("disabled");
    expect("services" in deps).toBe(false);
    expectNoResolverRan(spies);
  });

  it("is the default when built bare (process.env carries no flag in tests)", () => {
    expect(buildFoundingActivationDependencies().state).toBe("disabled");
  });

  it("treats anything but the exact string true as off", () => {
    for (const value of ["TRUE", "1", "yes", "", undefined]) {
      const deps = buildFoundingActivationDependencies(NOW, {
        ...LIVE_ENV,
        RESEARCH_FOUNDING_ACTIVATION_ENABLED: value,
      });
      expect(deps.state, `flag value ${JSON.stringify(value)}`).toBe("disabled");
    }
  });
});

describe("state 2: flag on, storage not provisioned", () => {
  it("resolves to unprovisioned and still touches nothing", () => {
    const { wiring, spies } = refusingWiring();
    const deps = buildFoundingActivationDependencies(
      NOW,
      { RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true" },
      wiring,
    );
    expect(deps.state).toBe("unprovisioned");
    expectNoResolverRan(spies);
  });

  it("requires BOTH storage values", () => {
    const partial = buildFoundingActivationDependencies(NOW, {
      RESEARCH_FOUNDING_ACTIVATION_ENABLED: "true",
      SUPABASE_URL: "https://activation.supabase.co",
    });
    expect(partial.state).toBe("unprovisioned");
  });
});

describe("state 3: flag on and configured", () => {
  it("composes the live services over the injected wiring", () => {
    const deps = buildFoundingActivationDependencies(NOW, LIVE_ENV, inMemoryWiring());
    expect(deps.state).toBe("live");
    if (deps.state !== "live") throw new Error("unreachable");
    expect(typeof deps.services.status).toBe("function");
    expect(typeof deps.services.admin.verify).toBe("function");
  });

  it("resolves the instruction cipher LAZILY: a missing key fails the method create, not the boot", async () => {
    const cipherSpy = vi.fn((): InstructionCipher => {
      throw new Error("no cipher key configured");
    });
    const deps = buildFoundingActivationDependencies(
      NOW,
      LIVE_ENV,
      inMemoryWiring({ resolveInstructionCipher: cipherSpy }),
    );
    expect(deps.state).toBe("live");
    expect(cipherSpy).not.toHaveBeenCalled();
    if (deps.state !== "live") throw new Error("unreachable");
    await expect(
      deps.services.admin.createMethod(
        { adminId: "samuel@admin.test", ip: null, userAgent: null },
        {
          methodId: "zelle-1",
          providerCode: "zelle",
          memberFacingName: "Zelle",
          adminFacingName: "Zelle business",
          duration: "permanent",
          activationEligible: true,
          renewalEligible: true,
          settlementTime: "same day",
          receivingLegalEntity: "Xenios Technology LLC",
          ownershipClassification: "business",
          receivingInstructions: "wire-test-destination-value",
        },
      ),
    ).rejects.toThrow("no cipher key configured");
    expect(cipherSpy).toHaveBeenCalledOnce();
  });

  it("refuses to compose over a synthetic configuration marker, BEFORE any resolver runs", () => {
    const { wiring, spies } = refusingWiring();
    expect(() =>
      buildFoundingActivationDependencies(
        NOW,
        { ...LIVE_ENV, SUPABASE_URL: "https://project.example.invalid" },
        wiring,
      ),
    ).toThrow(SyntheticDataInProductionError);
    expectNoResolverRan(spies);
  });

  it("scans the identity and evidence bucket configuration too", () => {
    expect(() =>
      buildFoundingActivationDependencies(NOW, {
        ...LIVE_ENV,
        RESEARCH_IDENTITY_BUCKET: "TEST_LOT_bucket",
      }),
    ).toThrow(SyntheticDataInProductionError);
  });
});

// ---------------------------------------------------------------------------
// The domain-port adapters (fake Supabase clients; no network anywhere)
// ---------------------------------------------------------------------------

describe("memberStatusToMembershipStatus", () => {
  it("maps the existing member vocabulary onto the domain states", () => {
    expect(memberStatusToMembershipStatus("active")).toBe("active");
    expect(memberStatusToMembershipStatus("past_due")).toBe("suspended");
    expect(memberStatusToMembershipStatus("closed")).toBe("cancelled");
    expect(memberStatusToMembershipStatus("pending_activation")).toBe("pending_activation");
    expect(memberStatusToMembershipStatus("anything-else")).toBe("pending_activation");
  });
});

describe("createSupabaseMembershipWriter", () => {
  function fakeMembers(initial: Record<string, { status: string; activated_at: string | null }>) {
    const rows = { ...initial };
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const client = {
      from: () => ({
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: rows[id] ?? null, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            updates.push({ id, patch });
            if (rows[id]) {
              rows[id] = {
                status: (patch.status as string) ?? rows[id].status,
                activated_at: (patch.activated_at as string | null) ?? rows[id].activated_at,
              };
            }
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    return { client, rows, updates };
  }

  it("reads state through the mapping and fails loudly on a missing member", async () => {
    const { client } = fakeMembers({ m1: { status: "past_due", activated_at: "2026-01-01T00:00:00Z" } });
    const writer = createSupabaseMembershipWriter(client);
    expect(await writer.getState("m1")).toEqual({
      memberId: "m1",
      status: "suspended",
      activatedAt: "2026-01-01T00:00:00Z",
    });
    await expect(writer.getState("nope")).rejects.toThrow("no research member");
  });

  it("preserves the FIRST activation timestamp and writes billing_state", async () => {
    const { client, updates } = fakeMembers({
      m1: { status: "past_due", activated_at: "2026-01-01T00:00:00Z" },
    });
    const writer = createSupabaseMembershipWriter(client);
    await writer.setActive("m1", "2026-07-22T00:00:00Z");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toEqual({
      status: "active",
      billing_state: "active",
      activated_at: "2026-01-01T00:00:00Z",
    });
    await writer.setSuspended("m1", "2026-08-01T00:00:00Z");
    expect(updates[1].patch).toEqual({ status: "past_due", billing_state: "past_due" });
  });
});

describe("createSupabaseLedger", () => {
  it("appends rows and reads them back through the port shape", async () => {
    const inserted: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
        select: () => ({
          eq: async () => ({ data: inserted, error: null }),
        }),
      }),
    } as unknown as SupabaseClient;
    const ledger = createSupabaseLedger(client);
    await ledger.append({
      entryId: "e1",
      memberId: "m1",
      obligationId: "o1",
      entryType: "activation_payment",
      amountCents: 5000,
      recordedAt: "2026-07-22T00:00:00Z",
      actorId: "samuel@admin.test",
    });
    expect(inserted[0]).toMatchObject({ entry_id: "e1", amount_cents: 5000, entry_type: "activation_payment" });
    const listed = await ledger.listByObligation("o1");
    expect(listed).toHaveLength(1);
    expect(listed[0].entryId).toBe("e1");
    expect(listed[0].amountCents).toBe(5000);
  });
});

describe("createSupabaseReceipts", () => {
  it("returns the WINNER on a unique violation instead of a second receipt", async () => {
    const existingRow = {
      id: "winner-id",
      receipt_number: "RCPT-XRM-AAAAAAAA",
      obligation_id: "o1",
      member_id: "m1",
      amount_cents: 5000,
      currency: "USD",
      method_label: "Zelle",
      issued_at: "2026-07-22T00:00:00Z",
    };
    const client = {
      from: () => ({
        insert: async () => ({ error: { code: "23505", message: "duplicate key" } }),
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: existingRow, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    const receipts = createSupabaseReceipts(client);
    const issued = await receipts.issueOnce({
      receiptId: "loser-id",
      receiptNumber: "RCPT-XRM-BBBBBBBB",
      obligationId: "o1",
      memberId: "m1",
      amountCents: 5000,
      currency: "USD",
      methodLabel: "Zelle",
      issuedAt: "2026-07-22T01:00:00Z",
    });
    expect(issued.receiptId).toBe("winner-id");
    expect(issued.receiptNumber).toBe("RCPT-XRM-AAAAAAAA");
  });

  it("throws loudly on any other insert error", async () => {
    const client = {
      from: () => ({
        insert: async () => ({ error: { code: "XX000", message: "boom" } }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as unknown as SupabaseClient;
    const receipts = createSupabaseReceipts(client);
    await expect(
      receipts.issueOnce({
        receiptId: "r1",
        receiptNumber: "RCPT-XRM-CCCCCCCC",
        obligationId: "o2",
        memberId: "m1",
        amountCents: 2500,
        currency: "USD",
        methodLabel: "Zelle",
        issuedAt: "2026-07-22T00:00:00Z",
      }),
    ).rejects.toThrow("receipt insert failed");
  });
});

describe("SupabaseEvidenceMediaProvider", () => {
  it("refuses an unsafe storage path (or an unconfigured deployment) without touching storage", async () => {
    const factory = vi.fn(() => {
      throw new Error("bucket factory must not run for a refused input");
    });
    const provider = new SupabaseEvidenceMediaProvider(factory as never);
    const result = await provider.createUploadUrl({
      storagePath: "../escape/path",
      contentType: "image/png",
      contentLengthBytes: 10,
      maxBytes: 100,
      expiresInSeconds: 60,
      now: NOW(),
    });
    expect(result.ok).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("the Day 15 checklist", () => {
  it("defines unique item keys", () => {
    const keys = DAY15_CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it("round-trips through the in-memory store", async () => {
    const store = createInMemoryChecklistStore();
    expect(await store.get()).toEqual({});
    await store.put({
      replacement_provider_selected: {
        done: true,
        note: null,
        updatedBy: "samuel@admin.test",
        updatedAt: "2026-07-22T00:00:00Z",
      },
    });
    expect((await store.get()).replacement_provider_selected.done).toBe(true);
  });
});
