import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { describe, expect, it, vi } from "vitest";

import {
  buildEarlyAccessPersistence,
  createEarlyAccessSupabaseQuery,
  decideEarlyAccessPersistence,
  earlyAccessRpcUnavailableReason,
} from "./production-deps";
import { EarlyAccessCapabilityUnavailableError } from "./executor";
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
import { SupabaseEarlyAccessCartStore } from "../cart/supabase-store";
import { SupabaseProofSubmissionStore } from "../proof/supabase-submission-store";
import { SupabaseEarlyAccessLegalBindingDirectory } from "../legal/supabase-legal-binding-directory";
import {
  EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT,
  EARLY_ACCESS_PRODUCT_POLICY_SLUG,
  policies,
  RESEARCH_USE_POLICY_AGREEMENT,
} from "../../policies-data";

const OWNER = "3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90";

const SHIPPING_RPC = "research_early_access_cart_shipping_commitments_due";
const MISSING_MESSAGE = `Could not find the function public.${SHIPPING_RPC}(p_now) in the schema cache`;
const MISSING_DETAILS = `Searched for the function public.${SHIPPING_RPC} with parameter p_now or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`;

type FixtureReply =
  | Readonly<{ status: number; body: unknown }>
  | Readonly<{ status: number; text: string }>
  | Readonly<{ reject: Error }>;

/**
 * A REAL supabase-js client whose only fake is `fetch`. The SDK builds the
 * request and parses the response exactly as it does in production, so the
 * boundary is tested against the SDK's actual error shape.
 */
