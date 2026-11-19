import { describe, expect, it } from "vitest";
import { AE_PORTAL_PATH, AE_APPLICATION_CONTEXT_PATH, aeContextEnvelopeSchema } from "./context";
import { aeFailureSchema } from "./workspace";

const scopeId = "A0000000-0000-4000-8000-000000000001";
describe("AE application context wire contract", () => {
  it("pins the portal/API destinations and accepts only normalized configured scope metadata", () => {
    expect(AE_PORTAL_PATH).toBe("/research/account-executive");
    expect(AE_APPLICATION_CONTEXT_PATH).toBe("/api/research/account-executive/context");
    expect(aeContextEnvelopeSchema.parse({ ok: true, value: { scopeId } }))
      .toEqual({ ok: true, value: { scopeId: scopeId.toLowerCase() } });
  });
  it.each([
    { ok: true, value: { scopeId: "00000000-0000-0000-0000-000000000000" } },
    { ok: true, value: { scopeId: "profile-or-url-scope" } },
    { ok: true, value: {} },
    { ok: true, value: { scopeId, permitted: true } },
    { ok: true, value: { scopeId, customers: [] } },
    { ok: true, value: { scopeId }, role: "account_executive" },
    { ok: false, code: "access_denied", message: "private diagnostic" },
    { ok: false, code: "unknown_failure" },
  ])("rejects malformed metadata and extra authority/customer/error assertions: %j", value => {
    expect(aeContextEnvelopeSchema.safeParse(value).success).toBe(false);
  });
  it.each(aeFailureSchema.shape.code.options)("uses the canonical strict %s failure", code => {
    expect(aeContextEnvelopeSchema.parse({ ok: false, code })).toEqual({ ok: false, code });
  });
});
