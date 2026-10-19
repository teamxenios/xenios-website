import { describe, expect, it, vi } from "vitest";
import { createRequestIntentApi, RequestIntentHttpError, isKnownIntentPrewriteRefusal, intentRefusalGuidance } from "./request-intent-api";
describe("mixed-request canonical transport", () => {
  it("uses the current member token for each call and the exact method-admitted submit path", async () => {
    let token: string | null = "synthetic-first";
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify({ receipt: null }), { status: 200 }));
    const api = createRequestIntentApi(() => token, transport);
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = "synthetic-second";
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = null;
    // Deliberately invalid body: this test asserts transport only, not server acceptance.
    await api.submit({} as Parameters<typeof api.submit>[0]);
    expect(transport.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer synthetic-first" });
    expect(transport.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer synthetic-second" });
    expect(transport.mock.calls[2][0]).toBe("/api/research/early-access/request-intents");
    expect(transport.mock.calls[2][1].headers).not.toHaveProperty("Authorization");
    expect(transport.mock.calls[2][1]).toMatchObject({ credentials: "include", cache: "no-store", method: "POST" });
  });
  it("fails closed on a disabled or noncanonical requirement response", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ enabled: true, requiredAgreements: [], formAcknowledgments: [] })));
    await expect(createRequestIntentApi(() => null, transport).config()).rejects.toThrow("Request requirements unavailable.");
  });
});

describe("Doc163 structured refusal classification", () => {
  it.each(["unauthorized", "session_expired", "synthetic_refusal"])("keeps verified 401 guidance neutral for guest and member access (%s)", (code) => {
    const error = new RequestIntentHttpError(401, code);
    expect(isKnownIntentPrewriteRefusal(error)).toBe(true);
    const guidance = intentRefusalGuidance(error);
    expect(guidance).toBe("This request was not saved. Access is no longer available. Return to the request page to check access, or contact support.");
    expect(guidance).not.toMatch(/sign in|log in|account|new attempt/i);
  });
  it.each([
    [429, "synthetic_refusal", "This request was not saved. Wait before submitting a new attempt; you can edit the details meanwhile."],
    [403, "agreement_standing_required", "This request was not saved. Complete the existing access and agreement requirements before starting a new attempt."],
    [403, "synthetic_refusal", "This request was not saved. Access was refused. Review your access or contact support before starting a new attempt."],
    [400, "selection_requires_refresh", "This request was not saved. Reload the current catalog, review the exact products and quantities, and submit a new attempt."],
    [400, "current_acknowledgments_required", "This request was not saved. Reload the current requirements, review and confirm them, and submit a new attempt."],
    [400, "synthetic_refusal", "This request was not saved. Check the required details, products, quantities and acknowledgments before submitting a new attempt."],
  ] as const)("preserves existing non-401 refusal guidance (%i, %s)", (status, code, expected) => {
    expect(intentRefusalGuidance(new RequestIntentHttpError(status, code))).toBe(expected);
  });
  it("exposes well-formed HTTP status and code without copying server message text", async () => {
    for (const status of [400, 401, 403, 429, 409, 500, 503]) {
      const transport = async () => new Response(JSON.stringify({ error: "synthetic_refusal", message: "private diagnostic" }), { status });
      const api = createRequestIntentApi(() => null, transport);
      const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(RequestIntentHttpError);
      expect(error).toMatchObject({ status, code: "synthetic_refusal" });
      expect(String(error)).not.toContain("private diagnostic");
      expect(isKnownIntentPrewriteRefusal(error)).toBe([400, 401, 403, 429].includes(status));
    }
  });
  it("keeps a known HTTP status UNKNOWN when its body is absent or malformed", async () => {
    for (const status of [400, 401, 403, 429]) {
      for (const body of ["<html>", "null", "{}", "[]", '{"error":7}', '{"message":"refused"}']) {
        const api = createRequestIntentApi(() => null, async () => new Response(body, { status }));
        const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
        expect(isKnownIntentPrewriteRefusal(error)).toBe(false);
        expect(error).not.toBeInstanceOf(RequestIntentHttpError);
      }
    }
  });
});