function realSdk(replies: FixtureReply[]) {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("unexpected extra request");
    if ("reject" in reply) throw reply.reject;
    const text = "text" in reply ? reply.text : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const client = createClient("https://persistence-fixture.example.invalid", "synthetic-service-role-key", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Match server/supabase.ts: Node 20 needs the installed transport even
    // though an RPC never opens a realtime connection.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  return { client, requests, fetch };
}

const PRODUCTION_DURABLE_ENV = Object.freeze({
  NODE_ENV: "production",
  RESEARCH_EARLY_ACCESS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
});

function exactAgreementConfig(
  agreement: Readonly<{ kind: string; version: string }> = EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT,
): string {
  return JSON.stringify([agreement]);
}

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
  it("memory mode passes exactly ONE override: the session-identity kill switch, disabled by default", () => {
    // Local development keeps register.ts's in-memory store defaults. The one
    // deliberate exception is the session-identity switch, passed through with
    // production semantics so a local rehearsal rehearses the truth. With no
    // environment set it is explicitly false, which IS the register default.
    const build = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv);
    expect(build.mode).toBe("memory");
    expect(Object.keys(build.options)).toEqual(["sessionIdentity"]);
    expect(build.options.sessionIdentity).toBe(false);
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

  // The other half of F4. The refusal proves production cannot fall back to
  // RAM; this proves production can actually mount a cart at all. Without the
  // durable store in these options, turning the flag on in production could
  // only ever throw, so the "cart enabled" branch was unreachable in the one
  // environment it exists for.
  it("durable mode supplies the DURABLE cart store, so a production cart is possible without memory", () => {
    const build = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.mode).toBe("durable");
    expect(build.options.cartCheckoutStore).toBeInstanceOf(SupabaseEarlyAccessCartStore);
  });

  it("refused and memory modes supply NO cart store, so neither can reach a durable or a RAM cart by omission", () => {
    const refused = buildEarlyAccessPersistence(
      {
        NODE_ENV: "production",
        RESEARCH_EARLY_ACCESS_ENABLED: "true",
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(refused.mode).toBe("refused");
    expect(refused.options.cartCheckoutStore).toBeUndefined();

    const memory = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv, async () => null);
    expect(memory.mode).toBe("memory");
    expect(memory.options.cartCheckoutStore).toBeUndefined();
  });

  // The same shape as the cart store rule, applied to the customer's last step.
  // Registration mounts the payment-proof door ONLY when these are present, so
  // an absent key is an absent route rather than a route over a store that
  // forgets a submission on the next restart.
  it("durable mode supplies the DURABLE proof dependencies, and nothing else does", async () => {
    const durable = buildEarlyAccessPersistence(
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(durable.mode).toBe("durable");
    const proof = durable.options.proofDependencies;
    expect(proof).toBeDefined();
    expect(proof?.submissions).toBeInstanceOf(SupabaseProofSubmissionStore);
    expect(proof?.bindings).toBeInstanceOf(SupabaseEarlyAccessLegalBindingDirectory);
    // No package is designated, so the agreement checkpoint refuses. That is
    // the target state until a named human designates and publishes one, and
    // it is asserted here so nobody "fixes" it by loosening the gate.
    await expect(proof?.agreements.standingFor(OWNER)).resolves.toMatchObject({
      satisfied: false,
    });

    const refused = buildEarlyAccessPersistence(
      {
        NODE_ENV: "production",
        RESEARCH_EARLY_ACCESS_ENABLED: "true",
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(refused.options.proofDependencies).toBeUndefined();

    const memory = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv, async () => null);
    expect(memory.options.proofDependencies).toBeUndefined();
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
          { kind: "early_access_terms", version: "v2" },
        ]),
      } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(build.options.agreements).toBeDefined();
  });

  it.each([
    ["missing", undefined],
    ["an older version", JSON.stringify([{ kind: "early_access_terms", version: "v0" }])],
    // The cutover's own failure mode: v2 code shipped while the deployment still
    // states the historical v1 pair. Every commerce path stays closed.
    ["the historical v1 pair", JSON.stringify([RESEARCH_USE_POLICY_AGREEMENT])],
    [
      "multiple pairs",
      JSON.stringify([
        EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT,
        { kind: "early_access_terms", version: "v0" },
      ]),
    ],
    [
      "the current pair beside the historical one",
      JSON.stringify([EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT, RESEARCH_USE_POLICY_AGREEMENT]),
    ],
  ])(
    "production commerce refuses before constructing authority when required agreements are %s",
    (_label, configured) => {
      const query = vi.fn(async () => true);
      const build = buildEarlyAccessPersistence(
        {
          ...PRODUCTION_DURABLE_ENV,
          ...(configured === undefined
            ? {}
            : { RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: configured }),
        } as NodeJS.ProcessEnv,
        query,
      );

      expect(build.mode).toBe("refused");
      expect(build.reason).toContain("does not exactly match");
      expect(build.options.store).toBeInstanceOf(RefusingEarlyAccessCommerceStore);
      expect(build.options.repository).toBeUndefined();
      expect(build.options.agreements).toBeUndefined();
      expect(build.options.agreementRecorder).toBeUndefined();
      expect(build.options.requiredAgreements).toBeUndefined();
      expect(build.options.cartCheckoutStore).toBeUndefined();
      expect(build.orderHistory).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["cart", { RESEARCH_EARLY_ACCESS_CART_ENABLED: "true" }],
    ["assisted order", { RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED: "true" }],
  ])(
    "the independently enabled production %s cannot mount an old agreement gate",
    (_label, enabledFlag) => {
      const query = vi.fn(async () => true);
      const build = buildEarlyAccessPersistence(
        {
          ...PRODUCTION_DURABLE_ENV,
          RESEARCH_EARLY_ACCESS_ENABLED: "false",
          ...enabledFlag,
          RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: JSON.stringify([
            { kind: "early_access_terms", version: "v0" },
          ]),
        } as NodeJS.ProcessEnv,
        query,
      );

      expect(build.mode).toBe("refused");
      expect(build.options.requiredAgreements).toBeUndefined();
      expect(build.options.agreements).toBeUndefined();
      expect(build.options.cartCheckoutStore).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("production refuses when the policy API has no published agreement identity", () => {
    const policy = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG] as unknown as { agreement?: unknown };
    const originalAgreement = policy.agreement;
    const query = vi.fn(async () => true);
    Reflect.deleteProperty(policy, "agreement");
    try {
      const build = buildEarlyAccessPersistence(
        {
          ...PRODUCTION_DURABLE_ENV,
          RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: exactAgreementConfig(),
        } as NodeJS.ProcessEnv,
        query,
      );
      expect(build.mode).toBe("refused");
      expect(build.reason).toContain("does not exactly match");
      expect(build.options.agreements).toBeUndefined();
      expect(build.options.cartCheckoutStore).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    } finally {
      policy.agreement = originalAgreement;
    }
  });

  it("production refuses when the published policy body changes without a new pinned identity", () => {
    const policy = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG] as unknown as { title: string };
    const originalTitle = policy.title;
    const query = vi.fn(async () => true);
    policy.title = `${originalTitle} changed without versioning`;
    try {
      const build = buildEarlyAccessPersistence(
        {
          ...PRODUCTION_DURABLE_ENV,
          RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: exactAgreementConfig(),
        } as NodeJS.ProcessEnv,
        query,
      );
      expect(build.mode).toBe("refused");
      expect(build.options.agreements).toBeUndefined();
      expect(build.options.cartCheckoutStore).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    } finally {
      policy.title = originalTitle;
    }
  });

  it("the shared production gate rechecks published identity at decision time", async () => {
    const policy = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG] as unknown as { agreement?: unknown };
    const originalAgreement = policy.agreement;
    const query = vi.fn(async () => true);
    const build = buildEarlyAccessPersistence(
      {
        ...PRODUCTION_DURABLE_ENV,
        RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: exactAgreementConfig(),
      } as NodeJS.ProcessEnv,
      query,
    );
    expect(build.mode).toBe("durable");
    await expect(build.options.agreements?.accepted(OWNER)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);

    policy.agreement = { kind: "early_access_terms", version: "v3" };
    try {
      await expect(build.options.agreements?.accepted(OWNER)).resolves.toBe(false);
      // Policy drift is refused before asking whether an old row exists.
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      policy.agreement = originalAgreement;
    }
  });

  it("a persisted quote cannot become a checkout when only an older acceptance is on file", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (call: { fn: string }) => {
      calls.push(call.fn);
      if (call.fn === "research_early_access_cart_quote_record") {
        return { customerRef: OWNER };
      }
      if (call.fn === "research_early_access_agreements_accepted") return false;
      throw new Error(`unexpected authority call: ${call.fn}`);
    });
    const build = buildEarlyAccessPersistence(
      {
        ...PRODUCTION_DURABLE_ENV,
        RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: exactAgreementConfig(),
      } as NodeJS.ProcessEnv,
      query,
    );
    expect(build.mode).toBe("durable");
    const cart = build.options.cartCheckoutStore;
    expect(cart).toBeDefined();

    await expect(cart?.get("xeaq_old_policy_quote")).resolves.toBeNull();
    await expect(
      cart?.commit({ customerRef: OWNER } as never),
    ).rejects.toThrow("agreement authority is unavailable");
    expect(calls).toEqual([
      "research_early_access_cart_quote_record",
      "research_early_access_agreements_accepted",
      "research_early_access_agreements_accepted",
    ]);
    expect(calls).not.toContain("research_early_access_commit_cart_checkout");
    expect(query.mock.calls[1]?.[0]).toMatchObject({
      args: { p_required: [EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT] },
    });
  });

  it("the policy-bound cart store still returns a quote with the current acceptance", async () => {
    const quote = Object.freeze({ customerRef: OWNER, marker: "current-policy" });
    const query = vi.fn(async (call: { fn: string }) => {
      if (call.fn === "research_early_access_cart_quote_record") return quote;
      if (call.fn === "research_early_access_agreements_accepted") return true;
      throw new Error(`unexpected authority call: ${call.fn}`);
    });
    const build = buildEarlyAccessPersistence(
      {
        ...PRODUCTION_DURABLE_ENV,
        RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: exactAgreementConfig(),
      } as NodeJS.ProcessEnv,
      query,
    );

    await expect(
      build.options.cartCheckoutStore?.get("xeaq_current_policy_quote"),
    ).resolves.toMatchObject(quote);
    expect(query.mock.calls.map(([call]) => call.fn)).toEqual([
      "research_early_access_cart_quote_record",
      "research_early_access_agreements_accepted",
    ]);
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
    await expect(bindings.bind("s", "c")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceUnavailableError,
    );
  });
});

