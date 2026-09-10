// Boundary tests for the managed qualification harness.
//
// These do not qualify anything. They prove the harness cannot lie: that it
// refuses a run it must not perform, that it drives the mounted routes rather
// than service objects, that no secret crosses a boundary, that it counts only
// what this run caused, and that a capability it does not have is reported as
// missing instead of quietly satisfied by an easier path.
//
// Every credential here is a fake in a test shape. No network call is made.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "../../providers/payment";
import { assertQualificationTarget, QualificationRefusal, REQUIRED_SCENARIOS } from "./connected-checkout-journey";
import {
  createManagedJourneySurface,
  type DatabasePort,
  type HttpPort,
  type HttpResponse,
  type ProviderPort,
} from "./managed-journey-binding";
import {
  describeConfig,
  MANAGED_JOURNEY_ENV,
  ManagedJourneyNotRun,
  readManagedJourneyConfig,
  redactSecret,
} from "./managed-journey-config";

const PROJECT = "abcdefghijklmnopqrst";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiJ9.service.signature";
const SECRET_KEY = "sk_test_fakequalificationonly";
const WEBHOOK_SECRET = "whsec_fakequalificationonly";
const PUBLISHABLE_KEY = "pk_test_fakequalification1234";
const APPROVAL = "a".repeat(64);

const members = Array.from({ length: REQUIRED_SCENARIOS.length }, (_, index) => ({
  memberId: `0000000${(index + 1).toString(16).padStart(1, "0")}-0000-4000-8000-00000000000${(index % 10).toString(16)}`
    .replace(/^(.{8})/, (m) => m.padEnd(8, "0"))
    .slice(0, 36),
  accessToken: `eyJhbGciOiJIUzI1NiJ9.member${index}.signature`,
}));
// Guarantee distinct, well-formed uuids without relying on string surgery.
const MEMBERS = members.map((m, index) => ({
  memberId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  accessToken: m.accessToken,
}));

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const E = MANAGED_JOURNEY_ENV;
  return {
    [E.baseUrl]: "https://staging.example.invalid",
    [E.projectRef]: PROJECT,
    [E.serviceRoleKey]: SERVICE_KEY,
    [E.secretKey]: SECRET_KEY,
    [E.webhookSecret]: WEBHOOK_SECRET,
    [E.publishableKey]: PUBLISHABLE_KEY,
    [E.members]: JSON.stringify(MEMBERS),
    [E.ownerApproval]: APPROVAL,
    ...overrides,
  };
}

