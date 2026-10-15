import { describe, expect, it, vi } from "vitest";
import { createRequestIntentApi, RequestIntentHttpError, isKnownIntentPrewriteRefusal } from "./request-intent-api";
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