describe("the trusted SDK boundary: an optional routine proven not installed", () => {
  const NOW = "2026-08-10T12:00:01.000Z";
  const call = Object.freeze({ fn: SHIPPING_RPC, args: Object.freeze({ p_now: NOW }) });
  const missing = Object.freeze({ code: "PGRST202", details: MISSING_DETAILS, hint: null, message: MISSING_MESSAGE });

  async function failureOf(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("expected the call to fail");
  }

  it("reports the exact missing shipping reader as one fixed reason, after one real RPC request", async () => {
    const sdk = realSdk([{ status: 404, body: missing }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)(call));
    expect(error).toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect(error).toMatchObject({ fn: SHIPPING_RPC, reason: "shipping_commitments_reader_not_installed" });
    // The SDK really made the production request.
    expect(sdk.requests).toEqual([{
      url: `https://persistence-fixture.example.invalid/rest/v1/rpc/${SHIPPING_RPC}`,
      method: "POST",
      body: { p_now: NOW },
    }]);
    // Nothing the driver said, and no argument value, is carried.
    const text = `${(error as Error).message} ${JSON.stringify(error)}`;
    for (const leak of ["schema cache", "Searched for", "PGRST202", NOW, "synthetic-service-role-key"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("also accepts a hint that suggests some OTHER routine, which says nothing about this one", async () => {
    const sdk = realSdk([{ status: 404, body: { ...missing, hint: "Perhaps you meant to call the function public.research_early_access_cart_shipping_policy" } }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)(call));
    expect(error).toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
  });

  it.each([
    ["the same routine installed with OTHER arguments (wrong ABI, named in the hint)", { status: 404, body: { ...missing, hint: `Perhaps you meant to call the function public.${SHIPPING_RPC}(p_at)` } }],
    ["PGRST202 for a different argument list", { status: 404, body: { ...missing, message: `Could not find the function public.${SHIPPING_RPC}(p_now, p_limit) in the schema cache` } }],
    ["PGRST202 naming another schema", { status: 404, body: { ...missing, message: `Could not find the function private.${SHIPPING_RPC}(p_now) in the schema cache` } }],
    ["the right code and text under a non-404 status", { status: 400, body: missing }],
    ["the right status and text under another code", { status: 404, body: { ...missing, code: "PGRST200" } }],
    ["a function missing INSIDE an installed body (SQLSTATE 42883, also served as 404)", { status: 404, body: { code: "42883", details: null, hint: "No function matches the given name and argument types.", message: "function public.research_shipping_helper(timestamp with time zone) does not exist" } }],
    ["ambiguous overloads (PGRST203)", { status: 300, body: { code: "PGRST203", details: null, hint: "Try renaming the parameters", message: `Could not choose the best candidate function between: public.${SHIPPING_RPC}(p_now => text), public.${SHIPPING_RPC}(p_now => timestamp with time zone)` } }],
    ["permission denied (42501)", { status: 403, body: { code: "42501", details: null, hint: null, message: `permission denied for function ${SHIPPING_RPC}` } }],
    ["an absent relation inside the body (42P01)", { status: 404, body: { code: "42P01", details: null, hint: null, message: 'relation "public.research_early_access_cart_shipping_commitments" does not exist' } }],
    ["the schema cache still loading (503)", { status: 503, body: { code: "PGRST002", details: null, hint: null, message: "Could not query the database for the schema cache. Retrying." } }],
    ["a malformed, non-JSON error body", { status: 404, text: "<html>not found</html>" }],
  ] as const)("keeps %s an ordinary opaque failure", async (_label, reply) => {
    const sdk = realSdk([reply]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)(call));
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect((error as Error).message).toBe(`rpc ${SHIPPING_RPC} failed`);
    expect(sdk.requests).toHaveLength(1);
  });

  // These are HTTP error bodies parsed by the real SDK, not direct classifier
  // calls. The old boundary ignored details and accepted unsupported hints.
  it.each([
    ["only code/message, without details or hint", { code: "PGRST202", message: MISSING_MESSAGE }],
    ["missing details", { code: "PGRST202", message: MISSING_MESSAGE, hint: null }],
    ["missing hint", { code: "PGRST202", message: MISSING_MESSAGE, details: MISSING_DETAILS }],
    ["null details", { ...missing, details: null }],
    ["boolean details", { ...missing, details: false }],
    ["numeric details", { ...missing, details: 202 }],
    ["object details", { ...missing, details: {} }],
    ["array details", { ...missing, details: [MISSING_DETAILS] }],
    ["details naming another routine", { ...missing, details: MISSING_DETAILS.replace(SHIPPING_RPC, "research_early_access_cart_shipping_policy") }],
    ["details naming another argument", { ...missing, details: MISSING_DETAILS.replace("parameter p_now", "parameter p_at") }],
    ["details naming another schema", { ...missing, details: MISSING_DETAILS.replace("public.", "private.") }],
    ["unsupported details wording", { ...missing, details: "No matching routine was observed." }],
    ["object hint", { ...missing, hint: {} }],
    ["array hint", { ...missing, hint: [] }],
    ["numeric hint", { ...missing, hint: 202 }],
    ["boolean hint", { ...missing, hint: false }],
    ["empty hint", { ...missing, hint: "" }],
    ["unsupported hint wording", { ...missing, hint: "untrusted driver hint synthetic-private-detail" }],
    ["hint naming a private schema", { ...missing, hint: "Perhaps you meant to call the function private.research_early_access_cart_shipping_policy" }],
    ["hint with malformed argument list", { ...missing, hint: "Perhaps you meant to call the function public.research_early_access_cart_shipping_policy(p_at,, p_limit)" }],
    ["hint with an appended diagnostic", { ...missing, hint: "Perhaps you meant to call the function public.research_early_access_cart_shipping_policy synthetic-private-detail" }],
    ["hint with a final newline", { ...missing, hint: "Perhaps you meant to call the function public.research_early_access_cart_shipping_policy\n" }],
    ["hint with a final CRLF", { ...missing, hint: "Perhaps you meant to call the function public.research_early_access_cart_shipping_policy\r\n" }],
    ["hint naming this routine without arguments", { ...missing, hint: `Perhaps you meant to call the function public.${SHIPPING_RPC}` }],
    ["hint contradicting absence with the exact ABI", { ...missing, hint: `Perhaps you meant to call the function public.${SHIPPING_RPC}(p_now)` }],
  ] as const)("keeps malformed or unsupported structured evidence opaque: %s", async (_label, body) => {
    const sdk = realSdk([{ status: 404, body }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)(call));
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect((error as Error).message).toBe(`rpc ${SHIPPING_RPC} failed`);
    expect(sdk.requests).toEqual([{
      url: `https://persistence-fixture.example.invalid/rest/v1/rpc/${SHIPPING_RPC}`,
      method: "POST",
      body: { p_now: NOW },
    }]);
    const text = `${(error as Error).message} ${JSON.stringify(error)}`;
    for (const leak of ["schema cache", "Searched for", "PGRST202", NOW, "synthetic-service-role-key", "synthetic-private-detail", "Perhaps you meant"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("keeps a network failure (the SDK reports status 0) an ordinary opaque failure", async () => {
    const sdk = realSdk([{ reject: new TypeError("fetch failed") }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)(call));
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect((error as Error).message).toBe(`rpc ${SHIPPING_RPC} failed`);
  });

  it("never classifies another RPC, even with a perfect missing-function answer of its own", async () => {
    const other = "research_early_access_cart_quote_for";
    const sdk = realSdk([{ status: 404, body: { ...missing, message: `Could not find the function public.${other}(p_now) in the schema cache` } }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)({ fn: other, args: { p_now: NOW } }));
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect((error as Error).message).toBe(`rpc ${other} failed`);
  });

  it("never classifies the shipping RPC called with any argument set other than exactly { p_now }", async () => {
    const sdk = realSdk([{ status: 404, body: missing }]);
    const error = await failureOf(createEarlyAccessSupabaseQuery(() => sdk.client)({ fn: SHIPPING_RPC, args: { p_now: NOW, p_limit: 10 } }));
    expect(error).not.toBeInstanceOf(EarlyAccessCapabilityUnavailableError);
    expect(earlyAccessRpcUnavailableReason({ fn: SHIPPING_RPC, args: {} }, { error: missing, status: 404 })).toBeNull();
    expect(earlyAccessRpcUnavailableReason({ fn: SHIPPING_RPC, args: { now: NOW } }, { error: missing, status: 404 })).toBeNull();
  });

  it("returns the installed reader's real rows and its actual empty result unchanged", async () => {
    const row = { cartCheckoutNumber: "XEC-0123456789ABCDEF", shipByAt: "2026-08-10 12:00:00+00", stage: "processing" };
    const sdk = realSdk([{ status: 200, body: [row] }, { status: 200, body: [] }]);
    const query = createEarlyAccessSupabaseQuery(() => sdk.client);
    expect(await query(call)).toEqual([row]);
    expect(await query(call)).toEqual([]);
    expect(sdk.requests).toHaveLength(2);
  });
});