describe("the run refuses before it touches anything", () => {
  const E = MANAGED_JOURNEY_ENV;
  const cases: Array<[string, Record<string, string | undefined>, string]> = [
    ["there is no application to drive", { [E.baseUrl]: undefined }, "base_url_missing"],
    ["the application origin is not a URL", { [E.baseUrl]: "not a url" }, "base_url_invalid"],
    ["the origin carries a path", { [E.baseUrl]: "https://staging.example.invalid/api" }, "base_url_invalid"],
    ["a remote origin is not https", { [E.baseUrl]: "http://staging.example.invalid" }, "base_url_invalid"],
    ["no project is named", { [E.projectRef]: undefined }, "project_ref_missing"],
    ["the project ref is malformed", { [E.projectRef]: "nope" }, "project_ref_invalid"],
    ["canonical reads have no key", { [E.serviceRoleKey]: undefined }, "service_role_key_missing"],
    ["the provider has no secret", { [E.secretKey]: undefined }, "secret_key_missing"],
    ["the webhook has no signing secret", { [E.webhookSecret]: undefined }, "webhook_secret_missing"],
    ["the publishable key is absent", { [E.publishableKey]: undefined }, "publishable_key_missing"],
    ["a LIVE secret key was supplied", { [E.secretKey]: "sk_live_realmoney" }, "live_secret_key_refused"],
    ["a LIVE publishable key was supplied", { [E.publishableKey]: "pk_live_realmoney" }, "live_publishable_key_refused"],
    ["the secret key is not a test key at all", { [E.secretKey]: "not-a-key" }, "secret_key_malformed"],
    ["the publishable key is malformed", { [E.publishableKey]: "pk_test_x" }, "publishable_key_malformed"],
    ["the webhook secret is malformed", { [E.webhookSecret]: "nope" }, "webhook_secret_malformed"],
    ["there are no synthetic members", { [E.members]: undefined }, "synthetic_members_missing"],
    ["the member list is not JSON", { [E.members]: "{" }, "synthetic_members_unreadable"],
    ["a member id is not a uuid", { [E.members]: JSON.stringify([{ memberId: "someone", accessToken: "a.b.c" }]) }, "synthetic_member_not_a_uuid"],
    [
      "a member has no access token",
      { [E.members]: JSON.stringify([{ memberId: "00000000-0000-4000-8000-000000000001" }]) },
      "synthetic_member_token_missing",
    ],
    [
      "the same member is listed twice",
      { [E.members]: JSON.stringify([MEMBERS[0], MEMBERS[0]]) },
      "synthetic_members_not_distinct",
    ],
    ["there are too few members to isolate scenarios", { [E.members]: JSON.stringify(MEMBERS.slice(0, 3)) }, "synthetic_members_insufficient"],
    ["the owner approval is absent", { [E.ownerApproval]: undefined }, "owner_approval_missing"],
    ["the owner approval is not a digest", { [E.ownerApproval]: "approved" }, "owner_approval_malformed"],
    [
      "the fault channel is reachable off this host",
      { [E.faultControlUrl]: "https://staging.example.invalid" },
      "fault_control_not_loopback",
    ],
  ];

  for (const [name, overrides, code] of cases) {
    it(`refuses when ${name}`, () => {
      try {
        readManagedJourneyConfig(env(overrides));
        throw new Error("expected a refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(ManagedJourneyNotRun);
        expect((error as ManagedJourneyNotRun).code).toBe(code);
        // An operator is told what to fix, by name.
        expect((error as ManagedJourneyNotRun).missing.length).toBeGreaterThan(10);
      }
    });
  }

  it("accepts a loopback application, because the harness may start one itself", () => {
    const config = readManagedJourneyConfig(env({ [MANAGED_JOURNEY_ENV.baseUrl]: "http://127.0.0.1:5000" }));
    expect(config.baseUrl).toBe("http://127.0.0.1:5000");
  });

  it("produces a target the plan gate accepts", () => {
    const config = readManagedJourneyConfig(env());
    const target = assertQualificationTarget(config.target);
    expect(target).toMatchObject({ binding: "managed", mode: "test", projectRef: PROJECT });
    expect(target.syntheticMemberIds).toHaveLength(REQUIRED_SCENARIOS.length);
  });

  it("is refused by the plan gate for the production project, even fully configured", () => {
    const config = readManagedJourneyConfig(env({ [MANAGED_JOURNEY_ENV.projectRef]: "yvzeduaxbwgcwllhywff" }));
    expect(() => assertQualificationTarget(config.target)).toThrow(QualificationRefusal);
  });
});

describe("no secret crosses a boundary", () => {
  it("reduces every credential shape to a statement about it", () => {
    expect(redactSecret(SECRET_KEY)).toBe(`<sk_test_… ${SECRET_KEY.length} chars>`);
    expect(redactSecret(PUBLISHABLE_KEY)).toContain("pk_test_");
    expect(redactSecret(WEBHOOK_SECRET)).toContain("whsec");
    expect(redactSecret(SERVICE_KEY)).toContain("eyJ");
    expect(redactSecret(undefined)).toBe("<absent>");
    for (const value of [SECRET_KEY, PUBLISHABLE_KEY, WEBHOOK_SECRET, SERVICE_KEY]) {
      expect(redactSecret(value)).not.toContain(value.slice(10));
    }
  });

  it("keeps every value out of what an operator is shown", () => {
    const config = readManagedJourneyConfig(env());
    const serialized = JSON.stringify(describeConfig(config));
    for (const secret of [SECRET_KEY, WEBHOOK_SECRET, SERVICE_KEY, PUBLISHABLE_KEY, MEMBERS[0]!.accessToken]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain(PROJECT);
  });
});

// ---------------------------------------------------------------------------

function harness(options: { intents?: Array<Record<string, unknown>>; row?: Record<string, unknown> | null; ports?: Partial<{ browser: unknown; process: unknown; fault: unknown }> } = {}) {
  const config = readManagedJourneyConfig(env());
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body?: unknown; raw?: string }> = [];
  const http: HttpPort = {
    async request(input): Promise<HttpResponse> {
      calls.push(input);
      if (input.url.endsWith("/durable")) {
        return {
          status: 200,
          headers: {},
          body: { ok: true, checkout: { requestKey: "rk-1", orderId: "order-1", state: "authorized", idempotent: false } },
        };
      }
      if (input.url.includes("/continuation")) {
        return {
          status: 200,
          headers: {},
          body: {
            ok: true,
            continuation: {
              state: "action_required",
              orderId: "order-1",
              // The route really does return this. It must not travel further.
              authentication: { clientSecret: "pi_123_secret_THISMUSTNOTLEAK" },
            },
          },
        };
      }
      return { status: 200, headers: {}, body: { ok: true, applied: true } };
    },
  };
  const database: DatabasePort = {
    origin: () => config.databaseUrl,
    overHttp: () => true,
    async selectOne() {
      return options.row === undefined ? null : options.row;
    },
  };
  const provider: ProviderPort = {
    mode: () => "test",
    accountId: () => null,
    async retrieveIntent() {
      return { id: "pi_1", status: "requires_capture", amount_capturable: 21_000, amount_received: 0 };
    },
    async listIntentsSince() {
      return options.intents ?? [];
    },
  };
  const binding = createManagedJourneySurface(config, { http, database, provider, ...(options.ports as object) });
  return { config, binding, calls };
}

describe("it drives the mounted routes, as the member", () => {
  it("posts a checkout to the mounted durable path with the member's own token", async () => {
    const h = harness();
    const memberId = h.config.members[0]!;
    const result = await h.binding.surface.submit(memberId, { idempotencyKey: "k1" } as never);

    expect(result).toMatchObject({ ok: true, requestKey: "rk-1", orderId: "order-1" });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.method).toBe("POST");
    expect(h.calls[0]!.url).toBe("https://staging.example.invalid/api/research/checkout/durable");
    // The member's own credential, not a service role: the guard is exercised.
    expect(h.calls[0]!.headers.Authorization).toBe(`Bearer ${h.config.secrets.accessTokenFor(memberId)}`);
  });

  it("reads and continues an execution through the mounted continuation routes", async () => {
    const h = harness();
    const memberId = h.config.members[1]!;
    await h.binding.surface.status(memberId, "rk-1");
    await h.binding.surface.continue(memberId, "rk-1");
    await h.binding.surface.cancel(memberId, "rk-1");
    expect(h.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "GET /api/research/checkout/executions/rk-1/continuation",
      "POST /api/research/checkout/executions/rk-1/continue",
      "POST /api/research/checkout/executions/rk-1/cancel",
    ]);
  });

  it("reports that an authentication secret exists WITHOUT carrying it", async () => {
    const h = harness();
    const result = await h.binding.surface.status(h.config.members[0]!, "rk-1");
    expect(result.hasAuthenticationSecret).toBe(true);
    expect(JSON.stringify(result)).not.toContain("THISMUSTNOTLEAK");
    expect(JSON.stringify(result)).not.toContain("clientSecret");
  });

  it("signs the webhook body the provider's way, and the application's own verifier accepts it", async () => {
    const h = harness();
    await h.binding.surface.deliverWebhook({
      eventId: "evt_1",
      eventType: "payment_intent.succeeded",
      providerReference: "pi_1",
      orderId: "order-1",
      memberId: h.config.members[0]!,
      amountCents: 21_000,
    });
    const call = h.calls.find((c) => c.url.endsWith("/api/research/webhooks/payment"))!;
    expect(call).toBeDefined();
    expect(typeof call.raw).toBe("string");
    // The application's own verification function, against the harness's body.
    const failure = verifyStripeSignature(call.raw!, call.headers["stripe-signature"]!, WEBHOOK_SECRET, Date.now());
    expect(failure).toBeNull();
    // And it is rejected under a different secret, so the signature is real.
    expect(verifyStripeSignature(call.raw!, call.headers["stripe-signature"]!, "whsec_someoneelse", Date.now())).not.toBeNull();
  });

  it("states how the webhook envelope was produced rather than implying delivery", () => {
    const h = harness();
    expect(h.binding.webhookEvidence).toBe("harness_signed_through_mounted_route");
    expect(h.binding.describe().webhookEvidence).toBe("harness_signed_through_mounted_route");
  });
});

