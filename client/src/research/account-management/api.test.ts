// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_MANAGEMENT_PATHS, ACCOUNT_REGISTRATION_NOTICE } from "@shared/research/account-management";
import { createAccountManagementApi } from "./api";
const actor = "10000000-0000-4000-8000-000000000001";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("strict captured-token client transport", () => {
  it("keeps signup and own mutation headers/body isolated without credentials in URLs or storage", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_path, init) => init?.method === "PATCH"
      ? json({ ok: true, state: "accepted", operation: "profile" }) : json({ ok: true, state: "check_email", message: ACCOUNT_REGISTRATION_NOTICE }));
    const api = createAccountManagementApi(fetcher);
    await api.register({ email: "a@example.invalid", password: "synthetic-password", captchaToken: "synthetic" });
    await api.mutate("captured-A", { operation: "profile", displayName: "New" });
    expect(fetcher.mock.calls[0]).toEqual([ACCOUNT_MANAGEMENT_PATHS.register, expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" } })]);
    expect(fetcher.mock.calls[1]).toEqual([ACCOUNT_MANAGEMENT_PATHS.identity, expect.objectContaining({ method: "PATCH", headers: { Authorization: "Bearer captured-A", "Content-Type": "application/json" }, body: JSON.stringify({ operation: "profile", displayName: "New" }) })]);
    expect(fetcher.mock.calls.map(([path]) => String(path)).join()).not.toMatch(/captured-A|password|example.invalid/);
  });
  it("keeps pending email separate and sends the captured challenge token only in authorization", async () => {
    const identity = { userId: actor, email: "old@example.invalid", emailVerified: true, displayName: "Person", pendingEmail: "new@example.invalid" };
    const fetcher = vi.fn<typeof fetch>(async path => String(path).endsWith("/reauthenticate") ? json({ ok: true, state: "check_email" }) : json({ ok: true, identity }));
    const api = createAccountManagementApi(fetcher);
    expect(await api.identity("A")).toEqual(identity); await api.reauthenticate("A");
    expect(fetcher.mock.calls[1]).toEqual([ACCOUNT_MANAGEMENT_PATHS.reauthenticate, expect.objectContaining({ method: "POST", body: "{}", headers: { Authorization: "Bearer A", "Content-Type": "application/json" } })]);
  });
  it.each(["extra", "wrong-operation", "malformed", "oversized", "uncertain", "network"])("refuses %s output once, never falling through another mutation", async mode => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (mode === "network") throw Error("private network diagnostic");
      if (mode === "malformed") return new Response("not-json");
      if (mode === "oversized") return new Response("x".repeat(16385));
      if (mode === "uncertain") return json({ ok: false, code: "account_outcome_unconfirmed" }, 503);
      return json({ ok: true, state: "accepted", operation: mode === "wrong-operation" ? "password" : "profile", ...(mode === "extra" ? { token: "private" } : {}) });
    });
    await expect(createAccountManagementApi(fetcher).mutate("A", { operation: "profile", displayName: "New" })).rejects.toBeInstanceOf(Error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses header injection/unknown fields before network and untrusted confirmation origins", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ registrationEnabled: true, selfEditsEnabled: true, captchaRequired: true, deletion: "unavailable", confirmationRedirect: "https://outside.invalid/research/sign-in?returnTo=%2Fresearch%2Faccount%2Fsettings" }));
    const api = createAccountManagementApi(fetcher);
    await expect(api.identity("A\r\nInjected: secret")).rejects.toBeInstanceOf(Error);
    await expect(api.mutate("A", { operation: "profile", displayName: "New", userId: "other" } as never)).rejects.toBeInstanceOf(Error);
    expect(fetcher).not.toHaveBeenCalled(); await expect(api.config()).rejects.toBeInstanceOf(Error);
  });
});
