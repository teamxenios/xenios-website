// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAuthenticatedLanding,
  setAuthenticatedExperience,
} from "./adminAuthority";

describe("admin authority client adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends only the verified bearer credential to the server landing resolver", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        authUserId: "00000000-0000-4000-8000-000000000001",
        destination: "/admin",
        preferredExperience: "admin",
        preferenceVersion: 0,
        adminAuthorized: true,
        memberAuthorized: false,
        authoritySource: "persisted_super_admin",
      }),
    } as Response);

    const result = await getAuthenticatedLanding("verified-token");

    expect(result?.destination).toBe("/admin");
    expect(fetch).toHaveBeenCalledWith(
      "/api/research/auth/landing",
      expect.objectContaining({
        headers: { Authorization: "Bearer verified-token" },
      }),
    );
    expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toContain("email");
  });

  it("sends optimistic version and idempotency through the reviewed switch endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        authUserId: "00000000-0000-4000-8000-000000000001",
        destination: "/research/member",
        preferredExperience: "member",
        preferenceVersion: 8,
        adminAuthorized: true,
        memberAuthorized: true,
        authoritySource: "persisted_super_admin",
      }),
    } as Response);

    await setAuthenticatedExperience(
      "verified-token",
      "member",
      7,
      "switch-command-0001",
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/research/auth/experience",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          experience: "member",
          expectedVersion: 7,
          idempotencyKey: "switch-command-0001",
        }),
      }),
    );
  });

  it("fails closed on a non-success response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, code: "super_admin_required" }),
    } as Response);

    await expect(getAuthenticatedLanding("unprivileged-token")).resolves.toBeNull();
  });
});