describe("it counts only what this run caused", () => {
  const other = { id: "pi_other", metadata: { memberId: "99999999-9999-4999-8999-999999999999" }, amount_received: 21_000 };

  it("ignores payments belonging to anyone but this run's synthetic members", async () => {
    const config = readManagedJourneyConfig(env());
    const mine = { id: "pi_mine", metadata: { memberId: config.members[0]! }, amount_received: 0 };
    const h = harness({ intents: [other, mine] });
    expect(await h.binding.surface.providerPaymentCount()).toBe(1);
  });

  it("counts a capture as money received, not merely a succeeded object", async () => {
    const config = readManagedJourneyConfig(env());
    const authorized = { id: "pi_a", metadata: { memberId: config.members[0]! }, amount_received: 0 };
    const captured = { id: "pi_b", metadata: { memberId: config.members[1]! }, amount_received: 21_000 };
    const h = harness({ intents: [authorized, captured, other] });
    expect(await h.binding.surface.providerPaymentCount()).toBe(2);
    expect(await h.binding.surface.providerCaptureCount()).toBe(1);
  });

  it("ignores a payment with no member metadata at all", async () => {
    const h = harness({ intents: [{ id: "pi_x", amount_received: 21_000 }] });
    expect(await h.binding.surface.providerPaymentCount()).toBe(0);
    expect(await h.binding.surface.providerCaptureCount()).toBe(0);
  });
});

