// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_API } from "@shared/research/referral-v1";
import { captureRecommendation, recommendationMemberToken } from "./api";

const auth = vi.hoisted(() => ({ getClient: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabaseBrowser")>(),
  getSupabaseBrowser: auth.getClient,
}));
const token = (method: string) => `synthetic.${btoa(JSON.stringify({ amr: [{ method }] }))}.synthetic`;
beforeEach(() => {
  auth.getClient.mockReset().mockResolvedValue({ auth: { getSession: auth.getSession } });
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: token("password") } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, destinationPath: "/care", attribution: "recognized", accountBinding: "bound" }) }));
  window.history.replaceState(null, "", "/");
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("recommendation canonical account continuity", () => {
  it("uses the existing normal session for a public recipient's explicit capture", async () => {
    await captureRecommendation(`r1_${"A".repeat(43)}`, "synthetic-csrf");
    expect(auth.getClient).toHaveBeenCalledTimes(1);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(REFERRAL_API.capture, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${token("password")}`, "X-Xenios-Referral-CSRF": "synthetic-csrf" }) }));
  });
  it.each(["otp", "magiclink", "recovery", "unknown-purpose"])("omits the existing %s session without replacing identity", async method => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: token(method) } } });
    await captureRecommendation(`r1_${"A".repeat(43)}`, "synthetic-csrf");
    expect((vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it("never initializes auth from a recovery-marked URL", async () => {
    window.history.replaceState(null, "", "/#type=recovery&access_token=synthetic-recovery");
    expect(await recommendationMemberToken()).toBeNull();
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("does not replace an explicitly supplied principal with a different persisted account", async () => {
    expect(await recommendationMemberToken("synthetic-explicit-member")).toBe("synthetic-explicit-member");
    expect(auth.getClient).not.toHaveBeenCalled();
    expect(await recommendationMemberToken(token("recovery"))).toBeNull();
    expect(await recommendationMemberToken(null)).toBeNull();
    expect(auth.getClient).not.toHaveBeenCalled();
  });
  it("treats unconfigured, signed-out, and failed canonical session reads as anonymous", async () => {
    auth.getClient.mockResolvedValueOnce(null);
    expect(await recommendationMemberToken()).toBeNull();
    auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await recommendationMemberToken()).toBeNull();
    auth.getSession.mockRejectedValueOnce(new Error("unavailable"));
    expect(await recommendationMemberToken()).toBeNull();
  });
});
