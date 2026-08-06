import { describe, expect, it } from "vitest";

import {
  buildEarlyAccessPersistence,
  decideEarlyAccessPersistence,
} from "./production-deps";
import {
  EarlyAccessPersistenceUnavailableError,
  RefusingConsumedTokenStore,
  RefusingEarlyAccessAuditSink,
  RefusingEarlyAccessCommerceStore,
  RefusingEarlyAccessCustomerRepository,
  RefusingSessionBindingStore,
} from "./refusing";
import { SupabaseConsumedTokenStore } from "./identity";
import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import { SupabaseEarlyAccessCustomerRepository } from "./identity";
import { SupabaseEarlyAccessReleaseLedger } from "./records";
import { SupabaseEarlyAccessProofStorage } from "./proof-storage";
import { SupabasePrivateAccessSessionRepository } from "../private-access-session-repository";

const OWNER = "3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90";

function environment(
  overrides: Partial<{
    productionLike: boolean;
    earlyAccessFlag: string | undefined;
    supabaseAvailable: boolean;
    ownerId: string | null;
  }> = {},
) {
  return {
    productionLike: false,
    earlyAccessFlag: undefined,
    supabaseAvailable: false,
    ownerId: null,
    ...overrides,
  };
}

describe("decideEarlyAccessPersistence: the production adapter rule", () => {
  it("refuses production-like + enabled + no Supabase (never memory)", () => {
    const decision = decideEarlyAccessPersistence(
      environment({ productionLike: true, earlyAccessFlag: "true", supabaseAvailable: false }),
    );
    expect(decision.mode).toBe("refused");
    expect(decision.reason).toContain("forced closed");
    expect(decision.reason).toContain("In-memory fallback is not available");
  });

  it("refuses production-like + enabled + Supabase but no owner id", () => {
    const decision = decideEarlyAccessPersistence(
      environment({
        productionLike: true,
        earlyAccessFlag: "true",
        supabaseAvailable: true,
        ownerId: null,
      }),
    );
    expect(decision.mode).toBe("refused");
    expect(decision.reason).toContain("RESEARCH_EARLY_ACCESS_OWNER_ID");
  });

  it("goes durable for production-like + enabled + full configuration", () => {
    const decision = decideEarlyAccessPersistence(
      environment({
        productionLike: true,
        earlyAccessFlag: "true",
        supabaseAvailable: true,
        ownerId: OWNER,
      }),
    );
    expect(decision.mode).toBe("durable");
    expect(decision.warnings).toEqual([]);
  });

  it("production-like with the feature DISABLED does not refuse: the flag already fails the routes closed", () => {
    const decision = decideEarlyAccessPersistence(
      environment({ productionLike: true, earlyAccessFlag: "false", supabaseAvailable: false }),
    );
    expect(decision.mode).toBe("memory");
  });

  it("local development without Supabase runs in memory WITH an explicit warning", () => {
    const decision = decideEarlyAccessPersistence(environment());
    expect(decision.mode).toBe("memory");
    expect(decision.warnings.join(" ")).toContain("nothing survives a restart");
  });

  it("any deployment with Supabase configured prefers durable, warning when the session owner is missing", () => {
    const decision = decideEarlyAccessPersistence(
      environment({ supabaseAvailable: true, ownerId: null }),
    );
    expect(decision.mode).toBe("durable");
    expect(decision.warnings.join(" ")).toContain("SESSION store stays in-memory");
  });

  it("the flag value must be exactly 'true' to count as enabled", () => {
    for (const flag of ["TRUE", "1", "yes", "", undefined]) {
      const decision = decideEarlyAccessPersistence(
        environment({ productionLike: true, earlyAccessFlag: flag, supabaseAvailable: false }),
      );
      expect(decision.mode).toBe("memory");
    }
  });
});