describe("it reports what it cannot do", () => {
  it("declares no challenge, no restart and no fault seam when none are configured", () => {
    const h = harness();
    expect(h.binding.surface.capabilities).toEqual({
      browserDrivenChallenge: false,
      nonChallengeAuthentication: true,
      transportFaultInjection: false,
      processRestart: false,
      localCommitFault: false,
    });
    // The runner skips on the ABSENCE of the function, so it must be absent.
    expect(h.binding.surface.completeCustomerChallenge).toBeUndefined();
    expect(h.binding.surface.restart).toBeUndefined();
    expect(h.binding.surface.injectFault).toBeUndefined();
    expect(h.binding.surface.failNextLocalCommit).toBeUndefined();
  });

  it("refuses to claim a capability whose port was not supplied", () => {
    const config = readManagedJourneyConfig(env({ [MANAGED_JOURNEY_ENV.chromePath]: "C:/chrome.exe" }));
    expect(config.capabilities.browserDrivenChallenge).toBe(true);
    expect(() =>
      createManagedJourneySurface(config, {
        http: { async request() { return { status: 200, headers: {}, body: {} }; } },
        database: { origin: () => config.databaseUrl, overHttp: () => true, async selectOne() { return null; } },
        provider: { mode: () => "test", accountId: () => null, async retrieveIntent() { return null; }, async listIntentsSince() { return []; } },
      }),
    ).toThrow(ManagedJourneyNotRun);
  });

  it("will not complete a real challenge through the easier non-challenge path", async () => {
    const config = readManagedJourneyConfig(env());
    const binding = createManagedJourneySurface(config, {
      http: { async request() { return { status: 200, headers: {}, body: { ok: true } }; } },
      database: { origin: () => config.databaseUrl, overHttp: () => true, async selectOne() { return null; } },
      provider: {
        mode: () => "test",
        accountId: () => null,
        // A payment that is genuinely waiting on a customer challenge.
        async retrieveIntent() { return { id: "pi_1", status: "requires_action" }; },
        async listIntentsSince() { return []; },
      },
    });
    await expect(binding.surface.completeCustomerAction!("pi_1")).rejects.toThrow(/challenge/);
  });

  it("reports the live clients honestly, so the binding gate can check them", () => {
    const h = harness();
    expect(h.binding.surface.transports).toEqual({
      databaseUrl: `https://${PROJECT}.supabase.co`,
      providerMode: "test",
      providerAccountId: null,
      signedWebhookRoute: true,
      databaseOverHttp: true,
    });
  });
});

describe("it refuses a record it cannot understand", () => {
  it("will not map an order state this build does not know", async () => {
    const h = harness({ row: { id: "order-1", member_id: "m", state: "teleported", total_cents: 1 } });
    await expect(h.binding.surface.readOrder("order-1")).rejects.toThrow(/state this build does not know/);
  });

  it("returns null for an order that is not there, rather than inventing one", async () => {
    const h = harness({ row: null });
    expect(await h.binding.surface.readOrder("order-1")).toBeNull();
  });
});

describe("the harness's own signature helper", () => {
  it("matches the scheme the application verifies", () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, WEBHOOK_SECRET, Date.now())).toBeNull();
    // A body that changed by one character is rejected.
    expect(verifyStripeSignature(`${payload} `, `t=${timestamp},v1=${signature}`, WEBHOOK_SECRET, Date.now())).not.toBeNull();
  });
});
