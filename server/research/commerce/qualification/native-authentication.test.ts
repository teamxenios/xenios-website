import { describe, expect, it, vi } from "vitest";
import { assertAuthenticationOutcome } from "./qualification-browser";
import { createManagedJourneySurface, type ManagedJourneyPorts } from "./managed-journey-binding";
import { MANAGED_JOURNEY_ENV as E, readManagedJourneyConfig } from "./managed-journey-config";
import { REQUIRED_SCENARIOS } from "./connected-checkout-journey";

// Local recording ports only: these assertions qualify the binding, not Stripe.
function setup(intent: Record<string, unknown> | null, browserEnabled = true) {
  const config = readManagedJourneyConfig({
    [E.baseUrl]: "http://127.0.0.1:5100", [E.projectRef]: "abcdefghijklmnopqrst",
    [E.serviceRoleKey]: "eyJhbGciOiJIUzI1NiJ9.fixture.signature",
    [E.secretKey]: "sk_test_fakequalificationonly", [E.webhookSecret]: "whsec_fakequalificationonly",
    [E.publishableKey]: "pk_test_fakequalificationonly", [E.ownerApproval]: "a".repeat(64),
    [E.chromePath]: browserEnabled ? "C:/test/chrome.exe" : undefined,
    [E.members]: JSON.stringify(REQUIRED_SCENARIOS.map((_, index) => ({
      memberId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      accessToken: `eyJhbGciOiJIUzI1NiJ9.fixture${index}.signature`,
    }))),
  });
  const authenticate = vi.fn<NonNullable<NonNullable<ManagedJourneyPorts["browser"]>["completePaymentAuthentication"]>>().mockResolvedValue();
  const binding = createManagedJourneySurface(config, {
    http: { request: vi.fn() },
    database: { origin: () => config.databaseUrl, overHttp: () => true, selectOne: vi.fn() },
    provider: { mode: () => "test", accountId: () => null, retrieveIntent: async () => intent, listIntentsSince: async () => [] },
    ...(browserEnabled ? { browser: { completeHostedChallenge: vi.fn(), completePaymentAuthentication: authenticate } } : {}),
  });
  return { binding, authenticate };
}

const pending = { id: "pi_Fixture", livemode: false, status: "requires_action", client_secret: "pi_Fixture_secret_Fixture" };
describe("native managed authentication binding", () => {
  it("actually runs frictionless authentication and identifies it separately", async () => {
    const { binding, authenticate } = setup(pending);
    await binding.surface.completeCustomerAction!(pending.id);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith({ reference: pending.id, clientSecret: pending.client_secret, expectation: "no_challenge" });
    expect(binding.surface.capabilities?.nonChallengeAuthentication).toBe(true);
  });
  it("retains the challenge-only requirement for the challenge scenario", async () => {
    const { binding, authenticate } = setup(pending);
    await binding.surface.completeCustomerChallenge!(pending.id);
    expect(authenticate).toHaveBeenCalledExactlyOnceWith({ reference: pending.id, clientSecret: pending.client_secret, expectation: "challenge" });
  });
  it.each([null, { ...pending, id: "pi_Other" }, { ...pending, livemode: true }, { ...pending, status: "succeeded" }])("refuses a missing or mismatched authentication intent", async intent => {
    const { binding, authenticate } = setup(intent);
    await expect(binding.surface.completeCustomerAction!(pending.id)).rejects.toThrow("non_challenge_identity_mode_or_state_mismatch");
    expect(authenticate).not.toHaveBeenCalled();
  });
  it("propagates provider/browser failure without reporting success", async () => {
    const { binding, authenticate } = setup(pending);
    authenticate.mockRejectedValueOnce(new Error("provider_browser_authentication_failed"));
    await expect(binding.surface.completeCustomerAction!(pending.id)).rejects.toThrow("provider_browser_authentication_failed");
  });
  it("does not claim frictionless authentication without the browser capability", async () => {
    const { binding, authenticate } = setup(pending, false);
    expect(binding.surface.capabilities?.nonChallengeAuthentication).toBe(false);
    await expect(binding.surface.completeCustomerAction!(pending.id)).rejects.toThrow("non_challenge_browser_unavailable");
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe("authentication evidence cannot swap scenarios", () => {
  it("accepts the observed challenge and trusted input only as challenge evidence", () => {
    expect(() => assertAuthenticationOutcome("challenge", true, 3, "requires_capture")).not.toThrow();
    expect(() => assertAuthenticationOutcome("no_challenge", true, 3, "requires_capture")).toThrow("unexpected_authentication_challenge");
  });
  it("accepts frictionless completion only as no-challenge evidence", () => {
    expect(() => assertAuthenticationOutcome("no_challenge", false, 0, "requires_capture")).not.toThrow();
    expect(() => assertAuthenticationOutcome("challenge", false, 0, "requires_capture")).toThrow("authentication_completed_without_observed_challenge");
    expect(() => assertAuthenticationOutcome("challenge", true, 0, "requires_capture")).toThrow("authentication_completed_without_observed_challenge");
  });
  it.each([undefined, "processing", "requires_action", "canceled"])("rejects an incomplete outcome: %s", status => {
    expect(() => assertAuthenticationOutcome("no_challenge", false, 0, status)).toThrow("browser_auth_outcome_not_authorized");
  });
});