describe("buildEarlyAccessPersistence: what each mode actually mounts", () => {
  it("memory mode passes NO overrides, so register keeps its in-memory defaults", () => {
    const build = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv);
    expect(build.mode).toBe("memory");
    expect(Object.keys(build.options)).toEqual([]);
  });

  it("refused mode mounts the refusing stores and deliberately NO session repository", () => {
    const build = buildEarlyAccessPersistence({
      NODE_ENV: "production",
      RESEARCH_EARLY_ACCESS_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(build.mode).toBe("refused");
    expect(build.reason).not.toBeNull();
    expect(build.options.store).toBeInstanceOf(RefusingEarlyAccessCommerceStore);
    expect(build.options.audit).toBeInstanceOf(RefusingEarlyAccessAuditSink);
    expect(build.options.customers).toBeInstanceOf(RefusingEarlyAccessCustomerRepository);
    expect(build.options.sessionBindings).toBeInstanceOf(RefusingSessionBindingStore);
    expect(build.options.consumed).toBeInstanceOf(RefusingConsumedTokenStore);
    // No repository: the session layer's own gate then forces enabled=false.
    expect(build.options.repository).toBeUndefined();
  });

  it("durable mode mounts every durable repository and the session repository when the owner is set", () => {
    const build = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.mode).toBe("durable");
    expect(build.options.store).toBeInstanceOf(SupabaseEarlyAccessCommerceStore);
    expect(build.options.customers).toBeInstanceOf(SupabaseEarlyAccessCustomerRepository);
    expect(build.options.releases).toBeInstanceOf(SupabaseEarlyAccessReleaseLedger);
    expect(build.options.proofStorage).toBeInstanceOf(SupabaseEarlyAccessProofStorage);
    expect(build.options.repository).toBeInstanceOf(SupabasePrivateAccessSessionRepository);
    expect(build.options.suppliers).toBeDefined();
    expect(build.options.shipping).toBeDefined();
    expect(build.options.referrals).toBeDefined();
    expect(build.options.audit).toBeDefined();
    expect(build.options.sessionBindings).toBeDefined();
    expect(build.options.consumed).toBeInstanceOf(SupabaseConsumedTokenStore);
  });

  it("durable mode keeps the fail-closed agreement placeholder until the required list is stated", () => {
    const build = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.options.agreements).toBeUndefined();
    expect(build.warnings.join(" ")).toContain("agreement gate stays fail-closed");
  });

  it("durable mode mounts the durable agreement gate when the required list is stated", () => {
    const build = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
        RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: JSON.stringify([
          { kind: "early_access_terms", version: "v1" },
        ]),
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.options.agreements).toBeDefined();
  });

  it("a malformed required-agreements value is treated as unset, fail-closed, with a warning", () => {
    const build = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
        RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: "not json",
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.options.agreements).toBeUndefined();
    expect(build.warnings.join(" ")).toContain("treating it as unset");
  });

  it("a production flag other than NODE_ENV also makes the process production-like", () => {
    const build = buildEarlyAccessPersistence({
      RESEARCH_LIVE_SHIPPING_ENABLED: "true",
      RESEARCH_EARLY_ACCESS_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(build.mode).toBe("refused");
  });
});

describe("the refusing stores hold nothing and refuse loudly", () => {
  it("every commerce method throws the persistence-unavailable error", async () => {
    const store = new RefusingEarlyAccessCommerceStore();
    await expect(store.placementByIdempotencyKey("k")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.placementByOrderNumber("XEA-1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitPlacement({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.awaitingReview()).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.proofs("XEA-1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitProof({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.verifications("XEA-1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.settlement("XEA-1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitSettlement({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.dispatch("XEA-1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitDispatchEvent({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitTracking({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(store.commitFulfillment({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
  });

  it("the refusal names what is missing so an operator can act", async () => {
    const store = new RefusingEarlyAccessCommerceStore();
    await expect(store.awaitingReview()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    await expect(store.awaitingReview()).rejects.toThrow(/In-memory fallback/);
  });

  it("identity and audit refusals behave the same way", async () => {
    await expect(new RefusingEarlyAccessAuditSink().record({} as never)).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    const customers = new RefusingEarlyAccessCustomerRepository();
    await expect(customers.findById("c1")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    const bindings = new RefusingSessionBindingStore();
    await expect(bindings.get("s")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
    await expect(bindings.bind("s", "c", "email_entry")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
  });
});
